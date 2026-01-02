<?php

namespace Modules\Analytics\Http\Controllers;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Modules\Core\Services\CurrencyConverter;
use Modules\Customers\Models\Customer;
use Modules\Orders\Models\Order;
use Modules\Orders\Models\OrderItem;
use Modules\Orders\Support\OrderLocationAggregator;
use Modules\Orders\Support\OrderStatusResolver;
use Modules\Pim\Models\Product;
use Modules\Shoptet\Models\ShoptetWebhookJob;

class AnalyticsController extends Controller
{
    public function __construct(
        private readonly CurrencyConverter $currencyConverter,
        private readonly OrderStatusResolver $orderStatusResolver,
        private readonly OrderLocationAggregator $orderLocationAggregator
    )
    {
    }

    public function kpis(Request $request)
    {
        $shopIds = array_values(array_filter(array_map(
            static fn ($id) => is_numeric($id) ? (int) $id : null,
            (array) $request->input('shop_ids', [])
        ), static fn (?int $id) => $id !== null));

        $from = $this->parseDate($request->input('from'));
        $to = $this->parseDate($request->input('to'), true);

        $productsQuery = Product::query();
        $webhooksQuery = ShoptetWebhookJob::query();
        $baseOrdersQuery = Order::query();
        $customersQuery = Customer::query();

        if ($shopIds !== []) {
            $productsQuery->whereIn('shop_id', $shopIds);
            $webhooksQuery->whereIn('shop_id', $shopIds);
            $baseOrdersQuery->whereIn('shop_id', $shopIds);
            $customersQuery->whereIn('shop_id', $shopIds);
        }

        if ($from) {
            $productsQuery->where('created_at', '>=', $from);
            $webhooksQuery->where('created_at', '>=', $from);
            $baseOrdersQuery->where('ordered_at', '>=', $from);
            $customersQuery->where('created_at', '>=', $from);
        }

        if ($to) {
            $productsQuery->where('created_at', '<=', $to);
            $webhooksQuery->where('created_at', '<=', $to);
            $baseOrdersQuery->where('ordered_at', '<=', $to);
            $customersQuery->where('created_at', '<=', $to);
        }

        $ordersQuery = (clone $baseOrdersQuery);
        $this->applyCompletedOrderFilter($ordersQuery);

        // Single optimized query with all aggregations
        $ordersStats = $ordersQuery
            ->selectRaw('
                COUNT(*) as orders_total,
                SUM(CASE WHEN total_with_vat IS NOT NULL THEN 1 ELSE 0 END) as orders_with_total,
                SUM(CASE WHEN total_with_vat IS NOT NULL THEN total_with_vat ELSE 0 END) as orders_total_value,
                SUM(CASE WHEN total_with_vat IS NOT NULL THEN total_with_vat_base ELSE 0 END) as orders_total_value_base
            ')
            ->first();

        $ordersTotal = (int) ($ordersStats->orders_total ?? 0);
        $ordersTotalValue = (float) ($ordersStats->orders_total_value_base ?? 0.0);
        $ordersAverageValue = $ordersTotal > 0 ? $ordersTotalValue / $ordersTotal : 0.0;

        $perCurrencyTotals = (clone $ordersQuery)
            ->whereNotNull('total_with_vat')
            ->selectRaw('currency_code, COUNT(*) as orders_count, SUM(total_with_vat) as total_amount, SUM(total_with_vat_base) as total_amount_base')
            ->groupBy('currency_code')
            ->get();

        $ordersValueByCurrency = [];
        foreach ($perCurrencyTotals as $row) {
            $currency = $row->currency_code ?? $this->currencyConverter->getBaseCurrency();
            $ordersCount = (int) ($row->orders_count ?? 0);
            $totalAmount = (float) ($row->total_amount ?? 0.0);
            $baseAmount = $row->total_amount_base !== null
                ? (float) $row->total_amount_base
                : ($this->currencyConverter->convertToBase($totalAmount, $currency) ?? 0.0);

            $ordersValueByCurrency[] = [
                'currency' => $currency,
                'orders_count' => $ordersCount,
                'total_amount' => $totalAmount,
                'total_amount_base' => $baseAmount,
            ];
        }

        $customerMetrics = $this->buildCustomerMetrics(
            baseOrdersQuery: clone $baseOrdersQuery,
            shopIds: $shopIds,
            completedOrdersTotal: $ordersTotal
        );

        $orderItemsQuery = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id');

        if ($shopIds !== []) {
            $orderItemsQuery->whereIn('orders.shop_id', $shopIds);
        }

        if ($from) {
            $orderItemsQuery->where('orders.ordered_at', '>=', $from);
        }

        if ($to) {
            $orderItemsQuery->where('orders.ordered_at', '<=', $to);
        }

        $this->orderStatusResolver->applyCompletedFilter($orderItemsQuery, 'orders.status');

        $productsSoldTotal = (float) (clone $orderItemsQuery)->sum('order_items.amount');

        return response()->json([
            'products_total' => (clone $productsQuery)->count(),
            'webhooks_downloaded' => (clone $webhooksQuery)->where('status', 'downloaded')->count(),
            'webhooks_failed' => (clone $webhooksQuery)->where('status', 'download_failed')->count(),
            'orders_total' => $ordersTotal,
            'orders_total_value' => (float) $ordersTotalValue,
            'orders_average_value' => (float) $ordersAverageValue,
            'orders_base_currency' => $this->currencyConverter->getBaseCurrency(),
            'orders_value_by_currency' => $ordersValueByCurrency,
            'customers_total' => (clone $customersQuery)->count(),
            'products_sold_total' => $productsSoldTotal,
            'customers_repeat_ratio' => $customerMetrics['customers_repeat_ratio'],
            'returning_customers_total' => $customerMetrics['returning_customers_total'],
            'repeat_customers_period_total' => $customerMetrics['repeat_customers_period_total'],
            'unique_customers_total' => $customerMetrics['unique_customers_total'],
            'new_customers_total' => $customerMetrics['new_customers_total'],
            'orders_without_email_total' => $customerMetrics['orders_without_email_total'],
            'returning_orders_total' => $customerMetrics['returning_orders_total'],
            'returning_revenue_base' => round($customerMetrics['returning_revenue_base'], 2),
            'new_orders_total' => $customerMetrics['new_orders_total'],
            'new_revenue_base' => round($customerMetrics['new_revenue_base'], 2),
            'customers_orders_average' => round($customerMetrics['customers_orders_average'], 2),
        ]);
    }

    public function orders(Request $request)
    {
        $shopIds = array_values(array_filter(array_map(
            static fn ($id) => is_numeric($id) ? (int) $id : null,
            (array) $request->input('shop_ids', [])
        ), static fn (?int $id) => $id !== null));

        $from = $this->parseDate($request->input('from'));
        $to = $this->parseDate($request->input('to'), true);
        $groupBy = $request->string('group_by')->lower()->value() ?? 'day';
        $groupBy = in_array($groupBy, ['day', 'week', 'month', 'year'], true) ? $groupBy : 'day';

        $baseOrdersQuery = Order::query();

        if ($shopIds !== []) {
            $baseOrdersQuery->whereIn('shop_id', $shopIds);
        }

        if ($from) {
            $baseOrdersQuery->where('ordered_at', '>=', $from);
        }

        if ($to) {
            $baseOrdersQuery->where('ordered_at', '<=', $to);
        }

        $ordersQuery = (clone $baseOrdersQuery);
        $this->applyCompletedOrderFilter($ordersQuery);

        $ordersTotal = (clone $ordersQuery)->count();

        $ordersWithTotal = (clone $ordersQuery)->whereNotNull('total_with_vat');
        $perCurrencyTotals = (clone $ordersWithTotal)
            ->selectRaw('currency_code, COUNT(*) as orders_count, SUM(total_with_vat) as total_amount, SUM(total_with_vat_base) as total_amount_base')
            ->groupBy('currency_code')
            ->get();

        $baseCurrency = $this->currencyConverter->getBaseCurrency();
        $ordersTotalValue = 0.0;

        foreach ($perCurrencyTotals as $row) {
            $currency = $row->currency_code ?? $baseCurrency;
            $totalAmount = (float) ($row->total_amount ?? 0.0);
            $baseAmount = $row->total_amount_base !== null
                ? (float) $row->total_amount_base
                : ($this->currencyConverter->convertToBase($totalAmount, $currency) ?? 0.0);

            $ordersTotalValue += $baseAmount;
        }

        $ordersAverageValue = $ordersTotal > 0 ? $ordersTotalValue / $ordersTotal : 0.0;

        $timeSeries = $this->buildOrderTimeSeries(clone $ordersWithTotal, $groupBy, $baseCurrency);
        $topProducts = $this->buildTopProducts($shopIds, $from, $to, $baseCurrency);
        $paymentBreakdown = $this->buildMethodBreakdown(
            (clone $ordersQuery),
            'payment',
            fn ($value) => $this->resolvePaymentLabel($value),
            'Neznámá platba'
        );
        $shippingBreakdown = $this->buildMethodBreakdown(
            (clone $ordersQuery),
            'shipping',
            fn ($value) => $this->resolveShippingLabel($value),
            'Neznámá doprava'
        );
        $statusBreakdown = $this->buildStatusBreakdown((clone $baseOrdersQuery), $baseCurrency);

        return response()->json([
            'totals' => [
                'orders_count' => $ordersTotal,
                'orders_value' => round($ordersTotalValue, 2),
                'orders_average_value' => round($ordersAverageValue, 2),
                'base_currency' => $baseCurrency,
            ],
            'time_series' => $timeSeries,
            'top_products' => $topProducts,
            'payment_breakdown' => $paymentBreakdown,
            'shipping_breakdown' => $shippingBreakdown,
            'status_breakdown' => $statusBreakdown,
        ]);
    }

    public function products(Request $request)
    {
        $shopIds = array_values(array_filter(array_map(
            static fn ($id) => is_numeric($id) ? (int) $id : null,
            (array) $request->input('shop_ids', [])
        ), static fn (?int $id) => $id !== null));

        $from = $this->parseDate($request->input('from'));
        $to = $this->parseDate($request->input('to'), true);

        $limit = (int) $request->input('limit', 50);
        $limit = max(1, min(200, $limit));

        $sort = $request->string('sort')->lower()->value() ?? 'revenue';
        $direction = $request->string('direction')->lower()->value() ?? 'desc';
        $search = $request->input('search', '');

        $sortField = match ($sort) {
            'units' => 'units_sold',
            'orders' => 'orders_count',
            'repeat_rate' => 'repeat_purchase_rate',
            'repeat_customers' => 'repeat_customers',
            default => 'revenue_base',
        };

        $descending = $direction !== 'asc';
        $baseCurrency = $this->currencyConverter->getBaseCurrency();

        $orderItemsBase = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->leftJoin('product_variants', 'product_variants.code', '=', 'order_items.code')
            ->leftJoin('products', 'products.id', '=', 'product_variants.product_id')
            ->whereNotNull('orders.ordered_at');

        if ($shopIds !== []) {
            $orderItemsBase->whereIn('orders.shop_id', $shopIds);
        }

        if ($from) {
            $orderItemsBase->where('orders.ordered_at', '>=', $from);
        }

        if ($to) {
            $orderItemsBase->where('orders.ordered_at', '<=', $to);
        }

        $this->orderStatusResolver->applyCompletedFilter($orderItemsBase, 'orders.status');

        if (is_string($search) && trim($search) !== '') {
            $term = mb_strtolower(trim($search));
            $like = '%' . $term . '%';

            $orderItemsBase->where(function (Builder $query) use ($like) {
                $query
                    ->orWhereRaw('LOWER(order_items.name) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(order_items.variant_name) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(order_items.code) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(product_variants.name) LIKE ?', [$like])
                    ->orWhereRaw("LOWER(COALESCE((products.base_payload->>'name'), '')) LIKE ?", [$like]);
            });
        }

        $summaryRows = (clone $orderItemsBase)
            ->selectRaw('order_items.product_guid as product_guid')
            ->selectRaw('order_items.code as variant_code')
            ->selectRaw('order_items.name as item_name')
            ->selectRaw('MAX(order_items.variant_name) as item_variant_name')
            ->selectRaw('MAX(order_items.ean) as ean')
            ->selectRaw('MAX(CAST(product_variants.id AS TEXT)) as variant_id')
            ->selectRaw('MAX(CAST(product_variants.product_id AS TEXT)) as product_id')
            ->selectRaw('MAX(product_variants.name) as variant_display_name')
            ->selectRaw('MAX(product_variants.brand) as variant_brand')
            ->selectRaw("MAX(COALESCE((products.base_payload->>'name')::text, order_items.name)) as product_display_name")
            ->selectRaw("MAX(COALESCE(product_variants.brand, (products.base_payload->'brand'->>'name')::text)) as product_brand")
            ->selectRaw('SUM(COALESCE(order_items.amount, 0)) as units_sold')
            ->selectRaw('COUNT(DISTINCT orders.id) as orders_count')
            ->selectRaw(
                'COUNT(DISTINCT CASE WHEN orders.customer_email IS NOT NULL AND TRIM(orders.customer_email) <> \'\' THEN LOWER(TRIM(orders.customer_email)) END) as unique_customers'
            )
            ->groupBy('order_items.product_guid', 'order_items.code', 'order_items.name')
            ->get();

        $revenueRows = (clone $orderItemsBase)
            ->selectRaw('order_items.product_guid as product_guid')
            ->selectRaw('order_items.code as variant_code')
            ->selectRaw('order_items.name as item_name')
            ->selectRaw('orders.currency_code as currency_code')
            ->selectRaw('SUM(COALESCE(order_items.price_with_vat, 0)) as revenue')
            ->groupBy('order_items.product_guid', 'order_items.code', 'order_items.name', 'orders.currency_code')
            ->get();

        $repeatSub = (clone $orderItemsBase)
            ->whereNotNull('orders.customer_email')
            ->whereRaw('TRIM(orders.customer_email) <> \'\'')
            ->selectRaw('order_items.product_guid as product_guid')
            ->selectRaw('order_items.code as variant_code')
            ->selectRaw('order_items.name as item_name')
            ->selectRaw('LOWER(TRIM(orders.customer_email)) as customer_key')
            ->selectRaw('COUNT(DISTINCT orders.id) as orders_count')
            ->groupBy('order_items.product_guid', 'order_items.code', 'order_items.name', DB::raw('LOWER(TRIM(orders.customer_email))'))
            ->havingRaw('COUNT(DISTINCT orders.id) > 1');

        $repeatRows = DB::query()
            ->fromSub($repeatSub, 'repeat_stats')
            ->selectRaw('product_guid, variant_code, item_name, COUNT(*) as repeat_customers')
            ->groupBy('product_guid', 'variant_code', 'item_name')
            ->get();

        $products = [];

        $buildKey = static fn ($guid, $code, $name) => json_encode([
            $guid ?? null,
            $code ?? null,
            $name ?? null,
        ]);

        foreach ($summaryRows as $row) {
            $key = $buildKey($row->product_guid, $row->variant_code, $row->item_name);

            $variantLabel = $row->variant_display_name
                ?? $row->item_variant_name
                ?? $row->item_name;

            $productLabel = $row->product_display_name ?? $row->item_name;
            $brand = $row->variant_brand ?? $row->product_brand ?? null;
            $unitsSold = (float) ($row->units_sold ?? 0.0);
            $ordersCount = (int) ($row->orders_count ?? 0);
            $uniqueCustomers = (int) ($row->unique_customers ?? 0);

            $products[$key] = [
                'product_guid' => $row->product_guid,
                'variant_code' => $row->variant_code,
                'variant_id' => $row->variant_id,
                'product_id' => $row->product_id,
                'name' => $variantLabel ?? 'Neznámý produkt',
                'product_name' => $productLabel ?? 'Neznámý produkt',
                'brand' => $brand,
                'ean' => $row->ean,
                'units_sold' => round($unitsSold, 3),
                'orders_count' => $ordersCount,
                'unique_customers' => $uniqueCustomers,
                'repeat_customers' => 0,
                'first_time_customers' => $uniqueCustomers,
                'repeat_purchase_rate' => 0.0,
                'revenue_base' => 0.0,
                'average_unit_price_base' => null,
                'revenue_breakdown' => [],
            ];
        }

        foreach ($revenueRows as $row) {
            $key = $buildKey($row->product_guid, $row->variant_code, $row->item_name);

            if (! isset($products[$key])) {
                continue;
            }

            $currency = $row->currency_code ?? $baseCurrency;
            $amount = (float) ($row->revenue ?? 0.0);
            $baseAmount = $currency === $baseCurrency
                ? $amount
                : ($this->currencyConverter->convertToBase($amount, $currency) ?? 0.0);

            $products[$key]['revenue_breakdown'][] = [
                'currency' => $currency,
                'amount' => round($amount, 2),
            ];
            $products[$key]['revenue_base'] += $baseAmount;
        }

        foreach ($repeatRows as $row) {
            $key = $buildKey($row->product_guid, $row->variant_code, $row->item_name);

            if (! isset($products[$key])) {
                continue;
            }

            $repeatCustomers = (int) ($row->repeat_customers ?? 0);
            $uniqueCustomers = (int) $products[$key]['unique_customers'];

            $repeatCustomers = min($repeatCustomers, $uniqueCustomers);

            $products[$key]['repeat_customers'] = $repeatCustomers;
            $products[$key]['first_time_customers'] = max(0, $uniqueCustomers - $repeatCustomers);
        }

        foreach ($products as &$product) {
            $uniqueCustomers = (int) $product['unique_customers'];
            $repeatCustomers = (int) $product['repeat_customers'];
            $unitsSold = (float) $product['units_sold'];

            $product['revenue_base'] = round((float) $product['revenue_base'], 2);
            $product['repeat_purchase_rate'] = $uniqueCustomers > 0
                ? round($repeatCustomers / $uniqueCustomers, 4)
                : 0.0;
            $product['average_unit_price_base'] = $unitsSold > 0
                ? round($product['revenue_base'] / $unitsSold, 2)
                : null;

            $product['revenue_breakdown'] = array_map(
                static fn (array $entry) => [
                    'currency' => $entry['currency'],
                    'amount' => round((float) $entry['amount'], 2),
                ],
                $product['revenue_breakdown']
            );
        }
        unset($product);

        $productsCollection = collect($products)
            ->filter(static fn ($product) => ($product['orders_count'] ?? 0) > 0)
            ->values();

        $totalProducts = $productsCollection->count();
        $totalUnits = (float) $productsCollection->sum('units_sold');
        $totalRevenueBase = (float) $productsCollection->sum('revenue_base');
        $totalOrders = (int) $productsCollection->sum('orders_count');
        $totalUniqueCustomers = (int) $productsCollection->sum('unique_customers');
        $totalRepeatCustomers = (int) $productsCollection->sum('repeat_customers');

        $sorted = $productsCollection->sortBy($sortField, SORT_REGULAR, $descending)->values();

        $sliced = $sorted->take($limit)->values()->map(function ($product, $index) {
            $product['rank'] = $index + 1;

            return $product;
        });

        return response()->json([
            'data' => $sliced->all(),
            'meta' => [
                'limit' => $limit,
                'sort' => $sort,
                'sort_field' => $sortField,
                'direction' => $descending ? 'desc' : 'asc',
                'base_currency' => $baseCurrency,
                'summary' => [
                    'products_total' => $totalProducts,
                    'units_sold_total' => round($totalUnits, 3),
                    'revenue_total_base' => round($totalRevenueBase, 2),
                    'orders_total' => $totalOrders,
                    'unique_customers_total' => $totalUniqueCustomers,
                    'repeat_customers_total' => $totalRepeatCustomers,
                    'repeat_purchase_rate_average' => $totalUniqueCustomers > 0
                        ? round($totalRepeatCustomers / $totalUniqueCustomers, 4)
                        : 0.0,
                ],
                'filters' => [
                    'shop_ids' => $shopIds,
                    'from' => $from?->toIso8601String(),
                    'to' => $to?->toIso8601String(),
                    'search' => is_string($search) && trim($search) !== '' ? trim($search) : null,
                ],
            ],
        ]);
    }

    public function locations(Request $request)
    {
        $shopIds = array_values(array_filter(array_map(
            static fn ($id) => is_numeric($id) ? (int) $id : null,
            (array) $request->input('shop_ids', [])
        ), static fn (?int $id) => $id !== null));

        $from = $this->parseDate($request->input('from'));
        $to = $this->parseDate($request->input('to'), true);
        $limit = (int) $request->input('limit', 12);
        $metric = $request->string('metric')->lower()->value() ?? 'orders';

        $baseOrdersQuery = Order::query();

        if ($shopIds !== []) {
            $baseOrdersQuery->whereIn('shop_id', $shopIds);
        }

        if ($from) {
            $baseOrdersQuery->where('ordered_at', '>=', $from);
        }

        if ($to) {
            $baseOrdersQuery->where('ordered_at', '<=', $to);
        }

        $ordersQuery = (clone $baseOrdersQuery);
        $this->applyCompletedOrderFilter($ordersQuery);

        $orderItemsQuery = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id');

        if ($shopIds !== []) {
            $orderItemsQuery->whereIn('orders.shop_id', $shopIds);
        }

        if ($from) {
            $orderItemsQuery->where('orders.ordered_at', '>=', $from);
        }

        if ($to) {
            $orderItemsQuery->where('orders.ordered_at', '<=', $to);
        }

        $this->orderStatusResolver->applyCompletedFilter($orderItemsQuery, 'orders.status');

        $locations = $this->orderLocationAggregator->getTopLocations(
            ordersQuery: $ordersQuery,
            orderItemsQuery: $orderItemsQuery,
            limit: $limit,
            orderBy: $metric === 'revenue' ? 'revenue' : 'orders'
        );

        return response()->json([
            'data' => $locations,
            'meta' => [
                'limit' => $limit,
                'metric' => $metric === 'revenue' ? 'revenue' : 'orders',
                'filters' => [
                    'shop_ids' => $shopIds,
                    'from' => $from?->toIso8601String(),
                    'to' => $to?->toIso8601String(),
                ],
            ],
        ]);
    }

    private function buildCustomerMetrics(Builder $baseOrdersQuery, array $shopIds, int $completedOrdersTotal): array
    {
        // Keep the heavy lifting in SQL so large ranges don't pull every customer email into PHP memory.
        $ordersWithoutEmailTotal = (clone $baseOrdersQuery)->whereNull('customer_email')->count();

        $currentCustomersBase = (clone $baseOrdersQuery)
            ->whereNotNull('customer_email')
            ->selectRaw('customer_email')
            ->selectRaw('COUNT(*) as orders_in_period')
            ->selectRaw('COALESCE(SUM(COALESCE(total_with_vat_base, total_with_vat)), 0) as revenue_in_period')
            ->selectRaw('MIN(ordered_at) as first_order_in_period')
            ->groupBy('customer_email');

        $firstOrdersSub = DB::table('orders as root_orders')
            ->selectRaw('root_orders.customer_email')
            ->selectRaw('MIN(root_orders.ordered_at) as first_order_overall')
            ->whereNotNull('root_orders.customer_email')
            ->groupBy('root_orders.customer_email');

        if ($shopIds !== []) {
            $firstOrdersSub->whereIn('root_orders.shop_id', $shopIds);
        }

        $aggregates = DB::query()
            ->fromSub($currentCustomersBase, 'current')
            ->leftJoinSub($firstOrdersSub, 'first_orders', 'first_orders.customer_email', '=', 'current.customer_email')
            ->selectRaw('COUNT(*) as unique_customers')
            ->selectRaw('SUM(CASE WHEN current.orders_in_period > 1 THEN 1 ELSE 0 END) as repeat_customers_in_period')
            ->selectRaw('SUM(CASE WHEN first_orders.first_order_overall IS NOT NULL AND first_orders.first_order_overall < current.first_order_in_period THEN 1 ELSE 0 END) as returning_customers')
            ->selectRaw('SUM(CASE WHEN first_orders.first_order_overall IS NOT NULL AND first_orders.first_order_overall < current.first_order_in_period THEN current.orders_in_period ELSE 0 END) as returning_orders')
            ->selectRaw('SUM(CASE WHEN first_orders.first_order_overall IS NOT NULL AND first_orders.first_order_overall < current.first_order_in_period THEN current.revenue_in_period ELSE 0 END) as returning_revenue')
            ->selectRaw('SUM(CASE WHEN first_orders.first_order_overall IS NULL OR first_orders.first_order_overall >= current.first_order_in_period THEN 1 ELSE 0 END) as new_customers')
            ->selectRaw('SUM(CASE WHEN first_orders.first_order_overall IS NULL OR first_orders.first_order_overall >= current.first_order_in_period THEN current.orders_in_period ELSE 0 END) as new_orders')
            ->selectRaw('SUM(CASE WHEN first_orders.first_order_overall IS NULL OR first_orders.first_order_overall >= current.first_order_in_period THEN current.revenue_in_period ELSE 0 END) as new_revenue')
            ->first();

        if (! $aggregates) {
            return [
                'unique_customers_total' => 0,
                'repeat_customers_period_total' => 0,
                'returning_customers_total' => 0,
                'returning_orders_total' => 0,
                'returning_revenue_base' => 0.0,
                'new_customers_total' => 0,
                'new_orders_total' => 0,
                'new_revenue_base' => 0.0,
                'customers_repeat_ratio' => 0.0,
                'orders_without_email_total' => $ordersWithoutEmailTotal,
                'customers_orders_average' => 0.0,
            ];
        }

        $uniqueCustomersCount = (int) ($aggregates->unique_customers ?? 0);
        $returningCustomersCount = (int) ($aggregates->returning_customers ?? 0);

        return [
            'unique_customers_total' => $uniqueCustomersCount,
            'repeat_customers_period_total' => (int) ($aggregates->repeat_customers_in_period ?? 0),
            'returning_customers_total' => $returningCustomersCount,
            'returning_orders_total' => (int) ($aggregates->returning_orders ?? 0),
            'returning_revenue_base' => (float) ($aggregates->returning_revenue ?? 0.0),
            'new_customers_total' => (int) ($aggregates->new_customers ?? 0),
            'new_orders_total' => (int) ($aggregates->new_orders ?? 0),
            'new_revenue_base' => (float) ($aggregates->new_revenue ?? 0.0),
            'customers_repeat_ratio' => $uniqueCustomersCount > 0
                ? $returningCustomersCount / $uniqueCustomersCount
                : 0.0,
            'orders_without_email_total' => $ordersWithoutEmailTotal,
            'customers_orders_average' => $uniqueCustomersCount > 0
                ? $completedOrdersTotal / $uniqueCustomersCount
                : 0.0,
        ];
    }

    private function parseDate(?string $value, bool $endOfDay = false): ?CarbonImmutable
    {
        if (! $value) {
            return null;
        }

        try {
            $date = CarbonImmutable::parse($value);
        } catch (\Throwable) {
            return null;
        }

        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return $date;
        }

        return $endOfDay ? $date->endOfDay() : $date->startOfDay();
    }

