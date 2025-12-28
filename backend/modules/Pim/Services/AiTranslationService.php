<?php

namespace Modules\Pim\Services;

use DOMDocument;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Modules\Core\Services\SettingsService;
use Modules\Core\Services\CurrencyConverter;
use Modules\Pim\Exceptions\MissingAttributeMappingException;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ShopAttributeMapping;
use Modules\Pim\Models\ProductVariant;
use Modules\Pim\Services\CategoryMappingService;
use Modules\Shoptet\Models\Shop;

class AiTranslationService
{
    public function __construct(
        private readonly SettingsService $settings,
        private readonly CategoryMappingService $categoryMapping,
        private readonly CurrencyConverter $currencyConverter
    )
    {
    }

    /**
     * @param array<int, string> $sections
     * @return array<string, mixed>
     */
    public function translateProduct(
        Product $product,
        string $targetLocale,
        ?Shop $targetShop = null,
        array $sections = [],
        array $overrides = []
    ): array
    {
        $apiKey = $this->settings->getDecrypted('openai_api_key');

        if (! $apiKey) {
            throw new \RuntimeException('OpenAI API key is not configured.');
        }

        $product->loadMissing(['variants', 'shop']);

        $model = config('services.openai.model', 'gpt-4o-mini');
        $sourceLocale = $product->base_locale ?? 'cs';
        $payload = $product->base_payload ?? [];
        $sections = $this->sanitizeSections($sections);

        $source = [
            'name' => $payload['name'] ?? '',
            'short_description' => $payload['shortDescription'] ?? '',
            'description' => $payload['description'] ?? '',
        ];

        $systemPrompt = $this->buildSystemPrompt($sourceLocale, $targetLocale, $sections);

        $canonicalVariants = $this->resolveCanonicalVariants($product);
        $variants = array_slice($canonicalVariants, 0, 10);

        $userContent = [
            'source_locale' => $sourceLocale,
            'target_locale' => $targetLocale,
            'sections' => $sections,
            'product' => $source,
            'seo' => [
                'metaTitle' => Arr::get($payload, 'metaTitle'),
                'metaDescription' => Arr::get($payload, 'metaDescription'),
                'indexName' => Arr::get($payload, 'indexName'),
            ],
            'parameters' => [
                'descriptive' => Arr::get($payload, 'descriptiveParameters', []),
                'filtering' => Arr::get($payload, 'filteringParameters', []),
            ],
            'categories' => Arr::get($payload, 'categories', []),
            'images' => collect(Arr::get($payload, 'images', []))
                ->filter(fn ($image) => is_array($image))
                ->take(8)
                ->values()
                ->map(function (array $image, int $index) {
                    return [
                        'position' => $index + 1,
                        'source' => Arr::get($image, 'sourceUrl')
                            ?? Arr::get($image, 'url')
                            ?? Arr::get($image, 'cdnUrl')
                            ?? Arr::get($image, 'cdnName')
                            ?? Arr::get($image, 'name'),
                        'title' => Arr::get($image, 'title'),
                        'description' => Arr::get($image, 'description'),
                    ];
                })->all(),
            'variants' => $variants,
            'pricing' => [
                'price' => Arr::get($payload, 'variants.0.price'),
                'currencyCode' => Arr::get($payload, 'variants.0.currencyCode') ?? Arr::get($payload, 'currency'),
            ],
            'target_shop' => $targetShop ? [
                'name' => $targetShop->name,
                'locale' => $targetShop->locale ?? $targetShop->default_locale,
                'currency_code' => $targetShop->currency_code,
                'domain' => $targetShop->domain,
            ] : null,
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
                            'name' => 'product_translation',
                            'schema' => [
                                'type' => 'object',
                                'required' => ['name', 'short_description', 'description', 'seo'],
                                'additionalProperties' => false,
                                'properties' => [
                                    'name' => ['type' => 'string', 'nullable' => true],
                                    'short_description' => ['type' => 'string', 'nullable' => true],
                                    'description' => ['type' => 'string', 'nullable' => true],
                                    'slug' => ['type' => 'string', 'nullable' => true],
                                    'seo' => [
                                        'type' => 'object',
                                        'additionalProperties' => false,
                                        'properties' => [
                                            'metaTitle' => ['type' => 'string'],
                                            'metaDescription' => ['type' => 'string'],
                                        ],
                                        'required' => ['metaTitle', 'metaDescription'],
                                    ],
                                    'parameters' => [
                                        'type' => 'array',
                                        'nullable' => true,
                                        'items' => [
                                            'type' => 'object',
                                            'additionalProperties' => false,
                                            'properties' => [
                                                'name' => ['type' => 'string'],
                                                'value' => ['type' => 'string'],
                                                'unit' => ['type' => 'string', 'nullable' => true],
                                            ],
                                            'required' => ['name', 'value'],
                                        ],
                                    ],
                                    'filtering_parameters' => [
                                        'type' => 'array',
                                        'nullable' => true,
                                        'items' => [
                                            'type' => 'object',
                                            'additionalProperties' => false,
                                            'properties' => [
                                                'name' => ['type' => 'string'],
                                                'value' => ['type' => 'string'],
                                            ],
                                            'required' => ['name', 'value'],
                                        ],
                                    ],
                                    'images' => [
                                        'type' => 'array',
                                        'nullable' => true,
                                        'items' => [
                                            'type' => 'object',
                                            'required' => ['source'],
                                            'additionalProperties' => false,
                                            'properties' => [
                                                'source' => ['type' => 'string'],
                                                'alt' => ['type' => 'string', 'nullable' => true],
                                                'title' => ['type' => 'string', 'nullable' => true],
                                            ],
                                        ],
                                    ],
                                    'variants' => [
                                        'type' => 'array',
                                        'nullable' => true,
                                        'items' => [
                                            'type' => 'object',
                                            'required' => ['code'],
                                            'additionalProperties' => false,
                                            'properties' => [
                                                'code' => ['type' => 'string'],
                                                'name' => ['type' => 'string', 'nullable' => true],
                                                'parameters' => [
                                                    'type' => 'array',
                                                    'nullable' => true,
                                                    'items' => [
                                                        'type' => 'object',
                                                        'additionalProperties' => false,
                                                        'properties' => [
                                                            'name' => ['type' => 'string'],
                                                            'value' => ['type' => 'string'],
                                                        ],
                                                        'required' => ['name', 'value'],
                                                    ],
                                                ],
                                            ],
                                        ],
                                    ],
                                    'pricing' => [
                                        'type' => 'object',
                                        'nullable' => true,
                                        'additionalProperties' => false,
                                        'properties' => [
                                            'currencyCode' => ['type' => 'string', 'nullable' => true],
                                            'price' => ['type' => 'number', 'nullable' => true],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
                    'messages' => [
                        ['role' => 'system', 'content' => $systemPrompt],
                        ['role' => 'user', 'content' => json_encode($userContent, JSON_UNESCAPED_UNICODE)],
                    ],
                    'temperature' => 0.4,
                ]);
        } catch (ConnectionException $exception) {
            Log::error('OpenAI translation connection failed', ['message' => $exception->getMessage()]);

            throw new \RuntimeException('Unable to reach OpenAI service. Please check connectivity and try again.', 0, $exception);
        }

        if ($response->failed()) {
            $responseBody = $response->json();
            $errorMessage = data_get($responseBody, 'error.message') ?? $response->body();

            Log::warning('OpenAI translation HTTP error', [
                'status' => $response->status(),
                'body' => $responseBody ?? $response->body(),
            ]);

            throw new \RuntimeException('AI translation failed: '.($errorMessage ?: 'Unexpected error from OpenAI.'));
        }

        $response = $response->json();

        $content = data_get($response, 'choices.0.message.content');

        if (! $content) {
            Log::warning('OpenAI translation response missing content', ['response' => $response]);
            throw new \RuntimeException('AI translation failed.');
        }

        $decoded = json_decode($content, true);

        if (! is_array($decoded)) {
            Log::warning('OpenAI translation returned invalid JSON', ['content' => $content]);
            throw new \RuntimeException('AI translation returned invalid data.');
        }

        $this->ensureCategoriesMapped($product, $targetShop);

        $filterOverrides = $this->normalizeFilteringOverrides($overrides['filtering_parameters'] ?? []);
        $variantOverrides = $this->normalizeVariantOverrides($overrides['variants'] ?? []);
        $defaultVatRate = $this->resolveDefaultVatRate($targetShop);

        [$filteringParameters, $filteringMissing] = $this->buildMappedFilteringParameters(
            $product,
            $targetShop,
            $filterOverrides
        );

        $defaultVatRate = $this->resolveDefaultVatRate($targetShop);

        [$mappedVariants, $variantMissing] = $this->buildMappedVariantParameters(
            $canonicalVariants,
            $product,
            $targetShop,
            $variantOverrides,
            Arr::get($decoded, 'variants', []),
            $defaultVatRate
        );

        if ($filteringMissing !== [] || $variantMissing !== []) {
            throw new MissingAttributeMappingException(
                'Chybí namapovat filtrační nebo variantní parametry.',
                [
                    'filtering_parameters' => $filteringMissing,
                    'variants' => $variantMissing,
                ]
            );
        }

        if ($filteringParameters !== null && ! in_array('filtering_parameters', $sections, true)) {
            $sections[] = 'filtering_parameters';
        }

        if ($mappedVariants !== [] && ! in_array('variants', $sections, true)) {
            $sections[] = 'variants';
        }

        $sections = array_values(array_unique($sections));

        $name = $this->sanitizePlainText($decoded['name'] ?? null);
        $shortDescription = $this->sanitizeHtmlContent($decoded['short_description'] ?? null);
        $description = $this->sanitizeHtmlContent($decoded['description'] ?? null);

        return [
            'sections' => $sections,
            'translation' => [
                'name' => $name,
                'short_description' => $shortDescription,
                'description' => $description,
                'seo' => Arr::get($decoded, 'seo', null),
                'parameters' => Arr::get($decoded, 'parameters', null),
                'filtering_parameters' => $filteringParameters,
            ],
            'slug' => $this->sanitizeSlug($decoded['slug'] ?? null),
            'images' => Arr::get($decoded, 'images', null),
            'variants' => $mappedVariants ?: Arr::get($decoded, 'variants', null),
            'pricing' => Arr::get($decoded, 'pricing', null),
        ];
    }

    public function prepareMappingPreview(
        Product $product,
        ?Shop $targetShop = null,
        array $overrides = []
    ): array {
        $product->loadMissing(['variants', 'shop']);
        $targetShop ??= $product->shop;

        if (! $targetShop) {
            throw new \RuntimeException('Target shop is not available for mapping preview.');
        }

        $canonicalVariants = $this->resolveCanonicalVariants($product);

        $filterOverrides = $this->normalizeFilteringOverrides($overrides['filtering_parameters'] ?? []);
        $variantOverrides = $this->normalizeVariantOverrides($overrides['variants'] ?? []);
        $defaultVatRate = $this->resolveDefaultVatRate($targetShop);

        [$filteringParameters, $filteringMissing] = $this->buildMappedFilteringParameters(
            $product,
            $targetShop,
            $filterOverrides
        );

        [$mappedVariants, $variantMissing] = $this->buildMappedVariantParameters(
            $canonicalVariants,
            $product,
            $targetShop,
            $variantOverrides,
            [],
            $defaultVatRate
        );

        if ($filteringMissing !== [] || $variantMissing !== []) {
            throw new MissingAttributeMappingException(
                'Chybí namapovat filtrační nebo variantní parametry.',
                [
                    'filtering_parameters' => $filteringMissing,
                    'variants' => $variantMissing,
                ]
            );
        }

        $canonicalFilters = $this->buildCanonicalFilteringParameters($product);
        $canonicalVariantsDraft = $this->buildCanonicalVariantDrafts(
            $canonicalVariants,
            $product,
            $targetShop,
            $defaultVatRate
        );

        return [
            'filtering_parameters' => $filteringParameters ?? $canonicalFilters,
            'variants' => $mappedVariants !== [] ? $mappedVariants : $canonicalVariantsDraft,
        ];
    }

    /**
     * @param array<int, string> $sections
     * @return array<int, string>
     */
    private function sanitizeSections(array $sections): array
    {
        $allowed = [
            'text',
            'seo',
            'slug',
            'parameters',
            'filtering_parameters',
            'images',
            'variants',
            'pricing',
        ];

        $sections = array_values(array_intersect($sections, $allowed));

        if ($sections === []) {
            $sections = ['text'];
        }

        if (! in_array('text', $sections, true)) {
            $sections[] = 'text';
        }

        return array_values(array_unique($sections));
    }

    /**
     * @param array<int, string> $sections
     */
    private function buildSystemPrompt(string $sourceLocale, string $targetLocale, array $sections): string
    {
        $instructions = [
            'text' => 'Provide localized marketing copy (name, short description, long description). Preserve HTML tags and keep structure.',
            'seo' => 'Suggest concise SEO meta title and description that fit the target locale.',
            'slug' => 'Suggest a URL-friendly slug (lowercase, hyphen separated).',
            'parameters' => 'Localize descriptive parameters (names and values).',
            'filtering_parameters' => 'Localize filtering/faceted parameters.',
            'images' => 'Provide localized titles/alt texts for images.',
            'variants' => 'Suggest localized variant names and parameters for each variant code.',
            'pricing' => 'If possible, suggest price in the target shop currency (do not invent numbers if insufficient context).',
        ];

        $selectedInstructions = array_intersect_key($instructions, array_flip($sections));

        return sprintf(
            'You are a professional e-commerce localization specialist. Translate product data from %s to %s. %s Always respond in JSON using the provided schema and keep the tone suitable for product catalogues.',
            strtoupper($sourceLocale),
            strtoupper($targetLocale),
            implode(' ', $selectedInstructions)
        );
    }

    private function sanitizeSlug(?string $value): ?string
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        $slug = Str::slug($value);

        return $slug !== '' ? $slug : null;
    }

    private function sanitizePlainText(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim(str_replace("\u{00A0}", ' ', $value));

        return $trimmed === '' ? null : $trimmed;
    }

    private function normalizeEscapedSlashes(string $value): string
    {
        return str_replace('\/', '/', $value);
    }

    private function sanitizeHtmlContent(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $normalized = trim($this->normalizeEscapedSlashes($value));
        if ($normalized === '') {
            return null;
        }

        $original = $normalized;

        $byteLength = strlen($normalized);
        if ($byteLength > 200_000) {
            return $original;
        }

        $previousLibxml = libxml_use_internal_errors(true);

        $document = new DOMDocument('1.0', 'UTF-8');
        $html = '<?xml encoding="UTF-8"?><body>' . $normalized . '</body>';
        $loaded = $document->loadHTML($html, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_COMPACT);

        if ($loaded === false) {
            libxml_clear_errors();
            libxml_use_internal_errors($previousLibxml);

            return $original;
        }

        libxml_clear_errors();

        $output = '';
        $body = $document->getElementsByTagName('body')->item(0);
        if ($body) {
            foreach ($body->childNodes as $node) {
                $output .= $document->saveHTML($node);
            }
        }

        $output = trim($output);

        if ($output === '') {
            libxml_use_internal_errors($previousLibxml);

            return $original;
        }

        libxml_use_internal_errors($previousLibxml);

        if (strlen($output) > 200_000) {
            return $original;
        }

        return $this->normalizeEscapedSlashes($output);
    }

    /**
     * @return array{0: array<int, array<string, mixed>>|null, 1: array<int, array<string, mixed>>}
     */
    private function buildMappedFilteringParameters(Product $product, ?Shop $targetShop, array $overrides = []): array
    {
        if (! $targetShop || $targetShop->id === $product->shop_id) {
            return [null, []];
        }

        $basePayload = $product->base_payload ?? [];
        $masterFilteringParameters = Arr::get($basePayload, 'filteringParameters', []);

        if (! is_array($masterFilteringParameters) || $masterFilteringParameters === []) {
            return [null, []];
        }

        $mappings = ShopAttributeMapping::query()
            ->where('master_shop_id', $product->shop_id)
            ->where('target_shop_id', $targetShop->id)
            ->where('type', 'filtering_parameters')
            ->with('values')
            ->get()
            ->keyBy('master_key');

        $results = [];
        $missing = [];

        foreach ($masterFilteringParameters as $parameter) {
            if (! is_array($parameter)) {
                continue;
            }

            $masterKey = (string) ($parameter['code'] ?? $parameter['id'] ?? '');
            if ($masterKey === '') {
                continue;
            }

            $parameterLabel = $this->extractFilteringParameterLabel($parameter, $masterKey);
            $override = $overrides[$masterKey] ?? null;

            if ($override && ($override['ignore'] ?? false)) {
                continue;
            }

            /** @var ShopAttributeMapping|null $mapping */
            $mapping = $mappings->get($masterKey);
            $targetKey = $this->normalizeOverrideString($override['target_key'] ?? ($mapping->target_key ?? null));

            if ($targetKey === null) {
                $missing[] = [
                    'master_key' => $masterKey,
                    'label' => $parameterLabel,
                    'target_key' => null,
                    'values' => $this->describeFilteringValues(Arr::get($parameter, 'values', [])),
                ];
                continue;
            }

            $masterValues = Arr::get($parameter, 'values', []);
            if (! is_array($masterValues) || $masterValues === []) {
                continue;
            }

            $valueOverrides = is_array($override['values'] ?? null) ? $override['values'] : [];
            $valueMappings = $mapping?->values->keyBy('master_value_key');

            $resolvedValues = [];
            $valueMissing = [];

            foreach ($masterValues as $value) {
                $masterValue = $this->extractFilteringValueKey($value);
                if (! $masterValue) {
                    continue;
                }

                $valueLabel = $this->extractFilteringValueLabel($value, $masterValue);
                $overrideEntry = $valueOverrides[$masterValue] ?? null;
                $hasExplicitOverride = is_array($overrideEntry) && ($overrideEntry['explicit'] ?? false);
                $targetValueKey = null;
                $overrideLabel = null;

                if ($hasExplicitOverride) {
                    $targetValueKey = $overrideEntry['target_value_key'] ?? null;
                    $overrideLabel = $overrideEntry['target_value_label'] ?? null;

                    if ($targetValueKey === null) {
                        continue;
                    }
                }

                if ($targetValueKey === null && $valueMappings) {
                    $valueMapping = $valueMappings->get($masterValue);
                    if ($valueMapping) {
                        $targetValueKey = $this->normalizeOverrideString($valueMapping->target_value_key);
                        $overrideLabel = $this->normalizeOverrideString($valueMapping->target_value_label);
                    }
                }

                if ($targetValueKey === null) {
                    $valueMissing[] = [
                        'master_value_key' => $masterValue,
                        'label' => $valueLabel ?? $masterValue,
                    ];
                    continue;
                }

                $resolvedValues[] = [
                    'key' => $targetValueKey,
                    'label' => $overrideLabel ?? $valueLabel ?? $masterValue,
                    'color' => Arr::get($value, 'color'),
                    'priority' => Arr::get($value, 'priority'),
                    'likely_master_language' => false,
                ];
            }

            if ($valueMissing !== []) {
                $missing[] = [
                    'master_key' => $masterKey,
                    'label' => $parameterLabel,
                    'target_key' => $targetKey,
                    'values' => $valueMissing,
                ];
            }

            if ($resolvedValues === []) {
                continue;
            }

            $label = $mapping?->target_label
                ?? $mapping?->target_key
                ?? $mapping?->master_label
                ?? $parameterLabel;

            $results[] = [
                'key' => $targetKey,
                'label' => $label,
                'code' => $targetKey,
                'values' => array_values($resolvedValues),
                'likely_master_language' => false,
            ];
        }

        return [$results === [] ? null : $results, $missing];
    }

    /**
     * @return array<int, array{key: string, code: string, label: string, values: array<int, array{key: string, label: string|null, color: mixed, priority: mixed}>}>
     */
    private function buildCanonicalFilteringParameters(Product $product): array
    {
        $basePayload = $product->base_payload ?? [];
        $masterFilteringParameters = Arr::get($basePayload, 'filteringParameters', []);

        if (! is_array($masterFilteringParameters) || $masterFilteringParameters === []) {
            return [];
        }

        $results = [];

        foreach ($masterFilteringParameters as $parameter) {
            if (! is_array($parameter)) {
                continue;
            }

            $masterKey = (string) ($parameter['code'] ?? $parameter['id'] ?? '');
            if ($masterKey === '') {
                continue;
            }

            $parameterLabel = $this->extractFilteringParameterLabel($parameter, $masterKey);
            $masterValues = Arr::get($parameter, 'values', []);

            $values = [];

            if (is_array($masterValues)) {
                foreach ($masterValues as $value) {
                    $valueKey = $this->extractFilteringValueKey($value);
                    if (! $valueKey) {
                        continue;
                    }

                    $values[] = [
                        'key' => $valueKey,
                        'label' => $this->extractFilteringValueLabel($value, $valueKey),
                        'color' => Arr::get($value, 'color'),
                        'priority' => Arr::get($value, 'priority'),
                    ];
                }
            }

            $results[] = [
                'key' => $masterKey,
                'code' => $masterKey,
                'label' => $parameterLabel,
                'values' => $values,
            ];
        }

        return $results;
    }

    private function resolveCanonicalVariants(Product $product): array
    {
        $payload = $product->base_payload ?? [];

        $variants = collect(Arr::get($payload, 'variants', []))
            ->filter(fn ($variant) => is_array($variant))
            ->values()
            ->map(function (array $variant) {
                $purchasePrice = Arr::get($variant, 'purchase_price')
                    ?? Arr::get($variant, 'purchasePrice.price')
                    ?? Arr::get($variant, 'purchasePrice')
                    ?? Arr::get($variant, 'prices.purchasePrice.price');

                return [
                    'code' => Arr::get($variant, 'code'),
                    'name' => Arr::get($variant, 'name') ?? Arr::get($variant, 'title'),
                    'parameters' => Arr::get($variant, 'variantParameters')
                        ?? Arr::get($variant, 'attributeCombination.parameters')
                        ?? Arr::get($variant, 'parameters'),
                    'price' => Arr::get($variant, 'price'),
                    'currencyCode' => Arr::get($variant, 'currencyCode'),
                    'stock' => Arr::get($variant, 'stock'),
                    'vat_rate' => Arr::get($variant, 'vatRate') ?? Arr::get($variant, 'vat_rate'),
                    'purchasePrice' => is_numeric($purchasePrice) ? (float) $purchasePrice : null,
                ];
            })->all();

        if ($variants === [] && $product->relationLoaded('variants') === false) {
            $product->loadMissing('variants');
        }

        if ($variants === [] && $product->variants && $product->variants->isNotEmpty()) {
            $variants = $product->variants
                ->filter(fn (ProductVariant $variant) => is_string($variant->code) && $variant->code !== '')
                ->values()
                ->map(function (ProductVariant $variant) {
                    $data = is_array($variant->data) ? $variant->data : [];

                    $purchasePrice = Arr::get($data, 'purchase_price')
                        ?? Arr::get($data, 'purchasePrice.price')
                        ?? Arr::get($data, 'purchasePrice')
                        ?? Arr::get($data, 'prices.purchasePrice.price')
                        ?? $variant->purchase_price;

                    return [
                        'code' => $variant->code,
                        'name' => $variant->name
                            ?? Arr::get($data, 'name')
                            ?? Arr::get($data, 'title'),
                        'parameters' => Arr::get($data, 'variantParameters')
                            ?? Arr::get($data, 'attributeCombination.parameters')
                            ?? Arr::get($data, 'parameters'),
                        'price' => $variant->price ?? Arr::get($data, 'price'),
                        'currencyCode' => $variant->currency_code ?? Arr::get($data, 'currencyCode'),
                        'stock' => $variant->stock ?? Arr::get($data, 'stock'),
                        'vat_rate' => $variant->vat_rate ?? Arr::get($data, 'vatRate') ?? Arr::get($data, 'vat_rate'),
                        'purchasePrice' => is_numeric($purchasePrice) ? (float) $purchasePrice : null,
                    ];
                })
                ->all();
        }

        return $variants;
    }

    private function extractFilteringParameterLabel(array $parameter, ?string $fallback = null): string
    {
        $candidates = [
            $parameter['displayName'] ?? null,
            $parameter['name'] ?? null,
            $parameter['code'] ?? null,
        ];

        foreach ($candidates as $candidate) {
            if (is_string($candidate) && trim($candidate) !== '') {
                return $candidate;
            }
        }

        return $fallback ?? 'Neznámý parametr';
    }

    private function extractFilteringValueKey(mixed $value): ?string
    {
        if (is_string($value) && $value !== '') {
            return $value;
        }

        if (is_array($value)) {
            $candidates = [
                $value['valueIndex'] ?? null,
                $value['code'] ?? null,
                $value['id'] ?? null,
                $value['name'] ?? null,
            ];

            foreach ($candidates as $candidate) {
                if (is_string($candidate) && trim($candidate) !== '') {
                    return $candidate;
                }
            }
        }

        return null;
    }

    private function extractFilteringValueLabel(mixed $value, ?string $fallback = null): ?string
    {
        if (is_array($value)) {
            $candidates = [
                $value['name'] ?? null,
                $value['displayName'] ?? null,
                $value['value'] ?? null,
            ];

            foreach ($candidates as $candidate) {
                if (is_string($candidate) && trim($candidate) !== '') {
                    return $candidate;
                }
            }
        } elseif (is_string($value) && trim($value) !== '') {
            return $value;
        }

        return $fallback;
    }

    private function ensureCategoriesMapped(Product $product, ?Shop $targetShop): void
    {
        if (! $targetShop || $targetShop->id === $product->shop_id) {
            return;
        }

        $categoryGuids = $this->extractCanonicalCategoryGuids($product);
        if ($categoryGuids === []) {
            return;
        }

        $mapped = $this->categoryMapping->mapCanonicalCategoriesToShop($categoryGuids, $targetShop);
        if ($mapped === []) {
            throw new \RuntimeException('Chybí namapovat kategorie pro cílový shop.');
        }

        $payload = $product->base_payload ?? [];
        $defaultCanonical = Arr::get($payload, 'defaultCategory.guid')
            ?? Arr::get($payload, 'defaultCategoryGuid');

        $missingDefault = null;
        $missingNonDefault = [];
        $mappedCount = 0;

        foreach ($mapped as $entry) {
            $canonicalGuid = $entry['guid'] ?? null;
            $remoteGuid = Arr::get($entry, 'mapping.shop_category.remote_guid');

            if (is_string($remoteGuid) && trim($remoteGuid) !== '') {
                $mappedCount++;

                if ($defaultCanonical && $canonicalGuid === $defaultCanonical) {
                    $missingDefault = null;
                }

                continue;
            }

            if ($defaultCanonical && $canonicalGuid === $defaultCanonical) {
                $missingDefault = $entry['name'] ?? $canonicalGuid ?? 'Neznámá kategorie';
                continue;
            }

            if ($canonicalGuid) {
                $missingNonDefault[] = array_filter([
                    'guid' => $canonicalGuid,
                    'name' => $entry['name'] ?? null,
                    'path' => $entry['path'] ?? null,
                ], fn ($value) => $value !== null && $value !== '');
            }
        }

        if ($mappedCount === 0) {
            throw new \RuntimeException('Chybí namapovat kategorie pro cílový shop.');
        }

        if ($missingDefault !== null) {
            throw new \RuntimeException('Chybí namapovat kategorie: ' . $missingDefault);
        }

        if ($missingNonDefault !== []) {
            Log::warning('Skipping unmapped non-default categories during AI translation.', [
                'product_id' => $product->id,
                'shop_id' => $targetShop->id,
                'categories' => $missingNonDefault,
            ]);
        }
    }

    /**
     * @return array<int, string>
     */
    private function extractCanonicalCategoryGuids(Product $product): array
    {
        $payload = $product->base_payload ?? [];
        $guids = [];

        $default = Arr::get($payload, 'defaultCategory.guid') ?? Arr::get($payload, 'defaultCategoryGuid');
        if (is_string($default) && $default !== '') {
            $guids[] = $default;
        }

        $categories = Arr::get($payload, 'categories');
        if (is_array($categories)) {
            foreach ($categories as $category) {
                if (! is_array($category)) {
                    continue;
                }
                $guid = $category['guid'] ?? $category['id'] ?? null;
                if (is_string($guid) && $guid !== '') {
                    $guids[] = $guid;
                }
            }
        }

        return array_values(array_unique($guids));
    }

    private function extractVariantParameterLabel(array $parameter, ?string $fallback = null): ?string
    {
        $candidates = [
            $parameter['name'] ?? null,
            $parameter['displayName'] ?? null,
            $parameter['title'] ?? null,
        ];

        foreach ($candidates as $candidate) {
            if (is_string($candidate) && trim($candidate) !== '') {
                return $candidate;
            }
        }

        return $fallback;
    }

    private function extractVariantParameterValueLabel(array $parameter, ?string $fallback = null): ?string
    {
        $candidates = [
            $parameter['value'] ?? null,
            $parameter['text'] ?? null,
            $parameter['paramValue'] ?? null,
        ];

        foreach ($candidates as $candidate) {
            if (is_string($candidate) && trim($candidate) !== '') {
                return $candidate;
            }
        }

        return $fallback;
    }

    /**
     * @param array{nameIndex?: string|null, valueIndex?: string|null, paramIndex?: string|null, index?: string|null, code?: string|null, name?: string|null} $parameter
     */
    private function extractVariantParameterKey(array $parameter): ?string
    {
        $candidates = [
            'nameIndex',
            'paramIndex',
            'index',
            'code',
            'name',
        ];

        foreach ($candidates as $candidate) {
            $value = Arr::get($parameter, $candidate);
            if (is_string($value) && $value !== '') {
                return $value;
            }
        }

        return null;
    }

    /**
     * @param array{valueIndex?: string|null, rawValue?: string|null, value?: string|null, paramValue?: string|null} $parameter
     */
    private function extractVariantParameterValueKey(array $parameter): ?string
    {
        $candidates = [
            'valueIndex',
            'rawValue',
            'value',
            'paramValue',
        ];

        foreach ($candidates as $candidate) {
            $value = Arr::get($parameter, $candidate);
            if (is_string($value) && $value !== '') {
                return $value;
            }
        }

        return null;
    }
    /**
     * @return array{0: array<int, array<string, mixed>>, 1: array<int, array<string, mixed>>}
     */
    private function buildMappedVariantParameters(
        array $canonicalVariants,
        Product $product,
        ?Shop $targetShop,
        array $overrides = [],
        array $aiVariants = [],
        ?float $defaultVatRate = null
    ): array {
        if (! $targetShop || $targetShop->id === $product->shop_id) {
            return [[], []];
        }

        if ($canonicalVariants === []) {
            return [[], []];
        }

        $mappings = ShopAttributeMapping::query()
            ->where('master_shop_id', $product->shop_id)
            ->where('target_shop_id', $targetShop->id)
            ->where('type', 'variants')
            ->with('values')
            ->get()
            ->keyBy('master_key');

        $aiVariantIndex = collect($aiVariants ?? [])
            ->filter(fn ($variant) => is_array($variant) && isset($variant['code']))
            ->keyBy(fn ($variant) => $variant['code'])
            ->all();

        $results = [];
        $missing = [];

        foreach ($canonicalVariants as $variant) {
            if (! is_array($variant)) {
                continue;
            }

            $code = $variant['code'] ?? null;
            if (! is_string($code) || trim($code) === '') {
                continue;
            }

            $parameters = Arr::get($variant, 'parameters', []);
            if (! is_array($parameters) || $parameters === []) {
                continue;
            }

            $variantOverride = $overrides[$code] ?? [];
            $mappedParameters = [];

            foreach ($parameters as $parameter) {
                if (! is_array($parameter)) {
                    continue;
                }

                $masterKey = $this->extractVariantParameterKey($parameter);
                if (! $masterKey) {
                    continue;
                }

                $parameterLabel = $this->extractVariantParameterLabel($parameter, $masterKey);
                $parameterOverride = $variantOverride[$masterKey] ?? null;

                if ($parameterOverride && ($parameterOverride['ignore'] ?? false)) {
                    continue;
                }

                /** @var ShopAttributeMapping|null $mapping */
                $mapping = $mappings->get($masterKey);
                $targetKey = $this->normalizeOverrideString($parameterOverride['target_key'] ?? ($mapping->target_key ?? null));

                if ($targetKey === null) {
                    $missing[] = [
                        'variant_code' => $code,
                        'variant_name' => Arr::get($variant, 'name'),
                        'parameter_key' => $masterKey,
                        'label' => $parameterLabel ?? $masterKey,
                        'target_key' => null,
                        'values' => $this->describeVariantParameterValues($parameter),
                    ];
                    continue;
                }

                $valueKey = $this->extractVariantParameterValueKey($parameter);
                if (! $valueKey) {
                    continue;
                }

                $valueLabel = $this->extractVariantParameterValueLabel($parameter, $valueKey);
                $valueOverrides = is_array($parameterOverride['values'] ?? null) ? $parameterOverride['values'] : [];
                $valueOverride = $valueOverrides[$valueKey] ?? null;
                $hasExplicitOverride = is_array($valueOverride) && ($valueOverride['explicit'] ?? false);
                $targetValueKey = null;
                $overrideLabel = null;

                if ($hasExplicitOverride) {
                    $targetValueKey = $valueOverride['target_value_key'] ?? null;
                    $overrideLabel = $valueOverride['target_value_label'] ?? null;

                    if ($targetValueKey === null) {
                        continue;
                    }
                }

                if ($targetValueKey === null && $mapping) {
                    $valueMapping = $mapping->values->firstWhere('master_value_key', $valueKey);
                    if ($valueMapping) {
                        $targetValueKey = $this->normalizeOverrideString($valueMapping->target_value_key);
                        $overrideLabel = $this->normalizeOverrideString($valueMapping->target_value_label);
                    }
                }

                if ($targetValueKey === null) {
                    $missing[] = [
                        'variant_code' => $code,
                        'variant_name' => Arr::get($variant, 'name'),
                        'parameter_key' => $masterKey,
                        'label' => $parameterLabel ?? $masterKey,
                        'target_key' => $targetKey,
                        'values' => [
                            [
                                'master_value_key' => $valueKey,
                                'label' => $valueLabel ?? $valueKey,
                            ],
                        ],
                    ];
                    continue;
                }

                $mappedParameters[] = [
                    'name' => $mapping?->target_label
                        ?? $mapping?->target_key
                        ?? $mapping?->master_label
                        ?? $parameterLabel
                        ?? $masterKey,
                    'value' => $overrideLabel
                        ?? $valueLabel
                        ?? $valueKey,
                    'nameIndex' => $targetKey,
                    'valueIndex' => $targetValueKey,
                ];
            }

            if ($mappedParameters === []) {
                continue;
            }

            $aiVariant = $aiVariantIndex[$code] ?? [];
            $targetCurrency = $targetShop->currency_code ?? null;
            $sourceCurrency = $variant['currencyCode']
                ?? $product->shop?->currency_code
                ?? $this->currencyConverter->getBaseCurrency();
            $sourcePrice = Arr::get($variant, 'price');
            $convertedPrice = null;

            if ($targetCurrency && $sourcePrice !== null && is_numeric($sourcePrice)) {
                $convertedPrice = $this->currencyConverter->convert(
                    (float) $sourcePrice,
                    $sourceCurrency,
                    $targetCurrency
                );
            }

            $stockValue = Arr::get($variant, 'stock');
            $stockAmount = is_numeric($stockValue) ? (float) $stockValue : null;
            $variantVatRate = Arr::get($variant, 'vat_rate') ?? Arr::get($variant, 'vatRate');
            $resolvedVatRate = is_numeric($variantVatRate)
                ? (float) $variantVatRate
                : ($defaultVatRate ?? null);
            $sourcePurchasePrice = Arr::get($variant, 'purchasePrice') ?? Arr::get($variant, 'purchase_price');
            $convertedPurchasePrice = null;

            if ($targetCurrency && $sourcePurchasePrice !== null && is_numeric($sourcePurchasePrice)) {
                $convertedPurchasePrice = $this->currencyConverter->convert(
                    (float) $sourcePurchasePrice,
                    $sourceCurrency,
                    $targetCurrency
                );
            }

            $results[] = [
                'code' => $code,
                'name' => Arr::get($aiVariant, 'name') ?? Arr::get($variant, 'name'),
                'parameters' => $mappedParameters,
                'price' => $convertedPrice,
                'currencyCode' => $targetCurrency ?? $sourceCurrency,
                'stock' => $stockAmount,
                'vatRate' => $resolvedVatRate,
                'purchasePrice' => $convertedPurchasePrice
                    ?? (is_numeric($sourcePurchasePrice) ? (float) $sourcePurchasePrice : null),
            ];
        }

        return [$results, $missing];
    }

    /**
     * @param array<int, array<string, mixed>> $overrides
     * @return array<string, array{target_key: string|null, ignore: bool, values: array<string, array{target_value_key: string|null, target_value_label: string|null, explicit: bool}>}>
     */
    private function normalizeFilteringOverrides(array $overrides): array
    {
        $normalized = [];

        foreach ($overrides as $entry) {
            if (! is_array($entry)) {
                continue;
            }

            $masterKey = $this->normalizeOverrideString($entry['master_key'] ?? null);
            if ($masterKey === null) {
                continue;
            }

            $valueOverrides = [];
            foreach (Arr::get($entry, 'values', []) as $valueEntry) {
                if (! is_array($valueEntry)) {
                    continue;
                }

                $masterValueKey = $this->normalizeOverrideString($valueEntry['master_value_key'] ?? null);
                if ($masterValueKey === null) {
                    continue;
                }

                $valueOverrides[$masterValueKey] = [
                    'target_value_key' => $this->normalizeOverrideString($valueEntry['target_value_key'] ?? null),
                    'target_value_label' => $this->normalizeOverrideString($valueEntry['target_value_label'] ?? null),
                    'explicit' => array_key_exists('target_value_key', $valueEntry),
                ];
            }

            $normalized[$masterKey] = [
                'target_key' => $this->normalizeOverrideString($entry['target_key'] ?? null),
                'ignore' => $this->normalizeOverrideBool($entry['ignore'] ?? false),
                'values' => $valueOverrides,
            ];
        }

        return $normalized;
    }

    /**
     * @param array<int, array<string, mixed>> $overrides
     * @return array<string, array<string, array{target_key: string|null, ignore: bool, values: array<string, array{target_value_key: string|null, target_value_label: string|null, explicit: bool}>}>>
     */
    private function normalizeVariantOverrides(array $overrides): array
    {
        $normalized = [];

        foreach ($overrides as $entry) {
            if (! is_array($entry)) {
                continue;
            }

            $variantCode = $this->normalizeOverrideString($entry['variant_code'] ?? null);
            $parameterKey = $this->normalizeOverrideString($entry['parameter_key'] ?? null);

            if ($variantCode === null || $parameterKey === null) {
                continue;
            }

            $valueOverrides = [];
            foreach (Arr::get($entry, 'values', []) as $valueEntry) {
                if (! is_array($valueEntry)) {
                    continue;
                }

                $masterValueKey = $this->normalizeOverrideString($valueEntry['master_value_key'] ?? null);
                if ($masterValueKey === null) {
                    continue;
                }

                $valueOverrides[$masterValueKey] = [
                    'target_value_key' => $this->normalizeOverrideString($valueEntry['target_value_key'] ?? null),
                    'target_value_label' => $this->normalizeOverrideString($valueEntry['target_value_label'] ?? null),
                    'explicit' => array_key_exists('target_value_key', $valueEntry),
                ];
            }

            if (! isset($normalized[$variantCode])) {
                $normalized[$variantCode] = [];
            }

            $normalized[$variantCode][$parameterKey] = [
                'target_key' => $this->normalizeOverrideString($entry['target_key'] ?? null),
                'ignore' => $this->normalizeOverrideBool($entry['ignore'] ?? false),
                'values' => $valueOverrides,
            ];
        }

        return $normalized;
    }

    private function normalizeOverrideString(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    private function normalizeOverrideBool(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_string($value)) {
            $normalized = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            return $normalized ?? false;
        }

        if (is_int($value)) {
            return $value !== 0;
        }

        return false;
    }

    /**
     * @param array<int, mixed> $values
     * @return array<int, array{master_value_key: string, label: string}>
     */
    private function describeFilteringValues(array $values): array
    {
        $result = [];

        foreach ($values as $value) {
            $masterValue = $this->extractFilteringValueKey($value);
            if (! $masterValue) {
                continue;
            }

            $result[] = [
                'master_value_key' => $masterValue,
                'label' => $this->extractFilteringValueLabel($value, $masterValue) ?? $masterValue,
            ];
        }

        return $result;
    }

    /**
     * @param array<string, mixed> $parameter
     * @return array<int, array{master_value_key: string, label: string}>
     */
    private function describeVariantParameterValues(array $parameter): array
    {
        $valueKey = $this->extractVariantParameterValueKey($parameter);
        if (! $valueKey) {
            return [];
        }

        $valueLabel = $this->extractVariantParameterValueLabel($parameter, $valueKey);

        return [[
            'master_value_key' => $valueKey,
            'label' => $valueLabel ?? $valueKey,
        ]];
    }

    private function buildCanonicalVariantDrafts(
        array $canonicalVariants,
        Product $product,
        ?Shop $targetShop,
        ?float $defaultVatRate = null
    ): array
    {
        if ($canonicalVariants === []) {
            return [];
        }

        $targetCurrency = $targetShop?->currency_code
            ?? $product->shop?->currency_code
            ?? $this->currencyConverter->getBaseCurrency();

        return collect($canonicalVariants)
            ->filter(fn ($variant) => is_array($variant) && isset($variant['code']))
            ->map(function (array $variant) use ($targetCurrency, $product, $defaultVatRate) {
                $sourceCurrency = $variant['currencyCode']
                    ?? $product->shop?->currency_code
                    ?? $this->currencyConverter->getBaseCurrency();
                $sourcePrice = Arr::get($variant, 'price');
                $convertedPrice = null;
                $sourcePurchasePrice = Arr::get($variant, 'purchasePrice');
                $convertedPurchasePrice = null;

                if ($targetCurrency && $sourcePrice !== null && is_numeric($sourcePrice)) {
                    $convertedPrice = $this->currencyConverter->convert(
                        (float) $sourcePrice,
                        $sourceCurrency,
                        $targetCurrency
                    );
                }

                if ($targetCurrency && $sourcePurchasePrice !== null && is_numeric($sourcePurchasePrice)) {
                    $convertedPurchasePrice = $this->currencyConverter->convert(
                        (float) $sourcePurchasePrice,
                        $sourceCurrency,
                        $targetCurrency
                    );
                }

                $stockValue = Arr::get($variant, 'stock');
                $stockAmount = is_numeric($stockValue) ? (float) $stockValue : null;
                $variantVatRate = Arr::get($variant, 'vat_rate') ?? Arr::get($variant, 'vatRate');
                $resolvedVatRate = is_numeric($variantVatRate)
                    ? (float) $variantVatRate
                    : ($defaultVatRate ?? null);

                return [
                    'code' => $variant['code'],
                    'name' => Arr::get($variant, 'name'),
                    'parameters' => Arr::get($variant, 'parameters'),
                    'price' => $convertedPrice ?? (is_numeric($sourcePrice) ? (float) $sourcePrice : null),
                    'currencyCode' => $targetCurrency ?? $sourceCurrency,
                    'stock' => $stockAmount,
                    'vatRate' => $resolvedVatRate,
                    'purchasePrice' => $convertedPurchasePrice
                        ?? (is_numeric($sourcePurchasePrice) ? (float) $sourcePurchasePrice : null),
                ];
            })
            ->values()
            ->all();
    }

    private function resolveDefaultVatRate(?Shop $shop): ?float
    {
        if (! $shop) {
            return null;
        }

        $settings = is_array($shop->settings) ? $shop->settings : [];
        $candidates = [
            Arr::get($settings, 'default_vat_rate'),
            Arr::get($settings, 'vat_rate'),
            Arr::get($settings, 'tax'),
        ];

        foreach ($candidates as $candidate) {
            if (is_numeric($candidate)) {
                return (float) $candidate;
            }
        }

        return null;
    }
}
