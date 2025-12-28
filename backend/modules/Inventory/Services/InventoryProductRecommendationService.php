<?php

namespace Modules\Inventory\Services;

use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Inventory\Models\InventoryProductRecommendation;
use Modules\Inventory\Models\InventoryVariantMetric;
use Modules\Pim\Models\Product;
use Modules\Inventory\Support\InventoryVariantContext;

class InventoryProductRecommendationService
{
    /**
     * @return array{products: int, related: int, recommended: int}
     */
    public function rebuild(int $limit = 10, int $chunkSize = 100, array $excludeKeywords = []): array
    {
        $limit = max(1, $limit);
        $chunkSize = max(10, $chunkSize);

        $metrics = $this->loadSalesScores();
        $contexts = $this->collectProductContexts($chunkSize, $metrics, $excludeKeywords);

        if ($contexts === []) {
            InventoryProductRecommendation::query()->delete();

            return [
                'products' => 0,
                'related' => 0,
                'recommended' => 0,
            ];
        }

        $inspirationIndex = $this->buildValueIndex($contexts, 'inspiration_normalized');
        $brandIndex = $this->buildValueIndex($contexts, 'brand_normalized');

        $relatedCount = 0;
        $recommendedCount = 0;

        foreach ($contexts as $productId => $context) {
            $related = $this->buildRelatedRecommendations($context, $contexts, $inspirationIndex, $limit);
            $recommended = $this->buildRecommendedProducts($context, $contexts, $brandIndex, $limit);

            $this->persistRecommendations($productId, $related, $recommended);

            $relatedCount += count($related);
            $recommendedCount += count($recommended);
        }

        return [
            'products' => count($contexts),
            'related' => $relatedCount,
            'recommended' => $recommendedCount,
        ];
    }

    /**
     * @param array<string, array<int, string>> $index
     */
    private function buildRelatedRecommendations(array $context, array $contexts, array $index, int $limit): array
    {
        $candidates = [];

        foreach ($context['inspiration_normalized'] as $value) {
            foreach ($index[$value] ?? [] as $productId) {
                if ($productId === $context['id']) {
                    continue;
                }
                $candidates[$productId] = true;
            }
        }

        if ($candidates === []) {
            return [];
        }

        $results = [];

        foreach (array_keys($candidates) as $productId) {
            $candidate = $contexts[$productId] ?? null;

            if (! $candidate) {
                continue;
            }

            $shared = array_values(array_intersect($context['inspiration_normalized'], $candidate['inspiration_normalized']));

            if ($shared === []) {
                continue;
            }

            $rawShared = $this->denormalizeValues($shared, $candidate['inspiration_lookup'] ?? [], $context['inspiration_lookup'] ?? []);
            $score = count($shared) * 500;
            $score += $this->scoreSalesBonus($candidate['sales_score']);

            $results[] = [
                'product_id' => $candidate['id'],
                'variant_id' => $candidate['variant']['id'] ?? null,
                'score' => $score,
                'sales_score' => $candidate['sales_score'],
                'matches' => [
                    'inspiration' => $rawShared,
                ],
            ];
        }

        usort($results, function ($left, $right) {
            $scoreDiff = ($right['score'] ?? 0) <=> ($left['score'] ?? 0);

            if ($scoreDiff !== 0) {
                return $scoreDiff;
            }

            return ($right['sales_score'] ?? 0) <=> ($left['sales_score'] ?? 0);
        });

        return array_slice($results, 0, $limit);
    }

