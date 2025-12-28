<?php

return [
    App\Providers\AppServiceProvider::class,
    Modules\Core\CoreServiceProvider::class,
    Modules\Pim\PimServiceProvider::class,
    Modules\Shoptet\ShoptetServiceProvider::class,
    Modules\WooCommerce\WooCommerceServiceProvider::class,
    Modules\Inventory\InventoryServiceProvider::class,
    Modules\Orders\OrdersServiceProvider::class,
    Modules\Analytics\AnalyticsServiceProvider::class,
    Modules\Dashboard\DashboardServiceProvider::class,
    Modules\Admin\AdminServiceProvider::class,
    Modules\Customers\CustomersServiceProvider::class,
    Modules\Microsites\MicrositesServiceProvider::class,
];
