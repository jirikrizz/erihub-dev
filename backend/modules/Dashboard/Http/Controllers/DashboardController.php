<?php

namespace Modules\Dashboard\Http\Controllers;

use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Modules\Core\Services\CurrencyConverter;
use Modules\Customers\Models\Customer;
use Modules\Dashboard\Http\Resources\DashboardSummaryResource;
use Modules\Dashboard\Support\DashboardSummary;
use Modules\Orders\Models\Order;
use Modules\Orders\Models\OrderItem;
use Modules\Orders\Support\OrderLocationAggregator;
use Modules\Orders\Support\OrderStatusResolver;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Models\ShoptetWebhookJob;

class DashboardController extends Controller
{
    public function __construct(
        private readonly CurrencyConverter $currencyConverter,
        private readonly OrderStatusResolver $orderStatusResolver,
        private readonly OrderLocationAggregator $orderLocationAggregator,
    ) {
    }

    public function summary(Request $request): JsonResponse
    {
        $now = CarbonImmutable::now();
        [$from, $to, $rangeSelection] = $this->resolveRange($request->input('range'), $now);

        $shopIds = array_values(array_filter(array_map(
            static fn ($id) => is_numeric($id) ? (int) $id : null,
            (array) $request->input('shop_ids', [])
        ), static fn (?int $id) => $id !== null));
        $providers = $this->parseProviders($request->input('providers'));
        $providerColumnAvailable = Shop::hasProviderColumn();

        if ($providers !== [] && $providerColumnAvailable) {
            $providerShopIds = Shop::query()
                ->whereIn('provider', $providers)
                ->pluck('id')
                ->all();

            $shopIds = array_values(array_unique(array_merge($shopIds, $providerShopIds)));
        }

        $ordersBaseQuery = Order::query()
            ->whereBetween('ordered_at', [$from, $to]);

        if ($shopIds !== []) {
            $ordersBaseQuery->whereIn('shop_id', $shopIds);
        }

        $ordersQuery = (clone $ordersBaseQuery);
        $this->orderStatusResolver->applyCompletedFilter($ordersQuery);

        $ordersCount = (clone $ordersQuery)->count();
        $ordersWithTotals = (clone $ordersQuery)->whereNotNull('total_with_vat');

        $perCurrencyTotals = $ordersWithTotals
            ->selectRaw('currency_code, COUNT(*) as orders_count, SUM(total_with_vat) as total_amount, SUM(total_with_vat_base) as total_amount_base')
            ->groupBy('currency_code')
            ->get();

        $revenueBase = 0.0;
        $revenueByCurrency = [];

        foreach ($perCurrencyTotals as $row) {
            $currency = $row->currency_code ?? $this->currencyConverter->getBaseCurrency();
            $ordersForCurrency = (int) ($row->orders_count ?? 0);
            $amount = (float) ($row->total_amount ?? 0.0);
            $amountBase = $row->total_amount_base !== null
                ? (float) $row->total_amount_base
                : ($this->currencyConverter->convertToBase($amount, $currency) ?? 0.0);

            $revenueBase += $amountBase;

            $revenueByCurrency[] = [
                'currency' => $currency,
                'orders_count' => $ordersForCurrency,
                'total_amount' => $amount,
                'total_amount_base' => $amountBase,
            ];
        }

        $averageOrderValue = $ordersCount > 0 ? round($revenueBase / $ordersCount, 2) : 0.0;
        $guestOrders = (clone $ordersQuery)->whereNull('customer_email')->count();

        $orderItemsBaseQuery = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereBetween('orders.ordered_at', [$from, $to]);

        if ($shopIds !== []) {
            $orderItemsBaseQuery->whereIn('orders.shop_id', $shopIds);
        }

        $this->orderStatusResolver->applyCompletedFilter($orderItemsBaseQuery, 'orders.status');

        $itemsSold = (float) (clone $orderItemsBaseQuery)
            ->whereIn('order_items.item_type', ['product', 'product-set'])
            ->sum('order_items.amount');

        $newCustomersQuery = Customer::query()
            ->whereBetween('created_at', [$from, $to]);

        if ($shopIds !== []) {
            $newCustomersQuery->whereIn('shop_id', $shopIds);
        }

        $newCustomers = $newCustomersQuery->count();

        $activeCustomerEmails = (clone $ordersQuery)
            ->whereNotNull('customer_email')
            ->pluck('customer_email')
            ->filter()
            ->unique();

        $returningCustomers = 0;

        if ($activeCustomerEmails->isNotEmpty()) {
            $returningCustomers = Order::query()
                ->whereNotNull('customer_email')
                ->whereIn('customer_email', $activeCustomerEmails)
                ->where('ordered_at', '<', $from)
                ->when($shopIds !== [], fn ($query) => $query->whereIn('shop_id', $shopIds))
                ->distinct('customer_email')
                ->count('customer_email');
        }

        $customersRepeatRatio = $activeCustomerEmails->count() > 0
            ? $returningCustomers / max($activeCustomerEmails->count(), 1)
            : 0.0;

        $ordersByShopRows = (clone $ordersQuery)
            ->get(['shop_id', 'currency_code', 'total_with_vat', 'total_with_vat_base']);

        $shopMetaQuery = Shop::query()
            ->whereIn(
                'id',
                $ordersByShopRows
                    ->pluck('shop_id')
                    ->filter()
                    ->map(static fn ($id) => (int) $id)
                    ->unique()
            );

        $shopColumns = ['id', 'name', 'domain', 'currency_code'];
        if ($providerColumnAvailable) {
            $shopColumns[] = 'provider';
        }

        $shopMeta = $shopMetaQuery
            ->get($shopColumns)
            ->keyBy('id');

        $topShops = $ordersByShopRows
            ->groupBy('shop_id')
            ->map(function (Collection $rows, $shopIdKey) use ($shopMeta, $providerColumnAvailable) {
                $shopId = is_numeric($shopIdKey) ? (int) $shopIdKey : null;
                $ordersCount = $rows->count();
                $revenueBase = 0.0;

                foreach ($rows as $row) {
                    $baseAmount = null;

                    if ($row->total_with_vat_base !== null) {
                        $baseAmount = (float) $row->total_with_vat_base;
                    } elseif ($row->total_with_vat !== null) {
                        $baseAmount = $this->currencyConverter->convertToBase(
                            (float) $row->total_with_vat,
                            $row->currency_code
                        );
                    }

                    $revenueBase += $baseAmount ?? 0.0;
                }

                $shop = $shopId !== null ? $shopMeta->get($shopId) : null;

                return [
                    'shop_id' => $shopId,
                    'shop_name' => $shop?->name ?? $shop?->domain ?? ($shopId !== null ? "Shop {$shopId}" : null),
                    'orders_count' => $ordersCount,
                    'revenue_base' => round($revenueBase, 2),
                    'provider' => $providerColumnAvailable ? ($shop?->provider ?? null) : null,
                ];
            })
            ->filter(static fn (array $row) => $row['orders_count'] > 0)
            ->sortByDesc('revenue_base')
            ->take(5)
            ->values()
            ->all();

        $topProductsQuery = (clone $orderItemsBaseQuery)
            ->whereIn('order_items.item_type', ['product', 'product-set'])
            ->whereNotNull('order_items.code')
            ->whereRaw("order_items.code <> ''");

        $topProductsRows = $topProductsQuery
            ->groupBy('orders.shop_id', 'order_items.code')
            ->selectRaw('orders.shop_id, order_items.code, MAX(order_items.name) as name, SUM(order_items.amount) as quantity')
            ->orderByDesc('quantity')
            ->limit(6)
            ->get();

        $topProducts = $this->mapTopProducts($topProductsRows, $shopMeta, $providerColumnAvailable);

        $paymentNameExpression = "COALESCE(NULLIF(TRIM(orders.payment->'method'->>'name'), ''), NULLIF(TRIM(orders.payment->>'name'), ''), 'Neznámá platba')";

        $paymentMethods = (clone $ordersQuery)
            ->selectRaw("{$paymentNameExpression} as name")
            ->selectRaw('COUNT(*) as orders_count')
            ->groupByRaw($paymentNameExpression)
            ->orderByDesc('orders_count')
            ->limit(10)
            ->get()
            ->map(fn ($row) => [
                'name' => $row->name ?? 'Neznámá platba',
                'orders_count' => (int) ($row->orders_count ?? 0),
            ])
            ->all();

        $shippingNameExpression = "COALESCE(NULLIF(TRIM(orders.shipping->'method'->>'name'), ''), NULLIF(TRIM(orders.shipping->>'name'), ''), 'Neznámá doprava')";

        $shippingMethods = (clone $ordersQuery)
            ->selectRaw("{$shippingNameExpression} as name")
            ->selectRaw('COUNT(*) as orders_count')
            ->groupByRaw($shippingNameExpression)
            ->orderByDesc('orders_count')
            ->limit(10)
            ->get()
            ->map(fn ($row) => [
                'name' => $row->name ?? 'Neznámá doprava',
                'orders_count' => (int) ($row->orders_count ?? 0),
            ])
            ->all();

        $topLocations = $this->orderLocationAggregator->getTopLocations(
            ordersQuery: $ordersQuery,
            orderItemsQuery: $orderItemsBaseQuery,
            limit: 8
        );

        $couponExpression = "COALESCE(NULLIF(order_items.code, ''), order_items.data->>'code', order_items.name, '—')";

        $couponUsage = (clone $orderItemsBaseQuery)
            ->where('order_items.item_type', 'discount-coupon')
            ->selectRaw("{$couponExpression} as identifier")
            ->selectRaw('MAX(order_items.code) as code')
            ->selectRaw('MAX(order_items.name) as name')
            ->selectRaw('SUM(order_items.amount)::int as uses')
            ->groupByRaw($couponExpression)
            ->orderByDesc('uses')
            ->limit(10)
            ->get()
            ->map(fn ($row) => [
                'code' => $row->code !== null && $row->code !== '' ? $row->code : ($row->identifier ?? '—'),
                'name' => $row->name,
                'uses' => (int) ($row->uses ?? 0),
            ])
            ->all();

        $statusExpression = "COALESCE(status, 'Neznámý stav')";

        $statusBreakdown = (clone $ordersBaseQuery)
            ->selectRaw("{$statusExpression} as status")
            ->selectRaw('COUNT(*) as orders_count')
            ->groupByRaw($statusExpression)
            ->orderByDesc('orders_count')
            ->limit(10)
            ->get()
            ->map(fn ($row) => [
                'status' => $row->status,
                'orders_count' => (int) ($row->orders_count ?? 0),
            ])
            ->all();

        $webhookQuery = ShoptetWebhookJob::query()
            ->whereBetween('created_at', [$from, $to]);

        $webhooksTotal = (clone $webhookQuery)->count();
        $webhooksProcessed = (clone $webhookQuery)->where('status', 'finished')->count();
        $webhooksFailed = (clone $webhookQuery)->where('status', 'failed')->count();

        $failedJobs = (int) DB::table('failed_jobs')
            ->whereBetween('failed_at', [$from, $to])
            ->count();

        $comparison = $this->buildComparisonMetrics($from, $to, $shopIds, $rangeSelection);

        $summary = new DashboardSummary(
            from: $from,
            to: $to,
            rangeSelection: $rangeSelection,
            baseCurrency: $this->currencyConverter->getBaseCurrency(),
            totals: [
                'orders' => $ordersCount,
                'revenue_base' => round($revenueBase, 2),
                'average_order_value_base' => $averageOrderValue,
                'items_sold' => round($itemsSold, 2),
                'new_customers' => $newCustomers,
                'active_customers' => $activeCustomerEmails->count(),
                'returning_customers' => $returningCustomers,
                'guest_orders' => $guestOrders,
                'returning_customers_share' => $customersRepeatRatio,
            ],
            revenueByCurrency: $revenueByCurrency,
            topShops: $topShops,
            topProducts: $topProducts,
            topLocations: $topLocations,
            paymentMethods: $paymentMethods,
            shippingMethods: $shippingMethods,
            couponUsage: $couponUsage,
            statusBreakdown: $statusBreakdown,
            sync: [
                'webhooks_total' => $webhooksTotal,
                'webhooks_processed' => $webhooksProcessed,
                'webhooks_failed' => $webhooksFailed,
                'failed_jobs' => $failedJobs,
            ],
            comparison: $comparison,
        );

        return DashboardSummaryResource::make($summary)->response();
    }

