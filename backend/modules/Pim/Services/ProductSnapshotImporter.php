<?php

namespace Modules\Pim\Services;

use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ProductRemoteRef;
use Modules\Pim\Models\ProductShopOverlay;
use Modules\Pim\Models\ProductTranslation;
use Modules\Pim\Models\ProductVariant;
use Modules\Pim\Models\ProductVariantRemoteRef;
use Modules\Pim\Models\ProductVariantShopOverlay;
use Modules\Pim\Models\ProductVariantTranslation;
use Modules\Pim\Models\ShopAttributeMapping;
use Modules\Shoptet\Models\Shop;

class ProductSnapshotImporter
{
    public const FULL_PRODUCT_INCLUDE = 'images,variantParameters,allCategories,flags,descriptiveParameters,measureUnit,surchargeParameters,setItems,filteringParameters,recyclingFee,warranty,sortVariants,gifts,alternativeProducts,relatedProducts,relatedVideos,relatedFiles,perStockAmounts,perPricelistPrices';

    /**
     * @var array<string, \Illuminate\Support\Collection>
     */
    private array $variantMappingCache = [];

    public function __construct(
        private readonly CategorySyncService $categorySync,
        private readonly CategoryMappingService $categoryMapping
    ) {
    }

    public function import(array $payload, Shop $shop): void
    {
        $variantsPayload = collect($payload['variants'] ?? [])
            ->filter(fn ($variant) => is_array($variant) && ! empty($variant['code'] ?? null));

        $this->categorySync->syncFromPayload($payload, $shop);

        $variantCodes = $variantsPayload
            ->pluck('code')
            ->filter()
            ->unique()
            ->values();

        if ($shop->is_master) {
            $product = $this->upsertMasterProduct($payload, $shop);
        } else {
            $product = $this->resolveProductByVariantCodes($variantCodes);
            if (! $product) {
                Log::warning('Unable to resolve canonical product for snapshot from non-master shop', [
                    'shop_id' => $shop->id,
                    'variant_codes' => $variantsPayload->pluck('code')->all(),
                ]);

                return;
            }
        }

        $existingVariants = $this->loadExistingVariants($product);

        $this->syncProductRemoteReference($product, $shop, $payload);

        $canonicalPayload = $shop->is_master ? $payload : ($product->base_payload ?? []);
        $canonicalCategoryGuids = $this->categorySync->extractCategoryGuids($canonicalPayload);
        $mappedCategories = $canonicalCategoryGuids !== []
            ? $this->categoryMapping->mapCanonicalCategoriesToShop($canonicalCategoryGuids, $shop)
            : [];
        $suggestedFilters = $this->buildSuggestedFilters($product);

        $this->syncProductOverlay($product, $shop, $payload, $mappedCategories, $suggestedFilters);

        if ($shop->is_master) {
            $this->prefillTargetShopOverlays($product, $canonicalCategoryGuids, $suggestedFilters);
        }

        $locale = $shop->default_locale
            ?? $shop->locale
            ?? $product->base_locale
            ?? config('pim.default_base_locale');

        $this->syncTranslation($product, $payload, $locale, $shop);
        $this->syncVariants($product, $variantsPayload, $shop, $existingVariants);
    }

    private function upsertMasterProduct(array $payload, Shop $shop): Product
    {
        $guid = $payload['guid'] ?? null;
        $attributes = $guid
            ? ['external_guid' => $guid, 'shop_id' => $shop->id]
            : ['shop_id' => $shop->id, 'sku' => $payload['indexName'] ?? null];

        /** @var Product $product */
        $product = Product::firstOrNew($attributes);

        $product->shop_id = $shop->id;
        $product->external_guid = $guid ?? $product->external_guid;
        $product->sku = $payload['indexName'] ?? $product->sku ?? Arr::get($payload, 'variants.0.code');
        $product->status = $payload['visibility'] ?? $product->status ?? 'unknown';
        $product->base_locale = $product->base_locale ?? ($shop->default_locale ?? config('pim.default_base_locale'));
        $product->base_payload = $payload;
        $product->save();

        return $product;
    }

