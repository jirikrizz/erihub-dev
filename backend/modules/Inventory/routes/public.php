<?php

use Illuminate\Support\Facades\Route;
use Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController;

Route::get('inventory/widgets/recommendations.js', [InventoryRecommendationWidgetController::class, 'script']);
Route::get('widgets/inventory/recommendations.js', [InventoryRecommendationWidgetController::class, 'script']);
