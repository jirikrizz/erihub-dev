<?php

namespace Modules\Inventory\Http\Controllers;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Modules\Core\Services\CurrencyConverter;
use Illuminate\Support\Str;
use Modules\Inventory\Models\InventoryVariantForecast;
use Modules\Inventory\Jobs\ForecastInventoryVariantsJob;
use Modules\Inventory\Services\InventoryRecommendationService;
use Modules\Inventory\Support\InventoryVariantContext;
use Modules\Inventory\Support\InventoryForecastProfile;
use Modules\Inventory\Services\InventoryForecastService;
use Modules\Inventory\Services\InventoryMetricsService;
use Modules\Inventory\Models\InventoryProductRecommendation;
use Modules\Orders\Models\OrderItem;
use Modules\Orders\Support\OrderStatusResolver;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ProductVariant;
use Modules\Pim\Services\ProductSnapshotImporter;
use Modules\Shoptet\Contracts\ShoptetClient;

class InventoryDashboardController extends Controller
{
    public function __construct(
        private readonly InventoryMetricsService $metricsService,
        private readonly OrderStatusResolver $orderStatusResolver,
        private readonly InventoryRecommendationService $recommendationService,
        private readonly CurrencyConverter $currencyConverter
    ) {
    }
    public function overview()
    {
        $baseQuery = ProductVariant::query();

        $totalVariants = (clone $baseQuery)->count();
        $soldOutVariants = $this->applyStockStatusScope((clone $baseQuery), 'sold_out')->count();
        $lowStockVariants = $this->applyStockStatusScope((clone $baseQuery), 'low_stock')->count();
        $unknownStockVariants = $this->applyStockStatusScope((clone $baseQuery), 'unknown')->count();

        $inStockVariants = max(0, $totalVariants - $soldOutVariants - $lowStockVariants - $unknownStockVariants);

        return response()->json([
            'total_products' => Product::count(),
            'total_variants' => $totalVariants,
            'low_stock_variants' => $lowStockVariants,
            'sold_out_variants' => $soldOutVariants,
            'in_stock_variants' => $inStockVariants,
            'unknown_stock_variants' => $unknownStockVariants,
        ]);
    }

    public function variants(Request $request)
    {
        $status = trim((string) $request->query('stock_status', ''));
        $shopIds = $this->parseIds($request->input('shop_id'));

        if ($status === '' && $request->routeIs('inventory.low-stock')) {
            $status = 'low_stock';
        }

        $query = $this->buildVariantsQuery($request, $status, $shopIds);

        $variants = $query->paginate($request->integer('per_page', 25));

        $variants->getCollection()->transform(function (ProductVariant $variant) use ($shopIds) {
            $summary = $this->metricsService->summarize($variant, $shopIds === [] ? null : $shopIds);

            $variant->setAttribute('lifetime_orders_count', $summary['lifetime_orders_count']);
            $variant->setAttribute('lifetime_quantity', $summary['lifetime_quantity']);
            $variant->setAttribute('lifetime_revenue', $summary['lifetime_revenue']);
            $variant->setAttribute('last_30_orders_count', $summary['last_30_orders_count']);
            $variant->setAttribute('last_30_quantity', $summary['last_30_quantity']);
            $variant->setAttribute('last_30_revenue', $summary['last_30_revenue']);
            $variant->setAttribute('last_90_orders_count', $summary['last_90_orders_count']);
            $variant->setAttribute('last_90_quantity', $summary['last_90_quantity']);
            $variant->setAttribute('last_90_revenue', $summary['last_90_revenue']);
            $variant->setAttribute('average_daily_sales', $summary['average_daily_sales']);
            $variant->setAttribute('stock_runway_days', $summary['stock_runway_days']);
            $variant->setAttribute('metrics_updated_at', $summary['metrics_updated_at']?->toIso8601String());
            $variant->setAttribute('lifetime_currency_code', $summary['currency_code']);
            $variant->setAttribute('metrics_currency_code', $summary['currency_code']);

            $stock = $this->resolveSharedStock($variant);
            $variant->setAttribute('stock', $stock['stock']);
            $variant->setAttribute('min_stock_supply', $stock['min_stock_supply']);
            $variant->setAttribute('stock_source_shop_id', $stock['shop_id']);
            $variant->setAttribute('product_flags', $this->extractProductFlags($variant));
            $variant->setAttribute('default_category_name', $this->resolveDefaultCategoryName($variant));
            $variant->setAttribute('seasonality_labels', $this->extractSeasonalityLabels($variant));

            return $variant;
        });

        return response()->json($variants);
    }

    public function filters(Request $request)
    {
        $shopIdFilter = $request->integer('shop_id');

        $brands = ProductVariant::query()
            ->whereNotNull('brand')
            ->distinct()
            ->orderBy('brand')
            ->limit(200)
            ->pluck('brand');

        $suppliers = ProductVariant::query()
            ->whereNotNull('supplier')
            ->distinct()
            ->orderBy('supplier')
            ->limit(200)
            ->pluck('supplier');

        $flagMap = [];
        $defaultCategoryMap = [];
        $seasonalityMap = [];

        Product::query()
            ->select(['id', 'shop_id', 'base_payload'])
            ->whereNotNull('base_payload')
            ->when($shopIdFilter, fn ($query, $shopId) => $query->where('shop_id', $shopId))
            ->orderBy('id')
            ->lazyById(100)
            ->each(function (Product $product) use (&$flagMap, &$defaultCategoryMap, &$seasonalityMap) {
                $payload = $product->base_payload ?? [];

                if (! is_array($payload) || $payload === []) {
                    return;
                }

                $flags = Arr::get($payload, 'flags', []);

                if (is_array($flags) && $flags !== []) {
                    foreach ($flags as $flag) {
                        if (! is_array($flag)) {
                            continue;
                        }

                        $code = (string) ($flag['code'] ?? '');

                        if ($code === '') {
                            continue;
                        }

                        $title = (string) ($flag['title'] ?? $code);
                        $dateFrom = isset($flag['dateFrom']) ? (string) $flag['dateFrom'] : null;
                        $dateTo = isset($flag['dateTo']) ? (string) $flag['dateTo'] : null;

                        $flagMap[$code] = [
                            'code' => $code,
                            'title' => $title,
                            'date_from' => $dateFrom,
                            'date_to' => $dateTo,
                        ];
                    }
                }

                $categoryName = $this->extractDefaultCategoryFromPayload(is_array($payload) ? $payload : null);

                if ($categoryName) {
                    $defaultCategoryMap[$categoryName] = $categoryName;
                }

                $seasonalityLabels = $this->extractSeasonalityLabelsFromPayload(is_array($payload) ? $payload : null);

                foreach ($seasonalityLabels as $label) {
                    $seasonalityMap[$label] = $label;
                }
            });

        if ($flagMap !== []) {
            uasort($flagMap, static function (array $left, array $right) {
                return strcasecmp($left['title'], $right['title']);
            });
        }

        if ($defaultCategoryMap !== []) {
            natcasesort($defaultCategoryMap);
        }

        if ($seasonalityMap !== []) {
            natcasesort($seasonalityMap);
        }

        return response()->json([
            'brands' => $brands,
            'suppliers' => $suppliers,
            'flags' => array_values($flagMap),
            'default_categories' => array_values($defaultCategoryMap),
            'seasonality' => array_values($seasonalityMap),
        ]);
    }

