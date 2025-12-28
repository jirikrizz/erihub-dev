<?php

namespace Modules\Shoptet\Services;

use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ProductTranslation;
use Modules\Pim\Models\ProductVariant;
use Modules\Pim\Models\ProductVariantShopOverlay;
use Modules\Pim\Models\ProductVariantTranslation;
use Modules\Pim\Models\ShopAttributeMapping;
use Modules\Pim\Services\CategoryMappingService;
use Modules\Shoptet\Models\Shop;

class ProductPublicationBuilder
{
    public function __construct(
        private readonly CategoryMappingService $categoryMapping
    ) {
    }

    /**
     * @var array<string, \Illuminate\Support\Collection|\Illuminate\Database\Eloquent\Collection>
     */
    private array $variantMappingCache = [];

    /**
     * @return array{
     *     data: array<string, mixed>,
     *     images: array<int, array<string, mixed>>
     * }
     */
    public function buildCreatePayload(Product $product, ProductTranslation $translation, Shop $shop): array
    {
        $basePayload = $product->base_payload ?? [];
        $overlay = $this->resolveProductOverlayData($product, $shop);

        $mappedCategories = $this->resolveMappedCategories($product, $shop, $basePayload, $overlay);
        $defaultCategoryGuid = $mappedCategories['default'] ?? null;
        $categoryGuids = $mappedCategories['all'];

        if ($defaultCategoryGuid === null || $categoryGuids === []) {
            throw new \RuntimeException('Nelze vytvořit produkt – chybí mapování kategorií pro cílový shop.');
        }

        $productData = $this->filterNull([
            'type' => $overlay['type']
                ?? Arr::get($basePayload, 'type')
                ?? 'product',
            'visibility' => $overlay['visibility']
                ?? $overlay['status']
                ?? Arr::get($basePayload, 'visibility')
                ?? 'visible',
            'name' => $this->sanitizeScalar(
                $translation->name
                    ?? $overlay['name']
                    ?? Arr::get($basePayload, 'name')
            ),
            'shortDescription' => $this->sanitizeScalar(
                $translation->short_description
                    ?? $overlay['shortDescription']
                    ?? Arr::get($basePayload, 'shortDescription')
            ),
            'description' => $this->sanitizeScalar(
                $translation->description
                    ?? $overlay['description']
                    ?? Arr::get($basePayload, 'description')
            ),
            'additionalName' => $this->sanitizeScalar(
                Arr::get($overlay, 'additionalName')
                    ?? Arr::get($translation->seo ?? [], 'additionalName')
                    ?? Arr::get($basePayload, 'additionalName')
            ),
            'metaTitle' => $this->sanitizeScalar(
                Arr::get($translation->seo ?? [], 'metaTitle')
                    ?? Arr::get($overlay, 'metaTitle')
                    ?? Arr::get($basePayload, 'metaTitle')
            ),
            'metaDescription' => $this->sanitizeScalar(
                Arr::get($translation->seo ?? [], 'metaDescription')
                    ?? Arr::get($overlay, 'metaDescription')
                    ?? Arr::get($basePayload, 'metaDescription')
            ),
            'adult' => $overlay['adult']
                ?? Arr::get($basePayload, 'adult'),
            'defaultCategoryGuid' => $defaultCategoryGuid,
            'categoryGuids' => $categoryGuids,
            'brandCode' => Arr::get($overlay, 'brand.code')
                ?? Arr::get($basePayload, 'brand.code'),
            'supplierGuid' => $this->resolveSupplierGuid($overlay, $basePayload, $shop),
            'indexName' => $this->resolveIndexName($translation, $overlay, $basePayload),
            'descriptiveParameters' => $this->resolveDescriptiveParameters(
                $translation->parameters
                    ?? $overlay['descriptiveParameters']
                    ?? Arr::get($basePayload, 'descriptiveParameters')
            ),
            'filteringParameters' => $this->resolveFilteringParameters(
                Arr::get((array) ($translation->parameters ?? []), 'filteringParameters')
                    ?? Arr::get($overlay, 'filteringParameters')
                    ?? Arr::get($basePayload, 'filteringParameters')
            ),
        ]);

        $variants = $this->buildVariantPayloads($product, $shop);
        if ($variants === []) {
            throw new \RuntimeException('Nelze vytvořit produkt bez variant. Nejprve zkontroluj data ve skladu.');
        }

        $productData['variants'] = $variants;

        return [
            'data' => $productData,
            'images' => $this->buildImagePayloads($product, $basePayload, $overlay),
        ];
    }

