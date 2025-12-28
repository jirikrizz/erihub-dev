<?php

namespace Modules\Customers\Console\Commands;

use Illuminate\Console\Command;
use Modules\Customers\Jobs\AttachOrderCustomerJob;
use Modules\Orders\Models\Order;

class SyncOrderCustomers extends Command
{
    protected $signature = 'customers:sync-order-customers
        {--all : Process all orders instead of only those without customer}
        {--chunk=500 : Number of orders fetched per iteration}
        {--queue=default : Queue name to dispatch jobs to}';

    protected $description = 'Disptach jobs to ensure every order has an assigned customer record.';

    public function handle(): int
    {
        $chunkSize = (int) $this->option('chunk');
        if ($chunkSize <= 0) {
            $chunkSize = 500;
        }

        $queue = (string) $this->option('queue');
        $processAll = (bool) $this->option('all');

        $query = Order::query()->select(['id', 'customer_guid'])->orderBy('id');

        if (! $processAll) {
            $query->whereNull('customer_guid');
        }

        $dispatched = 0;

        $query->chunkById($chunkSize, function ($orders) use (&$dispatched, $queue) {
            foreach ($orders as $order) {
                AttachOrderCustomerJob::dispatch($order->id)->onQueue($queue);
                $dispatched++;
            }
        });

        $this->info(sprintf('Dispatched %d order sync job(s).', $dispatched));

        return self::SUCCESS;
    }
}
