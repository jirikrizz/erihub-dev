<?php

use Illuminate\Support\Facades\Route;
use Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController;
use Modules\Inventory\Http\Controllers\PublicRecommendationsController;

// Public APIs for Shoptet plugin - registered with /api prefix by RouteServiceProvider
Route::middleware('api')->withoutMiddleware(['auth:sanctum', 'permission:section.inventory'])->group(function () {
    // Widget endpoint: /api/widgets/inventory/recommendations.js
    Route::get('widgets/inventory/recommendations.js', [InventoryRecommendationWidgetController::class, 'script']);
    
    // Recommendations products API: /api/inventory/recommendations/products
    Route::prefix('inventory')->group(function () {
        Route::get('recommendations/products', [PublicRecommendationsController::class, 'products']);
    });
});
