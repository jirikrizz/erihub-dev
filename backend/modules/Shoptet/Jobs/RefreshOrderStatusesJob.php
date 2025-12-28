<?php

namespace Modules\Shoptet\Jobs;

use Carbon\CarbonImmutable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Modules\Core\Models\JobSchedule;
use Modules\Orders\Services\OrderSyncService;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Services\SnapshotPipelineService;

class RefreshOrderStatusesJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(private readonly string $scheduleId)
    {
        $this->queue = 'orders';
    }

    public function handle(
        OrderSyncService $orders,
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

        $options = $schedule->options ?? [];
        $lookbackHours = (int) ($options['lookback_hours'] ?? 48);
        $lookbackHours = max(1, min(720, $lookbackHours));

        try {
            $shops = $this->resolveShops($schedule);
            $processedShops = 0;

            foreach ($shops as $shop) {
                $lock = $pipelines->acquireLock($shop, 'orders.status_refresh');
                if (! $lock) {
                    continue;
                }

                $window = $this->buildWindow($shop, $lookbackHours);
                if ($window === null) {
                    $pipelines->releaseLock($lock);
                    continue;
                }

                [$from, $to] = $window;

                $execution = $pipelines->start($shop, 'orders.status_refresh', [
                    'schedule_id' => $this->scheduleId,
                    'window' => [
                        'from' => $from->toIso8601String(),
                        'to' => $to->toIso8601String(),
                    ],
                ], now()->toIso8601String());

                try {
                    $result = $orders->sync($shop, $from, $to);
                    $ordersProcessed = (int) ($result['orders_count'] ?? 0);

                    $pipelines->finish($execution, 'completed', [
                        'orders_count' => $ordersProcessed,
                        'window' => [
                            'from' => $from->toIso8601String(),
                            'to' => $to->toIso8601String(),
                        ],
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
                    ? sprintf('Stavy objednávek aktualizovány pro %d shop(ů).', $processedShops)
                    : 'Žádný shop nebyl synchronizován (lock aktivní).',
            ])->save();
        } catch (\Throwable $throwable) {
            $schedule->forceFill([
                'last_run_status' => 'failed',
                'last_run_ended_at' => now(),
                'last_run_message' => $throwable->getMessage(),
            ])->save();

            Log::error('RefreshOrderStatusesJob failed', [
                'schedule_id' => $this->scheduleId,
                'exception' => $throwable,
            ]);

            throw $throwable;
        }
    }

    /**
     * @return Collection<int, Shop>
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

    private function buildWindow(Shop $shop, int $lookbackHours): ?array
    {
        $timezone = $shop->timezone ?: config('app.timezone', 'UTC');
        $now = CarbonImmutable::now($timezone)->subSeconds(10);
        $from = $now->subHours($lookbackHours);

        if ($from->greaterThanOrEqualTo($now)) {
            $from = $now->subMinutes(5);
        }

        if ($from->greaterThanOrEqualTo($now)) {
            return null;
        }

        return [$from, $now];
    }
}
