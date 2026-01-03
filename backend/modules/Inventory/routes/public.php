<?php

use Illuminate\Support\Facades\Route;
use Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController;
use Modules\Inventory\Http\Controllers\PublicRecommendationsController;

Route::get('inventory/widgets/recommendations.js', [InventoryRecommendationWidgetController::class, 'script']);
Route::get('widgets/inventory/recommendations.js', [InventoryRecommendationWidgetController::class, 'script']);

// Public API endpoints for Shoptet plugin integration (already prefixed with /api by RouteServiceProvider)
Route::prefix('widgets')->withoutMiddleware(['auth:sanctum', 'permission:section.inventory'])->group(function () {
    Route::get('inventory/recommendations.js', [InventoryRecommendationWidgetController::class, 'script']);
});

Route::prefix('inventory')->withoutMiddleware(['auth:sanctum', 'permission:section.inventory'])->group(function () {
    Route::get('recommendations/products', [PublicRecommendationsController::class, 'products']);
});
