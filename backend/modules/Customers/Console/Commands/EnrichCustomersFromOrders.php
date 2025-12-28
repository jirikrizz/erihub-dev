<?php

namespace Modules\Customers\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Modules\Customers\Models\Customer;
use Modules\Orders\Models\Order;

class EnrichCustomersFromOrders extends BackfillCustomersFromOrders
{
    protected $signature = 'customers:enrich-from-orders
        {--chunk=1000 : Number of customers processed per iteration}
        {--shop= : Limit processing to a specific shop ID}
        {--all : Process all customers regardless of completeness}
        {--dry-run : Preview changes without saving}';

    protected $description = 'Fill missing customer details (name, phone, addresses) from linked orders.';

    public function handle(): int
    {
        $chunkSize = (int) $this->option('chunk');
        if ($chunkSize <= 0) {
            $chunkSize = 1000;
        }

        $shopFilter = $this->option('shop');
        $shopId = $shopFilter !== null ? (int) $shopFilter : null;
        $dryRun = (bool) $this->option('dry-run');

        $customersQuery = Customer::query();

        if (! $this->option('all')) {
            $customersQuery->where(function ($query) {
                $query
                    ->whereNull('full_name')
                    ->orWhere('full_name', '')
                    ->orWhereNull('phone')
                    ->orWhere('phone', '');
            });
        }

        if ($shopId) {
            $customersQuery->where('shop_id', $shopId);
        }

        $total = $customersQuery->count();
        if ($total === 0) {
            $this->info('No customers with missing data were found for the given criteria.');
            return self::SUCCESS;
        }

        $this->info("Enriching {$total} customer(s) from their orders...");
        $bar = $this->output->createProgressBar($total);

        $stats = [
            'processed' => 0,
            'enriched' => 0,
            'skipped_no_order' => 0,
            'skipped_no_change' => 0,
        ];

        $customersQuery
            ->orderBy('id')
            ->chunkById($chunkSize, function (EloquentCollection $customers) use (&$stats, $bar, $dryRun) {
                foreach ($customers as $customer) {
                    /** @var Customer $customer */
                    $stats['processed']++;

                    $order = Order::query()
                        ->where('customer_guid', $customer->guid)
                        ->orderByDesc('ordered_at')
                        ->orderByDesc('created_at')
                        ->first();

                    if (! $order) {
                        $stats['skipped_no_order']++;
                        $bar->advance();
                        continue;
                    }

                    $changed = $this->service->enrichCustomerFromOrder($customer, $order, $dryRun);

                    if ($changed) {
                        $stats['enriched']++;
                    } else {
                        $stats['skipped_no_change']++;
                    }

                    if ($dryRun) {
                        $customer->syncOriginal();
                    }

                    $bar->advance();
                }
            });

        $bar->finish();
        $this->newLine(2);

        $this->info('Enrichment summary:');
        $this->line(' - Customers processed: '.$stats['processed']);
        $this->line(' - Customers enriched: '.$stats['enriched']);
        $this->line(' - Customers without any orders: '.$stats['skipped_no_order']);
        $this->line(' - Customers already complete: '.$stats['skipped_no_change']);

        if ($dryRun) {
            $this->warn('Dry run enabled - no changes were persisted.');
        }

        return self::SUCCESS;
    }
}