    private function buildOrderTimeSeries(Builder $ordersQuery, string $groupBy, string $baseCurrency): array
    {
        // Aggregate in SQL to avoid iterating every order when the range is large.
        $truncExpression = match ($groupBy) {
            'week' => "DATE_TRUNC('week', orders.ordered_at)",
            'month' => "DATE_TRUNC('month', orders.ordered_at)",
            'year' => "DATE_TRUNC('year', orders.ordered_at)",
            default => "DATE_TRUNC('day', orders.ordered_at)",
        };

        $rows = (clone $ordersQuery)
            ->whereNotNull('orders.ordered_at')
            ->selectRaw("{$truncExpression} as bucket_date")
            ->selectRaw('COALESCE(orders.currency_code, ?) as currency_code', [$baseCurrency])
            ->selectRaw('COUNT(*) as orders_count')
            ->selectRaw('SUM(COALESCE(orders.total_with_vat_base, 0)) as revenue_base_sum')
            ->selectRaw('SUM(CASE WHEN orders.total_with_vat_base IS NULL THEN orders.total_with_vat ELSE 0 END) as revenue_without_base')
            ->groupBy('bucket_date', 'currency_code')
            ->orderBy('bucket_date')
            ->get();

        $buckets = [];

        foreach ($rows as $row) {
            if (! $row->bucket_date) {
                continue;
            }

            $date = CarbonImmutable::parse($row->bucket_date);
            $key = $this->periodKey($date, $groupBy);
            $currency = $row->currency_code ?? $baseCurrency;
            $revenueBase = (float) ($row->revenue_base_sum ?? 0.0);
            $revenueToConvert = (float) ($row->revenue_without_base ?? 0.0);
            $revenueBase += $revenueToConvert > 0
                ? ($this->currencyConverter->convertToBase($revenueToConvert, $currency) ?? 0.0)
                : 0.0;

            if (! isset($buckets[$key])) {
                $buckets[$key] = [
                    'date' => $date,
                    'orders_count' => 0,
                    'revenue' => 0.0,
                ];
            }

            $buckets[$key]['orders_count'] += (int) ($row->orders_count ?? 0);
            $buckets[$key]['revenue'] += $revenueBase;
        }

        uasort($buckets, fn ($a, $b) => $a['date']->timestamp <=> $b['date']->timestamp);

        return array_values(array_map(function (array $bucket) use ($groupBy) {
            /** @var CarbonImmutable $date */
            $date = $bucket['date'];

            return [
                'period' => $this->periodKey($date, $groupBy),
                'label' => $this->periodLabel($date, $groupBy),
                'orders_count' => $bucket['orders_count'],
                'revenue' => round($bucket['revenue'], 2),
            ];
        }, $buckets));
    }