    /**
     * @param array<string, array<int, string>> $index
     */
    private function buildRecommendedProducts(array $context, array $contexts, array $index, int $limit): array
    {
        $brandKey = $context['brand_normalized'] ?? null;
        $brandMatches = [];
        $otherMatches = [];
        $hasFeatureSet = $context['dominant_normalized'] !== []
            || $context['fragrance_normalized'] !== []
            || $context['season_normalized'] !== []
            || $context['category_normalized'] !== [];

        foreach ($contexts as $productId => $candidate) {
            if ($productId === ($context['id'] ?? null)) {
                continue;
            }

            // Avoid duplicates with related set – skip if inspiration matches.
            if (array_intersect($context['inspiration_normalized'], $candidate['inspiration_normalized']) !== []) {
                continue;
            }

            $dominant = $this->intersectValues($context['dominant_normalized'], $candidate['dominant_normalized']);
            $fragrance = $this->intersectValues($context['fragrance_normalized'], $candidate['fragrance_normalized']);
            $season = $this->intersectValues($context['season_normalized'], $candidate['season_normalized']);
            $categories = $this->intersectValues($context['category_normalized'], $candidate['category_normalized']);

            if ($hasFeatureSet && $dominant === [] && $fragrance === [] && $season === [] && $categories === []) {
                continue;
            }

            $rawDominant = $this->denormalizeValues($dominant, $candidate['dominant_lookup'] ?? [], $context['dominant_lookup'] ?? []);
            $rawFragrance = $this->denormalizeValues($fragrance, $candidate['fragrance_lookup'] ?? [], $context['fragrance_lookup'] ?? []);
            $rawSeason = $this->denormalizeValues($season, $candidate['season_lookup'] ?? [], $context['season_lookup'] ?? []);
            $rawCategories = $this->denormalizeValues($categories, $candidate['category_lookup'] ?? [], $context['category_lookup'] ?? []);

            $score = 0.0;
            $brandMatch = ($candidate['brand_normalized'] ?? null) === $brandKey;
            if ($brandMatch) {
                $score += 400.0;
            }
            $score += count($dominant) * 120.0;
            $score += count($fragrance) * 80.0;
            $score += count($season) * 40.0;
            $score += count($categories) * 60.0;
            $score += $this->scoreSalesBonus($candidate['sales_score']);

            $entry = [
                'product_id' => $candidate['id'],
                'variant_id' => $candidate['variant']['id'] ?? null,
                'score' => $score,
                'sales_score' => $candidate['sales_score'],
                'brand_normalized' => $candidate['brand_normalized'] ?? null,
                'matches' => [
                    'brand' => $brandMatch ? $candidate['brand'] : null,
                    'dominant_ingredients' => $rawDominant,
                    'fragrance_types' => $rawFragrance,
                    'seasons' => $rawSeason,
                    'categories' => $rawCategories,
                ],
            ];

            if ($brandMatch) {
                $brandMatches[] = $entry;
            } else {
                $otherMatches[] = $entry;
            }
        }

        $sorter = function ($left, $right) {
            $scoreDiff = ($right['score'] ?? 0) <=> ($left['score'] ?? 0);

            if ($scoreDiff !== 0) {
                return $scoreDiff;
            }

            return ($right['sales_score'] ?? 0) <=> ($left['sales_score'] ?? 0);
        };

        usort($brandMatches, $sorter);
        usort($otherMatches, $sorter);

        $perBrandLimit = 3;
        $selected = [];
        $seenProducts = [];

        foreach ($brandMatches as $entry) {
            if (count($selected) >= $limit) {
                break;
            }
            if (count($selected) >= $perBrandLimit) {
                break;
            }
            $pid = $entry['product_id'];
            if (isset($seenProducts[$pid])) {
                continue;
            }
            $seenProducts[$pid] = true;
            $selected[] = $entry;
        }

        foreach ($otherMatches as $entry) {
            if (count($selected) >= $limit) {
                break;
            }
            $pid = $entry['product_id'];
            if (isset($seenProducts[$pid])) {
                continue;
            }
            $seenProducts[$pid] = true;
            $selected[] = $entry;
        }

        return $selected;
    }

    private function persistRecommendations(string $productId, array $related, array $recommended): void
    {
        InventoryProductRecommendation::query()
            ->where('product_id', $productId)
            ->delete();

        $position = 0;

        foreach ($related as $entry) {
            InventoryProductRecommendation::create([
                'product_id' => $productId,
                'recommended_product_id' => $entry['product_id'],
                'recommended_variant_id' => $entry['variant_id'],
                'type' => InventoryProductRecommendation::TYPE_RELATED,
                'position' => $position++,
                'score' => $entry['score'],
                'matches' => $entry['matches'] ?? [],
            ]);
        }

        $position = 0;

        foreach ($recommended as $entry) {
            InventoryProductRecommendation::create([
                'product_id' => $productId,
                'recommended_product_id' => $entry['product_id'],
                'recommended_variant_id' => $entry['variant_id'],
                'type' => InventoryProductRecommendation::TYPE_RECOMMENDED,
                'position' => $position++,
                'score' => $entry['score'],
                'matches' => $entry['matches'] ?? [],
            ]);
        }
    }

