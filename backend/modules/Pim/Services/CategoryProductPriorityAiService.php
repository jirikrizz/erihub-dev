<?php

namespace Modules\Pim\Services;

use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Modules\Core\Services\SettingsService;
use Modules\Pim\Models\ShopCategoryNode;
use Modules\Shoptet\Models\Shop;
use RuntimeException;

class CategoryProductPriorityAiService
{
    public function __construct(
        private readonly SettingsService $settings,
        private readonly CategoryProductPriorityService $priorityService
    ) {
    }

    public function evaluate(Shop $shop, string $categoryGuid, int $pages = 2, int $perPage = 20): array
    {
        $apiKey = $this->settings->getDecrypted('openai_api_key');

        if (! $apiKey) {
            throw new RuntimeException('OpenAI API key is not configured.');
        }

        $pages = max(1, min($pages, 5));
        $perPage = max(1, min($perPage, 50));

        $payloadItems = [];
        $page = 1;

        while ($page <= $pages) {
            $response = $this->priorityService->fetch($shop, $categoryGuid, $page, $perPage);
            $items = Arr::get($response, 'data.items', []);
            $paginator = Arr::get($response, 'data.paginator', []);

            if (is_array($items)) {
                foreach ($items as $item) {
                    if (! is_array($item)) {
                        continue;
                    }

                    $guid = (string) ($item['product_guid'] ?? '');
                    if ($guid === '') {
                        continue;
                    }

                    $payloadItems[$guid] = [
                        'position' => isset($item['position']) ? (int) $item['position'] : null,
                        'product_guid' => $guid,
                        'product_id' => $item['product_id'] ?? null,
                        'name' => $item['name'] ?? null,
                        'sku' => $item['sku'] ?? null,
                        'priority' => isset($item['priority']) ? (int) $item['priority'] : null,
                        'stock' => isset($item['stock']) ? (float) $item['stock'] : null,
                        'purchases_30d' => isset($item['purchases_30d']) ? (int) $item['purchases_30d'] : 0,
                        'variants' => $this->normalizeVariants($item['variants'] ?? []),
                    ];
                }
            }

            $pageCount = isset($paginator['page_count']) ? (int) $paginator['page_count'] : $page;
            if ($page >= $pageCount) {
                break;
            }

            $page++;
        }

        if ($payloadItems === []) {
            throw new RuntimeException('Pro vyhodnocení nebyly nalezeny žádné produkty.');
        }

        usort($payloadItems, static fn (array $a, array $b) => ($a['position'] ?? PHP_INT_MAX) <=> ($b['position'] ?? PHP_INT_MAX));

        $category = ShopCategoryNode::query()
            ->where('shop_id', $shop->id)
            ->where('remote_guid', $categoryGuid)
            ->first();

        $model = config('services.openai.model', 'gpt-4o-mini');

        $systemPrompt = 'Jsi seniorní e-commerce merchandiser pro český parfumérský e-shop. '
            .'Vyhodnocuj produkty v kategorii podle prodejnosti a dostupnosti. '
            .'Preferuj produkty s vysokými nákupy za posledních 30 dní a dostatečným skladem. '
            .'Produkty s nulovým skladem nastav na nižší prioritu (vyšší číslo). '
            .'Výstupem je JSON se seznamem produktů a novou prioritou. '
            .'Menší číslo priority znamená lepší umístění. '
            .'Racionálně zdůvodni rozhodnutí česky maximálně ve dvou větách. '
            .'V odpovědi vrať pouze JSON dle schématu.';

        $schema = [
            'type' => 'object',
            'required' => ['criteria', 'items'],
            'additionalProperties' => false,
            'properties' => [
                'criteria' => ['type' => 'string'],
                'items' => [
                    'type' => 'array',
                    'minItems' => 1,
                    'items' => [
                        'type' => 'object',
                        'required' => ['product_guid', 'suggested_priority', 'rationale'],
                        'additionalProperties' => false,
                        'properties' => [
                            'product_guid' => ['type' => 'string'],
                            'suggested_priority' => ['type' => 'integer'],
                            'rationale' => ['type' => 'string'],
                        ],
                    ],
                ],
            ],
        ];

        $requestPayload = [
            'shop' => [
                'id' => $shop->id,
                'name' => $shop->name,
                'locale' => $shop->locale,
                'currency_code' => $shop->currency_code,
            ],
            'category' => [
                'guid' => $categoryGuid,
                'name' => $category?->name,
                'path' => $category?->path,
            ],
            'products' => array_values($payloadItems),
        ];

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
                            'name' => 'category_product_priority',
                            'schema' => $schema,
                            'strict' => true,
                        ],
                    ],
                    'messages' => [
                        ['role' => 'system', 'content' => $systemPrompt],
                        ['role' => 'user', 'content' => json_encode($requestPayload, JSON_UNESCAPED_UNICODE)],
                    ],
                    'temperature' => 0.2,
                ]);
        } catch (ConnectionException $exception) {
            Log::error('OpenAI category priority connection failed', ['message' => $exception->getMessage()]);

            throw new RuntimeException('OpenAI nedostupné. Zkontroluj připojení a zkus to znovu.', 0, $exception);
        }

        if ($response->failed()) {
            $body = $response->json();
            $errorMessage = data_get($body, 'error.message') ?? $response->body();

            Log::warning('OpenAI category priority HTTP error', [
                'status' => $response->status(),
                'body' => $body ?? $response->body(),
            ]);

            throw new RuntimeException('AI vyhodnocení selhalo: '.($errorMessage ?: 'Nečekaná chyba OpenAI.'));
        }

        $response = $response->json();
        $content = data_get($response, 'choices.0.message.content');

        if (! $content) {
            Log::warning('OpenAI category priority response missing content', ['response' => $response]);
            throw new RuntimeException('AI vyhodnocení nevrátilo žádná data.');
        }

        $decoded = json_decode($content, true);

        if (! is_array($decoded)) {
            Log::warning('OpenAI category priority invalid JSON', ['content' => $content]);
            throw new RuntimeException('AI vyhodnocení vrátilo neplatná data.');
        }

        $knownGuids = array_column($payloadItems, 'product_guid');
        $suggestions = collect($decoded['items'] ?? [])
            ->filter(static function ($item) use ($knownGuids) {
                if (! is_array($item)) {
                    return false;
                }

                $guid = (string) ($item['product_guid'] ?? '');
                if ($guid === '') {
                    return false;
                }

                if (! in_array($guid, $knownGuids, true)) {
                    return false;
                }

                if (! isset($item['suggested_priority'])) {
                    return false;
                }

                return is_numeric($item['suggested_priority']);
            })
            ->map(static function ($item) {
                return [
                    'product_guid' => (string) $item['product_guid'],
                    'suggested_priority' => max(1, (int) $item['suggested_priority']),
                    'rationale' => trim((string) ($item['rationale'] ?? '')),
                ];
            })
            ->values()
            ->all();

        if ($suggestions === []) {
            throw new RuntimeException('AI vyhodnocení nevrátilo žádné návrhy.');
        }

        return [
            'data' => [
                'evaluated_at' => CarbonImmutable::now()->toIso8601String(),
                'model' => $model,
                'criteria' => isset($decoded['criteria']) ? (string) $decoded['criteria'] : null,
                'suggestions' => $suggestions,
                'product_count' => count($payloadItems),
            ],
        ];
    }

    private function normalizeVariants(mixed $variants): array
    {
        if (! is_array($variants)) {
            return [];
        }

        return collect($variants)
            ->filter(static fn ($variant) => is_array($variant))
            ->map(static function (array $variant) {
                return [
                    'variant_id' => $variant['variant_id'] ?? null,
                    'code' => $variant['code'] ?? null,
                    'name' => $variant['name'] ?? null,
                    'stock' => isset($variant['stock']) ? (float) $variant['stock'] : null,
                    'purchases_30d' => isset($variant['purchases_30d']) ? (int) $variant['purchases_30d'] : 0,
                ];
            })
            ->values()
            ->all();
    }
}
