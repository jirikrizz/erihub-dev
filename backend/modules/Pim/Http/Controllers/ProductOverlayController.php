<?php

namespace Modules\Pim\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ProductShopOverlay;
use Modules\Pim\Models\ProductVariant;
use Modules\Pim\Models\ProductVariantShopOverlay;
use Modules\Shoptet\Models\Shop;

class ProductOverlayController extends Controller
{
    public function update(Product $product, Shop $shop, Request $request)
    {
        $data = $request->validate([
            'status' => ['nullable', 'string', 'max:255'],
            'currency_code' => ['nullable', 'string', 'max:8'],
            'data' => ['nullable', 'array'],
        ]);

        /** @var ProductShopOverlay $overlay */
        $overlay = ProductShopOverlay::firstOrNew([
            'product_id' => $product->id,
            'shop_id' => $shop->id,
        ]);

        if (array_key_exists('status', $data)) {
            $overlay->status = $data['status'];
        }

        if (array_key_exists('currency_code', $data)) {
            $overlay->currency_code = $data['currency_code'];
        }

        if (array_key_exists('data', $data)) {
            $overlay->data = $data['data'];
        }

        $overlay->save();

        return response()->json($overlay->fresh('shop'));
    }

    public function updateVariant(Product $product, ProductVariant $variant, Shop $shop, Request $request)
    {
        abort_unless($variant->product_id === $product->id, 404);

        $payload = $request->validate([
            'price' => ['nullable', 'numeric'],
            'purchase_price' => ['nullable', 'numeric'],
            'vat_rate' => ['nullable', 'numeric'],
            'stock' => ['nullable', 'numeric'],
            'min_stock_supply' => ['nullable', 'numeric'],
            'currency_code' => ['nullable', 'string', 'max:8'],
            'unit' => ['nullable', 'string', 'max:255'],
            'data' => ['nullable', 'array'],
        ]);

        /** @var ProductVariantShopOverlay $overlay */
        $overlay = ProductVariantShopOverlay::firstOrNew([
            'product_variant_id' => $variant->id,
            'shop_id' => $shop->id,
        ]);

        foreach (['price', 'purchase_price', 'vat_rate', 'stock', 'min_stock_supply'] as $field) {
            if (array_key_exists($field, $payload)) {
                $overlay->{$field} = $payload[$field];
            }
        }

        if (array_key_exists('currency_code', $payload)) {
            $overlay->currency_code = $payload['currency_code'];
        }

        if (array_key_exists('unit', $payload)) {
            $overlay->unit = $payload['unit'];
        }

        if (array_key_exists('data', $payload)) {
            $overlay->data = $payload['data'];
        }

        $overlay->save();

        return response()->json($overlay->fresh('shop'));
    }
}
