<?php

namespace Modules\Inventory\Support;

use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ProductVariant;

class InventoryVariantContext
{
    /**
     * Build a normalized context array for the given variant.
     *
     * @return array{
     *     descriptors: array{inspired: array<int, string>, similar: array<int, string>},
     *     descriptor_items: array{inspired: array<int, array{label: string, value: string, priority: ?int, description: ?string}>, similar: array<int, array{label: string, value: string, priority: ?int, description: ?string}>},
     *     filter_parameters: array<string, array{name: string, values: array<int, string>, priority: ?int, description: ?string}>,
     *     related_products: array<int, array{guid: string, link_type: ?string, priority: ?int, visibility: ?string}>,
     *     base_price: float|null
     * }
     */
    public static function build(ProductVariant $variant): array
    {
        $product = $variant->relationLoaded('product') ? $variant->product : $variant->product()->first();

        $descriptorContext = self::extractRelatedDescriptors($product);
        $filters = self::extractFilterParameters($product);
        $related = self::extractRelatedProductsMeta($product);

        return [
            'descriptors' => $descriptorContext['values'],
            'descriptor_items' => $descriptorContext['items'],
            'filter_parameters' => $filters,
            'related_products' => $related,
            'base_price' => $variant->price,
        ];
    }

    /**
     * @return array{
     *     values: array{inspired: array<int, string>, similar: array<int, string>},
     *     items: array{inspired: array<int, array{label: string, value: string, priority: ?int, description: ?string}>, similar: array<int, array{label: string, value: string, priority: ?int, description: ?string}>}
     * }
     */
    public static function extractRelatedDescriptors(?Product $product): array
    {
        $values = [
            'inspired' => [],
            'similar' => [],
        ];

        $items = [
            'inspired' => [],
            'similar' => [],
        ];

        $seen = [
            'inspired' => [],
            'similar' => [],
        ];

        if (! $product) {
            return [
                'values' => $values,
                'items' => $items,
            ];
        }

        $payload = $product->base_payload ?? null;

        if (! is_array($payload)) {
            return [
                'values' => $values,
                'items' => $items,
            ];
        }

        $entries = Arr::get($payload, 'descriptiveParameters', []);

        if (! is_array($entries)) {
            return [
                'values' => $values,
                'items' => $items,
            ];
        }

        foreach ($entries as $entry) {
            if (! is_array($entry)) {
                continue;
            }

            $normalizedName = self::normalizeDescriptorName($entry['name'] ?? null);

            if ($normalizedName === null) {
                continue;
            }

            $descriptorValues = self::extractDescriptorValues($entry);

            if ($descriptorValues === []) {
                continue;
            }

            $priority = isset($entry['priority']) && is_numeric($entry['priority'])
                ? (int) $entry['priority']
                : null;

            $description = isset($entry['description']) && $entry['description'] !== ''
                ? (string) $entry['description']
                : null;

            $label = self::resolveDescriptorLabel($entry);

            foreach ($descriptorValues as $value) {
                $target = match ($normalizedName) {
                    'inspirovano' => 'inspired',
                    'podobne' => 'similar',
                    default => null,
                };

                if ($target === null) {
                    continue;
                }

                if (! in_array($value, $values[$target], true)) {
                    $values[$target][] = $value;
                }

                $item = [
                    'label' => $label !== '' ? $label : $value,
                    'value' => $value,
                    'priority' => $priority,
                    'description' => $description,
                ];

                if (! array_key_exists($value, $seen[$target])) {
                    $seen[$target][$value] = count($items[$target]);
                    $items[$target][] = $item;
                    continue;
                }

                $index = $seen[$target][$value];
                $existing = $items[$target][$index];

                $existingPriority = $existing['priority'] ?? null;
                if ($existingPriority === null || ($priority !== null && $priority < $existingPriority)) {
                    $existing['priority'] = $priority;
                }

                if (($existing['description'] ?? null) === null && $description !== null) {
                    $existing['description'] = $description;
                }

                if (($existing['label'] ?? '') === '' && $label !== '') {
                    $existing['label'] = $label;
                }

                $items[$target][$index] = $existing;
            }
        }

        foreach (['inspired', 'similar'] as $key) {
            $values[$key] = array_values(array_unique($values[$key]));

            usort($items[$key], static function (array $left, array $right): int {
                $leftPriority = $left['priority'] ?? PHP_INT_MAX;
                $rightPriority = $right['priority'] ?? PHP_INT_MAX;

                if ($leftPriority === $rightPriority) {
                    return strcmp($left['value'], $right['value']);
                }

                return $leftPriority <=> $rightPriority;
            });
        }

        return [
            'values' => $values,
            'items' => $items,
        ];
    }

    public static function extractFilterParameters(?Product $product): array
    {
        if (! $product) {
            return [];
        }

        $payload = $product->base_payload ?? null;

        if (! is_array($payload)) {
            return [];
        }

        $entries = Arr::get($payload, 'filteringParameters', []);

        if (! is_array($entries) || $entries === []) {
            return [];
        }

        $normalized = [];

        foreach ($entries as $entry) {
            if (! is_array($entry)) {
                continue;
            }

            $name = isset($entry['name']) ? trim((string) $entry['name']) : '';
            if ($name === '' && isset($entry['displayName'])) {
                $name = trim((string) $entry['displayName']);
            }

            if ($name === '') {
                $name = 'Parametr';
            }

            $slug = Str::slug($name);

            $values = self::normalizeFilterValues($entry);

            if ($values === []) {
                continue;
            }

            $priority = isset($entry['priority']) && is_numeric($entry['priority'])
                ? (int) $entry['priority']
                : null;

            $description = isset($entry['description']) && $entry['description'] !== ''
                ? (string) $entry['description']
                : null;

            $normalized[$slug] = [
                'slug' => $slug,
                'name' => $name,
                'values' => $values,
                'priority' => $priority,
                'description' => $description,
            ];
        }

        return $normalized;
    }

