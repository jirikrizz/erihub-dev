<?php

namespace Modules\Pim\Services;

use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Modules\Pim\Models\ProductWidget;

class ProductWidgetRenderer
{
    /**
     * @return array{html: string, styles: string, settings: array<string, mixed>}
     */
    public function render(ProductWidget $widget): array
    {
        $widget->loadMissing('items');

        $items = $widget->items->sortBy('position')->map(function ($item) {
            $payload = $item->payload ?? [];

            if (! is_array($payload)) {
                $payload = [];
            }

            if (! empty($payload['raw_html']) && is_string($payload['raw_html'])) {
                return [
                    'mode' => 'raw',
                    'raw_html' => $payload['raw_html'],
                'product_widget_item_id' => $item->id,
                'product_widget_id' => $item->product_widget_id,
                'product_id' => $item->product_id,
                'product_variant_id' => $item->product_variant_id,
                ];
            }

            $pricePayload = Arr::wrap($payload['price'] ?? []);

            return [
                'mode' => 'structured',
              'product_widget_item_id' => $item->id,
              'product_widget_id' => $item->product_widget_id,
              'product_id' => $item->product_id,
              'product_variant_id' => $item->product_variant_id,
                'title' => (string) ($payload['title'] ?? $payload['name'] ?? 'Produkt'),
                'title_html' => $payload['title_html'] ?? null,
                'subtitle' => $payload['subtitle'] ?? null,
                'url' => $payload['url'] ?? '#',
                'detail_url' => $payload['detail_url'] ?? ($payload['url'] ?? '#'),
                'image_url' => $payload['image_url'] ?? $payload['image'] ?? null,
                'gender_icon_url' => $payload['gender_icon_url'] ?? null,
                'gender' => $payload['gender'] ?? null,
                'title_color' => $this->normalizeString($payload['title_color'] ?? null),
                'appendix_background_url' => $this->normalizeString($payload['appendix_background_url'] ?? null),
                'mini_image_url' => $payload['mini_image_url'] ?? null,
                'flags' => $this->normalizeFlags($payload['flags'] ?? []),
                'tags' => $this->normalizeTags($payload['tags'] ?? []),
                'inspired_by_brand' => $this->normalizeString($payload['inspired_by_brand'] ?? null),
                'inspired_by_title' => $this->normalizeString($payload['inspired_by_title'] ?? null),
                'price' => [
                  'current' => $pricePayload['current'] ?? $payload['price_current'] ?? null,
                  'original' => $pricePayload['original'] ?? $payload['price_original'] ?? null,
                  'volume' => $pricePayload['volume'] ?? $payload['price_volume'] ?? null,
                  'discount' => $pricePayload['discount'] ?? $payload['price_discount'] ?? null,
                  'action_price' => $pricePayload['action_price'] ?? $payload['price']['action_price'] ?? $payload['price_action'] ?? $payload['action_price'] ?? null,
                  'base_price' => $pricePayload['base_price'] ?? $payload['price']['base_price'] ?? $payload['price_base'] ?? $payload['base_price'] ?? null,
                ],
                'buy_button' => [
                    'label' => $this->normalizeString($payload['buy_button']['label'] ?? $payload['buy_label'] ?? 'Do košíku'),
                    'variant_id' => $this->normalizeString($payload['buy_button']['variant_id'] ?? $payload['buy_variant_id'] ?? null),
                    'variant_code' => $this->normalizeString($payload['buy_button']['variant_code'] ?? $payload['buy_variant_code'] ?? null),
                    'attributes' => $payload['buy_button']['attributes'] ?? [],
                ],
                'detail_button' => [
                    'label' => $this->normalizeString($payload['detail_button']['label'] ?? $payload['detail_label'] ?? 'Detail'),
                    'url' => $this->normalizeString($payload['detail_button']['url'] ?? $payload['detail_url'] ?? ($payload['url'] ?? '#')),
                    'attributes' => $payload['detail_button']['attributes'] ?? [],
                ],
                'variant_options' => $this->normalizeVariantOptions($payload['variant_options'] ?? []),
                'metadata' => Arr::except($payload, ['title', 'name', 'title_html', 'subtitle', 'url', 'detail_url', 'image_url', 'image', 'gender_icon_url', 'gender', 'title_color', 'appendix_background_url', 'mini_image_url', 'flags', 'tags', 'price', 'price_current', 'price_original', 'price_volume', 'price_discount', 'buy_button', 'buy_label', 'buy_variant_id', 'buy_variant_code', 'detail_button', 'detail_label', 'variant_options', 'raw_html', 'inspired_by_brand', 'inspired_by_title']),
            ];
        })->values();

        $settings = $widget->settings ?? [];

        $containerId = Arr::get($settings, 'container_id');
        if (! is_string($containerId) || $containerId === '') {
          $containerId = 'kv-widget-'.Str::lower($widget->public_token);
        }

        $containerClass = Arr::get($settings, 'container_class');
        if (! is_string($containerClass) || $containerClass === '') {
          $containerClass = 'products products-block kv-widget-block';
        }
        // If there are no items, render nothing (avoid empty "Související produkty" widget)
        if ($items->isEmpty()) {
          return [
            'html' => '',
            'styles' => '',
            'settings' => array_merge($settings, [
              'container_id' => $containerId,
              'container_class' => $containerClass,
            ]),
          ];
        }
        $additionalClasses = 'homepage-products-1 parfemy';
        $containerClass = implode(
            ' ',
            array_unique(
                array_filter(
                    explode(' ', $containerClass.' '.$additionalClasses),
                    static fn ($value) => $value !== null && $value !== ''
                )
            )
        );

        // Locale is determined in Blade template from widget->locale
        // Widget already has this info, so no need to pass separately

        $prepared = [
            'widget' => $widget,
            'items' => $items,
            'settings' => array_merge($settings, [
                'container_id' => $containerId,
                'container_class' => $containerClass,
            ]),
        ];

        $html = view('pim::widgets.embed', $prepared)->render();
        $styles = $this->buildStyles($prepared['settings']);

        return [
            'html' => trim($html),
            'styles' => $styles,
            'settings' => $prepared['settings'],
        ];
    }