    private function buildTopProducts(array $shopIds, ?CarbonImmutable $from, ?CarbonImmutable $to, string $baseCurrency): array
    {
        $itemsQuery = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->select([
                'order_items.code',
                'order_items.name',
                'orders.currency_code',
            ])
            ->selectRaw('SUM(order_items.amount) as quantity')
            ->selectRaw('SUM(order_items.price_with_vat) as revenue')
            ->whereNotNull('orders.ordered_at');

        if ($shopIds !== []) {
            $itemsQuery->whereIn('orders.shop_id', $shopIds);
        }

        if ($from) {
            $itemsQuery->where('orders.ordered_at', '>=', $from);
        }

        if ($to) {
            $itemsQuery->where('orders.ordered_at', '<=', $to);
        }

        $this->orderStatusResolver->applyCompletedFilter($itemsQuery, 'orders.status');

        $rawItems = $itemsQuery
            ->groupBy('order_items.code', 'order_items.name', 'orders.currency_code')
            ->get();

        $bucketed = [];

        foreach ($rawItems as $row) {
            $key = $row->code ?? $row->name ?? 'unknown';
            $label = $row->name ?? $row->code ?? 'Neznámý produkt';
            $currency = $row->currency_code ?? $baseCurrency;
            $quantity = (float) ($row->quantity ?? 0.0);
            $revenue = (float) ($row->revenue ?? 0.0);
            $revenueBase = $currency === $baseCurrency
                ? $revenue
                : ($this->currencyConverter->convertToBase($revenue, $currency) ?? 0.0);

            if (! isset($bucketed[$key])) {
                $bucketed[$key] = [
                    'code' => $row->code,
                    'name' => $label,
                    'quantity' => 0.0,
                    'revenue' => 0.0,
                ];
            }

            $bucketed[$key]['quantity'] += $quantity;
            $bucketed[$key]['revenue'] += $revenueBase;
        }

        return collect($bucketed)
            ->sortByDesc('revenue')
            ->take(5)
            ->map(fn ($item) => [
                'code' => $item['code'],
                'name' => $item['name'],
                'quantity' => round($item['quantity'], 2),
                'revenue' => round($item['revenue'], 2),
            ])
            ->values()
            ->all();
    }

