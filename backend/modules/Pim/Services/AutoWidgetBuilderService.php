<?php

namespace Modules\Pim\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Arr;
use Modules\Inventory\Services\InventoryRecommendationService;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ProductVariant;
use Modules\Pim\Models\ProductWidget;
use Modules\Pim\Models\ProductWidgetItem;
use Modules\Shoptet\Models\Shop;

/**
 * Auto-generates widgets from HUB data with proper per-shop overlay + translation support
 */
class AutoWidgetBuilderService
{
    public function __construct(private readonly InventoryRecommendationService $recommendations)
    {
    }

    /**
     * Build "nonFragrance" widget type - perfumes only
     *
     * @param Shop $shop Target shop (SK, HU, RO, HR)
     * @param string $locale Target locale (sk, hu, ro, hr)
     * @param int $limit Number of products to include
     * @param array $options Additional options (exclude_keywords, etc.)
     * @return ProductWidget
     */
    public function buildNonFragranceWidget(
        Shop $shop,
        string $locale,
        int $limit = 10,
        array $options = []
    ): ProductWidget {
        $baseVariantId = $options['base_variant_id'] ?? null;
        if (! $baseVariantId) {
            throw new \InvalidArgumentException('base_variant_id is required for nonFragrance widget');
        }

        $baseVariant = ProductVariant::query()
            ->with('product')
            ->findOrFail($baseVariantId);

        $recommendations = $this->recommendations
            ->recommendByInspirationType($baseVariant, $limit, 'nonfragrance');

        $variantIds = collect($recommendations)
            ->map(fn ($entry) => Arr::get($entry, 'variant.id'))
            ->filter()
            ->values();

        $matchesByVariant = collect($recommendations)
            ->mapWithKeys(fn ($entry) => [
                Arr::get($entry, 'variant.id') => Arr::get($entry, 'matches', []),
            ])
            ->filter();

        $variants = ProductVariant::query()
            ->with(['product', 'overlays', 'translations'])
            ->whereIn('id', $variantIds)
            ->get();

        // Preserve recommendation order
        $orderedVariants = $variantIds
            ->map(fn ($id) => $variants->firstWhere('id', $id))
            ->filter()
            ->values();

        // Fallback if nothing matched (keep widget non-empty)
        if ($orderedVariants->isEmpty()) {
            $orderedVariants = $this->findMixedVariants($shop, $limit);
        }

        return $this->createWidget(
            shop: $shop,
            locale: $locale,
            type: 'nonFragrance',
            algorithm: 'inspiration',
            variants: $orderedVariants,
            options: $options,
            matchesByVariant: $matchesByVariant
        );
    }

    /**
     * Build "products" widget type - general recommendations
     *
     * @param Shop $shop Target shop
     * @param string $locale Target locale
     * @param int $limit Number of products
     * @param array $options Additional options
     * @return ProductWidget
     */
    public function buildProductsWidget(
        Shop $shop,
        string $locale,
        int $limit = 6,
        array $options = []
    ): ProductWidget {
        $algorithm = $options['algorithm'] ?? 'mixed'; // mixed, trending, new_arrivals

        $variants = match ($algorithm) {
            'trending' => $this->findTrendingVariants($shop, $limit),
            'new_arrivals' => $this->findNewArrivalsVariants($shop, $limit),
            default => $this->findMixedVariants($shop, $limit),
        };

        return $this->createWidget(
            shop: $shop,
            locale: $locale,
            type: 'products',
            algorithm: $algorithm,
            variants: $variants,
            options: $options
        );
    }

    /**
     * Create widget with proper overlay + translation data
     */
    private function createWidget(
        Shop $shop,
        string $locale,
        string $type,
        string $algorithm,
        Collection $variants,
        array $options,
        ?Collection $matchesByVariant = null
    ): ProductWidget {
        return DB::transaction(function () use ($shop, $locale, $type, $algorithm, $variants, $options, $matchesByVariant) {
            $widget = ProductWidget::create([
                'name' => sprintf('%s (%s)', ucfirst($type), strtoupper($locale)),
                'locale' => $locale,
                'shop_id' => $shop->id,
                'settings' => array_merge($options, [
                    'type' => $type,
                    'algorithm' => $algorithm,
                ]),
            ]);

            $position = 0;
            foreach ($variants as $variant) {
                $matchData = $matchesByVariant?->get($variant->id) ?? [];
                $this->createWidgetItem($widget, $variant, $shop, $locale, $position++, $matchData);
            }

            return $widget->fresh(['items']);
        });
    }

    /**
     * Create widget item with overlay prices + translation names
     */
    private function createWidgetItem(
        ProductWidget $widget,
        ProductVariant $variant,
        Shop $shop,
        string $locale,
        int $position,
        array $matchData = []
    ): ProductWidgetItem {
        $variant->loadMissing(['product', 'overlays', 'translations']);

        // Get overlay for this shop (price, currency, stock)
        $overlay = $variant->overlays->firstWhere('shop_id', $shop->id);

        // Get translation for this shop + locale (name, url)
        $translation = $variant->translations
            ->first(fn($t) => $t->shop_id === $shop->id && $t->locale === $locale)
            ?? $variant->translations->firstWhere('locale', $locale);

        // Build payload
        $payload = $this->buildItemPayload($variant, $overlay, $translation, $shop, $locale, $matchData);

        return ProductWidgetItem::create([
            'product_widget_id' => $widget->id,
            'product_variant_id' => $variant->id,
            'position' => $position,
            'payload' => $payload,
        ]);
    }

