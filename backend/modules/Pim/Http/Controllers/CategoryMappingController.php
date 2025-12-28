<?php

namespace Modules\Pim\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;
use Modules\Pim\Models\CategoryMapping;
use Modules\Pim\Models\CategoryNode;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ShopCategoryNode;
use Modules\Pim\Services\CategoryDefaultCategoryUpdater;
use Modules\Pim\Services\CategoryDefaultCategoryValidator;
use Modules\Pim\Services\CategoryMappingAiService;
use Modules\Pim\Services\CategoryMappingService;
use Modules\Pim\Services\CategoryTreeService;
use Modules\Shoptet\Models\Shop;
use RuntimeException;
use Throwable;

class CategoryMappingController extends Controller
{
    public function __construct(
        private readonly CategoryMappingService $mappingService,
        private readonly CategoryTreeService $treeService,
        private readonly CategoryMappingAiService $aiService,
        private readonly CategoryDefaultCategoryValidator $defaultCategoryValidator,
        private readonly CategoryDefaultCategoryUpdater $defaultCategoryUpdater
    )
    {
    }
    
    public function aiPreMap(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'master_shop_id' => ['nullable', 'integer', Rule::exists('shops', 'id')],
            'shop_id' => ['required', 'integer', Rule::exists('shops', 'id')],
            'instructions' => ['nullable', 'string', 'max:500'],
            'include_mapped' => ['sometimes', 'boolean'],
        ]);

        $targetShop = Shop::query()->findOrFail((int) $validated['shop_id']);

        $masterShopQuery = Shop::query()->where('is_master', true);

        if (! empty($validated['master_shop_id'])) {
            /** @var Shop|null $master */
            $master = $masterShopQuery->clone()->find((int) $validated['master_shop_id']);
            if (! $master) {
                abort(422, 'Vybraný master shop neexistuje nebo není označen jako master.');
            }
        } else {
            /** @var Shop|null $master */
            $master = $masterShopQuery->orderBy('id')->first();
        }

        if (! $master) {
            abort(422, 'Není k dispozici žádný master shop.');
        }

        $includeMapped = (bool) ($validated['include_mapped'] ?? false);

        $suggestions = $this->aiService->suggest(
            $master->id,
            $targetShop->id,
            $includeMapped,
            $validated['instructions'] ?? null
        );

        return response()->json([
            'message' => 'AI návrhy byly připraveny. Zkontroluj je před potvrzením.',
            'master_shop' => [
                'id' => $master->id,
                'name' => $master->name,
            ],
            'target_shop' => [
                'id' => $targetShop->id,
                'name' => $targetShop->name,
            ],
            'instructions' => $validated['instructions'] ?? null,
            'include_mapped' => $includeMapped,
            'suggestions' => $suggestions,
        ]);
    }

    public function validateDefaultCategories(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'master_shop_id' => ['nullable', 'integer', Rule::exists('shops', 'id')],
            'shop_id' => ['required', 'integer', Rule::exists('shops', 'id')],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:200'],
            'search' => ['sometimes', 'string'],
            'all' => ['sometimes', 'boolean'],
        ]);

        /** @var Shop $targetShop */
        $targetShop = Shop::query()->findOrFail((int) $validated['shop_id']);

        $masterShopQuery = Shop::query()->where('is_master', true);

        if (! empty($validated['master_shop_id'])) {
            /** @var Shop|null $master */
            $master = $masterShopQuery->clone()->find((int) $validated['master_shop_id']);
            if (! $master) {
                abort(422, 'Vybraný master shop neexistuje nebo není označen jako master.');
            }
        } else {
            /** @var Shop|null $master */
            $master = $masterShopQuery->orderBy('id')->first();
        }

        if (! $master) {
            abort(422, 'Není k dispozici žádný master shop.');
        }

        $result = $this->defaultCategoryValidator->validate(
            $master,
            $targetShop,
            (int) ($validated['page'] ?? 1),
            (int) ($validated['per_page'] ?? 50),
            $validated['search'] ?? null,
            (bool) ($validated['all'] ?? false)
        );

        return response()->json($result);
    }

    public function applyDefaultCategory(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'product_id' => ['required', 'uuid', Rule::exists('products', 'id')],
            'target' => ['required', 'string', Rule::in(['master', 'shop'])],
            'category_id' => ['nullable', 'string'],
            'shop_id' => ['required_if:target,shop', 'integer', Rule::exists('shops', 'id')],
            'sync_to_shoptet' => ['sometimes', 'boolean'],
        ]);

        /** @var Product $product */
        $product = Product::query()
            ->with(['shop'])
            ->findOrFail($validated['product_id']);

        $syncToShoptet = array_key_exists('sync_to_shoptet', $validated)
            ? (bool) $validated['sync_to_shoptet']
            : true;

        if ($validated['target'] === 'master') {
            $categoryGuidForDebug = null;
            if (! $product->shop || ! $product->shop->is_master) {
                abort(422, 'Produkt není v master shopu.');
            }

            try {
                if (empty($validated['category_id'])) {
                    $this->defaultCategoryUpdater->clearMaster($product, $syncToShoptet);

                    $product = $product->fresh();
                    $product->load(['shop', 'remoteRefs', 'overlays']);
                    $debug = $this->defaultCategoryUpdater->describeSyncContext(
                        $product,
                        $product->shop,
                        null
                    );

                    return response()->json([
                        'message' => $syncToShoptet
                            ? 'Výchozí kategorie master produktu byla odstraněna i v Shoptetu.'
                            : 'Výchozí kategorie master produktu byla odstraněna.',
                        'debug' => $debug,
                    ]);
                }

                /** @var CategoryNode $category */
                $category = CategoryNode::query()->findOrFail($validated['category_id']);
                $categoryGuidForDebug = $category->guid;
                $this->defaultCategoryUpdater->applyToMaster($product, $category, $syncToShoptet);

                $product = $product->fresh();
                $product->load(['shop', 'remoteRefs', 'overlays']);
                $debug = $this->defaultCategoryUpdater->describeSyncContext(
                    $product,
                    $product->shop,
                    $categoryGuidForDebug
                );

                return response()->json([
                    'message' => $syncToShoptet
                        ? 'Výchozí kategorie master produktu byla aktualizována v Shoptetu.'
                        : 'Výchozí kategorie master produktu byla upravena.',
                    'debug' => $debug,
                ]);
            } catch (RuntimeException $exception) {
                abort(422, $exception->getMessage());
            } catch (Throwable $throwable) {
                report($throwable);
                abort(502, 'Nepodařilo se odeslat výchozí kategorii do Shoptetu. Zkus to prosím znovu.');
            }
        }

        $shop = Shop::query()->findOrFail((int) $validated['shop_id']);

        try {
            $categoryGuidForDebug = null;
            if (empty($validated['category_id'])) {
                $this->defaultCategoryUpdater->clearShop($product, $shop, $syncToShoptet);

                $product = $product->fresh();
                $product->load(['shop', 'remoteRefs', 'overlays']);
                $debug = $this->defaultCategoryUpdater->describeSyncContext(
                    $product,
                    $shop,
                    null
                );

                return response()->json([
                    'message' => $syncToShoptet
                        ? 'Kategorie v cílovém shopu byla odstraněna i v Shoptetu.'
                        : 'Kategorie v cílovém shopu byla zrušena.',
                    'debug' => $debug,
                ]);
            }

            /** @var ShopCategoryNode $category */
            $category = ShopCategoryNode::query()->findOrFail($validated['category_id']);
            $categoryGuidForDebug = $category->remote_guid;

            $this->defaultCategoryUpdater->applyToShop($product, $shop, $category, $syncToShoptet);

            $product = $product->fresh();
            $product->load(['shop', 'remoteRefs', 'overlays']);
            $debug = $this->defaultCategoryUpdater->describeSyncContext(
                $product,
                $shop,
                $categoryGuidForDebug
            );

            return response()->json([
                'message' => $syncToShoptet
                    ? 'Kategorie v cílovém shopu byla aktualizována v Shoptetu.'
                    : 'Kategorie v cílovém shopu byla upravena.',
                'debug' => $debug,
            ]);
        } catch (RuntimeException $exception) {
            abort(422, $exception->getMessage());
        } catch (Throwable $throwable) {
            report($throwable);
            abort(502, 'Nepodařilo se odeslat výchozí kategorii do Shoptetu. Zkus to prosím znovu.');
        }
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'shop_id' => ['required', 'integer', Rule::exists('shops', 'id')],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:200'],
            'search' => ['sometimes', 'string'],
            'status' => ['sometimes', 'string'],
        ]);

        /** @var Shop $shop */
        $shop = Shop::query()->findOrFail((int) $validated['shop_id']);

        $perPage = (int) ($validated['per_page'] ?? 50);

        $query = CategoryNode::query()
            ->whereHas('shop', fn ($shopQuery) => $shopQuery->where('is_master', true))
            ->with(['mappings' => fn ($mappingQuery) => $mappingQuery
                ->where('shop_id', $shop->id)
                ->with('shopCategory'),
            ]);

        if (! empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($inner) use ($search) {
                $inner->where('name', 'like', '%'.trim($search).'%')
                    ->orWhere('slug', 'like', '%'.trim($search).'%')
                    ->orWhere('guid', 'like', '%'.trim($search).'%');
            });
        }

        if (! empty($validated['status'])) {
            $status = $validated['status'];
            $query->whereHas('mappings', fn ($mappingQuery) => $mappingQuery
                ->where('shop_id', $shop->id)
                ->where('status', $status));
        }

        $query->orderBy('parent_id')->orderBy('position')->orderBy('name');

        $paginator = $query->paginate($perPage);

        $collection = $paginator->getCollection()->map(function (CategoryNode $node) use ($shop) {
            $mapping = $node->mappings->first();

            return [
                'category' => [
                    'id' => $node->id,
                    'guid' => $node->guid,
                    'name' => $node->name,
                    'slug' => $node->slug,
                    'path' => $this->mappingService->canonicalPath($node),
                ],
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
                ] : null,
            ];
        });

        $paginator->setCollection($collection);

        return response()->json($paginator);
    }

    public function confirm(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category_node_id' => ['required', 'uuid', Rule::exists('category_nodes', 'id')],
            'shop_category_node_id' => ['required', 'uuid', Rule::exists('shop_category_nodes', 'id')],
            'notes' => ['sometimes', 'string', 'max:1000'],
        ]);

        /** @var ShopCategoryNode $shopCategory */
        $shopCategory = ShopCategoryNode::query()->findOrFail($validated['shop_category_node_id']);

        $mapping = CategoryMapping::query()->firstOrNew([
            'category_node_id' => $validated['category_node_id'],
            'shop_id' => $shopCategory->shop_id,
        ]);

        $mapping->shop_category_node_id = $shopCategory->id;
        $mapping->status = 'confirmed';
        $mapping->confidence = 1.0;
        $mapping->source = 'manual';
        $mapping->notes = $validated['notes'] ?? null;
        $mapping->save();

        $mapping->load('shopCategory');

        return response()->json([
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
        ]);
    }

    public function reject(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category_node_id' => ['required', 'uuid', Rule::exists('category_nodes', 'id')],
            'shop_id' => ['required', 'integer', Rule::exists('shops', 'id')],
            'notes' => ['sometimes', 'string', 'max:1000'],
        ]);

        $mapping = CategoryMapping::query()->firstOrNew([
            'category_node_id' => $validated['category_node_id'],
            'shop_id' => (int) $validated['shop_id'],
        ]);

        $mapping->shop_category_node_id = null;
        $mapping->status = 'rejected';
        $mapping->confidence = null;
        $mapping->source = 'manual';
        $mapping->notes = $validated['notes'] ?? null;
        $mapping->save();

        return response()->json([
            'id' => $mapping->id,
            'status' => $mapping->status,
            'confidence' => $mapping->confidence,
            'source' => $mapping->source,
            'shop_category_node_id' => $mapping->shop_category_node_id,
        ]);
    }

    public function shopCategories(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'shop_id' => ['required', 'integer', Rule::exists('shops', 'id')],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:200'],
            'search' => ['sometimes', 'string'],
        ]);

        $perPage = (int) ($validated['per_page'] ?? 50);

        $query = ShopCategoryNode::query()
            ->where('shop_id', (int) $validated['shop_id']);

        if (! empty($validated['search'])) {
            $search = trim($validated['search']);
            $query->where(function ($inner) use ($search) {
                $inner->where('name', 'like', '%'.$search.'%')
                    ->orWhere('slug', 'like', '%'.$search.'%')
                    ->orWhere('path', 'like', '%'.$search.'%');
            });
        }

        $query->orderBy('path')->orderBy('name');

        $paginator = $query->paginate($perPage);

        return response()->json($paginator);
    }

    public function tree(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'shop_id' => ['nullable', 'integer', Rule::exists('shops', 'id')],
            'master_shop_id' => ['nullable', 'integer', Rule::exists('shops', 'id')],
        ]);

        $data = $this->treeService->buildTrees(
            targetShopId: $validated['shop_id'] ?? null,
            masterShopId: $validated['master_shop_id'] ?? null
        );

        return response()->json($data);
    }
}
