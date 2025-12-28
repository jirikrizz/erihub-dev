<?php

namespace Modules\Orders;

use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Route;

class RouteServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Route::prefix('api/orders')
            ->middleware(['api', 'auth:sanctum', 'permission:section.orders'])
            ->group(__DIR__.'/routes/api.php');
    }
}