    /**
     * @return array<string, array{
     *     id: string,
     *     brand: ?string,
     *     brand_normalized: ?string,
     *     inspiration_values: array<int, string>,
     *     inspiration_normalized: array<int, string>,
     *     inspiration_lookup: array<string, string>,
     *     dominant_values: array<int, string>,
     *     dominant_normalized: array<int, string>,
     *     dominant_lookup: array<string, string>,
     *     fragrance_values: array<int, string>,
     *     fragrance_normalized: array<int, string>,
     *     fragrance_lookup: array<string, string>,
     *     season_values: array<int, string>,
     *     season_normalized: array<int, string>,
     *     season_lookup: array<string, string>,
     *     category_values: array<int, string>,
     *     category_normalized: array<int, string>,
     *     category_lookup: array<string, string>,
     *     variant: array{id: string, code: string|null, name: string|null, brand: string|null, price: float|null, currency_code: string|null, stock: float|null, min_stock_supply: float|null}|null,
     *     sales_score: float
     * }>
     */
    private function collectProductContexts(int $chunkSize, array $metrics, array $excludeKeywords): array
    {
        $contexts = [];

        Product::query()
            ->with(['variants' => function ($query) {
                $query->select([
                    'id',
                    'product_id',
                    'code',
                    'name',
                    'brand',
                    'price',
                    'currency_code',
                    'stock',
                    'min_stock_supply',
                    'data',
                ]);
            }, 'overlays'])
            ->orderBy('id')
            ->chunk($chunkSize, function ($products) use (&$contexts, $metrics, $excludeKeywords) {
                foreach ($products as $product) {
                    if (! $product->relationLoaded('variants') || $product->variants->isEmpty()) {
                        continue;
                    }

                    $payloads = [];
                    $basePayload = $product->base_payload;

                    if (is_array($basePayload)) {
                        $payloads[] = $basePayload;
                    }

                    if ($product->relationLoaded('overlays')) {
                        foreach ($product->overlays as $overlay) {
                            if (is_array($overlay->data)) {
                                $payloads[] = $overlay->data;
                            }
                        }
                    }

                    $brand = $this->extractBrand($payloads, $product);
                    $brandNormalized = $this->normalizeString($brand);

                    $inspiration = $this->collectInspiration($payloads);
                    if ($inspiration['values'] === []) {
                        $contextInspiration = InventoryVariantContext::extractRelatedDescriptors($product)['values']['inspired'] ?? [];
                        if (is_array($contextInspiration) && $contextInspiration !== []) {
                            $inspiration = $this->normalizeValues($contextInspiration);
                        }
                    }
                    $dominant = $this->collectFilterValues($payloads, 'dominantni-ingredience');
                    $fragrance = $this->collectFilterValues($payloads, 'druh-vune');
                    $season = $this->collectFilterValues($payloads, 'rocni-obdobi');
                    $categories = $this->collectCategoryValues($payloads);

                    $variant = $this->pickDisplayVariant($product, $metrics, $brand);

                    if ($variant === null) {
                        continue;
                    }

                    $baseName = is_array($product->base_payload) ? ($product->base_payload['name'] ?? null) : null;

                    if ($this->containsExcludedStrings([
                        $brand,
                        $baseName,
                        $variant['name'] ?? null,
                        $variant['code'] ?? null,
                    ], $excludeKeywords)
                    ) {
                        continue;
                    }

                    $contexts[$product->id] = [
                        'id' => $product->id,
                        'brand' => $brand,
                        'brand_normalized' => $brandNormalized,
                        'inspiration_values' => $inspiration['values'],
                        'inspiration_normalized' => $inspiration['normalized'],
                        'inspiration_lookup' => $inspiration['lookup'],
                        'dominant_values' => $dominant['values'],
                        'dominant_normalized' => $dominant['normalized'],
                        'dominant_lookup' => $dominant['lookup'],
                        'fragrance_values' => $fragrance['values'],
                        'fragrance_normalized' => $fragrance['normalized'],
                        'fragrance_lookup' => $fragrance['lookup'],
                        'season_values' => $season['values'],
                        'season_normalized' => $season['normalized'],
                        'season_lookup' => $season['lookup'],
                        'category_values' => $categories['values'],
                        'category_normalized' => $categories['normalized'],
                        'category_lookup' => $categories['lookup'],
                        'variant' => $variant,
                        'sales_score' => $variant['sales_score'] ?? 0.0,
                    ];
                }
            });

        return $contexts;
    }

