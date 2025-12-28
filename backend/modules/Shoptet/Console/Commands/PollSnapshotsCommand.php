<?php

namespace Modules\Shoptet\Console\Commands;

use Illuminate\Console\Command;
use Modules\Shoptet\Jobs\DownloadShoptetSnapshot;
use Modules\Shoptet\Models\ShoptetWebhookJob;

class PollSnapshotsCommand extends Command
{
    protected $signature = 'shoptet:poll-snapshots {--shop=} {--status=* : Optional list of statuses to process}';

    protected $description = 'Polling fallback for Shoptet snapshot jobs (useful when webhook is not reachable).';

    public function handle(): int
    {
        $statuses = $this->option('status');
        $statuses = $statuses ?: ['requested', 'waiting_result', 'download_failed'];

        $query = ShoptetWebhookJob::query()
            ->whereIn('status', $statuses);

        if ($shopId = $this->option('shop')) {
            $query->where('shop_id', $shopId);
        }

        $jobs = $query->orderBy('created_at')->get();

        if ($jobs->isEmpty()) {
            $this->info('No snapshot jobs found for polling.');

            return self::SUCCESS;
        }

        foreach ($jobs as $job) {
            DownloadShoptetSnapshot::dispatch($job, true, true);
        }

        $this->info(sprintf('Dispatched %d snapshot job(s) for polling.', $jobs->count()));

        return self::SUCCESS;
    }
}