    public function export(Request $request)
    {
        $shopIds = $this->parseIds($request->input('shop_id'));
        $query = $this->buildVariantsQuery($request, null, $shopIds);
        $selectedIds = $this->normalizeVariantIds($request->input('ids'));

        if ($selectedIds !== []) {
            $query->whereIn('product_variants.id', $selectedIds);
        }

        $fileName = 'inventory_variants_'.now()->format('Ymd_His').'.csv';

        $headers = [
            'Cache-Control' => 'no-store, no-cache',
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="'.$fileName.'"',
        ];

        $query->with('product');

        $callback = function () use ($query) {
            $handle = fopen('php://output', 'w');

            fputcsv($handle, [
                'Kód',
                'Název varianty',
                'Produkt',
                'Značka',
                'Dodavatel',
                'SKU',
                'EAN',
                'Zásoba',
                'Min. zásoba',
                'Cena',
                'Nákupní cena',
                'Stav',
                'Lifetime obrat',
                'Denní poptávka (30d)',
                'Výdrž zásoby (dny)',
            ], ';');

            $cloned = clone $query;

            $cloned->orderBy('product_variants.code')->chunk(200, function ($variants) use ($handle) {
                foreach ($variants as $variant) {
                    $average = $this->calculateAverageDailySales($variant);
                    $variant->setAttribute('average_daily_sales', $average);
                    $variant->setAttribute('stock_runway_days', $this->calculateStockRunway($variant, $average));
                    $stock = $this->resolveSharedStock($variant);
                    $variant->setAttribute('stock', $stock['stock']);
                    $variant->setAttribute('min_stock_supply', $stock['min_stock_supply']);

                    fputcsv($handle, [
                        $variant->code,
                        $variant->name,
                        $this->resolveProductNameLabel($variant),
                        $variant->brand,
                        $variant->supplier,
                        $variant->sku,
                        $variant->ean,
                        $variant->stock,
                        $variant->min_stock_supply,
                        $variant->price,
                        $variant->purchase_price,
                        $variant->stock_status,
                        $variant->lifetime_revenue,
                        $variant->average_daily_sales,
                        $variant->stock_runway_days,
                    ], ';');
                }
            });

            fclose($handle);
        };

        return response()->streamDownload($callback, $fileName, $headers);
    }

    public function show(Request $request, ProductVariant $variant)
    {
        $shopIds = $this->parseIds($request->input('shop_id'));
        $compare = (bool) $request->boolean('compare');

        $variant->load([
            'product' => fn ($relation) => $relation
                ->select('id', 'shop_id', 'external_guid', 'sku', 'status', 'base_payload', 'base_locale')
                ->with([
                    'shop:id,currency_code,name,domain',
                    'variants' => fn ($query) => $query
                        ->select([
                            'product_variants.id',
                            'product_variants.product_id',
                            'product_variants.code',
                            'product_variants.name',
                        'product_variants.sku',
                        'product_variants.ean',
                        'product_variants.brand',
                        'product_variants.supplier',
                        'product_variants.stock',
                        'product_variants.min_stock_supply',
                        'product_variants.unit',
                        'product_variants.currency_code',
                        'product_variants.price',
                        'product_variants.purchase_price',
                        'product_variants.data',
                    ])
                    ->orderBy('code')
                ]),
            'tags:id,name,color',
        ]);

        $variant->loadMissing('overlays.shop');

        $summary = $this->metricsService->summarize($variant, $shopIds === [] ? null : $shopIds);

        $variant->setAttribute('lifetime_revenue', (float) $summary['lifetime_revenue']);
        $variant->setAttribute('last_30_quantity', (float) $summary['last_30_quantity']);
        $variant->setAttribute('average_daily_sales', (float) $summary['average_daily_sales']);
        $variant->setAttribute('stock_runway_days', $summary['stock_runway_days']);
        $variant->setAttribute('metrics_updated_at', $summary['metrics_updated_at']?->toIso8601String());
        $variant->setAttribute('metrics_currency_code', $summary['currency_code']);

        $stock = $this->resolveSharedStock($variant);
        $variant->setAttribute('stock', $stock['stock']);
        $variant->setAttribute('min_stock_supply', $stock['min_stock_supply']);
        $variant->setAttribute('stock_source_shop_id', $stock['shop_id']);

        $perShopMetrics = $compare
            ? $this->metricsService->metricsByShop($variant, $shopIds === [] ? null : $shopIds)
            : collect();

        $salesMetrics = $this->buildSalesMetrics(
            $variant,
            $summary,
            $shopIds,
            $perShopMetrics
        );
        $salesMetrics['applied_shop_ids'] = $shopIds;

        $latestForecast = $variant->forecasts()->with('user')->latest('created_at')->first();
        $forecastPayload = null;

        if ($latestForecast) {
            $profileFromPayload = [];
            if (is_array($latestForecast->payload) && isset($latestForecast->payload['business_profile'])) {
                $profileFromPayload = $latestForecast->payload['business_profile'];
            }
            $businessProfile = InventoryForecastProfile::sanitize($profileFromPayload);

            $forecastPayload = [
                'id' => $latestForecast->id,
                'runway_days' => $latestForecast->runway_days,
                'confidence' => $latestForecast->confidence,
                'summary' => $latestForecast->summary,
                'recommendations' => $latestForecast->recommendations ?? [],
                'assumptions' => $latestForecast->assumptions ?? [],
                'top_markets' => $latestForecast->top_markets ?? [],
                'pricing_advice' => $latestForecast->pricing_advice,
                'restock_advice' => $latestForecast->restock_advice,
                'reorder_deadline_days' => $latestForecast->reorder_deadline_days,
                'recommended_order_quantity' => $latestForecast->recommended_order_quantity,
                'order_recommendation' => $latestForecast->order_recommendation,
                'order_rationale' => $latestForecast->order_rationale,
                'seasonality_summary' => $latestForecast->seasonality_summary,
                'seasonality_best_period' => $latestForecast->seasonality_best_period,
                'product_health' => $latestForecast->product_health,
                'product_health_reason' => $latestForecast->product_health_reason,
                'created_at' => $latestForecast->created_at?->toIso8601String(),
                'user' => $latestForecast->relationLoaded('user')
                    ? $latestForecast->user?->only(['id', 'name', 'email'])
                    : null,
                'business_profile' => $businessProfile,
            ];
        }

        $variant->setAttribute('product_flags', $this->extractProductFlags($variant));

        $context = InventoryVariantContext::build($variant);
        $variant->setAttribute('related_descriptors', $context['descriptor_items']);
        $variant->setAttribute(
            'filter_parameters',
            array_values($context['filter_parameters'])
        );
        $variant->setAttribute(
            'related_products',
            InventoryVariantContext::enrichRelatedProducts($context['related_products'])
        );

        return response()->json([
            'variant' => $variant,
            'sales' => $salesMetrics,
            'latest_forecast' => $forecastPayload,
        ]);
    }

