<?php

namespace Modules\Inventory\Services;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Modules\Core\Services\CurrencyConverter;
use Modules\Inventory\Models\InventoryVariantMetric;
use Modules\Orders\Models\OrderItem;
use Modules\Orders\Support\OrderStatusResolver;
use Modules\Pim\Models\ProductVariant;
use Modules\Shoptet\Models\Shop;

class InventoryMetricsService
{
    public function __construct(
        private readonly CurrencyConverter $currencyConverter,
        private readonly OrderStatusResolver $orderStatusResolver
    )
    {
    }

    /**
     * @return array{
     *     lifetime_orders_count:int,
     *     lifetime_quantity:float,
     *     lifetime_revenue:float,
     *     last_30_orders_count:int,
     *     last_30_quantity:float,
     *     last_30_revenue:float,
     *     last_90_orders_count:int,
     *     last_90_quantity:float,
     *     last_90_revenue:float,
     *     average_daily_sales:float,
     *     stock_runway_days:float|null,
     *     last_sale_at:?CarbonImmutable,
     *     metrics_updated_at:?CarbonImmutable,
     *     currency_code:?string
     * }
     */
    public function getOrRecalculate(ProductVariant $variant, bool $force = false): array
    {
        $variant->loadMissing(['product', 'product.shop']);

        if ($force) {
            return $this->recalculate($variant);
        }

        $metric = InventoryVariantMetric::query()
            ->with('shop:id,currency_code')
            ->where('product_variant_id', $variant->id)
            ->where('shop_id', $variant->product?->shop_id)
            ->first();

        if (! $metric) {
            return $this->recalculate($variant);
        }

        return [
            'lifetime_orders_count' => (int) $metric->lifetime_orders_count,
            'lifetime_quantity' => (float) $metric->lifetime_quantity,
            'lifetime_revenue' => (float) $metric->lifetime_revenue,
            'last_30_orders_count' => (int) $metric->last_30_orders_count,
            'last_30_quantity' => (float) $metric->last_30_quantity,
            'last_30_revenue' => (float) $metric->last_30_revenue,
            'last_90_orders_count' => (int) $metric->last_90_orders_count,
            'last_90_quantity' => (float) $metric->last_90_quantity,
            'last_90_revenue' => (float) $metric->last_90_revenue,
            'average_daily_sales' => (float) ($metric->average_daily_sales ?? 0.0),
            'stock_runway_days' => $metric->stock_runway_days,
            'last_sale_at' => $metric->last_sale_at ? CarbonImmutable::parse($metric->last_sale_at) : null,
            'metrics_updated_at' => $metric->updated_at ? CarbonImmutable::parse($metric->updated_at) : null,
            'currency_code' => $metric->shop?->currency_code
                ?? $variant->product?->shop?->currency_code
                ?? $variant->currency_code,
        ];
    }

    public function recalculate(ProductVariant $variant): array
    {
        $variant->loadMissing(['product', 'product.shop']);

        $shopIds = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('order_items.code', $variant->code)
            ->when(true, fn ($query) => $this->applyCompletedOrderFilter($query, 'orders.status'))
            ->select('orders.shop_id')
            ->distinct()
            ->pluck('orders.shop_id')
            ->filter()
            ->map(fn ($value) => (int) $value)
            ->values();

        $processed = [];

        foreach ($shopIds as $shopId) {
            $metrics = $this->computeMetrics($variant, $shopId);

            InventoryVariantMetric::query()->updateOrCreate(
                [
                    'product_variant_id' => $variant->id,
                    'shop_id' => $shopId,
                ],
                [
                    'lifetime_orders_count' => $metrics['lifetime_orders_count'],
                    'lifetime_quantity' => $metrics['lifetime_quantity'],
                    'lifetime_revenue' => $metrics['lifetime_revenue'],
                    'last_30_orders_count' => $metrics['last_30_orders_count'],
                    'last_30_quantity' => $metrics['last_30_quantity'],
                    'last_30_revenue' => $metrics['last_30_revenue'],
                    'last_90_orders_count' => $metrics['last_90_orders_count'],
                    'last_90_quantity' => $metrics['last_90_quantity'],
                    'last_90_revenue' => $metrics['last_90_revenue'],
                    'average_daily_sales' => $metrics['average_daily_sales'],
                    'stock_runway_days' => $metrics['stock_runway_days'],
                    'last_sale_at' => $metrics['last_sale_at']?->toDateTimeString(),
                ]
            );

            $processed[] = $shopId;
        }

        if ($processed === []) {
            InventoryVariantMetric::query()
                ->where('product_variant_id', $variant->id)
                ->delete();
        } else {
            InventoryVariantMetric::query()
                ->where('product_variant_id', $variant->id)
                ->whereNotIn('shop_id', $processed)
                ->delete();
        }

        return $this->summarize($variant);
    }

