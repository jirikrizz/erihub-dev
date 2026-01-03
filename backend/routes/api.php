<?php

use Illuminate\Support\Facades\Route;
use Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController;
use Modules\Inventory\Http\Controllers\PublicRecommendationsController;

// Public widget endpoints - NO authentication required
Route::get('/widgets/inventory/recommendations.js', [InventoryRecommendationWidgetController::class, 'script']);
Route::get('/inventory/recommendations/products', [PublicRecommendationsController::class, 'products']);
