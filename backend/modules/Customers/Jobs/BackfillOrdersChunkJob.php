<?php

namespace Modules\Customers\Jobs;

use Illuminate\Bus\Batchable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
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

        $service->process($orders, false);
    }
}
