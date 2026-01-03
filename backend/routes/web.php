<?php

use Illuminate\Support\Facades\Route;
use Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController;
use Modules\Inventory\Http\Controllers\PublicRecommendationsController;

Route::get('/', function () {
    return view('welcome');
});

// Public widget and recommendation endpoints
// Register routes without web middleware to avoid auth redirect
Route::get('/api/widgets/inventory/recommendations.js', [InventoryRecommendationWidgetController::class, 'script'])->withoutMiddleware('web');
Route::get('/api/inventory/recommendations/products', [PublicRecommendationsController::class, 'products'])->withoutMiddleware('web');