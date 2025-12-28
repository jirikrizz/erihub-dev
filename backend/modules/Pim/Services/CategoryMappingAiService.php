<?php

namespace Modules\Pim\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Modules\Core\Services\SettingsService;
use Modules\Pim\Models\CategoryMapping;
use Modules\Pim\Models\CategoryNode;
use Modules\Pim\Models\ShopCategoryNode;

class CategoryMappingAiService
{
    public function __construct(private readonly SettingsService $settings)
    {
    }

    public function suggest(int $masterShopId, int $targetShopId, bool $includeMapped = false, ?string $instructions = null): array
    {
        $apiKey = $this->settings->getDecrypted('openai_api_key');

        if (! $apiKey) {
            throw new \RuntimeException('OpenAI API key is not configured.');
        }

        $canonicalNodes = CategoryNode::query()
            ->where('shop_id', $masterShopId)
            ->orderBy('parent_id')
            ->orderBy('position')
            ->orderBy('name')
            ->get([
                'id',
                'guid',
                'name',
                'slug',
                'parent_id',
                'position',
            ]);

        if ($canonicalNodes->isEmpty()) {
            return [];
        }

        $shopNodes = ShopCategoryNode::query()
            ->where('shop_id', $targetShopId)
            ->orderBy('path')
            ->orderBy('name')
            ->get([
                'id',
                'name',
                'slug',
                'path',
                'parent_id',
                'remote_guid',
            ]);

        if ($shopNodes->isEmpty()) {
            return [];
        }

        $existingMappings = CategoryMapping::query()
            ->where('shop_id', $targetShopId)
            ->get(['category_node_id', 'shop_category_node_id'])
            ->keyBy('category_node_id');

        $shopLookup = $shopNodes->mapWithKeys(function (ShopCategoryNode $node) use ($shopNodes) {
            $path = $this->truncate($node->path);
            $name = $this->truncate($node->name);

            return [$node->id => [
                'id' => $node->id,
                'name' => $name,
                'path' => $path,
                'depth' => $this->depthShop($node, $shopNodes),
                'parent_id' => $node->parent_id,
                'remote_guid' => $node->remote_guid,
                'normalized_name' => $this->normalize($node->name),
                'normalized_path' => $this->normalize($path),
                'keywords' => $this->keywords(($node->name ?? '').' '.$path, 6),
            ]];
        })->take(220);

        $canonicalPayload = $canonicalNodes
            ->filter(function (CategoryNode $node) use ($existingMappings, $includeMapped) {
                if ($includeMapped) {
                    return true;
                }

                $existing = $existingMappings->get($node->id);

                return ! $existing || ! $existing->shop_category_node_id;
            })
            ->map(function (CategoryNode $node) use ($canonicalNodes, $shopLookup) {
                $path = $this->truncate($this->buildCanonicalPath($node, $canonicalNodes));
                $depth = $this->depth($node, $canonicalNodes);
                $keywords = $this->keywords(($node->name ?? '').' '.$path, 6);

                return [
                    'id' => $node->id,
                    'guid' => $node->guid,
                    'name' => $this->truncate($node->name),
                    'path' => $path,
                    'depth' => $depth,
                    'parent_id' => $node->parent_id,
                    'already_mapped' => false,
                    'keywords' => $keywords,
                    'candidates' => $this->buildCandidates($node, $canonicalNodes, $shopLookup),
                ];
            })
            ->take(120)
            ->values();

        $shopPayload = $shopLookup->map(fn (array $entry) => [
            'id' => $entry['id'],
            'name' => $entry['name'],
            'path' => $entry['path'],
            'depth' => $entry['depth'],
            'parent_id' => $entry['parent_id'],
            'remote_guid' => $entry['remote_guid'],
            'keywords' => $entry['keywords'],
        ])->values();

        $instructionLines = [
            'Match canonical categories to target categories.',
            'Respect hierarchy depth: prefer matches with depth difference <= 1.',
            'Only map if meaning is very close even across languages (translate mentally).',
            'If no suitable match exists, return null for target_id.',
            'Never suggest categories conflicting with user instructions.',
            'Use the candidates array for each canonical category as the allowed target list.',
            'Provide a short reason referencing matching keywords, hierarchy, or instructions.',
        ];

        if (! $includeMapped) {
            $instructionLines[] = 'Skip canonical categories that already have confirmed mapping unless the mapping is null.';
        }

        if ($instructions) {
            $instructionLines[] = 'User instructions: '.$instructions;
        }

        $payload = [
            'canonical_categories' => $canonicalPayload,
            'target_categories' => $shopPayload,
            'instructions' => $instructionLines,
        ];

        $schema = [
            'type' => 'object',
            'required' => ['mappings'],
            'additionalProperties' => false,
            'properties' => [
                'mappings' => [
                    'type' => 'array',
                    'items' => [
                        'type' => 'object',
                        'required' => ['canonical_id', 'target_id', 'confidence', 'reason'],
                        'additionalProperties' => false,
                        'properties' => [
                            'canonical_id' => ['type' => 'string'],
                            'target_id' => ['type' => ['string', 'null']],
                            'confidence' => ['type' => 'number', 'minimum' => 0, 'maximum' => 1],
                            'reason' => ['type' => ['string', 'null']],
                        ],
                    ],
                ],
            ],
        ];

        $model = config('services.openai.model', 'gpt-4o-mini');

        try {
            $response = Http::timeout(120)
                ->connectTimeout(15)
                ->withHeaders([
                    'Authorization' => 'Bearer '.$apiKey,
                    'Content-Type' => 'application/json',
                ])
                ->post('https://api.openai.com/v1/chat/completions', [
                    'model' => $model,
                    'response_format' => [
                        'type' => 'json_schema',
                        'json_schema' => [
                            'name' => 'category_mapping_plan',
                            'strict' => true,
                            'schema' => $schema,
                        ],
                    ],
                    'messages' => [
                        ['role' => 'system', 'content' => 'You are an expert multilingual e-commerce merchandiser. Map master categories to target shop categories. Return only valid JSON.'],
                        ['role' => 'user', 'content' => json_encode($payload, JSON_UNESCAPED_UNICODE)],
                    ],
                    'temperature' => 0.2,
                ]);
        } catch (ConnectionException $exception) {
            Log::error('OpenAI category pre-map connection error', [
                'master_shop_id' => $masterShopId,
                'target_shop_id' => $targetShopId,
                'message' => $exception->getMessage(),
            ]);

            throw new \RuntimeException('OpenAI nedostupné. Zkus to prosím znovu.', 0, $exception);
        }

        if ($response->failed()) {
            $body = $response->json();
            Log::warning('OpenAI category pre-map HTTP error', [
                'status' => $response->status(),
                'body' => $body ?? $response->body(),
            ]);

            $errorMessage = data_get($body, 'error.message') ?? $response->body();

            throw new \RuntimeException('AI mapování selhalo: '.($errorMessage ?: 'Neznámá chyba.'));
        }

        $content = data_get($response->json(), 'choices.0.message.content');

        if (! $content) {
            Log::warning('OpenAI category pre-map response missing content', ['response' => $response->json()]);

            return [];
        }

        $decoded = json_decode($content, true);

        if (! is_array($decoded) || ! isset($decoded['mappings']) || ! is_array($decoded['mappings'])) {
            Log::warning('OpenAI category pre-map invalid payload', ['content' => $content]);

            return [];
        }

        $canonicalMap = $canonicalPayload->keyBy('id');
        $shopMap = $shopPayload->keyBy('id');

        $suggestions = [];

        foreach ($decoded['mappings'] as $mapping) {
            $canonicalId = $mapping['canonical_id'] ?? null;
            $targetId = $mapping['target_id'] ?? null;
            $confidence = isset($mapping['confidence']) ? (float) $mapping['confidence'] : null;

            if (! $canonicalId || ! $canonicalMap->has($canonicalId)) {
                continue;
            }

            if ($targetId && ! $shopMap->has($targetId)) {
                continue;
            }

            $canon = $canonicalMap->get($canonicalId);

            if ($targetId) {
                $candidates = collect($canon['candidates'] ?? []);

                if (! $candidates->contains(fn ($candidate) => (string) $candidate['id'] === (string) $targetId)) {
                    continue;
                }
            }

            if (! $includeMapped && $existingMappings->has($canonicalId) && $existingMappings->get($canonicalId)->shop_category_node_id) {
                continue;
            }

            if (! $targetId) {
                continue;
            }

            $shop = $shopMap->get($targetId);

            $suggestions[] = [
                'canonical' => [
                    'id' => $canon['id'],
                    'guid' => $canon['guid'],
                    'name' => $canon['name'],
                    'path' => $canon['path'],
                ],
                'suggested' => [
                    'id' => $shop['id'],
                    'name' => $shop['name'],
                    'path' => $shop['path'],
                    'remote_guid' => $shop['remote_guid'],
                ],
                'similarity' => $confidence !== null ? round(max(min($confidence, 1), 0), 4) : 0.5,
                'reason' => $mapping['reason'] ?? null,
            ];
        }

        return $suggestions;
    }

