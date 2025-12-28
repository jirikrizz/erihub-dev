<?php

namespace Modules\Shoptet\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Arr;
use Carbon\Carbon;
use Modules\Shoptet\Contracts\ShoptetClient;
use Modules\Shoptet\Models\ShoptetWebhookJob;
use Modules\Shoptet\Services\SnapshotPipelineService;

class DownloadShoptetSnapshot implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    private const PROGRESSIVE_WAIT_SEQUENCE = [8, 10, 300];
    private const RESCHEDULE_DELAYS = [30, 60, 120, 240, 600];
    private const MAX_RESCHEDULE_ATTEMPTS = 10;

    public function __construct(
        private readonly ShoptetWebhookJob $webhookJob,
        private readonly bool $autoProcess = true,
        private readonly bool $progressiveWait = false
    )
    {
        $this->queue = 'snapshots';
    }

    public function handle(ShoptetClient $client, SnapshotPipelineService $pipelines): void
    {
        if (function_exists('set_time_limit')) {
            @set_time_limit(0);
        }
        if (function_exists('ini_set')) {
            @ini_set('max_execution_time', '0');
        }

        $job = $this->webhookJob->fresh(['shop']);

        if (! $job || ! $job->shop) {
            Log::warning('Snapshot download skipped - missing shop context', [
                'webhook_job_id' => $this->webhookJob->getKey(),
            ]);

            return;
        }

        $job = $this->prepareJobForDownload($job, $client);

        $pipeline = $pipelines->find($job->meta['pipeline_id'] ?? null);

        if (! $job->result_url) {
            $attempt = (int) Arr::get($job->meta, 'retry_attempts', 0) + 1;

            $job->update([
                'status' => 'waiting_result',
                'meta' => array_merge($job->meta ?? [], [
                    'job_status' => $job->status,
                    'last_poll_attempt_at' => now()->toIso8601String(),
                    'retry_attempts' => $attempt,
                ]),
            ]);

            $pipelines->update($pipeline, [
                'status' => 'waiting_result',
                'meta' => [
                    'job_status' => $job->status,
                    'retry_attempts' => $attempt,
                ],
            ]);

            if ($attempt <= self::MAX_RESCHEDULE_ATTEMPTS) {
                $delay = self::RESCHEDULE_DELAYS[min($attempt - 1, count(self::RESCHEDULE_DELAYS) - 1)];
                self::dispatch($job->fresh(), $this->autoProcess, true)->delay(now()->addSeconds($delay));
            } else {
                Log::warning('Snapshot download giving up after max attempts', [
                    'job_id' => $job->job_id,
                    'shop_id' => $job->shop_id,
                ]);
            }

            return;
        }

        $pipelines->update($pipeline, [
            'status' => 'downloading',
            'started_at' => $pipeline?->started_at ?? now(),
            'meta' => [
                'job_status' => $job->status,
            ],
        ]);

        $disk = Storage::disk(config('filesystems.default'));
        $fileName = $this->buildSnapshotFileName($job->result_url, $job->job_id);
        $path = sprintf('shoptet/%d/snapshots/%s', $job->shop_id, $fileName);

        $tempFile = null;

        try {
            $tempFile = $client->downloadJobResult($job->shop, $job->result_url);

            $stream = fopen($tempFile, 'r');
            if (! $stream) {
                throw new \RuntimeException('Unable to open downloaded snapshot stream.');
            }

            $disk->put($path, $stream);
            fclose($stream);

            $job->update([
                'status' => 'downloaded',
                'snapshot_path' => $path,
                'meta' => array_merge($job->meta ?? [], [
                    'url' => $job->result_url,
                    'downloaded_at' => now()->toIso8601String(),
                ]),
            ]);

            $pipelines->update($pipeline, [
                'status' => 'downloaded',
                'downloaded_at' => now(),
                'meta' => [
                    'snapshot_path' => $path,
                    'job_status' => 'downloaded',
                ],
            ]);

            if ($this->autoProcess) {
                ProcessShoptetSnapshot::dispatch($job);
            } else {
                ProcessShoptetSnapshot::dispatchSync($job);
            }
        } catch (\Throwable $throwable) {
            Log::error('Snapshot download failed', [
                'job_id' => $job->job_id,
                'exception' => $throwable->getMessage(),
            ]);

            $job->update([
                'status' => 'download_failed',
                'meta' => array_merge($job->meta ?? [], [
                    'url' => $job->result_url,
                    'error' => $throwable->getMessage(),
                ]),
            ]);

            $pipelines->finish($pipeline, 'download_failed', [
                'error' => $throwable->getMessage(),
            ]);
        } finally {
            if ($tempFile && file_exists($tempFile)) {
                @unlink($tempFile);
            }
        }
    }

    private function hydrateJobDetails(ShoptetWebhookJob $job, ShoptetClient $client): void
    {
        try {
            $details = $client->getJob($job->shop, $job->job_id);
        } catch (\Throwable $throwable) {
            Log::warning('Unable to fetch Shoptet job details', [
                'job_id' => $job->job_id,
                'exception' => $throwable->getMessage(),
            ]);

            return;
        }

        $endpoint = $details['endpoint'] ?? $job->endpoint;
        if (is_string($endpoint)) {
            $job->endpoint = $endpoint;
        }
        $job->result_url = $details['resultUrl'] ?? $job->result_url;
        $job->valid_until = isset($details['validUntil']) ? Carbon::parse($details['validUntil']) : $job->valid_until;
        $job->status = $details['status'] ?? $job->status;
        $job->meta = array_merge($job->meta ?? [], ['job_details' => $details]);
        $job->save();
    }

    private function buildSnapshotFileName(string $url, string $jobId): string
    {
        $nameFromUrl = basename(parse_url($url, PHP_URL_PATH) ?: '');
        $name = $nameFromUrl ?: sprintf('job-%s.gz', $jobId);

        return trim(preg_replace('/[^A-Za-z0-9_\\.\-]/', '_', $name), '._');
    }

    private function prepareJobForDownload(ShoptetWebhookJob $job, ShoptetClient $client): ShoptetWebhookJob
    {
        if ($job->result_url && $job->endpoint) {
            return $job;
        }

        if ($this->progressiveWait) {
            $job = $this->hydrateWithProgressiveWait($job, $client);
        } else {
            $this->hydrateJobDetails($job, $client);
            $job = $job->refresh();
        }

        if (! $job || ! $job->result_url) {
            if ($job) {
                $job->update([
                    'status' => 'waiting_result',
                    'meta' => array_merge($job->meta ?? [], [
                        'last_poll_attempt_at' => now()->toIso8601String(),
                        'progressive_wait' => $this->progressiveWait,
                    ]),
                ]);

                return $job->refresh();
            }

            return $job;
        }

        return $job;
    }

    private function hydrateWithProgressiveWait(ShoptetWebhookJob $job, ShoptetClient $client): ?ShoptetWebhookJob
    {
        foreach (self::PROGRESSIVE_WAIT_SEQUENCE as $seconds) {
            if ($seconds > 0) {
                sleep($seconds);
            }

            $this->hydrateJobDetails($job, $client);
            $job = $job->refresh();

            if (! $job) {
                return null;
            }

            if ($job->result_url) {
                return $job;
            }
        }

        return $job;
    }
}
