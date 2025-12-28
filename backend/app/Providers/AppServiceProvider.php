<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        if ($this->app->environment('local')) {
            $this->registerIfAvailable(\Laravel\Pail\PailServiceProvider::class);
        }

        if ($this->app->runningInConsole()) {
            $this->registerIfAvailable(\Laravel\Sail\SailServiceProvider::class);
            $this->registerIfAvailable(\NunoMaduro\Collision\Adapters\Laravel\CollisionServiceProvider::class);
            $this->registerIfAvailable(\Termwind\Laravel\TermwindServiceProvider::class);
        }
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }

    private function registerIfAvailable(string $provider): void
    {
        if (class_exists($provider)) {
            $this->app->register($provider);
        }
    }
}
