<?php

namespace Modules\Dashboard;

use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Route;

class RouteServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Route::prefix('api/dashboard')
            ->middleware(['api', 'auth:sanctum', 'permission:section.dashboard'])
            ->group(__DIR__.'/routes/api.php');
    }
}
