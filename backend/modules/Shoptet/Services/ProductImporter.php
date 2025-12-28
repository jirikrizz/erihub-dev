<?php

namespace Modules\Shoptet\Services;

use Illuminate\Support\Arr;
use Modules\Pim\Models\Product;
use Modules\Shoptet\Contracts\ShoptetClient;
use Modules\Shoptet\Models\Shop;

class ProductImporter
{
    public function __construct(private readonly ShoptetClient $client)
    {
    }

    public function import(Shop $shop, array $query = []): array
    {
        $result = $this->client->listProducts($shop, $query);
        $products = Arr::get($result, 'products', []);

        $imported = collect($products)->map(function (array $payload) use ($shop) {
            return $this->upsertProduct($shop, $payload);
        });

        return [
            'count' => $imported->count(),
            'paginator' => Arr::get($result, 'paginator'),
        ];
    }

    private function upsertProduct(Shop $shop, array $payload): Product
    {
        $product = Product::updateOrCreate(
            [
                'shop_id' => $shop->id,
                'external_guid' => $payload['guid'],
            ],
            [
                'sku' => $payload['code'] ?? null,
                'status' => $payload['visibility'] ?? 'active',
                'base_payload' => $payload,
            ]
        );

        $product->translations()->firstOrCreate(
            ['locale' => $shop->default_locale],
            [
                'status' => 'synced',
                'name' => $payload['name'] ?? null,
                'description' => Arr::get($payload, 'description'),
                'short_description' => Arr::get($payload, 'shortDescription'),
            ]
        );

        return $product;
    }
}
