<?php

namespace Modules\Microsites;

use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Route;

class RouteServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Route::prefix('api/microsites')
            ->middleware(['api', 'auth:sanctum', 'permission:section.microsites'])
            ->group(__DIR__.'/routes/api.php');

        Route::prefix('api/storefront')
            ->middleware('api')
            ->group(__DIR__.'/routes/storefront.php');

        Route::prefix('microshop')
            ->middleware('web')
            ->group(__DIR__.'/routes/web.php');
    }
}
