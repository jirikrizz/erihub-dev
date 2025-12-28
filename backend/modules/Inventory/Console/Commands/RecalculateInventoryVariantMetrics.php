<?php

namespace Modules\Inventory\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Str;
use Modules\Inventory\Services\InventoryMetricsService;
use Modules\Pim\Models\ProductVariant;

class RecalculateInventoryVariantMetrics extends Command
{
    protected $signature = 'inventory:metrics:refresh
        {--variant= : Variant code or ID to recalculate}
        {--chunk=100 : Number of variants processed per batch}
        {--force : Force recalculation even if metrics exist}';

    protected $description = 'Recalculate cached inventory metrics for product variants.';

    public function __construct(private readonly InventoryMetricsService $metricsService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $variantId = $this->option('variant');
        $chunkSize = (int) $this->option('chunk');
        $force = (bool) $this->option('force');

        $query = ProductVariant::query()->with('product');

        if ($variantId) {
            $query->where(function ($builder) use ($variantId) {
                if (Str::isUuid($variantId)) {
                    $builder->where('id', $variantId);
                } else {
                    $builder->where('code', $variantId);
                }
            });
        }

        $count = 0;

        $query->chunkById($chunkSize, function (EloquentCollection $variants) use (&$count, $force) {
            $variants->each(function (ProductVariant $variant) use (&$count, $force) {
                $this->metricsService->getOrRecalculate($variant, $force);
                $count++;
            });
        });

        $this->info("Recalculated metrics for {$count} variant(s).");

        return self::SUCCESS;
    }
}