    public function recommendations(Request $request, ProductVariant $variant)
    {
        $limit = max(1, min((int) $request->integer('limit', 10), 50));
        $productId = $variant->product_id;

        $legacyRecommendations = $this->recommendationService->recommend($variant, min($limit, 10));
        $records = InventoryProductRecommendation::query()
            ->with([
                'recommendedProduct.variants' => fn ($query) => $query->select([
                    'id',
                    'product_id',
                    'code',
                    'name',
                    'brand',
                    'price',
                    'currency_code',
                    'stock',
                    'min_stock_supply',
                ]),
                'recommendedVariant' => fn ($query) => $query->select([
                    'id',
                    'product_id',
                    'code',
                    'name',
                    'brand',
                    'price',
                    'currency_code',
                    'stock',
                    'min_stock_supply',
                ]),
            ])
            ->where('product_id', $productId)
            ->orderBy('type')
            ->orderBy('position')
            ->get()
            ->groupBy('type');

        $related = $records->get(InventoryProductRecommendation::TYPE_RELATED, collect())
            ->take($limit)
            ->map(fn (InventoryProductRecommendation $record) => $this->transformProductRecommendation($record))
            ->values();

        $recommended = $records->get(InventoryProductRecommendation::TYPE_RECOMMENDED, collect())
            ->take($limit)
            ->map(fn (InventoryProductRecommendation $record) => $this->transformProductRecommendation($record))
            ->values();

        return response()->json([
            'variant_id' => $variant->id,
            'product_id' => $productId,
            'related' => $related,
            'recommended' => $recommended,
            'recommendations' => $legacyRecommendations,
        ]);
    }

    private function transformProductRecommendation(InventoryProductRecommendation $record): array
    {
        $product = $record->recommendedProduct;
        $variant = $record->recommendedVariant;

        if (! $variant && $product && $product->relationLoaded('variants')) {
            $variant = $product->variants->sortByDesc('stock')->first();
        }

        $productName = null;

        if ($product) {
            $payload = $product->base_payload;

            if (is_array($payload)) {
                $candidate = Arr::get($payload, 'name') ?? Arr::get($payload, 'title');

                if (is_string($candidate) && trim($candidate) !== '') {
                    $productName = trim($candidate);
                }
            }

            $productName ??= $product->sku ?? $product->external_guid ?? null;
        }

        return [
            'id' => $record->id,
            'product' => [
                'id' => $product?->id,
                'external_guid' => $product?->external_guid,
                'name' => $productName,
                'status' => $product?->status,
            ],
            'variant' => $variant ? [
                'id' => $variant->id,
                'code' => $variant->code,
                'name' => $variant->name,
                'brand' => $variant->brand,
                'price' => $variant->price,
                'currency_code' => $variant->currency_code,
                'stock' => $variant->stock,
                'min_stock_supply' => $variant->min_stock_supply,
            ] : null,
            'matches' => $record->matches ?? [],
            'score' => $record->score,
            'position' => $record->position,
        ];
    }

    public function refreshStock(
        Request $request,
        ProductVariant $variant,
        ShoptetClient $shoptetClient,
        ProductSnapshotImporter $snapshotImporter
    ) {
        $variant->loadMissing([
            'product.shop',
            'product.remoteRefs',
        ]);

        $product = $variant->product;
        $shop = $product?->shop;

        if (! $product || ! $shop || ! $shop->is_master) {
            return response()->json([
                'message' => 'Varianta není navázána na master shop.',
            ], 422);
        }

        $remoteGuid = optional($product->remoteRefs->firstWhere('shop_id', $shop->id))->remote_guid
            ?? $product->external_guid;

        if (! is_string($remoteGuid) || trim($remoteGuid) === '') {
            return response()->json([
                'message' => 'Pro produkt není k dispozici Shoptet GUID.',
            ], 422);
        }

        try {
            $response = $shoptetClient->getProduct($shop, $remoteGuid, [
                'include' => \Modules\Pim\Services\ProductSnapshotImporter::FULL_PRODUCT_INCLUDE,
            ]);
        } catch (\Throwable $throwable) {
            Log::error('Failed to refresh variant stock from Shoptet.', [
                'variant_id' => $variant->id,
                'product_id' => $product->id,
                'shop_id' => $shop->id,
                'error' => $throwable->getMessage(),
            ]);

            return response()->json([
                'message' => 'Nepodařilo se načíst aktuální data z Shoptetu.',
            ], 502);
        }

        $payload = Arr::get($response, 'data.product');
        if (! is_array($payload) || $payload === []) {
            $payload = Arr::get($response, 'product', []);
        }
        if (! is_array($payload) || $payload === []) {
            $payload = Arr::get($response, 'data', []);
        }

        if (! is_array($payload) || $payload === []) {
            Log::warning('Shoptet product detail response is empty.', [
                'variant_id' => $variant->id,
                'product_id' => $product->id,
                'shop_id' => $shop->id,
                'response' => $response,
            ]);

            return response()->json([
                'message' => 'Shoptet nevrátil detail produktu.',
            ], 502);
        }

        $snapshotImporter->import($payload, $shop);

        $variant->refresh();

        return $this->show($request, $variant);
    }

