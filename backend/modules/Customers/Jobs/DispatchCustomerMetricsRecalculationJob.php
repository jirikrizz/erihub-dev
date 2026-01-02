<?php

namespace Modules\Customers\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Modules\Core\Models\JobSchedule;
use Modules\Customers\Services\CustomerMetricsDispatchService;

class DispatchCustomerMetricsRecalculationJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;
    use \Modules\Core\Traits\WithJobLocking;

    public function __construct(private readonly string $scheduleId)
    {
        $this->queue = 'customers_metrics';
    }

    public function handle(CustomerMetricsDispatchService $dispatcher): void
    {
        // Acquire job lock to prevent concurrent execution
        if (!$this->acquireLock()) {
            \Illuminate\Support\Facades\Log::info('DispatchCustomerMetricsRecalculationJob is already running, skipping');
            return;
        }

        try {
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
        $queue = $this->resolveQueue($options);
        $chunk = $this->resolveChunk($options);

        try {
            $dispatched = $dispatcher->dispatch($queue, $chunk, null);

            $schedule->forceFill([
                'last_run_status' => 'completed',
                'last_run_ended_at' => now(),
                'last_run_message' => $dispatched > 0
                    ? sprintf('Do fronty [%s] odesláno %d dávek.', $queue, $dispatched)
                    : 'Nebyly nalezeny žádné zákaznické záznamy pro přepočet.',
            ])->save();
        } catch (\Throwable $throwable) {
            $schedule->forceFill([
                'last_run_status' => 'failed',
                'last_run_ended_at' => now(),
                'last_run_message' => $throwable->getMessage(),
            ])->save();

            Log::error('DispatchCustomerMetricsRecalculationJob failed', [
                'schedule_id' => $this->scheduleId,
                'exception' => $throwable,
            ]);

            throw $throwable;
        }
        } finally {
            $this->releaseLock();
        }
    }

    private function resolveQueue(array $options): string
    {
        $queue = Arr::get($options, 'queue');

        if (is_string($queue) && trim($queue) !== '') {
            return trim($queue);
        }

        return 'customers_metrics';
    }

    private function resolveChunk(array $options): int
    {
        $chunk = Arr::get($options, 'chunk');

        if (is_numeric($chunk)) {
            $chunk = (int) $chunk;
        } else {
            $chunk = 1000;
        }

        return max(1, min(5000, $chunk));
    }
}
