<?php

namespace Modules\Pim\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;
use Modules\Pim\Models\ShopAttributeMapping;
use Modules\Pim\Models\ShopAttributeValueMapping;
use Modules\Pim\Services\AttributeMappingAiService;
use Modules\Shoptet\Contracts\ShoptetClient;
use Modules\Shoptet\Models\Shop;
use Throwable;

class AttributeMappingController extends Controller
{
    public function __construct(
        private readonly ShoptetClient $client,
        private readonly AttributeMappingAiService $aiService
    ) {
    }

    public function index(Request $request)
    {
        $data = $request->validate([
            'master_shop_id' => ['required', 'integer', 'exists:shops,id'],
            'target_shop_id' => ['required', 'integer', 'different:master_shop_id', 'exists:shops,id'],
            'type' => ['required', Rule::in(['flags', 'filtering_parameters', 'variants'])],
        ]);

        $masterShop = $this->resolveShop((int) $data['master_shop_id']);
        $targetShop = $this->resolveShop((int) $data['target_shop_id']);
        $result = $this->buildResponse($masterShop, $targetShop, $data['type']);

        return response()->json(['data' => $result]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'master_shop_id' => ['required', 'integer', 'exists:shops,id'],
            'target_shop_id' => ['required', 'integer', 'different:master_shop_id', 'exists:shops,id'],
            'type' => ['required', Rule::in(['flags', 'filtering_parameters', 'variants'])],
            'mappings' => ['array'],
            'mappings.*.master_key' => ['required', 'string'],
            'mappings.*.target_key' => ['nullable', 'string'],
            'mappings.*.values' => ['nullable', 'array'],
            'mappings.*.values.*.master_key' => ['required_with:mappings.*.values', 'string'],
            'mappings.*.values.*.target_key' => ['nullable', 'string'],
        ]);

        $masterShop = $this->resolveShop((int) $data['master_shop_id']);
        $targetShop = $this->resolveShop((int) $data['target_shop_id']);
        $type = $data['type'];
        $supportsValues = $this->typeSupportsValues($type);

        $masterItems = collect($this->loadItems($masterShop, $type))->keyBy('key');
        $targetItems = collect($this->loadItems($targetShop, $type))->keyBy('key');

        $existing = ShopAttributeMapping::query()
            ->where('master_shop_id', $masterShop->id)
            ->where('target_shop_id', $targetShop->id)
            ->where('type', $type)
            ->get()
            ->keyBy('master_key');

        $targetAssignments = [];
        foreach ($existing as $record) {
            if ($record->target_key) {
                $targetAssignments[$record->target_key] = $record->master_key;
            }
        }

        $processedMasters = [];
        $mappings = $data['mappings'] ?? [];

        foreach ($mappings as $entry) {
            $masterKey = (string) $entry['master_key'];
            if (! $masterItems->has($masterKey)) {
                continue;
            }

            $targetKey = $entry['target_key'] ?? null;
            if ($targetKey === null || $targetKey === '') {
                if (isset($existing[$masterKey])) {
                    if ($supportsValues) {
                        $existing[$masterKey]->values()->delete();
                    }
                    $existing[$masterKey]->delete();
                    unset($existing[$masterKey]);
                }
                continue;
            }

            if (! $targetItems->has($targetKey)) {
                continue;
            }

            $currentOwner = $targetAssignments[$targetKey] ?? null;
            if ($currentOwner !== null && $currentOwner !== $masterKey && isset($existing[$currentOwner])) {
                $existing[$currentOwner]->delete();
                unset($existing[$currentOwner]);
            }

            /** @var ShopAttributeMapping $record */
            $record = $existing[$masterKey] ?? new ShopAttributeMapping([
                'master_shop_id' => $masterShop->id,
                'target_shop_id' => $targetShop->id,
                'type' => $type,
                'master_key' => $masterKey,
            ]);

            $masterItem = $masterItems->get($masterKey);
            $targetItem = $targetItems->get($targetKey);

            $record->master_label = $masterItem['label'] ?? null;
            $record->target_key = $targetKey;
            $record->target_label = $targetItem['label'] ?? null;
            $record->meta = [
                'master' => Arr::except($masterItem, ['key']),
                'target' => Arr::except($targetItem, ['key']),
            ];
            $record->save();

            if ($supportsValues) {
                if (array_key_exists('values', $entry)) {
                    $record->values()->delete();

                    $masterValues = collect($masterItem['values'] ?? [])->keyBy('key');
                    $targetValues = collect($targetItem['values'] ?? [])->keyBy('key');
                    $usedTargetValues = [];

                    foreach ($entry['values'] as $valueEntry) {
                        $masterValueKey = (string) ($valueEntry['master_key'] ?? '');
                        if ($masterValueKey === '' || ! $masterValues->has($masterValueKey)) {
                            continue;
                        }

                        $targetValueKey = $valueEntry['target_key'] ?? null;
                        if ($targetValueKey === null || $targetValueKey === '' || ! $targetValues->has($targetValueKey)) {
                            continue;
                        }

                        if (in_array($targetValueKey, $usedTargetValues, true)) {
                            continue;
                        }

                        $masterValue = $masterValues->get($masterValueKey);
                        $targetValue = $targetValues->get($targetValueKey);

                        $record->values()->create([
                            'master_value_key' => $masterValueKey,
                            'master_value_label' => $masterValue['label'] ?? null,
                            'target_value_key' => $targetValueKey,
                            'target_value_label' => $targetValue['label'] ?? null,
                            'meta' => [
                                'master' => Arr::except($masterValue, ['key']),
                                'target' => Arr::except($targetValue, ['key']),
                            ],
                        ]);

                        $usedTargetValues[] = $targetValueKey;
                    }
                }
            } else {
                $record->values()->delete();
            }

            $existing[$masterKey] = $record;
            $targetAssignments[$targetKey] = $masterKey;
            $processedMasters[] = $masterKey;
        }