    public function refreshMetrics(ProductVariant $variant)
    {
        $summary = $this->metricsService->recalculate($variant);

        return response()->json([
            'metrics' => [
                'lifetime_orders_count' => (int) ($summary['lifetime_orders_count'] ?? 0),
                'lifetime_quantity' => (float) ($summary['lifetime_quantity'] ?? 0.0),
                'lifetime_revenue' => (float) ($summary['lifetime_revenue'] ?? 0.0),
                'last_30_orders_count' => (int) ($summary['last_30_orders_count'] ?? 0),
                'last_30_quantity' => (float) ($summary['last_30_quantity'] ?? 0.0),
                'last_30_revenue' => (float) ($summary['last_30_revenue'] ?? 0.0),
                'last_90_orders_count' => (int) ($summary['last_90_orders_count'] ?? 0),
                'last_90_quantity' => (float) ($summary['last_90_quantity'] ?? 0.0),
                'last_90_revenue' => (float) ($summary['last_90_revenue'] ?? 0.0),
                'average_daily_sales' => (float) ($summary['average_daily_sales'] ?? 0.0),
                'stock_runway_days' => $summary['stock_runway_days'] !== null ? (float) $summary['stock_runway_days'] : null,
                'last_sale_at' => $summary['last_sale_at']?->toIso8601String(),
                'updated_at' => $summary['metrics_updated_at']?->toIso8601String(),
            ],
        ]);
    }

    public function forecast(
        Request $request,
        ProductVariant $variant,
        InventoryForecastService $forecastService
    ) {
        $shopIds = $this->parseIds($request->input('shop_id') ?? $request->input('shop_ids'));
        $contextNotes = trim((string) $request->input('context', ''));

        $summary = $this->metricsService->summarize($variant, $shopIds === [] ? null : $shopIds);

        $stock = $this->resolveSharedStock($variant);
        $variant->setAttribute('stock', $stock['stock']);
        $variant->setAttribute('min_stock_supply', $stock['min_stock_supply']);

        $result = $forecastService->forecast($variant, $summary, [
            'shop_ids' => $shopIds,
            'notes' => $contextNotes !== '' ? $contextNotes : null,
        ]);

        $forecastRecord = InventoryVariantForecast::create([
            'product_variant_id' => $variant->id,
            'user_id' => $request->user()?->id,
            'runway_days' => $result['runway_days'],
            'confidence' => $result['confidence'],
            'summary' => $result['summary'],
            'recommendations' => $result['recommendations'],
            'assumptions' => $result['assumptions'],
            'top_markets' => $result['top_markets'],
            'pricing_advice' => $result['pricing_advice'],
            'restock_advice' => $result['restock_advice'],
            'reorder_deadline_days' => $result['reorder_deadline_days'],
            'recommended_order_quantity' => $result['recommended_order_quantity'],
            'order_recommendation' => $result['order_recommendation'],
            'order_rationale' => $result['order_rationale'],
            'seasonality_summary' => $result['seasonality_summary'],
            'seasonality_best_period' => $result['seasonality_best_period'],
            'product_health' => $result['product_health'],
            'product_health_reason' => $result['product_health_reason'],
            'payload' => $result['payload'] ?? null,
        ]);

        return response()->json([
            'id' => $forecastRecord->id,
            'runway_days' => $forecastRecord->runway_days,
            'confidence' => $forecastRecord->confidence,
            'summary' => $forecastRecord->summary,
            'recommendations' => $forecastRecord->recommendations ?? [],
            'assumptions' => $forecastRecord->assumptions ?? [],
            'top_markets' => $forecastRecord->top_markets ?? [],
            'pricing_advice' => $forecastRecord->pricing_advice,
            'restock_advice' => $forecastRecord->restock_advice,
            'reorder_deadline_days' => $forecastRecord->reorder_deadline_days,
            'recommended_order_quantity' => $forecastRecord->recommended_order_quantity,
            'order_recommendation' => $forecastRecord->order_recommendation,
            'order_rationale' => $forecastRecord->order_rationale,
            'seasonality_summary' => $forecastRecord->seasonality_summary,
            'seasonality_best_period' => $forecastRecord->seasonality_best_period,
            'product_health' => $forecastRecord->product_health,
            'product_health_reason' => $forecastRecord->product_health_reason,
            'created_at' => $forecastRecord->created_at?->toIso8601String(),
            'business_profile' => InventoryForecastProfile::sanitize($result['business_profile'] ?? null),
            'user' => $request->user()
                ? $request->user()->only(['id', 'name', 'email'])
                : null,
        ]);
    }

    public function bulkForecast(Request $request)
    {
        $variantIds = $this->normalizeVariantIds($request->input('variant_ids'));

        if ($variantIds === []) {
            return response()->json([
                'message' => 'Vyber alespoň jednu variantu.',
                'queued' => 0,
            ], 422);
        }

        $shopIds = $this->parseIds($request->input('shop_id') ?? $request->input('shop_ids'));
        $context = $request->input('context');

        ForecastInventoryVariantsJob::dispatch(
            $variantIds,
            is_string($context) ? trim($context) : null,
            $shopIds,
            $request->user()?->id
        );

        return response()->json([
            'queued' => count($variantIds),
        ], 202);
    }

    private function buildSalesMetrics(
        ProductVariant $variant,
        array $summary,
        array $shopIds,
        $perShopMetrics
    ): array {
        $trendRows = $this->fetchTrendRows($variant, $shopIds === [] ? null : $shopIds);

        $aggregatedByDate = [];
        $perShopTrend = [];

        foreach ($trendRows as $row) {
            $date = $row->date;
            $revenueBase = $this->currencyConverter->convertToBase(
                isset($row->revenue) ? (float) $row->revenue : null,
                $row->currency_code ?? null
            ) ?? 0.0;
            $aggregatedByDate[$date]['date'] = $date;
            $aggregatedByDate[$date]['quantity'] = ($aggregatedByDate[$date]['quantity'] ?? 0.0) + (float) $row->quantity;
            $aggregatedByDate[$date]['revenue'] = ($aggregatedByDate[$date]['revenue'] ?? 0.0) + $revenueBase;

            if ($row->shop_id !== null) {
                $shopId = (int) $row->shop_id;
                $perShopTrend[$shopId] ??= [];
                $perShopTrend[$shopId][] = [
                    'date' => $date,
                    'quantity' => (float) $row->quantity,
                    'revenue' => $revenueBase,
                ];
            }
        }

        ksort($aggregatedByDate);

        $result = [
            'summaries' => [
                'last_30_days' => [
                    'orders_count' => (int) $summary['last_30_orders_count'],
                    'quantity' => (float) $summary['last_30_quantity'],
                    'revenue' => (float) $summary['last_30_revenue'],
                ],
                'last_90_days' => [
                    'orders_count' => (int) $summary['last_90_orders_count'],
                    'quantity' => (float) $summary['last_90_quantity'],
                    'revenue' => (float) $summary['last_90_revenue'],
                ],
                'lifetime' => [
                    'orders_count' => (int) $summary['lifetime_orders_count'],
                    'quantity' => (float) $summary['lifetime_quantity'],
                    'revenue' => (float) $summary['lifetime_revenue'],
                ],
            ],
            'average_daily_sales' => (float) $summary['average_daily_sales'],
            'stock_runway_days' => $summary['stock_runway_days'],
            'last_sale_at' => $summary['last_sale_at']?->toIso8601String(),
            'metrics_updated_at' => $summary['metrics_updated_at']?->toIso8601String(),
            'trend' => array_values($aggregatedByDate),
            'currency_code' => $summary['currency_code'] ?? ($variant->product?->shop?->currency_code ?? $variant->currency_code),
        ];

        $perShopCollection = collect($perShopMetrics)->keyBy('shop_id');

        if ($perShopCollection->isNotEmpty()) {
            $result['per_shop'] = $perShopCollection
                ->map(function (array $metric) use ($perShopTrend) {
                    $shopId = $metric['shop_id'];

                    return [
                        'shop_id' => $shopId,
                        'shop' => $metric['shop'],
                        'summaries' => $metric['summaries'],
                        'average_daily_sales' => $metric['average_daily_sales'],
                        'stock_runway_days' => $metric['stock_runway_days'],
                        'last_sale_at' => $metric['last_sale_at'] instanceof \DateTimeInterface
                            ? $metric['last_sale_at']->toIso8601String()
                            : $metric['last_sale_at'],
                        'metrics_updated_at' => $metric['metrics_updated_at'] instanceof \DateTimeInterface
                            ? $metric['metrics_updated_at']->toIso8601String()
                            : $metric['metrics_updated_at'],
                        'currency_code' => $metric['currency_code'] ?? null,
                        'trend' => $perShopTrend[$shopId] ?? [],
                    ];
                })
                ->values();
        }

        return $result;
    }

