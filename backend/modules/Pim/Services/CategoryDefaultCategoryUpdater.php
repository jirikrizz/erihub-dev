<?php

namespace Modules\Pim\Services;

use Illuminate\Support\Arr;
use Illuminate\Http\Client\RequestException;
use Modules\Pim\Models\CategoryNode;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ProductRemoteRef;
use Modules\Pim\Models\ProductShopOverlay;
use Modules\Pim\Models\ShopCategoryNode;
use Modules\Shoptet\Contracts\ShoptetClient;
use Modules\Shoptet\Models\Shop;
use RuntimeException;
use Throwable;

class CategoryDefaultCategoryUpdater
{
    public function __construct(private readonly ShoptetClient $shoptetClient)
    {
    }

    public function applyToMaster(Product $product, CategoryNode $category, bool $syncToShoptet = false): void
    {
        if ($product->shop_id !== $category->shop_id) {
            throw new \InvalidArgumentException('Kategorie nepatří do stejného master shopu jako produkt.');
        }

        $payload = $product->base_payload ?? [];

        $payload['defaultCategory'] = [
            'guid' => $category->guid,
            'name' => $category->name,
            'path' => $this->buildCanonicalPath($category),
        ];

        if ($syncToShoptet) {
            $shop = $this->resolveProductShop($product);
            $this->pushDefaultCategory($shop, $product, $this->ensureGuid($category->guid, 'Master kategorie nemá přiřazené GUID.'));
        }

        $product->base_payload = $payload;
        $product->save();
    }

    public function clearMaster(Product $product, bool $syncToShoptet = false): void
    {
        $payload = $product->base_payload ?? [];
        unset($payload['defaultCategory']);

        if ($syncToShoptet) {
            $shop = $this->resolveProductShop($product);
            $this->pushDefaultCategory($shop, $product, null);
        }

        $product->base_payload = $payload;
        $product->save();
    }

    public function applyToShop(Product $product, Shop $shop, ShopCategoryNode $category, bool $syncToShoptet = false): void
    {
        if ($category->shop_id !== $shop->id) {
            throw new \InvalidArgumentException('Kategorie nepatří do vybraného shopu.');
        }

        $overlay = ProductShopOverlay::firstOrNew([
            'product_id' => $product->id,
            'shop_id' => $shop->id,
        ]);

        $data = is_array($overlay->data) ? $overlay->data : [];

        $data['defaultCategory'] = [
            'guid' => $category->remote_guid,
            'name' => $category->name,
            'path' => $category->path ?? $this->buildShopPath($category),
        ];

        if ($syncToShoptet) {
            $this->pushDefaultCategory(
                $shop,
                $product,
                $this->ensureGuid($category->remote_guid, 'Kategorie nemá přiřazené Shoptet GUID.')
            );
        }

        $overlay->data = $data;
        $overlay->save();
    }

    public function clearShop(Product $product, Shop $shop, bool $syncToShoptet = false): void
    {
        $overlay = ProductShopOverlay::firstOrNew([
            'product_id' => $product->id,
            'shop_id' => $shop->id,
        ]);

        $data = is_array($overlay->data) ? $overlay->data : [];
        unset($data['defaultCategory']);

        if ($syncToShoptet) {
            $this->pushDefaultCategory($shop, $product, null);
        }

        $overlay->data = $data;
        $overlay->save();
    }

    private function buildCanonicalPath(CategoryNode $node): ?string
    {
        $segments = [];
        $current = $node;
        $guard = 0;

        while ($current && $guard < 50) {
            $segments[] = $current->name;
            $current->loadMissing('parent');
            $current = $current->parent;
            $guard++;
        }

        $segments = array_filter(array_reverse($segments));

        return $segments === [] ? null : implode(' > ', $segments);
    }

    private function buildShopPath(ShopCategoryNode $node): ?string
    {
        if ($node->path) {
            return $node->path;
        }

        $segments = [];
        $current = $node;
        $guard = 0;

        while ($current && $guard < 50) {
            $segments[] = $current->name;
            $current->loadMissing('parent');
            $current = $current->parent;
            $guard++;
        }

        $segments = array_filter(array_reverse($segments));

        return $segments === [] ? null : implode(' > ', $segments);
    }

    private function pushDefaultCategory(Shop $shop, Product $product, ?string $categoryGuid): void
    {
        $productGuid = $this->resolveProductGuid($product, $shop);

        $payload = $this->buildDefaultCategoryPayload($shop, $productGuid, $categoryGuid);

        try {
            $this->shoptetClient->updateProduct($shop, $productGuid, $payload);
        } catch (RequestException $exception) {
            $response = $exception->response;
            $message = null;

            if ($response) {
                $json = $response->json();
                if (is_array($json)) {
                    $message = $json['message'] ?? null;
                    if (! $message && isset($json['error']) && is_array($json['error'])) {
                        $message = $json['error']['message'] ?? null;
                    }

                    if (! $message && isset($json['errors']) && is_array($json['errors'])) {
                        $first = collect($json['errors'])->flatten()->filter()->first();
                        if (is_string($first)) {
                            $message = $first;
                        }
                    }
                }
            }

            $fallback = 'Nepodařilo se odeslat výchozí kategorii do Shoptetu.';
            throw new RuntimeException($message ?: $fallback, 0, $exception);
        } catch (Throwable $throwable) {
            throw new RuntimeException('Nepodařilo se odeslat výchozí kategorii do Shoptetu.', 0, $throwable);
        }
    }

