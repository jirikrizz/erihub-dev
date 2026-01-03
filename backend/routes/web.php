<?php

use Illuminate\Support\Facades\Route;
use Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController;

Route::get('/', function () {
    return view('welcome');
});

// Test route
Route::get('/test-global', function () {
    return "Global test works!";
});

