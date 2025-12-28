<?php

namespace Modules\Inventory\Services;

use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Modules\Core\Services\SettingsService;
use Modules\Inventory\Support\InventoryVariantContext;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ProductVariant;

class InventoryRecommendationService
{
    private const SETTINGS_KEY = 'inventory_recommendation_config';

    private const DEFAULT_SETTINGS = [
        'descriptors' => [
            'inspirovano' => 500,
            'podobne' => 500,
        ],
        'filters' => [
            'znacka' => 300,
            'znacka-2' => 300,
            'pohlavi' => 200,
            'gender' => 200,
            'default' => 10,
            'dominantni-ingredience' => 4,
            'druh-vune' => 3,
            'rocni-obdobi' => 2,
            'slozeni' => 1,
        ],
        'related_products' => [
            'physical' => 3,
            'reciprocal' => 2,
            'default' => 1,
        ],
        'sets' => [
            'containing_set_weight' => 4,
            'component_weight' => 3,
            'shared_membership_weight' => 2,
        ],
        'stock' => [
            'must_have_stock' => true,
            'weight' => 1.0,
        ],
        'sales' => [
            'last_30_quantity_weight' => 0.8,
            'last_90_quantity_weight' => 0.4,
        ],
        'price' => [
            'allowed_diff_percent' => 25,
            'match_weight' => 2,
            'cheaper_bonus' => 1,
        ],
        'name_similarity' => [
            'min_score' => 0.6,
            'weight' => 2,
            'number_weight' => 1.5,
        ],
        'candidate_limit' => 120,
    ];

    public function __construct(
        private readonly SettingsService $settings,
        private readonly InventoryMetricsService $metricsService
    ) {
    }

    private function normalizeBrand(?string $brand): ?string
    {
        if (! is_string($brand)) {
            return null;
        }
        $trimmed = trim($brand);
        if ($trimmed === '') {
            return null;
        }
        return Str::upper(Str::ascii($trimmed));
    }

    private function normalizeInspiration(?string $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        if ($trimmed === '') {
            return null;
        }

        return Str::upper(Str::ascii($trimmed));
    }

    private function escapeForLike(string $value): string
    {
        return str_replace(['%', '_'], ['\\%', '\\_'], $value);
    }

    public function getConfiguration(): array
    {
        $config = $this->settings->getJson(self::SETTINGS_KEY, self::DEFAULT_SETTINGS);

        return array_replace_recursive(self::DEFAULT_SETTINGS, $config);
    }

    public function saveConfiguration(array $payload): array
    {
        $merged = array_replace_recursive(self::DEFAULT_SETTINGS, $payload);
        $normalized = $this->normalizeConfiguration($merged);

        $this->settings->setJson(self::SETTINGS_KEY, $normalized);

        return $normalized;
    }

