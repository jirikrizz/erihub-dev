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
                ];
            }

            $pricePayload = Arr::wrap($payload['price'] ?? []);

            return [
                'mode' => 'structured',
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


        return <<<CSS
.kv-widget-block {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
  margin: 0 auto 48px;
  padding: 16px 12px 64px;
  max-width: 1180px;
  box-sizing: border-box;
}
.kv-widget-block li::before {
  content: none !important;
  display: none !important;
}
.kv-widget-slider {
  position: relative;
  width: 100%;
  padding: 0 56px;
  box-sizing: border-box;
}
.kv-widget-slide .p-in-in > a {
  text-decoration: none;
  height: 158px;
}
.kv-widget-viewport {
  flex: 1 1 auto;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x pan-y;
  scroll-snap-type: x mandatory;
  width: 100%;
}
.kv-widget-track {
  display: flex;
  gap: 24px;
  transition: transform 0.35s ease;
  will-change: transform;
}
.kv-widget-slide {
  flex: 0 0 auto;
  scroll-snap-align: start;
}
.kv-widget-nav {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(208, 213, 232, 0.8);
  background: #ffffff;
  color: #1fb56b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 14px 28px rgba(31, 181, 107, 0.2);
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
}
.kv-widget-nav span {
  font-size: 24px;
  line-height: 1;
  font-weight: 600;
}
.kv-widget-nav:hover:not(.is-disabled):not([disabled]) {
  background: #1fb56b;
  color: #ffffff;
  border-color: #1fb56b;
}
.kv-widget-nav.is-disabled,
.kv-widget-nav[disabled] {
  cursor: default;
  color: rgba(31, 181, 107, 0.35);
  border-color: rgba(208, 213, 232, 0.5);
  box-shadow: none;
}
.kv-widget-nav.kv-widget-prev {
  left: 8px;
}
.kv-widget-nav.kv-widget-next {
  right: 8px;
}
.kv-widget-slider-dots {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: none;
  align-items: center;
  gap: 10px;
}
.kv-widget-block .widget-parameter-wrapper {
  width: 100%;
}
.kv-widget-block .widget-parameter-list {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  padding: 0;
  margin: 0;
}
.kv-widget-block .widget-parameter-value {
  list-style: none;
}
.kv-widget-block .widget-parameter-list .widget-parameter-value a {
  text-align: center;
}
.kv-widget-block .tags,
.kv-widget-block .widget-parameter-list {
  list-style: none;
}
.kv-widget-block li::before,
.kv-widget-block li::after,
.kv-widget-block .tags .tag::before,
.kv-widget-block .widget-parameter-list .widget-parameter-value::before,
.kv-widget-block *::before,
.kv-widget-block *::after {
  display: none !important;
  content: none !important;
}
.kv-widget-card {
  position: relative;
  flex: 0 0 300px;
  min-width: 300px;
  max-width: 320px;
  background: #ffffff;
  border: 1px solid rgba(234, 236, 247, 0.9);
  border-radius: 32px;
  box-shadow: 0 20px 40px rgba(32, 41, 64, 0.12);
  padding: 32px 28px 30px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.kv-widget-card:hover {
  transform: translateY(-6px);
  box-shadow: 0 28px 52px rgba(32, 41, 64, 0.18);
}
.kv-widget-block .p {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
}
.kv-widget-block .image {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  padding: 16px;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(250, 251, 255, 0.6) 0%, rgba(255, 255, 255, 0.9) 100%);
  margin-bottom: 20px;
}
.kv-widget-block .image img[data-role="product-image"] {
  max-height: 220px;
  width: auto;
  max-width: 100%;
  object-fit: contain;
  transition: transform 0.2s ease;
}
.kv-widget-block .image:hover img[data-role="product-image"] {
  transform: scale(1.03);
}
.kv-widget-block .gender_img_icon {
  position: absolute;
  left: 18px;
  top: 18px;
  width: 34px;
  height: 34px;
  filter: drop-shadow(0 6px 14px rgba(44, 61, 104, 0.35));
}
.kv-widget-block .flags {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}
.kv-widget-block .flags .flag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 15px;
  border-radius: 999px;
  background: linear-gradient(135deg, #f16aa5, #f46fb1);
  color: #ffffff;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  box-shadow: 0 8px 18px rgba(241, 106, 165, 0.3);
}
.kv-widget-block .flags.flags-extra {
  display: none;
}
.kv-widget-block .bought_in_time {
  position: absolute;
  left: 18px;
  bottom: 18px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.45);
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
}
.kv-widget-block .bought_in_time img {
  width: 16px;
  height: 16px;
}
.kv-widget-block .mini-original-parfume {
  position: absolute;
  right: 18px;
  bottom: 18px;
  width: 62px;
  height: 62px;
  border-radius: 18px;
  overflow: hidden;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 24px rgba(38, 48, 82, 0.18);
}
.kv-widget-block .mini-original-parfume img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.kv-widget-block .tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  padding: 0;
  margin: 12px 0 18px;
  list-style: none;
}
.kv-widget-block .tags .tag {
  padding: 6px 16px;
  border-radius: 999px;
  background: #eef1fb;
  color: #2f3354;
  font-size: 13px;
  font-weight: 600;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
}
.kv-widget-block .p-in {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
}
.kv-widget-block .p-in-in {
  position: relative;
}
.kv-widget-block .name {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  font-weight: 700;
  font-size: 18px;
  text-align: center;
  margin-bottom: 14px;
  line-height: 1.35;
}
.kv-widget-block .name span {
  display: inline-flex;
  flex-direction: column;
  gap: 10px;
}
.kv-widget-block .product-appendix {
  display: inline-block;
  font-size: 14px;
  line-height: 1.45;
  color: #5f6783;
}
.kv-widget-block .product-appendix.category-appendix {
  margin-top: 0;
}
.brx-product .product-appendix.category-appendix {
  font-size: 14px;
  color: #757575;
  font-weight: 300;
}
.kv-widget-block .product-appendix .changable {
  display: inline-block;
  margin-top: 4px;
  font-size: 14px;
  color: #5b5f75;
}
.kv-widget-block .product-appendix .changable strong {
  display: inline-block;
  padding: 22px 12px 0 12px;
  font-size: 15px;
  font-weight: 800;
  color: #121431;
  border-radius: 18px;
  background-repeat: no-repeat;
  background-size: cover;
  line-height: 0.7;
  margin-top: 10px;
}
.kv-widget-block .product-appendix .changable strong .inspired-brand {
  text-transform: uppercase;
}
.kv-widget-block .product-appendix .changable strong .inspired-title {
  text-transform: none;
}
.kv-widget-block .ratings-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
  color: #3c425d;
}
.kv-widget-block .stars-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.kv-widget-block .stars {
  display: inline-flex;
  gap: 4px;
}
.kv-widget-block .star {
  width: 16px;
  height: 16px;
  background: url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23f5a623"%3E%3Cpath d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/%3E%3C/svg%3E') no-repeat center/contain;
}
.kv-widget-block .favorite-icon {
  position: absolute;
  top: -6px;
  right: 0;
  cursor: pointer;
}
.kv-widget-block .favorite-icon svg {
  width: 24px;
  height: 24px;
}
.kv-widget-block .prices {
  margin-bottom: 18px;
}
.kv-widget-block .price-final {
  display: grid;
  grid-template-columns: auto auto;
  row-gap: 6px;
  column-gap: 12px;
  align-items: center;
}
.kv-widget-block .productVolume {
  grid-row: 1 / span 2;
  padding: 6px 18px;
  border-radius: 999px;
  background: #edf1ff;
  font-weight: 700;
  font-size: 14px;
  color: #1f2752;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
}
.kv-widget-block .price-standard {
  font-size: 14px;
  color: #9196b2;
  font-weight: 600;
  text-decoration: line-through;
}
.kv-widget-block .price-save {
  font-size: 14px;
  font-weight: 700;
  color: #ff5d7d;
}
.kv-widget-block .price-final strong {
  grid-column: 1 / span 2;
  font-size: 28px;
  font-weight: 800;
  color: #ff3e2d;
  line-height: 1.1;
  letter-spacing: -0.01em;
}
.kv-widget-block .p-tools {
  display: flex;
  justify-content: space-between;
  gap: 14px;
}
.kv-widget-block .p-tools .btn {
  flex: 1;
  height: 52px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}