    private function fetchTrendRows(ProductVariant $variant, ?array $shopIds = null)
    {
        $query = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->leftJoin('shops', 'shops.id', '=', 'orders.shop_id')
            ->where('order_items.code', $variant->code)
            ->whereNotNull('orders.ordered_at')
            ->where('orders.ordered_at', '>=', CarbonImmutable::now()->subDays(120));

        if ($shopIds !== null && $shopIds !== []) {
            $query->whereIn('orders.shop_id', $shopIds);
        }

        $this->orderStatusResolver->applyCompletedFilter($query, 'orders.status');

        return $query
            ->groupBy('orders.shop_id', DB::raw('DATE(orders.ordered_at)'), DB::raw('COALESCE(orders.currency_code, shops.currency_code)'))
            ->orderBy(DB::raw('DATE(orders.ordered_at)'))
            ->get([
                DB::raw('orders.shop_id AS shop_id'),
                DB::raw('DATE(orders.ordered_at) AS date'),
                DB::raw('COALESCE(SUM(order_items.amount), 0) AS quantity'),
                DB::raw('COALESCE(SUM(order_items.price_with_vat), 0) AS revenue'),
                DB::raw('COALESCE(orders.currency_code, shops.currency_code) AS currency_code'),
            ]);
    }

    private function applyStockStatusScope(Builder $query, string $status): Builder
    {
        return match ($status) {
            'sold_out' => $query->whereNotNull('stock')->where('stock', '<=', 0),
            'low_stock' => $query
                ->whereNotNull('stock')
                ->where('stock', '>', 0)
                ->whereNotNull('min_stock_supply')
                ->whereColumn('stock', '<', 'min_stock_supply'),
            'in_stock' => $query
                ->where('stock', '>', 0)
                ->where(function (Builder $inner) {
                    $inner->whereNull('min_stock_supply')
                        ->orWhereColumn('stock', '>=', 'min_stock_supply');
                }),
            'unknown' => $query->whereNull('stock'),
            default => $query,
        };
    }