    public function summarize(ProductVariant $variant, ?array $shopIds = null): array
    {
        $variant->loadMissing(['product', 'product.shop']);

        $metrics = InventoryVariantMetric::query()
            ->with('shop:id,currency_code')
            ->where('product_variant_id', $variant->id)
            ->when($shopIds !== null && $shopIds !== [], fn ($query) => $query->whereIn('shop_id', $shopIds))
            ->get();

        if ($metrics->isEmpty()) {
            return [
                'lifetime_orders_count' => 0,
                'lifetime_quantity' => 0.0,
                'lifetime_revenue' => 0.0,
                'last_30_orders_count' => 0,
                'last_30_quantity' => 0.0,
                'last_30_revenue' => 0.0,
                'last_90_orders_count' => 0,
                'last_90_quantity' => 0.0,
                'last_90_revenue' => 0.0,
                'average_daily_sales' => 0.0,
                'stock_runway_days' => null,
                'last_sale_at' => null,
                'metrics_updated_at' => null,
                'currency_code' => $variant->product?->shop?->currency_code ?? $variant->currency_code,
            ];
        }

        $baseCurrency = $this->currencyConverter->getBaseCurrency();
        $currencyTotals = [];

        $aggregateCounts = [
            'lifetime_orders_count' => 0,
            'lifetime_quantity' => 0.0,
            'last_30_orders_count' => 0,
            'last_30_quantity' => 0.0,
            'last_90_orders_count' => 0,
            'last_90_quantity' => 0.0,
        ];

        $lastSaleAt = null;
        $updatedAt = null;

        foreach ($metrics as $metric) {
            $currency = $metric->shop?->currency_code
                ?? $variant->product?->shop?->currency_code
                ?? $variant->currency_code
                ?? $baseCurrency;

            $currencyTotals[$currency]['lifetime_revenue'] = ($currencyTotals[$currency]['lifetime_revenue'] ?? 0.0) + (float) ($metric->lifetime_revenue ?? 0.0);
            $currencyTotals[$currency]['last_30_revenue'] = ($currencyTotals[$currency]['last_30_revenue'] ?? 0.0) + (float) ($metric->last_30_revenue ?? 0.0);
            $currencyTotals[$currency]['last_90_revenue'] = ($currencyTotals[$currency]['last_90_revenue'] ?? 0.0) + (float) ($metric->last_90_revenue ?? 0.0);

            $aggregateCounts['lifetime_orders_count'] += (int) ($metric->lifetime_orders_count ?? 0);
            $aggregateCounts['lifetime_quantity'] += (float) ($metric->lifetime_quantity ?? 0.0);
            $aggregateCounts['last_30_orders_count'] += (int) ($metric->last_30_orders_count ?? 0);
            $aggregateCounts['last_30_quantity'] += (float) ($metric->last_30_quantity ?? 0.0);
            $aggregateCounts['last_90_orders_count'] += (int) ($metric->last_90_orders_count ?? 0);
            $aggregateCounts['last_90_quantity'] += (float) ($metric->last_90_quantity ?? 0.0);

            if ($metric->last_sale_at) {
                $candidate = CarbonImmutable::parse($metric->last_sale_at);
                if (! $lastSaleAt || $candidate->greaterThan($lastSaleAt)) {
                    $lastSaleAt = $candidate;
                }
            }

            if ($metric->updated_at) {
                $candidate = CarbonImmutable::parse($metric->updated_at);
                if (! $updatedAt || $candidate->greaterThan($updatedAt)) {
                    $updatedAt = $candidate;
                }
            }
        }

        $distinctCurrencies = array_keys($currencyTotals);

        if (count($distinctCurrencies) === 1) {
            $currency = $distinctCurrencies[0];
            $financialTotals = $currencyTotals[$currency];
        } else {
            $financialTotals = [
                'lifetime_revenue' => 0.0,
                'last_30_revenue' => 0.0,
                'last_90_revenue' => 0.0,
            ];

            foreach ($currencyTotals as $currency => $totals) {
                $financialTotals['lifetime_revenue'] += $this->currencyConverter->convertToBase($totals['lifetime_revenue'] ?? 0.0, $currency);
                $financialTotals['last_30_revenue'] += $this->currencyConverter->convertToBase($totals['last_30_revenue'] ?? 0.0, $currency);
                $financialTotals['last_90_revenue'] += $this->currencyConverter->convertToBase($totals['last_90_revenue'] ?? 0.0, $currency);
            }

            $currency = $baseCurrency;
        }

        $averageDailySales = $aggregateCounts['last_30_quantity'] > 0
            ? $aggregateCounts['last_30_quantity'] / 30
            : 0.0;

        $stock = (float) ($variant->stock ?? 0.0);
        $stockRunway = $averageDailySales > 0 && $stock > 0
            ? $stock / $averageDailySales
            : null;

        return [
            'lifetime_orders_count' => $aggregateCounts['lifetime_orders_count'],
            'lifetime_quantity' => $aggregateCounts['lifetime_quantity'],
            'lifetime_revenue' => (float) ($financialTotals['lifetime_revenue'] ?? 0.0),
            'last_30_orders_count' => $aggregateCounts['last_30_orders_count'],
            'last_30_quantity' => $aggregateCounts['last_30_quantity'],
            'last_30_revenue' => (float) ($financialTotals['last_30_revenue'] ?? 0.0),
            'last_90_orders_count' => $aggregateCounts['last_90_orders_count'],
            'last_90_quantity' => $aggregateCounts['last_90_quantity'],
            'last_90_revenue' => (float) ($financialTotals['last_90_revenue'] ?? 0.0),
            'average_daily_sales' => $averageDailySales,
            'stock_runway_days' => $stockRunway,
            'last_sale_at' => $lastSaleAt,
            'metrics_updated_at' => $updatedAt,
            'currency_code' => $currency,
        ];
    }