    private function resolveSupplierGuid(array $overlay, array $basePayload, Shop $shop): ?string
    {
        $overlaySupplier = Arr::get($overlay, 'supplier.guid');
        if (is_string($overlaySupplier) && trim($overlaySupplier) !== '') {
            return $overlaySupplier;
        }

        if ($shop->is_master) {
            $canonicalSupplier = Arr::get($basePayload, 'supplier.guid');
            if (is_string($canonicalSupplier) && trim($canonicalSupplier) !== '') {
                return $canonicalSupplier;
            }
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    public function buildUpdatePayload(Product $product, ProductTranslation $translation, Shop $shop): array
    {
        $seo = $translation->seo ?? [];

        $payload = $this->filterNull([
            'name' => $this->sanitizeScalar($translation->name),
            'shortDescription' => $this->sanitizeScalar($translation->short_description),
            'description' => $this->sanitizeScalar($translation->description),
            'descriptiveParameters' => $this->normalizeDescriptiveParameters($translation->parameters),
            'metaTitle' => $this->sanitizeScalar(Arr::get($seo, 'metaTitle')),
            'metaDescription' => $this->sanitizeScalar(Arr::get($seo, 'metaDescription')),
        ]);

        return $payload;
    }

    /**
     * @return array<string, mixed>
     */
    private function resolveProductOverlayData(Product $product, Shop $shop): array
    {
        $overlay = $product->overlays
            ? $product->overlays->firstWhere('shop_id', $shop->id)
            : null;

        if (! $overlay) {
            return [];
        }

        $data = is_array($overlay->data) ? $overlay->data : [];

        if ($overlay->status && ! array_key_exists('status', $data)) {
            $data['status'] = $overlay->status;
        }

        if ($overlay->currency_code && ! array_key_exists('currencyCode', $data)) {
            $data['currencyCode'] = $overlay->currency_code;
        }

        return $data;
    }

    /**
     * @param array<string, mixed> $basePayload
     * @param array<string, mixed> $overlay
     * @return array{default: ?string, all: array<int, string>}
     */
    private function resolveMappedCategories(Product $product, Shop $shop, array $basePayload, array $overlay): array
    {
        $mapped = Arr::get($overlay, '_hub.mappedCategories')
            ?? Arr::get($overlay, 'mappedCategories')
            ?? [];

        if (! is_array($mapped) || $mapped === []) {
            $canonicalGuids = $this->extractCanonicalCategoryGuids($basePayload);
            if ($canonicalGuids !== []) {
                $mapped = $this->categoryMapping->mapCanonicalCategoriesToShop($canonicalGuids, $shop);
            }
        }

        $defaultCanonical = Arr::get($basePayload, 'defaultCategory.guid')
            ?? Arr::get($basePayload, 'defaultCategoryGuid');

        $categoryGuids = [];
        $defaultRemote = null;
        $missingNonDefault = [];

        foreach ($mapped as $entry) {
            $canonicalGuid = $entry['guid'] ?? null;
            $remoteGuid = Arr::get($entry, 'mapping.shop_category.remote_guid');

            if (is_string($remoteGuid) && $remoteGuid !== '') {
                $categoryGuids[] = $remoteGuid;

                if ($defaultCanonical && $canonicalGuid === $defaultCanonical) {
                    $defaultRemote = $remoteGuid;
                }

                continue;
            }

            if ($canonicalGuid && $defaultCanonical && $canonicalGuid === $defaultCanonical) {
                continue;
            }

            if ($canonicalGuid) {
                $missingNonDefault[] = array_filter([
                    'guid' => $canonicalGuid,
                    'name' => $entry['name'] ?? null,
                    'path' => $entry['path'] ?? null,
                ], fn ($value) => $value !== null && $value !== '');
            }
        }

        if ($missingNonDefault !== []) {
            Log::warning('Skipping unmapped non-default categories during Shoptet publication.', [
                'product_id' => $product->id,
                'shop_id' => $shop->id,
                'categories' => $missingNonDefault,
            ]);
        }

        $categoryGuids = array_values(array_unique($categoryGuids));

        if (! $defaultRemote) {
            $defaultRemote = $categoryGuids[0] ?? null;
        }

        return [
            'default' => $defaultRemote,
            'all' => $categoryGuids,
        ];
    }

    /**
     * @param array<string, mixed>|null $payload
     * @return array<int, string>
     */
    private function extractCanonicalCategoryGuids(?array $payload): array
    {
        if (! $payload) {
            return [];
        }

        $guids = [];

        $default = Arr::get($payload, 'defaultCategory.guid');
        if (is_string($default) && $default !== '') {
            $guids[] = $default;
        }

        $categories = Arr::get($payload, 'categories');
        if (is_array($categories)) {
            foreach ($categories as $category) {
                if (! is_array($category)) {
                    continue;
                }
                $guid = $category['guid'] ?? null;
                if (is_string($guid) && $guid !== '') {
                    $guids[] = $guid;
                }
            }
        }

        return array_values(array_unique($guids));
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function buildVariantPayloads(Product $product, Shop $shop): array
    {
        $variants = [];

        $multipleVariants = ($product->variants->count() ?? 0) > 1;

        foreach ($product->variants as $variant) {
            $payload = $this->buildSingleVariantPayload($variant, $product, $shop, $multipleVariants);
            if ($payload !== null) {
                $variants[] = $payload;
            }
        }

        return $variants;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function buildPricelistUpdatePayload(Product $product, Shop $shop): array
    {
        $items = [];

        foreach ($product->variants as $variant) {
            $code = $variant->code;
            if (! is_string($code) || $code === '') {
                continue;
            }

            $overlay = $this->resolveVariantOverlay($variant, $shop);

            $price = $overlay?->price ?? $variant->price;
            $currency = $overlay?->currency_code
                ?? $variant->currency_code
                ?? $shop->currency_code;
            $purchasePrice = $overlay?->purchase_price ?? $variant->purchase_price;
            $vatRate = $overlay?->vat_rate ?? $variant->vat_rate;

            if ($price === null || ! is_string($currency) || $currency === '') {
                continue;
            }

            $item = [
                'code' => $code,
                'currencyCode' => $currency,
                'includingVat' => true,
                'price' => [
                    'price' => $this->formatPrice($price),
                ],
            ];

            if ($purchasePrice !== null) {
                $item['price']['buyPrice'] = $this->formatPrice($purchasePrice);
            }

            if ($vatRate !== null) {
                $item['vatRate'] = $this->formatVatRate($vatRate);
            }

            $items[] = $item;
        }

        return $items;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function buildSingleVariantPayload(
        ProductVariant $variant,
        Product $product,
        Shop $shop,
        bool $requireParameters
    ): ?array
    {
        $code = $variant->code;
        if (! $code) {
            return null;
        }

        $overlay = $this->resolveVariantOverlay($variant, $shop);
        $translation = $this->resolveVariantTranslation($variant, $shop);
        $canonical = is_array($variant->data) ? $variant->data : [];

        $price = $overlay?->price ?? $variant->price;
        $currency = $overlay?->currency_code
            ?? $variant->currency_code
            ?? $shop->currency_code;

        if ($price === null || $currency === null) {
            throw new \RuntimeException("Varianta {$code} nemá nastavenou cenu nebo měnu.");
        }

        $parameters = $this->resolveVariantParameters($variant, $translation, $overlay);

        if ($requireParameters && $parameters === []) {
            throw new \RuntimeException("Varianta {$code} postrádá parametry kombinace.");
        }

        $parameters = $this->mapVariantParametersToShop($parameters, $product, $shop);

        $stock = $overlay?->stock ?? $variant->stock;

        $payload = $this->filterNull([
            'code' => $code,
            'ean' => $variant->ean ?? Arr::get($canonical, 'ean'),
            'price' => $this->formatPrice($price),
            'currencyCode' => $currency,
            'manufacturerCode' => $variant->sku ?? Arr::get($canonical, 'manufacturerCode'),
            'parameters' => $parameters !== [] ? $parameters : null,
            'minStockSupply' => $this->formatAmount($overlay?->min_stock_supply ?? $variant->min_stock_supply),
            'availabilityId' => Arr::get($overlay?->data ?? [], 'availabilityId')
                ?? Arr::get($canonical, 'availabilityId'),
            'availabilityWhenSoldOutId' => Arr::get($overlay?->data ?? [], 'availabilityWhenSoldOutId')
                ?? Arr::get($canonical, 'availabilityWhenSoldOutId'),
            'weight' => $this->formatWeight(Arr::get($overlay?->data ?? [], 'weight') ?? $variant->weight ?? Arr::get($canonical, 'weight')),
        ]);

        $stocksLocations = $this->normalizeStocksLocations(
            Arr::get($overlay?->data ?? [], 'stocksLocations')
                ?? Arr::get($canonical, 'stocksLocations')
                ?? Arr::get($canonical, 'perStockAmounts')
        );

        $formattedStock = $this->formatAmount($stock);

        if ($stocksLocations !== [] && $formattedStock !== null) {
            foreach ($stocksLocations as &$location) {
                if (! is_array($location)) {
                    continue;
                }

                if (! array_key_exists('stockId', $location)) {
                    continue;
                }

                $location['amount'] = $formattedStock;
                break;
            }
            unset($location);
        }

        if ($stocksLocations === [] && $formattedStock !== null) {
            $stocksLocations = [[
                'stockId' => 1,
                'amount' => $formattedStock,
            ]];
        }

        if ($stocksLocations !== []) {
            $payload['stocksLocations'] = $stocksLocations;
        }

        return $payload;
    }

    private function resolveVariantOverlay(ProductVariant $variant, Shop $shop): ?ProductVariantShopOverlay
    {
        if (! $variant->relationLoaded('overlays')) {
            return null;
        }

        /** @var ProductVariantShopOverlay|null $overlay */
        $overlay = $variant->overlays->firstWhere('shop_id', $shop->id);

        return $overlay;
    }

    private function resolveVariantTranslation(ProductVariant $variant, Shop $shop): ?ProductVariantTranslation
    {
        if (! $variant->relationLoaded('translations')) {
            return null;
        }

        /** @var ProductVariantTranslation|null $translation */
        $translation = $variant->translations->firstWhere('shop_id', $shop->id);

        return $translation;
    }

    /**
     * @param mixed $parameters
     * @return array<int, array{nameIndex: string, valueIndex: string}>
     */
    private function normalizeVariantParameters(mixed $parameters): array
    {
        if (! is_array($parameters) || $parameters === []) {
            return [];
        }

        $normalized = [];

        foreach ($parameters as $parameter) {
            if (! is_array($parameter)) {
                continue;
            }

            $nameIndex = $parameter['nameIndex']
                ?? $parameter['paramIndex']
                ?? $parameter['index']
                ?? null;

            $valueIndex = $parameter['valueIndex']
                ?? $parameter['rawValue']
                ?? $parameter['index']
                ?? null;

            if (! is_string($nameIndex) || $nameIndex === '' || ! is_string($valueIndex) || $valueIndex === '') {
                $name = $parameter['name'] ?? $parameter['displayName'] ?? null;
                $value = $parameter['value'] ?? $parameter['paramValue'] ?? null;

                if (is_string($name) && $name !== '') {
                    $nameIndex = Str::slug($name, '_');
                }
                if (is_string($value) && $value !== '') {
                    $valueIndex = Str::slug($value, '_');
                }
            }

            if (! is_string($nameIndex) || $nameIndex === '' || ! is_string($valueIndex) || $valueIndex === '') {
                continue;
            }

            $normalized[] = [
                'nameIndex' => $nameIndex,
                'valueIndex' => $valueIndex,
            ];
        }

        return $normalized;
    }

    /**
     * @return array<int, array{nameIndex: string, valueIndex: string}>
     */
    private function resolveVariantParameters(
        ProductVariant $variant,
        ?ProductVariantTranslation $translation,
        ?ProductVariantShopOverlay $overlay
    ): array {
        $overlayData = is_array($overlay?->data) ? $overlay->data : [];
        $translationData = is_array($translation?->data) ? $translation->data : [];
        $canonicalData = is_array($variant->data) ? $variant->data : [];

        $candidateSources = [
            Arr::get($overlayData, 'parameters'),
            Arr::get($overlayData, 'variantParameters'),
            Arr::get($overlayData, 'attributeCombination.parameters'),
            Arr::get($overlayData, '_hub.suggestedParameters'),
            Arr::get($overlayData, 'suggestedParameters'),
            $translation?->parameters,
            Arr::get($translationData, 'parameters'),
            Arr::get($translationData, 'variantParameters'),
            Arr::get($translationData, 'attributeCombination.parameters'),
            Arr::get($translationData, '_hub.suggestedParameters'),
            Arr::get($canonicalData, 'parameters'),
            Arr::get($canonicalData, 'variantParameters'),
            Arr::get($canonicalData, 'attributeCombination.parameters'),
            Arr::get($canonicalData, '_hub.suggestedParameters'),
        ];

        foreach ($candidateSources as $candidate) {
            $normalized = $this->normalizeVariantParameters($candidate);
            if ($normalized !== []) {
                return $normalized;
            }
        }

        return [];
    }

    /**
     * @param array<int, array{nameIndex: string, valueIndex: string}> $parameters
     * @return array<int, array{nameIndex: string, valueIndex: string}>
     */
    private function mapVariantParametersToShop(array $parameters, Product $product, Shop $targetShop): array
    {
        if ($parameters === []) {
            return [];
        }

        $masterShopId = $product->shop_id;
        if (! $masterShopId || $masterShopId === $targetShop->id) {
            return $parameters;
        }

        $mappings = $this->resolveVariantParameterMappings((int) $masterShopId, $targetShop->id);
        if ($mappings->isEmpty()) {
            return $parameters;
        }

        $mapped = [];

        foreach ($parameters as $parameter) {
            $masterKey = $this->extractVariantParameterKey($parameter);
            if (! $masterKey) {
                $mapped[] = $parameter;
                continue;
            }

            /** @var ShopAttributeMapping|null $mapping */
            $mapping = $mappings->get($masterKey);
            if (! $mapping || ! is_string($mapping->target_key) || trim($mapping->target_key) === '') {
                $mapped[] = $parameter;
                continue;
            }

            $valueKey = $this->extractVariantParameterValueKey($parameter);
            if (! $valueKey) {
                $mapped[] = $parameter;
                continue;
            }

            $valueMapping = $mapping->values->firstWhere('master_value_key', $valueKey);
            if (! $valueMapping || ! is_string($valueMapping->target_value_key) || trim($valueMapping->target_value_key) === '') {
                $mapped[] = $parameter;
                continue;
            }

            $mapped[] = [
                'nameIndex' => $mapping->target_key,
                'valueIndex' => $valueMapping->target_value_key,
            ];
        }

        return array_values($mapped);
    }

    private function resolveVariantParameterMappings(int $masterShopId, int $targetShopId): Collection
    {
        $cacheKey = $masterShopId . '-' . $targetShopId;

        if (! array_key_exists($cacheKey, $this->variantMappingCache)) {
            $this->variantMappingCache[$cacheKey] = ShopAttributeMapping::query()
                ->where('master_shop_id', $masterShopId)
                ->where('target_shop_id', $targetShopId)
                ->where('type', 'variants')
                ->with('values')
                ->get()
                ->keyBy('master_key');
        }

        return $this->variantMappingCache[$cacheKey];
    }

    /**
     * @param array{nameIndex?: string|null, valueIndex?: string|null, paramIndex?: string|null, index?: string|null, code?: string|null, name?: string|null} $parameter
     */
    private function extractVariantParameterKey(array $parameter): ?string
    {
        $candidates = [
            'nameIndex',
            'paramIndex',
            'index',
            'code',
            'name',
        ];

        foreach ($candidates as $candidate) {
            $value = Arr::get($parameter, $candidate);
            if (is_string($value) && $value !== '') {
                return $value;
            }
        }

        return null;
    }

    /**
     * @param array{valueIndex?: string|null, rawValue?: string|null, value?: string|null, paramValue?: string|null} $parameter
     */
    private function extractVariantParameterValueKey(array $parameter): ?string
    {
        $candidates = [
            'valueIndex',
            'rawValue',
            'value',
            'paramValue',
        ];

        foreach ($candidates as $candidate) {
            $value = Arr::get($parameter, $candidate);
            if (is_string($value) && $value !== '') {
                return $value;
            }
        }

        return null;
    }

    private function resolveDescriptiveParameters(mixed $parameters): ?array
    {
        $normalized = $this->normalizeDescriptiveParameters($parameters);

        return $normalized === [] ? null : $normalized;
    }

    private function resolveFilteringParameters(mixed $parameters): ?array
    {
        $normalized = $this->normalizeFilteringParameters($parameters);

        return $normalized === [] ? null : $normalized;
    }

    /**
     * @param mixed $parameters
     * @return array<int, array{name: string, value?: string|null, description?: string|null, priority?: int|null}>
     */
    private function normalizeDescriptiveParameters(mixed $parameters): array
    {
        if (! is_array($parameters) || $parameters === []) {
            return [];
        }

        if (Arr::isAssoc($parameters) && array_key_exists('descriptiveParameters', $parameters)) {
            $parameters = $parameters['descriptiveParameters'];
            if (! is_array($parameters) || $parameters === []) {
                return [];
            }
        }

        $normalized = [];

        foreach ($parameters as $key => $parameter) {
            if (is_array($parameter)) {
                $name = $parameter['name'] ?? $parameter['title'] ?? null;
                $value = $parameter['value'] ?? $parameter['text'] ?? null;
                $description = $parameter['description'] ?? null;
                $priority = $parameter['priority'] ?? null;
            } else {
                $name = is_string($key) ? $key : null;
                $value = $parameter;
                $description = null;
                $priority = null;
            }

            if (! is_string($name) || trim($name) === '') {
                continue;
            }

            $normalized[] = $this->filterNull([
                'name' => $name,
                'value' => is_scalar($value) ? (string) $value : null,
                'description' => is_string($description) ? $description : null,
                'priority' => is_numeric($priority) ? (int) $priority : null,
            ]);
        }

        return $normalized;
    }

    /**
     * @param mixed $parameters
     * @return array<int, array{code: string, values: array<int, string>}>
     */
    private function normalizeFilteringParameters(mixed $parameters): array
    {
        if (! is_array($parameters) || $parameters === []) {
            return [];
        }

        if (Arr::isAssoc($parameters) && array_key_exists('filteringParameters', $parameters)) {
            $parameters = $parameters['filteringParameters'];
            if (! is_array($parameters) || $parameters === []) {
                return [];
            }
        }

        $normalized = [];

        foreach ($parameters as $parameter) {
            if (! is_array($parameter)) {
                continue;
            }

            $code = $parameter['code'] ?? $parameter['name'] ?? null;
            $values = $parameter['values'] ?? $parameter['value'] ?? null;

            if (! is_string($code) || $code === '') {
                continue;
            }

            $valuesList = [];
            if (is_array($values)) {
                foreach ($values as $value) {
                    if (is_string($value) && $value !== '') {
                        $valuesList[] = $value;
                    }
                }
            } elseif (is_string($values) && $values !== '') {
                $valuesList[] = $values;
            }

            if ($valuesList === []) {
                continue;
            }

            $normalized[] = [
                'code' => $code,
                'values' => $valuesList,
            ];
        }

        return $normalized;
    }

    /**
     * @param mixed $flags
     * @return array<int, array<string, mixed>>
     */
    private function normalizeFlags(mixed $flags): array
    {
        if (! is_array($flags) || $flags === []) {
            return [];
        }

        $normalized = [];

        foreach ($flags as $flag) {
            if (! is_array($flag)) {
                continue;
            }

            $code = $flag['code'] ?? null;
            if (! is_string($code) || $code === '') {
                continue;
            }

            $normalized[] = $this->filterNull([
                'code' => $code,
                'dateFrom' => $flag['dateFrom'] ?? null,
                'dateTo' => $flag['dateTo'] ?? null,
            ]);
        }

        return $normalized;
    }

    /**
     * @param mixed $stocksLocations
     * @return array<int, array<string, mixed>>
     */
    private function normalizeStocksLocations(mixed $stocksLocations): array
    {
        if (! is_array($stocksLocations) || $stocksLocations === []) {
            return [];
        }

        $normalized = [];

        foreach ($stocksLocations as $location) {
            if (! is_array($location)) {
                continue;
            }

            $stockId = $location['stockId'] ?? null;
            if (! is_numeric($stockId)) {
                continue;
            }

            $normalized[] = $this->filterNull([
                'stockId' => (int) $stockId,
                'amount' => $this->formatAmount($location['amount'] ?? null),
                'location' => is_string($location['location'] ?? null) ? $location['location'] : null,
            ]);
        }

        return $normalized;
    }

    /**
     * @param array<string, mixed> $basePayload
     * @param array<string, mixed> $overlay
     * @return array<int, array<string, mixed>>
     */
    private function buildImagePayloads(Product $product, array $basePayload, array $overlay): array
    {
        $images = Arr::get($overlay, 'images');
        if (! is_array($images) || $images === []) {
            $images = Arr::get($basePayload, 'images', []);
        }

        if (! is_array($images) || $images === []) {
            return [];
        }

        $result = [];

        foreach ($images as $image) {
            if (! is_array($image)) {
                continue;
            }

            $sourceUrl = $image['sourceUrl']
                ?? $image['url']
                ?? $image['cdnUrl']
                ?? null;

            if (! $sourceUrl && isset($image['cdnName'])) {
                $sourceUrl = $image['cdnName'];
            } elseif (! $sourceUrl && isset($image['name'])) {
                $sourceUrl = $image['name'];
            }

            if (! is_string($sourceUrl) || trim($sourceUrl) === '') {
                continue;
            }

            $normalizedUrl = $this->normalizeImageSourceUrl($sourceUrl, $product);
            if ($normalizedUrl === null) {
                continue;
            }

            $result[] = $this->filterNull([
                'sourceUrl' => $normalizedUrl,
                'priority' => isset($image['priority']) && is_numeric($image['priority'])
                    ? (int) $image['priority']
                    : null,
                'description' => isset($image['description']) && is_string($image['description'])
                    ? $image['description']
                    : null,
            ]);
        }

        return $result;
    }

    private function normalizeImageSourceUrl(string $sourceUrl, Product $product): ?string
    {
        $trimmed = trim($sourceUrl);
        if ($trimmed === '') {
            return null;
        }

        if (str_starts_with($trimmed, 'http://') || str_starts_with($trimmed, 'https://')) {
            return $trimmed;
        }

        $baseUrl = $this->resolveImageCdnBaseUrl($product);
        if (! $baseUrl) {
            return null;
        }

        return rtrim($baseUrl, '/') . '/' . ltrim($trimmed, '/');
    }

    private function resolveImageCdnBaseUrl(Product $product): ?string
    {
        if (! $product->relationLoaded('shop')) {
            $product->load('shop');
        }

        $baseShop = $product->shop;
        if (! $baseShop) {
            return null;
        }

        $domain = $baseShop->domain ?? null;
        if (! is_string($domain) || trim($domain) === '') {
            return null;
        }

        $host = parse_url($domain, PHP_URL_HOST) ?: $domain;
        $host = trim($host);

        if ($host === '') {
            return null;
        }

        if (! str_starts_with($host, 'www.')) {
            $host = 'www.' . $host;
        }

        return "https://cdn.myshoptet.com/usr/{$host}/user/shop/big";
    }

    private function resolveIndexName(ProductTranslation $translation, array $overlay, array $basePayload): string
    {
        $candidate = $overlay['indexName']
            ?? Arr::get($overlay, 'url')
            ?? Arr::get($translation->seo ?? [], 'indexName')
            ?? Arr::get($basePayload, 'indexName');

        if (is_string($candidate) && trim($candidate) !== '') {
            return $candidate;
        }

        $name = $translation->name
            ?? $overlay['name']
            ?? Arr::get($basePayload, 'name')
            ?? 'product';

        $slug = Str::slug($name);

        return $slug !== '' ? $slug : 'produkt';
    }

    private function sanitizeScalar(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    private function filterNull(array $payload): array
    {
        return array_filter(
            $payload,
            static fn ($value) => ! is_null($value) && (! is_array($value) || $value !== [])
        );
    }

    private function formatPrice(float|int|string|null $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_string($value)) {
            $value = (float) $value;
        }

        return number_format($value, 2, '.', '');
    }

    private function formatVatRate(float|int|string|null $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_string($value)) {
            $value = (float) $value;
        }

        return number_format($value, 2, '.', '');
    }

    private function formatAmount(float|int|string|null $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_string($value)) {
            $value = (float) $value;
        }

        return number_format($value, 3, '.', '');
    }

    private function formatWeight(float|int|string|null $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_string($value)) {
            $value = (float) $value;
        }

        return number_format($value, 3, '.', '');
    }
}