    private function buildCanonicalPath(CategoryNode $node, Collection $allNodes): ?string
    {
        $segments = [];
        $current = $node;
        $guard = 0;

        while ($current && $guard < 50) {
            $segments[] = trim((string) $current->name);
            $parentId = $current->parent_id;

            if (! $parentId) {
                break;
            }

            /** @var CategoryNode|null $parent */
            $parent = $allNodes->firstWhere('id', $parentId);
            $current = $parent;
            $guard++;
        }

        $segments = array_filter(array_reverse($segments));

        return $segments === [] ? $node->name : implode(' > ', $segments);
    }

    private function depth(CategoryNode $node, Collection $allNodes): int
    {
        $depth = 0;
        $current = $node;

        while ($current && $depth < 50) {
            $depth++;
            $parentId = $current->parent_id;
            if (! $parentId) {
                break;
            }

            $current = $allNodes->firstWhere('id', $parentId);
        }

        return $depth;
    }

    private function depthShop(ShopCategoryNode $node, Collection $allNodes): int
    {
        $depth = 0;
        $current = $node;

        while ($current && $depth < 50) {
            $depth++;
            $parentId = $current->parent_id;
            if (! $parentId) {
                break;
            }

            $current = $allNodes->firstWhere('id', $parentId);
        }

        return $depth;
    }

