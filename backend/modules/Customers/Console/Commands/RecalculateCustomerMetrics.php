<?php

namespace Modules\Customers\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Modules\Customers\Models\CustomerMetric;
use Modules\Customers\Services\CustomerMetricsDispatchService;
use Modules\Orders\Models\Order;
use Modules\Orders\Support\OrderStatusResolver;

class RecalculateCustomerMetrics extends Command
{
    protected $signature = 'customers:recalculate-metrics {--customer_guid=} {--queue=} {--chunk=1000}';

    protected $description = 'Recalculate order metrics for customers.';

    public function __construct(private readonly OrderStatusResolver $orderStatusResolver)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $guid = $this->option('customer_guid');
        $queue = $this->option('queue');
        $chunk = max(1, (int) $this->option('chunk'));

        if ($queue) {
            return $this->dispatchQueued($queue, $chunk, $guid);
        }

        $query = Order::query()
            ->select('customer_guid')
            ->whereNotNull('customer_guid')
            ->when($guid, fn ($query) => $query->where('customer_guid', $guid));

        $this->orderStatusResolver->applyCompletedFilter($query);

        $rows = $query
            ->groupBy('customer_guid')
            ->selectRaw('COUNT(*) as orders_count')
            ->selectRaw('SUM(total_with_vat) as total_spent')
            ->selectRaw('SUM(COALESCE(total_with_vat_base, total_with_vat)) as total_spent_base')
            ->selectRaw('AVG(total_with_vat) as average_order_value')
            ->selectRaw('AVG(COALESCE(total_with_vat_base, total_with_vat)) as average_order_value_base')
            ->selectRaw('MIN(ordered_at) as first_order_at')
            ->selectRaw('MAX(ordered_at) as last_order_at')
            ->get();

        DB::transaction(function () use ($rows, $guid) {
            if ($guid) {
                CustomerMetric::where('customer_guid', $guid)->delete();
            } elseif ($rows->count() === 0) {
                CustomerMetric::query()->delete();
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

        $this->flushCountCache();

        $this->info(sprintf('Recalculated metrics for %d customer(s).', $rows->count()));

        return self::SUCCESS;
    }

    private function dispatchQueued(string $queue, int $chunk, ?string $guid): int
    {
        $dispatcher = app(CustomerMetricsDispatchService::class);
        $dispatched = $dispatcher->dispatch($queue, $chunk, $guid);

        $queueName = trim($queue) !== '' ? $queue : 'customers';

        if ($guid) {
            $this->info(sprintf('Dispatched metrics job for customer %s to queue [%s].', $guid, $queueName));
        } else {
            $this->info(sprintf('Dispatched %d metrics job(s) to queue [%s].', $dispatched, $queueName));
        }

        return self::SUCCESS;
    }

    private function flushCountCache(): void
    {
        Cache::tags(['customers:count'])->flush();
    }
}