    private function buildMethodBreakdown(Builder $ordersQuery, string $column, callable $labelResolver, string $fallbackLabel): array
    {
        $counts = [];

        (clone $ordersQuery)
            ->select(['id', $column])
            ->orderBy('id')
            ->chunkById(1000, function ($orders) use (&$counts, $column, $labelResolver, $fallbackLabel) {
                foreach ($orders as $order) {
                    $raw = $order->getAttribute($column);
                    $label = $labelResolver($raw);
                    $label = $label !== null && $label !== '' ? $label : $fallbackLabel;
                    $counts[$label] = ($counts[$label] ?? 0) + 1;
                }
            }, 'id');

        $total = array_sum($counts);

        if ($total === 0) {
            return [];
        }

        return collect($counts)
            ->map(fn ($count, $label) => [
                'method' => $label,
                'count' => (int) $count,
                'share' => round(($count / $total) * 100, 2),
            ])
            ->sortByDesc('count')
            ->values()
            ->all();
    }

    private function buildStatusBreakdown(Builder $ordersQuery, string $baseCurrency): array
    {
        $totalOrders = (clone $ordersQuery)->count();

        if ($totalOrders === 0) {
            return [];
        }

        $rows = (clone $ordersQuery)
            ->select('status')
            ->selectRaw('COUNT(*) as orders_count')
            ->selectRaw('COALESCE(SUM(COALESCE(total_with_vat_base, total_with_vat)), 0) as revenue_base')
            ->groupBy('status')
            ->orderByDesc('orders_count')
            ->get();

        return $rows
            ->map(function ($row) use ($totalOrders) {
                $status = $row->status ?? 'Neznámý stav';
                $ordersCount = (int) ($row->orders_count ?? 0);
                $revenueBase = (float) ($row->revenue_base ?? 0.0);

                return [
                    'status' => $status,
                    'orders_count' => $ordersCount,
                    'share' => $ordersCount > 0 ? round(($ordersCount / $totalOrders) * 100, 2) : 0.0,
                    'revenue_base' => round($revenueBase, 2),
                ];
            })
            ->values()
            ->all();
    }

