<?php

use Illuminate\Support\Facades\Route;
use Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController;
use Modules\Inventory\Http\Controllers\PublicRecommendationsController;

// DEBUG: Test route
Route::get('test-widget', function() { return "Widget route works!"; });

// Public APIs for Shoptet plugin - registered with /api prefix by RouteServiceProvider
// Widget endpoint: /api/widgets/inventory/recommendations.js
Route::middleware('api')->withoutMiddleware(['auth:sanctum', 'permission:section.inventory'])->group(function () {
    Route::get('widgets/inventory/recommendations.js', [InventoryRecommendationWidgetController::class, 'script']);
});

// Recommendations products API: /api/inventory/recommendations/products
Route::middleware('api')->withoutMiddleware(['auth:sanctum', 'permission:section.inventory'])->group(function () {
    Route::prefix('inventory')->group(function () {
        Route::get('recommendations/products', [PublicRecommendationsController::class, 'products']);
    });
});
