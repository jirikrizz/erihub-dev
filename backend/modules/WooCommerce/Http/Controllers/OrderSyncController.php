<?php

namespace Modules\WooCommerce\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Shoptet\Models\Shop;
use Modules\WooCommerce\Services\OrderSyncService;

class OrderSyncController extends Controller
{
    public function __construct(private readonly OrderSyncService $orderSyncService)
    {
    }

    public function import(Request $request, Shop $woocommerceShop)
    {
        $data = $request->validate([
            'after' => ['nullable', 'string'],
            'before' => ['nullable', 'string'],
            'status' => ['nullable', 'array'],
            'status.*' => ['string'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $result = $this->orderSyncService->sync($woocommerceShop, $data);

        return response()->json([
            'message' => 'WooCommerce orders synchronized.',
            'meta' => $result,
        ]);
    }
}
