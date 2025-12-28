<?php

use Illuminate\Support\Facades\Route;
use Modules\Orders\Http\Controllers\OrderController;

Route::get('/', [OrderController::class, 'index']);
Route::get('filters', [OrderController::class, 'filters']);
Route::get('{order}', [OrderController::class, 'show']);
