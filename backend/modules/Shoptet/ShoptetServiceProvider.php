<?php

namespace Modules\Shoptet;

use Illuminate\Support\ServiceProvider;
use Modules\Shoptet\Console\Commands\DiscardWebhookJobsCommand;
use Modules\Shoptet\Console\Commands\ImportProductsCommand;
use Modules\Shoptet\Console\Commands\PollSnapshotsCommand;
use Modules\Shoptet\Contracts\ShoptetClient;
use Modules\Shoptet\Http\ShoptetClient as HttpShoptetClient;
use Modules\Shoptet\Console\Commands\RequestProductSnapshotCommand;

class ShoptetServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/config/shoptet.php', 'shoptet');
        $this->app->singleton(ShoptetClient::class, HttpShoptetClient::class);
        $this->app->register(RouteServiceProvider::class);
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/database/migrations');

        if ($this->app->runningInConsole()) {
            $this->commands([
                ImportProductsCommand::class,
                PollSnapshotsCommand::class,
                DiscardWebhookJobsCommand::class,
                RequestProductSnapshotCommand::class,
            ]);
        }
    }
}
