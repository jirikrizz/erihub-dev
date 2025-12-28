<?php

namespace Modules\Pim\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ProductTranslation;
use Modules\Pim\Services\AiTranslationService;
use Modules\Shoptet\Jobs\PushProductTranslation;
use Modules\Shoptet\Models\Shop;

class ProductTranslationController extends Controller
{
    public function __construct(private readonly AiTranslationService $aiTranslationService)
    {
    }

    public function show(Request $request, Product $product, string $locale)
    {
        $validation = $request->validate([
            'sections' => ['nullable', 'array'],
            'sections.*' => ['string'],
            'mapping_overrides' => ['nullable', 'array'],
            'mapping_overrides.filtering_parameters' => ['nullable', 'array'],
            'mapping_overrides.filtering_parameters.*.master_key' => ['required', 'string'],
            'mapping_overrides.filtering_parameters.*.target_key' => ['nullable', 'string'],
            'mapping_overrides.filtering_parameters.*.values' => ['nullable', 'array'],
            'mapping_overrides.filtering_parameters.*.values.*.master_value_key' => ['required', 'string'],
            'mapping_overrides.filtering_parameters.*.values.*.target_value_key' => ['nullable', 'string'],
            'mapping_overrides.filtering_parameters.*.ignore' => ['nullable', 'boolean'],
            'mapping_overrides.variants' => ['nullable', 'array'],
            'mapping_overrides.variants.*.variant_code' => ['required', 'string'],
            'mapping_overrides.variants.*.parameter_key' => ['required', 'string'],
            'mapping_overrides.variants.*.target_key' => ['nullable', 'string'],
            'mapping_overrides.variants.*.values' => ['nullable', 'array'],
            'mapping_overrides.variants.*.values.*.master_value_key' => ['required', 'string'],
            'mapping_overrides.variants.*.values.*.target_value_key' => ['nullable', 'string'],
            'mapping_overrides.variants.*.ignore' => ['nullable', 'boolean'],
        ]);

        $translation = $this->firstOrCreateTranslation($product, $locale, $this->resolveTargetShopId($request, $product));

        return response()->json($translation);
    }