    private function extractBrand(array $payloads, Product $product): ?string
    {
        $brandFromFilters = $this->extractBrandFromFilters($payloads);
        if ($brandFromFilters) {
            return $brandFromFilters;
        }

        foreach ($payloads as $payload) {
            $brand = Arr::get($payload, 'brand.name') ?? Arr::get($payload, 'brand');

            if (is_string($brand) && trim($brand) !== '') {
                return trim($brand);
            }
        }

        foreach ($payloads as $payload) {
            $brand = Arr::get($payload, '_hub.brand.name') ?? Arr::get($payload, '_hub.brand');

            if (is_string($brand) && trim($brand) !== '') {
                return trim($brand);
            }
        }

        $variantBrand = $product->variants->firstWhere('brand', '!=', null)?->brand;

        return is_string($variantBrand) ? $variantBrand : null;
    }

    private function extractBrandFromFilters(array $payloads): ?string
    {
        $candidates = [];
        $slugs = ['znacka', 'znacka-2'];

        foreach ($payloads as $payload) {
            foreach (['filteringParameters', '_hub.suggestedFilters.filteringParameters'] as $path) {
                $entries = Arr::get($payload, $path, []);

                if (! is_array($entries)) {
                    continue;
                }

                foreach ($entries as $entry) {
                    if (! is_array($entry)) {
                        continue;
                    }

                    $slug = Str::slug((string) ($entry['code'] ?? $entry['name'] ?? ''));
                    if (! in_array($slug, $slugs, true)) {
                        continue;
                    }

                    $values = $this->extractFilterEntryValues($entry);
                    foreach ($values as $value) {
                        if (is_string($value) && trim($value) !== '') {
                            $candidates[] = trim($value);
                        }
                    }
                }
            }
        }

        if ($candidates === []) {
            return null;
        }

        return $candidates[0];
    }

    /**
     * @return array{values: array<int, string>, normalized: array<int, string>, lookup: array<string, string>}
     */
    private function collectInspiration(array $payloads): array
    {
        $values = [];

        foreach ($payloads as $payload) {
            $entries = Arr::get($payload, 'descriptiveParameters', []);

            if (is_array($entries)) {
                foreach ($entries as $entry) {
                    $values = array_merge($values, $this->extractInspirationValues($entry));
                }
            }

            $hubEntries = Arr::get($payload, '_hub.suggestedFilters.descriptiveParameters', []);

            if (is_array($hubEntries)) {
                foreach ($hubEntries as $entry) {
                    $values = array_merge($values, $this->extractInspirationValues($entry));
                }
            }
        }

        return $this->normalizeValues($values);
    }

    /**
     * @return array{values: array<int, string>, normalized: array<int, string>, lookup: array<string, string>}
     */
    private function collectCategoryValues(array $payloads): array
    {
        $values = [];

        foreach ($payloads as $payload) {
            $categories = Arr::get($payload, 'categories', []);
            if (is_array($categories)) {
                foreach ($categories as $category) {
                    if (is_array($category)) {
                        $name = Arr::get($category, 'name');
                        if (is_string($name) && trim($name) !== '') {
                            $values[] = trim($name);
                        }
                    } elseif (is_string($category) && trim($category) !== '') {
                        $values[] = trim($category);
                    }
                }
            }

            $defaultCategory = Arr::get($payload, 'defaultCategory');
            if (is_array($defaultCategory)) {
                $name = Arr::get($defaultCategory, 'name');
                if (is_string($name) && trim($name) !== '') {
                    $values[] = trim($name);
                }
            }

            foreach (['filteringParameters', '_hub.suggestedFilters.filteringParameters'] as $path) {
                $entries = Arr::get($payload, $path, []);

                if (! is_array($entries)) {
                    continue;
                }

                foreach ($entries as $entry) {
                    if (! is_array($entry)) {
                        continue;
                    }

                    $slug = Str::slug((string) ($entry['code'] ?? $entry['name'] ?? ''));
                    if ($slug === '') {
                        continue;
                    }

                    if (! (str_contains($slug, 'kategorie') || str_contains($slug, 'category'))) {
                        continue;
                    }

                    $values = array_merge($values, $this->extractFilterEntryValues($entry));
                }
            }
        }

        return $this->normalizeValues($values);
    }

