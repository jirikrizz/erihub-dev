<?php

namespace Modules\Shoptet\Console\Commands;

use Illuminate\Console\Command;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Services\SnapshotService;

class RequestProductSnapshotCommand extends Command
{
    protected $signature = 'shoptet:snapshots:products
        {shop_id : ID shoptet shopu}
        {--from= : Hodnota parametru changeTimeFrom (ISO8601)}
        {--to= : Hodnota parametru changeTimeTo (ISO8601)}
        {--include= : Vlastní seznam include parametrů (čárkou oddělený)}';

    protected $description = 'Vyžádá produktový snapshot ze Shoptetu pro vybraný shop.';

    public function handle(SnapshotService $snapshotService): int
    {
        /** @var Shop $shop */
        $shop = Shop::findOrFail($this->argument('shop_id'));

        $params = array_filter([
            'changeTimeFrom' => $this->option('from'),
            'changeTimeTo' => $this->option('to'),
            'include' => $this->option('include'),
        ], fn ($value) => $value !== null && $value !== '');

        $job = $snapshotService->requestProductsSnapshot($shop, $params);

        $this->info(sprintf(
            'Snapshot job %s (endpoint %s) ve stavu %s.',
            $job->job_id,
            $job->endpoint,
            $job->status
        ));

        return self::SUCCESS;
    }
}