    public function update(Request $request, Product $product, string $locale)
    {
        $translation = $this->firstOrCreateTranslation($product, $locale, $this->resolveTargetShopId($request, $product));

        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'short_description' => ['nullable', 'string'],
            'description' => ['nullable', 'string'],
            'parameters' => ['nullable', 'array'],
            'seo' => ['nullable', 'array'],
        ]);

        $translation->fill($data);
        $translation->status = 'draft';
        $translation->save();

        return response()->json($translation->refresh());
    }

    public function submit(Request $request, Product $product, string $locale)
    {
        $translation = $this->firstOrCreateTranslation($product, $locale, $this->resolveTargetShopId($request, $product));
        $this->guardTransition($translation->status, 'submit');

        $translation->status = 'in_review';
        $translation->save();

        return response()->json($translation);
    }

    public function approve(Request $request, Product $product, string $locale)
    {
        $translation = $this->firstOrCreateTranslation($product, $locale, $this->resolveTargetShopId($request, $product));
        $this->guardTransition($translation->status, 'approve');

        $translation->status = 'approved';
        $translation->save();

        PushProductTranslation::dispatch($translation);

        return response()->json($translation);
    }

    public function reject(Request $request, Product $product, string $locale)
    {
        $translation = $this->firstOrCreateTranslation($product, $locale, $this->resolveTargetShopId($request, $product));
        $this->guardTransition($translation->status, 'reject');

        $translation->status = 'draft';
        $translation->save();

        return response()->json($translation);
    }

    public function generateAiDraft(Request $request, Product $product, string $locale)
    {
        $translation = $this->firstOrCreateTranslation($product, $locale, $this->resolveTargetShopId($request, $product));

        if ($product->base_locale === $locale) {
            abort(400, 'Target locale must differ from base locale.');
        }

        $sections = $request->input('sections', ['text']);
        if (! is_array($sections)) {
            abort(422, 'Sections must be an array.');
        }

        $sections = array_values(array_filter($sections, fn ($value) => is_string($value) && $value !== ''));

        $shopId = $request->input('shop_id');
        $targetShop = null;

        if ($shopId !== null) {
            $targetShop = Shop::query()->find((int) $shopId);
            abort_if(! $targetShop, 404, 'Target shop not found.');
        }

        try {
            $result = $this->aiTranslationService->translateProduct(
                $product,
                $locale,
                $targetShop,
                $sections,
                $request->input('mapping_overrides', [])
            );
        } catch (\Modules\Pim\Exceptions\MissingAttributeMappingException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
                'details' => $exception->getDetails(),
            ], 422);
        } catch (\RuntimeException $exception) {
            abort(422, $exception->getMessage());
        } catch (\Throwable $throwable) {
            report($throwable);
            abort(500, 'AI translation service is unavailable.');
        }

        return response()->json([
            'sections' => $result['sections'],
            'translation' => $result['translation'],
            'slug' => $result['slug'],
            'images' => $result['images'],
            'variants' => $result['variants'],
            'pricing' => $result['pricing'],
            'locale' => $locale,
            'status' => $translation->status,
        ]);
    }

    public function prepareAiMapping(Request $request, Product $product, string $locale)
    {
        $this->firstOrCreateTranslation($product, $locale, $this->resolveTargetShopId($request, $product));

        if ($product->base_locale === $locale) {
            abort(400, 'Target locale must differ from base locale.');
        }

        $request->validate([
            'mapping_overrides' => ['nullable', 'array'],
            'mapping_overrides.filtering_parameters' => ['nullable', 'array'],
            'mapping_overrides.filtering_parameters.*.master_key' => ['required', 'string'],
            'mapping_overrides.filtering_parameters.*.target_key' => ['nullable', 'string'],
            'mapping_overrides.filtering_parameters.*.values' => ['nullable', 'array'],
            'mapping_overrides.filtering_parameters.*.values.*.master_value_key' => ['required', 'string'],
            'mapping_overrides.filtering_parameters.*.values.*.target_value_key' => ['nullable', 'string'],
            'mapping_overrides.filtering_parameters.*.ignore' => ['nullable', 'boolean'],
            'mapping_overrides.variants' => ['nullable', 'array'],
            'mapping_overrides.variants.*.variant_code' => ['required', 'string'],
            'mapping_overrides.variants.*.parameter_key' => ['required', 'string'],
            'mapping_overrides.variants.*.target_key' => ['nullable', 'string'],
            'mapping_overrides.variants.*.values' => ['nullable', 'array'],
            'mapping_overrides.variants.*.values.*.master_value_key' => ['required', 'string'],
            'mapping_overrides.variants.*.values.*.target_value_key' => ['nullable', 'string'],
            'mapping_overrides.variants.*.ignore' => ['nullable', 'boolean'],
        ]);

        $shopId = $request->input('shop_id');
        $targetShop = null;

        if ($shopId !== null) {
            $targetShop = Shop::query()->find((int) $shopId);
            abort_if(! $targetShop, 404, 'Target shop not found.');
        }

        try {
            $result = $this->aiTranslationService->prepareMappingPreview(
                $product,
                $targetShop,
                $request->input('mapping_overrides', [])
            );
        } catch (\Modules\Pim\Exceptions\MissingAttributeMappingException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
                'details' => $exception->getDetails(),
            ], 422);
        } catch (\RuntimeException $exception) {
            abort(422, $exception->getMessage());
        } catch (\Throwable $throwable) {
            report($throwable);
            abort(500, 'AI translation service is unavailable.');
        }

        return response()->json($result);
    }

    private function firstOrCreateTranslation(Product $product, string $locale, ?int $shopId = null): ProductTranslation
    {
        $supported = collect(config('pim.locales', []));
        abort_unless($supported->contains($locale), 404, 'Locale not supported.');

        $attributes = [
            'shop_id' => $shopId,
            'locale' => $locale,
        ];

        return $product->translations()->firstOrCreate(
            $attributes,
            ['status' => 'draft']
        );
    }

    private function resolveTargetShopId(Request $request, Product $product): ?int
    {
        $shopId = $request->query('shop_id');
        if ($shopId !== null) {
            return (int) $shopId;
        }

        return $product->shop_id;
    }

    private function guardTransition(string $currentState, string $transition): void
    {
        $workflow = config('pim.workflow.transitions');

        abort_unless(isset($workflow[$transition]), 400, 'Transition not defined.');

        $allowedFrom = (array) ($workflow[$transition]['from'] ?? []);

        abort_unless(in_array($currentState, $allowedFrom, true), 409, 'Transition not allowed for current state.');
    }
}
