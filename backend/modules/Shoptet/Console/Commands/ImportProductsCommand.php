<?php

namespace Modules\Shoptet\Console\Commands;

use Illuminate\Console\Command;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Services\ProductImporter;

class ImportProductsCommand extends Command
{
    protected $signature = 'shoptet:import-products {shop_id} {--since=}';

    protected $description = 'Import products from Shoptet into the HUB for a given shop.';

    public function handle(ProductImporter $importer): int
    {
        $shop = Shop::findOrFail($this->argument('shop_id'));

        $query = [];
        if ($since = $this->option('since')) {
            $query['changeTimeFrom'] = $since;
        }

        $result = $importer->import($shop, $query);

        $this->info("Imported {$result['count']} products for shop {$shop->name}.");

        return self::SUCCESS;
    }
}
