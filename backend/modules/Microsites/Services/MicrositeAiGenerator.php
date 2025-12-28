<?php

namespace Modules\Microsites\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Modules\Core\Services\SettingsService;

class MicrositeAiGenerator
{
    private const SECTION_TYPES = ['hero', 'product-grid', 'highlights', 'testimonials', 'faq', 'cta'];

    public function __construct(private readonly SettingsService $settings)
    {
    }

    public function generate(array $payload): array
    {
        $brief = $this->sanitizeText($payload['brief'] ?? null);

        if (! $brief) {
            throw new \InvalidArgumentException('Brief musí být vyplněn.');
        }

        $apiKey = $this->settings->getDecrypted('openai_api_key');

        if (! $apiKey) {
            throw new \RuntimeException('OpenAI API key is not configured.');
        }

        $model = config('services.openai.model', 'gpt-4o-mini');

        $userContent = [
            'language' => 'cs',
            'brief' => $brief,
            'tone' => $this->sanitizeText($payload['tone'] ?? null) ?? 'prémiová niche parfumerie, moderní storytelling',
            'audience' => $this->sanitizeText($payload['audience'] ?? null),
            'visual_keywords' => $this->sanitizeKeywords($payload['visual_keywords'] ?? []),
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
                            'name' => 'microsite_blueprint',
                            'schema' => $this->responseSchema(),
                        ],
                    ],
                    'messages' => [
                        ['role' => 'system', 'content' => $this->systemPrompt()],
                        ['role' => 'user', 'content' => json_encode($userContent, JSON_UNESCAPED_UNICODE)],
                    ],
                    'temperature' => 0.6,
                ]);
        } catch (ConnectionException $exception) {
            Log::error('OpenAI microsite generation connection failed', ['message' => $exception->getMessage()]);

            throw new \RuntimeException('Nepodařilo se kontaktovat OpenAI. Zkus to prosím znovu.', 0, $exception);
        }

        if ($response->failed()) {
            $responseBody = $response->json();
            $errorMessage = data_get($responseBody, 'error.message') ?? $response->body();

            Log::warning('OpenAI microsite generation HTTP error', [
                'status' => $response->status(),
                'body' => $responseBody ?? $response->body(),
            ]);

            throw new \RuntimeException('AI generování selhalo: '.($errorMessage ?: 'Neočekávaná chyba.'));
        }

        $responseBody = $response->json();
        $content = data_get($responseBody, 'choices.0.message.content');

        if (! is_string($content) || $content === '') {
            Log::warning('OpenAI microsite generation missing content', ['response' => $responseBody]);
            throw new \RuntimeException('AI generování nevrátilo obsah.');
        }

        $decoded = json_decode($content, true);

        if (! is_array($decoded)) {
            Log::warning('OpenAI microsite generation invalid JSON', ['content' => $content]);
            throw new \RuntimeException('AI generování vrátilo neplatná data.');
        }

        return [
            'theme' => $this->sanitizeTheme(Arr::get($decoded, 'theme', [])),
            'header' => $this->sanitizeHeader(Arr::get($decoded, 'header', [])),
            'footer' => $this->sanitizeFooter(Arr::get($decoded, 'footer', [])),
            'sections' => $this->sanitizeSections(Arr::get($decoded, 'sections', [])),
            'image_prompts' => $this->sanitizeImagePrompts(Arr::get($decoded, 'image_prompts', [])),
        ];
    }

    private function systemPrompt(): string
    {
        return <<<'PROMPT'
Jsi art director a copywriter specializující se na luxusní niche parfumerii. Tvoř vizuální a textové návrhy pro microsite "microshop" značky KrasneVune.cz.
- Piš česky, ve druhé osobě.
- Zachovej tón prémiového concierge, kombinuj eleganci a moderní technologie.
- Návrh musí být implementovatelný do bloků: hero, produktová mřížka, highlights, testimonials, FAQ a CTA.
- Používej hex barvy a konkrétní texty CTA (např. "Objev kolekci").
- Navigační odkazy používej jako kotvy (#kolekce) nebo absolutní URL.
- Zadaný brief rozveď do jasných claimů, popisů a benefitů.

Vrať pouze JSON odpověď kompatibilní se schématem.
PROMPT;
    }

    private function responseSchema(): array
    {
        return [
            'type' => 'object',
            'additionalProperties' => false,
            'required' => ['theme', 'header', 'footer', 'sections'],
            'properties' => [
                'theme' => [
                    'type' => 'object',
                    'additionalProperties' => false,
                    'required' => ['palette', 'typography'],
                    'properties' => [
                        'palette' => [
                            'type' => 'object',
                            'additionalProperties' => false,
                            'properties' => [
                                'primary' => ['type' => 'string'],
                                'secondary' => ['type' => 'string'],
                                'accent' => ['type' => 'string'],
                                'background' => ['type' => 'string'],
                                'surface' => ['type' => 'string'],
                                'muted' => ['type' => 'string'],
                                'onPrimary' => ['type' => 'string'],
                                'onSurface' => ['type' => 'string'],
                                'gradientFrom' => ['type' => 'string'],
                                'gradientTo' => ['type' => 'string'],
                            ],
                        ],
                        'typography' => [
                            'type' => 'object',
                            'additionalProperties' => false,
                            'properties' => [
                                'display' => ['type' => 'string'],
                                'sans' => ['type' => 'string'],
                            ],
                        ],
                    ],
                ],
                'header' => [
                    'type' => 'object',
                    'additionalProperties' => false,
                    'properties' => [
                        'title' => ['type' => 'string'],
                        'subtitle' => ['type' => 'string'],
                        'navigation' => [
                            'type' => 'array',
                            'items' => [
                                'type' => 'object',
                                'required' => ['label', 'href'],
                                'additionalProperties' => false,
                                'properties' => [
                                    'label' => ['type' => 'string'],
                                    'href' => ['type' => 'string'],
                                ],
                            ],
                        ],
                        'cta' => [
                            'type' => 'object',
                            'nullable' => true,
                            'required' => ['label', 'href'],
                            'properties' => [
                                'label' => ['type' => 'string'],
                                'href' => ['type' => 'string'],
                            ],
                        ],
                    ],
                ],
                'footer' => [
                    'type' => 'object',
                    'additionalProperties' => false,
                    'properties' => [
                        'aboutTitle' => ['type' => 'string'],
                        'aboutText' => ['type' => 'string'],
                        'contactTitle' => ['type' => 'string'],
                        'contactItems' => [
                            'type' => 'array',
                            'items' => [
                                'type' => 'object',
                                'required' => ['label', 'value'],
                                'additionalProperties' => false,
                                'properties' => [
                                    'label' => ['type' => 'string'],
                                    'value' => ['type' => 'string'],
                                ],
                            ],
                        ],
                        'links' => [
                            'type' => 'array',
                            'items' => [
                                'type' => 'object',
                                'required' => ['label', 'href'],
                                'additionalProperties' => false,
                                'properties' => [
                                    'label' => ['type' => 'string'],
                                    'href' => ['type' => 'string'],
                                ],
                            ],
                        ],
                    ],
                ],
                'sections' => [
                    'type' => 'array',
                    'minItems' => 4,
                    'items' => [
                        'type' => 'object',
                        'required' => ['type', 'title'],
                        'additionalProperties' => false,
                        'properties' => [
                            'type' => [
                                'type' => 'string',
                                'enum' => self::SECTION_TYPES,
                            ],
                            'eyebrow' => ['type' => 'string', 'nullable' => true],
                            'title' => ['type' => 'string'],
                            'subtitle' => ['type' => 'string', 'nullable' => true],
                            'description' => ['type' => 'string', 'nullable' => true],
                            'primary_cta' => [
                                'type' => 'object',
                                'nullable' => true,
                                'required' => ['label', 'href'],
                                'properties' => [
                                    'label' => ['type' => 'string'],
                                    'href' => ['type' => 'string'],
                                ],
                            ],
                            'secondary_cta' => [
                                'type' => 'object',
                                'nullable' => true,
                                'required' => ['label', 'href'],
                                'properties' => [
                                    'label' => ['type' => 'string'],
                                    'href' => ['type' => 'string'],
                                ],
                            ],
                            'layout' => ['type' => 'string', 'nullable' => true, 'enum' => ['grid', 'carousel']],
                            'limit' => ['type' => 'integer', 'nullable' => true],
                            'items' => [
                                'type' => 'array',
                                'nullable' => true,
                                'items' => [
                                    'type' => 'object',
                                    'additionalProperties' => false,
                                    'properties' => [
                                        'title' => ['type' => 'string', 'nullable' => true],
                                        'description' => ['type' => 'string', 'nullable' => true],
                                        'icon' => ['type' => 'string', 'nullable' => true],
                                        'quote' => ['type' => 'string', 'nullable' => true],
                                        'author' => ['type' => 'string', 'nullable' => true],
                                        'role' => ['type' => 'string', 'nullable' => true],
                                        'question' => ['type' => 'string', 'nullable' => true],
                                        'answer' => ['type' => 'string', 'nullable' => true],
                                    ],
                                ],
                            ],
                            'media_image_prompt' => ['type' => 'string', 'nullable' => true],
                        ],
                    ],
                ],
                'image_prompts' => [
                    'type' => 'array',
                    'nullable' => true,
                    'items' => ['type' => 'string'],
                ],
            ],
        ];
    }

    private function sanitizeTheme(array $theme): array
    {
        $palette = is_array($theme['palette'] ?? null) ? $theme['palette'] : [];
        $typography = is_array($theme['typography'] ?? null) ? $theme['typography'] : [];

        return [
            'palette' => [
                'primary' => $this->sanitizeColor($palette['primary'] ?? null, '#6F2CFF'),
                'secondary' => $this->sanitizeColor($palette['secondary'] ?? null, '#0B112B'),
                'accent' => $this->sanitizeColor($palette['accent'] ?? null, '#14B8A6'),
                'background' => $this->sanitizeColor($palette['background'] ?? null, '#020617'),
                'surface' => $this->sanitizeColor($palette['surface'] ?? null, '#0F172A'),
                'muted' => $this->sanitizeColor($palette['muted'] ?? null, '#1E293B'),
                'onPrimary' => $this->sanitizeColor($palette['onPrimary'] ?? null, '#0B1120'),
                'onSurface' => $this->sanitizeColor($palette['onSurface'] ?? null, '#F8FAFC'),
                'gradientFrom' => $this->sanitizeColor($palette['gradientFrom'] ?? null, '#7C3AED'),
                'gradientTo' => $this->sanitizeColor($palette['gradientTo'] ?? null, '#0891B2'),
            ],
            'typography' => [
                'display' => $this->sanitizeText($typography['display'] ?? null) ?? 'Clash Display',
                'sans' => $this->sanitizeText($typography['sans'] ?? null) ?? 'Inter',
            ],
        ];
    }

    private function sanitizeHeader(array $header): array
    {
        $navigation = [];
        foreach (($header['navigation'] ?? []) as $item) {
            if (! is_array($item)) {
                continue;
            }

            $label = $this->sanitizeShortText($item['label'] ?? null);
            if (! $label) {
                continue;
            }

            $href = $this->sanitizeLink($item['href'] ?? null) ?? '#kolekce';

            $navigation[] = [
                'id' => (string) Str::uuid(),
                'label' => $label,
                'href' => $href,
            ];
        }

        return [
            'title' => $this->sanitizeShortText($header['title'] ?? null) ?? 'Microshop',
            'subtitle' => $this->sanitizeShortText($header['subtitle'] ?? null) ?? 'Limitovaná kolekce niche vůní',
            'showPublishedBadge' => true,
            'visible' => true,
            'navigation' => array_slice($navigation, 0, 6),
            'cta' => $this->sanitizeCta($header['cta'] ?? null),
        ];
    }

    private function sanitizeFooter(array $footer): array
    {
        $contactItems = [];
        foreach (($footer['contactItems'] ?? []) as $item) {
            if (! is_array($item)) {
                continue;
            }

            $label = $this->sanitizeShortText($item['label'] ?? null);
            $value = $this->sanitizeShortText($item['value'] ?? null);

            if ($label && $value) {
                $contactItems[] = [
                    'id' => (string) Str::uuid(),
                    'label' => $label,
                    'value' => $value,
                ];
            }
        }

        $links = [];
        foreach (($footer['links'] ?? []) as $item) {
            if (! is_array($item)) {
                continue;
            }

            $label = $this->sanitizeShortText($item['label'] ?? null);
            $href = $this->sanitizeLink($item['href'] ?? null);

            if ($label && $href) {
                $links[] = [
                    'id' => (string) Str::uuid(),
                    'label' => $label,
                    'href' => $href,
                ];
            }
        }

        return [
            'aboutTitle' => $this->sanitizeShortText($footer['aboutTitle'] ?? null) ?? 'Krásné Vůně',
            'aboutText' => $this->sanitizeParagraph($footer['aboutText'] ?? null) ?? 'Kurátorované microshopy s VIP servisem.',
            'contactTitle' => $this->sanitizeShortText($footer['contactTitle'] ?? null) ?? 'Kontakt',
            'contactItems' => $contactItems === []
                ? [[
                    'id' => (string) Str::uuid(),
                    'label' => 'Podpora HUB',
                    'value' => 'support@krasnevune.cz',
                ]]
                : array_slice($contactItems, 0, 5),
            'links' => $links === []
                ? [[
                    'id' => (string) Str::uuid(),
                    'label' => 'Kolekce',
                    'href' => '#kolekce',
                ]]
                : array_slice($links, 0, 5),
            'visible' => true,
        ];
    }

    private function sanitizeSections(array $sections): array
    {
        $normalized = [];

        foreach ($sections as $section) {
            if (! is_array($section)) {
                continue;
            }

            $type = $this->sanitizeSectionType($section['type'] ?? null);

            if (! $type) {
                continue;
            }

            $entry = array_filter([
                'type' => $type,
                'eyebrow' => $this->sanitizeShortText($section['eyebrow'] ?? null),
                'title' => $this->sanitizeShortText($section['title'] ?? null),
                'subtitle' => $this->sanitizeShortText($section['subtitle'] ?? null),
                'description' => $this->sanitizeParagraph($section['description'] ?? null),
            ], fn ($value) => $value !== null && $value !== '');

            if ($type === 'hero') {
                $entry['primaryCta'] = $this->sanitizeCta($section['primary_cta'] ?? null);
                $entry['secondaryCta'] = $this->sanitizeCta($section['secondary_cta'] ?? null);
            }

            if ($type === 'product-grid') {
                $entry['limit'] = $this->sanitizeInteger($section['limit'] ?? null, 6, 2, 12);
                $layout = $this->sanitizeText($section['layout'] ?? null);
                $entry['layout'] = in_array($layout, ['grid', 'carousel'], true) ? $layout : 'grid';
            }

            if ($type === 'highlights') {
                $entry['items'] = $this->sanitizeHighlights($section['items'] ?? []);
            }

            if ($type === 'testimonials') {
                $entry['items'] = $this->sanitizeTestimonials($section['items'] ?? []);
            }

            if ($type === 'faq') {
                $entry['items'] = $this->sanitizeFaq($section['items'] ?? []);
            }

            if ($type === 'cta') {
                $entry['cta'] = $this->sanitizeCta($section['primary_cta'] ?? null);
            }

            $normalized[] = $entry;
        }

        if ($normalized === []) {
            return [
                [
                    'type' => 'hero',
                    'eyebrow' => 'Nová kolekce',
                    'title' => 'Vůně, které píší příběh',
                    'description' => 'Personalizovaný výběr niche parfémů s okamžitým on-line concierge.',
                    'primaryCta' => ['label' => 'Objev kolekci', 'href' => '#kolekce'],
                ],
                [
                    'type' => 'product-grid',
                    'title' => 'Signature výběr',
                    'description' => 'Produkty, které vystihují brief.',
                    'limit' => 6,
                    'layout' => 'grid',
                ],
                [
                    'type' => 'cta',
                    'eyebrow' => 'Domluv call',
                    'title' => 'Připravme microshop společně',
                    'cta' => ['label' => 'Spojit s concierge', 'href' => '#kontakt'],
                ],
            ];
        }

        return $normalized;
    }

    private function sanitizeHighlights($items): array
    {
        $result = [];

        foreach (is_array($items) ? $items : [] as $item) {
            if (! is_array($item)) {
                continue;
            }

            $title = $this->sanitizeShortText($item['title'] ?? null);
            $description = $this->sanitizeParagraph($item['description'] ?? null);

            if ($title || $description) {
                $result[] = [
                    'id' => (string) Str::uuid(),
                    'title' => $title ?? 'Benefit',
                    'description' => $description ?? '',
                    'icon' => $this->sanitizeShortText($item['icon'] ?? null) ?? 'Sparkles',
                ];
            }
        }

        return array_slice($result, 0, 6);
    }

    private function sanitizeTestimonials($items): array
    {
        $result = [];

        foreach (is_array($items) ? $items : [] as $item) {
            if (! is_array($item)) {
                continue;
            }

            $quote = $this->sanitizeParagraph($item['quote'] ?? null);
            $author = $this->sanitizeShortText($item['author'] ?? null);

            if ($quote) {
                $result[] = [
                    'id' => (string) Str::uuid(),
                    'quote' => $quote,
                    'author' => $author ?? 'Host',
                    'role' => $this->sanitizeShortText($item['role'] ?? null),
                ];
            }
        }

        return array_slice($result, 0, 4);
    }

    private function sanitizeFaq($items): array
    {
        $result = [];

        foreach (is_array($items) ? $items : [] as $item) {
            if (! is_array($item)) {
                continue;
            }

            $question = $this->sanitizeShortText($item['question'] ?? null);
            $answer = $this->sanitizeParagraph($item['answer'] ?? null);

            if ($question && $answer) {
                $result[] = [
                    'id' => (string) Str::uuid(),
                    'question' => $question,
                    'answer' => $answer,
                ];
            }
        }

        return array_slice($result, 0, 6);
    }

    private function sanitizeKeywords($keywords): array
    {
        $result = [];

        foreach (is_array($keywords) ? $keywords : [] as $keyword) {
            $text = $this->sanitizeShortText($keyword);

            if ($text) {
                $result[] = $text;
            }
        }

        return array_slice($result, 0, 6);
    }

    private function sanitizeImagePrompts($prompts): array
    {
        $result = [];

        foreach (is_array($prompts) ? $prompts : [] as $prompt) {
            $text = $this->sanitizeParagraph($prompt);

            if ($text) {
                $result[] = $text;
            }
        }

        return array_slice($result, 0, 4);
    }

    private function sanitizeSectionType($type): ?string
    {
        $type = $this->sanitizeText($type);

        if (! $type) {
            return null;
        }

        if (! in_array($type, self::SECTION_TYPES, true)) {
            return null;
        }

        return $type;
    }

    private function sanitizeCta($cta): ?array
    {
        if (! is_array($cta)) {
            return null;
        }

        $label = $this->sanitizeShortText($cta['label'] ?? null);
        $href = $this->sanitizeLink($cta['href'] ?? null);

        if (! $label || ! $href) {
            return null;
        }

        return [
            'label' => $label,
            'href' => $href,
        ];
    }

    private function sanitizeColor($value, string $fallback): string
    {
        $value = is_string($value) ? trim($value) : '';

        if ($value === '') {
            return $fallback;
        }

        if (! str_starts_with($value, '#')) {
            $value = '#'.$value;
        }

        if (! preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/', $value)) {
            return $fallback;
        }

        return strtoupper($value);
    }

    private function sanitizeText($value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);

        return $value === '' ? null : $value;
    }

    private function sanitizeShortText($value): ?string
    {
        $value = $this->sanitizeText($value);

        if (! $value) {
            return null;
        }

        return Str::limit($value, 120, '…');
    }

    private function sanitizeParagraph($value): ?string
    {
        $value = $this->sanitizeText($value);

        if (! $value) {
            return null;
        }

        return Str::limit($value, 600, '…');
    }

    private function sanitizeLink($value): ?string
    {
        $value = $this->sanitizeText($value);

        if (! $value) {
            return null;
        }

        if (str_starts_with($value, '#') || str_starts_with($value, '/')) {
            return $value;
        }

        if (filter_var($value, FILTER_VALIDATE_URL)) {
            return $value;
        }

        return '#kontakt';
    }

    private function sanitizeInteger($value, int $fallback, int $min, int $max): int
    {
        if (! is_numeric($value)) {
            return $fallback;
        }

        $intValue = (int) $value;

        return max($min, min($max, $intValue));
    }
}