    private function buildVariantsQuery(Request $request, ?string $status = null, array $shopIds = []): Builder
    {
        $status = $status ?? trim((string) $request->query('stock_status', ''));
        $selectedIds = $this->normalizeVariantIds($request->input('ids'));

        $metricsSubquery = DB::table('inventory_variant_metrics')
            ->select('inventory_variant_metrics.product_variant_id')
            ->selectRaw('SUM(inventory_variant_metrics.lifetime_orders_count) AS lifetime_orders_count')
            ->selectRaw('SUM(inventory_variant_metrics.lifetime_quantity) AS lifetime_quantity')
            ->selectRaw('SUM(inventory_variant_metrics.lifetime_revenue) AS lifetime_revenue')
            ->selectRaw('SUM(inventory_variant_metrics.last_30_orders_count) AS last_30_orders_count')
            ->selectRaw('SUM(inventory_variant_metrics.last_30_quantity) AS last_30_quantity')
            ->selectRaw('SUM(inventory_variant_metrics.last_30_revenue) AS last_30_revenue')
            ->selectRaw('SUM(inventory_variant_metrics.last_90_orders_count) AS last_90_orders_count')
            ->selectRaw('SUM(inventory_variant_metrics.last_90_quantity) AS last_90_quantity')
            ->selectRaw('SUM(inventory_variant_metrics.last_90_revenue) AS last_90_revenue')
            ->selectRaw('MAX(inventory_variant_metrics.last_sale_at) AS last_sale_at')
            ->selectRaw('MAX(inventory_variant_metrics.updated_at) AS metrics_updated_at')
            ->selectRaw('MIN(shops.currency_code) AS metrics_currency_code')
            ->leftJoin('shops', 'shops.id', '=', 'inventory_variant_metrics.shop_id')
            ->groupBy('inventory_variant_metrics.product_variant_id');

        if ($shopIds !== []) {
            $metricsSubquery->whereIn('shop_id', $shopIds);
        }

        $latestForecastSubquery = DB::table(DB::raw('(
                SELECT DISTINCT ON (product_variant_id)
                    product_variant_id,
                    order_recommendation,
                    reorder_deadline_days,
                    recommended_order_quantity,
                    seasonality_summary,
                    seasonality_best_period,
                    product_health,
                    product_health_reason,
                    pricing_advice,
                    restock_advice,
                    created_at AS ai_last_forecast_at
                FROM inventory_variant_forecasts
                ORDER BY product_variant_id, created_at DESC, id DESC
            ) AS latest_forecasts'));

        $purchaseOrdersSubquery = DB::table('inventory_purchase_order_items')
            ->select('inventory_purchase_order_items.product_variant_id')
            ->selectRaw('SUM(inventory_purchase_order_items.quantity) AS ordered_quantity')
            ->selectRaw('MIN(inventory_purchase_orders.expected_arrival_at) AS ordered_expected_arrival_at')
            ->join(
                'inventory_purchase_orders',
                'inventory_purchase_orders.id',
                '=',
                'inventory_purchase_order_items.purchase_order_id'
            )
            ->whereNotNull('inventory_purchase_order_items.product_variant_id')
            ->groupBy('inventory_purchase_order_items.product_variant_id');

        $query = ProductVariant::query()
            ->select('product_variants.*', 'products.shop_id as product_shop_id')
            ->addSelect(DB::raw('COALESCE(metrics.lifetime_revenue, 0) AS lifetime_revenue'))
            ->addSelect(DB::raw('COALESCE(metrics.lifetime_orders_count, 0) AS lifetime_orders_count'))
            ->addSelect(DB::raw('COALESCE(metrics.lifetime_quantity, 0) AS lifetime_quantity'))
            ->addSelect(DB::raw('COALESCE(metrics.last_30_revenue, 0) AS last_30_revenue'))
            ->addSelect(DB::raw('COALESCE(metrics.last_30_orders_count, 0) AS last_30_orders_count'))
            ->addSelect(DB::raw('COALESCE(metrics.last_30_quantity, 0) AS last_30_quantity'))
            ->addSelect(DB::raw('COALESCE(metrics.last_90_revenue, 0) AS last_90_revenue'))
            ->addSelect(DB::raw('COALESCE(metrics.last_90_orders_count, 0) AS last_90_orders_count'))
            ->addSelect(DB::raw('COALESCE(metrics.last_90_quantity, 0) AS last_90_quantity'))
            ->addSelect(DB::raw('CASE WHEN COALESCE(metrics.last_30_quantity, 0) > 0 THEN COALESCE(metrics.last_30_quantity, 0) / 30 ELSE 0 END AS average_daily_sales'))
            ->addSelect(DB::raw('CASE WHEN COALESCE(metrics.last_30_quantity, 0) > 0 AND product_variants.stock IS NOT NULL THEN product_variants.stock / NULLIF((COALESCE(metrics.last_30_quantity, 0) / 30), 0) ELSE NULL END AS stock_runway_days'))
            ->addSelect(DB::raw('COALESCE(metrics.metrics_currency_code, product_shops.currency_code, product_variants.currency_code) AS metrics_currency_code'))
            ->addSelect(DB::raw('metrics.last_sale_at AS last_sale_at'))
            ->addSelect(DB::raw('metrics.metrics_updated_at AS metrics_updated_at'))
            ->addSelect(DB::raw('latest_forecasts.order_recommendation AS ai_order_recommendation'))
            ->addSelect(DB::raw('latest_forecasts.reorder_deadline_days AS ai_reorder_deadline_days'))
            ->addSelect(DB::raw('latest_forecasts.recommended_order_quantity AS ai_recommended_order_quantity'))
            ->addSelect(DB::raw('latest_forecasts.pricing_advice AS ai_pricing_advice'))
            ->addSelect(DB::raw('latest_forecasts.restock_advice AS ai_restock_advice'))
            ->addSelect(DB::raw('latest_forecasts.seasonality_summary AS ai_seasonality_summary'))
            ->addSelect(DB::raw('latest_forecasts.seasonality_best_period AS ai_seasonality_best_period'))
            ->addSelect(DB::raw('latest_forecasts.product_health AS ai_product_health'))
            ->addSelect(DB::raw('latest_forecasts.product_health_reason AS ai_product_health_reason'))
            ->addSelect(DB::raw('latest_forecasts.ai_last_forecast_at AS ai_last_forecast_at'))
            ->addSelect(DB::raw('COALESCE(purchase_orders.ordered_quantity, 0) AS ordered_quantity'))
            ->addSelect(DB::raw('purchase_orders.ordered_expected_arrival_at AS ordered_expected_arrival_at'))
            ->leftJoin('products', 'products.id', '=', 'product_variants.product_id')
            ->leftJoin('shops as product_shops', 'product_shops.id', '=', 'products.shop_id')
            ->leftJoinSub($metricsSubquery, 'metrics', 'metrics.product_variant_id', '=', 'product_variants.id')
            ->leftJoinSub($latestForecastSubquery, 'latest_forecasts', 'latest_forecasts.product_variant_id', '=', 'product_variants.id')
            ->leftJoinSub($purchaseOrdersSubquery, 'purchase_orders', 'purchase_orders.product_variant_id', '=', 'product_variants.id')
            ->with([
                'product' => fn ($relation) => $relation
                    ->select('id', 'shop_id', 'external_guid', 'sku', 'status', 'base_payload')
                    ->with('shop:id,currency_code,name,domain'),
                'overlays.shop:id,currency_code,name,domain',
                'tags:id,name,color',
            ]);

        if ($selectedIds !== []) {
            $query->whereIn('product_variants.id', $selectedIds);
        }

        $query->when($request->filled('code'), function (Builder $builder) use ($request) {
            $builder->where('product_variants.code', 'like', '%'.trim((string) $request->query('code')).'%');
        });

        $query->when($request->filled('sku'), function (Builder $builder) use ($request) {
            $builder->where('product_variants.sku', 'like', '%'.trim((string) $request->query('sku')).'%');
        });

        $query->when($request->filled('variant'), function (Builder $builder) use ($request) {
            $builder->where('product_variants.name', 'like', '%'.trim((string) $request->query('variant')).'%');
        });

        $variantNameFilters = array_values(array_unique(array_filter(array_map(
            fn ($value) => Str::lower(trim((string) $value)),
            $this->asArray($request->input('variant_name'))
        ), static fn ($value) => $value !== '')));

        if ($variantNameFilters !== []) {
            $query->where(function (Builder $builder) use ($variantNameFilters) {
                foreach ($variantNameFilters as $variantName) {
                    $builder->orWhere(function (Builder $inner) use ($variantName) {
                        $inner->whereRaw('LOWER(product_variants.name) = ?', [$variantName])
                            ->orWhereRaw("LOWER(product_variants.data::jsonb ->> 'name') = ?", [$variantName])
                            ->orWhereRaw("LOWER(product_variants.data::jsonb ->> 'label') = ?", [$variantName])
                            ->orWhereRaw("LOWER(product_variants.data::jsonb #>> '{attributeCombination,label}') = ?", [$variantName])
                            ->orWhereRaw("LOWER(product_variants.data::jsonb #>> '{attributeCombination,name}') = ?", [$variantName]);
                    });
                }
            });
        }

        $brands = $this->asArray($request->input('brand'));
        if (! empty($brands)) {
            $query->where(function (Builder $builder) use ($brands) {
                $builder->whereIn('product_variants.brand', $brands)
                    ->orWhere(function (Builder $inner) use ($brands) {
                        foreach ($brands as $brand) {
                            $inner->orWhereRaw("(product_variants.data::jsonb #>> '{brand,name}') ILIKE ?", ['%'.$brand.'%']);
                        }
                    })
                    ->orWhere(function (Builder $inner) use ($brands) {
                        foreach ($brands as $brand) {
                            $inner->orWhereRaw("(products.base_payload::jsonb #>> '{brand,name}') ILIKE ?", ['%'.$brand.'%']);
                        }
                    });
            });
        }

        $suppliers = $this->asArray($request->input('supplier'));
        if (! empty($suppliers)) {
            $query->where(function (Builder $builder) use ($suppliers) {
                $builder->whereIn('product_variants.supplier', $suppliers)
                    ->orWhere(function (Builder $inner) use ($suppliers) {
                        foreach ($suppliers as $supplier) {
                            $inner->orWhereRaw("(product_variants.data::jsonb #>> '{supplier,name}') ILIKE ?", ['%'.$supplier.'%']);
                        }
                    })
                    ->orWhere(function (Builder $inner) use ($suppliers) {
                        foreach ($suppliers as $supplier) {
                            $inner->orWhereRaw("(products.base_payload::jsonb #>> '{supplier,name}') ILIKE ?", ['%'.$supplier.'%']);
                        }
                    });
            });
        }

        $defaultCategories = array_values(array_filter(array_map(
            fn ($value) => trim((string) $value),
            $this->asArray($request->input('default_category'))
        ), static fn ($value) => $value !== ''));

        if ($defaultCategories !== []) {
            $query->where(function (Builder $builder) use ($defaultCategories) {
                foreach ($defaultCategories as $category) {
                    $builder->orWhereRaw(
                        "LOWER(COALESCE(products.base_payload::jsonb -> 'defaultCategory' ->> 'name', products.base_payload::jsonb ->> 'defaultCategory')) = ?",
                        [Str::lower($category)]
                    );
                }
            });
        }

        $seasonalityFilters = array_values(array_filter(array_map(
            fn ($value) => trim((string) $value),
            $this->asArray($request->input('seasonality'))
        ), static fn ($value) => $value !== ''));

        if ($seasonalityFilters !== []) {
            $query->where(function (Builder $builder) use ($seasonalityFilters) {
                foreach ($seasonalityFilters as $season) {
                    $builder->orWhereRaw(
                        "EXISTS (
                            SELECT 1
                            FROM jsonb_array_elements(COALESCE(products.base_payload::jsonb -> 'filteringParameters', '[]'::jsonb)) AS params
                            WHERE LOWER(params ->> 'code') = 'rocni-obdobi'
                              AND EXISTS (
                                SELECT 1
                                FROM jsonb_array_elements(COALESCE(params -> 'values', '[]'::jsonb)) AS season_value
                                WHERE LOWER(season_value ->> 'name') = ?
                              )
                        )",
                        [Str::lower($season)]
                    );
                }
            });
        }

        $flagsFilter = $this->asArray($request->input('flag'));
        if ($flagsFilter !== []) {
            $query->where(function (Builder $builder) use ($flagsFilter) {
                foreach ($flagsFilter as $flagCode) {
                    $builder->orWhereRaw(
                        "EXISTS (
                            SELECT 1
                            FROM jsonb_array_elements(COALESCE(products.base_payload::jsonb->'flags', '[]'::jsonb)) AS flag
                            WHERE flag->>'code' = ?
                        )",
                        [$flagCode]
                    );
                }
            });
        }

