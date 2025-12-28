<?php

namespace Modules\Customers\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Facades\Bus;
use Modules\Customers\Jobs\BackfillOrdersChunkJob;
use Modules\Customers\Services\OrderCustomerBackfillService;
use Modules\Orders\Models\Order;

class BackfillCustomersFromOrders extends Command
{
    protected $signature = 'customers:backfill-from-orders
        {--chunk=1000 : Number of orders fetched per iteration}
        {--shop= : Limit processing to a specific shop ID}
        {--dry-run : Preview changes without modifying data}
        {--queue : Dispatch jobs to queue instead of processing synchronously}
        {--queue-name=customers : Queue name used when dispatching jobs}';

    protected $description = 'Create or enrich customers based on orders without linked customer records.';

    public function __construct(protected readonly OrderCustomerBackfillService $service)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $chunkSize = (int) $this->option('chunk');
        if ($chunkSize <= 0) {
            $chunkSize = 1000;
        }

        $shopFilter = $this->option('shop');
        $shopId = $shopFilter !== null ? (int) $shopFilter : null;
        $dryRun = (bool) $this->option('dry-run');
        $useQueue = (bool) $this->option('queue');
        $queueName = (string) $this->option('queue-name');

        $ordersQuery = Order::query()
            ->where(function ($query) {
                $query->whereNull('customer_guid')
                    ->orWhere('customer_guid', '');
            });

        if ($shopId) {
            $ordersQuery->where('shop_id', $shopId);
        }

        $total = (clone $ordersQuery)->count();

        if ($total === 0) {
            $this->info('No orders require backfilling.');
            return self::SUCCESS;
        }

        if ($useQueue) {
            $this->dispatchQueuedJobs($ordersQuery, $chunkSize, $queueName);
            $this->info("Dispatched jobs to queue '{$queueName}' for {$total} order(s).");

            return self::SUCCESS;
        }

        $this->info("Processing {$total} order(s) without linked customers...");
        $bar = $this->output->createProgressBar($total);

        $ordersQuery
            ->orderBy('id')
            ->chunkById($chunkSize, function (EloquentCollection $orders) use ($bar, $dryRun) {
                $before = $this->service->getStats();
                $after = $this->service->process($orders, $dryRun);

                $this->reportChunkStats($before, $after, $dryRun);
                $bar->advance($orders->count());
            });

        $bar->finish();
        $this->newLine(2);

        $stats = $this->service->getStats();

        $this->info('Backfill summary:');
        $this->line(' - Orders linked: '.($stats['orders_attached'] ?? 0));
        $this->line(' - Customers created: '.($stats['customers_created'] ?? 0));
        $this->line(' - Customers updated: '.($stats['customers_updated'] ?? 0));
        $this->line(' - Accounts created: '.($stats['accounts_created'] ?? 0));
        $this->line(' - Orders skipped (missing contact): '.($stats['orders_skipped_no_email'] ?? 0));

        if ($dryRun) {
            $this->warn('Dry run enabled - no changes were persisted.');
        }

        return self::SUCCESS;
    }

    private function dispatchQueuedJobs($ordersQuery, int $chunkSize, string $queueName): void
    {
        $ordersQuery
            ->orderBy('id')
            ->chunkById($chunkSize, function (EloquentCollection $orders) use ($queueName) {
                $orderIds = $orders->pluck('id')->all();

                if ($orderIds === []) {
                    return;
                }

                Bus::dispatch((new BackfillOrdersChunkJob($orderIds))->onQueue($queueName));
            });
    }

    private function reportChunkStats(array $before, array $after, bool $dryRun): void
    {
        $deltaOrders = ($after['orders_attached'] ?? 0) - ($before['orders_attached'] ?? 0);
        $deltaCreated = ($after['customers_created'] ?? 0) - ($before['customers_created'] ?? 0);
        $deltaUpdated = ($after['customers_updated'] ?? 0) - ($before['customers_updated'] ?? 0);
        $deltaSkipped = ($after['orders_skipped_no_email'] ?? 0) - ($before['orders_skipped_no_email'] ?? 0);

        $message = sprintf(
            '  +%d orders, +%d created, +%d updated%s%s',
            max(0, $deltaOrders),
            max(0, $deltaCreated),
            max(0, $deltaUpdated),
            $deltaSkipped > 0 ? ", skipped {$deltaSkipped} without contact" : '',
            $dryRun ? ' [dry-run]' : ''
        );

        $this->line($message);
    }
}
