<?php

namespace Modules\Inventory;

use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Route;

class RouteServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Route::prefix('api/inventory')
            ->middleware(['api', 'auth:sanctum', 'permission:section.inventory'])
            ->group(__DIR__.'/routes/api.php');

        Route::middleware('api')
            ->group(__DIR__.'/routes/public.php');
    }
}
