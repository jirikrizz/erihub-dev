<?php

namespace Modules\Pim\Http\Controllers;

use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Modules\Pim\Models\ProductWidget;

class WidgetAnalyticsController extends Controller
{
    /**
     * Get widget analytics summary
     * GET /api/pim/widgets/{widget}/analytics
     */
    public function show(ProductWidget $widget, Request $request)
    {
        $validated = $request->validate([
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
        ]);

        $startDate = isset($validated['start_date']) 
            ? Carbon::parse($validated['start_date']) 
            : Carbon::now()->subDays(30);
        
        $endDate = isset($validated['end_date']) 
            ? Carbon::parse($validated['end_date']) 
            : Carbon::now();

        // Get aggregated stats from daily table
        $dailyStats = DB::table('product_widget_stats_daily')
            ->where('product_widget_id', $widget->id)
            ->whereBetween('stat_date', [$startDate->toDateString(), $endDate->toDateString()])
            ->select([
                'stat_date',
                'event_type',
                DB::raw('SUM(count) as total_count'),
            ])
            ->groupBy('stat_date', 'event_type')
            ->orderBy('stat_date')
            ->get();

        // Get item-level breakdown
        $itemStats = DB::table('product_widget_stats_daily')
            ->where('product_widget_id', $widget->id)
            ->whereBetween('stat_date', [$startDate->toDateString(), $endDate->toDateString()])
            ->select([
                'product_widget_item_id',
                'event_type',
                DB::raw('SUM(count) as total_count'),
            ])
            ->groupBy('product_widget_item_id', 'event_type')
            ->orderByDesc('total_count')
            ->get();

        // Get shop/locale breakdown
        $shopLocaleStats = DB::table('product_widget_stats_daily')
            ->where('product_widget_id', $widget->id)
            ->whereBetween('stat_date', [$startDate->toDateString(), $endDate->toDateString()])
            ->select([
                'shop_id',
                'locale',
                'event_type',
                DB::raw('SUM(count) as total_count'),
            ])
            ->groupBy('shop_id', 'locale', 'event_type')
            ->orderByDesc('total_count')
            ->get();

        // Calculate totals
        $totalImpressions = $dailyStats->where('event_type', 'impression')->sum('total_count');
        $totalClicks = $dailyStats->where('event_type', 'click')->sum('total_count');
        $ctr = $totalImpressions > 0 ? round(($totalClicks / $totalImpressions) * 100, 2) : 0;

        return response()->json([
            'widget_id' => $widget->id,
            'widget_name' => $widget->name,
            'period' => [
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'days' => $startDate->diffInDays($endDate) + 1,
            ],
            'summary' => [
                'total_impressions' => $totalImpressions,
                'total_clicks' => $totalClicks,
                'ctr_percentage' => $ctr,
            ],
            'daily_stats' => $dailyStats->groupBy('stat_date')->map(function ($group, $date) {
                return [
                    'date' => $date,
                    'impressions' => $group->where('event_type', 'impression')->first()->total_count ?? 0,
                    'clicks' => $group->where('event_type', 'click')->first()->total_count ?? 0,
                ];
            })->values(),
            'item_stats' => $itemStats->groupBy('product_widget_item_id')->map(function ($group, $itemId) {
                $impressions = $group->where('event_type', 'impression')->first()->total_count ?? 0;
                $clicks = $group->where('event_type', 'click')->first()->total_count ?? 0;
                $ctr = $impressions > 0 ? round(($clicks / $impressions) * 100, 2) : 0;

                return [
                    'item_id' => $itemId,
                    'impressions' => $impressions,
                    'clicks' => $clicks,
                    'ctr_percentage' => $ctr,
                ];
            })->values()->sortByDesc('clicks')->values(),
            'shop_locale_stats' => $shopLocaleStats->groupBy(function ($item) {
                return $item->shop_id . '|' . $item->locale;
            })->map(function ($group) {
                $first = $group->first();
                $impressions = $group->where('event_type', 'impression')->first()->total_count ?? 0;
                $clicks = $group->where('event_type', 'click')->first()->total_count ?? 0;
                $ctr = $impressions > 0 ? round(($clicks / $impressions) * 100, 2) : 0;

                return [
                    'shop_id' => $first->shop_id,
                    'locale' => $first->locale,
                    'impressions' => $impressions,
                    'clicks' => $clicks,
                    'ctr_percentage' => $ctr,
                ];
            })->values()->sortByDesc('impressions')->values(),
        ]);
    }

    /**
     * Get top performing widgets across all widgets
     * GET /api/pim/widgets/analytics/top
     */
    public function top(Request $request)
    {
        $validated = $request->validate([
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
            'shop_id' => ['nullable', 'integer'],
            'locale' => ['nullable', 'string'],
        ]);

        $startDate = isset($validated['start_date']) 
            ? Carbon::parse($validated['start_date']) 
            : Carbon::now()->subDays(30);
        
        $endDate = isset($validated['end_date']) 
            ? Carbon::parse($validated['end_date']) 
            : Carbon::now();

        $limit = $validated['limit'] ?? 10;

        $query = DB::table('product_widget_stats_daily')
            ->whereBetween('stat_date', [$startDate->toDateString(), $endDate->toDateString()]);

        if (isset($validated['shop_id'])) {
            $query->where('shop_id', $validated['shop_id']);
        }

        if (isset($validated['locale'])) {
            $query->where('locale', $validated['locale']);
        }

        $stats = $query
            ->select([
                'product_widget_id',
                'event_type',
                DB::raw('SUM(count) as total_count'),
            ])
            ->groupBy('product_widget_id', 'event_type')
            ->get();

        $topWidgets = $stats->groupBy('product_widget_id')->map(function ($group, $widgetId) {
            $impressions = $group->where('event_type', 'impression')->first()->total_count ?? 0;
            $clicks = $group->where('event_type', 'click')->first()->total_count ?? 0;
            $ctr = $impressions > 0 ? round(($clicks / $impressions) * 100, 2) : 0;

            return [
                'widget_id' => $widgetId,
                'impressions' => $impressions,
                'clicks' => $clicks,
                'ctr_percentage' => $ctr,
            ];
        })->sortByDesc('impressions')->take($limit)->values();

        // Enhance with widget details
        $widgetIds = $topWidgets->pluck('widget_id')->filter();
        $widgets = ProductWidget::whereIn('id', $widgetIds)->get()->keyBy('id');

        $enriched = $topWidgets->map(function ($stat) use ($widgets) {
            $widget = $widgets->get($stat['widget_id']);
            
            return array_merge($stat, [
                'widget_name' => $widget?->name,
                'widget_public_token' => $widget?->public_token,
                'widget_locale' => $widget?->locale,
                'widget_shop_id' => $widget?->shop_id,
            ]);
        });

        return response()->json([
            'period' => [
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'days' => $startDate->diffInDays($endDate) + 1,
            ],
            'filters' => [
                'shop_id' => $validated['shop_id'] ?? null,
                'locale' => $validated['locale'] ?? null,
            ],
            'top_widgets' => $enriched,
        ]);
    }
}
