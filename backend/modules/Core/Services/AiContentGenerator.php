<?php

namespace Modules\Core\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Modules\Core\Services\SettingsService;

class AiContentGenerator
{
    public function __construct(private readonly SettingsService $settings)
    {
    }

    public function generateText(string $scenario, array $payload): array
    {
        $apiKey = $this->settings->getDecrypted('openai_api_key');

        if (! $apiKey) {
            throw new RuntimeException('OpenAI API key is not configured.');
        }

        $model = config('services.openai.model', 'gpt-4o-mini');
        $language = $payload['language'] ?? 'cs';

        $userContent = [
            'scenario' => $scenario,
            'language' => $language,
            'brief' => $payload['brief'],
            'tone' => $payload['tone'] ?? null,
            'audience' => $payload['audience'] ?? null,
            'context' => $payload['context'] ?? null,
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
                    'messages' => [
                        ['role' => 'system', 'content' => $this->textSystemPrompt($scenario, $language)],
                        ['role' => 'user', 'content' => json_encode($userContent, JSON_UNESCAPED_UNICODE)],
                    ],
                    'temperature' => 0.5,
                ]);
        } catch (ConnectionException $exception) {
            Log::error('OpenAI text generation connection failed', ['message' => $exception->getMessage()]);

            throw new RuntimeException('Nepodařilo se kontaktovat OpenAI. Zkus to prosím znovu.', 0, $exception);
        }

        if ($response->failed()) {
            $body = $response->json();
            $message = data_get($body, 'error.message') ?? $response->body();

            Log::warning('OpenAI text generation HTTP error', [
                'status' => $response->status(),
                'body' => $body ?? $response->body(),
            ]);

            throw new RuntimeException('AI generování selhalo: '.($message ?: 'Neočekávaná chyba.'));
        }

        $content = data_get($response->json(), 'choices.0.message.content');

        if (! is_string($content) || trim($content) === '') {
            Log::warning('OpenAI text generation returned empty content', ['scenario' => $scenario]);
            throw new RuntimeException('AI generování nevrátilo žádný text.');
        }

        $content = trim($content);
        $path = $this->storeTextResult($scenario, $content, $language);

        return [
            'scenario' => $scenario,
            'content' => $content,
            'path' => $path,
            'url' => Storage::disk('public')->url($path),
            'filename' => basename($path),
        ];
    }

    public function generateImage(string $scenario, array $payload): array
    {
        $apiKey = $this->settings->getDecrypted('openai_api_key');

        if (! $apiKey) {
            throw new RuntimeException('OpenAI API key is not configured.');
        }

        $prompt = $this->buildImagePrompt($scenario, $payload);
        $size = $payload['size'] ?? '1024x1024';
        $models = $this->imageModelsToTry();
        $references = Arr::wrap($payload['reference_images'] ?? []);
        if ($references !== []) {
            $prompt .= "\nPoužij následující fotky jako referenci pro styling: ".implode(', ', $references);
        }
        $organization = $this->openAiOrganization();
        $headers = [
            'Authorization' => 'Bearer '.$apiKey,
            'Content-Type' => 'application/json',
        ];
        if ($organization) {
            $headers['OpenAI-Organization'] = $organization;
        }
        $lastResponse = null;

        foreach ($models as $index => $model) {
            try {
                $response = Http::timeout(120)
                    ->connectTimeout(10)
                    ->withHeaders($headers)
                    ->post('https://api.openai.com/v1/images/generations', [
                        'model' => $model,
                        'prompt' => $prompt,
                        'size' => $size,
                    ]);
            } catch (ConnectionException $exception) {
                Log::error('OpenAI image generation connection failed', ['message' => $exception->getMessage()]);

                throw new RuntimeException('Nepodařilo se kontaktovat OpenAI. Zkus to prosím znovu.', 0, $exception);
            }

            if ($response->successful()) {
                $binary = $this->extractImageBinary($response);
                $path = $this->storeImageResult($scenario, $binary);

                return [
                    'scenario' => $scenario,
                    'path' => $path,
                    'url' => Storage::disk('public')->url($path),
                    'filename' => basename($path),
                    'size' => $size,
                    'reference_images' => $references,
                    'model' => $model,
                    'provider' => 'openai',
                ];
            }

            $lastResponse = $response;

            $canFallback = $this->shouldFallbackToLegacyImageModel($model, $response) && $index < count($models) - 1;

            if ($canFallback) {
                Log::info('OpenAI image generation falling back to legacy model', [
                    'scenario' => $scenario,
                    'failed_model' => $model,
                    'fallback_model' => $models[$index + 1],
                ]);
                continue;
            }

            $this->handleImageHttpError('generování obrázku', $response);
        }

        if ($lastResponse) {
            $this->handleImageHttpError('generování obrázku', $lastResponse);
        }

        throw new RuntimeException('AI generování obrázku selhalo: Neočekávaná chyba.');
    }

    public function generateImageWithGemini(string $scenario, array $payload): array
    {
        $apiKey = $this->settings->getDecrypted('google_ai_api_key') ?? config('services.google_ai.api_key');

        if (! $apiKey) {
            throw new RuntimeException('Google AI API key is not configured.');
        }

        $model = config('services.google_ai.image_model', 'imagen-3.0-generate-002');
        $prompt = $this->buildImagePrompt($scenario, $payload);
        $size = $this->normalizeGoogleImageSize($payload['size'] ?? '1024x1024');
        $url = sprintf(
            'https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s',
            urlencode($model),
            urlencode($apiKey)
        );

        $body = [
            'contents' => [
                [
                    'role' => 'user',
                    'parts' => [
                        ['text' => $prompt],
                    ],
                ],
            ],
            'generationConfig' => [
                'responseMimeType' => 'image/png',
            ],
            'safetySettings' => [
                ['category' => 'HARM_CATEGORY_HARASSMENT', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
                ['category' => 'HARM_CATEGORY_HATE_SPEECH', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
                ['category' => 'HARM_CATEGORY_SEXUAL', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
                ['category' => 'HARM_CATEGORY_DANGEROUS_CONTENT', 'threshold' => 'BLOCK_MEDIUM_AND_ABOVE'],
            ],
            'imageConfig' => [
                'dimensions' => [
                    'width' => $size['width'],
                    'height' => $size['height'],
                ],
            ],
        ];

        try {
            $response = Http::timeout(150)
                ->connectTimeout(10)
                ->withHeaders(['Content-Type' => 'application/json'])
                ->post($url, $body);
        } catch (ConnectionException $exception) {
            Log::error('Google AI image generation connection failed', ['message' => $exception->getMessage()]);

            throw new RuntimeException('Nepodařilo se kontaktovat Google AI. Zkus to prosím znovu.', 0, $exception);
        }

        if ($response->failed()) {
            $this->handleGeminiHttpError('generování obrázku', $response);
        }

        $inline = data_get($response->json(), 'candidates.0.content.parts.0.inlineData');
        $binary = $this->decodeInlineImageData($inline);
        $path = $this->storeImageResult($scenario, $binary);

        return [
            'scenario' => $scenario,
            'path' => $path,
            'url' => Storage::disk('public')->url($path),
            'filename' => basename($path),
            'size' => sprintf('%dx%d', $size['width'], $size['height']),
            'reference_images' => $payload['reference_images'] ?? [],
            'model' => $model,
            'provider' => 'gemini',
        ];
    }

    public function editImage(array $payload): array
    {
        $apiKey = $this->settings->getDecrypted('openai_api_key');

        if (! $apiKey) {
            throw new RuntimeException('OpenAI API key is not configured.');
        }

        $prompt = trim((string) ($payload['prompt'] ?? ''));
        $size = in_array($payload['size'] ?? '1024x1024', ['512x512', '768x768', '1024x1024'], true)
            ? $payload['size']
            : '1024x1024';
        $imageUrl = $payload['image_url'] ?? null;
        $preserveLabel = array_key_exists('preserve_label', $payload) ? (bool) $payload['preserve_label'] : true;
        $backgroundMode = $payload['background_mode'] ?? 'preserve';
        $backgroundColor = $payload['background_color'] ?? '#ffffff';
        $negativePrompt = trim((string) ($payload['negative_prompt'] ?? ''));

        if (! $imageUrl || $prompt === '') {
            throw new RuntimeException('Chybí zadání pro úpravu nebo URL fotky.');
        }

        $prompt = $this->applyLabelSafetyPrompt($prompt, $preserveLabel);
        $backgroundInstruction = $this->backgroundInstruction($backgroundMode, $backgroundColor);
        if ($backgroundInstruction) {
            $prompt .= "\n\n".$backgroundInstruction;
        }
        if ($negativePrompt !== '') {
            $prompt .= "\n\n".'Vyhni se následujícím prvkům: '.$negativePrompt;
        }

        $models = $this->imageModelsToTry();
        $sourceBinary = $this->downloadImageBinary($imageUrl);
        $pngBinary = $this->ensurePngBinary($sourceBinary);
        $maskPath = $payload['mask_path'] ?? null;
        $maskBinary = null;
        if ($maskPath && Storage::disk('public')->exists($maskPath)) {
            $maskBinary = Storage::disk('public')->get($maskPath);
        }

        $organization = $this->openAiOrganization();
        $headers = [
            'Authorization' => 'Bearer '.$apiKey,
        ];
        if ($organization) {
            $headers['OpenAI-Organization'] = $organization;
        }

        $lastResponse = null;

        foreach ($models as $index => $model) {
            try {
                $request = Http::timeout(120)
                    ->connectTimeout(10)
                    ->withHeaders($headers)
                    ->asMultipart()
                    ->attach('image', $pngBinary, 'source.png');

                if ($maskBinary) {
                    $request->attach('mask', $maskBinary, 'mask.png');
                }

                $response = $request->post('https://api.openai.com/v1/images/edits', [
                    'model' => $model,
                    'prompt' => $prompt,
                    'size' => $size,
                ]);
            } catch (ConnectionException $exception) {
                Log::error('OpenAI image edit connection failed', ['message' => $exception->getMessage()]);

                throw new RuntimeException('Nepodařilo se kontaktovat OpenAI. Zkus to prosím znovu.', 0, $exception);
            }

            if ($response->successful()) {
                $binary = $this->extractImageBinary($response);
                $path = $this->storeImageResult('image_edit', $binary);

                return [
                    'scenario' => 'image_edit',
                    'path' => $path,
                    'url' => Storage::disk('public')->url($path),
                    'filename' => basename($path),
                    'size' => $size,
                    'source_image_url' => $imageUrl,
                    'model' => $model,
                    'mask_path' => $maskPath,
                ];
            }

            $lastResponse = $response;
            $canFallback = $this->shouldFallbackToLegacyImageModel($model, $response) && $index < count($models) - 1;

            if ($canFallback) {
                Log::info('OpenAI image edit falling back to legacy model', [
                    'failed_model' => $model,
                    'fallback_model' => $models[$index + 1],
                ]);
                continue;
            }

            $this->handleImageHttpError('úprava obrázku', $response);
        }

        if ($lastResponse) {
            $this->handleImageHttpError('úprava obrázku', $lastResponse);
        }

        throw new RuntimeException('AI úprava obrázku selhala: Neočekávaná chyba.');
    }

    public function editImageWithResponses(array $payload): array
    {
        $apiKey = $this->settings->getDecrypted('openai_api_key');

        if (! $apiKey) {
            throw new RuntimeException('OpenAI API key is not configured.');
        }

        $prompt = trim((string) ($payload['prompt'] ?? ''));
        $imageUrl = $payload['image_url'] ?? null;

        if (! $imageUrl || $prompt === '') {
            throw new RuntimeException('Chybí zadání pro úpravu nebo URL fotky.');
        }

        $size = $this->sanitizeResponsesSize($payload['size'] ?? '1024x1024');
        $detail = $this->sanitizeResponsesDetail($payload['detail'] ?? null);
        $backgroundMode = $payload['background_mode'] ?? 'preserve';
        $backgroundColor = $payload['background_color'] ?? '#ffffff';
        $negativePrompt = trim((string) ($payload['negative_prompt'] ?? ''));
        $preserveLabel = array_key_exists('preserve_label', $payload) ? (bool) $payload['preserve_label'] : true;
        $references = array_filter(Arr::wrap($payload['reference_images'] ?? []));

        $prompt = $this->applyLabelSafetyPrompt($prompt, $preserveLabel);
        $backgroundInstruction = $this->backgroundInstruction($backgroundMode, $backgroundColor);
        if ($backgroundInstruction) {
            $prompt .= "\n\n".$backgroundInstruction;
        }
        if ($negativePrompt !== '') {
            $prompt .= "\n\n".'Vyhni se následujícím prvkům: '.$negativePrompt;
        }

        $content = [
            [
                'role' => 'user',
                'content' => array_merge(
                    [
                        [
                            'type' => 'input_text',
                            'text' => $prompt,
                        ],
                        [
                            'type' => 'input_image',
                            'image_url' => $imageUrl,
                            'detail' => 'high',
                        ],
                    ],
                    array_map(static fn ($url) => [
                        'type' => 'input_image',
                        'image_url' => $url,
                        'detail' => 'low',
                    ], $references)
                ),
            ],
        ];

        $maskDataUri = $this->encodeMaskForResponses($payload['mask_path'] ?? null);

        $imageConfig = [
            'size' => $size,
            'detail' => $detail,
            'background' => $backgroundMode,
        ];

        if ($backgroundMode === 'solid') {
            $imageConfig['background_color'] = $backgroundColor;
        }

        if ($maskDataUri) {
            $imageConfig['mask'] = $maskDataUri;
        }

        $body = [
            'model' => $this->responsesImageModel(),
            'input' => $content,
            'images' => [$imageConfig],
        ];

        try {
            $response = Http::timeout(150)
                ->connectTimeout(10)
                ->withHeaders($this->openAiHeaders($apiKey, ['Content-Type' => 'application/json']))
                ->post('https://api.openai.com/v1/responses', $body);
        } catch (ConnectionException $exception) {
            Log::error('OpenAI image edit (responses) connection failed', ['message' => $exception->getMessage()]);
            throw new RuntimeException('Nepodařilo se kontaktovat OpenAI. Zkus to prosím znovu.', 0, $exception);
        }

        if ($response->failed()) {
            $this->handleImageHttpError('úprava obrázku', $response);
        }

        $imagePayload = $this->extractResponsesImageBinary($response->json());
        $path = $this->storeImageResult('image_edit', $imagePayload['binary']);

        return [
            'scenario' => 'image_edit',
            'path' => $path,
            'url' => Storage::disk('public')->url($path),
            'filename' => basename($path),
            'size' => $size,
            'source_image_url' => $imageUrl,
            'detail' => $imagePayload['detail'] ?? $detail,
            'engine' => 'responses',
        ];
    }

    public function createVideo(array $payload): array
    {
        $apiKey = $this->settings->getDecrypted('openai_api_key');

        if (! $apiKey) {
            throw new RuntimeException('OpenAI API key is not configured.');
        }

        $references = array_values(array_unique(array_filter($payload['reference_images'] ?? [])));
        $model = config('services.openai.video_model', 'sora-2');
        if ($references !== []) {
            $model = config('services.openai.video_reference_model', $model);
        }
        $size = $payload['size'] ?? '720x1280';
        if (! in_array($size, ['720x1280', '1280x720'], true)) {
            $size = '720x1280';
        }
        $seconds = $this->sanitizeVideoDuration($payload['seconds'] ?? null);
        $prompt = trim((string) $payload['prompt']);

        if ($prompt === '') {
            throw new RuntimeException('Zadej prosím, co má video ukázat.');
        }

        $referenceFiles = $references !== [] ? $this->prepareVideoReferenceFiles($references) : [];

        $body = array_filter([
            'model' => $model,
            'prompt' => $prompt,
            'size' => $size,
            'seconds' => $seconds,
        ], static fn ($value) => $value !== null && $value !== '');

        $request = Http::timeout(150)
            ->connectTimeout(10)
            ->withHeaders($this->openAiHeaders($apiKey))
            ->asMultipart();

        foreach ($referenceFiles as $file) {
            $request->attach('input_reference', $file['contents'], $file['filename'], ['Content-Type' => $file['mime']]);
        }

        try {
            $response = $request->post('https://api.openai.com/v1/videos', $body);
        } catch (ConnectionException $exception) {
            Log::error('OpenAI video job creation failed', ['message' => $exception->getMessage()]);
            throw new RuntimeException('Nepodařilo se kontaktovat OpenAI pro generování videa.', 0, $exception);
        }

        if ($response->failed()) {
            $this->handleImageHttpError('generování videa', $response);
        }

        $jobId = data_get($response->json(), 'id') ?? data_get($response->json(), 'job.id');

        if (! is_string($jobId) || $jobId === '') {
            throw new RuntimeException('OpenAI nevrátil platné ID video úlohy.');
        }

        return [
            'job_id' => $jobId,
            'status' => data_get($response->json(), 'status') ?? data_get($response->json(), 'job.status', 'queued'),
            'eta' => data_get($response->json(), 'eta'),
            'model' => $model,
        ];
    }

    public function fetchVideoJob(string $jobId): array
    {
        $apiKey = $this->settings->getDecrypted('openai_api_key');

        if (! $apiKey) {
            throw new RuntimeException('OpenAI API key is not configured.');
        }

        try {
            $response = Http::timeout(60)
                ->connectTimeout(10)
                ->withHeaders($this->openAiHeaders($apiKey))
                ->get('https://api.openai.com/v1/videos/'.urlencode($jobId));
        } catch (ConnectionException $exception) {
            Log::error('OpenAI video job status failed', ['message' => $exception->getMessage()]);
            throw new RuntimeException('Nepodařilo se načíst stav video úlohy.', 0, $exception);
        }

        if ($response->failed()) {
            $this->handleImageHttpError('kontrola stavu videa', $response);
        }

        $data = $response->json();

        if (! is_array($data)) {
            throw new RuntimeException('OpenAI nevrátil validní data o stavu videa.');
        }

        return $data;
    }

    public function downloadVideoContent(string $jobId): array
    {
        $apiKey = $this->settings->getDecrypted('openai_api_key');

        if (! $apiKey) {
            throw new RuntimeException('OpenAI API key is not configured.');
        }

        try {
            $response = Http::timeout(180)
                ->connectTimeout(10)
                ->withHeaders($this->openAiHeaders($apiKey))
                ->get('https://api.openai.com/v1/videos/'.urlencode($jobId).'/content');
        } catch (ConnectionException $exception) {
            Log::error('OpenAI video download failed', ['message' => $exception->getMessage()]);
            throw new RuntimeException('Nepodařilo se stáhnout vygenerované video.', 0, $exception);
        }

        if ($response->failed()) {
            $this->handleImageHttpError('stažení videa', $response);
        }

        $binary = $response->body();

        if (! is_string($binary) || $binary === '') {
            throw new RuntimeException('OpenAI nevrátil žádné video.');
        }

        $path = $this->storeVideoResult($binary);

        return [
            'path' => $path,
            'url' => Storage::disk('public')->url($path),
            'filename' => basename($path),
            'mime' => $response->header('Content-Type', 'video/mp4'),
        ];
    }

    private function textSystemPrompt(string $scenario, string $language): string
    {
        $scenarioPrompts = [
            'product_description' => 'Piš přesvědčivý popis produktu, strukturovaný do odstavců a bulletů. Zahrň hlavní benefity, složení a doporučení použití.',
            'category_page' => 'Napiš text pro landing page kategorie. Začni krátkým claimem, pokračuj vysvětlením sortimentu a zakonči CTA.',
            'article' => 'Vytvoř krátký blogový článek (cca 3 odstavce) s mezititulky a CTA na závěr.',
            'email_reply' => 'Vytvoř odpověď na zákaznický e-mail. Buď profesionální, empaticý a zakonči jasným dalším krokem.',
            'social_post' => 'Vytvoř krátký příspěvek na sociální sítě (cca 3 věty + CTA + vhodné emotikony) a přidej návrh hashtagů.',
            'product_faq' => 'Vytvoř 3–4 FAQ otázky a odpovědi k produktu nebo kolekci, každou odpověď drž do 2 vět.',
        ];

        $instruction = $scenarioPrompts[$scenario] ?? 'Piš přirozeně a hodnotně pro zákazníka.';

        return <<<PROMPT
Jsi seniorní copywriter a editor luxusní parfumerie. Piš jazykem {$language}, v tónu moderního concierge.
{$instruction}
Používej přesné údaje z briefu, vyhýbej se vymýšlení faktů.
PROMPT;
    }

    private function buildImagePrompt(string $scenario, array $payload): string
    {
        $base = trim($payload['prompt'] ?? '');
        $style = trim((string) ($payload['style'] ?? ''));

        $scenarioHints = [
            'category_banner' => 'wide hero banner, immersive lighting, ultra realistic, typography friendly negative space',
            'product_image' => 'product photography, 8k studio lighting, detailed texture, floating product, clean background',
            'marketing_visual' => 'editorial campaign shot, cinematic lighting, luxury lifestyle composition',
            'email_banner' => 'hero banner optimized for email header, ample negative space for typography, soft gradients, high contrast focal point',
        ];

        $hint = $scenarioHints[$scenario] ?? 'high quality render';

        return trim($base.' '.$style.' '.$hint);
    }

    private function applyLabelSafetyPrompt(string $prompt, bool $preserveLabel): string
    {
        if (! $preserveLabel) {
            return $prompt;
        }

        $instruction = 'Maintain the existing product exactly as in the original photo. Do not alter, retype, blur, or invent any label text, logos, typography, or brand marks on the bottle. Focus changes on background, reflections or lighting while keeping the bottle geometry and text perfectly intact.';

        return trim($prompt."\n\n".$instruction);
    }

    private function backgroundInstruction(?string $mode, ?string $color): ?string
    {
        return match ($mode) {
            'remove' => 'Odstraň pozadí, ponech pouze produkt s jemným stínem pod ním.',
            'solid' => 'Použij jednolité pozadí v barvě '.($color ?: '#ffffff').', bez textury nebo gradientu.',
            default => null,
        };
    }

    private function responsesImageModel(): string
    {
        $model = config('services.openai.image_responses_model');

        if (is_string($model) && trim($model) !== '') {
            return trim($model);
        }

        return config('services.openai.image_model', 'gpt-image-1');
    }

    private function sanitizeResponsesSize(string $size): string
    {
        $allowed = [
            '512x512',
            '768x768',
            '1024x1024',
            '1024x1536',
            '1536x1024',
            '1024x1792',
            '1792x1024',
            '1536x1536',
            '2048x2048',
        ];

        $size = strtolower(trim($size));

        if (preg_match('/^\d+x\d+$/', $size) === 1 && in_array($size, $allowed, true)) {
            return $size;
        }

        return '1024x1024';
    }

    private function sanitizeResponsesDetail(?string $detail): string
    {
        return match ($detail) {
            'low' => 'low',
            'hd' => 'hd',
            default => 'standard',
        };
    }

    private function sanitizeVideoDuration($seconds): ?int
    {
        if ($seconds === null) {
            return null;
        }

        $seconds = (int) $seconds;

        return max(2, min(12, $seconds));
    }

    private function prepareVideoReferenceFiles(array $urls): array
    {
        $files = [];

        foreach (array_slice($urls, 0, 3) as $index => $url) {
            $binary = $this->downloadImageBinary($url);
            $png = $this->ensurePngBinary($binary);
            $files[] = [
                'filename' => sprintf('input_reference_%d.png', $index + 1),
                'contents' => $png,
                'mime' => 'image/png',
            ];
        }

        return $files;
    }

    private function encodeMaskForResponses(?string $maskPath): ?string
    {
        if (! $maskPath || ! Storage::disk('public')->exists($maskPath)) {
            return null;
        }

        $binary = Storage::disk('public')->get($maskPath);

        if (! is_string($binary) || $binary === '') {
            return null;
        }

        return 'data:image/png;base64,'.base64_encode($binary);
    }

    private function openAiOrganization(): ?string
    {
        $organization = config('services.openai.organization');

        if (! is_string($organization)) {
            return null;
        }

        $organization = trim($organization);

        return $organization !== '' ? $organization : null;
    }

    private function openAiHeaders(string $apiKey, array $additional = []): array
    {
        $headers = array_merge([
            'Authorization' => 'Bearer '.$apiKey,
        ], $additional);

        $organization = $this->openAiOrganization();

        if ($organization) {
            $headers['OpenAI-Organization'] = $organization;
        }

        return $headers;
    }

    private function imageModelsToTry(): array
    {
        $primary = config('services.openai.image_model', 'gpt-image-1');
        $models = [$primary];
        $fallback = $this->fallbackImageModel();

        if ($fallback && $fallback !== $primary) {
            $models[] = $fallback;
        }

        return array_values(array_unique(array_filter($models)));
    }

    private function fallbackImageModel(): ?string
    {
        $fallback = config('services.openai.image_model_fallback');

        if (! is_string($fallback)) {
            return null;
        }

        $fallback = trim($fallback);

        return $fallback !== '' ? $fallback : null;
    }

    private function shouldFallbackToLegacyImageModel(string $model, Response $response): bool
    {
        if ($model !== 'gpt-image-1' || $response->status() !== 403) {
            return false;
        }

        $message = data_get($response->json(), 'error.message') ?? $response->body();
        if (! is_string($message)) {
            return false;
        }

        $message = Str::lower($message);

        return str_contains($message, 'must be verified')
            && str_contains($message, 'gpt-image-1')
            && $this->fallbackImageModel() !== null;
    }

    private function extractImageBinary(Response $response): string
    {
        $imageData = data_get($response->json(), 'data.0.b64_json');

        if (! is_string($imageData)) {
            throw new RuntimeException('OpenAI nevrátil žádný obrázek.');
        }

        $binary = base64_decode($imageData);

        if ($binary === false) {
            throw new RuntimeException('Nepodařilo se dekódovat výstup z OpenAI.');
        }

        return $binary;
    }

    private function extractResponsesImageBinary(?array $payload): array
    {
        if (! is_array($payload)) {
            throw new RuntimeException('OpenAI nevrátil žádný obrázek.');
        }

        $candidates = [];

        foreach (Arr::wrap(data_get($payload, 'output')) as $item) {
            foreach (Arr::wrap(data_get($item, 'content')) as $content) {
                if (($content['type'] ?? null) === 'output_image') {
                    $candidates[] = $content;
                }
            }
        }

        if ($candidates === []) {
            foreach (Arr::wrap(data_get($payload, 'content')) as $content) {
                if (($content['type'] ?? null) === 'output_image') {
                    $candidates[] = $content;
                }
            }
        }

        if ($candidates === []) {
            throw new RuntimeException('OpenAI nevrátil žádný obrázek.');
        }

        $image = $candidates[0];
        $base64 = data_get($image, 'b64_json')
            ?? data_get($image, 'image.b64_json')
            ?? data_get($image, 'image_base64');
        $imageUrl = data_get($image, 'image_url')
            ?? data_get($image, 'image.image_url')
            ?? data_get($image, 'url');

        if (is_string($base64) && $base64 !== '') {
            $binary = base64_decode($base64, true);

            if ($binary === false) {
                throw new RuntimeException('Nepodařilo se dekódovat výstup z OpenAI.');
            }

            return [
                'binary' => $binary,
                'image_url' => $imageUrl,
                'detail' => data_get($image, 'detail'),
            ];
        }

        if (is_string($imageUrl) && $imageUrl !== '') {
            $binary = $this->downloadImageBinary($imageUrl);

            return [
                'binary' => $binary,
                'image_url' => $imageUrl,
                'detail' => data_get($image, 'detail'),
            ];
        }

        throw new RuntimeException('OpenAI nevrátil žádný obrázek.');
    }

    private function decodeInlineImageData(null|array $inlineData): string
    {
        if (! is_array($inlineData) || ! isset($inlineData['data'])) {
            throw new RuntimeException('Google AI nevrátil žádný obrázek.');
        }

        $binary = base64_decode((string) $inlineData['data'], true);

        if ($binary === false || $binary === '') {
            throw new RuntimeException('Nepodařilo se dekódovat výstup z Google AI.');
        }

        return $binary;
    }

    private function normalizeGoogleImageSize(string $size): array
    {
        if (preg_match('/^(\\d+)x(\\d+)$/', $size, $matches)) {
            $width = (int) $matches[1];
            $height = (int) $matches[2];
        } else {
            $width = 1024;
            $height = 1024;
        }

        $width = max(256, min(2048, $width));
        $height = max(256, min(2048, $height));

        return ['width' => $width, 'height' => $height];
    }

    private function handleImageHttpError(string $action, Response $response): void
    {
        $body = $response->json();
        $message = data_get($body, 'error.message') ?? $response->body();

        Log::warning('OpenAI '.$action.' HTTP error', [
            'status' => $response->status(),
            'body' => $body ?? $response->body(),
        ]);

        throw new RuntimeException('AI '.$action.' selhalo: '.($message ?: 'Neočekávaná chyba.'));
    }

    private function handleGeminiHttpError(string $action, Response $response): void
    {
        $body = $response->json();
        $message = data_get($body, 'error.message') ?? $response->body();

        Log::warning('Google AI '.$action.' HTTP error', [
            'status' => $response->status(),
            'body' => $body ?? $response->body(),
        ]);

        throw new RuntimeException('Google AI '.$action.' selhalo: '.($message ?: 'Neočekávaná chyba.'));
    }

    private function storeTextResult(string $scenario, string $content, string $language): string
    {
        $filename = sprintf('%s_%s.md', Str::uuid()->toString(), $language);
        $path = sprintf('ai/content/text/%s/%s/%s', $scenario, now()->format('Y/m'), $filename);

        Storage::disk('public')->put($path, $content);

        return $path;
    }

    private function storeImageResult(string $scenario, string $binary): string
    {
        $filename = sprintf('%s.png', Str::uuid()->toString());
        $path = sprintf('ai/content/images/%s/%s/%s', $scenario, now()->format('Y/m'), $filename);

        Storage::disk('public')->put($path, $binary);

        return $path;
    }

    private function storeVideoResult(string $binary): string
    {
        $filename = sprintf('%s.mp4', Str::uuid()->toString());
        $path = sprintf('ai/content/videos/%s/%s', now()->format('Y/m'), $filename);

        Storage::disk('public')->put($path, $binary);

        return $path;
    }

    private function downloadImageBinary(string $url): string
    {
        try {
            $response = Http::timeout(45)
                ->connectTimeout(10)
                ->withHeaders(['Accept' => 'image/*'])
                ->get($url);
        } catch (ConnectionException $exception) {
            Log::warning('AI image edit download failed', ['url' => $url, 'message' => $exception->getMessage()]);
            throw new RuntimeException('Nepodařilo se stáhnout zdrojovou fotku. Zkontroluj URL nebo její dostupnost.');
        }

        if ($response->failed()) {
            Log::warning('AI image edit download HTTP error', ['url' => $url, 'status' => $response->status()]);
            throw new RuntimeException('Nepodařilo se stáhnout zdrojovou fotku. Ověř prosím URL.');
        }

        $binary = $response->body();

        if (! is_string($binary) || $binary === '') {
            throw new RuntimeException('Stažená fotka je prázdná.');
        }

        return $binary;
    }

    private function isPngBinary(string $binary): bool
    {
        return str_starts_with($binary, "\x89PNG\r\n\x1a\n");
    }

    private function ensurePngBinary(string $binary): string
    {
        if ($this->isPngBinary($binary)) {
            return $binary;
        }

        if (\function_exists('imagecreatefromstring') && \function_exists('imagepng')) {
            $resource = @\imagecreatefromstring($binary);

            if ($resource === false) {
                throw new RuntimeException('Nepodařilo se načíst zdrojový obrázek pro úpravu.');
            }

            \imagealphablending($resource, true);
            \imagesavealpha($resource, true);

            ob_start();
            $result = \imagepng($resource);
            $png = ob_get_clean();
            \imagedestroy($resource);

            if ($result === false || ! is_string($png) || $png === '') {
                throw new RuntimeException('Nepodařilo se převést zdrojovou fotku do PNG.');
            }

            return $png;
        }

        if (\class_exists(\Imagick::class)) {
            try {
                $imagick = new \Imagick();
                $imagick->readImageBlob($binary);
                $imagick->setImageFormat('png32');

                return $imagick->getImagesBlob();
            } catch (\Throwable $exception) {
                throw new RuntimeException('Nepodařilo se převést zdrojovou fotku do PNG.', 0, $exception);
            }
        }

        throw new RuntimeException('Server nemá dostupné rozšíření pro převod na PNG. Nahraj prosím fotku ve formátu PNG.');
    }
}