    private function buildDefaultCategoryPayload(Shop $shop, string $productGuid, ?string $categoryGuid): array
    {
        if (! $categoryGuid) {
            return ['defaultCategoryGuid' => null];
        }

        try {
            $productData = $this->shoptetClient->getProduct($shop, $productGuid, ['include' => 'allCategories']);
        } catch (Throwable $throwable) {
            throw new RuntimeException('Nepodařilo se načíst kategorie produktu ze Shoptetu.', 0, $throwable);
        }

        $existingCategories = collect(Arr::get($productData, 'categories', []))
            ->map(function ($item) {
                if (is_array($item) && isset($item['guid']) && is_string($item['guid'])) {
                    return $item['guid'];
                }

                if (is_string($item)) {
                    return $item;
                }

                return null;
            })
            ->filter()
            ->unique()
            ->values()
            ->all();

        if (! in_array($categoryGuid, $existingCategories, true)) {
            $existingCategories[] = $categoryGuid;
        }

        $categoriesPayload = array_map(static fn (string $guid) => ['guid' => $guid], $existingCategories);

        $payload = [
            'defaultCategoryGuid' => $categoryGuid,
            'categoryGuids' => array_map(static fn (string $guid) => $guid, $existingCategories),
        ];

        return $payload;
    }

    public function describeSyncContext(Product $product, ?Shop $shop, ?string $categoryGuid): array
    {
        $product->loadMissing(['remoteRefs', 'overlays', 'shop']);

        $remoteRef = $shop
            ? $product->remoteRefs->firstWhere('shop_id', $shop->id)
            : null;

        $overlay = $shop
            ? $product->overlays->firstWhere('shop_id', $shop->id)
            : null;

        $overlayDefault = $overlay && is_array($overlay->data)
            ? Arr::get($overlay->data, 'defaultCategory')
            : null;

        $baseDefault = Arr::get($product->base_payload ?? [], 'defaultCategory');

        $payloadPreview = ['defaultCategoryGuid' => $categoryGuid];

        $shopPayloadCategories = null;
        $errors = [];

        if ($shop) {
            try {
                $productGuid = $this->resolveProductGuid($product, $shop);
                $productData = $this->shoptetClient->getProduct($shop, $productGuid, ['include' => 'allCategories']);
                $shopPayloadCategories = collect(Arr::get($productData, 'categories', []))
                    ->map(function ($item) {
                        if (is_array($item) && isset($item['guid']) && is_string($item['guid'])) {
                            return $item['guid'];
                        }

                        if (is_string($item)) {
                            return $item;
                        }

                        return null;
                    })
                    ->filter()
                    ->unique()
                    ->values()
                    ->all();

                if ($categoryGuid) {
                    $categoriesForPayload = $shopPayloadCategories ?? [];

                    if (! in_array($categoryGuid, $categoriesForPayload, true)) {
                        $categoriesForPayload[] = $categoryGuid;
                    }

                    $payloadPreview = [
                        'defaultCategoryGuid' => $categoryGuid,
                        'categoryGuids' => $categoriesForPayload,
                    ];
                }
            } catch (Throwable $throwable) {
                $errors[] = 'Nepodařilo se načíst kategorie produktu ze Shoptetu: ' . $throwable->getMessage();
            }
        }

        if (! $product->external_guid && (! $remoteRef || ! $remoteRef->remote_guid)) {
            $errors[] = 'Produkt nemá uložené Shoptet GUID.';
        }

        if ($shop && (! $remoteRef || ! $remoteRef->remote_guid)) {
            $errors[] = sprintf('Produkt nemá remote GUID pro shop #%d.', $shop->id);
        }

        if ($shop && ! $categoryGuid) {
            $errors[] = 'Kategorie nemá Shoptet GUID.';
        }

        return [
            'product' => [
                'id' => $product->id,
                'sku' => $product->sku,
                'external_guid' => $product->external_guid,
            ],
            'shop' => $shop ? [
                'id' => $shop->id,
                'name' => $shop->name,
                'is_master' => $shop->is_master,
            ] : null,
            'resolved_remote_guid' => $remoteRef?->remote_guid,
            'category_guid' => $categoryGuid,
            'payload_preview' => $payloadPreview,
            'product_base_payload_default_category' => $baseDefault,
            'shop_overlay_default_category' => $overlayDefault,
            'shoptet_assigned_categories' => $shopPayloadCategories,
            'notes' => $errors,
        ];
    }

    private function resolveProductGuid(Product $product, Shop $shop): string
    {
        $product->loadMissing(['remoteRefs', 'shop']);

        if ($shop->is_master && $product->external_guid) {
            return (string) $product->external_guid;
        }

        /** @var ProductRemoteRef|null $remoteRef */
        $remoteRef = $product->remoteRefs
            ->firstWhere('shop_id', $shop->id);

        if ($remoteRef && $remoteRef->remote_guid) {
            return (string) $remoteRef->remote_guid;
        }

        if ($shop->is_master && $product->external_guid) {
            return (string) $product->external_guid;
        }

        throw new RuntimeException('Produkt nemá přiřazené Shoptet GUID pro vybraný shop.');
    }

    private function resolveProductShop(Product $product): Shop
    {
        $product->loadMissing('shop');

        if (! $product->shop) {
            throw new RuntimeException('Produkt není přiřazen k žádnému shopu.');
        }

        return $product->shop;
    }

    private function ensureGuid(?string $guid, string $message): string
    {
        if (! $guid) {
            throw new RuntimeException($message);
        }

        return (string) $guid;
    }
}
