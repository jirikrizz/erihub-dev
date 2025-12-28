<?php

namespace Modules\Inventory\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Modules\Inventory\Services\InventoryMetricsService;

class RecalculateInventoryVariantMetricsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    private const CHUNK_SIZE = 50;

    /**
     * @var string[]
     */
    private array $variantIds;

    public function __construct(array $variantIds)
    {
        $this->variantIds = $variantIds;
        $this->queue = 'default';
    }

    public function handle(InventoryMetricsService $metricsService): void
    {
        $ids = collect($this->variantIds)
            ->filter(fn ($value) => is_string($value) && $value !== '')
            ->unique()
            ->values();

        if ($ids->isEmpty()) {
            return;
        }

        $current = $ids->take(self::CHUNK_SIZE)->all();
        $remaining = $ids->slice(self::CHUNK_SIZE)->all();

        if ($current !== []) {
            $metricsService->recalculateForVariants($current);
        }

        if ($remaining !== []) {
            RecalculateInventoryVariantMetricsJob::dispatch($remaining);
        }
    }
}
