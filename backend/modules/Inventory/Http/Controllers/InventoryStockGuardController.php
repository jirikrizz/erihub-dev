<?php

namespace Modules\Inventory\Http\Controllers;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Modules\Inventory\Services\ElogistClient;
use Modules\Inventory\Models\InventoryStockGuardSnapshot;
use Modules\Pim\Models\ProductVariant;
use Modules\Pim\Models\ProductVariantShopOverlay;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Contracts\ShoptetClient;

class InventoryStockGuardController extends Controller
{
    public function __construct(
        private readonly ElogistClient $elogistClient,
        private readonly ShoptetClient $shoptetClient
    )
    {
    }

    public function index(Request $request)
    {
        $masterShop = $this->resolveMasterShop();

        if (! $masterShop) {
            return $this->respondMissingMasterShop($request);
        }

        $lastSyncedAt = $this->resolveLastSyncedAt($masterShop);
        $perPage = max(1, min(100, (int) $request->integer('per_page', 25)));
        $sortField = (string) $request->query('sort', 'variant_code');
        $sortDirection = strtolower((string) $request->query('direction', 'asc'));

        if (! in_array($sortDirection, ['asc', 'desc'], true)) {
            $sortDirection = 'asc';
        }

        $query = $this->buildStockGuardQuery($request, $masterShop);
        $this->applySorting($query, $sortField, $sortDirection);

        $variants = $query
            ->paginate($perPage)
            ->withQueryString();

        $variants->getCollection()->transform(function ($variant) {
            return $this->mapStockGuardRecord($variant);
        });

        $response = $variants->toArray();
        $response['meta'] = [
            'elogist' => [
                'enabled' => $this->elogistClient->isConfigured(),
                'message' => $this->elogistClient->getLastError(),
            ],
            'last_synced_at' => $lastSyncedAt,
        ];

        return response()->json($response);
    }

