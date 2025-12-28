<?php

use Illuminate\Support\Facades\Route;
use Modules\Microsites\Http\Controllers\MicrositeAssetController;
use Modules\Microsites\Http\Controllers\MicrositeController;
use Modules\Microsites\Http\Controllers\MicrositeGenerationController;
use Modules\Microsites\Http\Controllers\MicrositePublicationController;
use Modules\Microsites\Http\Controllers\MicrositeProductController;

Route::post('assets', MicrositeAssetController::class);
Route::post('generate', MicrositeGenerationController::class);

Route::get('/', [MicrositeController::class, 'index']);
Route::post('/', [MicrositeController::class, 'store']);
Route::get('products/preview', MicrositeProductController::class);
Route::get('{microsite}', [MicrositeController::class, 'show']);
Route::put('{microsite}', [MicrositeController::class, 'update']);
Route::delete('{microsite}', [MicrositeController::class, 'destroy']);

Route::post('{microsite}/publish', [MicrositePublicationController::class, 'publish']);
Route::post('{microsite}/unpublish', [MicrositePublicationController::class, 'unpublish']);
Route::post('{microsite}/export', [MicrositePublicationController::class, 'export']);
