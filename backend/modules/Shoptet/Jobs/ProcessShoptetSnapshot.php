<?php

namespace Modules\Shoptet\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Modules\Customers\Services\CustomerSnapshotImporter;
use Modules\Inventory\Jobs\RecalculateInventoryVariantMetricsJob;
use Modules\Orders\Services\OrderSnapshotImporter;
use Modules\Pim\Services\ProductSnapshotImporter;
use Modules\Shoptet\Models\ShoptetWebhookJob;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Models\FailedSnapshot;
use Modules\Shoptet\Services\SnapshotPipelineService;

class ProcessShoptetSnapshot implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Allow up to 2 hours for large snapshots to finish.
     */
    public int $timeout = 7200;

    /**
     * Allow 3 retry attempts with exponential backoff before permanent failure.
     */
    public int $tries = 3;

    /**
     * Exponential backoff: 1 min, 5 mins, 30 mins
     */
    public array $backoff = [60, 300, 1800];

    public function __construct(private readonly ShoptetWebhookJob $webhookJob)
    {
        $this->queue = 'snapshots';
    }

    public function handle(
        ProductSnapshotImporter $productImporter,
        OrderSnapshotImporter $orderImporter,
        CustomerSnapshotImporter $customerImporter,
        SnapshotPipelineService $pipelines
    ): void {
        if (function_exists('set_time_limit')) {
            @set_time_limit(0);
        }
        if (function_exists('ini_set')) {
            @ini_set('max_execution_time', '0');
        }

        $job = $this->webhookJob->fresh(['shop']);
        $pipeline = $pipelines->find($job?->meta['pipeline_id'] ?? null);

        if (! $job || ! $job->shop || ! $job->snapshot_path) {
            Log::warning('Snapshot processing skipped - missing context', [
                'webhook_job_id' => $this->webhookJob->getKey(),
            ]);

            $pipelines->finish($pipeline, 'error', [
                'error' => 'missing_context',
            ]);

            return;
        }

        $pipelines->update($pipeline, [
            'status' => 'processing',
            'started_at' => $pipeline?->started_at ?? now(),
            'meta' => [
                'job_status' => 'processing',
            ],
        ]);

        $diskName = config('filesystems.default');
        $disk = Storage::disk($diskName);
        $path = method_exists($disk, 'path')
            ? $disk->path($job->snapshot_path)
            : storage_path('app/'.$job->snapshot_path);
        if (! is_file($path)) {
            $job->update([
                'status' => 'missing_snapshot',
            ]);

            Log::warning('Snapshot file missing', [
                'webhook_job_id' => $job->id,
                'path' => $path,
            ]);

            $pipelines->finish($pipeline, 'missing_snapshot', [
                'path' => $path,
            ]);

            return;
        }

        try {
            $processed = 0;
            $variantMap = [];

            $handle = @gzopen($path, 'rb');
            if (! $handle) {
                $job->update(['status' => 'invalid_snapshot']);

                Log::error('Unable to open snapshot gzip file', [
                    'webhook_job_id' => $job->id,
                    'path' => $path,
                ]);

                $pipelines->finish($pipeline, 'invalid_snapshot', [
                    'path' => $path,
                ]);

                return;
            }

            try {
                while (! gzeof($handle)) {
                    $line = trim((string) gzgets($handle));
                    if ($line === '') {
                        continue;
                    }

                    $payload = json_decode($line, true);
                    if (! is_array($payload)) {
                        continue;
                    }

                    $variantIds = $this->dispatchImporter($job->endpoint, $payload, $job->shop, $productImporter, $orderImporter, $customerImporter);

                    foreach ($variantIds as $variantId) {
                        if (is_string($variantId) && $variantId !== '') {
                            $variantMap[$variantId] = true;
                        }
                    }
                    $processed++;
                }
            } finally {
                gzclose($handle);
            }

            if ($variantMap !== []) {
                $variantIds = array_keys($variantMap);

                foreach (array_chunk($variantIds, 50) as $chunk) {
                    if ($chunk === []) {
                        continue;
                    }

                    RecalculateInventoryVariantMetricsJob::dispatch($chunk);
                }
            }

            $job->update([
                'status' => 'processed',
                'processed_at' => now(),
                'meta' => array_merge($job->meta ?? [], [
                    'processed_count' => $processed,
                ]),
            ]);

            $pipelines->finish($pipeline, 'completed', [
                'processed_count' => $processed,
                'variant_count' => $variantMap !== [] ? count($variantMap) : 0,
                'job_status' => 'processed',
            ]);
        } catch (\Throwable $throwable) {
            $pipelines->finish($pipeline, 'error', [
                'error' => $throwable->getMessage(),
            ]);

            throw $throwable;
        }
    }

    private function dispatchImporter(
        ?string $endpoint,
        array $payload,
        Shop $shop,
        ProductSnapshotImporter $productImporter,
        OrderSnapshotImporter $orderImporter,
        CustomerSnapshotImporter $customerImporter
    ): array {
        $normalizedEndpoint = $endpoint ? parse_url($endpoint, PHP_URL_PATH) ?: $endpoint : $endpoint;

        switch ($normalizedEndpoint) {
            case '/api/products/snapshot':
                $productImporter->import($payload, $shop);
                return [];
            case '/api/orders/snapshot':
                return $orderImporter->import($payload, $shop);
            case '/api/customers/snapshot':
                $customerImporter->import($payload, $shop);
                return [];
            default:
                Log::notice('No importer registered for endpoint', [
                    'endpoint' => $endpoint,
                ]);
                return [];
        }
    }

    public function failed(\Throwable $exception): void
    {
        Log::error('ProcessShoptetSnapshot failed, tracking for retry', [
            'webhook_job_id' => $this->webhookJob->id,
            'attempt' => $this->attempts(),
            'exception' => $exception->getMessage(),
        ]);

        // Only create failed snapshot record on final failure (after all retries)
        if ($this->attempts() >= $this->tries) {
            FailedSnapshot::updateOrCreate(
                ['webhook_job_id' => $this->webhookJob->id],
                [
                    'shop_id' => $this->webhookJob->shop_id,
                    'endpoint' => $this->webhookJob->endpoint,
                    'status' => 'pending',
                    'retry_count' => 0,
                    'max_retries' => 3,
                    'error_message' => $exception->getMessage(),
                    'context' => [
                        'snapshot_path' => $this->webhookJob->snapshot_path,
                        'pipeline_id' => $this->webhookJob->meta['pipeline_id'] ?? null,
                    ],
                ]
            );

            $this->webhookJob->update([
                'status' => 'failed',
                'meta' => array_merge($this->webhookJob->meta ?? [], [
                    'failed_at' => now()->toIso8601String(),
                    'error' => $exception->getMessage(),
                ]),
            ]);
        }
    }
}