    private function resolveProductByVariantCodes(Collection $variantCodes): ?Product
    {
        if ($variantCodes->isEmpty()) {
            return null;
        }

        $variant = ProductVariant::query()
            ->whereIn('code', $variantCodes->all())
            ->with('product')
            ->first();

        return $variant?->product;
    }

    private function loadExistingVariants(Product $product): Collection
    {
        $product->loadMissing('variants');

        return $product->variants->keyBy('code');
    }

    private function syncProductOverlay(
        Product $product,
        Shop $shop,
        array $payload,
        array $mappedCategories = [],
        array $suggestedFilters = []
    ): void {
        /** @var ProductShopOverlay $overlay */
        $overlay = ProductShopOverlay::firstOrNew([
            'product_id' => $product->id,
            'shop_id' => $shop->id,
        ]);

        $overlay->currency_code = Arr::get($payload, 'currency') ?? $overlay->currency_code;
        $overlay->status = $payload['visibility'] ?? $overlay->status;

        $existingData = is_array($overlay->data) ? $overlay->data : [];
        $overlay->data = $this->mergeOverlayData($existingData, $payload, [
            'mappedCategories' => $mappedCategories !== [] ? $mappedCategories : null,
            'suggestedFilters' => $suggestedFilters !== [] ? $suggestedFilters : null,
        ]);

        $overlay->save();
    }

    private function syncProductRemoteReference(Product $product, Shop $shop, array $payload): void
    {
        $remoteGuid = $payload['guid'] ?? null;
        $remoteExternalId = Arr::get($payload, 'id');

        if (! $remoteGuid && ! $remoteExternalId) {
            return;
        }

        ProductRemoteRef::updateOrCreate(
            [
                'product_id' => $product->id,
                'shop_id' => $shop->id,
            ],
            [
                'remote_guid' => $remoteGuid,
                'remote_external_id' => $remoteExternalId,
            ]
        );
    }

    private function syncTranslation(Product $product, array $payload, string $locale, Shop $shop): void
    {
        /** @var ProductTranslation $translation */
        $translation = $product->translations()->firstOrNew([
            'shop_id' => $shop->id,
            'locale' => $locale,
        ]);

        $translation->name = $payload['name'] ?? null;
        $translation->short_description = $payload['shortDescription'] ?? null;
        $translation->description = $payload['description'] ?? null;
        $translation->parameters = $payload['descriptiveParameters'] ?? null;
        $translation->seo = array_filter([
            'metaTitle' => $payload['metaTitle'] ?? null,
            'metaDescription' => $payload['metaDescription'] ?? null,
            'xmlFeedName' => $payload['xmlFeedName'] ?? null,
        ]);

        if (! $translation->status || $translation->status === 'synced') {
            $translation->status = $shop->is_master ? 'synced' : $translation->status ?? 'draft';
        }

        $translation->save();
    }

    private function syncVariants(
        Product $product,
        Collection $variantsPayload,
        Shop $shop,
        Collection $existingVariants
    ): void {
        $isMaster = $shop->is_master;
        $processedCanonicalCodes = [];

        foreach ($variantsPayload as $variantPayload) {
            $code = $variantPayload['code'] ?? null;
            if (! $code) {
                continue;
            }

            /** @var ProductVariant|null $variant */
            $variant = $existingVariants->get($code);

            if (! $variant && ! $isMaster) {
                // Cannot hydrate canonical variant from a non-master snapshot
                Log::info('Skipping variant overlay for code without canonical record', [
                    'code' => $code,
                    'shop_id' => $shop->id,
                ]);
                continue;
            }

            if (! $variant) {
                $variant = new ProductVariant();
                $variant->product_id = $product->id;
                $variant->code = $code;
                $existingVariants->put($code, $variant);
            }

            if ($isMaster) {
                $this->hydrateCanonicalVariant($variant, $variantPayload, $product);
                $processedCanonicalCodes[] = $variant->code;
            }

            $canonicalVariantData = is_array($variant->data) ? $variant->data : [];
            $suggestedVariantParameters = $this->buildVariantSuggestions(
                $canonicalVariantData,
                $shop,
                $product->shop_id
            );

            $this->syncVariantOverlay($variant, $variantPayload, $shop, $suggestedVariantParameters);
            $this->syncVariantTranslation($variant, $variantPayload, $shop);
            $this->syncVariantRemoteReference($variant, $variantPayload, $shop);
        }

        if ($isMaster && ! empty($processedCanonicalCodes)) {
            $product->variants()->whereNotIn('code', $processedCanonicalCodes)->delete();
        }
    }

