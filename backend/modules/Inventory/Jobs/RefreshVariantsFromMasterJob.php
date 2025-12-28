<?php

namespace Modules\Inventory\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Modules\Pim\Models\ProductVariant;
use Modules\Pim\Services\ProductSnapshotImporter;
use Modules\Shoptet\Contracts\ShoptetClient;

class RefreshVariantsFromMasterJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    /**
     * @param array<int, string> $variantIds
     */
    public function __construct(private readonly array $variantIds)
    {
        $this->queue = 'snapshots';
    }

    public function handle(ShoptetClient $shoptetClient, ProductSnapshotImporter $importer): void
    {
        $ids = array_values(array_unique(array_filter($this->variantIds, static fn ($value) => is_string($value) && $value !== '')));

        if ($ids === []) {
            return;
        }

        $variants = ProductVariant::query()
            ->with(['product.shop', 'product.remoteRefs'])
            ->whereIn('id', $ids)
            ->get();

        if ($variants->isEmpty()) {
            return;
        }

        $updatedVariantIds = [];

        foreach ($variants as $variant) {
            $product = $variant->product;
            $shop = $product?->shop;

            if (! $product || ! $shop || ! $shop->is_master) {
                continue;
            }

            $remoteGuid = optional($product->remoteRefs->firstWhere('shop_id', $shop->id))->remote_guid
                ?? $product->external_guid;

            if (! is_string($remoteGuid) || trim($remoteGuid) === '') {
                continue;
            }

            try {
                $response = $shoptetClient->getProduct($shop, $remoteGuid, [
                    'include' => ProductSnapshotImporter::FULL_PRODUCT_INCLUDE,
                ]);
            } catch (\Throwable $throwable) {
                Log::warning('Failed to fetch product from Shoptet during variant refresh.', [
                    'variant_id' => $variant->id,
                    'product_id' => $product->id,
                    'shop_id' => $shop->id,
                    'error' => $throwable->getMessage(),
                ]);

                continue;
            }

            $payload = Arr::get($response, 'data.product');
            if (! is_array($payload) || $payload === []) {
                $payload = Arr::get($response, 'product', []);
            }
            if (! is_array($payload) || $payload === []) {
                $payload = Arr::get($response, 'data', []);
            }

            if (! is_array($payload) || $payload === []) {
                Log::warning('Shoptet returned empty product payload during variant refresh.', [
                    'variant_id' => $variant->id,
                    'product_id' => $product->id,
                    'shop_id' => $shop->id,
                    'response' => $response,
                ]);

                continue;
            }

            try {
                $importer->import($payload, $shop);
                $updatedVariantIds[] = $variant->id;
            } catch (\Throwable $throwable) {
                Log::error('Failed to import product snapshot during variant refresh.', [
                    'variant_id' => $variant->id,
                    'product_id' => $product->id,
                    'shop_id' => $shop->id,
                    'error' => $throwable->getMessage(),
                ]);
            }
        }

        if ($updatedVariantIds !== []) {
            foreach (array_chunk($updatedVariantIds, 50) as $chunk) {
                if ($chunk === []) {
                    continue;
                }

                RecalculateInventoryVariantMetricsJob::dispatch($chunk);
            }
        }
    }
}
