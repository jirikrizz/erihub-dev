<?php

namespace Modules\Pim\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Modules\Core\Services\SettingsService;
use Modules\Shoptet\Models\Shop;

class AiCategoryContentService
{
    public function __construct(private readonly SettingsService $settings)
    {
    }

    /**
     * @param  array<string, mixed>  $category
     * @param  array<string, mixed>  $context
     */
    public function generate(Shop $shop, array $category, array $context = []): array
    {
        $apiKey = $this->settings->getDecrypted('openai_api_key');

        if (! $apiKey) {
            throw new \RuntimeException('OpenAI API key is not configured.');
        }

        $model = config('services.openai.model', 'gpt-4o-mini');

        $payload = [
            'shop' => [
                'name' => $shop->name,
                'domain' => $shop->domain,
            ],
            'category' => $category,
            'context' => $context,
        ];

        $systemPrompt = 'Jsi seniorní český e-commerce copywriter a SEO specialista. Připravuješ obsah kategorií pro internetový obchod. Vytvářej marketingové texty v češtině, zachovej HTML strukturu (p, ul/li, h2-h3). Dohledávej vhodné interní odkazy a navrhni případné widgety do horní části stránky (banner, odpočet apod.). V odpovědi vrať pouze JSON dle schématu.';

        $schema = [
            'type' => 'object',
            'required' => ['menu_title', 'title', 'meta_description', 'description', 'second_description', 'link_suggestions', 'widgets'],
            'additionalProperties' => false,
            'properties' => [
                'menu_title' => ['type' => ['string', 'null']],
                'title' => ['type' => ['string', 'null']],
                'meta_description' => ['type' => ['string', 'null']],
                'description' => ['type' => ['string', 'null']],
                'second_description' => ['type' => ['string', 'null']],
                'link_suggestions' => [
                    'type' => 'array',
                    'items' => [
                        'type' => 'object',
                        'required' => ['label', 'url'],
                        'properties' => [
                            'label' => ['type' => 'string'],
                            'url' => ['type' => 'string'],
                        ],
                    ],
                ],
                'widgets' => [
                    'type' => 'array',
                    'items' => [
                        'type' => 'object',
                        'required' => ['type', 'placement', 'config'],
                        'properties' => [
                            'type' => ['type' => 'string', 'enum' => ['banner', 'countdown']],
                            'placement' => ['type' => 'string', 'enum' => ['top']],
                            'config' => ['type' => 'object'],
                        ],
                    ],
                ],
            ],
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
                            'name' => 'category_seo_payload',
                            'schema' => $schema,
                            'strict' => true,
                        ],
                    ],
                    'messages' => [
                        ['role' => 'system', 'content' => $systemPrompt],
                        ['role' => 'user', 'content' => json_encode($payload, JSON_UNESCAPED_UNICODE)],
                    ],
                    'temperature' => 0.5,
                ]);
        } catch (ConnectionException $exception) {
            Log::error('OpenAI category content connection failed', ['message' => $exception->getMessage()]);

            throw new \RuntimeException('OpenAI nedostupné. Zkontroluj připojení a zkus to znovu.', 0, $exception);
        }

        if ($response->failed()) {
            $body = $response->json();
            $errorMessage = data_get($body, 'error.message') ?? $response->body();

            Log::warning('OpenAI category content HTTP error', [
                'status' => $response->status(),
                'body' => $body ?? $response->body(),
            ]);

            throw new \RuntimeException('AI generování selhalo: '.($errorMessage ?: 'Nečekaná chyba OpenAI.'));
        }

        $response = $response->json();
        $content = data_get($response, 'choices.0.message.content');

        if (! $content) {
            Log::warning('OpenAI category content response missing content', ['response' => $response]);
            throw new \RuntimeException('AI generování nevrátilo žádný obsah.');
        }

        $decoded = json_decode($content, true);

        if (! is_array($decoded)) {
            Log::warning('OpenAI category content invalid JSON', ['content' => $content]);
            throw new \RuntimeException('AI generování vrátilo neplatná data.');
        }

        $decoded['widgets'] = array_map(function (array $widget) {
            $config = $widget['config'] ?? [];
            if (($widget['type'] ?? null) === 'countdown') {
                $config = array_merge([
                    'headline' => null,
                    'message' => null,
                    'deadline' => null,
                    'cta_label' => null,
                    'cta_url' => null,
                ], $config);
            }

            if (($widget['type'] ?? null) === 'banner') {
                $config = array_merge([
                    'title' => null,
                    'subtitle' => null,
                    'image' => null,
                    'link_label' => null,
                    'link_url' => null,
                ], $config);
            }

            unset($widget['config']);

            return array_merge($widget, $config);
        }, Arr::get($decoded, 'widgets', []));

        return $decoded;
    }
}
