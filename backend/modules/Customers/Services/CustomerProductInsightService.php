<?php

namespace Modules\Customers\Services;

use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Modules\Core\Services\CurrencyConverter;
use Modules\Customers\Models\Customer;
use Modules\Orders\Models\OrderItem;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ProductVariant;

class CustomerProductInsightService
{
    public function __construct(private readonly CurrencyConverter $currencyConverter)
    {
    }

    public function summarize(Customer $customer, bool $refresh = false): array
    {
        $cacheKey = sprintf('customers:%s:product-insights', $customer->guid);

        if ($refresh) {
            $insights = $this->buildInsights($customer);
            Cache::put($cacheKey, $insights, now()->addMinutes(30));

            return $insights;
        }

        return Cache::remember($cacheKey, now()->addMinutes(30), fn () => $this->buildInsights($customer));
    }

    private function buildInsights(Customer $customer): array
    {
        if (! $customer->guid) {
            return [
                'base_currency' => $this->currencyConverter->getBaseCurrency(),
                'categories' => [],
                'parameters' => [],
            ];
        }

        $items = OrderItem::query()
            ->select([
                'order_items.id',
                'order_items.order_id',
                'order_items.code',
                'order_items.product_guid',
                'order_items.item_type',
                'order_items.amount',
                'order_items.price_with_vat',
                'order_items.data',
                'orders.currency_code',
                'orders.shop_id',
            ])
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.customer_guid', $customer->guid)
            ->whereIn('order_items.item_type', ['product', 'product-set'])
            ->get();

        if ($items->isEmpty()) {
            return [
                'base_currency' => $this->currencyConverter->getBaseCurrency(),
                'categories' => [],
                'parameters' => [],
            ];
        }

        $variantCodes = $items
            ->pluck('code')
            ->filter(fn ($code) => is_string($code) && $code !== '')
            ->unique()
            ->values();

        $shopIds = $items
            ->pluck('shop_id')
            ->filter(fn ($id) => $id !== null)
            ->unique()
            ->values();

        /** @var Collection<string, ProductVariant> $variants */
        $variants = ProductVariant::query()
            ->whereIn('code', $variantCodes)
            ->with([
                'product.translations' => function ($query) use ($shopIds) {
                    if ($shopIds->isNotEmpty()) {
                        $query->whereIn('shop_id', $shopIds->all())
                            ->orWhereNull('shop_id');
                    }
                },
                'product.overlays' => function ($query) use ($shopIds) {
                    if ($shopIds->isNotEmpty()) {
                        $query->whereIn('shop_id', $shopIds->all());
                    }
                },
            ])
            ->get()
            ->keyBy('code');

        /** @var array<string, array{order_ids: array<string, true>, quantity: float, revenue: float}> $categoryStats */
        $categoryStats = [];

        /** @var array<string, array<string, array{order_ids: array<string, true>, quantity: float, revenue: float}>> $parameterStats */
        $parameterStats = [];

        foreach ($items as $item) {
            $orderId = (string) $item->order_id;
            $shopId = (int) ($item->shop_id ?? 0);
            $currency = $item->currency_code;
            $quantity = (float) ($item->amount ?? 0);
            $variant = $item->code ? $variants->get($item->code) : null;

            $revenueBase = $this->currencyConverter->convertToBase(
                $item->price_with_vat !== null ? (float) $item->price_with_vat : null,
                $currency
            ) ?? 0.0;

            $categories = $this->resolveCategories($variant, $shopId) ?: $this->resolveCategoriesFromItem($item);
            $uniqueCategories = collect($categories)
                ->filter(fn ($label) => is_string($label) && $label !== '')
                ->map(fn ($label) => trim($label))
                ->filter()
                ->unique();

            foreach ($uniqueCategories as $category) {
                $entry = $categoryStats[$category] ?? [
                    'order_ids' => [],
                    'quantity' => 0.0,
                    'revenue' => 0.0,
                ];

                $entry['order_ids'][$orderId] = true;
                $entry['quantity'] += $quantity;
                $entry['revenue'] += $revenueBase;

                $categoryStats[$category] = $entry;
            }

            $parameterValues = $this->resolveParameters($variant, $shopId);

            foreach ($parameterValues as $parameterName => $values) {
                $uniqueValues = collect($values)
                    ->map(fn ($value) => is_scalar($value) ? trim((string) $value) : null)
                    ->filter()
                    ->unique();

                foreach ($uniqueValues as $valueLabel) {
                    $paramEntry = $parameterStats[$parameterName][$valueLabel] ?? [
                        'order_ids' => [],
                        'quantity' => 0.0,
                        'revenue' => 0.0,
                    ];

                    $paramEntry['order_ids'][$orderId] = true;
                    $paramEntry['quantity'] += $quantity;
                    $paramEntry['revenue'] += $revenueBase;

                    $parameterStats[$parameterName][$valueLabel] = $paramEntry;
                }
            }
        }

        $categories = collect($categoryStats)
            ->map(fn ($data, $name) => [
                'name' => $name,
                'orders' => count($data['order_ids']),
                'quantity' => round($data['quantity'], 2),
                'revenue' => round($data['revenue'], 2),
            ])
            ->sortByDesc('revenue')
            ->values()
            ->all();

        $parameters = [];
        foreach ($parameterStats as $parameterName => $values) {
            $mapped = collect($values)
                ->map(fn ($data, $valueLabel) => [
                    'value' => $valueLabel,
                    'orders' => count($data['order_ids']),
                    'quantity' => round($data['quantity'], 2),
                    'revenue' => round($data['revenue'], 2),
                ])
                ->sortByDesc('revenue')
                ->values()
                ->take(8)
                ->all();

            if ($mapped === []) {
                continue;
            }

            $parameters[] = [
                'name' => $parameterName,
                'values' => $mapped,
            ];
        }

        return [
            'base_currency' => $this->currencyConverter->getBaseCurrency(),
            'categories' => $categories,
            'parameters' => $parameters,
        ];
    }

