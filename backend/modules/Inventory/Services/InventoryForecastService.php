<?php

namespace Modules\Inventory\Services;

use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Modules\Core\Services\SettingsService;
use Modules\Inventory\Models\InventoryPurchaseOrderItem;
use Modules\Inventory\Support\InventoryForecastProfile;
use Modules\Pim\Models\ProductVariant;

class InventoryForecastService
{
    public function __construct(private readonly SettingsService $settings)
    {
    }

    /**
     * @param  array<string, mixed>  $summary
     * @param  array<string, mixed>  $context
     */
    public function forecast(
        ProductVariant $variant,
        array $summary,
        array $context = []
    ): array {
        $apiKey = $this->settings->getDecrypted('openai_api_key');

        if (! $apiKey) {
            throw new \RuntimeException('OpenAI API klíč není uložen. Přidej ho v Nastavení → Překládání.');
        }

        $model = config('services.openai.model', 'gpt-4o-mini');

        $averageDailySales = $this->floatOrNull($summary['average_daily_sales'] ?? null);

        $metrics = [
            'stock' => $this->floatOrNull($variant->stock),
            'min_stock_supply' => $this->floatOrNull($variant->min_stock_supply),
            'average_daily_sales' => $averageDailySales,
            'stock_runway_days' => $this->floatOrNull($summary['stock_runway_days'] ?? null),
            'last_30_quantity' => $this->floatOrNull($summary['last_30_quantity'] ?? null),
            'last_90_quantity' => $this->floatOrNull($summary['last_90_quantity'] ?? null),
            'lifetime_quantity' => $this->floatOrNull($summary['lifetime_quantity'] ?? null),
            'last_sale_at' => $summary['last_sale_at'] instanceof \DateTimeInterface
                ? $summary['last_sale_at']->toIso8601String()
                : ($summary['last_sale_at'] ?? null),
        ];

        $sales = [
            'last_30_days' => [
                'orders' => (int) ($summary['last_30_orders_count'] ?? 0),
                'quantity' => $this->floatOrNull($summary['last_30_quantity'] ?? null),
                'revenue' => $this->floatOrNull($summary['last_30_revenue'] ?? null),
            ],
            'last_90_days' => [
                'orders' => (int) ($summary['last_90_orders_count'] ?? 0),
                'quantity' => $this->floatOrNull($summary['last_90_quantity'] ?? null),
                'revenue' => $this->floatOrNull($summary['last_90_revenue'] ?? null),
            ],
            'lifetime' => [
                'orders' => (int) ($summary['lifetime_orders_count'] ?? 0),
                'quantity' => $this->floatOrNull($summary['lifetime_quantity'] ?? null),
                'revenue' => $this->floatOrNull($summary['lifetime_revenue'] ?? null),
            ],
        ];

        $variantPayload = [
            'code' => $variant->code,
            'name' => $variant->name,
            'brand' => $variant->brand,
            'supplier' => $variant->supplier,
            'unit' => $variant->unit,
            'price' => $this->floatOrNull($variant->price),
            'purchase_price' => $this->floatOrNull($variant->purchase_price),
            'currency' => $variant->currency_code ?? $summary['currency_code'] ?? null,
            'stock_status' => $variant->stock_status,
        ];

        $last30Quantity = $this->floatOrNull($summary['last_30_quantity'] ?? null);
        $last90Quantity = $this->floatOrNull($summary['last_90_quantity'] ?? null);

        $incomingStock = $this->resolveIncomingStock($variant);
        $metrics['incoming_quantity'] = $this->floatOrNull($incomingStock['total_quantity'] ?? null);

        $price = $this->floatOrNull($variant->price);
        $purchase = $this->floatOrNull($variant->purchase_price);
        $marginPerUnit = ($price !== null && $purchase !== null) ? $price - $purchase : null;
        $marginRate = ($price !== null && $price > 0 && $marginPerUnit !== null)
            ? $marginPerUnit / $price
            : null;

        $economics = [
            'margin_per_unit' => $marginPerUnit,
            'margin_rate' => $marginRate,
            'estimated_profit_last_30_days' => ($marginPerUnit !== null && $last30Quantity !== null)
                ? $marginPerUnit * $last30Quantity
                : null,
            'estimated_profit_last_90_days' => ($marginPerUnit !== null && $last90Quantity !== null)
                ? $marginPerUnit * $last90Quantity
                : null,
            'lifetime_revenue' => $this->floatOrNull($summary['lifetime_revenue'] ?? null),
        ];

        $profile = InventoryForecastProfile::sanitize(
            $this->settings->getJson(
                InventoryForecastProfile::SETTINGS_KEY,
                InventoryForecastProfile::defaults()
            )
        );

        $seasonalityMultiplier = match ($profile['seasonality']) {
            'peaks' => 2.5,
            'moderate' => 1.6,
            default => 1.15,
        };

        $trendRatio = null;
        if ($last30Quantity !== null && $last90Quantity !== null && $last90Quantity > 0) {
            $trendRatio = $last30Quantity / max($last90Quantity / 3, 0.0001);
        }

        $timezone = $variant->product?->shop?->timezone ?? config('app.timezone', 'UTC');
        $now = now($timezone);
        $currentMonth = (int) $now->format('n');

        $additionalContext = isset($context['notes']) && is_string($context['notes'])
            ? trim($context['notes'])
            : null;

        $notesSeasonalHint = 1.0;
        if ($additionalContext) {
            $lower = mb_strtolower($additionalContext);
            if (str_contains($lower, 'váno')) {
                $notesSeasonalHint = max($notesSeasonalHint, 2.8);
            }
            if (str_contains($lower, 'akce') || str_contains($lower, 'kampan')) {
                $notesSeasonalHint = max($notesSeasonalHint, 1.8);
            }
        }

        $seasonalDemandHint = max($seasonalityMultiplier, $notesSeasonalHint);

        $upcomingPeak = false;
        if ($profile['seasonality'] === 'peaks') {
            $peakMonths = [11, 12];
            if (in_array($currentMonth, $peakMonths, true)) {
                $upcomingPeak = true;
            }
        }

        $forecastHorizonDays = $profile['seasonality'] === 'peaks'
            ? 120
            : ($profile['seasonality'] === 'moderate' ? 90 : 60);

        $payload = [
            'variant' => $variantPayload,
            'metrics' => $metrics,
            'sales' => $sales,
            'business_profile' => $profile,
            'shop_selection' => $context['shop_ids'] ?? [],
            'additional_context' => $additionalContext,
            'seasonal_demand_hint' => $seasonalDemandHint,
            'trend_ratio_last_30_vs_90' => $trendRatio,
            'current_month' => $currentMonth,
            'upcoming_peak' => $upcomingPeak,
            'forecast_horizon_days' => $forecastHorizonDays,
            'incoming_stock' => $incomingStock,
            'economics' => $economics,
        ];

        $systemPrompt = 'Jsi konzultant pro plánování zásob v e-commerce. Odpověď vrať jako JSON podle zadaného schématu. '
            .'Pracuj pouze s dodanými hodnotami – nic si nevymýšlej. '
            .'Zohledni pole economics (margin_per_unit, margin_rate, odhad ziskovosti) a incoming_stock (deliveries s datem a počtem kusů). '
            .'Variantu považuj za ekonomicky nezajímavou, pokud je margin_per_unit ≤ 0 nebo margin_rate < 0.1 – v takovém případě uvažuj doporučení "do_not_order" nebo jasně vysvětli, proč by se nevyplatilo objednávat. '
            .'Pole seasonal_demand_hint udává, kolikrát se může poptávka zvýšit v nejbližších týdnech – pokud je > 1, započítej ho do termínu i množství doplnění. '
            .'trend_ratio_last_30_vs_90 ukazuje změnu poptávky oproti delšímu období (např. hodnota 2 znamená dvojnásobný růst). '
            .'Pro klíč order_recommendation použij jednu z hodnot: order_now, order_soon, monitor, do_not_order. '
            .'Stručně popiš nejlepší období pro prodeje, zhodnoť příspěvek incoming_stock a uveď trhy, kde SKU funguje nejlépe. '
            .'Odpověď napiš česky.';

        try {
            $response = Http::timeout(60)
                ->connectTimeout(10)
                ->withHeaders([
                    'Authorization' => 'Bearer '.$apiKey,
                    'Content-Type' => 'application/json',
                ])
                ->post('https://api.openai.com/v1/chat/completions', [
                    'model' => $model,
                    'response_format' => [
                        'type' => 'json_schema',
                        'json_schema' => [
                            'name' => 'inventory_runway_forecast',
                            'strict' => true,
                            'schema' => [
                                'type' => 'object',
                                'required' => [
                                    'summary',
                                    'recommendations',
                                    'confidence',
                                    'runway_days',
                                    'assumptions',
                                    'top_markets',
                                    'pricing_advice',
                                    'restock_advice',
                                    'reorder_deadline_days',
                                    'recommended_order_quantity',
                                    'order_recommendation',
                                    'order_rationale',
                                    'seasonality_summary',
                                    'seasonality_best_period',
                                    'product_health',
                                    'product_health_reason',
                                ],
                                'additionalProperties' => false,
                                'properties' => [
                                    'runway_days' => ['type' => ['number', 'null']],
                                    'confidence' => [
                                        'type' => 'string',
                                        'enum' => ['low', 'medium', 'high'],
                                    ],
                                    'summary' => ['type' => 'string'],
                                    'recommendations' => [
                                        'type' => 'array',
                                        'items' => ['type' => 'string'],
                                    ],
                                    'assumptions' => [
                                        'type' => 'array',
                                        'items' => ['type' => 'string'],
                                    ],
                                    'top_markets' => [
                                        'type' => 'array',
                                        'items' => [
                                            'type' => 'object',
                                            'required' => ['market', 'performance_label', 'share', 'comment'],
                                            'additionalProperties' => false,
                                            'properties' => [
                                                'market' => ['type' => 'string'],
                                                'performance_label' => ['type' => 'string'],
                                                'share' => ['type' => ['number', 'null']],
                                                'comment' => ['type' => ['string', 'null']],
                                            ],
                                        ],
                                    ],
                                    'pricing_advice' => ['type' => ['string', 'null']],
                                    'restock_advice' => ['type' => ['string', 'null']],
                                    'reorder_deadline_days' => ['type' => ['number', 'null']],
                                    'recommended_order_quantity' => ['type' => ['number', 'null']],
                                    'order_recommendation' => [
                                        'type' => 'string',
                                        'enum' => ['order_now', 'order_soon', 'monitor', 'do_not_order'],
                                    ],
                                    'order_rationale' => ['type' => 'string'],
                                    'seasonality_summary' => ['type' => 'string'],
                                    'seasonality_best_period' => ['type' => ['string', 'null']],
                                    'product_health' => [
                                        'type' => 'string',
                                        'enum' => ['strong', 'stable', 'weak'],
                                    ],
                                    'product_health_reason' => ['type' => 'string'],
                                ],
                            ],
                        ],
                    ],
                    'messages' => [
                        ['role' => 'system', 'content' => $systemPrompt],
                        ['role' => 'user', 'content' => json_encode($payload, JSON_UNESCAPED_UNICODE)],
                    ],
                    'temperature' => 0.3,
                    'max_tokens' => 800,
                ]);
        } catch (ConnectionException $exception) {
            Log::error('OpenAI forecast connection failed', ['message' => $exception->getMessage()]);

            throw new \RuntimeException('Nepodařilo se spojit s OpenAI. Zkus to prosím znovu.', 0, $exception);
        }

        if ($response->failed()) {
            $responseBody = $response->json();
            $errorMessage = data_get($responseBody, 'error.message') ?? $response->body();

            Log::warning('OpenAI forecast HTTP error', [
                'status' => $response->status(),
                'body' => $responseBody ?? $response->body(),
            ]);

            throw new \RuntimeException('AI odhad zásob selhal: '.($errorMessage ?: 'Neočekávaná chyba OpenAI.'));
        }

        $decoded = $response->json();
        $content = data_get($decoded, 'choices.0.message.content');

        if (! is_string($content) || $content === '') {
            Log::warning('OpenAI forecast response missing content', ['response' => $decoded]);
            throw new \RuntimeException('AI nevrátilo žádná data pro odhad.');
        }

        $parsed = json_decode($content, true);

        if (! is_array($parsed)) {
            Log::warning('OpenAI forecast returned invalid JSON', ['content' => $content]);
            throw new \RuntimeException('AI vrátila neplatný formát odpovědi.');
        }

        $recommendations = $this->normalizeStringArray($parsed['recommendations'] ?? []);
        $assumptions = $this->normalizeStringArray($parsed['assumptions'] ?? []);
        $topMarkets = $this->normalizeMarkets($parsed['top_markets'] ?? []);
        $confidence = $parsed['confidence'] ?? 'medium';
        if (! in_array($confidence, ['low', 'medium', 'high'], true)) {
            $confidence = 'medium';
        }

        $runwayDays = $this->floatOrNull($parsed['runway_days'] ?? null);
        $reorderDeadlineDays = $this->floatOrNull($parsed['reorder_deadline_days'] ?? null);
        $recommendedOrderQuantity = $this->floatOrNull($parsed['recommended_order_quantity'] ?? null);
        $orderRecommendation = $this->sanitizeEnum(
            $parsed['order_recommendation'] ?? null,
            ['order_now', 'order_soon', 'monitor', 'do_not_order'],
            'monitor'
        );
        $orderRationale = is_string($parsed['order_rationale'] ?? null)
            ? trim((string) $parsed['order_rationale'])
            : null;
        $summaryText = is_string($parsed['summary'] ?? null) ? trim($parsed['summary']) : '';

        $guardNotes = [];
        $downgradeTo = null;

        if ($averageDailySales !== null && $averageDailySales < 0.1) {
            $guardNotes[] = 'Poptávka je velmi nízká (méně než 0,1 ks za den).';
            $downgradeTo = $downgradeTo ?? 'monitor';
        }

        if ($last30Quantity !== null && $last30Quantity <= 2) {
            $guardNotes[] = 'Za posledních 30 dní se prodalo pouze několik kusů.';
            $downgradeTo = $downgradeTo ?? 'monitor';
        }

        if (($economics['margin_per_unit'] ?? null) !== null && $economics['margin_per_unit'] <= 0) {
            $guardNotes[] = 'Produkt má nulovou nebo zápornou marži.';
            $downgradeTo = 'do_not_order';
        }

        if (($economics['margin_rate'] ?? null) !== null && $economics['margin_rate'] < 0.15) {
            $guardNotes[] = 'Maržová míra je pod 15 %, nákup je ekonomicky sporný.';
            $downgradeTo = $downgradeTo ?? 'monitor';
        }

        if ($downgradeTo !== null) {
            $orderRecommendation = $downgradeTo;
            $reorderDeadlineDays = null;
            $recommendedOrderQuantity = null;
            $confidence = 'low';

            if ($guardNotes !== []) {
                $assumptions = array_merge($assumptions, $guardNotes);
                $summaryText = trim('Poznámka: '.implode(' ', $guardNotes).' '.$summaryText);
                $orderRationale = $orderRationale
                    ? $orderRationale.' '.implode(' ', $guardNotes)
                    : implode(' ', $guardNotes);
            }
        }

        return [
            'runway_days' => $runwayDays,
            'confidence' => $confidence,
            'summary' => $summaryText,
            'recommendations' => $recommendations,
            'assumptions' => $assumptions,
            'top_markets' => $topMarkets,
            'pricing_advice' => is_string($parsed['pricing_advice'] ?? null)
                ? trim((string) $parsed['pricing_advice'])
                : null,
            'restock_advice' => is_string($parsed['restock_advice'] ?? null)
                ? trim((string) $parsed['restock_advice'])
                : null,
            'reorder_deadline_days' => $reorderDeadlineDays,
            'recommended_order_quantity' => $recommendedOrderQuantity,
            'order_recommendation' => $orderRecommendation,
            'order_rationale' => $orderRationale,
            'seasonality_summary' => is_string($parsed['seasonality_summary'] ?? null)
                ? trim((string) $parsed['seasonality_summary'])
                : null,
            'seasonality_best_period' => is_string($parsed['seasonality_best_period'] ?? null)
                ? trim((string) $parsed['seasonality_best_period'])
                : null,
            'product_health' => $this->sanitizeEnum(
                $parsed['product_health'] ?? null,
                ['strong', 'stable', 'weak'],
                'stable'
            ),
            'product_health_reason' => is_string($parsed['product_health_reason'] ?? null)
                ? trim((string) $parsed['product_health_reason'])
                : null,
            'business_profile' => $profile,
            'payload' => $payload,
        ];
    }

