<?php

namespace Modules\Pim\Services;

use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Modules\Pim\Models\CategoryMapping;
use Modules\Pim\Models\CategoryNode;
use Modules\Pim\Models\ShopCategoryNode;
use Modules\Shoptet\Models\Shop;

class CategoryTreeService
{
    public function __construct(private readonly CategoryMappingService $mappingService)
    {
    }

    public function buildTrees(?int $targetShopId = null, ?int $masterShopId = null): array
    {
        $masterShop = $this->resolveMasterShop($masterShopId);
        $targetShop = $this->resolveTargetShop($targetShopId);

        $canonicalNodes = CategoryNode::query()
            ->where('shop_id', $masterShop->id)
            ->orderBy('parent_id')
            ->orderBy('position')
            ->orderBy('name')
            ->get();

        $groupedCanonical = $canonicalNodes->groupBy('parent_id');

        $mappings = $targetShop
            ? CategoryMapping::query()
                ->where('shop_id', $targetShop->id)
                ->with('shopCategory')
                ->get()
                ->keyBy('category_node_id')
            : collect();

        $shopCategories = $targetShop
            ? ShopCategoryNode::query()
                ->where('shop_id', $targetShop->id)
                ->orderBy('parent_id')
                ->orderBy('position')
                ->orderBy('name')
                ->get()
            : collect();

        $groupedShop = $shopCategories->groupBy('parent_id');

        $canonicalTree = $this->buildCanonicalTree(
            parentId: null,
            grouped: $groupedCanonical,
            path: [],
            mappings: $mappings,
            targetShop: $targetShop
        );

        $shopTree = $this->buildShopTree(
            parentId: null,
            grouped: $groupedShop,
            path: []
        );

        $mappingStats = $this->summarizeMappings($mappings);

        $shopSyncedAt = null;
        if ($targetShop) {
            $syncedAt = ShopCategoryNode::query()
                ->where('shop_id', $targetShop->id)
                ->max('updated_at');

            if ($syncedAt instanceof CarbonInterface) {
                $shopSyncedAt = $syncedAt->toIso8601String();
            } elseif ($syncedAt) {
                $shopSyncedAt = Carbon::parse($syncedAt)->toIso8601String();
            }
        }

        return [
            'master_shop' => [
                'id' => $masterShop->id,
                'name' => $masterShop->name,
            ],
            'target_shop' => $targetShop ? [
                'id' => $targetShop->id,
                'name' => $targetShop->name,
            ] : null,
            'canonical' => $canonicalTree,
            'shop' => $shopTree,
            'summary' => [
                'canonical_count' => $canonicalNodes->count(),
                'shop_count' => $shopCategories->count(),
                'mappings' => $mappingStats,
            ],
            'shop_synced_at' => $shopSyncedAt,
        ];
    }

    private function resolveMasterShop(?int $masterShopId): Shop
    {
        if ($masterShopId) {
            /** @var Shop|null $shop */
            $shop = Shop::query()->where('is_master', true)->find($masterShopId);
            if (! $shop) {
                abort(404, 'Master shop not found.');
            }

            return $shop;
        }

        /** @var Shop|null $shop */
        $shop = Shop::query()->where('is_master', true)->orderBy('id')->first();

        if (! $shop) {
            abort(404, 'No master shop configured.');
        }

        return $shop;
    }

    private function resolveTargetShop(?int $targetShopId): ?Shop
    {
        if (! $targetShopId) {
            return null;
        }

        /** @var Shop|null $shop */
        $shop = Shop::query()->find($targetShopId);

        if (! $shop) {
            abort(404, 'Target shop not found.');
        }

        return $shop;
    }

    private function buildCanonicalTree(
        ?string $parentId,
        Collection $grouped,
        array $path,
        Collection $mappings,
        ?Shop $targetShop
    ): array {
        /** @var Collection<int, CategoryNode> $children */
        $children = $grouped->get($parentId, collect());

        return $children
            ->map(function (CategoryNode $node) use ($grouped, $path, $mappings, $targetShop) {
                $currentPath = array_merge($path, [$node->name]);

                /** @var CategoryMapping|null $mapping */
                $mapping = $mappings->get($node->id);
                $shopCategory = $mapping?->shopCategory;

                return [
                    'id' => $node->id,
                    'guid' => $node->guid,
                    'name' => $node->name,
                    'slug' => $node->slug,
                    'path' => $this->toPath($currentPath),
                    'mapping' => $mapping ? [
                        'id' => $mapping->id,
                        'status' => $mapping->status,
                        'confidence' => $mapping->confidence,
                        'source' => $mapping->source,
                        'shop_category_node_id' => $mapping->shop_category_node_id,
                        'shop_category' => $shopCategory ? [
                            'id' => $shopCategory->id,
                            'name' => $shopCategory->name,
                            'slug' => $shopCategory->slug,
                            'path' => $shopCategory->path,
                            'remote_guid' => $shopCategory->remote_guid,
                        ] : null,
                    ] : ($targetShop && $targetShop->id === $node->shop_id ? [
                        'id' => null,
                        'status' => 'canonical',
                        'confidence' => 1.0,
                        'source' => 'master',
                        'shop_category_node_id' => null,
                        'shop_category' => [
                            'id' => null,
                            'name' => $node->name,
                            'slug' => $node->slug,
                            'path' => $this->toPath($currentPath),
                            'remote_guid' => $node->guid,
                        ],
                    ] : null),
                    'children' => $this->buildCanonicalTree(
                        parentId: $node->id,
                        grouped: $grouped,
                        path: $currentPath,
                        mappings: $mappings,
                        targetShop: $targetShop
                    ),
                ];
            })
            ->all();
    }

    private function buildShopTree(
        ?string $parentId,
        Collection $grouped,
        array $path
    ): array {
        /** @var Collection<int, ShopCategoryNode> $children */
        $children = $grouped->get($parentId, collect());

        return $children
            ->map(function (ShopCategoryNode $node) use ($grouped, $path) {
                $currentPath = array_merge($path, [$node->name]);

                return [
                    'id' => $node->id,
                    'remote_guid' => $node->remote_guid,
                    'name' => $node->name,
                    'slug' => $node->slug,
                    'path' => $this->toPath($currentPath),
                    'visible' => $node->visible,
                    'customer_visibility' => $node->customer_visibility,
                    'product_ordering' => $node->product_ordering,
                    'url' => $node->url,
                    'index_name' => $node->index_name,
                    'image' => $node->image,
                    'menu_title' => $node->menu_title,
                    'title' => $node->title,
                    'meta_description' => $node->meta_description,
                    'description' => $node->description,
                    'second_description' => $node->second_description,
                    'similar_category_guid' => $node->similar_category_guid,
                    'related_category_guid' => $node->related_category_guid,
                    'data' => $node->data,
                    'children' => $this->buildShopTree(
                        parentId: $node->id,
                        grouped: $grouped,
                        path: $currentPath
                    ),
                ];
            })
            ->all();
    }

    private function toPath(array $segments): ?string
    {
        $segments = array_filter(array_map('trim', $segments));

        return $segments === [] ? null : implode(' > ', $segments);
    }

    private function summarizeMappings(Collection $mappings): array
    {
        if ($mappings->isEmpty()) {
            return [
                'total' => 0,
                'confirmed' => 0,
                'suggested' => 0,
                'rejected' => 0,
            ];
        }

        return [
            'total' => $mappings->count(),
            'confirmed' => $mappings->where('status', 'confirmed')->count(),
            'suggested' => $mappings->where('status', 'suggested')->count(),
            'rejected' => $mappings->where('status', 'rejected')->count(),
        ];
    }
}
