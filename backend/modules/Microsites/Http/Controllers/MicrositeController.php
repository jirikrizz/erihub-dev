<?php

namespace Modules\Microsites\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Modules\Microsites\Models\Microsite;
use Modules\Microsites\Models\MicrositeProduct;

class MicrositeController extends Controller
{
    public function index(Request $request)
    {
        $query = Microsite::query()
            ->withCount('products')
            ->orderByDesc('updated_at');

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        if ($request->filled('search')) {
            $term = '%'.$request->string('search')->toString().'%';
            $query->where(function ($builder) use ($term) {
                $builder->where('name', 'ilike', $term)
                    ->orWhere('slug', 'ilike', $term);
            });
        }

        $microsites = $query
            ->paginate($request->integer('per_page', 25))
            ->appends($request->query());

        return response()->json($microsites);
    }

    public function store(Request $request)
    {
        $payload = $this->validateMicrosite($request);

        /** @var Microsite $microsite */
        $microsite = Microsite::create($payload['microsite']);

        if ($payload['products'] !== []) {
            $this->syncProducts($microsite, $payload['products']);
        }

        return response()->json($microsite->load('products'), 201);
    }

    public function show(Microsite $microsite)
    {
        return response()->json($microsite->load(['products' => function ($query) {
            $query->orderBy('position');
        }]));
    }

    public function update(Request $request, Microsite $microsite)
    {
        $payload = $this->validateMicrosite($request, $microsite);

        DB::transaction(function () use ($microsite, $payload) {
            $microsite->fill($payload['microsite']);
            $microsite->save();

            if ($payload['products'] !== null) {
                $this->syncProducts($microsite, $payload['products']);
            }
        });

        return response()->json($microsite->refresh()->load(['products' => function ($query) {
            $query->orderBy('position');
        }]));
    }

    public function destroy(Microsite $microsite)
    {
        $path = Arr::get($microsite->settings, 'publication.path');
        if ($path) {
            $disk = Storage::disk('public');
            $disk->delete($path);
            $directory = trim(\dirname($path), '/');
            if ($directory !== '') {
                $disk->deleteDirectory($directory);
            }
        }

        $microsite->delete();

        return response()->json(['status' => 'deleted']);
    }

