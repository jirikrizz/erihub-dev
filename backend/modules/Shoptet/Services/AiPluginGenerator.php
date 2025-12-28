<?php

namespace Modules\Shoptet\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Modules\Core\Services\SettingsService;
use RuntimeException;

class AiPluginGenerator
{
    public function __construct(private readonly SettingsService $settings)
    {
    }

    /**
     * @param  array{
     *     name: string,
     *     goal: string,
     *     shop_id: int,
     *     shoptet_surface?: ?string,
     *     data_sources?: ?string,
     *     additional_notes?: ?string,
     *     plugin_type: string,
     *     language?: ?string,
     *     brand_primary_color?: ?string,
     *     brand_secondary_color?: ?string,
     *     brand_font_family?: ?string,
     * }  $input
     * @return array{
     *     summary: string,
     *     file: array{filename: string, description: string, code: string},
     *     installation_steps: list<string>,
     *     testing_checklist: list<string>,
     *     dependencies: list<string>,
     *     warnings: list<string>
     * }
     */
    public function generate(array $input): array
    {
        $apiKey = $this->settings->getDecrypted('openai_api_key');

        if (! $apiKey) {
            throw new RuntimeException('OpenAI API klíč není uložen. Přidej ho v Nastavení → Překládání.');
        }

        $model = config('services.openai.model', 'gpt-4o-mini');
        $language = $input['language'] && $input['language'] !== '' ? $input['language'] : 'cs';
        $pluginType = $input['plugin_type'] ?? 'banner';

        $bannerGuidance = <<<'BANNER'
- Treat the solution as a visual banner/widget that can render its own markup and styling without depending on arbitrary storefront theme classes unless explicitly referenced.
- Provide a balanced layout that adapts to different viewport widths (desktop-first, still mobile considerate) and expose a clear call-to-action.
- Use CSS custom properties (e.g. --brand-primary) and fallback colors when applying branding and ensure accessible contrast.
- Avoid manipulating checkout, cart totals or other critical flows; focus on presentation and light micro-interactions inside the banner container.
BANNER;

        $functionGuidance = <<<'FUNCTION'
- Treat the solution as a behavioural enhancement that augments existing Shoptet UI components without injecting heavy markup.
- Prefer attaching listeners to existing DOM nodes, logging significant steps to the console, and guard DOM lookups gracefully.
- Any human-facing text (console, notifications, tooltips) must use the requested language.
FUNCTION;

        $typeGuidance = $pluginType === 'banner' ? $bannerGuidance : $functionGuidance;

        $systemPrompt = <<<'PROMPT'
You are an experienced JavaScript engineer specialising in Shoptet storefront customisation. Generate a self-contained browser script that can be pasted into Shoptet administration (Settings → Editor → Custom JavaScript). Follow these constraints:
- Output modern vanilla JavaScript compatible with evergreen browsers, no bundlers or frameworks.
- Namescope everything inside an immediately invoked function expression to avoid global collisions.
- Wait for DOM readiness before querying or mutating elements.
- Prefer HTML attributes and utility classes already present in Shoptet; when creating new markup, use semantic elements and accessible labelling.
- Handle missing DOM targets gracefully and log an informative message instead of crashing.
- Avoid remote network calls unless the brief explicitly requests them; never exfiltrate sensitive data.
- Keep the code readable with small helper functions and inline comments only where they clarify non-obvious intent.
- If styles are required, inject them via a <style> element appended to <head> from within the script.
- Reflect any provided brand palette or font family consistently and expose them via CSS custom properties (e.g. --brand-primary) before applying styles.
- Write all human-readable text in the requested output language.
Return JSON describing the deliverable.
PROMPT;

        $systemPrompt .= PHP_EOL.$typeGuidance;

        $userPayload = array_filter([
            'plugin_name' => $input['name'],
            'objective' => $input['goal'],
            'plugin_type' => $pluginType,
            'target_surface' => $input['shoptet_surface'] ?? null,
            'data_sources' => $input['data_sources'] ?? null,
            'additional_notes' => $input['additional_notes'] ?? null,
            'preferred_language' => $language,
            'brand_theme' => array_filter([
                'primary_color' => $input['brand_primary_color'] ?? null,
                'secondary_color' => $input['brand_secondary_color'] ?? null,
                'font_family' => $input['brand_font_family'] ?? null,
            ]),
        ], static fn ($value) => $value !== null);

        try {
            $response = Http::timeout(60)
                ->connectTimeout(10)
                ->withHeaders([
                    'Authorization' => 'Bearer ' . $apiKey,
                    'Content-Type' => 'application/json',
                ])
                ->post('https://api.openai.com/v1/chat/completions', [
                    'model' => $model,
                    'temperature' => 0.3,
                    'response_format' => [
                        'type' => 'json_schema',
                        'json_schema' => [
                            'name' => 'shoptet_plugin_bundle',
                            'schema' => [
                                'type' => 'object',
                                'required' => ['summary', 'file', 'installation_steps', 'testing_checklist', 'dependencies', 'warnings'],
                                'additionalProperties' => false,
                                'properties' => [
                                    'summary' => ['type' => 'string'],
                                    'file' => [
                                        'type' => 'object',
                                        'required' => ['filename', 'description', 'code'],
                                        'additionalProperties' => false,
                                        'properties' => [
                                            'filename' => ['type' => 'string'],
                                            'description' => ['type' => 'string'],
                                            'code' => ['type' => 'string'],
                                        ],
                                    ],
                                    'installation_steps' => [
                                        'type' => 'array',
                                        'items' => ['type' => 'string'],
                                        'minItems' => 1,
                                    ],
                                    'testing_checklist' => [
                                        'type' => 'array',
                                        'items' => ['type' => 'string'],
                                        'minItems' => 1,
                                    ],
                                    'dependencies' => [
                                        'type' => 'array',
                                        'items' => ['type' => 'string'],
                                        'default' => [],
                                    ],
                                    'warnings' => [
                                        'type' => 'array',
                                        'items' => ['type' => 'string'],
                                        'default' => [],
                                    ],
                                ],
                            ],
                            'strict' => true,
                        ],
                    ],
                    'messages' => [
                        ['role' => 'system', 'content' => $systemPrompt],
                        ['role' => 'user', 'content' => json_encode($userPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)],
                    ],
                ]);
        } catch (ConnectionException $exception) {
            Log::error('OpenAI plugin generation connection failed', ['message' => $exception->getMessage()]);

            throw new RuntimeException('Nepodařilo se kontaktovat OpenAI. Zkus to prosím znovu.', 0, $exception);
        }

        if ($response->failed()) {
            $body = $response->json();
            $errorMessage = data_get($body, 'error.message') ?? $response->body();

            Log::warning('OpenAI plugin generation HTTP error', [
                'status' => $response->status(),
                'body' => $body ?? $response->body(),
            ]);

            throw new RuntimeException('Generování pluginu selhalo: ' . ($errorMessage ?: 'neočekávaná chyba z OpenAI.'));
        }

        $payload = $response->json();
        $content = data_get($payload, 'choices.0.message.content');

        if (! $content) {
            Log::warning('OpenAI plugin generation missing content', ['response' => $payload]);
            throw new RuntimeException('OpenAI nevrátil platný výsledek.');
        }

        $decoded = json_decode($content, true);

        if (! is_array($decoded)) {
            Log::warning('OpenAI plugin generation invalid JSON', ['content' => $content]);
            throw new RuntimeException('OpenAI vrátilo neplatná data.');
        }

        $file = Arr::get($decoded, 'file', []);

        $code = is_string($file['code'] ?? null) ? trim($file['code']) : '';

        if ($code === '') {
            throw new RuntimeException('OpenAI neposkytlo žádný JavaScriptový kód.');
        }

        return [
            'summary' => (string) ($decoded['summary'] ?? ''),
            'file' => [
                'filename' => is_string($file['filename'] ?? null) ? $file['filename'] : 'plugin.js',
                'description' => is_string($file['description'] ?? null) ? $file['description'] : '',
                'code' => $code,
            ],
            'installation_steps' => $this->normaliseList($decoded['installation_steps'] ?? []),
            'testing_checklist' => $this->normaliseList($decoded['testing_checklist'] ?? []),
            'dependencies' => $this->normaliseList($decoded['dependencies'] ?? []),
            'warnings' => $this->normaliseList($decoded['warnings'] ?? []),
        ];
    }

    /**
     * @param  mixed  $items
     * @return list<string>
     */
    private function normaliseList($items): array
    {
        if (! is_array($items)) {
            return [];
        }

        $normalised = [];

        foreach ($items as $item) {
            if (! is_string($item)) {
                continue;
            }

            $trimmed = trim($item);

            if ($trimmed !== '') {
                $normalised[] = $trimmed;
            }
        }

        return array_values(array_unique($normalised));
    }
}
