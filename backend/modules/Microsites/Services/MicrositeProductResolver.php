<?php

namespace Modules\Microsites\Services;

use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ProductTranslation;
use Modules\Pim\Models\ProductVariant;
use Modules\Pim\Models\ProductVariantTranslation;

class MicrositeProductResolver
{
    public function snapshotByVariantCode(?string $code, ?int $shopId = null): ?array
    {
        if (! $code) {
            return null;
        }

        $variant = ProductVariant::query()
            ->where('code', $code)
            ->with(['product.translations' => function ($query) use ($shopId) {
                if ($shopId) {
                    $query->where('shop_id', $shopId)->orWhereNull('shop_id');
                }
            }])
            ->first();

        if (! $variant) {
            return null;
        }

        return $this->snapshotForVariant($variant, $shopId);
    }

    public function snapshotByVariantId(?string $variantId, ?int $shopId = null): ?array
    {
        if (! $variantId) {
            return null;
        }

        $variant = ProductVariant::query()
            ->whereKey($variantId)
            ->with(['product.translations' => function ($query) use ($shopId) {
                if ($shopId) {
                    $query->where('shop_id', $shopId)->orWhereNull('shop_id');
                }
            }])
            ->first();

        if (! $variant) {
            return null;
        }

        return $this->snapshotForVariant($variant, $shopId);
    }

    private function pickTranslation(Product $product, ?int $shopId): ProductTranslation
    {
        $product->loadMissing('translations');

        $translation = $product->translations
            ->first(fn (ProductTranslation $translation) => $translation->shop_id === $shopId)
            ?? $product->translations->first()
            ?? new ProductTranslation();

        return $translation;
    }

    /**
     * @return array<string, mixed>
     */
    private function snapshotForVariant(ProductVariant $variant, ?int $shopId = null): array
    {
        $product = $variant->product;
        $product->loadMissing(['variants.overlays', 'variants.translations']);
        $translation = $this->pickTranslation($product, $shopId);

        $productBasePayload = is_array($product->base_payload) ? $product->base_payload : [];

        $variantOptions = $product->variants->map(function (ProductVariant $productVariant) use ($shopId, $productBasePayload) {
            $overlay = $productVariant->overlays
                ? $productVariant->overlays->firstWhere('shop_id', $shopId)
                : null;

            $variantTranslation = $productVariant->translations
                ? $productVariant->translations
                    ->first(fn (ProductVariantTranslation $record) => $record->shop_id === $shopId)
                    ?? $productVariant->translations->first()
                : null;

            $label = $variantTranslation?->name ?? $productVariant->name ?? $productVariant->code ?? 'Varianta';
            $overlayData = is_array($overlay?->data) ? $overlay->data : [];
            $variantData = is_array($productVariant->data) ? $productVariant->data : [];
            [$resolvedPrice, $resolvedOriginalPrice] = $this->resolveVariantPrices(
                $overlay?->price,
                $overlayData,
                $variantData
            );
            $detailUrl = Arr::get($overlayData, 'detailUrl')
                ?? Arr::get($variantData, 'detailUrl')
                ?? Arr::get($variantData, 'url');
            $imageUrl = $this->resolveVariantImage($overlayData, $variantData, $productBasePayload);

            $actionPrice = null;
            if (is_array($overlayData) && isset($overlayData['actionPrice'])) {
                // Use resolveActionPrice which validates fromDate/toDate range
                $actionPrice = $this->resolveActionPrice($overlayData['actionPrice']);
            }

            return array_filter([
                'id' => $productVariant->id,
                'code' => $productVariant->code,
                'label' => $label,
                'price' => $resolvedPrice ?? $productVariant->price,
                'original_price' => $resolvedOriginalPrice,
                'currency' => $overlay->currency_code ?? $productVariant->currency_code,
                'url' => $detailUrl,
                'image_url' => $imageUrl,
                'stock_level' => $overlay->stock ?? $productVariant->stock,
                'action_price' => $actionPrice,
            ], static fn ($value) => $value !== null);
        })->values()->toArray();

        return [
            'variant_id' => $variant->id,
            'variant_code' => $variant->code,
            'name' => $translation->name ?? $variant->name,
            'description' => $translation->short_description ?? '',
            'price' => $variant->price,
            'currency' => $variant->currency_code ?? Arr::get($product->base_payload, 'currency', 'CZK'),
            'parameters' => $translation->parameters ?? Arr::get($product->base_payload, 'descriptiveParameters', []),
            'images' => Arr::get($product->base_payload, 'images', []),
            'metadata' => Arr::get($product->base_payload, 'metadata', []),
            'variant_options' => $variantOptions,
        ];
    }

    private function resolveVariantPrices(?float $overlayPrice, array $overlayData, array $variantData): array
    {
        [$overlayCalculatedPrice, $overlayCalculatedOriginal] = $this->extractPriceDetails($overlayData);
        [$variantCalculatedPrice, $variantCalculatedOriginal] = $this->extractPriceDetails($variantData);

        $price = $overlayPrice ?? $overlayCalculatedPrice ?? $variantCalculatedPrice ?? $this->toFloat($variantData['price'] ?? null);
        $original = $overlayCalculatedOriginal ?? $variantCalculatedOriginal;

        if ($original === null) {
            $commonPrice = $this->toFloat($variantData['commonPrice'] ?? Arr::get($variantData, 'price.commonPrice'));
            if ($commonPrice !== null && $price !== null && $commonPrice > $price) {
                $original = $commonPrice;
            }
        }

        return [$price, $original];
    }

