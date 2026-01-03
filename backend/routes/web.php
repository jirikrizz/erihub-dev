<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// Public widget recommendation API - NO middleware
Route::middleware([])->group(function () {
    Route::get('/api/inventory/recommendations/products', 
        [\Modules\Inventory\Http\Controllers\PublicRecommendationsController::class, 'products']);
});
