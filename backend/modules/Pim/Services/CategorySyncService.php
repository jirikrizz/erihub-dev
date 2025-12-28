<?php

namespace Modules\Pim\Services;

use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Modules\Pim\Models\CategoryLocalization;
use Modules\Pim\Models\CategoryNode;
use Modules\Pim\Models\ShopCategoryNode;
use Modules\Shoptet\Models\Shop;

class CategorySyncService
{
    public function __construct(private readonly CategoryMappingService $mappingService)
    {
    }

    public function syncFromPayload(array $payload, Shop $shop): CategorySyncResult
    {
        $categories = $this->collectCategories($payload);

        if ($categories->isEmpty()) {
            return new CategorySyncResult($categories, [], []);
        }

        $shopNodes = $this->syncShopCategoryNodes($categories, $shop);

        $canonicalNodes = [];

        if ($shop->is_master) {
            $canonicalNodes = $this->syncCanonicalNodes($categories, $shop);
            $this->syncCanonicalLocalizations($canonicalNodes, $shop);
            $this->mappingService->refreshCanonicalMappings(array_values($canonicalNodes));
        }

        $this->mappingService->linkShopNodes($shop, array_values($shopNodes));

        return new CategorySyncResult($categories, array_values($canonicalNodes), array_values($shopNodes));
    }