    /**
     * @return array<int, array{guid: string, link_type: ?string, priority: ?int, visibility: ?string}>
     */
    public static function extractRelatedProductsMeta(?Product $product): array
    {
        if (! $product) {
            return [];
        }

        $payload = $product->base_payload ?? null;

        if (! is_array($payload)) {
            return [];
        }

        $related = Arr::get($payload, 'relatedProducts', []);

        if (! is_array($related) || $related === []) {
            return [];
        }

        return collect($related)
            ->filter(fn ($item) => is_array($item) && isset($item['guid']))
            ->map(fn ($item) => [
                'guid' => (string) $item['guid'],
                'link_type' => isset($item['linkType']) ? (string) $item['linkType'] : null,
                'priority' => isset($item['priority']) && is_numeric($item['priority'])
                    ? (int) $item['priority']
                    : null,
                'visibility' => isset($item['visibility']) ? (string) $item['visibility'] : null,
            ])
            ->values()
            ->all();
    }

    public static function enrichRelatedProducts(array $meta): array
    {
        if ($meta === []) {
            return [];
        }

        $guids = collect($meta)->pluck('guid')->unique()->values()->all();

        $products = Product::query()
            ->select([
                'id',
                'external_guid',
                'sku',
                'status',
                DB::raw("base_payload->>'name' AS name"),
            ])
            ->whereIn('external_guid', $guids)
            ->with([
                'variants' => fn ($query) => $query
                    ->select([
                        'product_variants.id',
                        'product_variants.product_id',
                        'product_variants.code',
                        'product_variants.name',
                        'product_variants.sku',
                        'product_variants.ean',
                    ])
                    ->orderBy('code'),
            ])
            ->get()
            ->keyBy('external_guid');

        return collect($meta)
            ->map(function (array $item) use ($products) {
                $product = $products->get($item['guid']);

                if ($product) {
                    $item['product'] = [
                        'id' => $product->id,
                        'name' => $product->getAttribute('name') ?? Arr::get($product->base_payload ?? [], 'name'),
                        'sku' => $product->sku,
                        'status' => $product->status,
                        'variants' => $product->variants->map(fn (ProductVariant $variant) => [
                            'id' => $variant->id,
                            'code' => $variant->code,
                            'name' => $variant->name,
                            'sku' => $variant->sku,
                            'ean' => $variant->ean,
                        ])->values()->all(),
                    ];
                } else {
                    $item['product'] = null;
                }

                return $item;
            })
            ->sort(function (array $left, array $right) {
                $lp = $left['priority'] ?? PHP_INT_MAX;
                $rp = $right['priority'] ?? PHP_INT_MAX;

                if ($lp === $rp) {
                    return strcmp($left['guid'], $right['guid']);
                }

                return $lp <=> $rp;
            })
            ->values()
            ->all();
    }

    private static function normalizeDescriptorName(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim(mb_strtolower($value));

        if ($trimmed === '') {
            return null;
        }

        return Str::of($trimmed)->ascii()->value();
    }

    private static function extractDescriptorValues(array $entry): array
    {
        $values = [];

        if (isset($entry['values']) && is_array($entry['values'])) {
            foreach ($entry['values'] as $valueEntry) {
                if (is_array($valueEntry)) {
                    $candidate = $valueEntry['value']
                        ?? $valueEntry['name']
                        ?? $valueEntry['displayName']
                        ?? $valueEntry['valueIndex']
                        ?? null;

                    if (is_string($candidate) && trim($candidate) !== '') {
                        $values[] = trim($candidate);
                    }
                } elseif (is_string($valueEntry) && trim($valueEntry) !== '') {
                    $values[] = trim($valueEntry);
                }
            }
        }

        if ($values !== []) {
            return array_values(array_unique($values));
        }

        if (isset($entry['value']) && is_string($entry['value'])) {
            $raw = trim($entry['value']);

            if ($raw !== '') {
                $values = array_values(array_filter(array_map('trim', preg_split('/[,;\r\n]+/', $raw) ?: [])));
            }
        }

        return array_values(array_unique($values));
    }

    private static function normalizeFilterValues(array $entry): array
    {
        $values = [];

        if (isset($entry['values']) && is_array($entry['values'])) {
            foreach ($entry['values'] as $valueEntry) {
                if (is_array($valueEntry)) {
                    $candidate = $valueEntry['name']
                        ?? $valueEntry['displayName']
                        ?? $valueEntry['value']
                        ?? $valueEntry['valueIndex']
                        ?? null;

                    if (is_string($candidate) && trim($candidate) !== '') {
                        $values[] = trim($candidate);
                    }
                } elseif (is_string($valueEntry) && trim($valueEntry) !== '') {
                    $values[] = trim($valueEntry);
                }
            }
        }

        if ($values === [] && isset($entry['value']) && is_string($entry['value'])) {
            $raw = trim($entry['value']);
            if ($raw !== '') {
                $values = array_values(array_filter(array_map('trim', preg_split('/[,;\r\n]+/', $raw) ?: [])));
            }
        }

        return array_values(array_unique($values));
    }

    private static function resolveDescriptorLabel(array $entry): string
    {
        foreach (['displayName', 'name', 'title', 'label'] as $key) {
            if (isset($entry[$key]) && is_string($entry[$key])) {
                $candidate = trim($entry[$key]);
                if ($candidate !== '') {
                    return $candidate;
                }
            }
        }

        return '';
    }
}
