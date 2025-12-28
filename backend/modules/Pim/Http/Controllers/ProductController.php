<?php

namespace Modules\Pim\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ProductTranslation;
use Modules\Shoptet\Models\Shop;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $perPage = (int) $request->integer('per_page', 25);
        $perPage = $perPage > 0 ? min($perPage, 100) : 25;

        $targetShopId = $request->query('target_shop_id');
        $targetShop = null;

        if ($targetShopId) {
            $targetShopId = (int) $targetShopId;
            $targetShop = Shop::query()
                ->select(['id', 'name', 'locale', 'default_locale', 'is_master'])
                ->find($targetShopId);

            abort_if(! $targetShop, 404, 'Target shop not found.');
        }

        $query = Product::query()
            ->select([
                'id',
                'shop_id',
                'external_guid',
                'sku',
                'status',
                'base_payload',
                'created_at',
                'updated_at',
            ])
            ->withCount([
                'translations as draft_translations_count' => fn ($query) => $query->where('status', 'draft'),
                'translations as review_translations_count' => fn ($query) => $query->where('status', 'in_review'),
            ])
            ->with([
                'translations' => fn ($query) => $query->select(['id', 'product_id', 'shop_id', 'locale', 'status']),
            ]);

        $targetLocale = $targetShop ? ($targetShop->locale ?? $targetShop->default_locale) : null;

        if ($targetShopId) {
            $query->with([
                'overlays' => fn ($overlayQuery) => $overlayQuery
                    ->select(['id', 'product_id', 'shop_id'])
                    ->where('shop_id', $targetShopId),
                'remoteRefs' => fn ($remoteQuery) => $remoteQuery
                    ->select(['id', 'product_id', 'shop_id'])
                    ->where('shop_id', $targetShopId),
                'variants' => fn ($variantQuery) => $variantQuery
                    ->select(['id', 'product_id', 'code'])
                    ->with([
                        'overlays' => fn ($overlay) => $overlay
                            ->select(['id', 'product_variant_id', 'shop_id'])
                            ->where('shop_id', $targetShopId),
                        'remoteRefs' => fn ($remote) => $remote
                            ->select(['id', 'product_variant_id', 'shop_id'])
                            ->where('shop_id', $targetShopId),
                    ]),
            ]);

            $query->addSelect([
                'target_translation_status' => ProductTranslation::query()
                    ->select('status')
                    ->whereColumn('product_id', 'products.id')
                    ->where(function ($translationQuery) use ($targetShopId, $targetLocale) {
                        $translationQuery->where('shop_id', $targetShopId);

                        if ($targetLocale) {
                            $translationQuery->orWhere(function ($fallbackQuery) use ($targetLocale) {
                                $fallbackQuery
                                    ->whereNull('shop_id')
                                    ->where('locale', $targetLocale);
                            });
                        }
                    })
                    ->orderByRaw('CASE WHEN shop_id = ? THEN 0 ELSE 1 END', [$targetShopId])
                    ->limit(1),
            ]);

            if (! $request->filled('shop_id')) {
                $query->whereHas('shop', fn ($shopQuery) => $shopQuery->where('is_master', true));
            }
        }

        if ($shopId = $request->query('shop_id')) {
            $query->where('shop_id', $shopId);
        }

        if ($sku = $request->query('sku')) {
            $query->where('sku', 'like', '%'.trim($sku).'%');
        }

        if ($search = $request->query('search')) {
            $normalizedSearch = Str::lower(trim($search));
            if ($normalizedSearch !== '') {
                $like = '%'.$normalizedSearch.'%';
                $query->where(function ($searchQuery) use ($like) {
                    $searchQuery
                        ->whereRaw('LOWER(products.sku::text) LIKE ?', [$like])
                        ->orWhereRaw('LOWER(products.external_guid::text) LIKE ?', [$like])
                        ->orWhereRaw("LOWER(products.base_payload->>'name') LIKE ?", [$like])
                        ->orWhereHas('variants', function ($variantQuery) use ($like) {
                            $variantQuery
                                ->whereRaw('LOWER(product_variants.code::text) LIKE ?', [$like])
                                ->orWhereRaw('LOWER(product_variants.sku::text) LIKE ?', [$like])
                                ->orWhereRaw('LOWER(product_variants.ean::text) LIKE ?', [$like])
                                ->orWhereRaw('LOWER(product_variants.name) LIKE ?', [$like]);
                        });
                });
            }
        }

        $sortBy = $request->query('sort_by', 'created_at');
        $sortDirection = strtolower($request->query('sort_direction', 'desc')) === 'asc' ? 'asc' : 'desc';
        $allowedSorts = ['created_at', 'translation_status'];
        if (! in_array($sortBy, $allowedSorts, true)) {
            $sortBy = 'created_at';
        }

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        if ($locale = $request->query('locale')) {
            $query->whereHas('translations', fn ($q) => $q->where('locale', $locale));
        }

        if ($translationStatus = $request->query('translation_status')) {
            $query->whereHas('translations', fn ($q) => $q->where('status', $translationStatus));
        }

        if ($sortBy === 'translation_status' && $targetShopId) {
            if ($sortDirection === 'asc') {
                $query->orderByRaw('CASE WHEN target_translation_status IS NULL THEN 0 ELSE 1 END ASC');
            } else {
                $query->orderByRaw('CASE WHEN target_translation_status IS NULL THEN 1 ELSE 0 END ASC');
            }

            $query->orderBy('target_translation_status', $sortDirection);
            $query->orderBy('products.created_at', 'desc');
        } else {
            $query->orderBy('products.created_at', $sortDirection);
        }

        $products = $query->paginate($perPage);

        if ($targetShopId && $targetShop) {
            $products->getCollection()->transform(function (Product $product) use ($targetShopId, $targetLocale) {
                $variants = $product->relationLoaded('variants') ? $product->variants : collect();
                $totalVariants = $variants->count();
                $matchedVariants = $variants->filter(function ($variant) use ($targetShopId) {
                    $hasOverlay = $variant->relationLoaded('overlays')
                        && $variant->overlays->contains(fn ($overlay) => (int) $overlay->shop_id === $targetShopId);
                    $hasRemoteRef = $variant->relationLoaded('remoteRefs')
                        && $variant->remoteRefs->contains(fn ($ref) => (int) $ref->shop_id === $targetShopId);

                    return $hasOverlay || $hasRemoteRef;
                })->count();
                $hasAllVariants = $totalVariants === 0 || $matchedVariants === $totalVariants;

                $productOverlays = $product->relationLoaded('overlays') ? $product->overlays : collect();
                $productRemoteRefs = $product->relationLoaded('remoteRefs') ? $product->remoteRefs : collect();
                $hasProductPresence = $productOverlays->contains(fn ($overlay) => (int) $overlay->shop_id === $targetShopId)
                    || $productRemoteRefs->contains(fn ($ref) => (int) $ref->shop_id === $targetShopId)
                    || $matchedVariants > 0;

                $translation = $product->translations
                    ->first(function ($record) use ($targetShopId, $targetLocale) {
                        if ((int) ($record->shop_id ?? 0) === $targetShopId) {
                            return true;
                        }

                        return $record->shop_id === null && $targetLocale && $record->locale === $targetLocale;
                    });

                $translationStatus = $translation?->status;
                $isFullyTranslated = $hasProductPresence && $hasAllVariants && $translationStatus === 'synced';

                $product->setAttribute('target_shop_state', [
                    'shop_id' => $targetShopId,
                    'locale' => $targetLocale,
                    'variants_total' => $totalVariants,
                    'variants_matched' => $matchedVariants,
                    'has_all_variants' => $hasAllVariants,
                    'has_product_overlay' => $hasProductPresence,
                    'translation_status' => $translationStatus,
                    'is_fully_translated' => $isFullyTranslated,
                ]);

                return $product;
            });
        }

        return response()->json($products);
    }

    public function show(Product $product)
    {
        $product->load([
            'translations' => fn ($query) => $query->with('shop'),
            'overlays' => fn ($query) => $query->with('shop'),
            'remoteRefs',
            'variants' => fn ($query) => $query
                ->orderBy('code')
                ->with([
                    'overlays' => fn ($overlay) => $overlay->with('shop'),
                    'translations' => fn ($translation) => $translation->with('shop'),
                    'remoteRefs',
                ]),
        ]);

        return response()->json($product);
    }
}
