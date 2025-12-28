<?php

namespace Modules\Pim\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Modules\Orders\Models\OrderItem;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ProductRemoteRef;
use Modules\Pim\Models\ProductVariant;
use Modules\Pim\Models\ProductVariantShopOverlay;
use Modules\Pim\Models\ProductShopOverlay;
use Modules\Shoptet\Contracts\ShoptetClient;
use Modules\Shoptet\Models\Shop;

class CategoryProductPriorityService
{
    public function __construct(private readonly ShoptetClient $shoptetClient)
    {
    }

    public function fetch(Shop $shop, string $categoryGuid, int $page = 1, int $perPage = 20): array
    {
        $response = $this->shoptetClient->getCategoryProductsPriority($shop, $categoryGuid, [
            'page' => $page,
            'itemsPerPage' => $perPage,
        ]);

        if (isset($response['raw'])) {
            $response = [];
        }

        $rawProducts = Arr::get($response, 'data.categoryProducts', []);

        if ($rawProducts === [] && Arr::get($response, 'categoryProducts')) {
            $rawProducts = Arr::get($response, 'categoryProducts');
        }

        if (is_array($rawProducts) && Arr::isAssoc($rawProducts) && isset($rawProducts['items'])) {
            $rawProducts = $rawProducts['items'];
        }

        if (! is_array($rawProducts)) {
            $rawProducts = [];
        }

        $categoryProducts = collect($rawProducts)
            ->map(function ($item) {
                $guid = (string) ($item['productGuid'] ?? '');

                return [
                    'product_guid' => $guid,
                    'priority' => isset($item['priority']) ? (int) $item['priority'] : null,
                ];
            })
            ->filter(fn (array $item) => $item['product_guid'] !== '')
            ->values();

        $paginatorRaw = Arr::get($response, 'data.paginator', Arr::get($response, 'paginator', []));
        $perPageUsed = (int) ($paginatorRaw['itemsPerPage'] ?? $perPage);
        if ($perPageUsed <= 0) {
            $perPageUsed = $perPage;
        }

        $currentPage = (int) ($paginatorRaw['page'] ?? $page);
        if ($currentPage <= 0) {
            $currentPage = $page;
        }

        $startPosition = ($currentPage - 1) * $perPageUsed;

        $guids = $categoryProducts->pluck('product_guid')->unique()->all();

        $masterShopId = Shop::query()->where('is_master', true)->value('id');

        $variantOverlayShopIds = array_values(array_filter([
            $masterShopId,
            $shop->id,
        ]));

        $productMap = $guids === []
            ? collect()
            : ProductRemoteRef::query()
                ->where('shop_id', $shop->id)
                ->whereIn('remote_guid', $guids)
                ->with(['product' => function ($query) use ($shop, $variantOverlayShopIds) {
                    $query->with([
                        'shop',
                        'variants',
                        'overlays' => function ($overlayQuery) use ($shop) {
                            $overlayQuery->where('shop_id', $shop->id);
                        },
                        'translations' => function ($translationQuery) use ($shop) {
                            $translationQuery
                                ->where('shop_id', $shop->id)
                                ->orderByRaw("CASE status WHEN 'synced' THEN 0 WHEN 'approved' THEN 1 WHEN 'in_review' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END")
                                ->orderByDesc('updated_at');
                        },
                    ]);

                    if ($variantOverlayShopIds !== []) {
                        $query->with(['variants.overlays' => function ($overlayQuery) use ($variantOverlayShopIds) {
                            $overlayQuery->whereIn('shop_id', $variantOverlayShopIds);
                        }]);
                    }
                }])
                ->get()
                ->keyBy('remote_guid');

        $purchaseCounts = $guids === []
            ? collect()
            : OrderItem::query()
                ->selectRaw('product_guid, COUNT(*) as purchase_count')
                ->whereIn('product_guid', $guids)
                ->whereHas('order', function ($query) use ($shop) {
                    $query->where('shop_id', $shop->id)
                        ->where('ordered_at', '>=', CarbonImmutable::now()->subDays(30));
                })
                ->groupBy('product_guid')
                ->pluck('purchase_count', 'product_guid');

        $variantPurchaseCounts = $guids === []
            ? collect()
            : OrderItem::query()
                ->selectRaw('product_guid, code, COUNT(*) as purchase_count')
                ->whereIn('product_guid', $guids)
                ->whereNotNull('code')
                ->whereHas('order', function ($query) use ($shop) {
                    $query->where('shop_id', $shop->id)
                        ->where('ordered_at', '>=', CarbonImmutable::now()->subDays(30));
                })
                ->groupBy('product_guid', 'code')
                ->get()
                ->mapWithKeys(function ($row) {
                    $productGuid = strtolower((string) $row->product_guid);
                    $code = strtolower((string) $row->code);

                    if ($productGuid === '' || $code === '') {
                        return [];
                    }

                    return [$productGuid.'|'.$code => (int) $row->purchase_count];
                });

        $items = $categoryProducts->map(function (array $item, int $index) use ($productMap, $purchaseCounts, $variantPurchaseCounts, $shop, $startPosition, $masterShopId) {
            $guid = $item['product_guid'];
            /** @var ProductRemoteRef|null $remoteRef */
            $remoteRef = $productMap->get($guid);
            $product = $remoteRef?->product;

            $translationName = $product?->translations->first()?->name ?? null;
            $baseName = $product instanceof Product ? ($product->base_payload['name'] ?? null) : null;
            $productName = $translationName
                ?? ($baseName !== null ? (string) $baseName : null)
                ?? $product?->sku
                ?? $guid;

            $variantMetrics = $product
                ? $this->buildVariantMetrics($product, $shop, $variantPurchaseCounts, $guid, $masterShopId)
                : ['total_stock' => null, 'variants' => []];

            $stock = $variantMetrics['total_stock'];
            $variantDetails = $variantMetrics['variants'];
            $productVisibility = $product ? $this->resolveProductVisibility($product, $shop) : null;

            return [
                'position' => $startPosition + $index + 1,
                'product_guid' => $guid,
                'product_id' => $product?->id,
                'sku' => $product?->sku,
                'name' => $productName,
                'priority' => $item['priority'],
                'stock' => $stock,
                'purchases_30d' => (int) ($purchaseCounts[$guid] ?? 0),
                'visibility' => $productVisibility,
                'variants' => $variantDetails,
            ];
        })->all();

        $totalCount = (int) ($paginatorRaw['totalCount'] ?? count($items));
        $pageCount = (int) ($paginatorRaw['pageCount'] ?? (int) ceil(max($totalCount, 1) / max($perPageUsed, 1)));
        $itemsOnPage = (int) ($paginatorRaw['itemsOnPage'] ?? count($items));

        return [
            'data' => [
                'items' => $items,
                'paginator' => [
                    'total' => $totalCount,
                    'page' => $currentPage,
                    'page_count' => max($pageCount, 1),
                    'per_page' => $perPageUsed,
                    'items_on_page' => $itemsOnPage,
                ],
            ],
            'errors' => Arr::get($response, 'errors', []),
        ];
    }

