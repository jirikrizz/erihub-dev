<?php

use Illuminate\Support\Facades\Route;
use Modules\Shoptet\Http\Controllers\ShopController;
use Modules\Shoptet\Http\Controllers\OrderSyncController;
use Modules\Shoptet\Http\Controllers\ProductSyncController;
use Modules\Shoptet\Http\Controllers\SnapshotController;
use Modules\Shoptet\Http\Controllers\SnapshotExecutionController;
use Modules\Shoptet\Http\Controllers\WebhookJobController;

Route::get('shops', [ShopController::class, 'index']);
Route::post('shops', [ShopController::class, 'store']);
Route::get('shops/{shop}', [ShopController::class, 'show']);
Route::put('shops/{shop}', [ShopController::class, 'update']);
Route::delete('shops/{shop}', [ShopController::class, 'destroy']);
Route::get('shops/{shop}/webhook-jobs', [WebhookJobController::class, 'index']);
Route::post('shops/{shop}/webhook-jobs/{webhookJob}/download', [WebhookJobController::class, 'download']);
Route::post('shops/{shop}/refresh-token', [ShopController::class, 'refreshToken']);
Route::get('shops/{shop}/pipelines', [SnapshotExecutionController::class, 'index']);
Route::get('shops/{shop}/webhooks/job-finished', [ShopController::class, 'webhookStatus']);
Route::post('shops/{shop}/webhooks/job-finished', [ShopController::class, 'registerWebhook']);

Route::post('shops/{shop}/sync/products', [ProductSyncController::class, 'import']);
Route::post('shops/{shop}/sync/products/bootstrap', [ProductSyncController::class, 'bootstrap']);
Route::post('shops/{shop}/sync/products/{productTranslation}/push', [ProductSyncController::class, 'push']);
Route::post('shops/{shop}/sync/orders', [OrderSyncController::class, 'import']);

Route::post('shops/{shop}/snapshots/products', [SnapshotController::class, 'products']);
Route::post('shops/{shop}/snapshots/orders', [SnapshotController::class, 'orders']);
Route::post('shops/{shop}/snapshots/customers', [SnapshotController::class, 'customers']);
