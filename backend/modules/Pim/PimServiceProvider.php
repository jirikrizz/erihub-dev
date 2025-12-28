<?php

namespace Modules\Pim;

use Illuminate\Support\ServiceProvider;
use Modules\Pim\Console\Commands\NormalizeProductTranslations;

class PimServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/config/pim.php', 'pim');
        $this->app->register(RouteServiceProvider::class);
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/database/migrations');
        // Use the correct case-sensitive path so production (Linux) can resolve the views
        $this->loadViewsFrom(__DIR__.'/Resources/views', 'pim');

        if ($this->app->runningInConsole()) {
            $this->commands([
                NormalizeProductTranslations::class,
            ]);
        }
    }
}
