<?php

namespace Modules\WooCommerce;

use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Route;
use Modules\Shoptet\Models\Shop;

class RouteServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Route::pattern('woocommerceShop', '[0-9]+');

        Route::bind('woocommerceShop', function ($value) {
            $query = Shop::query();

            if (Shop::hasProviderColumn()) {
                $query->where('provider', 'woocommerce');
            }

            return $query->findOrFail($value);
        });

        Route::prefix('api/woocommerce')
            ->middleware(['api', 'auth:sanctum', 'permission:section.settings.shops'])
            ->group(__DIR__.'/routes/api.php');
    }
}
