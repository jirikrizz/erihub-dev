<?php

use Illuminate\Support\Facades\Route;
use Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController;
use Modules\Inventory\Http\Controllers\PublicRecommendationsController;

Route::get('/', function () {
    return view('welcome');
});

// Public widget and recommendation endpoints - explicitly allow unauthenticated access
Route::middleware('api')->withoutMiddleware(['web'])->group(function () {
    Route::get('/api/widgets/inventory/recommendations.js', [InventoryRecommendationWidgetController::class, 'script']);
    Route::get('/api/inventory/recommendations/products', [PublicRecommendationsController::class, 'products']);});