    public function extractCategoryGuids(array $payload): array
    {
        return $this->collectCategories($payload)
            ->pluck('guid')
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    private function syncShopCategoryNodes(Collection $categories, Shop $shop): array
    {
        $guids = $categories->pluck('guid')->values()->all();
        $existingNodes = ShopCategoryNode::query()
            ->where('shop_id', $shop->id)
            ->whereIn('remote_guid', $guids)
            ->get()
            ->keyBy('remote_guid');

        $now = now();
        $records = [];

        foreach ($categories as $category) {
            $guid = $category['guid'];
            /** @var ShopCategoryNode|null $existing */
            $existing = $existingNodes->get($guid);

            $incomingData = $category['data'] ?? [];
            $existingData = is_array($existing?->data) ? $existing->data : [];
            if (! isset($incomingData['widgets']) && isset($existingData['widgets'])) {
                $incomingData['widgets'] = $existingData['widgets'];
            }
            if (! isset($incomingData['_hub']) && isset($existingData['_hub'])) {
                $incomingData['_hub'] = $existingData['_hub'];
            }

            $position = $category['position'];
            if ($position === null && $existing) {
                $position = $existing->position;
            }
            if ($position === null) {
                $position = 0;
            }

            $visible = array_key_exists('visible', $category)
                ? $category['visible']
                : ($existing?->visible ?? null);
            if ($visible === null) {
                $visible = $existing?->visible ?? true;
            } else {
                $visible = (bool) $visible;
            }

            $customerVisibility = array_key_exists('customer_visibility', $category)
                ? $category['customer_visibility']
                : ($existing?->customer_visibility ?? null);

            $productOrdering = array_key_exists('product_ordering', $category)
                ? $category['product_ordering']
                : ($existing?->product_ordering ?? null);

            $url = array_key_exists('url', $category) ? $category['url'] : ($existing?->url ?? null);
            $indexName = array_key_exists('index_name', $category) ? $category['index_name'] : ($existing?->index_name ?? null);
            $image = array_key_exists('image', $category) ? $category['image'] : ($existing?->image ?? null);
            $menuTitle = array_key_exists('menu_title', $category) ? $category['menu_title'] : ($existing?->menu_title ?? null);
            $title = array_key_exists('title', $category) ? $category['title'] : ($existing?->title ?? null);
            $metaDescription = array_key_exists('meta_description', $category) ? $category['meta_description'] : ($existing?->meta_description ?? null);
            $description = array_key_exists('description', $category) ? $category['description'] : ($existing?->description ?? null);
            $secondDescription = array_key_exists('second_description', $category) ? $category['second_description'] : ($existing?->second_description ?? null);
            $similarGuid = array_key_exists('similar_category_guid', $category) ? $category['similar_category_guid'] : ($existing?->similar_category_guid ?? null);
            $relatedGuid = array_key_exists('related_category_guid', $category) ? $category['related_category_guid'] : ($existing?->related_category_guid ?? null);

            $slug = $category['slug'] ?? ($existing?->slug ?? null);

            $records[] = [
                'id' => $existing?->id ?? (string) Str::uuid(),
                'shop_id' => $shop->id,
                'remote_guid' => $guid,
                'remote_id' => $category['remote_id'],
                'parent_guid' => $category['parent_guid'],
                'name' => $category['name'],
                'slug' => $slug,
                'position' => $position,
                'data' => $this->encodeJson($incomingData),
                'visible' => $visible,
                'customer_visibility' => $customerVisibility,
                'product_ordering' => $productOrdering,
                'url' => $url,
                'index_name' => $indexName,
                'image' => $image,
                'menu_title' => $menuTitle,
                'title' => $title,
                'meta_description' => $metaDescription,
                'description' => $description,
                'second_description' => $secondDescription,
                'similar_category_guid' => $similarGuid,
                'related_category_guid' => $relatedGuid,
                'created_at' => $existing?->created_at ?? $now,
                'updated_at' => $now,
            ];
        }

        if ($records !== []) {
            ShopCategoryNode::upsert(
                $records,
                ['id'],
                [
                    'remote_id',
                    'parent_guid',
                    'name',
                    'slug',
                    'position',
                    'data',
                    'visible',
                    'customer_visibility',
                    'product_ordering',
                    'url',
                    'index_name',
                    'image',
                    'menu_title',
                    'title',
                    'meta_description',
                    'description',
                    'second_description',
                    'similar_category_guid',
                    'related_category_guid',
                    'updated_at',
                ]
            );
        }

        $nodes = ShopCategoryNode::query()
            ->where('shop_id', $shop->id)
            ->whereIn('remote_guid', $guids)
            ->get()
            ->keyBy('remote_guid');

        $nodesByGuid = $nodes->all();
        $parentCache = [];

        foreach ($categories as $category) {
            $guid = $category['guid'];
            /** @var ShopCategoryNode $shopNode */
            $shopNode = $nodes->get($guid);
            $parentGuid = $category['parent_guid'];

            $parentNode = null;
            if ($parentGuid) {
                $parentNode = $nodes->get($parentGuid) ?? $parentCache[$parentGuid] ??= ShopCategoryNode::query()
                    ->where('shop_id', $shop->id)
                    ->where('remote_guid', $parentGuid)
                    ->first();
            }

            $needsSave = false;
            $resolvedParentId = $parentNode?->id;

            if ($shopNode->parent_id !== $resolvedParentId) {
                $shopNode->parent_id = $resolvedParentId;
                $needsSave = true;
            }

            $path = $this->buildShopCategoryPath($shopNode, $shop, $nodesByGuid, $parentCache);
            if ($shopNode->path !== $path) {
                $shopNode->path = $path;
                $needsSave = true;
            }

            if ($needsSave) {
                $shopNode->save();
            }
        }

        return $nodesByGuid;
    }

    private function syncCanonicalNodes(Collection $categories, Shop $shop): array
    {
        $nodes = [];
        foreach ($categories as $category) {
            $guid = $category['guid'];

            /** @var CategoryNode $node */
            $node = CategoryNode::query()->firstOrNew([
                'guid' => $guid,
            ]);

            $node->shop_id = $shop->id;
            $node->parent_guid = $category['parent_guid'];
            $node->name = $category['name'];
            $node->slug = $category['slug'];
            $position = $category['position'];
            if ($position === null) {
                $position = $node->position !== null ? (int) $node->position : 0;
            }
            $node->position = (int) $position;
            $node->data = $category['data'];
            $node->save();

            $nodes[$guid] = $node;
        }

        foreach ($nodes as $guid => $node) {
            $parentGuid = $node->parent_guid;
            if (! $parentGuid) {
                if ($node->parent_id !== null) {
                    $node->parent_id = null;
                    $node->save();
                }

                continue;
            }

            $parentNode = $nodes[$parentGuid] ?? CategoryNode::query()->where('guid', $parentGuid)->first();

            if ($parentNode && $node->parent_id !== $parentNode->id) {
                $node->parent_id = $parentNode->id;
                $node->save();
            }
        }

        return $nodes;
    }

    private function syncCanonicalLocalizations(array $nodes, Shop $shop): void
    {
        foreach ($nodes as $node) {
            CategoryLocalization::updateOrCreate(
                [
                    'category_node_id' => $node->id,
                    'shop_id' => $shop->id,
                ],
                [
                    'name' => $node->name,
                    'slug' => $node->slug,
                    'remote_guid' => $node->guid,
                    'data' => $node->data,
                ]
            );
        }
    }

    private function buildShopCategoryPath(
        ShopCategoryNode $node,
        Shop $shop,
        array $localNodes,
        array &$cachedNodes = []
    ): ?string
    {
        $names = [];
        $current = $node;
        $visited = [];

        while ($current) {
            $names[] = trim((string) $current->name);
            $parentGuid = $current->parent_guid;

            if (! $parentGuid || isset($visited[$parentGuid])) {
                break;
            }

            $visited[$parentGuid] = true;

            if (isset($localNodes[$parentGuid])) {
                $current = $localNodes[$parentGuid];
                continue;
            }

            if (isset($cachedNodes[$parentGuid])) {
                $current = $cachedNodes[$parentGuid];
                continue;
            }

            $fetched = ShopCategoryNode::query()
                ->select(['id', 'name', 'parent_guid', 'remote_guid'])
                ->where('shop_id', $shop->id)
                ->where('remote_guid', $parentGuid)
                ->first();

            if (! $fetched) {
                break;
            }

            $cachedNodes[$parentGuid] = $fetched;
            $current = $fetched;
        }

        $names = array_reverse(array_filter($names));

        return $names === [] ? null : implode(' > ', $names);
    }

    private function encodeJson(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        if (is_string($value)) {
            return $value;
        }

        $encoded = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        return $encoded === false ? null : $encoded;
    }

    private function collectCategories(array $payload): Collection
    {
        $collection = collect();

        $append = function (?array $items) use (&$collection): void {
            if (! $items) {
                return;
            }

            foreach ($items as $item) {
                if (! is_array($item)) {
                    continue;
                }

                $collection->push($item);
            }
        };

        $append(Arr::get($payload, 'categories'));

        $allCategories = Arr::get($payload, 'allCategories');
        if (is_array($allCategories)) {
            foreach ($allCategories as $entry) {
                if (is_array($entry)) {
                    $append($entry);
                }
            }
        }

        $defaultCategory = Arr::get($payload, 'defaultCategory');
        if (is_array($defaultCategory)) {
            $collection->push($defaultCategory);
        }

        return $collection
            ->filter(fn ($item) => is_array($item) && ! empty($item['guid'] ?? null))
            ->map(function (array $item) {
                return [
                    'guid' => (string) $item['guid'],
                    'parent_guid' => $item['parentGuid'] ?? null,
                    'remote_id' => $item['id'] ?? null,
                    'name' => (string) ($item['name'] ?? 'Unknown'),
                    'slug' => $item['friendlyUrl'] ?? $item['url'] ?? null,
                    'position' => array_key_exists('position', $item) ? (int) $item['position'] : null,
                    'data' => $item,
                    'url' => $item['url'] ?? null,
                    'index_name' => $item['indexName'] ?? null,
                    'image' => $item['image'] ?? null,
                    'description' => $item['description'] ?? null,
                    'second_description' => $item['secondDescription'] ?? null,
                    'menu_title' => $item['menuTitle'] ?? null,
                    'title' => $item['title'] ?? null,
                    'meta_description' => $item['metaTagDescription'] ?? null,
                    'visible' => array_key_exists('visible', $item) ? (bool) $item['visible'] : null,
                    'customer_visibility' => array_key_exists('customerVisibility', $item) ? $item['customerVisibility'] : null,
                    'product_ordering' => array_key_exists('productOrdering', $item) ? $item['productOrdering'] : null,
                    'similar_category_guid' => $item['similarProductsCategory'] ?? null,
                    'related_category_guid' => $item['relatedProductsCategory'] ?? null,
                ];
            })
            ->unique('guid');
    }
}
