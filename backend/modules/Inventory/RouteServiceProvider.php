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
    }
}