    private function resolvePaymentLabel(mixed $payload): ?string
    {
        if (is_array($payload)) {
            if (array_key_exists('method', $payload)) {
                $label = $this->normaliseLabel($payload['method']);

                if ($label !== null) {
                    return $label;
                }
            }

            if (array_key_exists('billing', $payload)) {
                $label = $this->normaliseLabel($payload['billing']);

                if ($label !== null) {
                    return $label;
                }
            }
        }

        return $this->normaliseLabel($payload);
    }

    private function resolveShippingLabel(mixed $payload): ?string
    {
        if (is_array($payload)) {
            foreach (['name', 'carrier', 'code'] as $key) {
                if (array_key_exists($key, $payload)) {
                    $label = $this->normaliseLabel($payload[$key]);

                    if ($label !== null) {
                        return $label;
                    }
                }
            }
        }

        return $this->normaliseLabel($payload);
    }

    private function normaliseLabel(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        if (is_string($value)) {
            $trimmed = trim($value);

            return $trimmed === '' ? null : $trimmed;
        }

        if (is_object($value)) {
            $value = (array) $value;
        }

        if (is_array($value)) {
            foreach (['name', 'label', 'title', 'method', 'type'] as $key) {
                if (array_key_exists($key, $value)) {
                    $candidate = $this->normaliseLabel($value[$key]);

                    if ($candidate !== null) {
                        return $candidate;
                    }
                }
            }

            foreach ($value as $item) {
                $candidate = $this->normaliseLabel($item);

                if ($candidate !== null) {
                    return $candidate;
                }
            }
        }

        return null;
    }

    private function normaliseDate(CarbonImmutable $date, string $groupBy): CarbonImmutable
    {
        return match ($groupBy) {
            'week' => $date->startOfWeek(CarbonImmutable::MONDAY),
            'month' => $date->startOfMonth(),
            'year' => $date->startOfYear(),
            default => $date->startOfDay(),
        };
    }

    private function periodKey(CarbonImmutable $date, string $groupBy): string
    {
        return match ($groupBy) {
            'week' => $date->format('o-\WW'),
            'month' => $date->format('Y-m'),
            'year' => $date->format('Y'),
            default => $date->format('Y-m-d'),
        };
    }

    private function periodLabel(CarbonImmutable $date, string $groupBy): string
    {
        return match ($groupBy) {
            'week' => sprintf('Týden %s, začátek %s', $date->isoWeek(), $date->format('d.m.')),
            'month' => $date->format('m/Y'),
            'year' => $date->format('Y'),
            default => $date->format('d.m.'),
        };
    }

    private function applyCompletedOrderFilter(Builder $builder): void
    {
        $this->orderStatusResolver->applyCompletedFilter($builder);
    }
}
