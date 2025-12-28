<?php

namespace Modules\Core;

use Illuminate\Support\Facades\Route;
use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;

class RouteServiceProvider extends ServiceProvider
{
    public const HOME = '/';

    public function boot(): void
    {
        parent::boot();

        Route::prefix('api')
            ->middleware('api')
            ->group(__DIR__.'/routes/api.php');

        Route::middleware('web')
            ->group(__DIR__.'/routes/web.php');
    }
}