        foreach ($existing as $masterKey => $record) {
            if (! in_array($masterKey, $processedMasters, true)) {
                $record->delete();
            }
        }

        $result = $this->buildResponse($masterShop, $targetShop, $type);

        return response()->json([
            'message' => 'Mapování bylo uloženo.',
            'data' => $result,
        ]);
    }

    public function suggest(Request $request)
    {
        $data = $request->validate([
            'master_shop_id' => ['required', 'integer', 'exists:shops,id'],
            'target_shop_id' => ['required', 'integer', 'different:master_shop_id', 'exists:shops,id'],
            'type' => ['required', Rule::in(['flags', 'filtering_parameters', 'variants'])],
        ]);

        $masterShop = $this->resolveShop((int) $data['master_shop_id']);
        $targetShop = $this->resolveShop((int) $data['target_shop_id']);
        $type = $data['type'];
        $supportsValues = $this->typeSupportsValues($type);

        $masterItems = $this->loadItems($masterShop, $type);
        $targetItems = $this->annotateTargetItems(
            $masterItems,
            $this->loadItems($targetShop, $type),
            $supportsValues
        );

        try {
            $suggestion = $this->aiService->suggest($masterShop, $targetShop, $type, $masterItems, $targetItems);
        } catch (\RuntimeException $exception) {
            abort(422, $exception->getMessage());
        } catch (Throwable $throwable) {
            report($throwable);
            abort(500, 'AI mapping service is unavailable.');
        }

        return response()->json(['data' => $suggestion]);
    }

    public function sync(Request $request)
    {
        $data = $request->validate([
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
            'types' => ['nullable', 'array'],
            'types.*' => [Rule::in(['flags', 'filtering_parameters', 'variants'])],
        ]);

        $shop = $this->resolveShop((int) $data['shop_id']);
        $types = $data['types'] ?? ['flags', 'filtering_parameters', 'variants'];
        $settings = is_array($shop->settings ?? null) ? $shop->settings : [];
        $cache = Arr::get($settings, 'attribute_cache', []);

        foreach ($types as $type) {
            $supportsValues = $this->typeSupportsValues($type);
            $remoteItems = $this->fetchRemoteItems($shop, $type);
            $existing = $cache[$type] ?? [];
            $cache[$type] = $this->mergeAttributeItems($existing, $remoteItems, $supportsValues);
        }

        Arr::set($settings, 'attribute_cache', $cache);
        $shop->settings = $settings;
        $shop->save();

        return response()->json([
            'message' => 'Atributy byly staženy ze Shoptetu.',
        ]);
    }

    private function buildResponse(Shop $masterShop, Shop $targetShop, string $type): array
    {
        $supportsValues = $this->typeSupportsValues($type);
        $masterItems = $this->loadItems($masterShop, $type);
        $targetItems = $this->annotateTargetItems(
            $masterItems,
            $this->loadItems($targetShop, $type),
            $supportsValues
        );

        $mappings = ShopAttributeMapping::query()
            ->where('master_shop_id', $masterShop->id)
            ->where('target_shop_id', $targetShop->id)
            ->where('type', $type)
            ->with('values')
            ->get()
            ->map(fn (ShopAttributeMapping $mapping) => [
                'master_key' => $mapping->master_key,
                'master_label' => $mapping->master_label,
                'target_key' => $mapping->target_key,
                'target_label' => $mapping->target_label,
                'values' => $mapping->values
                    ->map(fn (ShopAttributeValueMapping $value) => [
                        'master_key' => $value->master_value_key,
                        'master_label' => $value->master_value_label,
                        'target_key' => $value->target_value_key,
                        'target_label' => $value->target_value_label,
                    ])
                    ->values()
                    ->all(),
            ])
            ->values()
            ->all();

        return [
            'master' => $masterItems,
            'target' => $targetItems,
            'mappings' => $mappings,
        ];
    }

    private function loadItems(Shop $shop, string $type): array
    {
        $supportsValues = $this->typeSupportsValues($type);
        $items = $this->fetchRemoteItems($shop, $type);
        $cached = $this->getCachedAttributeItems($shop, $type);

        if ($cached === []) {
            return $items;
        }

        return $this->mergeAttributeItems($items, $cached, $supportsValues);
    }

    private function fetchRemoteItems(Shop $shop, string $type): array
    {
        return match ($type) {
            'flags' => $this->transformFlags($this->client->listFlags($shop)),
            'filtering_parameters' => $this->transformFilteringParameters($this->client->listFilteringParameters($shop)),
            'variants' => $this->transformVariantParameters($this->client->listVariantParameters($shop)),
            default => [],
        };
    }

    private function transformFlags(array $payload): array
    {
        $items = Arr::get($payload, 'data.flags', []);

        $normalized = [];
        foreach ($items as $flag) {
            $code = (string) ($flag['code'] ?? '');
            if ($code === '') {
                continue;
            }

            $normalized[] = [
                'key' => $code,
                'label' => (string) ($flag['title'] ?? $code),
                'code' => $code,
                'color' => $flag['color'] ?? null,
                'system' => (bool) ($flag['system'] ?? false),
                'show_in_detail' => (bool) ($flag['showInDetail'] ?? false),
                'show_in_category' => (bool) ($flag['showInCategory'] ?? false),
                'likely_master_language' => false,
            ];
        }

        usort($normalized, fn ($a, $b) => strcmp($a['label'], $b['label']));

        return $normalized;
    }

    private function transformFilteringParameters(array $payload): array
    {
        $items = Arr::get($payload, 'data.filteringParameters', []);
        $normalized = [];

        foreach ($items as $parameter) {
            $code = (string) ($parameter['code'] ?? $parameter['id'] ?? '');
            if ($code === '') {
                continue;
            }

            $values = [];
            foreach (Arr::get($parameter, 'values', []) as $value) {
                $values[] = [
                    'key' => (string) ($value['valueIndex'] ?? $value['id'] ?? ''),
                    'label' => (string) ($value['name'] ?? $value['valueIndex'] ?? ''),
                    'color' => $value['color'] ?? null,
                    'priority' => $value['priority'] ?? null,
                    'likely_master_language' => false,
                ];
            }

            usort($values, fn ($a, $b) => strcmp($a['label'], $b['label']));

            $normalized[] = [
                'key' => $code,
                'label' => (string) ($parameter['displayName'] ?? $parameter['name'] ?? $code),
                'code' => $parameter['code'] ?? null,
                'id' => $parameter['id'] ?? null,
                'description' => $parameter['description'] ?? null,
                'priority' => $parameter['priority'] ?? null,
                'values' => $values,
                'likely_master_language' => false,
            ];
        }

        usort($normalized, fn ($a, $b) => strcmp($a['label'], $b['label']));

        return $normalized;
    }

    private function transformVariantParameters(array $payload): array
    {
        $items = Arr::get($payload, 'data.parameters', []);
        $normalized = [];

        foreach ($items as $parameter) {
            $index = (string) ($parameter['paramIndex'] ?? $parameter['id'] ?? '');
            if ($index === '') {
                continue;
            }

            $values = [];
            foreach (Arr::get($parameter, 'values', []) as $value) {
                $values[] = [
                    'key' => (string) ($value['rawValue'] ?? $value['id'] ?? ''),
                    'label' => (string) ($value['paramValue'] ?? $value['rawValue'] ?? ''),
                    'color' => $value['color'] ?? null,
                    'priority' => $value['valuePriority'] ?? null,
                    'likely_master_language' => false,
                ];
            }

            usort($values, fn ($a, $b) => strcmp($a['label'], $b['label']));

            $normalized[] = [
                'key' => $index,
                'label' => (string) ($parameter['displayName'] ?? $parameter['paramName'] ?? $index),
                'index' => $parameter['paramIndex'] ?? null,
                'id' => $parameter['id'] ?? null,
                'priority' => $parameter['priority'] ?? null,
                'values' => $values,
                'likely_master_language' => false,
            ];
        }

        usort($normalized, fn ($a, $b) => strcmp($a['label'], $b['label']));

        return $normalized;
    }

    private function annotateTargetItems(array $masterItems, array $targetItems, bool $supportsValues): array
    {
        $masterMap = collect($masterItems)->keyBy('key');

        foreach ($targetItems as &$item) {
            $item['likely_master_language'] = false;

            $key = $item['key'] ?? null;
            $label = $this->normalizeLabel($item['label'] ?? null);
            $masterLabel = $key && $masterMap->has($key)
                ? $this->normalizeLabel($masterMap->get($key)['label'] ?? null)
                : null;

            if ($label !== '' && $masterLabel !== null && $label === $masterLabel) {
                $item['likely_master_language'] = true;
            }

            if ($supportsValues && ! empty($item['values'])) {
                $masterValues = [];
                if ($key && $masterMap->has($key)) {
                    $masterValues = collect($masterMap->get($key)['values'] ?? [])
                        ->mapWithKeys(fn ($value) => [
                            $value['key'] ?? '' => $this->normalizeLabel($value['label'] ?? null),
                        ])
                        ->all();
                }

                foreach ($item['values'] as &$value) {
                    $value['likely_master_language'] = false;
                    $valueKey = $value['key'] ?? null;
                    if ($valueKey && isset($masterValues[$valueKey])) {
                        $valueLabel = $this->normalizeLabel($value['label'] ?? null);
                        if ($valueLabel !== '' && $valueLabel === $masterValues[$valueKey]) {
                            $value['likely_master_language'] = true;
                        }
                    }
                }
                unset($value);
            }
        }
        unset($item);

        return $targetItems;
    }

    private function getCachedAttributeItems(Shop $shop, string $type): array
    {
        $settings = is_array($shop->settings ?? null) ? $shop->settings : [];

        $cached = Arr::get($settings, "attribute_cache.{$type}", []);

        return is_array($cached) ? $cached : [];
    }

    private function mergeAttributeItems(array $base, array $extra, bool $supportsValues): array
    {
        $map = [];

        foreach ($base as $item) {
            $key = (string) ($item['key'] ?? '');
            if ($key === '') {
                continue;
            }

            $map[$key] = $item;
            if ($supportsValues) {
                $map[$key]['values'] = $this->normalizeAttributeValues($item['values'] ?? []);
            }
        }

        foreach ($extra as $item) {
            $key = (string) ($item['key'] ?? '');
            if ($key === '') {
                continue;
            }

            $candidate = $item;
            if ($supportsValues) {
                $candidate['values'] = $this->normalizeAttributeValues($item['values'] ?? []);
            }

            if (isset($map[$key])) {
                $map[$key] = array_merge($map[$key], $candidate);

                if ($supportsValues) {
                    $map[$key]['values'] = $this->mergeAttributeValues(
                        $map[$key]['values'] ?? [],
                        $candidate['values'] ?? []
                    );
                }
            } else {
                $map[$key] = $candidate;
            }
        }

        $items = array_values($map);

        usort($items, fn ($a, $b) => strcmp(
            (string) ($a['label'] ?? $a['key']),
            (string) ($b['label'] ?? $b['key'])
        ));

        return $items;
    }

    private function mergeAttributeValues(array $base, array $extra): array
    {
        $map = [];

        foreach ($base as $value) {
            $key = (string) ($value['key'] ?? '');
            if ($key === '') {
                continue;
            }

            $map[$key] = $value;
        }

        foreach ($extra as $value) {
            $key = (string) ($value['key'] ?? '');
            if ($key === '') {
                continue;
            }

            $map[$key] = array_merge($map[$key] ?? [], $value);
        }

        $items = array_values($map);
        usort($items, fn ($a, $b) => strcmp(
            (string) ($a['label'] ?? $a['key']),
            (string) ($b['label'] ?? $b['key'])
        ));

        return $items;
    }

    private function normalizeAttributeValues(mixed $values): array
    {
        if (! is_array($values)) {
            return [];
        }

        $normalized = [];

        foreach ($values as $value) {
            if (! is_array($value)) {
                continue;
            }

            $key = (string) ($value['key'] ?? '');
            if ($key === '') {
                continue;
            }

            $normalized[] = $value;
        }

        return $normalized;
    }

    private function normalizeLabel(?string $label): string
    {
        $value = trim((string) $label);
        if ($value === '') {
            return '';
        }

        if (function_exists('mb_strtolower')) {
            $value = mb_strtolower($value);
        } else {
            $value = strtolower($value);
        }

        return $value;
    }

    private function typeSupportsValues(string $type): bool
    {
        return in_array($type, ['filtering_parameters', 'variants'], true);
    }

    private function resolveShop(int $shopId): Shop
    {
        /** @var Shop $shop */
        $shop = Shop::query()->findOrFail($shopId);

        return $shop;
    }
}