.kv-widget-block .p-tools .btn.btn-primary {
  border: 2px solid #1fb56b;
  background: #ffffff;
  color: #1a9657;
}
.kv-widget-block .p-tools .btn.btn-primary:hover {
  background: #f2fbf6;
}
.kv-widget-block .p-tools .btn.btn-cart {
  border: none;
  background: linear-gradient(135deg, #1fb56b, #14a257);
  color: #ffffff;
  box-shadow: 0 16px 24px rgba(20, 162, 87, 0.28);
}
.kv-widget-block .p-tools .btn.btn-cart:hover {
  transform: translateY(-2px);
  box-shadow: 0 20px 30px rgba(20, 162, 87, 0.33);
}
.kv-widget-block .p-tools .btn span {
  pointer-events: none;
}
.widget-parameter-wrapper.justified {
  margin-top: 24px;
}
.widget-parameter-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
  justify-content: center;
}
.widget-parameter-value {
  min-width: 0;
  border: 1px solid #d7dae8;
  border-radius: 999px;
  padding: 8px 18px;
  font-size: 14px;
  font-weight: 600;
  color: #2c2f4c;
  background: #ffffff;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
}
.widget-parameter-value a {
  color: inherit;
  text-decoration: none;
}
.widget-parameter-value:hover,
.widget-parameter-value:focus {
  border-color: #1fb56b;
  background: #e6f8ee;
  color: #0f6f3b;
}
.widget-parameter-value.active-variant {
  border-color: #1fb56b;
  background: #1fb56b;
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(31, 181, 107, 0.28);
}
.widget-parameter-more {
  text-align: center;
  margin-top: 12px;
  font-size: 13px;
  color: #1a9657;
  cursor: pointer;
}
.kv-widget-slider-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: #d7dae8;
  border: none;
  transition: background 0.2s ease, transform 0.2s ease;
  cursor: pointer;
}
.kv-widget-slider-dot.is-active {
  background: #1fb56b;
  transform: scale(1.1);
}
.kv-widget-slider-dot:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(31, 181, 107, 0.25);
}
@media (max-width: 1024px) {
  .kv-widget-slider {
    gap: 12px;
  }
  .kv-widget-slider {
    padding: 0 48px;
  }
  .kv-widget-track {
    gap: 20px;
  }
}
@media (max-width: 768px) {
  .kv-widget-nav {
    width: 38px;
    height: 38px;
    left: 4px;
    right: 4px;
  }
  .kv-widget-nav.kv-widget-prev {
    left: 4px;
  }
  .kv-widget-nav.kv-widget-next {
    right: 4px;
  }
  .kv-widget-slider {
    padding: 0 44px;
  }
  .kv-widget-slider-dots {
    bottom: 6px;
  }
}
@media (max-width: 640px) {
  .kv-widget-nav.kv-widget-prev {
    left: -20px !important;
    right: auto !important;
  }
  .kv-widget-nav.kv-widget-next {
    right: -20px !important;
    left: auto !important;
  }
}
CSS;

CSS;
    }
}
