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
        Route::prefix('api/inventory')
            ->middleware(['api', 'auth:sanctum', 'permission:section.inventory'])
            ->group(function () {
                $this->loadRoutesFromFile(__DIR__.'/routes/api.php');
            });

        Route::prefix('api')
            ->middleware('api')
            ->group(function () {
                Route::get('test-widget', function() { 
                    \Illuminate\Support\Facades\Log::debug('Test route accessed!');
                    return "Widget route works!"; 
                });
                
                Route::get('widgets/inventory/recommendations.js', [InventoryRecommendationWidgetController::class, 'script']);
                
                Route::prefix('inventory')->group(function () {
                    Route::get('recommendations/products', [PublicRecommendationsController::class, 'products']);
                });
            });
    }
}
