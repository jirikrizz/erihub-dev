<?php

namespace Modules\Inventory\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Modules\Core\Models\JobSchedule;
use Modules\Inventory\Services\InventoryStockGuardSyncService;

class SyncInventoryStockGuardJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(private readonly string $scheduleId)
    {
        $this->queue = 'default';
    }

    public function handle(InventoryStockGuardSyncService $syncService): void
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

        try {
            $options = $schedule->options ?? [];
            $chunk = (int) Arr::get($options, 'chunk', 200);
            $result = $syncService->sync($chunk);
            $processed = $result['processed'] ?? 0;

            $schedule->forceFill([
                'last_run_status' => 'completed',
                'last_run_ended_at' => now(),
                'last_run_message' => sprintf('Synchronizováno %d variant.', $processed),
            ])->save();
        } catch (\Throwable $throwable) {
            $schedule->forceFill([
                'last_run_status' => 'failed',
                'last_run_ended_at' => now(),
                'last_run_message' => $throwable->getMessage(),
            ])->save();

            Log::error('SyncInventoryStockGuardJob failed', [
                'schedule_id' => $this->scheduleId,
                'exception' => $throwable,
            ]);

            throw $throwable;
        }
    }
}