    public function export(Request $request)
    {
        $masterShop = $this->resolveMasterShop();

        if (! $masterShop) {
            return response()->json([
                'message' => 'Neexistuje master shop. Nastav prosím hlavní Shoptet shop.',
            ], 422);
        }

        $sortField = (string) $request->query('sort', 'variant_code');
        $sortDirection = strtolower((string) $request->query('direction', 'asc'));

        if (! in_array($sortDirection, ['asc', 'desc'], true)) {
            $sortDirection = 'asc';
        }

        $query = $this->buildStockGuardQuery($request, $masterShop);
        $this->applySorting($query, $sortField, $sortDirection);

        $filename = 'inventory-stock-guard-' . now()->format('Y-m-d_His') . '.csv';

        return response()->streamDownload(function () use ($query) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, [
                'Produkt',
                'Kód varianty',
                'Typ produktu',
                'Stav Shoptet',
                'Stav Elogist',
                'Rozdíl',
                'Shoptet status',
                'Zobrazení',
                'Poslední synchronizace',
            ]);

            foreach ($query->cursor() as $variant) {
                $record = $this->mapStockGuardRecord($variant);
                fputcsv($handle, [
                    $record['product_name'],
                    $record['variant_code'],
                    $record['product_type'],
                    $record['shoptet_stock'],
                    $record['elogist_stock'],
                    $record['stock_difference'],
                    $record['shoptet_status'],
                    $record['is_visible'] ? 'Zobrazeno' : 'Skryto',
                    $record['synced_at'],
                ]);
            }

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv',
        ]);
    }

    private function respondMissingMasterShop(Request $request)
    {
        $perPage = max(1, min(100, (int) $request->integer('per_page', 25)));

        return response()->json([
            'data' => [],
            'current_page' => 1,
            'from' => null,
            'last_page' => 1,
            'per_page' => $perPage,
            'to' => null,
            'total' => 0,
            'meta' => [
                'message' => 'Neexistuje master shop. Nastav prosím hlavní Shoptet shop.',
                'elogist' => [
                    'enabled' => $this->elogistClient->isConfigured(),
                    'message' => $this->elogistClient->getLastError(),
                ],
            ],
        ]);
    }

    private function resolveMasterShop(): ?Shop
    {
        return Shop::query()
            ->where('is_master', true)
            ->orderByDesc('id')
            ->first();
    }

    private function resolveLastSyncedAt(Shop $masterShop): ?string
    {
        $timestamp = InventoryStockGuardSnapshot::query()
            ->where('shop_id', $masterShop->id)
            ->max('synced_at');

        return $timestamp ? Carbon::parse($timestamp)->toIso8601String() : null;
    }

    private function buildStockGuardQuery(Request $request, Shop $masterShop): Builder
    {
        $search = trim((string) $request->query('search', ''));
        $locale = $masterShop->default_locale ?? $masterShop->locale;
        $likeOperator = $this->resolveLikeOperator();

        $productNameSub = DB::table('product_translations')
            ->select('name')
            ->whereColumn('product_translations.product_id', 'products.id')
            ->where('product_translations.shop_id', $masterShop->id)
            ->orderByDesc('product_translations.updated_at')
            ->limit(1);

        if ($locale) {
            $productNameSub->where('product_translations.locale', $locale);
        }

        $variantNameSub = DB::table('product_variant_translations')
            ->select('name')
            ->whereColumn('product_variant_translations.product_variant_id', 'product_variants.id')
            ->where('product_variant_translations.shop_id', $masterShop->id)
            ->orderByDesc('product_variant_translations.updated_at')
            ->limit(1);

        if ($locale) {
            $variantNameSub->where('product_variant_translations.locale', $locale);
        }

        $productTypeExpression = $this->productTypeExpressionSql();
        $statusExpression = $this->productStatusExpressionSql();
        $visibilityExpression = $this->visibilityRankExpression($statusExpression);

        $query = ProductVariant::query()
            ->select([
                'product_variants.id',
                'product_variants.product_id',
                'product_variants.code',
                'product_variants.name as base_variant_name',
                'product_variants.stock as canonical_stock',
                'product_variants.data',
                'product_variant_shop_overlays.stock as overlay_stock',
                'product_shop_overlays.status as overlay_status',
                'products.status as product_status',
                'products.sku as product_sku',
                'guard.shoptet_stock as guard_shoptet_stock',
                'guard.elogist_stock as guard_elogist_stock',
                'guard.stock_difference as guard_stock_difference',
                'guard.synced_at as guard_synced_at',
            ])
            ->addSelect([
                'product_name' => $productNameSub,
                'variant_translation' => $variantNameSub,
                'product_type' => DB::raw("COALESCE({$productTypeExpression}, 'product')"),
                'shoptet_status_value' => DB::raw($statusExpression),
                'visibility_rank' => DB::raw($visibilityExpression),
            ])
            ->join('products', 'product_variants.product_id', '=', 'products.id')
            ->leftJoin('product_variant_shop_overlays', function ($join) use ($masterShop) {
                $join->on('product_variant_shop_overlays.product_variant_id', '=', 'product_variants.id')
                    ->where('product_variant_shop_overlays.shop_id', '=', $masterShop->id);
            })
            ->leftJoin('inventory_stock_guard_snapshots as guard', function ($join) use ($masterShop) {
                $join->on('guard.product_variant_id', '=', 'product_variants.id')
                    ->where('guard.shop_id', '=', $masterShop->id);
            })
            ->leftJoin('product_shop_overlays', function ($join) use ($masterShop) {
                $join->on('product_shop_overlays.product_id', '=', 'products.id')
                    ->where('product_shop_overlays.shop_id', '=', $masterShop->id);
            })
            ->where('products.shop_id', $masterShop->id);

        if ($search !== '') {
            $query->where(function (Builder $builder) use ($search, $likeOperator, $masterShop, $locale) {
                $builder
                    ->where('product_variants.code', $likeOperator, "%{$search}%")
                    ->orWhere('product_variants.name', $likeOperator, "%{$search}%");

                $builder->orWhereExists(function ($subquery) use ($search, $likeOperator, $masterShop, $locale) {
                    $subquery
                        ->selectRaw('1')
                        ->from('product_translations')
                        ->whereColumn('product_translations.product_id', 'products.id')
                        ->where('product_translations.shop_id', $masterShop->id)
                        ->where('product_translations.name', $likeOperator, "%{$search}%");

                    if ($locale) {
                        $subquery->where('product_translations.locale', $locale);
                    }
                });

                $builder->orWhereExists(function ($subquery) use ($search, $likeOperator, $masterShop, $locale) {
                    $subquery
                        ->selectRaw('1')
                        ->from('product_variant_translations')
                        ->whereColumn('product_variant_translations.product_variant_id', 'product_variants.id')
                        ->where('product_variant_translations.shop_id', $masterShop->id)
                        ->where('product_variant_translations.name', $likeOperator, "%{$search}%");

                    if ($locale) {
                        $subquery->where('product_variant_translations.locale', $locale);
                    }
                });
            });
        }

        $productType = $request->query('product_type');
        if (is_string($productType) && $productType !== '') {
            $this->applyProductTypeFilter($query, $productTypeExpression, $productType);
        }

        return $query;
    }

    private function applySorting(Builder $query, string $sortField, string $sortDirection): void
    {
        $sortable = [
            'product_name' => 'product_name',
            'variant_name' => 'variant_translation',
            'variant_code' => 'product_variants.code',
            'product_id' => 'product_variants.product_id',
            'product_type' => 'product_type',
            'shoptet_stock' => DB::raw('COALESCE(product_variant_shop_overlays.stock, product_variants.stock)'),
            'shoptet_status' => 'shoptet_status_value',
            'visibility' => 'visibility_rank',
            'elogist_stock' => DB::raw('guard.elogist_stock'),
            'stock_difference' => DB::raw('guard.stock_difference'),
            'synced_at' => DB::raw('guard.synced_at'),
        ];

        if (! array_key_exists($sortField, $sortable)) {
            $sortField = 'variant_code';
        }

        $sortColumn = $sortable[$sortField];
        $query->orderBy($sortColumn, $sortDirection);

        if ($sortField !== 'variant_code') {
            $query->orderBy('product_variants.code');
        }
    }

    private function applyProductTypeFilter(Builder $query, string $expression, string $value): void
    {
        $query->whereRaw("COALESCE({$expression}, 'product') = ?", [$value]);
    }

    private function productTypeExpressionSql(): string
    {
        $driver = ProductVariant::query()->getConnection()->getDriverName();

        return $driver === 'pgsql'
            ? "products.base_payload->>'type'"
            : "JSON_UNQUOTE(JSON_EXTRACT(products.base_payload, '\$.type'))";
    }

    private function mapStockGuardRecord($variant): array
    {
        $shoptetStock = $variant->guard_shoptet_stock ?? ($variant->overlay_stock ?? $variant->canonical_stock);
        $elogistValue = $variant->guard_elogist_stock;
        $difference = $variant->guard_stock_difference ?? $this->calculateDifference($shoptetStock, $elogistValue);
        $status = $variant->overlay_status ?? $variant->product_status ?? 'unknown';
        $isVisible = $this->isVisible($status);
        $syncedAt = $variant->guard_synced_at ? Carbon::parse($variant->guard_synced_at)->toIso8601String() : null;

        return [
            'id' => $variant->id,
            'product_id' => $variant->product_id,
            'variant_code' => $variant->code,
            'product_name' => $variant->product_name ?? $variant->product_sku ?? '—',
            'variant_name' => $variant->variant_translation ?? $variant->base_variant_name ?? '—',
            'product_type' => $variant->product_type ?? 'product',
            'shoptet_stock' => is_null($shoptetStock) ? null : (float) $shoptetStock,
            'elogist_stock' => is_null($elogistValue) ? null : (float) $elogistValue,
            'stock_difference' => $difference,
            'is_visible' => $isVisible,
            'shoptet_status' => $status,
            'synced_at' => $syncedAt,
        ];
    }

    private function productStatusExpressionSql(): string
    {
        return "LOWER(COALESCE(product_shop_overlays.status, products.status))";
    }

    private function visibilityRankExpression(string $statusExpression): string
    {
        return "CASE WHEN {$statusExpression} IN ('visible','shown','active','published','displayed') THEN 1 ELSE 0 END";
    }

    public function syncSelected(Request $request)
    {
        $data = $request->validate([
            'variant_ids' => ['required', 'array', 'min:1'],
            'variant_ids.*' => ['uuid'],
        ]);

        $variantIds = array_values(array_unique($data['variant_ids']));

        /** @var Shop|null $masterShop */
        $masterShop = Shop::query()
            ->where('is_master', true)
            ->orderByDesc('id')
            ->first();

        if (! $masterShop) {
            return response()->json([
                'message' => 'Neexistuje master shop. Nastav prosím hlavní Shoptet shop.',
            ], 422);
        }

        $variants = ProductVariant::query()
            ->with(['product.remoteRefs'])
            ->whereIn('id', $variantIds)
            ->get()
            ->keyBy('id');

        $snapshots = InventoryStockGuardSnapshot::query()
            ->where('shop_id', $masterShop->id)
            ->whereIn('product_variant_id', $variantIds)
            ->get()
            ->keyBy('product_variant_id');

        $results = [
            'updated' => [],
            'skipped' => [],
        ];

        $now = now();

        DB::transaction(function () use ($variantIds, $variants, $snapshots, $masterShop, &$results, $now) {
            foreach ($variantIds as $variantId) {
                /** @var ProductVariant|null $variant */
                $variant = $variants->get($variantId);

                if (! $variant || ! $variant->product || $variant->product->shop_id !== $masterShop->id) {
                    $results['skipped'][] = [
                        'id' => $variantId,
                        'reason' => 'variant_not_found',
                    ];
                    continue;
                }

                /** @var InventoryStockGuardSnapshot|null $snapshot */
                $snapshot = $snapshots->get($variantId);
                $target = $snapshot?->elogist_stock;

                if ($snapshot === null || $target === null) {
                    $results['skipped'][] = [
                        'id' => $variant->id,
                        'variant_code' => $variant->code,
                        'reason' => 'elogist_stock_missing',
                    ];
                    continue;
                }

                $variant->stock = $target;
                $variant->save();

                /** @var ProductVariantShopOverlay $overlay */
                $overlay = ProductVariantShopOverlay::firstOrNew([
                    'product_variant_id' => $variant->id,
                    'shop_id' => $masterShop->id,
                ]);
                $overlay->stock = $target;
                $overlay->save();

                $snapshot->shoptet_stock = $target;
                $snapshot->stock_difference = 0.0;
                $snapshot->synced_at = $now;
                $snapshot->save();

                $syncedToShoptet = $this->pushStockToShoptet($variant, $masterShop, (float) $target);

                $results['updated'][] = [
                    'id' => $variant->id,
                    'variant_code' => $variant->code,
                    'shoptet_stock' => (float) $target,
                    'elogist_stock' => (float) $target,
                    'shoptet_synced' => $syncedToShoptet,
                ];
            }
        });

        return response()->json([
            'updated_count' => count($results['updated']),
            'skipped_count' => count($results['skipped']),
            'results' => $results,
        ]);
    }

    private function resolveLikeOperator(): string
    {
        $connection = ProductVariant::query()->getConnection()->getDriverName();

        return $connection === 'pgsql' ? 'ilike' : 'like';
    }

    private function isVisible(?string $status): bool
    {
        if (! $status) {
            return false;
        }

        $normalized = strtolower($status);

        return in_array($normalized, ['visible', 'shown', 'active', 'published', 'displayed'], true);
    }

    private function calculateDifference(mixed $shoptet, mixed $elogist): ?float
    {
        if (! is_numeric($shoptet) || ! is_numeric($elogist)) {
            return null;
        }

        return round((float) $shoptet - (float) $elogist, 4);
    }

    private function pushStockToShoptet(ProductVariant $variant, Shop $shop, float $targetStock): bool
    {
        $product = $variant->product;

        if (! $product) {
            return false;
        }

        $remoteGuid = optional($product->remoteRefs?->firstWhere('shop_id', $shop->id))->remote_guid
            ?? $product->external_guid;

        if (! is_string($remoteGuid) || trim($remoteGuid) === '') {
            Log::warning('Cannot sync Shoptet stock – missing remote GUID.', [
                'product_id' => $product->id,
                'variant_id' => $variant->id,
                'shop_id' => $shop->id,
            ]);

            return false;
        }

        $stockId = $this->resolvePrimaryStockId($variant);

        $movement = [
            [
                'productCode' => $variant->code,
                'quantity' => $this->formatAmount($targetStock),
            ],
        ];

        try {
            $this->shoptetClient->updateStockMovements($shop, $stockId, $movement);

            return true;
        } catch (\Throwable $exception) {
            Log::error('Failed to sync Shoptet stock from stock guard.', [
                'product_id' => $product->id,
                'variant_id' => $variant->id,
                'shop_id' => $shop->id,
                'target_stock' => $targetStock,
                'message' => $exception->getMessage(),
            ]);

            return false;
        }
    }

    private function resolvePrimaryStockId(ProductVariant $variant): int
    {
        $data = is_array($variant->data) ? $variant->data : [];
        $locations = Arr::get($data, 'stocksLocations')
            ?? Arr::get($data, 'perStockAmounts')
            ?? [];

        if (is_array($locations)) {
            foreach ($locations as $location) {
                if (! is_array($location)) {
                    continue;
                }

                $stockId = $location['stockId']
                    ?? $location['stock_id']
                    ?? $location['id']
                    ?? null;

                if (! is_numeric($stockId)) {
                    continue;
                }

                return (int) $stockId;
            }
        }

        return 1;
    }

    private function formatAmount(float $value): float
    {
        return round($value, 3);
    }
}