    /**
     * Special mode: recommend only by shared inspiration/podobne, optionally filtered to fragrance/non-fragrance.
     *
     * @param  ProductVariant  $variant
     * @param  int  $limit
     * @param  string  $type  fragrance|nonfragrance
     * @return array<int, array<string, mixed>>
     */
    public function recommendByInspirationType(ProductVariant $variant, int $limit = 6, string $type = 'fragrance'): array
    {
        $limit = max(1, $limit);
        $settings = $this->getConfiguration();
        $startedAt = microtime(true);
        $timeBudgetSeconds = 12.0;
        $selectedIds = [];
        $selectedProductIds = [];

        $baseContext = InventoryVariantContext::build($variant);
        $baseProduct = $variant->relationLoaded('product')
            ? $variant->product
            : $variant->product()->with('shop')->first();

        $baseInspiration = array_values(array_unique(array_merge(
            $baseContext['descriptors']['inspired'] ?? [],
            $baseContext['descriptors']['similar'] ?? []
        )));
        $baseInspirationNormalized = [];
        $baseInspirationMap = [];
        foreach ($baseInspiration as $value) {
            $normalized = $this->normalizeInspiration($value);
            if (! $normalized) {
                continue;
            }
            $baseInspirationNormalized[] = $normalized;
            $baseInspirationMap[$normalized] = $value;
        }

        $baseFilters = $baseContext['filter_parameters'] ?? [];
        $baseRelated = $baseContext['related_products'] ?? [];
        $baseSetItems = $this->extractSetItems($baseProduct);
        $baseSetMemberships = $this->resolveSetMemberships($baseProduct?->external_guid);
        $baseProductGuid = $baseProduct?->external_guid;
        if ($baseProduct?->id) {
            $selectedProductIds[] = $baseProduct->id;
        }

        $baseBrand = $this->normalizeBrand($variant->brand ?? $baseProduct?->base_payload['brand']['name'] ?? null);

        $candidateQuery = ProductVariant::query()
            ->with(['product'])
            ->whereKeyNot($variant->getKey());

        if ($baseProduct?->shop_id) {
            $candidateQuery->whereHas('product', fn ($q) => $q->where('shop_id', $baseProduct->shop_id));
        }

        if ($baseInspirationNormalized === []) {
            return [];
        }

        $candidateQuery->whereHas('product', function ($q) use ($baseInspiration) {
            $q->where(function ($inner) use ($baseInspiration) {
                foreach ($baseInspiration as $needle) {
                    if (! is_string($needle) || trim($needle) === '') {
                        continue;
                    }
                    $pattern = '%'.$this->escapeForLike($needle).'%';
                    $inner->orWhereRaw("base_payload::text ILIKE ?", [$pattern]);
                }
            });
        });

        // For inspiration-only mode we need a broad pool so položky se stejnou inspirací nevypadnou.
        $candidateLimit = 2000;
        $candidates = $candidateQuery
            ->limit($candidateLimit)
            ->get();

        $recommendations = [];

        $processCandidates = function (string $typeFilter) use (
            &$recommendations,
            &$selectedIds,
            &$selectedProductIds,
            $candidates,
            $variant,
            $baseInspirationNormalized,
            $baseInspirationMap,
            $limit,
            $settings,
            $timeBudgetSeconds,
            $startedAt,
            $baseFilters,
            $baseBrand
        ) {
            foreach ($candidates as $candidate) {
                if ((microtime(true) - $startedAt) > $timeBudgetSeconds) {
                    break;
                }
                if (count($recommendations) >= $limit) {
                    break;
                }

                if ($candidate->id === $variant->id || in_array($candidate->id, $selectedIds, true)) {
                    continue;
                }

                $candidateProductId = $candidate->product_id ?? ($candidate->product?->id ?? null);
                if ($candidateProductId !== null && in_array($candidateProductId, $selectedProductIds, true)) {
                    continue;
                }

                $candidateContext = InventoryVariantContext::build($candidate);
                $candidateDescriptors = $candidateContext['descriptors'] ?? ['inspired' => [], 'similar' => []];
                $candidateInspiration = array_values(array_unique(array_merge(
                    $candidateDescriptors['inspired'] ?? [],
                    $candidateDescriptors['similar'] ?? []
                )));

                $candidateNormalized = [];
                $candidateMap = [];
                foreach ($candidateInspiration as $value) {
                    $normalized = $this->normalizeInspiration($value);
                    if (! $normalized) {
                        continue;
                    }
                    $candidateNormalized[] = $normalized;
                    $candidateMap[$normalized] = $value;
                }

                $intersectionNormalized = array_values(array_intersect($baseInspirationNormalized, $candidateNormalized));
                if ($intersectionNormalized === []) {
                    continue;
                }

                $intersection = [];
                foreach ($intersectionNormalized as $normalized) {
                    $intersection[] = $candidateMap[$normalized] ?? $baseInspirationMap[$normalized] ?? $normalized;
                }
                if ($intersection === []) {
                    continue;
                }

                $isFragrance = $this->isFragranceContext($candidateContext, $candidate);
                if ($typeFilter === 'fragrance' && ! $isFragrance) {
                    continue;
                }
                if ($typeFilter === 'nonfragrance' && $isFragrance) {
                    continue;
                }

                $score = count($intersection) * 1000;
                $matches = [
                    'descriptors' => [
                        [
                            'type' => 'inspiration',
                            'values' => $intersection,
                            'score' => $score,
                        ],
                    ],
                    'filters' => [],
                    'related_products' => [],
                    'sets' => [],
                ];

                $candidateProduct = $candidate->relationLoaded('product')
                    ? $candidate->product
                    : $candidate->product()->first();
                $candidateFilters = $candidateContext['filter_parameters'] ?? [];
                $brandIntersection = $this->intersectBrandFilters($baseFilters, $candidateFilters);
                if ($brandIntersection !== []) {
                    $matches['filters'][] = [
                        'name' => 'Značka',
                        'values' => $brandIntersection,
                        'score' => (float) ($settings['filters']['znacka'] ?? 300),
                        'type' => 'brand',
                    ];
                    $score += (float) ($settings['filters']['znacka'] ?? 300);
                } elseif ($baseBrand && $this->normalizeBrand($candidate->brand ?? $candidateProduct?->base_payload['brand']['name'] ?? null) === $baseBrand) {
                    $matches['filters'][] = [
                        'name' => 'Značka',
                        'values' => [$candidate->brand ?? $candidateProduct?->base_payload['brand']['name'] ?? $baseBrand],
                        'score' => (float) ($settings['filters']['znacka'] ?? 300),
                        'type' => 'brand',
                    ];
                    $score += (float) ($settings['filters']['znacka'] ?? 300);
                }

                $recommendations[] = [
                    'variant' => $this->transformCandidate($candidate, []),
                    'score' => $score,
                    'breakdown' => [
                        'descriptors' => $score,
                        'filters' => 0.0,
                        'related_products' => 0.0,
                        'sets' => 0.0,
                        'stock' => 0.0,
                        'sales' => 0.0,
                        'price' => 0.0,
                        'name' => 0.0,
                    ],
                    'matches' => $matches,
                ];
                $selectedIds[] = $candidate->id;
                if ($candidateProductId !== null) {
                    $selectedProductIds[] = $candidateProductId;
                }
            }
        };

        // Primary pass enforces requested type.
        $processCandidates($type);

        // If we still do not have enough, broaden type filter to keep carousel filled.
        if (count($recommendations) < $limit && $type !== 'any') {
            $processCandidates('any');
        }

        usort($recommendations, static fn ($a, $b) => ($b['score'] ?? 0) <=> ($a['score'] ?? 0));

        return array_slice($recommendations, 0, $limit);
    }

