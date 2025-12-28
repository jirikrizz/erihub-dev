<?php

namespace Modules\Customers\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Modules\Customers\Services\OrderCustomerBackfillService;
use Modules\Orders\Models\Order;

class AttachOrderCustomerJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(private readonly string $orderId)
    {
        $this->queue = 'customers';
    }

    public function handle(OrderCustomerBackfillService $backfill): void
    {
        /** @var Order|null $order */
        $order = Order::query()->with(['shop'])->find($this->orderId);

        if (! $order) {
            return;
        }

        $backfill->syncCustomerFromOrder($order);

        $order->refresh();

        if ($order->customer_guid) {
            RecalculateCustomerMetricsJob::dispatchSync([$order->customer_guid]);
        }
    }
}