    private function buildCandidates(CategoryNode $canonical, Collection $canonicalNodes, Collection $shopLookup): array
    {
        $path = $this->truncate($this->buildCanonicalPath($canonical, $canonicalNodes));
        $depth = $this->depth($canonical, $canonicalNodes);
        $normalizedName = $this->normalize($canonical->name);
        $normalizedPath = $this->normalize($path);
        $keywords = $this->keywords(($canonical->name ?? '').' '.$path, 6);

        $candidates = [];

        foreach ($shopLookup as $entry) {
            $depthPenalty = abs(($entry['depth'] ?? 0) - $depth);

            if ($depthPenalty > 2) {
                continue;
            }

            $scoreName = $this->similarity($normalizedName, $entry['normalized_name'] ?? '');
            $scorePath = $this->similarity($normalizedPath, $entry['normalized_path'] ?? '');

            $candidateKeywords = $entry['keywords'] ?? [];
            $keywordOverlap = ($keywords === [] || $candidateKeywords === [])
                ? 0
                : count(array_intersect($keywords, $candidateKeywords)) / max(count($keywords), 1);

            $score = ($scoreName * 0.55) + ($scorePath * 0.35) + ($keywordOverlap * 0.2);

            if ($depthPenalty > 1) {
                $score -= 0.15 * ($depthPenalty - 1);
            }

            if ($score < 0.15) {
                continue;
            }

            $candidates[] = [
                'id' => $entry['id'],
                'name' => $entry['name'],
                'path' => $entry['path'],
                'depth' => $entry['depth'],
                'score' => round(max($score, 0), 4),
            ];
        }

        usort($candidates, fn ($a, $b) => $b['score'] <=> $a['score']);

        return array_slice($candidates, 0, 6);
    }

    private function normalize(?string $value): string
    {
        if ($value === null) {
            return '';
        }

        $value = trim(mb_strtolower($value));
        $transliterated = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
        if (is_string($transliterated)) {
            $value = $transliterated;
        }

        return preg_replace('/[^a-z0-9]+/', '', $value) ?? '';
    }

    private function truncate(?string $value, int $limit = 160): ?string
    {
        if ($value === null) {
            return null;
        }

        $value = trim($value);

        if (mb_strlen($value) <= $limit) {
            return $value;
        }

        return rtrim(mb_substr($value, 0, $limit - 1)).'…';
    }

    private function keywords(?string $value, int $limit = 8): array
    {
        if (! $value) {
            return [];
        }

        $value = mb_strtolower($value);
        $value = preg_replace('/[^\p{L}0-9]+/u', ' ', $value) ?? '';
        $parts = preg_split('/\s+/u', trim($value)) ?: [];

        $filtered = array_values(array_unique(array_filter($parts, fn ($part) => mb_strlen($part) >= 3)));

        return array_slice($filtered, 0, $limit);
    }

    private function similarity(string $a, string $b): float
    {
        if ($a === '' || $b === '') {
            return 0.0;
        }

        if ($a === $b) {
            return 1.0;
        }

        $distance = levenshtein($a, $b);
        $maxLength = max(strlen($a), strlen($b));

        if ($maxLength === 0) {
            return 0.0;
        }

        return max(0.0, 1 - ($distance / $maxLength));
    }
}
