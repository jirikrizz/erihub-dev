<?php

namespace Modules\Customers\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Modules\Customers\Jobs\ApplyCustomerTagRulesJob;
use Modules\Customers\Models\CustomerMetric;
use Modules\Orders\Models\Order;
use Modules\Orders\Support\OrderStatusResolver;

class RecalculateCustomerMetricsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;
    use \Modules\Core\Traits\WithJobLocking;

    /** @var list<string> */
    private array $customerGuids;

    public function __construct(array $customerGuids)
    {
        $this->customerGuids = array_values(array_filter($customerGuids, fn ($value) => $value !== null && $value !== ''));
        $this->queue = 'customers_metrics';
        $this->jobLockTimeout = 300; // 5 minutes lock (reduced from 1 hour)
    }

    /**
     * Override lock key to use per-customer-batch locking instead of global job locking.
     * This allows multiple batches to process concurrently for different customers.
     */
    protected function getLockKey(): string
    {
        $class = class_basename(static::class);
        $customerKey = md5(implode(',', $this->customerGuids));
        return "job-lock:{$class}:{$customerKey}";
    }

    public function handle(OrderStatusResolver $orderStatusResolver): void
    {
        // Acquire job lock to prevent concurrent execution
        if (!$this->acquireLock()) {
            \Illuminate\Support\Facades\Log::info('RecalculateCustomerMetricsJob is already running for these customers, skipping');
            return;
        }

        try {
        if ($this->customerGuids === []) {
            return;
        }

        $query = Order::query()
            ->select('customer_guid')
            ->whereNotNull('customer_guid')
            ->whereIn('customer_guid', $this->customerGuids);

        $orderStatusResolver->applyCompletedFilter($query);

        $rows = $query
            ->groupBy('customer_guid')
            ->selectRaw('COUNT(*) AS orders_count')
            ->selectRaw('COALESCE(SUM(total_with_vat), 0) AS total_spent')
            ->selectRaw('COALESCE(SUM(COALESCE(total_with_vat_base, total_with_vat)), 0) AS total_spent_base')
            ->selectRaw('COALESCE(AVG(total_with_vat), 0) AS average_order_value')
            ->selectRaw('COALESCE(AVG(COALESCE(total_with_vat_base, total_with_vat)), 0) AS average_order_value_base')
            ->selectRaw('MIN(ordered_at) AS first_order_at')
            ->selectRaw('MAX(ordered_at) AS last_order_at')
            ->get();

        $found = $rows->pluck('customer_guid')->all();
        $missing = array_diff($this->customerGuids, $found);

        DB::transaction(function () use ($rows, $missing) {
            if ($missing !== []) {
                CustomerMetric::query()->whereIn('customer_guid', $missing)->delete();
            }

            foreach ($rows as $row) {
                CustomerMetric::updateOrCreate(
                    ['customer_guid' => $row->customer_guid],
                    [
                        'orders_count' => (int) $row->orders_count,
                        'total_spent' => (float) $row->total_spent,
                        'total_spent_base' => (float) $row->total_spent_base,
                        'average_order_value' => (float) $row->average_order_value,
                        'average_order_value_base' => (float) $row->average_order_value_base,
                        'first_order_at' => $row->first_order_at,
                        'last_order_at' => $row->last_order_at,
                    ]
                );
            }
        });

        ApplyCustomerTagRulesJob::dispatch($this->customerGuids)->onQueue($this->queue);
        } finally {
            $this->releaseLock();
        }
    }
}