    public function metricsByShop(ProductVariant $variant, ?array $shopIds = null)
    {
        $variant->loadMissing(['product', 'product.shop']);

        $query = InventoryVariantMetric::query()
            ->with('shop:id,name,domain,currency_code')
            ->where('product_variant_id', $variant->id);

        if ($shopIds !== null && $shopIds !== []) {
            $query->whereIn('shop_id', $shopIds);
        }

        return $query->get()->map(function (InventoryVariantMetric $metric) use ($variant) {
            $last30Quantity = (float) ($metric->last_30_quantity ?? 0.0);
            $averageDailySales = $last30Quantity > 0 ? $last30Quantity / 30 : 0.0;
            $stock = (float) ($variant->stock ?? 0.0);
            $stockRunway = ($averageDailySales > 0 && $stock > 0)
                ? $stock / $averageDailySales
                : null;

            return [
                'shop_id' => $metric->shop_id,
                'shop' => $metric->shop,
                'summaries' => [
                    'last_30_days' => [
                        'orders_count' => (int) ($metric->last_30_orders_count ?? 0),
                        'quantity' => (float) ($metric->last_30_quantity ?? 0.0),
                        'revenue' => (float) ($metric->last_30_revenue ?? 0.0),
                    ],
                    'last_90_days' => [
                        'orders_count' => (int) ($metric->last_90_orders_count ?? 0),
                        'quantity' => (float) ($metric->last_90_quantity ?? 0.0),
                        'revenue' => (float) ($metric->last_90_revenue ?? 0.0),
                    ],
                    'lifetime' => [
                        'orders_count' => (int) ($metric->lifetime_orders_count ?? 0),
                        'quantity' => (float) ($metric->lifetime_quantity ?? 0.0),
                        'revenue' => (float) ($metric->lifetime_revenue ?? 0.0),
                    ],
                ],
                'average_daily_sales' => $averageDailySales,
                'stock_runway_days' => $stockRunway,
                'last_sale_at' => $metric->last_sale_at?->toIso8601String(),
                'metrics_updated_at' => $metric->updated_at?->toIso8601String(),
                'currency_code' => $metric->shop?->currency_code
                    ?? $variant->product?->shop?->currency_code
                    ?? $variant->currency_code,
            ];
        });
    }