    /**
     * @return array<int, string>
     */
    private function resolveCategories(?ProductVariant $variant, int $shopId): array
    {
        if (! $variant || ! $variant->relationLoaded('product')) {
            return [];
        }

        /** @var Product|null $product */
        $product = $variant->product;

        if (! $product) {
            return [];
        }

        $overlay = $product->relationLoaded('overlays')
            ? $product->overlays->firstWhere('shop_id', $shopId) ?? $product->overlays->first()
            : null;

        $categories = [];

        if ($overlay) {
            $mapped = Arr::get($overlay->data ?? [], 'mappedCategories', []);

            foreach (Arr::wrap($mapped) as $entry) {
                $label = is_array($entry)
                    ? ($entry['name'] ?? $entry['label'] ?? $entry['fullName'] ?? null)
                    : (is_string($entry) ? $entry : null);

                if (is_string($label) && trim($label) !== '') {
                    $categories[] = trim($label);
                }
            }
        }

        if ($categories !== []) {
            return $categories;
        }

        $payload = $product->base_payload ?? [];
        $allCategories = Arr::get($payload, 'allCategories', []);

        foreach (Arr::wrap($allCategories) as $entry) {
            $label = is_array($entry)
                ? ($entry['name'] ?? $entry['fullName'] ?? $entry['path'] ?? null)
                : (is_string($entry) ? $entry : null);

            if (is_string($label) && trim($label) !== '') {
                $categories[] = trim($label);
            }
        }

        return $categories;
    }

    /**
     * @return array<int, string>
     */
    private function resolveCategoriesFromItem(OrderItem $item): array
    {
        $categories = [];

        $data = $item->data;
        if (! is_array($data)) {
            return [];
        }

        $categoryHints = Arr::get($data, 'product.categories', []);
        foreach (Arr::wrap($categoryHints) as $entry) {
            $label = is_array($entry)
                ? ($entry['name'] ?? $entry['label'] ?? null)
                : (is_string($entry) ? $entry : null);

            if (is_string($label) && trim($label) !== '') {
                $categories[] = trim($label);
            }
        }

        return $categories;
    }

    /**
     * @return array<string, array<int, string>>
     */
    private function resolveParameters(?ProductVariant $variant, int $shopId): array
    {
        if (! $variant || ! $variant->relationLoaded('product')) {
            return [];
        }

        $product = $variant->product;
        if (! $product) {
            return [];
        }

        $parameters = [];

        if ($product->relationLoaded('translations')) {
            $translation = $product->translations
                ->firstWhere('shop_id', $shopId)
                ?? $product->translations->firstWhere('shop_id', $product->shop_id)
                ?? $product->translations->first();

            if ($translation) {
                $parameters = $this->mergeParameterValues($parameters, $translation->parameters ?? []);
            }
        }

        $variantParameters = Arr::get($variant->data ?? [], 'parameters', []);

        if ($variantParameters) {
            $parameters = $this->mergeParameterValues($parameters, $variantParameters);
        }

        return $parameters;
    }

    /**
     * @param  array<string, array<int, string>>  $carry
     * @param  mixed  $parameters
     * @return array<string, array<int, string>>
     */
    private function mergeParameterValues(array $carry, $parameters): array
    {
        foreach (Arr::wrap($parameters) as $parameter) {
            if (! is_array($parameter)) {
                continue;
            }

            $name = trim((string) ($parameter['name'] ?? $parameter['label'] ?? ''));
            if ($name === '') {
                continue;
            }

            $values = $this->extractParameterValues($parameter);

            if ($values === []) {
                continue;
            }

            $carry[$name] = array_merge($carry[$name] ?? [], $values);
        }

        return $carry;
    }

    /**
     * @return array<int, string>
     */
    private function extractParameterValues(array $parameter): array
    {
        $candidates = [
            $parameter['selectedValue'] ?? null,
            $parameter['value'] ?? null,
            $parameter['textValue'] ?? null,
        ];

        if (isset($parameter['values']) && is_array($parameter['values'])) {
            foreach ($parameter['values'] as $value) {
                if (is_array($value)) {
                    $candidates[] = $value['value'] ?? $value['name'] ?? null;
                    $candidates[] = $value['label'] ?? null;
                } elseif (is_string($value)) {
                    $candidates[] = $value;
                }
            }
        }

        if (isset($parameter['options']) && is_array($parameter['options'])) {
            foreach ($parameter['options'] as $value) {
                if (is_array($value)) {
                    $candidates[] = $value['label'] ?? $value['value'] ?? null;
                } elseif (is_string($value)) {
                    $candidates[] = $value;
                }
            }
        }

        return collect($candidates)
            ->filter(fn ($value) => is_string($value) && trim($value) !== '')
            ->map(fn ($value) => trim((string) $value))
            ->unique()
            ->values()
            ->all();
    }
}
