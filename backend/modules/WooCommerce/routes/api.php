<?php

use Illuminate\Support\Facades\Route;
use Modules\WooCommerce\Http\Controllers\OrderSyncController;
use Modules\WooCommerce\Http\Controllers\ShopController;

Route::get('shops', [ShopController::class, 'index']);
Route::post('shops', [ShopController::class, 'store']);
Route::get('shops/{woocommerceShop}', [ShopController::class, 'show']);
Route::put('shops/{woocommerceShop}', [ShopController::class, 'update']);
Route::delete('shops/{woocommerceShop}', [ShopController::class, 'destroy']);

Route::post('shops/{woocommerceShop}/sync/orders', [OrderSyncController::class, 'import']);
