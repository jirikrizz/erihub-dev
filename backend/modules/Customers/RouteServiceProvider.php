<?php

namespace Modules\Customers;

use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Route;

class RouteServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Route::prefix('api/customers')
            ->middleware(['api', 'auth:sanctum', 'permission:section.customers'])
            ->group(__DIR__.'/routes/api.php');
    }
}
