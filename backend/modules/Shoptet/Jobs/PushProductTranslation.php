<?php

namespace Modules\Shoptet\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Arr;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ProductVariant;
use Modules\Pim\Models\ProductShopOverlay;
use Modules\Pim\Models\ProductTranslation;
use Modules\Shoptet\Contracts\ShoptetClient;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Services\ProductPublicationBuilder;

class PushProductTranslation implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(private readonly ProductTranslation $translation)
    {
    }

    public function handle(ShoptetClient $client, ProductPublicationBuilder $payloadBuilder): void
    {
        $translation = $this->translation->fresh(['product', 'shop']);

        if (! $translation || ! $translation->product) {
            Log::warning('Skipping push, translation missing product context.', [
                'translation_id' => $this->translation->getKey(),
            ]);

            return;
        }

        $targetShop = $translation->shop ?? $translation->product->shop;

        if (! $targetShop) {
            Log::warning('Skipping push, target shop not resolved.', [
                'translation_id' => $this->translation->getKey(),
            ]);

            return;
        }

        $product = $translation->product;
        $product->loadMissing([
            'shop',
            'remoteRefs',
            'overlays',
            'variants.overlays',
            'variants.translations',
            'variants.remoteRefs',
        ]);

        $remoteRef = $product->remoteRefs
            ? $product->remoteRefs->firstWhere('shop_id', $targetShop->id)
            : null;

        $remoteGuid = $remoteRef?->remote_guid;
        $needsCreate = false;

        if (! $remoteGuid) {
            if ($product->shop_id === $targetShop->id && $product->external_guid) {
                $remoteGuid = $product->external_guid;
            } else {
                $needsCreate = true;
            }
        }

        if ($needsCreate) {
            try {
                $createPayload = $payloadBuilder->buildCreatePayload($product, $translation, $targetShop);
            } catch (\Throwable $throwable) {
                Log::error('Unable to build Shoptet create payload.', [
                    'translation_id' => $translation->getKey(),
                    'shop_id' => $targetShop->id,
                    'message' => $throwable->getMessage(),
                ]);

                throw $throwable;
            }

            $response = $client->createProduct($targetShop, $createPayload['data']);
            $createdProduct = Arr::get($response, 'data.product');
            $remoteGuid = Arr::get($createdProduct, 'guid');

            if (! is_string($remoteGuid) || $remoteGuid === '') {
                Log::error('Shoptet create product response missing guid.', [
                    'translation_id' => $translation->getKey(),
                    'shop_id' => $targetShop->id,
                    'response' => $response,
                ]);

                throw new \RuntimeException('Shoptet create product response missing guid.');
            }

            $product->remoteRefs()->updateOrCreate(
                ['shop_id' => $targetShop->id],
                [
                    'remote_guid' => $remoteGuid,
                    'remote_external_id' => Arr::get($createdProduct, 'id'),
                ]
            );

            $variantsResponse = Arr::get($createdProduct, 'variants', []);
            if (is_array($variantsResponse)) {
                $variantIndex = $product->variants->keyBy('code');

                foreach ($variantsResponse as $variantPayload) {
                    if (! is_array($variantPayload)) {
                        continue;
                    }

                    $code = $variantPayload['code'] ?? null;
                    if (! is_string($code) || $code === '') {
                        continue;
                    }

                    $variant = $variantIndex->get($code);
                    if (! $variant) {
                        continue;
                    }

                    $variant->remoteRefs()->updateOrCreate(
                        ['shop_id' => $targetShop->id],
                        [
                            'remote_guid' => Arr::get($variantPayload, 'guid'),
                            'remote_code' => $variantPayload['code'] ?? null,
                        ]
                    );
                }
            }

            $imagesPayload = $createPayload['images'] ?? [];
            if (is_array($imagesPayload) && $imagesPayload !== []) {
                try {
                    $imageResponse = $client->createProductImages($targetShop, $remoteGuid, 'shop', $imagesPayload);
                    $jobId = Arr::get($imageResponse, 'data.jobId');

                    if ($jobId) {
                        Log::info('Shoptet product image upload scheduled.', [
                            'translation_id' => $translation->getKey(),
                            'shop_id' => $targetShop->id,
                            'job_id' => $jobId,
                        ]);
                    }
                } catch (\Throwable $throwable) {
                    Log::warning('Failed to enqueue Shoptet image upload.', [
                        'translation_id' => $translation->getKey(),
                        'shop_id' => $targetShop->id,
                        'message' => $throwable->getMessage(),
                    ]);
                }
            }
        }

        $updatePayload = $payloadBuilder->buildUpdatePayload($product, $translation, $targetShop);
        if ($updatePayload !== []) {
            if (! is_string($remoteGuid) || $remoteGuid === '') {
                Log::error('Cannot update Shoptet product – remote GUID unresolved.', [
                    'translation_id' => $translation->getKey(),
                    'shop_id' => $targetShop->id,
                ]);

                throw new \RuntimeException('Remote product GUID not resolved.');
            }

            $client->updateProduct($targetShop, $remoteGuid, $updatePayload);
        }

        $pricelistPayload = $payloadBuilder->buildPricelistUpdatePayload($product, $targetShop);
        if ($pricelistPayload !== []) {
            $pricelistId = $this->resolvePricelistId($targetShop);
            $client->updatePricelist($targetShop, $pricelistId, $pricelistPayload);
        }

        $setItemsPayload = $this->buildProductSetItemsPayload($product);
        if ($setItemsPayload !== null) {
            if (! is_string($remoteGuid) || $remoteGuid === '') {
                Log::error('Cannot set product set items – remote GUID unresolved.', [
                    'translation_id' => $translation->getKey(),
                    'shop_id' => $targetShop->id,
                ]);

                throw new \RuntimeException('Remote product GUID not resolved.');
            }

            $this->ensureOverlayHasSetItems($product, $targetShop, $setItemsPayload);

            try {
                $client->setProductSetItems($targetShop, $remoteGuid, $setItemsPayload);
            } catch (\Throwable $throwable) {
                Log::error('Failed to set Shoptet product set items.', [
                    'translation_id' => $translation->getKey(),
                    'shop_id' => $targetShop->id,
                    'remote_guid' => $remoteGuid,
                    'set_items' => $setItemsPayload,
                    'message' => $throwable->getMessage(),
                ]);

                throw $throwable;
            }
        }

        $translation->status = 'synced';
        $translation->save();
    }

    private function resolvePricelistId(Shop $shop): int|string
    {
        $settings = is_array($shop->settings ?? null) ? $shop->settings : [];

        $candidates = [
            Arr::get($settings, 'shoptet.pricelist_id'),
            Arr::get($settings, 'pricelist_id'),
            Arr::get($settings, 'price_list_id'),
            Arr::get($settings, 'default_pricelist_id'),
            config('shoptet.default_pricelist_id'),
        ];

        foreach ($candidates as $candidate) {
            if ($candidate === null || $candidate === '') {
                continue;
            }

            if (is_numeric($candidate)) {
                return (int) $candidate;
            }

            if (is_string($candidate)) {
                $trimmed = trim($candidate);
                if ($trimmed !== '') {
                    return $trimmed;
                }
            }
        }

        return 1;
    }

    /**
     * @return array<int, array{code: string, amount: string}>|null
     */
    private function buildProductSetItemsPayload(Product $product): ?array
    {
        $basePayload = $product->base_payload ?? [];
        $type = Arr::get($basePayload, 'type');

        if ($type !== 'product-set') {
            return null;
        }

        $items = Arr::get($basePayload, 'setItems');
        if (! is_array($items)) {
            Log::warning('Product-set is missing setItems payload.', [
                'product_id' => $product->getKey(),
                'shop_id' => $product->shop_id,
            ]);

            return null;
        }

        $variantCodeByGuid = $this->buildVariantCodeIndex($product);

        $normalized = [];

        foreach ($items as $item) {
            $code = $item['code'] ?? null;
            if ((! is_string($code) || $code === '') && isset($item['guid'])) {
                $guid = (string) $item['guid'];
                $code = $variantCodeByGuid[$guid] ?? null;
            }

            if (! is_string($code) || $code === '') {
                continue;
            }

            $amount = $item['amount'] ?? 1;
            $normalized[] = [
                'code' => $code,
                'amount' => $this->normalizeSetItemAmount($amount),
            ];
        }

        if ($normalized === []) {
            Log::warning('Product-set setItems cannot be normalised (missing codes).', [
                'product_id' => $product->getKey(),
                'shop_id' => $product->shop_id,
                'raw_items' => $items,
            ]);

            return null;
        }

        return $normalized;
    }

    private function normalizeSetItemAmount(mixed $value): string
    {
        if (is_string($value) && $value !== '') {
            return $value;
        }

        if (is_numeric($value)) {
            return number_format((float) $value, 3, '.', '');
        }

        return '1';
    }

    private function ensureOverlayHasSetItems(Product $product, Shop $shop, array $setItems): void
    {
        /** @var ProductShopOverlay $overlay */
        $overlay = ProductShopOverlay::firstOrNew([
            'product_id' => $product->id,
            'shop_id' => $shop->id,
        ]);

        $data = is_array($overlay->data) ? $overlay->data : [];
        $data['setItems'] = $setItems;
        $overlay->data = $data;
        $overlay->save();
    }

    /**
     * @return array<string, string>
     */
    private function buildVariantCodeIndex(Product $product): array
    {
        $index = [];

        $variants = Arr::get($product->base_payload ?? [], 'variants');
        if (is_array($variants)) {
            foreach ($variants as $variant) {
                if (! is_array($variant)) {
                    continue;
                }
                $guid = $variant['guid'] ?? null;
                $code = $variant['code'] ?? null;
                if (is_string($guid) && $guid !== '' && is_string($code) && $code !== '') {
                    $index[$guid] = $code;
                }
            }
        }

        foreach ($product->variants ?? [] as $variantModel) {
            if (! $variantModel instanceof ProductVariant) {
                continue;
            }
            $data = is_array($variantModel->data) ? $variantModel->data : [];
            $guid = $data['guid'] ?? null;
            $code = $variantModel->code;

            if (is_string($guid) && $guid !== '' && is_string($code) && $code !== '' && ! isset($index[$guid])) {
                $index[$guid] = $code;
            }
        }

        return $index;
    }
}