    private function floatOrNull(mixed $value): ?float
    {
        if ($value === null) {
            return null;
        }

        if (is_string($value) && $value === '') {
            return null;
        }

        if (! is_numeric($value)) {
            return null;
        }

        return (float) $value;
    }

    /**
     * @param  mixed  $value
     * @return list<string>
     */
    private function normalizeStringArray(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return collect($value)
            ->filter(fn ($item) => is_string($item))
            ->map(fn (string $item) => trim($item))
            ->filter()
            ->values()
            ->all();
    }

    /**
     * @param  mixed  $value
     * @return list<array{market: string, performance_label: string, share?: float|null, comment?: string|null}>
     */
    private function normalizeMarkets(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return collect($value)
            ->filter(fn ($entry) => is_array($entry) && isset($entry['market'], $entry['performance_label']))
            ->map(function (array $entry) {
                $market = trim((string) ($entry['market'] ?? ''));
                $label = trim((string) ($entry['performance_label'] ?? ''));

                if ($market === '' || $label === '') {
                    return null;
                }

                $share = $entry['share'] ?? null;
                $comment = $entry['comment'] ?? null;

                return [
                    'market' => $market,
                    'performance_label' => $label,
                    'share' => $this->floatOrNull($share),
                    'comment' => is_string($comment) ? trim($comment) : null,
                ];
            })
            ->filter()
            ->values()
            ->all();
    }

