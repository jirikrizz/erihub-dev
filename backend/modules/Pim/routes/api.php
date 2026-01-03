<?php

use Illuminate\Support\Facades\Route;
use Modules\Pim\Http\Controllers\ProductController;
use Modules\Pim\Http\Controllers\ConfigController;
use Modules\Pim\Http\Controllers\ProductTranslationController;
use Modules\Pim\Http\Controllers\TranslationTaskController;
use Modules\Pim\Http\Controllers\ProductOverlayController;
use Modules\Pim\Http\Controllers\CategoryMappingController;
use Modules\Pim\Http\Controllers\CategoryProductPriorityController;
use Modules\Pim\Http\Controllers\ShopCategoryNodeController;
use Modules\Pim\Http\Controllers\AttributeMappingController;
use Modules\Pim\Http\Controllers\ProductWidgetController;
use Modules\Pim\Http\Controllers\AutoWidgetController;
use Modules\Pim\Http\Controllers\ProductWidgetAnalyticsController;
use Modules\Pim\Http\Controllers\WidgetAnalyticsController;

Route::get('config/locales', [ConfigController::class, 'locales']);

Route::get('products', [ProductController::class, 'index']);
Route::post('products/category-priority', [CategoryProductPriorityController::class, 'update']);
Route::post('products/category-priority/ai-evaluate', [CategoryProductPriorityController::class, 'evaluateAi']);
Route::get('products/category-priority', [CategoryProductPriorityController::class, 'index']);
Route::get('products/{product}', [ProductController::class, 'show']);
Route::patch('products/{product}/overlays/{shop}', [ProductOverlayController::class, 'update']);
Route::patch('products/{product}/variants/{variant}/overlays/{shop}', [ProductOverlayController::class, 'updateVariant']);

Route::get('products/{product}/translations/{locale}', [ProductTranslationController::class, 'show']);
Route::patch('products/{product}/translations/{locale}', [ProductTranslationController::class, 'update']);
Route::post('products/{product}/translations/{locale}/submit', [ProductTranslationController::class, 'submit']);
Route::post('products/{product}/translations/{locale}/approve', [ProductTranslationController::class, 'approve']);
Route::post('products/{product}/translations/{locale}/reject', [ProductTranslationController::class, 'reject']);
Route::post('products/{product}/translations/{locale}/ai-draft', [ProductTranslationController::class, 'generateAiDraft']);
Route::post('products/{product}/translations/{locale}/ai-mapping', [ProductTranslationController::class, 'prepareAiMapping']);

Route::get('tasks', [TranslationTaskController::class, 'index']);
Route::post('tasks/{task}/assign', [TranslationTaskController::class, 'assign']);
Route::post('tasks/{task}/complete', [TranslationTaskController::class, 'complete']);

Route::get('category-mappings', [CategoryMappingController::class, 'index']);
Route::get('category-mappings/default-category-validation', [CategoryMappingController::class, 'validateDefaultCategories']);
Route::post('category-mappings/default-category', [CategoryMappingController::class, 'applyDefaultCategory']);
Route::post('category-mappings/ai-pre-map', [CategoryMappingController::class, 'aiPreMap']);
Route::post('category-mappings/confirm', [CategoryMappingController::class, 'confirm']);
Route::post('category-mappings/reject', [CategoryMappingController::class, 'reject']);
Route::get('shop-category-nodes', [CategoryMappingController::class, 'shopCategories']);
Route::get('category-mappings/tree', [CategoryMappingController::class, 'tree']);
Route::get('attribute-mappings', [AttributeMappingController::class, 'index']);
Route::post('attribute-mappings', [AttributeMappingController::class, 'store']);
Route::post('attribute-mappings/suggest', [AttributeMappingController::class, 'suggest']);
Route::post('attribute-mappings/sync', [AttributeMappingController::class, 'sync']);
Route::post('shop-category-nodes/sync', [ShopCategoryNodeController::class, 'sync']);
Route::post('shop-category-nodes', [ShopCategoryNodeController::class, 'store']);
Route::patch('shop-category-nodes/{node}', [ShopCategoryNodeController::class, 'update']);
Route::post('shop-category-nodes/{node}/push', [ShopCategoryNodeController::class, 'push']);
Route::delete('shop-category-nodes/{node}', [ShopCategoryNodeController::class, 'destroy']);
Route::post('shop-category-nodes/ai-content', [ShopCategoryNodeController::class, 'generateAiContent']);
Route::post('shop-category-nodes/ai-translate', [ShopCategoryNodeController::class, 'translateAiContent']);

Route::get('product-widgets', [ProductWidgetController::class, 'index']);
Route::post('product-widgets', [ProductWidgetController::class, 'store']);
Route::get('product-widgets/{productWidget}', [ProductWidgetController::class, 'show']);
Route::put('product-widgets/{productWidget}', [ProductWidgetController::class, 'update']);
Route::delete('product-widgets/{productWidget}', [ProductWidgetController::class, 'destroy']);

// Admin widget analytics (authenticated)
Route::get('widgets/analytics/top', [WidgetAnalyticsController::class, 'top']);
Route::get('widgets/{widget}/analytics', [WidgetAnalyticsController::class, 'show']);

// Widget analytics (public token-based)
Route::post('product-widgets/{publicToken}/events/impression', [ProductWidgetAnalyticsController::class, 'impression']);
Route::post('product-widgets/{publicToken}/events/click', [ProductWidgetAnalyticsController::class, 'click']);

// Auto-widget generation from HUB
Route::post('auto-widgets/nonFragrance', [AutoWidgetController::class, 'buildNonFragrance']);
Route::post('auto-widgets/products', [AutoWidgetController::class, 'buildProducts']);
Route::post('auto-widgets/preview', [AutoWidgetController::class, 'preview']);

