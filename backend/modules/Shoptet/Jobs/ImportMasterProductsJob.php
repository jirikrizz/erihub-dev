<?php

namespace Modules\Shoptet\Jobs;

use Carbon\CarbonImmutable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Modules\Core\Models\JobSchedule;
use Modules\Pim\Services\ProductSyncService;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Services\ShopSyncCursorService;
use Modules\Shoptet\Services\SnapshotPipelineService;

class ImportMasterProductsJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public function __construct(private readonly string $scheduleId)
    {
        $this->queue = 'snapshots';
    }

    public function handle(
        ProductSyncService $products,
        ShopSyncCursorService $cursors,
        SnapshotPipelineService $pipelines
    ): void {
        /** @var JobSchedule|null $schedule */
        $schedule = JobSchedule::query()->with('shop')->find($this->scheduleId);

        if (! $schedule || ! $schedule->enabled) {
            return;
        }

        $schedule->forceFill([
            'last_run_status' => 'running',
            'last_run_message' => null,
        ])->save();

        try {
            $shops = $this->resolveShops($schedule);

            if ($shops->isEmpty()) {
                $schedule->forceFill([
                    'last_run_status' => 'completed',
                    'last_run_ended_at' => now(),
                    'last_run_message' => 'Nenalezen master shop pro import.',
                ])->save();

                return;
            }

            $fallbackHours = (int) Arr::get($schedule->options ?? [], 'fallback_lookback_hours', 168);
            $fallbackHours = max(1, $fallbackHours);

            $processed = 0;

            foreach ($shops as $shop) {
                $lock = $pipelines->acquireLock($shop, 'products.incremental');

                if (! $lock) {
                    continue;
                }

                $window = $this->buildWindow($shop, $cursors, $fallbackHours);

                if ($window === null) {
                    $pipelines->releaseLock($lock);
                    continue;
                }

                [$from, $to] = $window;

                $execution = $pipelines->start($shop, 'products.incremental', [
                    'schedule_id' => $this->scheduleId,
                    'window' => [
                        'from' => $from->toIso8601String(),
                        'to' => $to->toIso8601String(),
                    ],
                ]);

                try {
                    $result = $products->sync($shop, $from, $to);
                    $lastChange = $result['last_change_time'] ?? $to->toIso8601String();

                    $cursors->put($shop->id, 'products.change_time', $lastChange, [
                        'window' => [
                            'from' => $from->toIso8601String(),
                            'to' => $to->toIso8601String(),
                        ],
                        'updated_at' => now()->toIso8601String(),
                    ]);

                    $pipelines->finish($execution, 'completed', [
                        'processed_count' => $result['processed'] ?? 0,
                        'last_change_time' => $lastChange,
                    ]);

                    $processed++;
                } catch (\Throwable $throwable) {
                    $pipelines->finish($execution, 'error', [
                        'message' => $throwable->getMessage(),
                    ]);

                    $pipelines->releaseLock($lock);

                    throw $throwable;
                }

                $pipelines->releaseLock($lock);
            }

            $schedule->forceFill([
                'last_run_status' => 'completed',
                'last_run_ended_at' => now(),
                'last_run_message' => $processed
                    ? sprintf('Produkty synchronizovány pro %d master shop(ů).', $processed)
                    : 'Žádný master shop nebyl synchronizován (lock aktivní nebo žádné změny).',
            ])->save();
        } catch (\Throwable $throwable) {
            $schedule->forceFill([
                'last_run_status' => 'failed',
                'last_run_ended_at' => now(),
                'last_run_message' => $throwable->getMessage(),
            ])->save();

            Log::error('ImportMasterProductsJob failed', [
                'schedule_id' => $this->scheduleId,
                'exception' => $throwable,
            ]);

            throw $throwable;
        }
    }

    private function resolveShops(JobSchedule $schedule): Collection
    {
        if ($schedule->shop && $schedule->shop->is_master) {
            return collect([$schedule->shop]);
        }

        return Shop::query()->where('is_master', true)->get();
    }

    private function buildWindow(Shop $shop, ShopSyncCursorService $cursors, int $fallbackHours): ?array
    {
        $timezone = $shop->timezone ?: config('app.timezone', 'UTC');
        $now = CarbonImmutable::now($timezone)->subSeconds(10);
        $cursor = $cursors->get($shop->id, 'products.change_time');

        if ($cursor) {
            try {
                $from = CarbonImmutable::parse($cursor)->setTimezone($timezone)->subMinutes(5);
            } catch (\Throwable $throwable) {
                $from = $now->subHours($fallbackHours);
            }
        } else {
            $from = $now->subHours($fallbackHours);
        }

        if ($from->greaterThanOrEqualTo($now)) {
            $from = $now->subMinutes(5);
        }

        if ($from->greaterThanOrEqualTo($now)) {
            return null;
        }

        return [$from, $now];
    }
}
