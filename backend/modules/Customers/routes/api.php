<?php

use Illuminate\Support\Facades\Route;
use Modules\Customers\Http\Controllers\CustomerController;
use Modules\Customers\Http\Controllers\CustomerTagController;
use Modules\Customers\Http\Controllers\CustomerTagRuleController;

Route::get('/', [CustomerController::class, 'index']);
Route::get('vip', [CustomerController::class, 'vip']);
Route::get('export', [CustomerController::class, 'export']);
Route::get('tags', [CustomerTagController::class, 'index']);
Route::post('tags', [CustomerTagController::class, 'store']);
Route::put('tags/{tag}', [CustomerTagController::class, 'update']);
Route::delete('tags/{tag}', [CustomerTagController::class, 'destroy']);
Route::get('tags/manual', [CustomerController::class, 'listManualTags']);
Route::get('stats', [CustomerController::class, 'stats']);
Route::get('tag-rules', [CustomerTagRuleController::class, 'index']);
Route::post('tag-rules', [CustomerTagRuleController::class, 'store']);
Route::put('tag-rules/{customerTagRule}', [CustomerTagRuleController::class, 'update']);
Route::delete('tag-rules/{customerTagRule}', [CustomerTagRuleController::class, 'destroy']);
Route::get('by-guid/{guid}', [CustomerController::class, 'showByGuid']);
Route::get('by-email', [CustomerController::class, 'showByEmail']);
Route::get('{customer}', [CustomerController::class, 'show']);
Route::patch('{customer}', [CustomerController::class, 'update']);
Route::post('{customer}/notes', [CustomerController::class, 'storeNote']);
