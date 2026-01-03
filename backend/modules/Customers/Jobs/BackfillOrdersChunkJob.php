<?php

namespace Modules\Customers\Jobs;

use Illuminate\Bus\Batchable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Modules\Customers\Jobs\RecalculateCustomerMetricsJob;
use Modules\Customers\Services\OrderCustomerBackfillService;
use Modules\Orders\Models\Order;

class BackfillOrdersChunkJob implements ShouldQueue
{
    use Batchable;
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    /**
     * @param array<int, string> $orderIds
     */
    public function __construct(private readonly array $orderIds)
    {
        $this->queue = 'customers';
    }

    public function handle(OrderCustomerBackfillService $service): void
    {
        if ($this->orderIds === []) {
            return;
        }

        $orders = Order::query()
            ->whereIn('id', $this->orderIds)
            ->orderBy('id')
            ->get();

        if ($orders->isEmpty()) {
            return;
        }

        // Process orders and get affected customer GUIDs
        $service->process($orders, false);

        // Collect unique customer GUIDs from processed orders
        $customerGuids = $orders
            ->pluck('customer_guid')
            ->filter()
            ->unique()
            ->values()
            ->all();

        // Dispatch metrics recalculation for affected customers
        if ($customerGuids !== []) {
            RecalculateCustomerMetricsJob::dispatch($customerGuids)
                ->onQueue('customers_metrics');
        }
    }
}