    private function buildSuggestedFilters(Product $product): array
    {
        $basePayload = $product->base_payload ?? [];

        $suggestions = [];

        $descriptive = Arr::get($basePayload, 'descriptiveParameters');
        if (! empty($descriptive)) {
            $suggestions['descriptiveParameters'] = $descriptive;
        }

        $parameters = Arr::get($basePayload, 'parameters');
        if (! empty($parameters)) {
            $suggestions['parameters'] = $parameters;
        }

        return $suggestions;
    }

    private function buildVariantSuggestions(array $canonicalData, ?Shop $targetShop = null, ?int $masterShopId = null): array
    {
        $variantParameters = Arr::get($canonicalData, 'variantParameters')
            ?? Arr::get($canonicalData, 'attributeCombination.parameters');

        if (empty($variantParameters)) {
            return [];
        }

        $normalized = $this->normalizeVariantSuggestionParameters($variantParameters);

        if (! $targetShop || ! $masterShopId || $targetShop->id === $masterShopId) {
            return [
                'parameters' => $normalized,
            ];
        }

        [$mapped, $missing] = $this->mapVariantParametersToShop($normalized, $masterShopId, $targetShop);

        $result = [
            'parameters' => $mapped === [] ? $normalized : $mapped,
        ];

        if ($missing !== []) {
            $result['_meta'] = [
                'missingMappings' => $missing,
            ];
        }

        return $result;
    }

    private function mergeOverlayData(array $existing, array $incoming, array $hubExtras): array
    {
        $base = $incoming !== [] ? $incoming : $existing;
        if (! is_array($base)) {
            $base = [];
        }

        $existingHub = [];
        if (isset($existing['_hub']) && is_array($existing['_hub'])) {
            $existingHub = $existing['_hub'];
        } elseif (isset($base['_hub']) && is_array($base['_hub'])) {
            $existingHub = $base['_hub'];
        }

        $extras = array_filter($hubExtras, static fn ($value) => ! is_null($value));

        if ($extras !== []) {
            $base['_hub'] = array_merge($existingHub, $extras);
        } elseif ($existingHub !== []) {
            $base['_hub'] = $existingHub;
        } else {
            unset($base['_hub']);
        }

        return $base;
    }

    private function prefillTargetShopOverlays(Product $product, array $categoryGuids, array $suggestedFilters): void
    {
        if ($categoryGuids === []) {
            return;
        }

        $targetShops = Shop::query()
            ->where('id', '!=', $product->shop_id)
            ->get();

        if ($targetShops->isEmpty()) {
            return;
        }

        $product->loadMissing('variants');
        $canonicalPayload = $product->base_payload ?? [];
        $canonicalSetItems = [];

        if (
            ($canonicalPayload['type'] ?? null) === 'product-set'
            && isset($canonicalPayload['setItems'])
            && is_array($canonicalPayload['setItems'])
        ) {
            $canonicalSetItems = $canonicalPayload['setItems'];
        }

        foreach ($targetShops as $targetShop) {
            $mappedCategories = $this->categoryMapping->mapCanonicalCategoriesToShop($categoryGuids, $targetShop);
            $hasProductOverlayHints = $mappedCategories !== [] || $suggestedFilters !== [];

            if ($hasProductOverlayHints) {
                $this->applySuggestedOverlay($product, $targetShop, $mappedCategories, $suggestedFilters, $canonicalSetItems);
            }

            $this->applySuggestedVariantOverlays($product, $targetShop);
        }
    }