    private function buildComparisonMetrics(
        CarbonImmutable $currentFrom,
        CarbonImmutable $currentTo,
        array $shopIds,
        string $rangeSelection
    ): ?array
    {
        $from = $currentFrom->subYear();
        $to = $currentTo->subYear();

        $ordersBaseQuery = Order::query()
            ->whereBetween('ordered_at', [$from, $to]);

        if ($shopIds !== []) {
            $ordersBaseQuery->whereIn('shop_id', $shopIds);
        }

        $ordersQuery = (clone $ordersBaseQuery);
        $this->orderStatusResolver->applyCompletedFilter($ordersQuery);

        $ordersCount = (clone $ordersQuery)->count();
        $ordersWithTotals = (clone $ordersQuery)->whereNotNull('total_with_vat');

        $perCurrencyTotals = $ordersWithTotals
            ->selectRaw('currency_code, COUNT(*) as orders_count, SUM(total_with_vat) as total_amount, SUM(total_with_vat_base) as total_amount_base')
            ->groupBy('currency_code')
            ->get();

        $revenueBase = 0.0;

        foreach ($perCurrencyTotals as $row) {
            $currency = $row->currency_code ?? $this->currencyConverter->getBaseCurrency();
            $amount = (float) ($row->total_amount ?? 0.0);
            $amountBase = $row->total_amount_base !== null
                ? (float) $row->total_amount_base
                : ($this->currencyConverter->convertToBase($amount, $currency) ?? 0.0);

            $revenueBase += $amountBase;
        }

        $averageOrderValue = $ordersCount > 0 ? round($revenueBase / $ordersCount, 2) : 0.0;
        $guestOrders = (clone $ordersQuery)->whereNull('customer_email')->count();

        $orderItemsQuery = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereBetween('orders.ordered_at', [$from, $to]);

        if ($shopIds !== []) {
            $orderItemsQuery->whereIn('orders.shop_id', $shopIds);
        }

        $this->orderStatusResolver->applyCompletedFilter($orderItemsQuery, 'orders.status');

        $itemsSold = (float) (clone $orderItemsQuery)
            ->whereIn('order_items.item_type', ['product', 'product-set'])
            ->sum('order_items.amount');

        $newCustomersQuery = Customer::query()
            ->whereBetween('created_at', [$from, $to]);

        if ($shopIds !== []) {
            $newCustomersQuery->whereIn('shop_id', $shopIds);
        }

        $newCustomers = $newCustomersQuery->count();

        $activeCustomerEmails = (clone $ordersQuery)
            ->whereNotNull('customer_email')
            ->pluck('customer_email')
            ->filter()
            ->unique();

        $returningCustomers = 0;

        if ($activeCustomerEmails->isNotEmpty()) {
            $returningCustomers = Order::query()
                ->whereNotNull('customer_email')
                ->whereIn('customer_email', $activeCustomerEmails)
                ->where('ordered_at', '<', $from)
                ->when($shopIds !== [], fn ($query) => $query->whereIn('shop_id', $shopIds))
                ->distinct('customer_email')
                ->count('customer_email');
        }

        $customersRepeatRatio = $activeCustomerEmails->count() > 0
            ? $returningCustomers / max($activeCustomerEmails->count(), 1)
            : 0.0;

        return [
            'selection' => $rangeSelection,
            'range' => [
                'from' => $from->toIso8601String(),
                'to' => $to->toIso8601String(),
                'timezone' => $to->getTimezone()->getName(),
            ],
            'totals' => [
                'orders' => $ordersCount,
                'revenue_base' => round($revenueBase, 2),
                'average_order_value_base' => $averageOrderValue,
                'items_sold' => round($itemsSold, 2),
                'new_customers' => $newCustomers,
                'active_customers' => $activeCustomerEmails->count(),
                'returning_customers' => $returningCustomers,
                'guest_orders' => $guestOrders,
                'returning_customers_share' => $customersRepeatRatio,
            ],
            'returning_customers_share' => $customersRepeatRatio,
        ];
    }

