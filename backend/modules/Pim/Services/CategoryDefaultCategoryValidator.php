<?php

namespace Modules\Pim\Services;

use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Modules\Pim\Models\CategoryMapping;
use Modules\Pim\Models\CategoryNode;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ShopCategoryNode;
use Modules\Shoptet\Models\Shop;

class CategoryDefaultCategoryValidator
{
    private const MAX_PER_PAGE = 200;

    public function validate(
        Shop $masterShop,
        Shop $targetShop,
        int $page = 1,
        int $perPage = 50,
        ?string $search = null,
        bool $all = false
    ): array {
        $page = max(1, $page);
        $perPage = max(1, min($perPage, self::MAX_PER_PAGE));

        $canonicalNodes = CategoryNode::query()
            ->where('shop_id', $masterShop->id)
            ->get(['id', 'guid', 'name', 'parent_id']);

        $canonicalById = $canonicalNodes->keyBy('id');
        $canonicalByGuid = $canonicalNodes->keyBy('guid');
        $canonicalPathCache = [];

        $canonicalPath = function (?string $nodeId) use (&$canonicalById, &$canonicalPathCache, &$canonicalPath): ?string {
            if (! $nodeId) {
                return null;
            }

            if (isset($canonicalPathCache[$nodeId])) {
                return $canonicalPathCache[$nodeId];
            }

            $node = $canonicalById->get($nodeId);
            if (! $node) {
                return null;
            }

            $parentPath = $canonicalPath($node->parent_id);

            return $canonicalPathCache[$nodeId] = $parentPath
                ? $parentPath.' > '.$node->name
                : $node->name;
        };

        $shopCategories = ShopCategoryNode::query()
            ->where('shop_id', $targetShop->id)
            ->get(['id', 'remote_guid', 'name', 'path', 'parent_id']);

        $shopCategoriesByGuid = $shopCategories->mapWithKeys(fn ($node) => [$node->remote_guid => $node]);

        $categoryMappings = CategoryMapping::query()
            ->where('shop_id', $targetShop->id)
            ->whereNotNull('shop_category_node_id')
            ->with('shopCategory')
            ->get();

        $expectedByCanonicalGuid = [];

        foreach ($categoryMappings as $mapping) {
            $canonicalNode = $canonicalById->get($mapping->category_node_id);
            $shopCategory = $mapping->shopCategory;

            if (! $canonicalNode || ! $shopCategory) {
                continue;
            }

            $expectedByCanonicalGuid[$canonicalNode->guid] = $shopCategory;
        }

        $query = Product::query()
            ->where('shop_id', $masterShop->id)
            ->select(['id', 'shop_id', 'sku', 'base_payload', 'external_guid'])
            ->with([
                'variants' => fn ($q) => $q->select('id', 'product_id', 'code'),
                'overlays' => fn ($q) => $q->where('shop_id', $targetShop->id)->select('id', 'product_id', 'shop_id', 'data'),
            ])
            ->orderBy('sku');

        if ($search) {
            $query->where(function ($inner) use ($search) {
                $inner->where('sku', 'like', '%'.trim($search).'%')
                    ->orWhereHas('variants', fn ($variant) => $variant->where('code', 'like', '%'.trim($search).'%'));
            });
        }

        $results = [];
        $stats = [];
        $totalMismatches = 0;

        $query->lazy(100)->each(function (Product $product) use (
            &$results,
            &$stats,
            &$totalMismatches,
            $page,
            $perPage,
            $canonicalByGuid,
            $canonicalPath,
            $expectedByCanonicalGuid,
            $shopCategoriesByGuid,
            $targetShop,
            $all
        ) {
            $issue = $this->evaluateProduct(
                $product,
                $canonicalByGuid,
                $canonicalPath,
                $expectedByCanonicalGuid,
                $shopCategoriesByGuid,
                $targetShop
            );

            if (! $issue) {
                return;
            }

            $totalMismatches++;
            $stats[$issue['reason']] = ($stats[$issue['reason']] ?? 0) + 1;

            if (! $all) {
                $offsetLocal = ($page - 1) * $perPage;
                if ($totalMismatches <= $offsetLocal) {
                    return;
                }

                if (count($results) >= $perPage) {
                    return;
                }
            }

            $results[] = $issue;
        });

        $lastPage = $totalMismatches === 0
            ? 1
            : (int) ceil($totalMismatches / $perPage);

        return [
            'data' => $results,
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $totalMismatches,
                'last_page' => max(1, $lastPage),
            ],
            'stats' => $stats,
        ];
    }

    private function evaluateProduct(
        Product $product,
        Collection $canonicalByGuid,
        callable $canonicalPath,
        array $expectedByCanonicalGuid,
        Collection $shopCategoriesByGuid,
        Shop $targetShop
    ): ?array {
        $basePayload = $product->base_payload ?? [];
        $masterDefaultGuid = Arr::get($basePayload, 'defaultCategory.guid')
            ?? Arr::get($basePayload, 'defaultCategory.remoteGuid');
        $masterDefaultName = Arr::get($basePayload, 'defaultCategory.name');

        $masterCategory = null;
        $expected = null;
        $actual = null;
        $recommendedCategory = null;
        $reason = null;

        if (! $masterDefaultGuid) {
            $reason = 'missing_master_default';
        }

        $canonicalNode = $masterDefaultGuid ? $canonicalByGuid->get($masterDefaultGuid) : null;
        $canonicalPathValue = $canonicalNode ? $canonicalPath($canonicalNode->id) : null;

        if (! $reason && ! $canonicalNode) {
            $reason = 'canonical_not_found';
        }

        $expectedCategoryNode = $canonicalNode ? ($expectedByCanonicalGuid[$canonicalNode->guid] ?? null) : null;
        if ($expectedCategoryNode) {
            $expected = [
                'id' => $expectedCategoryNode->id,
                'remote_guid' => $expectedCategoryNode->remote_guid,
                'name' => $expectedCategoryNode->name,
                'path' => $expectedCategoryNode->path,
            ];
        }

        /** @var \Modules\Pim\Models\ProductShopOverlay|null $overlay */
        $overlay = $product->overlays->first();

        if (! $reason && ! $overlay) {
            $reason = 'missing_target_snapshot';
        }

        $overlayData = is_array($overlay?->data) ? $overlay->data : [];
        $actualGuid = Arr::get($overlayData, 'defaultCategory.guid')
            ?? Arr::get($overlayData, 'defaultCategory.remoteGuid');
        $actualName = Arr::get($overlayData, 'defaultCategory.name');
        $actualPathValue = Arr::get($overlayData, 'defaultCategory.path');

        if ($actualGuid && $shopCategoriesByGuid->has($actualGuid)) {
            $targetCategoryNode = $shopCategoriesByGuid->get($actualGuid);
            $actualName = $targetCategoryNode->name;
            $actualPathValue = $targetCategoryNode->path;
        }

        if (! $reason) {
            if (! $expectedCategoryNode) {
                $reason = 'missing_mapping';
            } elseif (! $actualGuid) {
                $reason = 'missing_actual_default';
            } elseif ($expectedCategoryNode->remote_guid !== $actualGuid) {
                $reason = 'mismatch';
            } else {
                $comparisonPath = $actualPathValue ?? ($expectedCategoryNode->path ?? null);
                $deeperCategory = $this->findDeeperCategory(
                    $actualGuid,
                    $comparisonPath,
                    [$overlayData],
                    $shopCategoriesByGuid
                );

                if ($deeperCategory) {
                    $reason = 'default_not_deepest';
                    $recommendedCategory = [
                        'id' => $deeperCategory['id'] ?? null,
                        'guid' => $deeperCategory['guid'] ?? null,
                        'remote_guid' => $deeperCategory['guid'] ?? null,
                        'name' => $deeperCategory['name'] ?? null,
                        'path' => $deeperCategory['path'] ?? null,
                    ];
                } else {
                    return null;
                }
            }
        }

        $masterCategory = [
            'id' => $canonicalNode?->id,
            'guid' => $canonicalNode->guid ?? $masterDefaultGuid,
            'name' => $canonicalNode->name ?? $masterDefaultName,
            'path' => $canonicalPathValue,
        ];

        $actualId = null;

        if ($actualGuid && $shopCategoriesByGuid->has($actualGuid)) {
            $targetCategoryNode = $shopCategoriesByGuid->get($actualGuid);
            $actualName = $targetCategoryNode->name;
            $actualPathValue = $targetCategoryNode->path ?? $targetCategoryNode->name;
            $actualId = $targetCategoryNode->id;
        }

        if ($actualGuid || $actualName || $actualPathValue) {
            $actual = [
                'id' => $actualId,
                'guid' => $actualGuid,
                'name' => $actualName,
                'path' => $actualPathValue,
            ];
        }

        $variantCodes = $product->variants
            ->pluck('code')
            ->filter()
            ->unique()
            ->values()
            ->all();

        return [
            'product_id' => $product->id,
            'sku' => $product->sku,
            'name' => Arr::get($basePayload, 'name'),
            'codes' => $variantCodes,
            'reason' => $reason,
            'master_category' => $masterCategory,
            'expected_category' => $expected,
            'actual_category' => $actual,
            'recommended_category' => $recommendedCategory,
        ];
    }

    private function findDeeperCategory(
        ?string $defaultGuid,
        ?string $defaultPath,
        array $payloads,
        Collection $shopCategoriesByGuid
    ): ?array {
        $defaultSegments = $this->splitPathSegments($defaultPath);
        if ($defaultSegments === []) {
            return null;
        }

        $candidates = [];

        foreach ($payloads as $payload) {
            if (! is_array($payload)) {
                continue;
            }

            foreach ($this->collectCategoryCandidates($payload, $shopCategoriesByGuid) as $candidate) {
                $candidateGuid = $candidate['guid'] ?? null;
                $candidatePath = $candidate['path'] ?? null;

                if ($candidateGuid && $defaultGuid && strcasecmp($candidateGuid, $defaultGuid) === 0) {
                    continue;
                }

                if (! is_string($candidatePath) || trim($candidatePath) === '') {
                    continue;
                }

                $candidateSegments = $this->splitPathSegments($candidatePath);

                if ($candidateSegments === []) {
                    continue;
                }

                if ($this->pathsEqual($defaultSegments, $candidateSegments)) {
                    continue;
                }

                if (count($candidateSegments) <= count($defaultSegments)) {
                    continue;
                }

                if (! $this->pathPrefixMatches($defaultSegments, $candidateSegments)) {
                    continue;
                }

                $candidates[] = [
                    'guid' => $candidateGuid,
                    'name' => $candidate['name'] ?? null,
                    'path' => $candidatePath,
                    'id' => $candidate['id'] ?? null,
                ];
            }
        }

        if ($candidates === []) {
            return null;
        }

        usort($candidates, function (array $a, array $b) {
            $depthA = count($this->splitPathSegments($a['path'] ?? null));
            $depthB = count($this->splitPathSegments($b['path'] ?? null));

            if ($depthA === $depthB) {
                return strcmp((string) ($a['path'] ?? ''), (string) ($b['path'] ?? ''));
            }

            return $depthB <=> $depthA;
        });

        return $candidates[0];
    }

    /**
     * @return array<int, array{guid: string|null, name: string|null, path: string|null, id: string|null}>
     */
    private function collectCategoryCandidates(array $payload, Collection $shopCategoriesByGuid): array
    {
        $results = [];

        $process = function ($item) use (&$results, $shopCategoriesByGuid): void {
            if (is_string($item)) {
                $trimmed = trim($item);
                if ($trimmed === '') {
                    return;
                }

                if (str_contains($trimmed, '>') || str_contains($trimmed, '/')) {
                    $key = strtolower('|'.$trimmed);
                    if (! isset($results[$key])) {
                        $results[$key] = [
                            'guid' => null,
                            'name' => null,
                            'path' => $trimmed,
                            'id' => null,
                        ];
                    }

                    return;
                }

                $node = $shopCategoriesByGuid->get($trimmed);
                $path = $node->path ?? null;
                $name = $node->name ?? null;
                $id = $node->id ?? null;

                $key = strtolower($trimmed.'|'.($path ?? ''));
                if (! isset($results[$key])) {
                    $results[$key] = [
                        'guid' => $trimmed,
                        'name' => $name,
                        'path' => $path ? trim((string) $path) : null,
                        'id' => $id,
                    ];
                }

                return;
            }

            if (! is_array($item)) {
                return;
            }

            $guid = $item['guid']
                ?? $item['remoteGuid']
                ?? $item['categoryGuid']
                ?? ($item['category']['guid'] ?? $item['category']['remoteGuid'] ?? null);

            $path = $item['path']
                ?? $item['fullPath']
                ?? $item['categoryPath']
                ?? ($item['category']['path'] ?? $item['category']['fullPath'] ?? null);

            $name = $item['name']
                ?? $item['title']
                ?? $item['label']
                ?? ($item['category']['name'] ?? $item['category']['title'] ?? null)
                ?? null;

            $id = null;

            if ($guid && $shopCategoriesByGuid->has($guid)) {
                $node = $shopCategoriesByGuid->get($guid);
                $path = $path ?? $node->path ?? null;
                $name = $name ?? $node->name ?? null;
                $id = $node->id ?? null;
            }

            if (! $guid && ! $path) {
                return;
            }

            $normalizedPath = is_string($path) ? trim($path) : null;
            $key = strtolower(trim(($guid ?? '').'|'.($normalizedPath ?? '')));

            if (! isset($results[$key])) {
                $results[$key] = [
                    'guid' => $guid,
                    'name' => $name,
                    'path' => $normalizedPath,
                    'id' => $id,
                ];
            }
        };

        $candidateKeys = [
            'allCategories',
            'categories',
            'categoryAssignments',
            'category',
            'secondaryCategories',
            'categoriesAssignments',
            'categoryGuids',
            'categoriesGuids',
            'categoriesPaths',
        ];

        foreach ($candidateKeys as $key) {
            $value = Arr::get($payload, $key);
            if ($value === null) {
                continue;
            }

            if (is_array($value) && Arr::isAssoc($value)) {
                $process($value);
            } elseif (is_array($value)) {
                foreach ($value as $entry) {
                    $process($entry);
                }
            } else {
                $process($value);
            }
        }

        if (isset($payload['defaultCategory']) && is_array($payload['defaultCategory'])) {
            $process($payload['defaultCategory']);
        }

        return array_values($results);
    }

    /**
     * @return array<int, string>
     */
    private function splitPathSegments(?string $path): array
    {
        if (! is_string($path)) {
            return [];
        }

        $trimmed = trim($path);
        if ($trimmed === '') {
            return [];
        }

        $segments = preg_split('/\s*>\s*/u', $trimmed);
        if ($segments === false || count($segments) <= 1) {
            $segments = preg_split('/\s*\/\s*/u', $trimmed);
        }

        if ($segments === false || $segments === null) {
            $segments = [$trimmed];
        }

        return array_values(array_filter(array_map(static fn ($segment) => trim((string) $segment), $segments), static fn ($segment) => $segment !== ''));
    }

    private function pathPrefixMatches(array $defaultSegments, array $candidateSegments): bool
    {
        foreach ($defaultSegments as $index => $segment) {
            if (! isset($candidateSegments[$index])) {
                return false;
            }

            if (strcasecmp($segment, $candidateSegments[$index]) !== 0) {
                return false;
            }
        }

        return true;
    }

    private function pathsEqual(array $segmentsA, array $segmentsB): bool
    {
        if (count($segmentsA) !== count($segmentsB)) {
            return false;
        }

        foreach ($segmentsA as $index => $segment) {
            if (strcasecmp($segment, $segmentsB[$index]) !== 0) {
                return false;
            }
        }

        return true;
    }

}
