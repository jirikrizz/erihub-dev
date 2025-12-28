<?php

namespace Modules\Customers\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Modules\Customers\Jobs\RecalculateCustomerMetricsJob;
use Modules\Customers\Models\Customer;

class CustomerMetricsDispatchService
{
    public function dispatch(string $queue, int $chunkSize, ?string $customerGuid = null): int
    {
        $queueName = trim($queue) !== '' ? $queue : 'customers_metrics';
        $chunk = max(1, $chunkSize);

        if ($customerGuid) {
            RecalculateCustomerMetricsJob::dispatch([$customerGuid])->onQueue($queueName);
            $this->flushCountCache();

            return 1;
        }

        $lock = Cache::lock('customers:metrics-dispatch', max(60, $chunk * 3));

        if (! $lock->get()) {
            Log::info('Customer metrics dispatch skipped because another run is active.', [
                'queue' => $queueName,
                'chunk' => $chunk,
            ]);

            return 0;
        }

        $dispatched = 0;

        try {
            Customer::query()
                ->select('guid')
                ->whereNotNull('guid')
                ->orderBy('guid')
                ->chunk($chunk, function ($customers) use ($queueName, &$dispatched) {
                    $guids = $customers->pluck('guid')->filter()->values()->all();
                    if ($guids === []) {
                        return;
                    }

                    RecalculateCustomerMetricsJob::dispatch($guids)->onQueue($queueName);
                    $dispatched++;
                });
        } finally {
            optional($lock)->release();
        }

        if ($dispatched === 0) {
            Log::debug('Customer metrics dispatch finished without queued batches.', [
                'queue' => $queueName,
                'chunk' => $chunk,
            ]);
        }

        $this->flushCountCache();

        return $dispatched;
    }

    private function flushCountCache(): void
    {
        Cache::tags(['customers:count'])->flush();
    }
}
