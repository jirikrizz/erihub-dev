<?php

namespace Modules\Inventory\Services;

use Illuminate\Database\Query\JoinClause;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Modules\Inventory\Models\InventoryStockGuardSnapshot;
use Modules\Pim\Models\ProductVariant;
use Modules\Pim\Services\ProductSnapshotImporter;
use Modules\Shoptet\Contracts\ShoptetClient;
use Modules\Shoptet\Models\Shop;

class InventoryStockGuardSyncService
{
    public function __construct(
        private readonly ElogistClient $elogistClient,
        private readonly ShoptetClient $shoptetClient,
        private readonly ProductSnapshotImporter $snapshotImporter
    ) {
    }

    /**
     * Synchronizes cached stock data for the inventory guard.
     *
     * @return array{processed: int, shop_id: int|null, synced_at: string|null}
     */
    public function sync(int $chunkSize = 200, ?Shop $masterShop = null): array
    {
        $chunkSize = max(10, min(500, $chunkSize));
        $masterShop ??= $this->resolveMasterShop();

        if (! $masterShop) {
            return [
                'processed' => 0,
                'shop_id' => null,
                'synced_at' => null,
            ];
        }

        $processed = 0;
        $lastSyncedAt = null;

        $query = ProductVariant::query()
            ->with(['product.remoteRefs'])
            ->select([
                'product_variants.id',
                'product_variants.product_id',
                'product_variants.code',
                'product_variants.stock as canonical_stock',
                'product_variant_shop_overlays.stock as overlay_stock',
            ])
            ->join('products', 'product_variants.product_id', '=', 'products.id')
            ->leftJoin('product_variant_shop_overlays', function (JoinClause $join) use ($masterShop) {
                $join->on('product_variant_shop_overlays.product_variant_id', '=', 'product_variants.id')
                    ->where('product_variant_shop_overlays.shop_id', '=', $masterShop->id);
            })
            ->where('products.shop_id', $masterShop->id)
            ->orderBy('product_variants.id');

        $query->chunk($chunkSize, function (Collection $variants) use (&$processed, $masterShop, &$lastSyncedAt) {
            $timestamp = Carbon::now();

            $this->refreshMasterStockData($variants, $masterShop);
            $this->reloadVariantStockValues($variants, $masterShop);

            $codes = $variants
                ->pluck('code')
                ->filter(fn ($code) => $code !== null && trim((string) $code) !== '')
                ->values()
                ->all();

            $elogistStock = [];

            if ($this->elogistClient->isConfigured() && $codes !== []) {
                $elogistStock = $this->elogistClient->fetchStockByProductNumbers($codes);
            }

            $payload = [];

            foreach ($variants as $variant) {
                $shoptetStock = $variant->overlay_stock ?? $variant->canonical_stock;
                $elogistValue = $variant->code ? ($elogistStock[$variant->code] ?? null) : null;
                $difference = $this->calculateDifference($shoptetStock, $elogistValue);

                $payload[] = [
                    'id' => (string) Str::uuid(),
                    'product_variant_id' => $variant->id,
                    'product_id' => $variant->product_id,
                    'variant_code' => $variant->code,
                    'shop_id' => $masterShop->id,
                    'shoptet_stock' => $shoptetStock,
                    'elogist_stock' => $elogistValue,
                    'stock_difference' => $difference,
                    'synced_at' => $timestamp,
                    'created_at' => $timestamp,
                    'updated_at' => $timestamp,
                ];

                $processed++;
            }

            if ($payload !== []) {
                $this->upsertSnapshots($payload);
            }

            $lastSyncedAt = $timestamp;
        });

        return [
            'processed' => $processed,
            'shop_id' => $masterShop->id,
            'synced_at' => $lastSyncedAt ? $lastSyncedAt->toIso8601String() : null,
        ];
    }

    private function calculateDifference(?float $shoptetStock, ?float $elogistStock): ?float
    {
        if ($shoptetStock === null || $elogistStock === null) {
            return null;
        }

        return round($shoptetStock - $elogistStock, 4);
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    private function upsertSnapshots(array $rows): void
    {
        InventoryStockGuardSnapshot::query()->upsert(
            $rows,
            ['product_variant_id', 'shop_id'],
            ['variant_code', 'product_id', 'shoptet_stock', 'elogist_stock', 'stock_difference', 'synced_at', 'updated_at']
        );
    }

    private function resolveMasterShop(): ?Shop
    {
        return Shop::query()
            ->where('is_master', true)
            ->orderByDesc('id')
            ->first();
    }

    private function refreshMasterStockData(Collection $variants, Shop $masterShop): void
    {
        $products = $variants
            ->pluck('product')
            ->filter()
            ->unique('id');

        foreach ($products as $product) {
            $remoteGuid = $product->external_guid
                ?? optional($product->remoteRefs->firstWhere('shop_id', $masterShop->id))->remote_guid;

            if (! $remoteGuid) {
                continue;
            }

            try {
                $response = $this->shoptetClient->getProduct($masterShop, $remoteGuid, [
                    'include' => ProductSnapshotImporter::FULL_PRODUCT_INCLUDE,
                ]);
            } catch (\Throwable $throwable) {
                Log::warning('Failed to refresh Shoptet product for stock guard sync.', [
                    'product_id' => $product->id,
                    'shop_id' => $masterShop->id,
                    'error' => $throwable->getMessage(),
                ]);

                continue;
            }

            $payload = Arr::get($response, 'data.product')
                ?? Arr::get($response, 'product')
                ?? Arr::get($response, 'data', []);

            if (! is_array($payload) || $payload === []) {
                Log::warning('Empty payload received while refreshing Shoptet product for stock guard sync.', [
                    'product_id' => $product->id,
                    'shop_id' => $masterShop->id,
                    'response' => $response,
                ]);

                continue;
            }

            try {
                $this->snapshotImporter->import($payload, $masterShop);
            } catch (\Throwable $throwable) {
                Log::error('Failed to import Shoptet payload during stock guard sync.', [
                    'product_id' => $product->id,
                    'shop_id' => $masterShop->id,
                    'error' => $throwable->getMessage(),
                ]);
            }
        }
    }

    private function reloadVariantStockValues(Collection $variants, Shop $masterShop): void
    {
        $ids = $variants->pluck('id')->filter()->unique()->all();

        if ($ids === []) {
            return;
        }

        $fresh = ProductVariant::query()
            ->select([
                'product_variants.id',
                'product_variants.stock as canonical_stock',
                'product_variant_shop_overlays.stock as overlay_stock',
            ])
            ->leftJoin('product_variant_shop_overlays', function (JoinClause $join) use ($masterShop) {
                $join->on('product_variant_shop_overlays.product_variant_id', '=', 'product_variants.id')
                    ->where('product_variant_shop_overlays.shop_id', '=', $masterShop->id);
            })
            ->whereIn('product_variants.id', $ids)
            ->get()
            ->keyBy('id');

        foreach ($variants as $variant) {
            $updated = $fresh->get($variant->id);

            if (! $updated) {
                continue;
            }

            $variant->canonical_stock = $updated->canonical_stock;
            $variant->overlay_stock = $updated->overlay_stock;
        }
    }
}