    private function applySuggestedOverlay(
        Product $product,
        Shop $shop,
        array $mappedCategories,
        array $suggestedFilters,
        array $canonicalSetItems = []
    ): void {
        if ($shop->id === $product->shop_id) {
            return;
        }

        $overlay = ProductShopOverlay::firstOrNew([
            'product_id' => $product->id,
            'shop_id' => $shop->id,
        ]);

        // Prefill currency if missing so pricing UI has correct default for the target shop
        if (! $overlay->currency_code && $shop->currency_code) {
            $overlay->currency_code = $shop->currency_code;
        }

        $existingData = is_array($overlay->data) ? $overlay->data : [];
        $incoming = [];

        if ($canonicalSetItems !== []) {
            $incoming['setItems'] = $canonicalSetItems;
        }

        $overlay->data = $this->mergeOverlayData($existingData, $incoming, [
            'mappedCategories' => $mappedCategories !== [] ? $mappedCategories : null,
            'suggestedFilters' => $suggestedFilters !== [] ? $suggestedFilters : null,
        ]);

        $overlay->save();
    }

    private function applySuggestedVariantOverlays(Product $product, Shop $shop): void
    {
        if (! $product->relationLoaded('variants')) {
            return;
        }

        foreach ($product->variants as $variant) {
            $suggested = $this->buildVariantSuggestions(
                is_array($variant->data) ? $variant->data : [],
                $shop,
                $product->shop_id
            );

            $overlay = ProductVariantShopOverlay::firstOrNew([
                'product_variant_id' => $variant->id,
                'shop_id' => $shop->id,
            ]);

            // Prefill currency/VAT so pricing UI has correct defaults
            if (! $overlay->currency_code) {
                $overlay->currency_code = $variant->currency_code ?? $shop->currency_code;
            }
            if ($overlay->vat_rate === null) {
                $overlay->vat_rate = $variant->vat_rate;
            }

            if ($suggested === []) {
                $overlay->save();
                continue;
            }

            $existingData = is_array($overlay->data) ? $overlay->data : [];
            $overlay->data = $this->mergeOverlayData($existingData, [], [
                'suggestedParameters' => $suggested,
            ]);

            $overlay->save();
        }
    }

    /**
     * @param array<int, array<string, mixed>> $parameters
     * @return array<int, array<string, mixed>>
     */
    private function normalizeVariantSuggestionParameters(array $parameters): array
    {
        $normalized = [];

        foreach ($parameters as $parameter) {
            if (! is_array($parameter)) {
                continue;
            }

            $item = $parameter;

            $name = Arr::get($item, 'name')
                ?? Arr::get($item, 'displayName')
                ?? Arr::get($item, 'title');
            if (is_string($name)) {
                $item['name'] = $name;
            }

            $nameIndex = Arr::get($item, 'nameIndex')
                ?? Arr::get($item, 'paramIndex')
                ?? Arr::get($item, 'index')
                ?? Arr::get($item, 'code');
            if (is_string($nameIndex)) {
                $item['nameIndex'] = $nameIndex;
            }

            $value = Arr::get($item, 'value')
                ?? Arr::get($item, 'paramValue')
                ?? Arr::get($item, 'text')
                ?? Arr::get($item, 'rawValue');
            if (is_string($value)) {
                $item['value'] = $value;
            }

            $valueIndex = Arr::get($item, 'valueIndex')
                ?? Arr::get($item, 'rawValue')
                ?? Arr::get($item, 'value');
            if (is_string($valueIndex)) {
                $item['valueIndex'] = $valueIndex;
            }

            $normalized[] = $item;
        }

        return $normalized;
    }

