<?php

namespace Modules\Pim\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Modules\Core\Services\SettingsService;
use Modules\Shoptet\Models\Shop;
use function collect;

class AttributeMappingAiService
{
    private const MAX_ATTRIBUTES = 30;
    private const MAX_VALUES = 20;

    public function __construct(private readonly SettingsService $settings)
    {
    }

    /**
     * @param array<int, array<string, mixed>> $masterItems
     * @param array<int, array<string, mixed>> $targetItems
     * @return array<string, mixed>
     */
    public function suggest(Shop $masterShop, Shop $targetShop, string $type, array $masterItems, array $targetItems): array
    {
        $apiKey = $this->settings->getDecrypted('openai_api_key');

        if (! $apiKey) {
            throw new \RuntimeException('OpenAI API key is not configured.');
        }

        $model = config('services.openai.model', 'gpt-4o-mini');
        $supportsValues = in_array($type, ['filtering_parameters', 'variants'], true);

        $systemPrompt = $this->buildSystemPrompt($type, $supportsValues);
        $userContent = $this->buildUserContent($masterShop, $targetShop, $type, $supportsValues, $masterItems, $targetItems);

        try {
            $response = Http::timeout(90)
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
                            'name' => 'attribute_mapping_suggestion',
                            'schema' => [
                                'type' => 'object',
                                'required' => ['mappings'],
                                'additionalProperties' => false,
                                'properties' => [
                                    'mappings' => [
                                        'type' => 'array',
                                        'items' => [
                                            'type' => 'object',
                                            'required' => ['master_key', 'target_key', 'values'],
                                            'additionalProperties' => false,
                                            'properties' => [
                                                'master_key' => ['type' => 'string'],
                                                'target_key' => ['type' => ['string', 'null']],
                                                'values' => [
                                                    'type' => 'array',
                                                    'items' => [
                                                        'type' => 'object',
                                                        'required' => ['master_key', 'target_key'],
                                                        'additionalProperties' => false,
                                                        'properties' => [
                                                            'master_key' => ['type' => 'string'],
                                                            'target_key' => ['type' => ['string', 'null']],
                                                        ],
                                                    ],
                                                    'default' => [],
                                                ],
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                            'strict' => false,
                        ],
                    ],
                    'messages' => [
                        ['role' => 'system', 'content' => $systemPrompt],
                        ['role' => 'user', 'content' => json_encode($userContent, JSON_UNESCAPED_UNICODE)],
                    ],
                    'temperature' => 0.2,
                ]);
        } catch (ConnectionException $exception) {
            Log::error('OpenAI attribute mapping connection failed', ['message' => $exception->getMessage()]);
            throw new \RuntimeException('Unable to reach AI service. Please try again later.', 0, $exception);
        }

        if ($response->failed()) {
            Log::warning('OpenAI attribute mapping request failed', [
                'status' => $response->status(),
                'body' => $response->json(),
            ]);
            $message = Arr::get($response->json(), 'error.message', 'AI service returned an error.');
            throw new \RuntimeException($message);
        }

        $content = trim((string) Arr::get($response->json(), 'choices.0.message.content', ''));
        if ($content === '') {
            throw new \RuntimeException('AI service did not return any content.');
        }

        $decoded = json_decode($content, true);
        if (! is_array($decoded)) {
            throw new \RuntimeException('AI response could not be parsed.');
        }

        $suggestions = $this->sanitizeSuggestions($decoded['mappings'] ?? [], $masterItems, $targetItems, $supportsValues);

        return [
            'master' => $masterItems,
            'target' => $targetItems,
            'mappings' => $suggestions,
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function sanitizeSuggestions(array $suggestions, array $masterItems, array $targetItems, bool $supportsValues): array
    {
        $masterMap = collect($masterItems)->keyBy('key');
        $targetMap = collect($targetItems)->keyBy('key');

        $result = [];

        foreach ($suggestions as $entry) {
            $masterKey = (string) ($entry['master_key'] ?? '');
            if ($masterKey === '' || ! $masterMap->has($masterKey)) {
                continue;
            }

            $targetKey = $entry['target_key'] ?? null;
            if ($targetKey !== null && $targetKey !== '' && ! $targetMap->has($targetKey)) {
                $targetKey = null;
            }

            $values = [];
            if ($supportsValues && $targetKey) {
                $masterValues = collect($masterMap->get($masterKey)['values'] ?? [])->keyBy('key');
                $targetValues = collect($targetMap->get($targetKey)['values'] ?? [])->keyBy('key');
                $usedTargets = [];

                foreach (Arr::wrap($entry['values'] ?? []) as $valueEntry) {
                    $masterValueKey = (string) ($valueEntry['master_key'] ?? '');
                    if ($masterValueKey === '' || ! $masterValues->has($masterValueKey)) {
                        continue;
                    }

                    $targetValueKey = $valueEntry['target_key'] ?? null;
                    if ($targetValueKey === null || $targetValueKey === '' || ! $targetValues->has($targetValueKey)) {
                        continue;
                    }

                    if (in_array($targetValueKey, $usedTargets, true)) {
                        continue;
                    }

                    $values[] = [
                        'master_key' => $masterValueKey,
                        'target_key' => $targetValueKey,
                    ];
                    $usedTargets[] = $targetValueKey;
                }
            }

            $normalized = [
                'master_key' => $masterKey,
                'target_key' => $targetKey ?? null,
                'values' => $values,
            ];

            $result[] = $normalized;
        }

        return $result;
    }

    private function buildSystemPrompt(string $type, bool $supportsValues): string
    {
        $typeLabel = match ($type) {
            'flags' => 'product flags (badges)',
            'filtering_parameters' => 'filtering parameters used in category filters',
            'variants' => 'variant parameters (e.g. size, color)',
            default => 'attributes',
        };

        $valuesInstruction = $supportsValues
            ? 'If a master attribute is matched with a target attribute, map child values only when their meaning clearly matches. Leave value target_key null for uncertain cases.'
            : 'These attributes do not have child values, only map the top-level attribute.';

        return <<<PROMPT
You are an expert localisation assistant for e-commerce data. Match {$typeLabel} between a master Shoptet shop and a target Shoptet shop. Work in Czech and respect diacritics. Respond in JSON using the provided schema. Each master attribute may map to at most one target attribute. When no reasonable match exists, set target_key to null. {$valuesInstruction} Some attribute lists may be truncated to the {$this->formatLimit(self::MAX_ATTRIBUTES)} most relevant items and {$this->formatLimit(self::MAX_VALUES)} values — focus on these and do not invent additional entries.
PROMPT;
    }

    private function buildUserContent(Shop $masterShop, Shop $targetShop, string $type, bool $supportsValues, array $masterItems, array $targetItems): array
    {
        $mapItems = function (array $items, array $masterLookup, bool $includeValues, bool $stripMasterLike): array {
            $limitedItems = array_slice($items, 0, self::MAX_ATTRIBUTES);

            $mapped = array_map(function (array $item) use ($includeValues, $stripMasterLike) {
                if ($stripMasterLike && ! empty($item['likely_master_language'])) {
                    return null;
                }

                $payload = [
                    'key' => $item['key'] ?? null,
                    'label' => $item['label'] ?? null,
                ];

                if (! empty($item['code'])) {
                    $payload['code'] = $item['code'];
                }

                if ($includeValues && ! empty($item['values'])) {
                    $limitedValues = array_slice($item['values'], 0, self::MAX_VALUES);
                    $payload['values'] = array_values(array_filter(array_map(function (array $value) use ($stripMasterLike) {
                        if ($stripMasterLike && ! empty($value['likely_master_language'])) {
                            return null;
                        }

                        return [
                            'key' => $value['key'] ?? null,
                            'label' => $value['label'] ?? null,
                        ];
                    }, $limitedValues)));

                    if (count($item['values']) > self::MAX_VALUES) {
                        $payload['value_truncated'] = true;
                    }
                }

                $payload['likely_master_language'] = ! empty($item['likely_master_language']);

                return $payload;
            }, $limitedItems);

            return array_values(array_filter($mapped));
        };

        $masterLookup = collect($masterItems)->keyBy('key');

        $filteredTargetItems = $mapItems($targetItems, $masterLookup->all(), $supportsValues, true);
        $filteredTargetItems = array_values(array_filter($filteredTargetItems, fn ($item) => $item !== null));

        return [
            'type' => $type,
            'master_shop' => [
                'id' => $masterShop->id,
                'name' => $masterShop->name,
                'locale' => $masterShop->locale ?? $masterShop->default_locale,
            ],
            'target_shop' => [
                'id' => $targetShop->id,
                'name' => $targetShop->name,
                'locale' => $targetShop->locale ?? $targetShop->default_locale,
            ],
            'master_attributes' => $mapItems($masterItems, $masterLookup->all(), $supportsValues, false),
            'target_attributes' => $filteredTargetItems,
        ];
    }

    private function formatLimit(int $limit): string
    {
        return $limit >= 100 ? number_format($limit) : (string) $limit;
    }

    private function normalizeLabel(?string $label): string
    {
        $value = trim((string) $label);
        if ($value === '') {
            return '';
        }

        if (function_exists('mb_strtolower')) {
            $value = mb_strtolower($value);
        } else {
            $value = strtolower($value);
        }

        return $value;
    }
}
