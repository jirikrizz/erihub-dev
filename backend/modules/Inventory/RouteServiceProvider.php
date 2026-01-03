<?php

namespace Modules\Inventory;

use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Route;
use Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController;
use Modules\Inventory\Http\Controllers\PublicRecommendationsController;

class RouteServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        // Protected API routes for inventory
        Route::prefix('api/inventory')
            ->middleware(['api', 'auth:sanctum', 'permission:section.inventory'])
            ->group(__DIR__.'/routes/api.php');

        // Public widget endpoint - explicitly skip ALL middleware
        Route::withoutMiddleware(['api', 'auth:sanctum', 'permission:section.inventory', 'web'])
            ->get('/api/widgets/inventory/recommendations.js', [InventoryRecommendationWidgetController::class, 'script']);
        
        // Public recommendations API - explicitly skip ALL middleware
        Route::withoutMiddleware(['api', 'auth:sanctum', 'permission:section.inventory', 'web'])
            ->get('/api/inventory/recommendations/products', [PublicRecommendationsController::class, 'products']);
    }
}