        $tagIdsFilter = $this->parseIds($request->input('tag_id'));
        if ($tagIdsFilter !== []) {
            $query->whereHas('tags', function (Builder $builder) use ($tagIdsFilter) {
                $builder->whereIn('product_variant_tags.id', $tagIdsFilter);
            });
        }

        $query->whereDoesntHave('tags', function (Builder $builder) use ($tagIdsFilter) {
            $builder->where('product_variant_tags.is_hidden', true);

            if ($tagIdsFilter !== []) {
                $builder->whereNotIn('product_variant_tags.id', $tagIdsFilter);
            }
        });

        $aiRecommendations = $this->asArray($request->input('ai_order_recommendation'));
        if (! empty($aiRecommendations)) {
            $query->whereIn('latest_forecasts.order_recommendation', $aiRecommendations);
        }

        $query->when($request->filled('ean'), function (Builder $builder) use ($request) {
            $builder->where('product_variants.ean', 'like', '%'.trim((string) $request->query('ean')).'%');
        });

        $query->when($request->filled('product'), function (Builder $builder) use ($request) {
            $term = trim((string) $request->query('product'));
            $builder->where(function (Builder $relation) use ($term) {
                $relation->where('products.external_guid', 'like', '%'.$term.'%')
                    ->orWhere('products.sku', 'like', '%'.$term.'%');
            });
        });

        $query->when($request->filled('product_name'), function (Builder $builder) use ($request) {
            $term = trim((string) $request->query('product_name'));
            $builder->whereHas('product.translations', function (Builder $relation) use ($term) {
                $relation->where('name', 'like', '%'.$term.'%');
            });
        });

        $query->when($request->filled('search'), function (Builder $builder) use ($request) {
            $term = trim((string) $request->query('search'));
            $builder->where(function (Builder $nested) use ($term) {
                $nested->where('product_variants.code', 'like', '%'.$term.'%')
                    ->orWhere('product_variants.sku', 'like', '%'.$term.'%')
                    ->orWhere('product_variants.ean', 'like', '%'.$term.'%')
                    ->orWhere('product_variants.name', 'like', '%'.$term.'%')
                    ->orWhere('product_variants.brand', 'like', '%'.$term.'%')
                    ->orWhere('product_variants.supplier', 'like', '%'.$term.'%')
                    ->orWhere('products.external_guid', 'like', '%'.$term.'%')
                    ->orWhere('products.sku', 'like', '%'.$term.'%')
                    ->orWhereHas('product.translations', function (Builder $relation) use ($term) {
                        $relation->where('name', 'like', '%'.$term.'%');
                    });
            });
        });

        if ($status && $status !== 'all') {
            $this->applyStockStatusScope($query, $status);
        }

        $sortBy = $request->query('sort_by', 'code');
        $allowedSort = [
            'code' => 'product_variants.code',
            'variant' => 'product_variants.name',
            'brand' => 'product_variants.brand',
            'supplier' => 'product_variants.supplier',
            'stock' => 'product_variants.stock',
            'ordered' => 'purchase_orders.ordered_quantity',
            'min_stock_supply' => 'product_variants.min_stock_supply',
            'price' => 'product_variants.price',
            'purchase_price' => 'product_variants.purchase_price',
            'lifetime_revenue' => 'lifetime_revenue',
            'last_30_quantity' => 'last_30_quantity',
            'average_daily_sales' => 'average_daily_sales',
            'stock_runway_days' => 'stock_runway_days',
        ];