    /**
     * @return array{values: array<int, string>, normalized: array<int, string>, lookup: array<string, string>}
     */
    private function collectFilterValues(array $payloads, string $targetCode): array
    {
        $values = [];
        $targetSlug = Str::slug($targetCode);

        foreach ($payloads as $payload) {
            $entries = Arr::get($payload, 'filteringParameters', []);

            if (is_array($entries)) {
                foreach ($entries as $entry) {
                    $slug = Str::slug((string) ($entry['code'] ?? $entry['name'] ?? ''));

                    if ($slug !== $targetSlug) {
                        continue;
                    }

                    $values = array_merge($values, $this->extractFilterEntryValues($entry));
                }
            }

            $hubEntries = Arr::get($payload, '_hub.suggestedFilters.filteringParameters', []);

            if (is_array($hubEntries)) {
                foreach ($hubEntries as $entry) {
                    $slug = Str::slug((string) ($entry['code'] ?? $entry['name'] ?? ''));

                    if ($slug !== $targetSlug) {
                        continue;
                    }

                    $values = array_merge($values, $this->extractFilterEntryValues($entry));
                }
            }
        }

        return $this->normalizeValues($values);
    }

    /**
     * @param array<int, string> $values
     * @return array{values: array<int, string>, normalized: array<int, string>, lookup: array<string, string>}
     */
    private function normalizeValues(array $values): array
    {
        $values = array_values(array_unique(array_filter($values, static fn ($value) => is_string($value) && trim($value) !== '')));

        $lookup = [];
        $normalized = [];

        foreach ($values as $value) {
            $normalizedValue = $this->normalizeString($value);
            if ($normalizedValue === null) {
                continue;
            }

            $normalized[] = $normalizedValue;
            if (! isset($lookup[$normalizedValue])) {
                $lookup[$normalizedValue] = $value;
            }
        }

        return [
            'values' => $values,
            'normalized' => array_values(array_unique($normalized)),
            'lookup' => $lookup,
        ];
    }

    private function pickDisplayVariant(Product $product, array $metrics, ?string $fallbackBrand): ?array
    {
        $best = null;

        foreach ($product->variants as $variant) {
            $variantMetrics = $metrics[$variant->id] ?? ['last_30_quantity' => 0.0, 'last_90_quantity' => 0.0, 'lifetime_quantity' => 0.0];

            $salesScore = $this->scoreSales(
                (float) ($variantMetrics['last_30_quantity'] ?? 0.0),
                (float) ($variantMetrics['last_90_quantity'] ?? 0.0),
                (float) ($variantMetrics['lifetime_quantity'] ?? 0.0)
            );

            $candidate = [
                'id' => $variant->id,
                'code' => $variant->code,
                'name' => $variant->name,
                'brand' => $variant->brand ?? $fallbackBrand,
                'price' => $variant->price,
                'currency_code' => $variant->currency_code,
                'stock' => $variant->stock,
                'min_stock_supply' => $variant->min_stock_supply,
                'sales_score' => $salesScore,
            ];

            if ($best === null) {
                $best = $candidate;
                continue;
            }

            $currentScore = $best['sales_score'] ?? 0.0;

            if ($salesScore > $currentScore) {
                $best = $candidate;
                continue;
            }

            if ($salesScore === $currentScore && (float) ($candidate['stock'] ?? 0) > (float) ($best['stock'] ?? 0)) {
                $best = $candidate;
            }
        }

        return $best;
    }

    private function containsExcludedStrings(array $candidates, array $keywords): bool
    {
        if ($keywords === []) {
            return false;
        }

        foreach ($candidates as $value) {
            if (! is_string($value)) {
                continue;
            }

            $normalized = Str::lower($value);

            foreach ($keywords as $keyword) {
                $keyword = Str::lower(trim($keyword));

                if ($keyword !== '' && Str::contains($normalized, $keyword)) {
                    return true;
                }
            }
        }

        return false;
    }

