<?php

namespace Modules\Pim\Services;

use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Modules\Pim\Models\CategoryMapping;
use Modules\Pim\Models\CategoryNode;
use Modules\Pim\Models\ShopCategoryNode;
use Modules\Shoptet\Models\Shop;

class CategoryMappingService
{
    private array $pathCache = [];

    public function linkShopNodes(Shop $shop, array $shopNodes): void
    {
        if ($shopNodes === []) {
            return;
        }

        $canonicalIndex = $this->buildCanonicalIndex();

        foreach ($shopNodes as $shopNode) {
            $this->linkSingleShopNode($shopNode, $canonicalIndex);
        }
    }

    public function refreshCanonicalMappings(array $canonicalNodes): void
    {
        if ($canonicalNodes === []) {
            return;
        }

        foreach ($canonicalNodes as $canonicalNode) {
            $shopNodes = ShopCategoryNode::query()
                ->where('remote_guid', $canonicalNode->guid)
                ->get();

            foreach ($shopNodes as $shopNode) {
                $this->upsertMapping($canonicalNode, $shopNode, 'confirmed', 1.0, 'auto');
            }
        }
    }

    /**
     * @param array<int, string> $categoryGuids
     * @return array<int, array<string, mixed>>
     */
    public function mapCanonicalCategoriesToShop(array $categoryGuids, Shop $shop): array
    {
        if ($categoryGuids === []) {
            return [];
        }

        $nodes = CategoryNode::query()
            ->whereIn('guid', $categoryGuids)
            ->get();

        if ($nodes->isEmpty()) {
            return [];
        }

        $mappings = CategoryMapping::query()
            ->where('shop_id', $shop->id)
            ->whereIn('category_node_id', $nodes->pluck('id'))
            ->with('shopCategory')
            ->get()
            ->groupBy('category_node_id');

        $indexByGuid = $nodes->keyBy('guid');

        $results = [];

        foreach ($categoryGuids as $guid) {
            /** @var CategoryNode|null $node */
            $node = $indexByGuid->get($guid);
            if (! $node) {
                continue;
            }

            /** @var CategoryMapping|null $mapping */
            $mapping = $this->selectBestMapping($mappings->get($node->id));

            $results[] = [
                'guid' => $node->guid,
                'name' => $node->name,
                'slug' => $node->slug,
                'path' => $this->canonicalPath($node),
                'mapping' => $mapping ? [
                    'id' => $mapping->id,
                    'status' => $mapping->status,
                    'confidence' => $mapping->confidence,
                    'source' => $mapping->source,
                    'shop_category_node_id' => $mapping->shop_category_node_id,
                    'shop_category' => $mapping->shopCategory ? [
                        'id' => $mapping->shopCategory->id,
                        'name' => $mapping->shopCategory->name,
                        'slug' => $mapping->shopCategory->slug,
                        'path' => $mapping->shopCategory->path,
                        'remote_guid' => $mapping->shopCategory->remote_guid,
                    ] : null,
                ] : ($shop->is_master && $node->shop_id === $shop->id ? [
                    'id' => null,
                    'status' => 'canonical',
                    'confidence' => 1.0,
                    'source' => 'master',
                    'shop_category_node_id' => null,
                    'shop_category' => [
                        'id' => null,
                        'name' => $node->name,
                        'slug' => $node->slug,
                        'path' => $this->canonicalPath($node),
                        'remote_guid' => $node->guid,
                    ],
                ] : null),
            ];
        }

        return $results;
    }

    private function linkSingleShopNode(ShopCategoryNode $shopNode, array $canonicalIndex): void
    {
        $guid = $shopNode->remote_guid;
        if ($guid) {
            $canonical = $canonicalIndex['guid'][$guid] ?? null;
            if ($canonical) {
                $this->upsertMapping($canonical, $shopNode, 'confirmed', 1.0, 'auto');
                return;
            }
        }

        $slug = $shopNode->slug ? Str::lower($shopNode->slug) : null;
        if ($slug) {
            $candidates = $canonicalIndex['slug'][$slug] ?? [];
            $resolved = $this->resolveCandidate($candidates, $shopNode);
            if ($resolved) {
                $this->upsertMapping($resolved, $shopNode, 'suggested', 0.70, 'auto');
                return;
            }
        }

        $path = $shopNode->path ? Str::lower($shopNode->path) : null;
        if ($path) {
            $candidates = $canonicalIndex['path'][$path] ?? [];
            $resolved = $this->resolveCandidate($candidates, $shopNode);
            if ($resolved) {
                $this->upsertMapping($resolved, $shopNode, 'suggested', 0.60, 'auto');
                return;
            }
        }

        $name = Str::lower(trim((string) $shopNode->name));
        if ($name !== '') {
            $candidates = $canonicalIndex['name'][$name] ?? [];
            $resolved = $this->resolveCandidate($candidates, $shopNode);
            if ($resolved) {
                $this->upsertMapping($resolved, $shopNode, 'suggested', 0.40, 'auto');
            }
        }
    }

