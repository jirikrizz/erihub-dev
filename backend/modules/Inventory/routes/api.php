<?php

use Illuminate\Support\Facades\Route;
use Modules\Inventory\Http\Controllers\InventoryDashboardController;
use Modules\Inventory\Http\Controllers\InventoryStockGuardController;
use Modules\Inventory\Http\Controllers\PurchaseOrderController;
use Modules\Inventory\Http\Controllers\VariantNoteController;
use Modules\Inventory\Http\Controllers\VariantTagController;
use Modules\Inventory\Http\Controllers\VariantTagAssignmentController;

Route::get('overview', [InventoryDashboardController::class, 'overview']);
Route::get('variants/filters', [InventoryDashboardController::class, 'filters']);
Route::get('variants', [InventoryDashboardController::class, 'variants'])->name('inventory.variants');
Route::get('variants/export', [InventoryDashboardController::class, 'export']);
Route::post('variants/export', [InventoryDashboardController::class, 'export']);
Route::post('variants/forecast/batch', [InventoryDashboardController::class, 'bulkForecast']);
Route::get('variants/{variant}', [InventoryDashboardController::class, 'show']);
Route::get('variants/{variant}/recommendations', [InventoryDashboardController::class, 'recommendations']);
Route::post('variants/{variant}/metrics/refresh', [InventoryDashboardController::class, 'refreshMetrics']);
Route::post('variants/{variant}/stock/refresh', [InventoryDashboardController::class, 'refreshStock']);
Route::post('variants/{variant}/forecast', [InventoryDashboardController::class, 'forecast']);
Route::get('low-stock', [InventoryDashboardController::class, 'variants'])->name('inventory.low-stock');
Route::get('stock-guard', [InventoryStockGuardController::class, 'index']);
Route::get('stock-guard/export', [InventoryStockGuardController::class, 'export']);
Route::post('stock-guard/sync', [InventoryStockGuardController::class, 'syncSelected']);

Route::get('variants/{variant}/notes', [VariantNoteController::class, 'index']);
Route::post('variants/{variant}/notes', [VariantNoteController::class, 'store']);
Route::put('notes/{note}', [VariantNoteController::class, 'update']);
Route::delete('notes/{note}', [VariantNoteController::class, 'destroy']);

Route::get('tags', [VariantTagController::class, 'index']);
Route::post('tags', [VariantTagController::class, 'store']);
Route::put('tags/{tag}', [VariantTagController::class, 'update']);
Route::delete('tags/{tag}', [VariantTagController::class, 'destroy']);

Route::post('variants/{variant}/tags', [VariantTagAssignmentController::class, 'sync']);

Route::get('orders', [PurchaseOrderController::class, 'index']);
Route::post('orders', [PurchaseOrderController::class, 'store']);
Route::delete('orders/{order}', [PurchaseOrderController::class, 'destroy']);