    /**
     * @return array<int, array{
     *     variant: array<string, mixed>,
     *     score: float,
     *     breakdown: array<string, float>,
     *     matches: array<string, mixed>
     * }>
     */
    public function recommend(ProductVariant $variant, int $limit = 6): array
    {
        $limit = max(1, $limit);
        $startedAt = microtime(true);
        // Allow more time during offline generation to cover wider candidate set.
        $timeBudgetSeconds = 10.0;

        $settings = $this->getConfiguration();
        $baseContext = InventoryVariantContext::build($variant);
        $baseDescriptors = $baseContext['descriptors'] ?? ['inspired' => [], 'similar' => []];
        $baseFilters = $baseContext['filter_parameters'] ?? [];
        $baseRelated = $baseContext['related_products'] ?? [];
        $basePrice = (float) ($baseContext['base_price'] ?? 0.0);
        $baseInspiration = array_values(array_unique(array_merge(
            $baseDescriptors['inspired'] ?? [],
            $baseDescriptors['similar'] ?? []
        )));
        $baseInspirationNormalized = array_filter(array_map([$this, 'normalizeInspiration'], $baseInspiration));

        $baseProduct = $variant->relationLoaded('product')
            ? $variant->product
            : $variant->product()->with('shop')->first();

        $candidateQuery = ProductVariant::query()
            ->with(['product'])
            ->whereKeyNot($variant->getKey());

        if ($baseProduct?->shop_id) {
            $candidateQuery->whereHas('product', fn ($q) => $q->where('shop_id', $baseProduct->shop_id));
        }

        $baseBrand = $this->normalizeBrand($variant->brand ?? $baseProduct?->base_payload['brand']['name'] ?? null);

        // Allow a larger candidate pool so inspirace-matchující položky (např. KV005) nepropadnou kvůli pořadí ID.
        $candidateLimit = (int) min(2000, max(200, (int) ($settings['candidate_limit'] ?? 120)));
        $priorityCandidates = collect();
        if ($baseInspirationNormalized !== []) {
            ProductVariant::query()
                ->with('product')
                ->whereKeyNot($variant->getKey())
                ->chunk(500, function (Collection $chunk) use (&$priorityCandidates, $baseInspirationNormalized, $timeBudgetSeconds, $startedAt, $limit, $baseProduct) {
                    if ((microtime(true) - $startedAt) > $timeBudgetSeconds) {
                        return false;
                    }
                    foreach ($chunk as $candidate) {
                        if ($priorityCandidates->count() >= $limit * 5) {
                            return false;
                        }
                        if ($baseProduct?->shop_id && $candidate->product?->shop_id && $candidate->product->shop_id !== $baseProduct->shop_id) {
                            continue;
                        }
                        $candidateContext = InventoryVariantContext::build($candidate);
                        $candDescriptors = $candidateContext['descriptors'] ?? ['inspired' => [], 'similar' => []];
                        $candInspiration = array_values(array_unique(array_merge(
                            $candDescriptors['inspired'] ?? [],
                            $candDescriptors['similar'] ?? []
                        )));
                        $candNormalized = array_filter(array_map([$this, 'normalizeInspiration'], $candInspiration));
                        if ($candNormalized === []) {
                            continue;
                        }
                        $intersection = array_intersect($baseInspirationNormalized, $candNormalized);
                        if ($intersection !== []) {
                            $priorityCandidates->push($candidate);
                        }
                    }
                    return true;
                });
        }

        $candidateVariants = $priorityCandidates
            ->merge(
                $candidateQuery
                    ->limit($candidateLimit)
                    ->get()
            )
            ->unique('id')
            ->values();

        if ($candidateVariants->isEmpty()) {
            return [];
        }

        $baseSetItems = $this->extractSetItems($baseProduct);
        $baseSetMemberships = $this->resolveSetMemberships($baseProduct?->external_guid);
        $baseVariantCode = $variant->code;
        $baseProductGuid = $baseProduct?->external_guid;
        $baseNameTokens = $this->normalizeNameTokens(
            $variant->name ?? $baseProduct?->base_payload['name'] ?? null,
            $variant->brand ?? $baseProduct?->base_payload['brand']['name'] ?? null
        );
        $baseNumbers = $this->extractNumbers(
            $variant->code,
            $variant->name,
            $baseProduct?->base_payload['name'] ?? null
        );

        $baseRelatedLookup = collect($baseRelated)
            ->mapWithKeys(fn ($item) => [$item['guid'] => $item])
            ->all();

        $basePrice = (float) ($baseContext['base_price'] ?? 0.0);

        $recommendations = [];

        foreach ($candidateVariants as $candidate) {
            if ((microtime(true) - $startedAt) > $timeBudgetSeconds) {
                break;
            }

            if (count($recommendations) >= $limit) {
                break;
            }
            if ($candidate->id === $variant->id) {
                continue;
            }

            $candidateContext = InventoryVariantContext::build($candidate);
            $candidateDescriptors = $candidateContext['descriptors'] ?? ['inspired' => [], 'similar' => []];
            $candidateFilters = $candidateContext['filter_parameters'] ?? [];
            $candidatePrice = (float) ($candidateContext['base_price'] ?? 0.0);

            if (($settings['stock']['must_have_stock'] ?? false) && (float) ($candidate->stock ?? 0) <= 0) {
                continue;
            }

            $summary = $this->metricsService->summarize($candidate);

            $candidateProduct = $candidate->relationLoaded('product')
                ? $candidate->product
                : $candidate->product()->first();

            $score = 0.0;
            $breakdown = [
                'descriptors' => 0.0,
                'filters' => 0.0,
                'related_products' => 0.0,
                'sets' => 0.0,
                'stock' => 0.0,
                'sales' => 0.0,
                'price' => 0.0,
                'name' => 0.0,
            ];

        $matches = [
            'descriptors' => [],
            'filters' => [],
            'related_products' => [],
            'sets' => [],
            'name' => null,
        ];

            // Prioritize inspiration/podobne matches above everything else.
            $inspirationWeight = max(
                (float) ($settings['descriptors']['inspiration'] ?? 0),
                (float) ($settings['descriptors']['inspirovano'] ?? 0),
                (float) ($settings['descriptors']['podobne'] ?? 0)
            );
            $baseInspiration = array_values(array_unique(array_merge(
                $baseDescriptors['inspired'] ?? [],
                $baseDescriptors['similar'] ?? []
            )));
            $candidateInspiration = array_values(array_unique(array_merge(
                $candidateDescriptors['inspired'] ?? [],
                $candidateDescriptors['similar'] ?? []
            )));
            $inspirationIntersection = array_values(array_intersect($baseInspiration, $candidateInspiration));
            if ($inspirationIntersection !== [] && $inspirationWeight > 0) {
                $part = count($inspirationIntersection) * $inspirationWeight;
                $breakdown['descriptors'] += $part;
                $score += $part;
                $matches['descriptors'][] = [
                    'type' => 'inspiration',
                    'values' => $inspirationIntersection,
                    'score' => $part,
                ];
            }

            foreach ($baseFilters as $slug => $filter) {
                $slugNormalized = (string) $slug;
            $candidateFilter = $candidateFilters[$slug] ?? null;
            if (! $candidateFilter) {
                continue;
            }

            $baseValues = $filter['values'] ?? [];
            $candidateValues = $candidateFilter['values'] ?? [];
            if (str_contains($slugNormalized, 'pohl') || str_contains($slugNormalized, 'gender')) {
                $intersection = $this->intersectGenderValues($baseValues, $candidateValues);
            } else {
                $intersection = array_values(array_intersect($baseValues, $candidateValues));
            }
            if ($intersection === []) {
                continue;
            }

                $filtersConfig = $settings['filters'] ?? [];
                $weight = 0.0;
                $matchType = 'filter';

                // Brand (znacka / znacka-2) should strongly influence the score.
                if (str_contains($slugNormalized, 'znacka')) {
                    $weight = (float) ($filtersConfig[$slugNormalized]
                        ?? $filtersConfig['znacka']
                        ?? $filtersConfig['znacka-2']
                        ?? 300.0);
                    $matchType = 'brand';
                }

                // Gender has higher importance after inspiration and brand.
                if ($weight === 0.0 && (str_contains($slugNormalized, 'pohl') || str_contains($slugNormalized, 'gender'))) {
                    $weight = (float) ($filtersConfig[$slugNormalized]
                        ?? $filtersConfig['pohlavi']
                        ?? $filtersConfig['gender']
                        ?? 200.0);
                    $matchType = 'gender';
                }

                // Other filters get a small weight just to break ties.
                if ($weight === 0.0) {
                    $weight = (float) ($filtersConfig[$slugNormalized] ?? ($filtersConfig['default'] ?? 10.0));
                }

                $part = count($intersection) * $weight;
                $breakdown['filters'] += $part;
                $score += $part;
                $matches['filters'][] = [
                    'name' => $filter['name'],
                    'values' => $intersection,
                    'score' => $part,
                    'type' => $matchType,
                ];
            }

            $candidateProductGuid = $candidateProduct?->external_guid;

            if ($candidateProductGuid && isset($baseRelatedLookup[$candidateProductGuid])) {
                $meta = $baseRelatedLookup[$candidateProductGuid];
                $linkType = $meta['link_type'] ?? 'default';
                $weight = (float) ($settings['related_products'][$linkType] ?? ($settings['related_products']['default'] ?? 0));
                if ($weight > 0) {
                    $breakdown['related_products'] += $weight;
                    $score += $weight;
                    $matches['related_products'][] = [
                        'guid' => $candidateProductGuid,
                        'link_type' => $linkType,
                        'priority' => $meta['priority'] ?? null,
                        'visibility' => $meta['visibility'] ?? null,
                        'score' => $weight,
                    ];
                }
            }

            $candidateSetItems = $this->extractSetItems($candidateProduct);
            $candidateSetMemberships = $this->resolveSetMemberships($candidateProductGuid);

            if ($candidateSetItems && $this->setItemsContain($candidateSetItems, $baseProductGuid, $baseVariantCode)) {
                $weight = (float) ($settings['sets']['containing_set_weight'] ?? 0);
                if ($weight > 0) {
                    $breakdown['sets'] += $weight;
                    $score += $weight;
                    $matches['sets'][] = [
                        'type' => 'contains_base',
                        'set' => [
                            'guid' => $candidateProductGuid,
                            'name' => $candidateProduct?->base_payload['name'] ?? $candidateProduct?->name,
                        ],
                        'score' => $weight,
                    ];
                }
            }

            if ($baseSetItems && $this->setItemsContain($baseSetItems, $candidateProductGuid, $candidate->code)) {
                $weight = (float) ($settings['sets']['component_weight'] ?? 0);
                if ($weight > 0) {
                    $breakdown['sets'] += $weight;
                    $score += $weight;
                    $matches['sets'][] = [
                        'type' => 'is_component',
                        'set' => [
                            'guid' => $baseProductGuid,
                            'name' => $baseProduct?->base_payload['name'] ?? $baseProduct?->name,
                        ],
                        'score' => $weight,
                    ];
                }
            }

            if ($baseSetMemberships && $candidateSetMemberships) {
                $sharedSets = array_intersect_key($baseSetMemberships, $candidateSetMemberships);
                if ($sharedSets !== []) {
                    $baseWeight = (float) ($settings['sets']['shared_membership_weight'] ?? 0);
                    if ($baseWeight > 0) {
                        foreach ($sharedSets as $guid => $meta) {
                            $breakdown['sets'] += $baseWeight;
                            $score += $baseWeight;
                            $matches['sets'][] = [
                                'type' => 'shared_membership',
                                'set' => $meta,
                                'score' => $baseWeight,
                            ];
                        }
                    }
                }
            }

            $stockWeight = (float) ($settings['stock']['weight'] ?? 0);
            if ($stockWeight > 0) {
                $stockValue = max((float) ($candidate->stock ?? 0), 0.0);
                $runway = (float) ($summary['stock_runway_days'] ?? 0.0);
                $stockScore = $stockWeight * (($stockValue > 0 ? 1.0 : 0.0) + min($runway / 60.0, 1.0));
                if ($stockScore > 0) {
                    $breakdown['stock'] += $stockScore;
                    $score += $stockScore;
                }
            }

            $salesScore = 0.0;
            $last30Weight = (float) ($settings['sales']['last_30_quantity_weight'] ?? 0);
            $last90Weight = (float) ($settings['sales']['last_90_quantity_weight'] ?? 0);

            if ($last30Weight !== 0.0) {
                $salesScore += $last30Weight * (float) ($summary['last_30_quantity'] ?? 0.0);
            }
            if ($last90Weight !== 0.0) {
                $salesScore += $last90Weight * (float) ($summary['last_90_quantity'] ?? 0.0);
            }
            if ($salesScore > 0) {
                $breakdown['sales'] += $salesScore;
                $score += $salesScore;
            }

            // Price similarity and name similarity are intentionally ignored for recommendations.

            if ($score <= 0) {
                continue;
            }

            $recommendations[] = [
                'variant' => $this->transformCandidate($candidate, $summary),
                'score' => $score,
                'breakdown' => $breakdown,
                'matches' => $matches,
            ];
        }

        if ($recommendations === []) {
            return [];
        }

        usort($recommendations, function ($left, $right) {
            return $right['score'] <=> $left['score'];
        });

        return array_slice($recommendations, 0, $limit);
    }

