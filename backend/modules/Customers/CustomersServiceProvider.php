<?php

namespace Modules\Customers;

use Illuminate\Support\ServiceProvider;
use Modules\Customers\Console\Commands\ApplyCustomerTagRules;
use Modules\Customers\Console\Commands\BackfillCustomersFromOrders;
use Modules\Customers\Console\Commands\EnrichCustomersFromOrders;
use Modules\Customers\Console\Commands\ReassignCustomerShops;
use Modules\Customers\Console\Commands\RecalculateCustomerMetrics;
use Modules\Customers\Console\Commands\SyncOrderCustomers;
use Modules\Customers\Console\Commands\NormalizeCustomerGroups;

class CustomersServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->register(RouteServiceProvider::class);
    }

    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/database/migrations');

        if ($this->app->runningInConsole()) {
            $this->commands([
                BackfillCustomersFromOrders::class,
                EnrichCustomersFromOrders::class,
                ReassignCustomerShops::class,
                RecalculateCustomerMetrics::class,
                SyncOrderCustomers::class,
                NormalizeCustomerGroups::class,
                ApplyCustomerTagRules::class,
            ]);
        }
    }
}