    /**
     * @return array{total_quantity: float|null, deliveries: list<array{quantity: float, expected_arrival_at: string|null, ordered_at: string|null}>}
     */
    private function resolveIncomingStock(ProductVariant $variant): array
    {
        $deliveries = InventoryPurchaseOrderItem::query()
            ->select([
                DB::raw('SUM(inventory_purchase_order_items.quantity) AS quantity'),
                'inventory_purchase_orders.expected_arrival_at',
                'inventory_purchase_orders.ordered_at',
                'inventory_purchase_orders.id',
            ])
            ->join(
                'inventory_purchase_orders',
                'inventory_purchase_orders.id',
                '=',
                'inventory_purchase_order_items.purchase_order_id'
            )
            ->where(function ($query) use ($variant) {
                $query->where('inventory_purchase_order_items.product_variant_id', $variant->id);

                if ($variant->code) {
                    $query->orWhere('inventory_purchase_order_items.variant_code', $variant->code);
                }
            })
            ->groupBy([
                'inventory_purchase_orders.id',
                'inventory_purchase_orders.expected_arrival_at',
                'inventory_purchase_orders.ordered_at',
            ])
            ->orderBy('inventory_purchase_orders.expected_arrival_at')
            ->get()
            ->map(function ($row) {
                $quantity = isset($row->quantity) ? (float) $row->quantity : 0.0;
                $expected = $row->expected_arrival_at
                    ? CarbonImmutable::parse($row->expected_arrival_at)->toDateString()
                    : null;
                $ordered = $row->ordered_at
                    ? CarbonImmutable::parse($row->ordered_at)->toDateString()
                    : null;

                return [
                    'quantity' => $quantity,
                    'expected_arrival_at' => $expected,
                    'ordered_at' => $ordered,
                ];
            })
            ->filter(fn (array $delivery) => $delivery['quantity'] > 0)
            ->values();

        return [
            'total_quantity' => $deliveries->sum('quantity') ?: null,
            'deliveries' => $deliveries->all(),
        ];
    }

    private function sanitizeEnum(mixed $value, array $allowed, string $fallback): string
    {
        if (is_string($value) && in_array($value, $allowed, true)) {
            return $value;
        }

        return $fallback;
    }
}