    private function resolveCandidate(array $candidates, ShopCategoryNode $shopNode): ?CategoryNode
    {
        if ($candidates === []) {
            return null;
        }

        if (count($candidates) === 1) {
            return $candidates[0];
        }

        $parentGuid = $shopNode->parent_guid;
        if ($parentGuid) {
            $filtered = array_values(array_filter($candidates, function (CategoryNode $candidate) use ($parentGuid) {
                return ($candidate->parent_guid ?? null) === $parentGuid;
            }));

            if (count($filtered) === 1) {
                return $filtered[0];
            }

            $candidates = $filtered !== [] ? $filtered : $candidates;
        }

        return count($candidates) === 1 ? $candidates[0] : null;
    }

    private function upsertMapping(CategoryNode $canonical, ShopCategoryNode $shopNode, string $status, float $confidence, string $source): void
    {
        $mapping = CategoryMapping::query()->firstOrNew([
            'category_node_id' => $canonical->id,
            'shop_id' => $shopNode->shop_id,
        ]);

        if ($mapping->exists && $mapping->source === 'manual' && $status !== 'confirmed') {
            return;
        }

        if ($mapping->exists && $mapping->status === 'confirmed' && $status !== 'confirmed') {
            return;
        }

        $mapping->shop_category_node_id = $shopNode->id;

        if ($status === 'confirmed') {
            $mapping->status = 'confirmed';
            $mapping->confidence = 1.0;
        } else {
            $mapping->status = $mapping->status === 'confirmed' ? $mapping->status : $status;
            if ($mapping->status !== 'confirmed') {
                $mapping->confidence = round($confidence, 2);
            }
        }

        if ($mapping->source !== 'manual') {
            $mapping->source = $source;
        }

        $mapping->save();
    }

    public function canonicalPath(CategoryNode $node): ?string
    {
        if (isset($this->pathCache[$node->id])) {
            return $this->pathCache[$node->id];
        }

        $names = [];
        $current = $node;
        $visited = [];

        while ($current) {
            $names[] = trim((string) $current->name);
            $parentId = $current->parent_id;

            if (! $parentId || isset($visited[$parentId])) {
                break;
            }

            $visited[$parentId] = true;
            $current = CategoryNode::query()
                ->select(['id', 'name', 'parent_id'])
                ->find($parentId);
        }

        $names = array_reverse(array_filter($names));

        return $this->pathCache[$node->id] = $names === [] ? null : implode(' > ', $names);
    }

    private function buildCanonicalIndex(): array
    {
        $nodes = CategoryNode::query()
            ->select(['id', 'guid', 'parent_id', 'parent_guid', 'name', 'slug'])
            ->get();

        $byId = $nodes->keyBy('id');

        $guidIndex = [];
        $slugIndex = [];
        $nameIndex = [];
        $pathIndex = [];

        foreach ($nodes as $node) {
            if ($node->guid) {
                $guidIndex[$node->guid] = $node;
            }

            if ($node->slug) {
                $slugIndex[Str::lower($node->slug)][] = $node;
            }

            $normalizedName = Str::lower(trim((string) $node->name));
            if ($normalizedName !== '') {
                $nameIndex[$normalizedName][] = $node;
            }

            $path = $this->buildCanonicalPath($node, $byId);
            if ($path) {
                $pathIndex[Str::lower($path)][] = $node;
            }
            $this->pathCache[$node->id] = $path;
        }

        return [
            'guid' => $guidIndex,
            'slug' => $slugIndex,
            'name' => $nameIndex,
            'path' => $pathIndex,
        ];
    }

    private function statusPriority(string $status): int
    {
        return match ($status) {
            'confirmed' => 0,
            'canonical' => 0,
            'suggested' => 1,
            'pending' => 2,
            'rejected' => 3,
            default => 4,
        };
    }

    private function selectBestMapping(?Collection $mappings): ?CategoryMapping
    {
        if (! $mappings || $mappings->isEmpty()) {
            return null;
        }

        return $mappings
            ->sort(function (CategoryMapping $a, CategoryMapping $b) {
                $statusDiff = $this->statusPriority($a->status) <=> $this->statusPriority($b->status);
                if ($statusDiff !== 0) {
                    return $statusDiff;
                }

                $confidenceA = $a->confidence ?? 0;
                $confidenceB = $b->confidence ?? 0;

                if ($confidenceA === $confidenceB) {
                    return strcmp($a->id, $b->id);
                }

                return $confidenceB <=> $confidenceA;
            })
            ->first();
    }

    private function buildCanonicalPath(CategoryNode $node, Collection $nodesById): ?string
    {
        $names = [];
        $current = $node;
        $visited = [];

        while ($current) {
            $names[] = trim((string) $current->name);
            $parentId = $current->parent_id;

            if (! $parentId || isset($visited[$parentId])) {
                break;
            }

            $visited[$parentId] = true;
            $current = $nodesById->get($parentId);
        }

        $names = array_reverse(array_filter($names));

        return $names === [] ? null : implode(' > ', $names);
    }
}
