<?php

namespace Modules\Pim\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Modules\Core\Services\SettingsService;
use Modules\Shoptet\Models\Shop;

class AiCategoryTranslationService
{
    public function __construct(private readonly SettingsService $settings)
    {
    }

    /**
     * @param  array<string, string>  $fields
     * @param  array<string, mixed>  $category
     * @param  array<string, mixed>  $context
     * @return array<string, string|null>
     */
    public function translate(
        Shop $shop,
        array $fields,
        string $targetLocale,
        ?string $sourceLocale = null,
        array $category = [],
        array $context = []
    ): array {
        if ($fields === []) {
            return [];
        }

        $apiKey = $this->settings->getDecrypted('openai_api_key');

        if (! $apiKey) {
            throw new \RuntimeException('OpenAI API key is not configured.');
        }

        $model = config('services.openai.model', 'gpt-4o-mini');
        $source = strtoupper($sourceLocale ?: 'cs');
        $target = strtoupper($targetLocale);

        $category = array_filter($category, static fn ($value) => $value !== null && $value !== '');
        $context = array_filter($context, static fn ($value) => $value !== null && $value !== '' && $value !== []);

        $payload = [
            'shop' => [
                'name' => $shop->name,
                'domain' => $shop->domain,
            ],
            'source_locale' => $source,
            'target_locale' => $target,
            'category' => $category,
            'context' => $context,
            'fields' => $fields,
        ];

        $properties = [];
        foreach (array_keys($fields) as $key) {
            $properties[$key] = ['type' => ['string', 'null']];
        }

        $schema = [
            'type' => 'object',
            'required' => array_keys($fields),
            'additionalProperties' => false,
            'properties' => $properties,
        ];

        $systemPrompt = sprintf(
            'You are a senior localization specialist for e-commerce category pages. Translate provided fields from %s to %s. Preserve original HTML tags, keep valid markup, and adapt tone for SEO-friendly marketing copy. Return only JSON matching the schema.',
            $source,
            $target
        );

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
                            'name' => 'category_translation',
                            'schema' => $schema,
                            'strict' => true,
                        ],
                    ],
                    'messages' => [
                        ['role' => 'system', 'content' => $systemPrompt],
                        ['role' => 'user', 'content' => json_encode($payload, JSON_UNESCAPED_UNICODE)],
                    ],
                    'temperature' => 0.3,
                ]);
        } catch (ConnectionException $exception) {
            Log::error('OpenAI category translation connection failed', ['message' => $exception->getMessage()]);

            throw new \RuntimeException('OpenAI service is unreachable. Please try again.');
        }

        if ($response->failed()) {
            $body = $response->json();
            $errorMessage = data_get($body, 'error.message') ?? $response->body();

            Log::warning('OpenAI category translation HTTP error', [
                'status' => $response->status(),
                'body' => $body ?? $response->body(),
            ]);

            throw new \RuntimeException('AI translation failed: '.($errorMessage ?: 'Unexpected OpenAI error.'));
        }

        $response = $response->json();
        $content = data_get($response, 'choices.0.message.content');

        if (! $content) {
            Log::warning('OpenAI category translation missing content', ['response' => $response]);
            throw new \RuntimeException('AI translation did not return any content.');
        }

        $decoded = json_decode($content, true);

        if (! is_array($decoded)) {
            Log::warning('OpenAI category translation invalid JSON', ['content' => $content]);
            throw new \RuntimeException('AI translation returned invalid data.');
        }

        $result = [];
        foreach (array_keys($fields) as $key) {
            $result[$key] = Arr::get($decoded, $key);
        }

        return $result;
    }
}