    /**
     * @param  array<int, mixed>  $flags
     * @return array<int, array<string, string>>
     */
    private function normalizeFlags(array $flags): array
    {
        $normalized = [];

        foreach ($flags as $flag) {
            if (is_array($flag)) {
                $label = isset($flag['label']) && is_string($flag['label']) ? trim($flag['label']) : null;
                if (! $label) {
                    continue;
                }

                $normalized[] = array_filter([
                    'label' => $label,
                    'class' => isset($flag['class']) && is_string($flag['class']) ? trim($flag['class']) : null,
                ]);
                continue;
            }

            if (is_string($flag) && $flag !== '') {
                $normalized[] = ['label' => $flag];
            }
        }

        return $normalized;
    }

    /**
     * @param  array<int, mixed>  $tags
     * @return array<int, string>
     */
    private function normalizeTags(array $tags): array
    {
        $normalized = [];

        foreach ($tags as $tag) {
            if (! is_string($tag)) {
                continue;
            }
            $label = trim($tag);
            if ($label !== '') {
                $normalized[] = $label;
            }
        }

        return $normalized;
    }

    /**
     * @param  array<int, mixed>  $options
     * @return array<int, array<string, mixed>>
     */
    private function normalizeVariantOptions(array $options): array
    {
        $normalized = [];

        foreach ($options as $option) {
            if (! is_array($option)) {
                continue;
            }

            $label = isset($option['label']) && is_string($option['label']) ? trim($option['label']) : null;
            if (! $label) {
                continue;
            }

            $variantId = $this->normalizeString($option['variant_id'] ?? $option['id'] ?? null);
            $variantCode = $this->normalizeString(
                $option['variant_code'] ?? $option['variantCode'] ?? $option['code'] ?? null
            );
            $variantUrl = $this->normalizeString($option['variant_url'] ?? $option['url'] ?? null);
            $variantDetailUrl = $this->normalizeString(
                $option['variant_detail_url'] ?? $option['detail_url'] ?? $variantUrl
            );
            $variantSize = $this->normalizeString(
                $option['variant_size']
                    ?? $option['display_size']
                    ?? $option['volume']
                    ?? $option['size']
                    ?? ($option['variant-size'] ?? null)
            );
            $displaySize = $this->normalizeString($option['display_size'] ?? $variantSize);

            $payload = [
                'label' => $label,
                'variant_id' => $variantId,
                'code' => $variantCode,
                'variant_code' => $variantCode,
                'variant_title' => $this->normalizeString($option['variant_title'] ?? $option['title'] ?? $label),
                'variant_stock_level' => $option['variant_stock_level'] ?? null,
                'variant_url' => $variantUrl,
                'variant_detail_url' => $variantDetailUrl,
              'variant_price' => $option['variant_price'] ?? $option['price'] ?? null,
              'variant_original_price' => $option['variant_original_price'] ?? $option['original_price'] ?? null,
              'variant_action_price' => $option['variant_action_price'] ?? $option['action_price'] ?? null,
              'variant_price_display' => $this->normalizeString(
                $option['variant_price_display'] ?? $option['price_display'] ?? $option['price'] ?? null
              ),
              'variant_original_price_display' => $this->normalizeString(
                $option['variant_original_price_display']
                  ?? $option['original_price_display']
                  ?? $option['original_price']
                  ?? null
              ),
                'variant_discount_value' => $option['variant_discount_value'] ?? $option['discount_value'] ?? null,
                'variant_discount_percentage' => $option['variant_discount_percentage'] ?? null,
                'price_value' => $option['price_value'] ?? null,
                'original_price_value' => $option['original_price_value'] ?? null,
                'variant_image' => $this->normalizeString(
                    $option['variant_image'] ?? $option['image_url'] ?? $option['imageUrl'] ?? null
                ),
                'variant_mini_image' => $this->normalizeString(
                    $option['variant_mini_image'] ?? $option['mini_image_url'] ?? $option['miniImageUrl'] ?? null
                ),
                'variant_size' => $variantSize,
                'display_size' => $displaySize,
                'volume' => $displaySize,
                'inspired_by_brand' => $this->normalizeString($option['inspired_by_brand'] ?? null),
                'inspired_by_title' => $this->normalizeString($option['inspired_by_title'] ?? null),
            ];

            $normalized[] = array_filter(
                $payload,
                static fn ($value) => $value !== null
            );
        }

        return $normalized;
    }

    private function normalizeString(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    /**
     * @param  array<string, mixed>  $settings
     */
    private function buildStyles(array $settings): string
    {
        if (Arr::get($settings, 'disable_styles') === true) {
            return '';
        }

        // Use external stylesheet instead of inline CSS for better caching
        $cssUrl = $settings['stylesheet_url'] ?? '/css/widget-carousel.css';
        
        return $cssUrl; // Return URL, will be loaded by script.blade.php
    }
}
