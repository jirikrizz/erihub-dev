<?php

namespace Modules\WooCommerce\Jobs;

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
use Modules\Shoptet\Models\Shop;
use Modules\WooCommerce\Models\WooCommerceShop;
use Modules\WooCommerce\Services\OrderSyncService;

class SyncWooCommerceOrdersJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public function __construct(private readonly string $scheduleId)
    {
        $this->queue = 'snapshots';
    }

    public function handle(OrderSyncService $orders): void
    {
        /** @var JobSchedule|null $schedule */
        $schedule = JobSchedule::query()->with('shop.woocommerce')->find($this->scheduleId);

        if (! $schedule || ! $schedule->enabled) {
            return;
        }

        $schedule->forceFill([
            'last_run_status' => 'running',
            'last_run_message' => null,
        ])->save();

        try {
            $shops = $this->resolveShops($schedule);
            $options = $schedule->options ?? [];

            $lookbackHours = (int) Arr::get($options, 'lookback_hours', 24);
            $lookbackHours = $lookbackHours > 0 ? $lookbackHours : 24;

            $perPage = (int) Arr::get($options, 'per_page', config('woocommerce.default_per_page', 50));
            $perPage = $perPage > 0 ? min($perPage, 100) : config('woocommerce.default_per_page', 50);

            $maxPages = (int) Arr::get($options, 'max_pages', config('woocommerce.max_pages', 200));
            $maxPages = $maxPages > 0 ? $maxPages : config('woocommerce.max_pages', 200);

            $synced = 0;
            $importedTotal = 0;

            foreach ($shops as $shop) {
                $after = $this->resolveAfterCursor($shop->woocommerce, $lookbackHours);

                $result = $orders->sync($shop, [
                    'after' => $after?->toIso8601String(),
                    'per_page' => $perPage,
                    'max_pages' => $maxPages,
                ]);

                $importedTotal += (int) ($result['imported'] ?? 0);
                $synced++;
            }

            $schedule->forceFill([
                'last_run_status' => 'completed',
                'last_run_ended_at' => now(),
                'last_run_message' => $synced > 0
                    ? sprintf(
                        'Z WooCommerce načteno %d objednávek (%d shopů).',
                        $importedTotal,
                        $synced
                    )
                    : 'Nebyl nalezen žádný WooCommerce shop pro synchronizaci.',
            ])->save();
        } catch (\Throwable $throwable) {
            $schedule->forceFill([
                'last_run_status' => 'failed',
                'last_run_ended_at' => now(),
                'last_run_message' => $throwable->getMessage(),
            ])->save();

            Log::error('SyncWooCommerceOrdersJob failed', [
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
        if ($schedule->shop && $schedule->shop->woocommerce) {
            return collect([$schedule->shop]);
        }

        return Shop::query()
            ->whereHas('woocommerce')
            ->with('woocommerce')
            ->get();
    }

    private function resolveAfterCursor(?WooCommerceShop $connection, int $lookbackHours): ?CarbonImmutable
    {
        $fallback = CarbonImmutable::now()->subHours($lookbackHours);

        if (! $connection || ! $connection->last_synced_at) {
            return $fallback;
        }

        $lastSynced = CarbonImmutable::parse($connection->last_synced_at);

        return $lastSynced->subMinutes(15)->max($fallback);
    }
}