    /**
     * @param  array<int, string|int|float>  $left
     * @param  array<int, string|int|float>  $right
     * @return array<int, string|int|float>
     */
    private function intersectGenderValues(array $left, array $right): array
    {
        $normalize = static function ($value): ?string {
            if (! is_string($value) && ! is_numeric($value)) {
                return null;
            }
            $normalized = Str::lower(Str::ascii(trim((string) $value)));
            return $normalized === '' ? null : $normalized;
        };

        $leftNormalized = [];
        foreach ($left as $value) {
            $n = $normalize($value);
            if ($n !== null) {
                $leftNormalized[$n] = $value;
            }
        }

        $rightNormalized = [];
        foreach ($right as $value) {
            $n = $normalize($value);
            if ($n !== null) {
                $rightNormalized[$n] = $value;
            }
        }

        if ($leftNormalized === [] || $rightNormalized === []) {
            return [];
        }

        $result = [];
        foreach ($leftNormalized as $normalizedLeft => $rawLeft) {
            foreach ($rightNormalized as $normalizedRight => $rawRight) {
                if ($normalizedLeft === $normalizedRight || $normalizedLeft === 'unisex' || $normalizedRight === 'unisex') {
                    $result[] = $rawLeft;
                    break;
                }
            }
        }

        return array_values(array_unique($result, SORT_REGULAR));
    }

