<?php

use Illuminate\Support\Facades\Route;
use Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController;
use Modules\Inventory\Http\Controllers\PublicRecommendationsController;

Route::get('inventory/widgets/recommendations.js', [InventoryRecommendationWidgetController::class, 'script']);
Route::get('widgets/inventory/recommendations.js', [InventoryRecommendationWidgetController::class, 'script']);

// Public API endpoints for Shoptet plugin integration
Route::prefix('api/inventory')->group(function () {
    Route::get('recommendations/products', [PublicRecommendationsController::class, 'products']);
});
