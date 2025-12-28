<?php

namespace Modules\Inventory\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Modules\Inventory\Models\InventoryVariantForecast;
use Modules\Inventory\Services\InventoryForecastService;
use Modules\Inventory\Services\InventoryMetricsService;
use Modules\Pim\Models\ProductVariant;

class ForecastInventoryVariantsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    private const CHUNK_SIZE = 10;

    /**
     * @var string[]
     */
    private array $variantIds;

    private ?string $context;

    /**
     * @var int[]
     */
    private array $shopIds;

    private ?int $userId;

    public function __construct(array $variantIds, ?string $context = null, array $shopIds = [], ?int $userId = null)
    {
        $this->queue = 'default';
        $this->variantIds = array_values(array_unique(array_filter($variantIds, static fn ($value) => is_string($value) && $value !== '')));
        $this->context = $context !== null && trim($context) !== '' ? trim($context) : null;
        $this->shopIds = array_values(array_unique(array_filter($shopIds, static fn ($value) => is_numeric($value))));
        $this->userId = $userId;
    }

    public function handle(InventoryMetricsService $metricsService, InventoryForecastService $forecastService): void
    {
        if ($this->variantIds === []) {
            return;
        }

        collect($this->variantIds)
            ->chunk(self::CHUNK_SIZE)
            ->each(function (Collection $chunk) use ($metricsService, $forecastService) {
                foreach ($chunk as $variantId) {
                    $this->forecastVariant((string) $variantId, $metricsService, $forecastService);
                }
            });
    }

    private function forecastVariant(
        string $variantId,
        InventoryMetricsService $metricsService,
        InventoryForecastService $forecastService
    ): void {
        /** @var ProductVariant|null $variant */
        $variant = ProductVariant::query()
            ->with(['product.shop', 'overlays.shop'])
            ->find($variantId);

        if (! $variant) {
            return;
        }

        try {
            $summary = $metricsService->summarize(
                $variant,
                $this->shopIds === [] ? null : $this->shopIds
            );

            $sharedStock = $this->resolveSharedStock($variant);
            $variant->setAttribute('stock', $sharedStock['stock']);
            $variant->setAttribute('min_stock_supply', $sharedStock['min_stock_supply']);

            $result = $forecastService->forecast($variant, $summary, [
                'shop_ids' => $this->shopIds,
                'notes' => $this->context,
            ]);

            InventoryVariantForecast::create([
                'product_variant_id' => $variant->id,
                'user_id' => $this->userId,
                'runway_days' => $result['runway_days'] ?? null,
                'confidence' => $result['confidence'] ?? null,
                'summary' => $result['summary'] ?? null,
                'recommendations' => $result['recommendations'] ?? [],
                'assumptions' => $result['assumptions'] ?? [],
                'top_markets' => $result['top_markets'] ?? [],
                'pricing_advice' => $result['pricing_advice'] ?? null,
                'restock_advice' => $result['restock_advice'] ?? null,
                'reorder_deadline_days' => $result['reorder_deadline_days'] ?? null,
                'recommended_order_quantity' => $result['recommended_order_quantity'] ?? null,
                'order_recommendation' => $result['order_recommendation'] ?? null,
                'order_rationale' => $result['order_rationale'] ?? null,
                'seasonality_summary' => $result['seasonality_summary'] ?? null,
                'seasonality_best_period' => $result['seasonality_best_period'] ?? null,
                'product_health' => $result['product_health'] ?? null,
                'product_health_reason' => $result['product_health_reason'] ?? null,
                'payload' => $result['payload'] ?? null,
            ]);
        } catch (\Throwable $throwable) {
            Log::error('ForecastInventoryVariantsJob failed for variant', [
                'variant_id' => $variantId,
                'exception' => $throwable->getMessage(),
            ]);
        }
    }

    /**
     * @return array{stock: float|null, min_stock_supply: float|null, shop_id: int|null}
     */
    private function resolveSharedStock(ProductVariant $variant): array
    {
        return [
            'stock' => $variant->stock !== null ? (float) $variant->stock : null,
            'min_stock_supply' => $variant->min_stock_supply !== null ? (float) $variant->min_stock_supply : null,
            'shop_id' => $variant->product?->shop_id,
        ];
    }
}