    /**
     * @return array{microsite: array<string, mixed>, products: ?array<int, array<string, mixed>>}
     */
    private function validateMicrosite(Request $request, ?Microsite $microsite = null): array
    {
        $id = $microsite?->id;

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => [
                'nullable',
                'string',
                'max:255',
                Rule::unique('microsites', 'slug')->ignore($id),
            ],
            'status' => ['nullable', Rule::in(['draft', 'published', 'archived'])],
            'theme' => ['nullable', 'string', 'max:120'],
            'hero' => ['nullable', 'array'],
            'seo' => ['nullable', 'array'],
            'content_schema' => ['nullable', 'array'],
            'settings' => ['nullable', 'array'],
            'locale' => ['nullable', 'string', 'max:12'],
            'currency' => ['nullable', 'string', 'max:12'],
            'brand' => ['nullable', 'array'],
            'primary_domain' => ['nullable', 'string', 'max:255'],
            'domains' => ['nullable', 'array'],
            'domains.*' => ['string', 'max:255'],
            'products' => ['sometimes', 'array'],
            'products.*.product_variant_id' => ['nullable', 'string'],
            'products.*.product_code' => ['nullable', 'string', 'max:255'],
            'products.*.position' => ['nullable', 'integer'],
            'products.*.custom_price' => ['nullable', 'numeric'],
            'products.*.custom_currency' => ['nullable', 'string', 'max:12'],
            'products.*.custom_label' => ['nullable', 'string', 'max:255'],
            'products.*.custom_description' => ['nullable', 'string'],
            'products.*.name' => ['nullable', 'string', 'max:255'],
            'products.*.slug' => ['nullable', 'string', 'max:255'],
            'products.*.description_md' => ['nullable', 'string'],
            'products.*.image_url' => ['nullable', 'string', 'max:512'],
            'products.*.price_cents' => ['nullable', 'integer'],
            'products.*.price_currency' => ['nullable', 'string', 'max:12'],
            'products.*.cta_text' => ['nullable', 'string', 'max:120'],
            'products.*.cta_url' => ['nullable', 'string', 'max:512'],
            'products.*.visible' => ['nullable', 'boolean'],
            'products.*.active' => ['nullable', 'boolean'],
            'products.*.tags' => ['nullable', 'array'],
            'products.*.tags.*' => ['string', 'max:120'],
            'products.*.metadata' => ['nullable', 'array'],
            'products.*.snapshot' => ['nullable', 'array'],
            'products.*.overlay' => ['nullable', 'array'],
        ]);

        $micrositePayload = Arr::only($data, [
            'name',
            'slug',
            'status',
            'theme',
            'hero',
            'seo',
            'content_schema',
            'settings',
            'locale',
            'currency',
            'brand',
            'primary_domain',
            'domains',
        ]);

        if (isset($micrositePayload['domains']) && is_array($micrositePayload['domains'])) {
            $micrositePayload['domains'] = array_values(array_filter($micrositePayload['domains'], fn ($value) => is_string($value) && $value !== ''));
        }

        if (! isset($micrositePayload['slug']) || $micrositePayload['slug'] === '') {
            $micrositePayload['slug'] = \Str::slug($micrositePayload['name']);
        }

        return [
            'microsite' => $micrositePayload,
            'products' => $data['products'] ?? null,
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $products
     */
    private function syncProducts(Microsite $microsite, array $products): void
    {
        $microsite->products()->delete();

        $resolver = app(\Modules\Microsites\Services\MicrositeProductResolver::class);

        $records = [];
        foreach ($products as $product) {
            $snapshot = $product['snapshot'] ?? null;
            $code = $product['product_code'] ?? null;

            if (! $snapshot && $code) {
                $snapshot = $resolver->snapshotByVariantCode($code, $microsite->settings['source_shop_id'] ?? null);
            }

            if ($snapshot) {
                $product['product_variant_id'] = $product['product_variant_id'] ?? $snapshot['variant_id'] ?? null;
            }

            $resolvedName = $product['name']
                ?? $product['custom_label']
                ?? ($snapshot['name'] ?? ($product['product_code'] ?? 'Produkt'));

            $slug = $product['slug'] ?? null;
            if (! $slug && $resolvedName) {
                $slug = \Str::slug($resolvedName);
            }
            if (! $slug) {
                $slug = (string) \Str::uuid();
            }

            $priceCents = $product['price_cents'] ?? null;

            if ($priceCents === null && isset($product['custom_price'])) {
                $priceCents = (int) round((float) $product['custom_price'] * 100);
            }

            if ($priceCents === null && isset($snapshot['price'])) {
                $priceCents = (int) round((float) $snapshot['price'] * 100);
            }

            $imageUrl = $product['image_url'] ?? null;

            if (! $imageUrl && isset($snapshot['images']) && is_array($snapshot['images']) && count($snapshot['images']) > 0) {
                $imageUrl = $snapshot['images'][0]['url'] ?? null;
            }

            $records[] = new MicrositeProduct([
                'product_variant_id' => $product['product_variant_id'] ?? null,
                'product_code' => $product['product_code'] ?? null,
                'name' => $resolvedName,
                'slug' => $slug,
                'position' => $product['position'] ?? 0,
                'custom_price' => $product['custom_price'] ?? null,
                'custom_currency' => $product['custom_currency'] ?? null,
                'custom_label' => $product['custom_label'] ?? null,
                'custom_description' => $product['custom_description'] ?? null,
                'description_md' => $product['description_md'] ?? null,
                'image_url' => $imageUrl,
                'price_cents' => $priceCents,
                'price_currency' => $product['price_currency'] ?? $product['custom_currency'] ?? ($snapshot['currency'] ?? null),
                'cta_text' => $product['cta_text'] ?? null,
                'cta_url' => $product['cta_url'] ?? null,
                'visible' => ! array_key_exists('visible', $product) ? true : (bool) $product['visible'],
                'active' => ! array_key_exists('active', $product) ? true : (bool) $product['active'],
                'tags' => isset($product['tags']) && is_array($product['tags']) ? array_values($product['tags']) : [],
                'metadata' => $product['metadata'] ?? null,
                'snapshot' => $snapshot,
                'overlay' => $product['overlay'] ?? null,
            ]);
        }

        $microsite->products()->saveMany($records);
    }
}