    /**
     * @return array{0:CarbonImmutable, 1:CarbonImmutable, 2:string}
     */
    private function resolveRange(mixed $selection, CarbonImmutable $now): array
    {
        $normalized = is_string($selection) ? strtolower($selection) : null;

        return match ($normalized) {
            'today' => [$now->startOfDay(), $now, 'today'],
            'yesterday' => (function () use ($now) {
                $yesterday = $now->subDay();

                return [$yesterday->startOfDay(), $yesterday->endOfDay(), 'yesterday'];
            })(),
            default => [$now->subDay(), $now, 'last_24h'],
        };
    }
    /**
     * @param Collection<int, object{shop_id: int|null, code: string|null, name: string|null, quantity: string|float|int|null}> $rows
     * @param Collection<int, \Modules\Shoptet\Models\Shop> $shopMeta
     * @return array<int, array<string, mixed>>
     */
    private function mapTopProducts(Collection $rows, Collection $shopMeta, bool $providerColumnAvailable): array
    {
        return $rows->map(function ($row) use ($shopMeta, $providerColumnAvailable) {
            $shopId = $row->shop_id !== null ? (int) $row->shop_id : null;
            $shop = $shopId !== null ? $shopMeta->get($shopId) : null;

            return [
                'shop_id' => $shopId,
                'shop_name' => $shop?->name ?? $shop?->domain ?? ($shopId !== null ? "Shop {$shopId}" : null),
                'provider' => $providerColumnAvailable ? ($shop?->provider ?? null) : null,
                'code' => $row->code,
                'name' => $row->name ?? ($row->code ? "Produkt {$row->code}" : 'Bez názvu'),
                'quantity' => round((float) ($row->quantity ?? 0.0), 2),
            ];
        })->all();
    }

    private function parseProviders(mixed $value): array
    {
        if ($value === null || $value === '') {
            return [];
        }

        $values = is_array($value) ? $value : explode(',', (string) $value);

        return array_values(array_filter(array_map(function ($item) {
            if (! is_string($item)) {
                return null;
            }

            $trimmed = strtolower(trim($item));

            return $trimmed !== '' ? $trimmed : null;
        }, $values), static fn ($provider) => $provider !== null));
    }
}