        $sortColumn = $allowedSort[$sortBy] ?? 'product_variants.code';
        $sortDir = strtolower((string) $request->query('sort_dir', 'asc')) === 'desc' ? 'desc' : 'asc';

        $query->orderBy($sortColumn, $sortDir);

        return $query;
    }

    private function calculateAverageDailySales(ProductVariant $variant): float
    {
        $quantity = (float) ($variant->getAttribute('last_30_quantity') ?? 0.0);

        return $quantity > 0 ? $quantity / 30 : 0.0;
    }

    private function calculateStockRunway(ProductVariant $variant, ?float $averageDailySales = null): ?float
    {
        $averageDailySales ??= (float) ($variant->getAttribute('average_daily_sales') ?? 0.0);
        $stock = (float) ($variant->stock ?? 0.0);

        if ($averageDailySales <= 0) {
            return null;
        }

        return $stock > 0 ? $stock / $averageDailySales : null;
    }

    private function resolveProductNameLabel(ProductVariant $variant): string
    {
        $product = $variant->product;

        if ($product) {
            $payload = $product->base_payload;

            if (is_array($payload)) {
                $name = Arr::get($payload, 'name');

                if (is_string($name)) {
                    $trimmed = trim($name);

                    if ($trimmed !== '') {
                        return $trimmed;
                    }
                }
            }

            $externalGuid = $product->external_guid;

            if (is_string($externalGuid)) {
                $trimmed = trim($externalGuid);

                if ($trimmed !== '') {
                    return $trimmed;
                }
            }
        }

        return '';
    }

    private function parseIds(mixed $value): array
    {
        if ($value === null || $value === '') {
            return [];
        }

        $items = is_array($value) ? $value : explode(',', (string) $value);

        return array_values(array_filter(array_map(function ($item) {
            if (is_numeric($item)) {
                return (int) $item;
            }

            if (is_string($item) && ctype_digit($item)) {
                return (int) $item;
            }

            return null;
        }, $items), static fn ($id) => $id !== null));
    }

    /**
     * @return string[]
     */
    private function normalizeVariantIds(mixed $value): array
    {
        if ($value === null || $value === '') {
            return [];
        }

        $items = is_array($value) ? $value : explode(',', (string) $value);
        $normalized = [];

        foreach ($items as $item) {
            if ($item === null) {
                continue;
            }

            $candidate = trim((string) $item);

            if ($candidate !== '') {
                $normalized[] = $candidate;
            }
        }

        return array_values(array_unique($normalized));
    }

    private function asArray(mixed $value): array
    {
        if (is_array($value)) {
            return array_filter($value, fn ($item) => $item !== null && $item !== '');
        }

        if (is_string($value) && $value !== '') {
            return array_map('trim', explode(',', $value));
        }

        return [];
    }

    private function extractProductFlags(ProductVariant $variant): array
    {
        $payload = $variant->product?->base_payload ?? [];

        if (! is_array($payload)) {
            return [];
        }

        $rawFlags = Arr::get($payload, 'flags', []);

        if (! is_array($rawFlags) || $rawFlags === []) {
            return [];
        }

        $flags = [];

        foreach ($rawFlags as $flag) {
            if (! is_array($flag)) {
                continue;
            }

            $code = isset($flag['code']) ? trim((string) $flag['code']) : '';

            if ($code === '') {
                continue;
            }

            $title = isset($flag['title']) ? trim((string) $flag['title']) : $code;
            $dateFrom = isset($flag['dateFrom']) ? (string) $flag['dateFrom'] : null;
            $dateTo = isset($flag['dateTo']) ? (string) $flag['dateTo'] : null;

            $flags[$code] = [
                'code' => $code,
                'title' => $title,
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
            ];
        }

        if ($flags === []) {
            return [];
        }

        $result = array_values($flags);

        usort($result, static function (array $left, array $right) {
            return strcasecmp($left['title'], $right['title']);
        });

        return $result;
    }

    /**
     * @return array{stock: float|null, min_stock_supply: float|null, shop_id: int|null}
     */
    private function resolveSharedStock(ProductVariant $variant): array
    {
        return [
            'stock' => $variant->stock !== null ? (float) $variant->stock : null,
            'min_stock_supply' => $variant->min_stock_supply !== null ? (float) $variant->min_stock_supply : null,
            'shop_id' => $variant->product?->shop_id,
        ];
    }

    private function resolveDefaultCategoryName(ProductVariant $variant): ?string
    {
        $payload = $variant->product?->base_payload;

        return $this->extractDefaultCategoryFromPayload(is_array($payload) ? $payload : null);
    }

    /**
     * @return list<string>
     */
    private function extractSeasonalityLabels(ProductVariant $variant): array
    {
        $payload = $variant->product?->base_payload;

        return $this->extractSeasonalityLabelsFromPayload(is_array($payload) ? $payload : null);
    }

    private function extractDefaultCategoryFromPayload(?array $payload): ?string
    {
        if (! $payload) {
            return null;
        }

        $defaultCategory = $payload['defaultCategory'] ?? null;

        if (is_array($defaultCategory)) {
            $name = isset($defaultCategory['name']) ? trim((string) $defaultCategory['name']) : '';

            return $name !== '' ? $name : null;
        }

        if (is_string($defaultCategory)) {
            $name = trim($defaultCategory);

            return $name !== '' ? $name : null;
        }

        return null;
    }

    /**
     * @return list<string>
     */
    private function extractSeasonalityLabelsFromPayload(?array $payload): array
    {
        if (! $payload) {
            return [];
        }

        $parameters = $payload['filteringParameters'] ?? [];

        if (! is_array($parameters) || $parameters === []) {
            return [];
        }

        $labels = [];

        foreach ($parameters as $parameter) {
            if (! is_array($parameter)) {
                continue;
            }

            $code = isset($parameter['code']) ? strtolower(trim((string) $parameter['code'])) : '';

            if ($code !== 'rocni-obdobi') {
                continue;
            }

            $values = $parameter['values'] ?? [];

            if (! is_array($values) || $values === []) {
                continue;
            }

            foreach ($values as $value) {
                if (! is_array($value)) {
                    continue;
                }

                $name = isset($value['name']) ? trim((string) $value['name']) : '';

                if ($name !== '') {
                    $labels[] = $name;
                }
            }
        }

        return array_values(array_unique($labels));
    }
}
