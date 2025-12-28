<?php

namespace Modules\Orders\Console\Commands;

use Illuminate\Console\Command;
use Modules\Orders\Models\Order;
use Modules\Shoptet\Models\Shop;

class RecountShopOrderTotals extends Command
{
    protected $signature = 'orders:recount-shop-totals {--chunk=50 : Number of shops to process per chunk}';

    protected $description = 'Recalculate denormalized order counts for each shop.';

    public function handle(): int
    {
        $chunk = max(1, (int) $this->option('chunk'));
        $processed = 0;

        Shop::query()->orderBy('id')->chunkById($chunk, function ($shops) use (&$processed) {
            foreach ($shops as $shop) {
                $count = Order::query()->where('shop_id', $shop->id)->count();
                $shop->forceFill(['orders_total' => $count])->save();
                $this->line(sprintf('Shop %d (%s): %d orders', $shop->id, $shop->name, $count));
                $processed++;
            }
        });

        $this->info(sprintf('Recalculated totals for %d shop(s).', $processed));

        return self::SUCCESS;
    }
}
