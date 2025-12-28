<?php

namespace Modules\Shoptet\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Modules\Shoptet\Models\ShoptetWebhookJob;

class DiscardWebhookJobsCommand extends Command
{
    protected $signature = 'shoptet:webhook-jobs:discard
        {--status=* : Only discard jobs in these statuses}
        {--before= : Only discard jobs created on or before this datetime}
        {--shop= : Optional shop id filter}
        {--reason=manual_cleanup : Reason stored into job meta}
        {--dry-run : Do not persist any change, only report counts}';

    protected $description = 'Mark old or failed webhook jobs as discarded without deleting rows.';

    public function handle(): int
    {
        $statuses = $this->option('status') ?: ['requested', 'waiting_result', 'download_failed'];
        $reason = $this->option('reason') ?: 'manual_cleanup';
        $dryRun = (bool) $this->option('dry-run');

        $query = ShoptetWebhookJob::query()->whereIn('status', $statuses);

        if ($shopId = $this->option('shop')) {
            $query->where('shop_id', $shopId);
        }

        if ($before = $this->option('before')) {
            try {
                $beforeDate = Carbon::parse($before);
            } catch (\Throwable $throwable) {
                $this->error(sprintf('Unable to parse --before value "%s": %s', $before, $throwable->getMessage()));

                return self::FAILURE;
            }

            $query->where('created_at', '<=', $beforeDate);
        }

        $total = (clone $query)->count();

        if ($total === 0) {
            $this->info('No webhook jobs matched the provided filters.');

            return self::SUCCESS;
        }

        if ($dryRun) {
            $this->info(sprintf('Dry run: %d job(s) would be marked as discarded.', $total));

            return self::SUCCESS;
        }

        $updated = 0;
        $query->orderBy('created_at')
            ->chunk(100, function ($jobs) use (&$updated, $reason) {
                foreach ($jobs as $job) {
                    $job->status = 'discarded';
                    $job->meta = array_merge($job->meta ?? [], [
                        'discarded_at' => now()->toIso8601String(),
                        'discard_reason' => $reason,
                    ]);
                    $job->save();
                    $updated++;
                }
            });

        $this->info(sprintf('Marked %d webhook job(s) as discarded.', $updated));

        return self::SUCCESS;
    }
}
