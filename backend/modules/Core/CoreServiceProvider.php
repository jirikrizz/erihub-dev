<?php

namespace Modules\Core;

use Illuminate\Support\ServiceProvider;
use Modules\Core\Services\CurrencyConverter;

class CoreServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->register(RouteServiceProvider::class);

        $this->app->singleton(CurrencyConverter::class, function () {
            $baseCurrency = config('currency.base', 'CZK');
            $rates = config('currency.rates', []);

            return new CurrencyConverter($baseCurrency, $rates);
        });
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/database/migrations');

        if ($this->app->runningInConsole()) {
            $this->commands([
                \Modules\Core\Console\Commands\RunJobSchedulesCommand::class,
                \Modules\Core\Console\Commands\DispatchSlackNotificationsCommand::class,
            ]);
        }
    }
}
