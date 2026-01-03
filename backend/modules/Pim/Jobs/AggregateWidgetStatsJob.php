<?php

namespace Modules\Pim\Jobs;

use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Aggregate widget analytics events into daily stats
 * Runs daily to process previous day's events
 */
class AggregateWidgetStatsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 900; // 15 minutes
    public int $tries = 3;

    public function __construct(
        private ?Carbon $date = null
    ) {
        $this->queue = 'default';
    }

    public function handle(): void
    {
        $targetDate = $this->date ?? Carbon::yesterday();
        $startOfDay = $targetDate->copy()->startOfDay();
        $endOfDay = $targetDate->copy()->endOfDay();

        Log::info('AggregateWidgetStatsJob: Starting aggregation', [
            'date' => $targetDate->toDateString(),
            'start' => $startOfDay->toDateTimeString(),
            'end' => $endOfDay->toDateTimeString(),
        ]);

        $eventCount = DB::table('product_widget_events')
            ->whereBetween('created_at', [$startOfDay, $endOfDay])
            ->count();

        if ($eventCount === 0) {
            Log::info('AggregateWidgetStatsJob: No events found for date', [
                'date' => $targetDate->toDateString(),
            ]);
            return;
        }

        Log::info('AggregateWidgetStatsJob: Processing events', [
            'date' => $targetDate->toDateString(),
            'event_count' => $eventCount,
        ]);

        // Aggregate events grouped by widget, item, shop, locale, and event type
        $aggregated = DB::table('product_widget_events')
            ->select([
                DB::raw("'{$targetDate->toDateString()}' as stat_date"),
                'product_widget_id',
                'product_widget_item_id',
                'shop_id',
                'locale',
                'event_type',
                DB::raw('COUNT(*) as count'),
            ])
            ->whereBetween('created_at', [$startOfDay, $endOfDay])
            ->groupBy([
                'product_widget_id',
                'product_widget_item_id',
                'shop_id',
                'locale',
                'event_type',
            ])
            ->get();

        if ($aggregated->isEmpty()) {
            Log::warning('AggregateWidgetStatsJob: Aggregation returned empty results', [
                'date' => $targetDate->toDateString(),
            ]);
            return;
        }

        Log::info('AggregateWidgetStatsJob: Upserting aggregated stats', [
            'date' => $targetDate->toDateString(),
            'groups' => $aggregated->count(),
        ]);

        $inserted = 0;
        $updated = 0;

        foreach ($aggregated as $stat) {
            $data = [
                'stat_date' => $stat->stat_date,
                'product_widget_id' => $stat->product_widget_id,
                'product_widget_item_id' => $stat->product_widget_item_id,
                'shop_id' => $stat->shop_id,
                'locale' => $stat->locale,
                'event_type' => $stat->event_type,
                'count' => $stat->count,
                'updated_at' => now(),
            ];

            $existing = DB::table('product_widget_stats_daily')
                ->where('stat_date', $stat->stat_date)
                ->where('product_widget_id', $stat->product_widget_id)
                ->where('product_widget_item_id', $stat->product_widget_item_id)
                ->where('shop_id', $stat->shop_id)
                ->where('locale', $stat->locale)
                ->where('event_type', $stat->event_type)
                ->first();

            if ($existing) {
                DB::table('product_widget_stats_daily')
                    ->where('id', $existing->id)
                    ->update(['count' => $stat->count, 'updated_at' => now()]);
                $updated++;
            } else {
                DB::table('product_widget_stats_daily')->insert(array_merge($data, [
                    'created_at' => now(),
                ]));
                $inserted++;
            }
        }

        Log::info('AggregateWidgetStatsJob: Completed aggregation', [
            'date' => $targetDate->toDateString(),
            'inserted' => $inserted,
            'updated' => $updated,
            'total_events' => $eventCount,
        ]);
    }

    public function failed(\Throwable $exception): void
    {
        Log::error('AggregateWidgetStatsJob: Failed', [
            'date' => $this->date?->toDateString() ?? 'yesterday',
            'error' => $exception->getMessage(),
            'trace' => $exception->getTraceAsString(),
        ]);
    }
}
