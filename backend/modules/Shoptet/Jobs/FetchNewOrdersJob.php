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
use Modules\Inventory\Jobs\RefreshVariantsFromMasterJob;
use Modules\Inventory\Jobs\RecalculateInventoryVariantMetricsJob;
use Modules\Orders\Services\OrderSyncService;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Services\ShopSyncCursorService;
use Modules\Shoptet\Services\SnapshotPipelineService;

class FetchNewOrdersJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;
    use \Modules\Core\Traits\WithJobLocking;

    public function __construct(private readonly string $scheduleId)
    {
        $this->queue = 'orders';
    }

    public function handle(
        OrderSyncService $orders,
        ShopSyncCursorService $cursors,
        SnapshotPipelineService $pipelines
    ): void {
        // Acquire job lock to prevent concurrent execution
        if (!$this->acquireLock()) {
            \Illuminate\Support\Facades\Log::info('FetchNewOrdersJob is already running, skipping');
            return;
        }

        try {
            /** @var JobSchedule|null $schedule */
            $schedule = JobSchedule::query()->with('shop')->find($this->scheduleId);

            if (! $schedule || ! $schedule->enabled) {
                return;
            }

            $schedule->forceFill([
                'last_run_status' => 'running',
                'last_run_message' => null,
            ])->save();

            $options = $schedule->options ?? [];
            $fallbackHours = (int) Arr::get($options, 'fallback_lookback_hours', 24);
            if ($fallbackHours < 1) {
                $fallbackHours = 1;
            }
            $fullRescanHours = (int) Arr::get($options, 'full_rescan_hours', 0);
            if ($fullRescanHours < 0) {
                $fullRescanHours = 0;
            }

            try {
                $shops = $this->resolveShops($schedule);
                $processedShops = 0;

                foreach ($shops as $shop) {
                    $lock = $pipelines->acquireLock($shop, 'orders.incremental');

                    if (! $lock) {
                        continue;
                    }

                    $window = $this->buildWindow($shop, $cursors, $fallbackHours, $fullRescanHours);

                    if ($window === null) {
                        $pipelines->releaseLock($lock);
                        continue;
                    }

                    [$from, $to] = $window;

                    $execution = $pipelines->start($shop, 'orders.incremental', [
                        'schedule_id' => $this->scheduleId,
                        'window' => [
                            'from' => $from->toIso8601String(),
                            'to' => $to->toIso8601String(),
                        ],
                    ], now()->toIso8601String());

                    try {
                        $result = $orders->sync($shop, $from, $to);

                        $lastChange = $result['last_change_time'] ?? $to->toIso8601String();
                        $cursors->put($shop->id, 'orders.change_time', $lastChange, [
                            'window' => [
                                'from' => $from->toIso8601String(),
                                'to' => $to->toIso8601String(),
                            ],
                            'updated_at' => now()->toIso8601String(),
                        ]);

                        $ordersProcessed = (int) ($result['orders_count'] ?? 0);
                        $variantIds = $result['variant_ids'] ?? [];

                        $this->dispatchVariantUpdates($variantIds);

                        $pipelines->finish($execution, 'completed', [
                            'processed_count' => $ordersProcessed,
                            'orders_count' => $ordersProcessed,
                            'variants_updated' => count($variantIds),
                            'last_change_time' => $lastChange,
                        ]);
                        $processedShops++;
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
                    'last_run_message' => $processedShops
                        ? sprintf('Objednávky synchronizovány pro %d shop(ů).', $processedShops)
                        : 'Žádný shop nebyl synchronizován (lock aktivní nebo žádné změny).',
                ])->save();
            } catch (\Throwable $throwable) {
                $schedule->forceFill([
                    'last_run_status' => 'failed',
                    'last_run_ended_at' => now(),
                    'last_run_message' => $throwable->getMessage(),
                ])->save();

                Log::error('FetchNewOrdersJob failed', [
                    'schedule_id' => $this->scheduleId,
                    'exception' => $throwable,
                ]);

                throw $throwable;
            }
        } finally {
            // Always release the job lock
            $this->releaseLock();
        }
    }

    /**
     * @return \Illuminate\Support\Collection<int, Shop>
     */
    private function resolveShops(JobSchedule $schedule): Collection
    {
        if ($schedule->shop) {
            return collect([$schedule->shop]);
        }

        $query = Shop::query();

        if (Shop::hasProviderColumn()) {
            $query->where('provider', 'shoptet');
        }

        return $query->get();
    }

    private function buildWindow(Shop $shop, ShopSyncCursorService $cursors, int $fallbackHours, int $fullRescanHours = 0): ?array
    {
        $timezone = $shop->timezone ?: config('app.timezone', 'UTC');
        $now = CarbonImmutable::now($timezone)->subSeconds(10);

        if ($fullRescanHours > 0) {
            $from = $now->subHours($fullRescanHours);
            return [$from, $now];
        }

        $cursor = $cursors->get($shop->id, 'orders.change_time');

        if ($cursor) {
            try {
                $from = CarbonImmutable::parse($cursor)->setTimezone($timezone)->subMinute();
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

    private function dispatchVariantUpdates(array $variantIds): void
    {
        $unique = array_values(array_unique(array_filter($variantIds, static fn ($value) => is_string($value) && $value !== '')));

        if ($unique === []) {
            return;
        }

        foreach (array_chunk($unique, 20) as $chunk) {
            if ($chunk === []) {
                continue;
            }

            RefreshVariantsFromMasterJob::dispatch($chunk);
            RecalculateInventoryVariantMetricsJob::dispatch($chunk);
        }
    }
}
