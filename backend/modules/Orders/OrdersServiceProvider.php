<?php

namespace Modules\Orders;

use Illuminate\Support\ServiceProvider;
use Modules\Orders\Console\Commands\RecalculateOrderBaseTotals;
use Modules\Orders\Console\Commands\RecountShopOrderTotals;

class OrdersServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->register(RouteServiceProvider::class);
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/database/migrations');

        if ($this->app->runningInConsole()) {
            $this->commands([
                RecalculateOrderBaseTotals::class,
                RecountShopOrderTotals::class,
            ]);
        }
    }
}
