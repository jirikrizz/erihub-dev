<?php

namespace Modules\Inventory;

use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;
use Modules\Core\Services\SettingsService;
use Modules\Inventory\Console\Commands\RecalculateInventoryVariantMetrics;
use Modules\Inventory\Console\Commands\SyncInventoryStockGuard;
use Modules\Inventory\Services\ElogistClient;

class InventoryServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(ElogistClient::class, function ($app) {
            /** @var SettingsService $settings */
            $settings = $app->make(SettingsService::class);

            $config = array_filter(config('services.elogist', []), static fn ($value) => $value !== null && $value !== '');
            $overrides = [];
            $password = null;

            // In fresh dev environments the settings table may not exist yet.
            if (Schema::hasTable('app_settings')) {
                $overrides = $settings->getJson('elogist_settings', []);
                $password = $settings->getDecrypted('elogist_password');
            }

            $normalizedOverrides = array_filter($overrides, static fn ($value) => $value !== null && $value !== '');

            if ($password) {
                $normalizedOverrides['password'] = $password;
            } elseif (! empty($config['password'])) {
                $normalizedOverrides['password'] = $config['password'];
            }

            $merged = array_merge($config, $normalizedOverrides);

            return new ElogistClient($merged);
        });

        $this->app->register(RouteServiceProvider::class);
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/database/migrations');

        if ($this->app->runningInConsole()) {
            $this->commands([
                RecalculateInventoryVariantMetrics::class,
                SyncInventoryStockGuard::class,
            ]);
        }
    }
}