    private function isFragranceContext(array $context, ?ProductVariant $variant = null): bool
    {
        $isNonFragranceKeyword = static function (string $value): bool {
            return str_contains($value, 'pran')
                || str_contains($value, 'praní')
                || str_contains($value, 'praci')
                || str_contains($value, 'prací')
                || str_contains($value, 'laundr')
                || str_contains($value, 'wash')
                || str_contains($value, 'aviv')
                || str_contains($value, 'soft')
                || str_contains($value, 'auto')
                || str_contains($value, 'auta')
                || str_contains($value, 'car')
                || str_contains($value, 'mlek')
                || str_contains($value, 'milk')
                || str_contains($value, 'osvez')
                || str_contains($value, 'osvie')
                || str_contains($value, 'candle')
                || str_contains($value, 'svick')
                || str_contains($value, 'gel')
                || str_contains($value, 'sprch')
                || str_contains($value, 'bath')
                || str_contains($value, 'mydl')
                || str_contains($value, 'soap');
        };

        $filters = $context['filter_parameters'] ?? [];
        foreach ($filters as $slug => $meta) {
            $slugStr = is_string($slug) ? Str::lower(Str::ascii($slug)) : '';
            $nameStr = is_string($meta['name'] ?? null) ? Str::lower(Str::ascii((string) $meta['name'])) : '';
            if (
                str_contains($slugStr, 'vune') ||
                str_contains($slugStr, 'parfum') ||
                str_contains($slugStr, 'parfem') ||
                str_contains($nameStr, 'vune') ||
                str_contains($nameStr, 'parfum') ||
                str_contains($nameStr, 'parfem')
            ) {
                if ($isNonFragranceKeyword($slugStr) || $isNonFragranceKeyword($nameStr)) {
                    continue;
                }
                return true;
            }
        }

        if ($variant) {
            $product = $variant->relationLoaded('product') ? $variant->product : $variant->product()->first();
            $payload = $product?->base_payload ?? [];
            $variantData = is_array($variant->data) ? $variant->data : [];
            $candidates = array_filter([
                $variant->name,
                $product?->base_payload['name'] ?? null,
                Arr::get($payload, 'metadata.product_subtitle'),
                Arr::get($payload, 'metadata.subtitle'),
                Arr::get($variantData, 'product_subtitle'),
                Arr::get($variantData, 'subtitle'),
            ]);

            foreach ($candidates as $rawName) {
                $normalized = Str::lower(Str::ascii((string) $rawName));
                if ($normalized === '') {
                    continue;
                }
                if ($isNonFragranceKeyword($normalized)) {
                    continue;
                }
                if (
                    str_contains($normalized, 'parfum') ||
                    str_contains($normalized, 'parfem') ||
                    str_contains($normalized, 'toalet') ||
                    str_contains($normalized, 'kolin') ||
                    str_contains($normalized, 'eau de p') ||
                    str_contains($normalized, 'eau de t') ||
                    str_contains($normalized, 'vune') ||
                    preg_match('/\\b(edp|edt|edc)\\b/i', $normalized)
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    private function transformCandidate(ProductVariant $variant, array $summary): array
    {
        $product = $variant->relationLoaded('product') ? $variant->product : $variant->product()->first();

        $metricsUpdatedAt = $summary['metrics_updated_at'] ?? null;
        return [
            'id' => $variant->id,
            'code' => $variant->code,
            'name' => $variant->name,
            'brand' => $variant->brand,
            'supplier' => $variant->supplier,
            'price' => $variant->price,
            'currency_code' => $variant->currency_code,
            'stock' => $variant->stock,
            'min_stock_supply' => $variant->min_stock_supply,
            'product' => $product ? [
                'id' => $product->id,
                'external_guid' => $product->external_guid,
                'name' => Arr::get($product->base_payload ?? [], 'name'),
                'status' => $product->status,
            ] : null,
            'metrics' => [
                'last_30_orders_count' => (int) ($summary['last_30_orders_count'] ?? 0),
                'last_30_quantity' => (float) ($summary['last_30_quantity'] ?? 0),
                'last_90_orders_count' => (int) ($summary['last_90_orders_count'] ?? 0),
                'last_90_quantity' => (float) ($summary['last_90_quantity'] ?? 0),
                'lifetime_orders_count' => (int) ($summary['lifetime_orders_count'] ?? 0),
                'lifetime_quantity' => (float) ($summary['lifetime_quantity'] ?? 0),
                'lifetime_revenue' => (float) ($summary['lifetime_revenue'] ?? 0),
                'average_daily_sales' => (float) ($summary['average_daily_sales'] ?? 0),
                'stock_runway_days' => $summary['stock_runway_days'] ?? null,
                'metrics_updated_at' => is_object($metricsUpdatedAt) && method_exists($metricsUpdatedAt, 'toIso8601String')
                    ? $metricsUpdatedAt->toIso8601String()
                    : null,
            ],
        ];
    }

    /**
     * @return array<int, array{guid: string|null, code: string|null, amount: float|null}>
     */
    private function extractSetItems(?Product $product): array
    {
        if (! $product) {
            return [];
        }

        $items = $product->base_payload['setItems'] ?? null;

        if (! is_array($items)) {
            return [];
        }

        return collect($items)
            ->filter(fn ($item) => is_array($item))
            ->map(function (array $item) {
                return [
                    'guid' => isset($item['guid']) && is_string($item['guid']) ? $item['guid'] : null,
                    'code' => isset($item['code']) && is_string($item['code']) ? $item['code'] : null,
                    'amount' => isset($item['amount']) && is_numeric($item['amount']) ? (float) $item['amount'] : null,
                ];
            })
            ->values()
            ->all();
    }

    private function setItemsContain(array $setItems, ?string $productGuid, ?string $variantCode): bool
    {
        foreach ($setItems as $item) {
            if ($productGuid && isset($item['guid']) && $item['guid'] === $productGuid) {
                return true;
            }

            if ($variantCode && isset($item['code']) && $item['code'] === $variantCode) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<string, array{guid: string, name: ?string}>
     */
    private function resolveSetMemberships(?string $productGuid): array
    {
        static $cache = [];

        if (! $productGuid) {
            return [];
        }

        if (isset($cache[$productGuid])) {
            return $cache[$productGuid];
        }

        $rows = Product::query()
            ->select(['external_guid', 'base_payload'])
            ->whereRaw("jsonb_typeof(COALESCE((base_payload::jsonb)->'setItems','[]'::jsonb)) = 'array'")
            ->whereRaw(
                "EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE((base_payload::jsonb)->'setItems','[]'::jsonb)) item WHERE item->>'guid' = ?)",
                [$productGuid]
            )
            ->limit(25)
            ->get();

        $cache[$productGuid] = $rows
            ->mapWithKeys(fn (Product $product) => [
                $product->external_guid => [
                    'guid' => $product->external_guid,
                    'name' => $product->base_payload['name'] ?? null,
                ],
            ])
            ->all();

        return $cache[$productGuid];
    }

    private function normalizeNameTokens(?string $name, ?string $brand): array
    {
        if (! is_string($name) || trim($name) === '') {
            return [];
        }

        $normalized = mb_strtolower($name, 'UTF-8');

        if ($brand) {
            $normalized = str_replace(mb_strtolower($brand, 'UTF-8'), ' ', $normalized);
        }

        $normalized = str_replace([
            'saphir',
            'pure',
            'parfum',
            'parfem',
            'parfém',
            'eau',
            'de',
            'set',
            'sada',
            'gift',
            'box',
            'dárková',
        ], ' ', $normalized);

        $tokens = preg_split('/[^a-z0-9]+/u', $normalized) ?: [];
        $tokens = array_filter($tokens, fn ($token) => $token !== '' && ! is_numeric($token));

        return array_slice(array_values(array_unique($tokens)), 0, 12);
    }

    private function extractNumbers(?string ...$values): array
    {
        $numbers = [];

        foreach ($values as $value) {
            if (! is_string($value)) {
                continue;
            }

            if (preg_match_all('/\d+/u', $value, $matches)) {
                foreach ($matches[0] as $match) {
                    $numbers[] = $match;
                }
            }
        }

        return array_slice(array_values(array_unique($numbers)), 0, 6);
    }

    private function computeNameSimilarity(array $baseTokens, array $candidateTokens): float
    {
        if ($baseTokens === [] || $candidateTokens === []) {
            return 0.0;
        }

        $intersection = array_values(array_intersect($baseTokens, $candidateTokens));

        if ($intersection === []) {
            return 0.0;
        }

        return count($intersection) / max(min(count($baseTokens), count($candidateTokens)), 1);
    }

    private function normalizeConfiguration(array $config): array
    {
        $descriptors = $this->normalizeWeightMap($config['descriptors'] ?? []);
        $filters = $this->normalizeWeightMap($config['filters'] ?? []);
        $relatedProducts = $this->normalizeWeightMap($config['related_products'] ?? []);
        $setsConfig = $config['sets'] ?? [];

        $stockConfig = $config['stock'] ?? [];
        $stockWeight = is_numeric($stockConfig['weight'] ?? null) ? (float) $stockConfig['weight'] : 0.0;

        $salesConfig = $config['sales'] ?? [];
        $last30 = is_numeric($salesConfig['last_30_quantity_weight'] ?? null)
            ? (float) $salesConfig['last_30_quantity_weight']
            : 0.0;
        $last90 = is_numeric($salesConfig['last_90_quantity_weight'] ?? null)
            ? (float) $salesConfig['last_90_quantity_weight']
            : 0.0;

        $priceConfig = $config['price'] ?? [];
        $allowedDiff = is_numeric($priceConfig['allowed_diff_percent'] ?? null)
            ? (float) $priceConfig['allowed_diff_percent']
            : (float) self::DEFAULT_SETTINGS['price']['allowed_diff_percent'];
        $matchWeight = is_numeric($priceConfig['match_weight'] ?? null)
            ? (float) $priceConfig['match_weight']
            : 0.0;
        $cheaperBonus = is_numeric($priceConfig['cheaper_bonus'] ?? null)
            ? (float) $priceConfig['cheaper_bonus']
            : 0.0;

        $candidateLimit = isset($config['candidate_limit']) && is_numeric($config['candidate_limit'])
            ? (int) max(1, min((int) $config['candidate_limit'], 500))
            : (int) self::DEFAULT_SETTINGS['candidate_limit'];

        $nameConfig = $config['name_similarity'] ?? [];
        $minNameScore = is_numeric($nameConfig['min_score'] ?? null)
            ? max(0.0, min(1.0, (float) $nameConfig['min_score']))
            : (float) self::DEFAULT_SETTINGS['name_similarity']['min_score'];
        $nameWeight = is_numeric($nameConfig['weight'] ?? null) ? (float) $nameConfig['weight'] : 0.0;
        $numberWeight = is_numeric($nameConfig['number_weight'] ?? null) ? (float) $nameConfig['number_weight'] : 0.0;

        return [
            'descriptors' => $descriptors,
            'filters' => $filters,
            'related_products' => $relatedProducts,
            'sets' => [
                'containing_set_weight' => is_numeric($setsConfig['containing_set_weight'] ?? null)
                    ? (float) $setsConfig['containing_set_weight']
                    : (float) self::DEFAULT_SETTINGS['sets']['containing_set_weight'],
                'component_weight' => is_numeric($setsConfig['component_weight'] ?? null)
                    ? (float) $setsConfig['component_weight']
                    : (float) self::DEFAULT_SETTINGS['sets']['component_weight'],
                'shared_membership_weight' => is_numeric($setsConfig['shared_membership_weight'] ?? null)
                    ? (float) $setsConfig['shared_membership_weight']
                    : (float) self::DEFAULT_SETTINGS['sets']['shared_membership_weight'],
            ],
            'stock' => [
                'must_have_stock' => (bool) ($stockConfig['must_have_stock'] ?? false),
                'weight' => $stockWeight,
            ],
            'sales' => [
                'last_30_quantity_weight' => $last30,
                'last_90_quantity_weight' => $last90,
            ],
            'price' => [
                'allowed_diff_percent' => $allowedDiff,
                'match_weight' => $matchWeight,
                'cheaper_bonus' => $cheaperBonus,
            ],
            'name_similarity' => [
                'min_score' => $minNameScore,
                'weight' => $nameWeight,
                'number_weight' => $numberWeight,
            ],
            'candidate_limit' => $candidateLimit,
        ];
    }

    private function normalizeWeightMap(array $items): array
    {
        $normalized = [];

        foreach ($items as $key => $value) {
            if (! is_string($key)) {
                continue;
            }

            $slug = trim(Str::slug($key, '-'));

            if ($slug === '') {
                continue;
            }

            if (! is_numeric($value)) {
                continue;
            }

            $normalized[$slug] = (float) $value;
        }

        return $normalized;
    }

    /**
     * @param array<string, mixed> $baseFilters
     * @param array<string, mixed> $candidateFilters
     * @return array<int, string>
     */
    private function intersectBrandFilters(array $baseFilters, array $candidateFilters): array
    {
        $extract = function (array $filters): array {
            $result = [];
            foreach ($filters as $slug => $meta) {
                if (! is_array($meta)) {
                    continue;
                }
                $slugStr = is_string($slug) ? Str::lower(Str::ascii($slug)) : '';
                $nameStr = is_string($meta['name'] ?? null) ? Str::lower(Str::ascii((string) $meta['name'])) : '';
                if (! str_contains($slugStr, 'znacka') && ! str_contains($nameStr, 'znacka')) {
                    continue;
                }
                foreach ($meta['values'] ?? [] as $value) {
                    if (! is_string($value) && ! is_numeric($value)) {
                        continue;
                    }
                    $normalized = $this->normalizeBrand((string) $value);
                    if ($normalized) {
                        $result[$normalized] = (string) $value;
                    }
                }
            }
            return $result;
        };

        $base = $extract($baseFilters);
        $candidate = $extract($candidateFilters);

        if ($base === [] || $candidate === []) {
            return [];
        }

        $intersection = [];
        foreach ($candidate as $normalized => $raw) {
            if (isset($base[$normalized])) {
                $intersection[] = $raw;
            }
        }

        return array_values(array_unique($intersection));
    }
}
