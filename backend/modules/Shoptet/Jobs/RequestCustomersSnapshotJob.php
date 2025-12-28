<?php

namespace Modules\Shoptet\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Modules\Core\Models\JobSchedule;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Services\SnapshotService;

class RequestCustomersSnapshotJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

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
                $snapshots->requestCustomersSnapshot($shop);
                $requested++;
            }

            $schedule->forceFill([
                'last_run_status' => 'completed',
                'last_run_ended_at' => now(),
                'last_run_message' => $requested > 0
                    ? sprintf('Požádáno o snapshot zákazníků pro %d shop(ů).', $requested)
                    : 'Nebyl nalezen žádný shop pro synchronizaci.',
            ])->save();
        } catch (\Throwable $throwable) {
            $schedule->forceFill([
                'last_run_status' => 'failed',
                'last_run_ended_at' => now(),
                'last_run_message' => $throwable->getMessage(),
            ])->save();

            Log::error('RequestCustomersSnapshotJob failed', [
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
}