    /**
     * Build item payload with proper data structure
     */
    private function buildItemPayload(
        ProductVariant $variant,
        $overlay,
        $translation,
        Shop $shop,
        string $locale,
        array $matchData = []
    ): array {
        $product = $variant->product;
        $variantData = $variant->data ?? [];
        $overlayData = $overlay?->data ?? [];
        $translationData = $translation?->data ?? [];

        // Price (from overlay or master)
        $price = $overlay?->price ?? $variant->price;
        $originalPrice = $overlayData['original_price'] ?? $variantData['original_price'] ?? null;
        $currency = $overlay?->currency_code ?? $variant->currency_code ?? 'CZK';

        // Name (from translation or master)
        $name = $translation?->name ?? $variant->name ?? $product->base_payload['name'] ?? 'Produkt';

        // URL (from translation data or construct from shop domain)
        $url = $translationData['url'] 
            ?? $translationData['detail_url']
            ?? $this->constructProductUrl($shop, $variant, $locale);

        // Images (from master - same for all shops)
        $images = $variantData['images'] ?? $product->base_payload['images'] ?? [];
        $imageUrl = is_array($images) && !empty($images) 
            ? $images[0]['url'] ?? $images[0] ?? null
            : $images;

        return [
            'code' => $variant->code,
            'name' => $name,
            'title' => $name,
            'url' => $url,
            'detail_url' => $url,
            'image_url' => $imageUrl,
            'price' => $price,
            'original_price' => $originalPrice,
            'currency_code' => $currency,
            'brand' => $variant->brand ?? $product->base_payload['brand'] ?? null,
            'stock_status' => $variant->stock_status,
            'stock' => $variant->stock, // ← Always from master (shared stock!)
            'ean' => $variant->ean,
            'flags' => $variantData['flags'] ?? [],
            'parameters' => $translation?->parameters ?? $variantData['parameters'] ?? [],
            'match_reasons' => $this->buildMatchReasons($matchData),
        ];
    }

    private function buildMatchReasons(array $matchData): array
    {
        $reasons = [];

        foreach ($matchData['descriptors'] ?? [] as $descriptor) {
            $values = $descriptor['values'] ?? [];
            if ($values === [] || ! is_array($values)) {
                continue;
            }

            $label = 'Inspirováno/podobné: '.implode(', ', $values);
            $reasons[] = $label;
        }

        return array_values(array_unique(array_filter($reasons)));
    }

    /**
     * Construct product URL from shop domain + variant code
     */
    private function constructProductUrl(Shop $shop, ProductVariant $variant, string $locale): string
    {
        $domain = $shop->eshop_url ?? "https://shop-{$shop->id}.cz";
        $slug = $variant->data['slug'] ?? $variant->code;

        return "{$domain}/{$slug}";
    }

    /**
     * Find best selling perfume variants for nonFragrance widget
     */
    private function findBestSellingPerfumeVariants(
        Shop $shop,
        int $limit,
        array $excludeKeywords
    ): Collection {
        $query = ProductVariant::query()
            ->select('product_variants.*')
            ->join('products', 'products.id', '=', 'product_variants.product_id')
            ->leftJoin('inventory_variant_metrics', 'inventory_variant_metrics.product_variant_id', '=', 'product_variants.id')
            ->with(['product', 'overlays', 'translations'])
            ->where('product_variants.stock_status', 'in_stock')
            ->where('product_variants.stock', '>', 0)
            ->where('products.status', 'visible')
            ->orderByDesc('inventory_variant_metrics.total_revenue')
            ->orderByDesc('inventory_variant_metrics.total_quantity')
            ->limit($limit * 3); // Get more to filter

        // Exclude testers, samples, etc.
        foreach ($excludeKeywords as $keyword) {
            $query->where('product_variants.name', 'NOT ILIKE', "%{$keyword}%");
        }

        $candidates = $query->get();

        // Filter to perfumes only (has brand, has fragrance category, etc.)
        return $candidates
            ->filter(function ($variant) {
                $data = $variant->data ?? [];
                $categories = $data['categories'] ?? [];
                
                // Simple heuristic: has brand + not makeup/skincare
                return $variant->brand 
                    && !str_contains(strtolower($variant->name ?? ''), 'makeup')
                    && !str_contains(strtolower($variant->name ?? ''), 'skin');
            })
            ->take($limit);
    }

    /**
     * Find trending variants (high recent sales velocity)
     */
    private function findTrendingVariants(Shop $shop, int $limit): Collection
    {
        return ProductVariant::query()
            ->select('product_variants.*')
            ->join('inventory_variant_metrics', 'inventory_variant_metrics.product_variant_id', '=', 'product_variants.id')
            ->with(['product', 'overlays', 'translations'])
            ->where('product_variants.stock_status', 'in_stock')
            ->where('product_variants.stock', '>', 0)
            ->orderByDesc('inventory_variant_metrics.sales_velocity_7d')
            ->orderByDesc('inventory_variant_metrics.total_quantity')
            ->limit($limit)
            ->get();
    }

    /**
     * Find new arrivals (recently added products)
     */
    private function findNewArrivalsVariants(Shop $shop, int $limit): Collection
    {
        return ProductVariant::query()
            ->select('product_variants.*')
            ->join('products', 'products.id', '=', 'product_variants.product_id')
            ->with(['product', 'overlays', 'translations'])
            ->where('product_variants.stock_status', 'in_stock')
            ->where('product_variants.stock', '>', 0)
            ->where('products.status', 'visible')
            ->orderByDesc('product_variants.created_at')
            ->limit($limit)
            ->get();
    }

    /**
     * Find mixed variants (combination of bestsellers + trending)
     */
    private function findMixedVariants(Shop $shop, int $limit): Collection
    {
        $bestsellers = $this->findBestSellingPerfumeVariants($shop, ceil($limit / 2), []);
        $trending = $this->findTrendingVariants($shop, ceil($limit / 2));

        return $bestsellers->merge($trending)->unique('id')->take($limit);
    }
}
