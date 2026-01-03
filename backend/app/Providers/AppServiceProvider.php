<?php

namespace App\Providers;

use App\Support\ReadOnlySanctumGuard;
use Illuminate\Auth\RequestGuard;
use Illuminate\Support\Facades\Auth;
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
        // Register public API routes WITHOUT middleware before anything else
        $this->registerPublicApiRoutes();
        
        if (env('APP_PREVIEW_READONLY', false)) {
            // Override Sanctum guard to avoid DB writes (last_used_at updates) in read-only preview.
            Auth::resolved(function ($auth) {
                $auth->extend('sanctum', function ($app, $name, array $config) use ($auth) {
                    return tap(
                        new RequestGuard(
                            new ReadOnlySanctumGuard($auth, config('sanctum.expiration'), $config['provider'] ?? null),
                            $app['request'],
                            $auth->createUserProvider($config['provider'] ?? null)
                        ),
                        function ($guard) use ($app) {
                            $app->refresh('request', $guard, 'setRequest');
                        }
                    );
                });
            });
        }
    }

    private function registerPublicApiRoutes(): void
    {
        \Illuminate\Support\Facades\Route::get('/api/widgets/inventory/recommendations.js', 
            \Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController::class.'@script');
        \Illuminate\Support\Facades\Route::get('/api/inventory/recommendations/products', 
            \Modules\Inventory\Http\Controllers\PublicRecommendationsController::class.'@products');
    }

    private function registerIfAvailable(string $provider): void
    {
        if (class_exists($provider)) {
            $this->app->register($provider);
        }
    }
}
