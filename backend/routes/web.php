<?php

use Illuminate\Support\Facades\Route;
use Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController;

Route::get('/', function () {
    return view('welcome');
});

// Public widget endpoints
Route::get('/api/widgets/inventory/recommendations.js', [InventoryRecommendationWidgetController::class, 'script']);
