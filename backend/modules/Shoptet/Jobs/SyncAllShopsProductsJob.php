<?php

namespace Modules\Shoptet\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Modules\Core\Models\JobSchedule;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Services\SnapshotService;

/**
 * Sync products from ALL shops (CZ, SK, HU, RO, HR) to get prices, links, names per locale
 */
class SyncAllShopsProductsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(private readonly string $scheduleId)
    {
        $this->queue = 'snapshots';
    }

    public function handle(SnapshotService $snapshots): void
    {
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
            $requested = 0;

            foreach ($shops as $shop) {
                Log::info('Requesting product snapshot for shop', [
                    'shop_id' => $shop->id,
                    'shop_name' => $shop->name,
                    'locale' => $shop->locale,
                ]);

                $snapshots->requestProductsSnapshot($shop);
                $requested++;

                // Stagger requests by 5 seconds to avoid overwhelming Shoptet API
                if ($requested < $shops->count()) {
                    sleep(5);
                }
            }

            $schedule->forceFill([
                'last_run_status' => 'completed',
                'last_run_ended_at' => now(),
                'last_run_message' => $requested > 0
                    ? sprintf('Požádáno o snapshot produktů pro %d shop(ů): %s', 
                        $requested, 
                        $shops->pluck('name')->implode(', ')
                    )
                    : 'Nebyl nalezen žádný shop pro synchronizaci.',
            ])->save();
        } catch (\Throwable $throwable) {
            $schedule->forceFill([
                'last_run_status' => 'failed',
                'last_run_ended_at' => now(),
                'last_run_message' => $throwable->getMessage(),
            ])->save();

            Log::error('SyncAllShopsProductsJob failed', [
                'schedule_id' => $this->scheduleId,
                'exception' => $throwable,
            ]);

            throw $throwable;
        }
    }

    /**
     * @return \Illuminate\Support\Collection<int, Shop>
     */
    private function resolveShops(JobSchedule $schedule): \Illuminate\Support\Collection
    {
        $options = $schedule->options ?? [];
        
        // If shop_ids are specified in options, use only those
        if (! empty($options['shop_ids']) && is_array($options['shop_ids'])) {
            return Shop::query()->whereIn('id', $options['shop_ids'])->get();
        }

        // If schedule is bound to specific shop, use only that shop
        if ($schedule->shop_id) {
            return collect([$schedule->shop]);
        }

        // Default: all active shops (CZ, SK, HU, RO, HR)
        return Shop::query()
            ->whereNotNull('access_token')
            ->orderBy('is_master', 'desc') // Master first
            ->orderBy('id')
            ->get();
    }
}
