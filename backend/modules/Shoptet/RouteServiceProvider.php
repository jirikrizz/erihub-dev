<?php

namespace Modules\Shoptet;

use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Route;
use Modules\Shoptet\Models\Shop;

class RouteServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Route::bind('shop', function ($value) {
            $query = Shop::query();

            if (Shop::hasProviderColumn()) {
                $query->where('provider', 'shoptet');
            }

            return $query->findOrFail($value);
        });

        Route::prefix('api/shoptet')
            ->middleware(['api', 'auth:sanctum', 'permission:section.settings.shops'])
            ->group(__DIR__.'/routes/api.php');

        Route::prefix('api/shoptet')
            ->middleware(['api', 'auth:sanctum', 'permission:section.settings.plugins'])
            ->group(__DIR__.'/routes/plugins.php');

        Route::prefix('api/shoptet')
            ->middleware(['api'])
            ->group(__DIR__.'/routes/public.php');
    }
}
