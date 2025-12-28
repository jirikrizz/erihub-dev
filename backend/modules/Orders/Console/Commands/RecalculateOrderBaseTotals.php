<?php

namespace Modules\Orders\Console\Commands;

use Illuminate\Console\Command;
use Modules\Core\Services\CurrencyConverter;
use Modules\Orders\Models\Order;

class RecalculateOrderBaseTotals extends Command
{
    protected $signature = 'orders:recalculate-base-totals {--shop= : Limit to a specific shop ID} {--chunk=500 : Number of orders to process per chunk}';

    protected $description = 'Recalculate base currency totals for stored orders.';

    public function __construct(private readonly CurrencyConverter $currencyConverter)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $query = Order::query()->with('shop:id,currency_code');

        if ($shopId = $this->option('shop')) {
            $query->where('shop_id', (int) $shopId);
        }

        $chunkSize = (int) $this->option('chunk');
        if ($chunkSize <= 0) {
            $chunkSize = 500;
        }

        $processed = 0;
        $updated = 0;

        $query->orderBy('id')->chunkById($chunkSize, function ($orders) use (&$processed, &$updated) {
            foreach ($orders as $order) {
                $currency = $order->currency_code
                    ?? $order->shop?->currency_code
                    ?? $this->currencyConverter->getBaseCurrency();

                $totalWithVatBase = $this->currencyConverter->convertToBase($order->total_with_vat, $currency);
                $totalWithoutVatBase = $this->currencyConverter->convertToBase($order->total_without_vat, $currency);
                $totalVatBase = $this->currencyConverter->convertToBase($order->total_vat, $currency);

                $payload = [];

                if ($order->total_with_vat_base !== $totalWithVatBase) {
                    $payload['total_with_vat_base'] = $totalWithVatBase;
                }

                if ($order->total_without_vat_base !== $totalWithoutVatBase) {
                    $payload['total_without_vat_base'] = $totalWithoutVatBase;
                }

                if ($order->total_vat_base !== $totalVatBase) {
                    $payload['total_vat_base'] = $totalVatBase;
                }

                if ($payload !== []) {
                    $order->forceFill($payload)->save();
                    $updated++;
                }

                $processed++;
            }

            $this->info("Processed {$processed} orders so far...");
        });

        $this->info("Recalculated {$updated} order(s) out of {$processed} processed.");

        return self::SUCCESS;
    }
}