    /**
     * @param array<int, array<string, mixed>> $parameters
     * @return array{0: array<int, array<string, mixed>>, 1: array<int, array<string, mixed>>}
     */
    private function mapVariantParametersToShop(array $parameters, int $masterShopId, Shop $targetShop): array
    {
        $mappings = $this->resolveVariantParameterMappings($masterShopId, $targetShop->id);
        if ($mappings->isEmpty()) {
            return [[], []];
        }

        $mapped = [];
        $missing = [];

        foreach ($parameters as $parameter) {
            $masterKey = $this->extractVariantParameterKey($parameter);
            if (! $masterKey) {
                continue;
            }

            /** @var ShopAttributeMapping|null $mapping */
            $mapping = $mappings->get($masterKey);
            if (! $mapping || ! is_string($mapping->target_key) || trim($mapping->target_key) === '') {
                $missing[] = [
                    'parameter' => Arr::get($parameter, 'name') ?? $masterKey,
                    'master_key' => $masterKey,
                ];
                $mapped[] = $parameter;
                continue;
            }

            $valueKey = $this->extractVariantParameterValueKey($parameter);
            if (! $valueKey) {
                $missing[] = [
                    'parameter' => Arr::get($parameter, 'name') ?? $masterKey,
                    'master_key' => $masterKey,
                    'reason' => 'value_missing',
                ];
                $mapped[] = $parameter;
                continue;
            }

            $valueMapping = $mapping->values->firstWhere('master_value_key', $valueKey);
            if (! $valueMapping || ! is_string($valueMapping->target_value_key) || trim($valueMapping->target_value_key) === '') {
                $missing[] = [
                    'parameter' => Arr::get($parameter, 'name') ?? $masterKey,
                    'master_key' => $masterKey,
                    'master_value_key' => $valueKey,
                ];
                $mapped[] = $parameter;
                continue;
            }

            $mapped[] = [
                'name' => $mapping->target_label ?? Arr::get($parameter, 'name'),
                'nameIndex' => $mapping->target_key,
                'value' => $valueMapping->target_value_label ?? Arr::get($parameter, 'value'),
                'valueIndex' => $valueMapping->target_value_key,
            ];
        }

        return [array_values($mapped), $missing];
    }