    private function extractPriceDetails(array $data): array
    {
        $price = $this->toFloat($data['price'] ?? Arr::get($data, 'price.price'));
        $common = $this->toFloat($data['commonPrice'] ?? Arr::get($data, 'price.commonPrice'));
        $action = $this->resolveActionPrice($data['actionPrice'] ?? Arr::get($data, 'price.actionPrice'));

        $perPricelist = $data['perPricelistPrices'] ?? [];
        if (is_array($perPricelist)) {
            foreach ($perPricelist as $entry) {
                if (! is_array($entry)) {
                    continue;
                }
                $entryAction = $this->resolveActionPrice(Arr::get($entry, 'price.actionPrice'));
                if ($entryAction !== null) {
                    $action = $entryAction;
                    $common = $this->toFloat(Arr::get($entry, 'price.commonPrice')) ?? $common;
                    break;
                }
                if ($common === null) {
                    $candidateCommon = $this->toFloat(Arr::get($entry, 'price.commonPrice'));
                    if ($candidateCommon !== null) {
                        $common = $candidateCommon;
                    }
                }
            }
        }

        $current = $action ?? $price;
        $original = $common;

        if ($original === null && $price !== null && $action !== null && $price > $action) {
            $original = $price;
        }

        return [$current, $original];
    }

    private function resolveVariantImage(array $overlayData, array $variantData, array $productBasePayload): ?string
    {
        $candidates = [
            Arr::get($overlayData, 'images.0.url'),
            Arr::get($overlayData, 'images.0'),
            Arr::get($overlayData, 'image.url'),
            Arr::get($overlayData, 'image'),
            Arr::get($overlayData, 'image_url'),
            Arr::get($overlayData, 'gallery.0.url'),
            Arr::get($overlayData, 'gallery.0'),
            Arr::get($variantData, 'images.0.url'),
            Arr::get($variantData, 'images.0'),
            Arr::get($variantData, 'image'),
            Arr::get($variantData, 'image_url'),
            Arr::get($variantData, 'imageUrl'),
            Arr::get($variantData, 'gallery.0.url'),
            Arr::get($variantData, 'gallery.0'),
            Arr::get($productBasePayload, 'images.0.url'),
            Arr::get($productBasePayload, 'images.0'),
        ];

        foreach ($candidates as $candidate) {
            $url = $this->normalizeImageUrl($candidate);
            if ($url !== null) {
                return $url;
            }
        }

        return null;
    }

    private function resolveActionPrice(mixed $actionConfig): ?float
    {
        if (! is_array($actionConfig)) {
            return null;
        }

        $price = $this->toFloat($actionConfig['price'] ?? null);
        if ($price === null) {
            return null;
        }

        $now = Carbon::now()->startOfDay();

        $fromDate = $this->parseDate($actionConfig['fromDate'] ?? null);
        if ($fromDate && $now->lt($fromDate)) {
            return null;
        }

        $toDate = $this->parseDate($actionConfig['toDate'] ?? null, true);
        if ($toDate && $now->gt($toDate)) {
            return null;
        }

        return $price;
    }

    private function parseDate(mixed $value, bool $endOfDay = false): ?Carbon
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        try {
            $date = Carbon::parse($value);
            return $endOfDay ? $date->endOfDay() : $date->startOfDay();
        } catch (\Throwable) {
            return null;
        }
    }

    private function toFloat(mixed $value): ?float
    {
        if ($value === null) {
            return null;
        }

        if (is_float($value) || is_int($value)) {
            return (float) $value;
        }

        if (is_string($value)) {
            $normalized = str_replace([' ', ','], ['', '.'], trim($value));
            if ($normalized === '' || ! is_numeric($normalized)) {
                return null;
            }

            return (float) $normalized;
        }

        return null;
    }

    private function normalizeImageUrl(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        if ($trimmed === '') {
            return null;
        }

        if (str_starts_with($trimmed, 'http://') || str_starts_with($trimmed, 'https://')) {
            return $trimmed;
        }

        if (str_starts_with($trimmed, '//')) {
            return 'https:'.$trimmed;
        }

        $sanitized = ltrim($trimmed, '/');
        if ($sanitized === '') {
            return null;
        }

        $lowered = strtolower($sanitized);

        if (str_starts_with($lowered, 'cdn.myshoptet.com/')) {
            return 'https://'.$sanitized;
        }

        if (str_starts_with($lowered, 'usr/')) {
            return 'https://cdn.myshoptet.com/'.$sanitized;
        }

        $shopBase = 'https://cdn.myshoptet.com/usr/www.krasnevune.cz/';

        if (str_starts_with($lowered, 'user/')) {
            return $shopBase.$sanitized;
        }

        $shopDirs = ['orig/', 'big/', 'medium/', 'small/', 'thumb/', 'thumbnail/'];
        foreach ($shopDirs as $dir) {
            if (str_starts_with($lowered, $dir)) {
                return $shopBase.'user/shop/'.$sanitized;
            }
        }

        return $shopBase.'user/shop/big/'.$sanitized;
    }
}
