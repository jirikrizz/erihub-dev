<?php

namespace Modules\Customers\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Modules\Core\Models\JobSchedule;
use Modules\Orders\Models\Order;
use Throwable;

class DispatchCustomersBackfillFromOrdersJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public function __construct(private readonly string $scheduleId)
    {
        $this->queue = 'customers';
    }

    public function handle(): void
    {
        /** @var JobSchedule|null $schedule */
        $schedule = JobSchedule::query()->find($this->scheduleId);

        if (! $schedule || ! $schedule->enabled) {
            return;
        }

        $schedule->forceFill([
            'last_run_status' => 'running',
            'last_run_message' => null,
        ])->save();

        $options = $schedule->options ?? [];
        $queueName = $this->resolveQueue($options);
        $chunkSize = $this->resolveChunk($options);

        $ordersQuery = Order::query()
            ->where(function ($query) {
                $query->whereNull('customer_guid')
                    ->orWhere('customer_guid', '');
            });

        if ($schedule->shop_id) {
            $ordersQuery->where('shop_id', $schedule->shop_id);
        }

        try {
            $totalOrders = (clone $ordersQuery)->count();

            if ($totalOrders === 0) {
                $schedule->forceFill([
                    'last_run_status' => 'completed',
                    'last_run_ended_at' => now(),
                    'last_run_message' => 'Žádné objednávky nečekají na doplnění zákazníka.',
                ])->save();

                return;
            }

            $dispatchedBatches = 0;

            $ordersQuery
                ->orderBy('id')
                ->chunkById($chunkSize, function (EloquentCollection $orders) use (&$dispatchedBatches, $queueName): void {
                    $orderIds = $orders->pluck('id')->all();

                    if ($orderIds === []) {
                        return;
                    }

                    BackfillOrdersChunkJob::dispatch($orderIds)->onQueue($queueName);
                    $dispatchedBatches++;
                });

            $schedule->forceFill([
                'last_run_status' => 'completed',
                'last_run_ended_at' => now(),
                'last_run_message' => $dispatchedBatches > 0
                    ? sprintf('Odesláno %d dávek do fronty [%s] (celkem %d objednávek).', $dispatchedBatches, $queueName, $totalOrders)
                    : 'Nebyla odeslána žádná dávka.',
            ])->save();
        } catch (Throwable $exception) {
            $schedule->forceFill([
                'last_run_status' => 'failed',
                'last_run_ended_at' => now(),
                'last_run_message' => $exception->getMessage(),
            ])->save();

            Log::error('DispatchCustomersBackfillFromOrdersJob failed', [
                'schedule_id' => $this->scheduleId,
                'exception' => $exception,
            ]);

            throw $exception;
        }
    }

    private function resolveQueue(array $options): string
    {
        $queue = Arr::get($options, 'queue');

        if (is_string($queue) && trim($queue) !== '') {
            return trim($queue);
        }

        return 'customers';
    }

    private function resolveChunk(array $options): int
    {
        $chunk = Arr::get($options, 'chunk');

        if (is_numeric($chunk)) {
            $chunk = (int) $chunk;
        } else {
            $chunk = 200;
        }

        return max(10, min(2000, $chunk));
    }
}