    private function resolveVariantParameterMappings(int $masterShopId, int $targetShopId): Collection
    {
        $cacheKey = $masterShopId.'-'.$targetShopId;

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

    private function hydrateCanonicalVariant(ProductVariant $variant, array $payload, Product $product): void
    {
        $variant->ean = $payload['ean'] ?? $variant->ean;
        $variant->sku = $payload['manufacturerCode'] ?? $variant->sku;
        $variant->name = $payload['name']
            ?? $payload['label']
            ?? $payload['title']
            ?? Arr::get($payload, 'attributeCombination.label')
            ?? Arr::get($payload, 'attributeCombination.name')
            ?? $variant->name
            ?? Arr::get($product->base_payload, 'name');
        $variant->brand = Arr::get($payload, 'brand.name')
            ?? Arr::get($payload, 'brand')
            ?? Arr::get($product->base_payload, 'brand.name')
            ?? Arr::get($product->base_payload, 'brand')
            ?? $variant->brand;
        $variant->supplier = Arr::get($payload, 'supplier.name')
            ?? Arr::get($payload, 'supplier')
            ?? Arr::get($product->base_payload, 'supplier.name')
            ?? Arr::get($product->base_payload, 'supplier')
            ?? $variant->supplier;
        $variant->stock = $this->toFloat($payload['stock'] ?? $variant->stock);
        $variant->unit = $payload['unit'] ?? $variant->unit;
        $variant->price = $this->toFloat($payload['price'] ?? $variant->price);
        $variant->purchase_price = $this->toFloat(Arr::get($payload, 'prices.purchasePrice.price') ?? $variant->purchase_price);
        $variant->vat_rate = $this->toFloat($payload['vatRate'] ?? Arr::get($payload, 'prices.purchasePrice.vatRate') ?? $variant->vat_rate);
        $variant->weight = $this->toFloat($payload['weight'] ?? $variant->weight);
        $variant->min_stock_supply = $this->toFloat($payload['minStockSupply'] ?? $variant->min_stock_supply);
        $variant->currency_code = $payload['currencyCode'] ?? $variant->currency_code;
        $variant->data = $payload;
        $variant->save();
    }

    private function syncVariantOverlay(
        ProductVariant $variant,
        array $payload,
        Shop $shop,
        array $suggestedParameters = []
    ): void {
        /** @var ProductVariantShopOverlay $overlay */
        $overlay = ProductVariantShopOverlay::firstOrNew([
            'product_variant_id' => $variant->id,
            'shop_id' => $shop->id,
        ]);

        $overlay->price = $this->toFloat($payload['price'] ?? $overlay->price);
        $overlay->purchase_price = $this->toFloat(
            Arr::get($payload, 'prices.purchasePrice.price') ?? $overlay->purchase_price
        );
        $overlay->vat_rate = $this->toFloat(
            $payload['vatRate'] ?? Arr::get($payload, 'prices.purchasePrice.vatRate') ?? $overlay->vat_rate
        );
        $overlay->stock = $this->toFloat($payload['stock'] ?? $overlay->stock);
        $overlay->min_stock_supply = $this->toFloat($payload['minStockSupply'] ?? $overlay->min_stock_supply);
        $overlay->currency_code = $payload['currencyCode'] ?? $overlay->currency_code;
        $overlay->unit = $payload['unit'] ?? $overlay->unit;

        $existingData = is_array($overlay->data) ? $overlay->data : [];
        $overlay->data = $this->mergeOverlayData($existingData, $payload, [
            'suggestedParameters' => $suggestedParameters !== [] ? $suggestedParameters : null,
        ]);

        $overlay->save();
    }

    private function syncVariantTranslation(ProductVariant $variant, array $payload, Shop $shop): void
    {
        $locale = $shop->default_locale ?? $shop->locale ?? config('pim.default_base_locale');

        /** @var ProductVariantTranslation $translation */
        $translation = $variant->translations()->firstOrNew([
            'shop_id' => $shop->id,
            'locale' => $locale,
        ]);

        $translation->name = $payload['name']
            ?? $payload['label']
            ?? $payload['title']
            ?? $translation->name;
        $translation->parameters = Arr::get($payload, 'variantParameters')
            ?? Arr::get($payload, 'attributeCombination.parameters')
            ?? $translation->parameters;
        $translation->data = $payload;

        if (! $translation->status || $translation->status === 'synced') {
            $translation->status = $shop->is_master ? 'synced' : $translation->status ?? 'draft';
        }

        $translation->save();
    }

    private function syncVariantRemoteReference(ProductVariant $variant, array $payload, Shop $shop): void
    {
        $remoteGuid = $payload['guid'] ?? null;
        $remoteCode = $payload['code'] ?? null;

        if (! $remoteGuid && ! $remoteCode) {
            return;
        }

        ProductVariantRemoteRef::updateOrCreate(
            [
                'product_variant_id' => $variant->id,
                'shop_id' => $shop->id,
            ],
            [
                'remote_guid' => $remoteGuid,
                'remote_code' => $remoteCode,
            ]
        );
    }

    private function toFloat(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_array($value)) {
            $preferredKeys = [
                'value',
                'price',
                'amount',
                'stock',
                'quantity',
                'stockQuantity',
                'withVat',
                'withoutVat',
            ];

            foreach ($preferredKeys as $key) {
                if (array_key_exists($key, $value)) {
                    return $this->toFloat($value[$key]);
                }
            }

            $first = reset($value);
            if ($first !== false && $first !== null) {
                return $this->toFloat($first);
            }

            return null;
        }

        if (is_numeric($value)) {
            return (float) $value;
        }

        if (is_string($value)) {
            $normalized = str_replace(["\u{00A0}", ' '], '', $value);
            $normalized = str_replace(',', '.', $normalized);

            if (is_numeric($normalized)) {
                return (float) $normalized;
            }
        }

        return null;
    }
}
