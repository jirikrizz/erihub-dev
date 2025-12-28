<?php

use Illuminate\Support\Facades\Route;
use Modules\Analytics\Http\Controllers\AnalyticsController;

Route::get('kpis', [AnalyticsController::class, 'kpis']);
Route::get('orders', [AnalyticsController::class, 'orders']);
Route::get('locations', [AnalyticsController::class, 'locations']);
Route::get('products', [AnalyticsController::class, 'products']);