    private function extractInspirationValues(array $entry): array
    {
        $normalizedName = $this->normalizeString($entry['name'] ?? null);

        if ($normalizedName !== 'inspirovano') {
            return [];
        }

        $values = [];

        if (isset($entry['values']) && is_array($entry['values'])) {
            foreach ($entry['values'] as $valueEntry) {
                if (is_array($valueEntry)) {
                    $candidate = $valueEntry['value']
                        ?? $valueEntry['name']
                        ?? $valueEntry['displayName']
                        ?? $valueEntry['valueIndex']
                        ?? null;

                    if (is_string($candidate) && trim($candidate) !== '') {
                        $values[] = trim($candidate);
                    }
                } elseif (is_string($valueEntry) && trim($valueEntry) !== '') {
                    $values[] = trim($valueEntry);
                }
            }
        }

        if ($values === [] && isset($entry['value']) && is_string($entry['value'])) {
            $raw = trim($entry['value']);

            if ($raw !== '') {
                $values = array_values(array_filter(array_map('trim', preg_split('/[,;\r\n]+/', $raw) ?: [])));
            }
        }

        return $values;
    }

    private function extractFilterEntryValues(array $entry): array
    {
        $values = [];

        if (isset($entry['values']) && is_array($entry['values'])) {
            foreach ($entry['values'] as $valueEntry) {
                if (is_array($valueEntry)) {
                    $candidate = $valueEntry['name']
                        ?? $valueEntry['displayName']
                        ?? $valueEntry['value']
                        ?? $valueEntry['valueIndex']
                        ?? null;

                    if (is_string($candidate) && trim($candidate) !== '') {
                        $values[] = trim($candidate);
                    }
                } elseif (is_string($valueEntry) && trim($valueEntry) !== '') {
                    $values[] = trim($valueEntry);
                }
            }
        }

        if ($values === [] && isset($entry['value']) && is_string($entry['value'])) {
            $raw = trim($entry['value']);
            if ($raw !== '') {
                $values = array_values(array_filter(array_map('trim', preg_split('/[,;\r\n]+/', $raw) ?: [])));
            }
        }

        return $values;
    }

    private function loadSalesScores(): array
    {
        $scores = [];

        InventoryVariantMetric::query()
            ->select([
                'product_variant_id',
                DB::raw('SUM(last_30_quantity) as last_30_quantity'),
                DB::raw('SUM(last_90_quantity) as last_90_quantity'),
                DB::raw('SUM(lifetime_quantity) as lifetime_quantity'),
            ])
            ->groupBy('product_variant_id')
            ->orderBy('product_variant_id')
            ->chunk(500, function ($rows) use (&$scores) {
                foreach ($rows as $row) {
                    $scores[$row->product_variant_id] = [
                        'last_30_quantity' => (float) ($row->last_30_quantity ?? 0.0),
                        'last_90_quantity' => (float) ($row->last_90_quantity ?? 0.0),
                        'lifetime_quantity' => (float) ($row->lifetime_quantity ?? 0.0),
                    ];
                }
            });

        return $scores;
    }

    private function scoreSales(float $last30, float $last90, float $lifetime): float
    {
        return ($last30 * 3.0) + ($last90 * 1.5) + ($lifetime * 0.1);
    }

    private function scoreSalesBonus(float $salesScore): float
    {
        return log1p(max($salesScore, 0.0)) * 25.0;
    }

    private function normalizeString(mixed $value): ?string
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

    /**
     * @return array<string, array<int, string>>
     */
    private function buildValueIndex(array $contexts, string $key): array
    {
        $index = [];

        foreach ($contexts as $context) {
            $values = $context[$key] ?? [];

            if (! is_array($values)) {
                $values = $values !== null ? [$values] : [];
            }

            foreach ($values as $value) {
                $index[$value][] = $context['id'];
            }
        }

        return $index;
    }

    /**
     * @param array<int, string> $left
     * @param array<int, string> $right
     * @return array<int, string>
     */
    private function intersectValues(array $left, array $right): array
    {
        if ($left === [] || $right === []) {
            return [];
        }

        return array_values(array_unique(array_intersect($left, $right)));
    }

    /**
     * @param array<int, string> $normalized
     * @param array<string, string> $primary
     * @param array<string, string> $fallback
     * @return array<int, string>
     */
    private function denormalizeValues(array $normalized, array $primary, array $fallback): array
    {
        $result = [];

        foreach ($normalized as $value) {
            if (isset($primary[$value])) {
                $result[] = $primary[$value];
                continue;
            }

            if (isset($fallback[$value])) {
                $result[] = $fallback[$value];
            }
        }

        return array_values(array_unique($result));
    }
}
