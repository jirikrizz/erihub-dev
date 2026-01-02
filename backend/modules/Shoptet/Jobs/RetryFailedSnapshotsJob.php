<?php

namespace Modules\Shoptet\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Modules\Core\Traits\WithJobLocking;
use Modules\Shoptet\Models\FailedSnapshot;

class RetryFailedSnapshotsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels, WithJobLocking;

    public int $timeout = 300;
    public int $tries = 2;
    protected int $jobLockTimeout = 600; // 10 minutes

    public function __construct()
    {
        $this->queue = 'snapshots';
    }

    public function handle(): void
    {
        // Acquire job lock to prevent concurrent execution
        if (!$this->acquireLock()) {
            Log::info('RetryFailedSnapshotsJob is already running, skipping');
            return;
        }

        try {
            // Use whereRaw for proper SQL comparison between columns
            $failedSnapshots = FailedSnapshot::query()
                ->where('status', 'pending')
                ->whereRaw('retry_count < max_retries')
                ->with('webhookJob')
                ->get();

            $retried = 0;
            $failed = 0;

            foreach ($failedSnapshots as $failedSnapshot) {
                if (!$failedSnapshot->webhookJob) {
                    Log::warning('Failed snapshot webhook job not found', [
                        'failed_snapshot_id' => $failedSnapshot->id,
                        'endpoint' => $failedSnapshot->endpoint,
                    ]);
                    $failed++;
                    continue;
                }

                // Check if this snapshot can be retried
                if (!$failedSnapshot->canRetry()) {
                    Log::info('Failed snapshot no longer eligible for retry', [
                        'failed_snapshot_id' => $failedSnapshot->id,
                        'retry_count' => $failedSnapshot->retry_count,
                        'max_retries' => $failedSnapshot->max_retries,
                    ]);
                    continue;
                }

                try {
                    // Update snapshot status to retrying
                    $failedSnapshot->markAsRetrying();

                    // Dispatch snapshot processing job
                    ProcessShoptetSnapshot::dispatch($failedSnapshot->webhookJob)
                        ->onQueue($this->queue);

                    Log::info('Failed snapshot retry dispatched', [
                        'failed_snapshot_id' => $failedSnapshot->id,
                        'webhook_job_id' => $failedSnapshot->webhook_job_id,
                        'retry_count' => $failedSnapshot->retry_count,
                        'endpoint' => $failedSnapshot->endpoint,
                    ]);
                    $retried++;
                } catch (\Throwable $e) {
                    $failed++;
                    Log::error('Failed to dispatch snapshot retry', [
                        'failed_snapshot_id' => $failedSnapshot->id,
                        'endpoint' => $failedSnapshot->endpoint,
                        'exception' => $e->getMessage(),
                        'trace' => $e->getTraceAsString(),
                    ]);
                }
            }

            Log::info('RetryFailedSnapshotsJob completed', [
                'total_processed' => count($failedSnapshots),
                'retried' => $retried,
                'failed' => $failed,
            ]);
        } finally {
            // Always release the lock
            $this->releaseLock();
        }
    }
}
