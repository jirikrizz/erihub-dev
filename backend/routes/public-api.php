<?php

use Illuminate\Support\Facades\Route;
use Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController;
use Modules\Inventory\Http\Controllers\PublicRecommendationsController;

// Public endpoints - NO middleware at all
Route::get('/api/widgets/inventory/recommendations.js', [InventoryRecommendationWidgetController::class, 'script']);
Route::get('/api/inventory/recommendations/products', [PublicRecommendationsController::class, 'products']);