    public function update(Shop $shop, string $categoryGuid, array $updates): array
    {
        $normalized = collect($updates)
            ->map(function ($item) {
                if (! is_array($item)) {
                    return null;
                }

                $guid = (string) ($item['product_guid'] ?? $item['productGuid'] ?? '');
                if ($guid === '') {
                    return null;
                }

                $priorityRaw = $item['priority'] ?? null;
                $priority = is_numeric($priorityRaw) ? (int) $priorityRaw : null;

                return [
                    'productGuid' => $guid,
                    'priority' => $priority,
                ];
            })
            ->filter()
            ->values()
            ->all();

        if ($normalized === []) {
            return [
                'data' => [
                    'categoryProducts' => [],
                ],
                'errors' => [],
            ];
        }

        $response = $this->shoptetClient->updateCategoryProductsPriority($shop, $categoryGuid, $normalized);

        if (isset($response['raw'])) {
            return [
                'data' => null,
                'errors' => [],
            ];
        }

        return $response;
    }

    private function buildVariantMetrics(
        Product $product,
        Shop $shop,
        Collection $variantPurchaseCounts,
        string $productGuid,
        ?int $masterShopId
    ): array {
        $total = 0.0;
        $found = false;
        $variantsData = [];

        $variants = $product->relationLoaded('variants')
            ? $product->variants
            : ProductVariant::query()->where('product_id', $product->id)->get();

        $preferredShopIds = $masterShopId ? [$masterShopId] : [];

        foreach ($variants as $variant) {
            /** @var ProductVariant $variant */
            $stock = null;

            foreach ($preferredShopIds as $preferredShopId) {
                $overlayStock = $preferredShopId !== null
                    ? $this->resolveOverlayStock($variant, (int) $preferredShopId)
                    : null;

                if ($overlayStock !== null) {
                    $stock = (float) $overlayStock;
                    break;
                }
            }

            if ($stock === null && $variant->stock !== null) {
                $stock = (float) $variant->stock;
            }

            if ($stock !== null) {
                $total += $stock;
                $found = true;
            }

            $variantCode = $variant->code ?? $variant->sku ?? null;
            $purchaseKey = $variantCode
                ? strtolower($productGuid).'|'.strtolower((string) $variantCode)
                : null;
            $variantPurchases = $purchaseKey ? (int) $variantPurchaseCounts->get($purchaseKey, 0) : 0;
            $variantVisibility = $this->resolveVariantVisibility($variant, $shop);

            $variantsData[] = [
                'variant_id' => $variant->id,
                'code' => $variantCode,
                'name' => $variant->name,
                'stock' => $stock,
                'visibility' => $variantVisibility,
                'purchases_30d' => $variantPurchases,
            ];
        }

        return [
            'total_stock' => $found ? $total : null,
            'variants' => $variantsData,
        ];
    }

