<?php

namespace Modules\Customers\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Modules\Customers\Models\Customer;
use Modules\Orders\Models\Order;
use Modules\Shoptet\Models\Shop;

class ReassignCustomerShops extends Command
{
    protected $signature = 'customers:reassign-shops {--force : Persist even if no orders found} {--chunk=200 : Number of customers per batch}';

    protected $description = 'Reassign customer primary shops based on order history, preferring master shops.';

    public function handle(): int
    {
        $chunkSize = (int) $this->option('chunk');
        if ($chunkSize <= 0) {
            $chunkSize = 200;
        }

        $shopFlags = Shop::query()
            ->pluck('is_master', 'id')
            ->map(fn ($value) => (bool) $value);

        $masterShopIds = $shopFlags->filter()->keys();

        $force = (bool) $this->option('force');
        $processed = 0;
        $updated = 0;

        Customer::query()
            ->orderBy('id')
            ->chunkById($chunkSize, function (Collection $customers) use (&$processed, &$updated, $shopFlags, $masterShopIds, $force) {
                foreach ($customers as $customer) {
                    $preferredShopId = $this->resolvePreferredShopId($customer->guid, $shopFlags);

                    if ($preferredShopId === null) {
                        if ($force && $customer->shop_id === null && $masterShopIds->isNotEmpty()) {
                            $fallbackMasterId = (int) $masterShopIds->first();
                            if ($fallbackMasterId) {
                                $customer->forceFill(['shop_id' => $fallbackMasterId])->save();
                                $updated++;
                            }
                        }

                        $processed++;
                        continue;
                    }

                    if ((int) $customer->shop_id === $preferredShopId) {
                        $processed++;
                        continue;
                    }

                    $customer->forceFill(['shop_id' => $preferredShopId])->save();
                    $updated++;
                    $processed++;
                }

                $this->info("Processed {$processed} customers so far, updated {$updated}.");
            });

        $this->info("Reassigned {$updated} customer(s) in total.");

        return self::SUCCESS;
    }

    private function resolvePreferredShopId(string $customerGuid, Collection $shopFlags): ?int
    {
        $summaries = Order::query()
            ->select('shop_id')
            ->selectRaw('COUNT(*) as orders_count')
            ->where('customer_guid', $customerGuid)
            ->whereNotNull('shop_id')
            ->groupBy('shop_id')
            ->orderByDesc('orders_count')
            ->get();

        if ($summaries->isEmpty()) {
            return null;
        }

        $masterShop = $summaries->first(function ($summary) use ($shopFlags) {
            return $shopFlags->get((int) $summary->shop_id, false) === true;
        });

        if ($masterShop) {
            return (int) $masterShop->shop_id;
        }

        $top = $summaries->first();

        return $top ? (int) $top->shop_id : null;
    }
}
