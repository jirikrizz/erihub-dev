<?php

namespace Modules\Inventory\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Modules\Core\Models\JobSchedule;
use Modules\Inventory\Models\InventoryVariantRecommendation;
use Modules\Inventory\Services\InventoryProductRecommendationService;
use Modules\Inventory\Services\InventoryRecommendationService;
use Modules\Pim\Models\ProductVariant;
use Modules\Core\Traits\WithJobLocking;

class GenerateInventoryRecommendationsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels, WithJobLocking;

    /**
     * Allow more time; previous runs were killed around 1h.
     */
    public int $timeout = 7200;

    /**
     * Job lock timeout (slightly less than overall timeout)
     */
    protected int $jobLockTimeout = 7100;

    private array $excludeKeywords;

    public function __construct(private readonly string $scheduleId)
    {
        // Run heavy recommendation rebuilds on a dedicated queue so they don't block default workers.
        $this->queue = 'inventory_recommendations';
        $this->excludeKeywords = [];
    }

    public function handle(
        InventoryRecommendationService $recommendationService,
        InventoryProductRecommendationService $productRecommendationService
    ): void
    {
        if (!$this->acquireLock()) {
            Log::info('GenerateInventoryRecommendationsJob already running, skipping');
            return;
        }

        try {
        /** @var JobSchedule|null $schedule */
        $schedule = JobSchedule::query()->find($this->scheduleId);

        if (! $schedule || ! $schedule->enabled) {
            return;
        }

        $schedule->forceFill([
            'last_run_status' => 'running',
            'last_run_message' => null,
        ])->save();

        try {
            $options = $schedule->options ?? [];
            // Keep chunks small to reduce memory footprint and execution time per loop.
            $chunk = max(10, (int) Arr::get($options, 'chunk', 20));
            $limit = max(1, (int) Arr::get($options, 'limit', 6));
            $productLimit = max(1, (int) Arr::get($options, 'product_limit', 10));
            $skipVariants = (bool) Arr::get($options, 'skip_variants', false);
            $rawKeywords = Arr::get($options, 'exclude_keywords', [
                'tester',
                'bez víčka',
                'bez vicka',
                'bez krabičky',
                'bez krabicky',
                'vzorek',
                'sample',
            ]);
            $this->excludeKeywords = array_map(
                fn (string $keyword) => Str::lower(trim($keyword)),
                array_filter((array) $rawKeywords)
            );

            $processedVariants = 0;

            if (! $skipVariants) {
                ProductVariant::query()
                    ->with('product')
                    ->orderBy('id')
                    ->chunk($chunk, function (Collection $variants) use (&$processedVariants, $recommendationService, $limit) {
                        foreach ($variants as $variant) {
                            /** @var ProductVariant $variant */
                            $processedVariants++;
                            $this->rebuildForVariant($variant, $recommendationService, $limit);
                        }

                        // Explicitly free cyclic references after each chunk.
                        gc_collect_cycles();
                    });
            }

            $productStats = $productRecommendationService->rebuild($productLimit, $chunk, $this->excludeKeywords);

            $schedule->forceFill([
                'last_run_status' => 'completed',
                'last_run_ended_at' => now(),
                'last_run_message' => sprintf(
                    'Vygenerováno doporučení pro %d variant a %d produktů.',
                    $processedVariants,
                    $productStats['products'] ?? 0
                ),
            ])->save();
        } catch (\Throwable $throwable) {
            $schedule->forceFill([
                'last_run_status' => 'failed',
                'last_run_ended_at' => now(),
                'last_run_message' => $throwable->getMessage(),
            ])->save();

            Log::error('GenerateInventoryRecommendationsJob failed', [
                'schedule_id' => $this->scheduleId,
                'exception' => $throwable,
            ]);

            throw $throwable;
        }
    }

    private function rebuildForVariant(ProductVariant $variant, InventoryRecommendationService $service, int $limit): void
    {
        InventoryVariantRecommendation::query()
            ->where('variant_id', $variant->id)
            ->delete();

        if ($this->shouldSkipVariant($variant)) {
            return;
        }

        if ($variant->product && in_array($variant->product->status, ['hidden', 'blocked', 'archived', 'archive'], true)) {
            return;
        }

        $recommendations = $service->recommend($variant, $limit * 3);
        if ($recommendations === []) {
            return;
        }

        $filtered = [];
        $seenRecommended = [];
        foreach ($recommendations as $entry) {
            if (count($filtered) >= $limit) {
                break;
            }

            $variantData = Arr::get($entry, 'variant', []);
            $recommendedId = Arr::get($variantData, 'id');

            if (! $recommendedId || $recommendedId === $variant->id) {
                continue;
            }

            if (isset($seenRecommended[$recommendedId])) {
                continue;
            }

            if ($this->containsExcludedStrings([
                Arr::get($variantData, 'name'),
                Arr::get($variantData, 'code'),
                Arr::get($variantData, 'brand'),
                Arr::get($variantData, 'data.volume.value'),
                Arr::get($variantData, 'data.volume.label'),
            ])) {
                continue;
            }

            $seenRecommended[$recommendedId] = true;

            $filtered[] = [
                'recommended_id' => $recommendedId,
                'entry' => $entry,
            ];
        }

        if ($filtered === []) {
            return;
        }

        $position = 0;
        foreach ($filtered as $record) {
            InventoryVariantRecommendation::create([
                'variant_id' => $variant->id,
                'recommended_variant_id' => $record['recommended_id'],
                'position' => $position++,
                'score' => Arr::get($record['entry'], 'score'),
                'matches' => Arr::get($record['entry'], 'matches', []),
            ]);
        }
    }

    private function shouldSkipVariant(ProductVariant $variant): bool
    {
        return $this->containsExcludedStrings([
            $variant->name,
            $variant->code,
            $variant->brand,
            Arr::get($variant->data ?? [], 'variant.label'),
            Arr::get($variant->data ?? [], 'variant.volume'),
        ]);
    }

    private function containsExcludedStrings(array $candidates): bool
    {
        foreach ($candidates as $value) {
            if (! is_string($value)) {
                continue;
            }

            $normalized = Str::lower($value);
            foreach ($this->excludeKeywords as $keyword) {
                if ($keyword !== '' && Str::contains($normalized, $keyword)) {
                    return true;
                }
            }
        }

        return false;
    }
}