    private function resolveOverlayStock(ProductVariant $variant, int $shopId): ?float
    {
        if ($variant->relationLoaded('overlays')) {
            $overlay = $variant->overlays->firstWhere('shop_id', $shopId);

            if ($overlay && $overlay->stock !== null) {
                return (float) $overlay->stock;
            }

            return null;
        }

        $stock = ProductVariantShopOverlay::query()
            ->where('product_variant_id', $variant->id)
            ->where('shop_id', $shopId)
            ->value('stock');

        return $stock !== null ? (float) $stock : null;
    }

    private function resolveProductVisibility(Product $product, Shop $shop): ?string
    {
        $overlayVisibility = $product->relationLoaded('overlays')
            ? $product->overlays->firstWhere('shop_id', $shop->id)?->status
            : ProductShopOverlay::query()
                ->where('product_id', $product->id)
                ->where('shop_id', $shop->id)
                ->value('status');

        if ($overlayVisibility) {
            return $this->normalizeVisibilityValue($overlayVisibility);
        }

        $overlayDataVisibility = $product->relationLoaded('overlays')
            ? $this->extractVisibilityFromPayload($product->overlays->firstWhere('shop_id', $shop->id)?->data)
            : null;

        if ($overlayDataVisibility) {
            return $overlayDataVisibility;
        }

        if ($product->status) {
            return $this->normalizeVisibilityValue($product->status);
        }

        return $this->extractVisibilityFromPayload($product->base_payload ?? []);
    }

    private function resolveVariantVisibility(ProductVariant $variant, Shop $shop): ?string
    {
        if ($variant->relationLoaded('overlays')) {
            $overlay = $variant->overlays->firstWhere('shop_id', $shop->id);
            $visibility = $this->extractVisibilityFromPayload($overlay?->data ?? []);

            if ($visibility) {
                return $visibility;
            }
        }

        $overlayPayload = ProductVariantShopOverlay::query()
            ->where('product_variant_id', $variant->id)
            ->where('shop_id', $shop->id)
            ->value('data');

        if (is_array($overlayPayload)) {
            $visibility = $this->extractVisibilityFromPayload($overlayPayload);
            if ($visibility) {
                return $visibility;
            }
        }

        return $this->extractVisibilityFromPayload($variant->data ?? []);
    }

    private function extractVisibilityFromPayload(array|string|null $payload): ?string
    {
        if (! is_array($payload)) {
            if (is_string($payload) && $payload !== '') {
                return $this->normalizeVisibilityValue($payload);
            }

            return null;
        }

        $visibility = $payload['visibility'] ?? $payload['status'] ?? ($payload['visible'] ?? null);

        if ($visibility === null && array_key_exists('hidden', $payload)) {
            $visibility = $payload['hidden'] ? 'hidden' : 'visible';
        }

        return $this->normalizeVisibilityValue($visibility);
    }

    private function normalizeVisibilityValue(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        if (is_bool($value)) {
            return $value ? 'visible' : 'hidden';
        }

        if (is_numeric($value)) {
            return (int) $value === 1 ? 'visible' : 'hidden';
        }

        if (! is_string($value)) {
            return null;
        }

        $normalized = strtolower(trim($value));

        return match ($normalized) {
            'yes', 'true', 'visible', 'show', 'shown', 'active', 'available', 'public' => 'visible',
            'no', 'false', 'hidden', 'inactive', 'disabled', 'private', 'blocked', 'unavailable' => 'hidden',
            '' => null,
            default => $value,
        };
    }
}
