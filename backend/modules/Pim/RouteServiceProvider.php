<?php

namespace Modules\Pim;

use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Route;

class RouteServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Route::prefix('api/pim')
            ->middleware([
                'api',
                'auth:sanctum',
                'permission:section.products|section.categories|section.categories.mapping',
            ])
            ->group(__DIR__.'/routes/api.php');

        Route::middleware('api')
            ->group(__DIR__.'/routes/public.php');
    }
}