    public function recalculateForVariants(array $variantIds): void
    {
        $ids = collect($variantIds)
            ->filter(fn ($value) => is_string($value) && $value !== '')
            ->unique()
            ->values();

        if ($ids->isEmpty()) {
            return;
        }

        foreach ($ids->chunk(50) as $chunk) {
            $variants = ProductVariant::query()
                ->whereIn('id', $chunk->all())
                ->with('product')
                ->get();

            $variants->each(fn (ProductVariant $variant) => $this->recalculate($variant));
        }
    }

    private function computeMetrics(ProductVariant $variant, ?int $shopId): array
    {
        $query = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('order_items.code', $variant->code);

        $this->applyCompletedOrderFilter($query, 'orders.status');

        if ($shopId !== null) {
            $query->where('orders.shop_id', $shopId);
        }

        $lifetime = (clone $query)
            ->select([
                DB::raw('COUNT(DISTINCT orders.id) as orders_count'),
                DB::raw('COALESCE(SUM(order_items.amount), 0) as quantity'),
                DB::raw('COALESCE(SUM(order_items.price_with_vat), 0) as revenue'),
            ])
            ->first();

        $last30 = (clone $query)
            ->where('orders.ordered_at', '>=', CarbonImmutable::now()->subDays(30))
            ->select([
                DB::raw('COUNT(DISTINCT orders.id) as orders_count'),
                DB::raw('COALESCE(SUM(order_items.amount), 0) as quantity'),
                DB::raw('COALESCE(SUM(order_items.price_with_vat), 0) as revenue'),
            ])
            ->first();

        $last90 = (clone $query)
            ->where('orders.ordered_at', '>=', CarbonImmutable::now()->subDays(90))
            ->select([
                DB::raw('COUNT(DISTINCT orders.id) as orders_count'),
                DB::raw('COALESCE(SUM(order_items.amount), 0) as quantity'),
                DB::raw('COALESCE(SUM(order_items.price_with_vat), 0) as revenue'),
            ])
            ->first();

        $lastSaleAtValue = (clone $query)
            ->whereNotNull('orders.ordered_at')
            ->orderByDesc('orders.ordered_at')
            ->value('orders.ordered_at');

        $lastSaleAt = $lastSaleAtValue ? CarbonImmutable::parse($lastSaleAtValue) : null;

        $last30Quantity = (float) ($last30?->quantity ?? 0.0);
        $averageDailySales = $last30Quantity > 0 ? $last30Quantity / 30 : 0.0;
        $stock = (float) ($variant->stock ?? 0.0);
        $stockRunway = ($averageDailySales > 0 && $stock > 0)
            ? $stock / $averageDailySales
            : null;

        return [
            'lifetime_orders_count' => (int) ($lifetime?->orders_count ?? 0),
            'lifetime_quantity' => (float) ($lifetime?->quantity ?? 0.0),
            'lifetime_revenue' => (float) ($lifetime?->revenue ?? 0.0),
            'last_30_orders_count' => (int) ($last30?->orders_count ?? 0),
            'last_30_quantity' => $last30Quantity,
            'last_30_revenue' => (float) ($last30?->revenue ?? 0.0),
            'last_90_orders_count' => (int) ($last90?->orders_count ?? 0),
            'last_90_quantity' => (float) ($last90?->quantity ?? 0.0),
            'last_90_revenue' => (float) ($last90?->revenue ?? 0.0),
            'average_daily_sales' => $averageDailySales,
            'stock_runway_days' => $stockRunway,
            'last_sale_at' => $lastSaleAt,
        ];
    }

    private function applyCompletedOrderFilter(Builder $query, string $column = 'status'): Builder
    {
        return $this->orderStatusResolver->applyCompletedFilter($query, $column);
    }
}
