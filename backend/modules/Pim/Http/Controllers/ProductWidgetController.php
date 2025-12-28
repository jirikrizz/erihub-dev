<?php

namespace Modules\Pim\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Modules\Pim\Models\ProductWidget;
use Modules\Pim\Services\ProductWidgetRenderer;

class ProductWidgetController extends Controller
{
    public function __construct(private readonly ProductWidgetRenderer $renderer)
    {
    }

    public function index(Request $request)
    {
        $query = ProductWidget::query()
            ->withCount('items')
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

        $widgets = $query->paginate($request->integer('per_page', 25))->appends($request->query());

        $widgets->getCollection()->transform(fn (ProductWidget $widget) => $this->transformWidget($widget));

        return response()->json($widgets);
    }

    public function store(Request $request)
    {
        $payload = $this->validateWidget($request);

        /** @var ProductWidget $widget */
        $widget = ProductWidget::create($payload['widget']);

        $this->syncItems($widget, $payload['items'] ?? []);
        $render = $this->refreshMarkup($widget);

        return response()->json($this->transformWidget($widget->fresh('items'), $render), 201);
    }

    public function show(ProductWidget $productWidget)
    {
        $productWidget->load('items');
        $render = $this->renderer->render($productWidget);

        return response()->json($this->transformWidget($productWidget, $render));
    }

    public function update(Request $request, ProductWidget $productWidget)
    {
        $payload = $this->validateWidget($request, $productWidget);

        $productWidget->fill($payload['widget']);

        if (($payload['regenerate_token'] ?? false) === true) {
            $productWidget->regenerateToken();
        }

        $productWidget->save();

        if (array_key_exists('items', $payload) && $payload['items'] !== null) {
            $this->syncItems($productWidget, $payload['items']);
        }

        $render = $this->refreshMarkup($productWidget);

        return response()->json($this->transformWidget($productWidget->fresh('items'), $render));
    }

    public function destroy(ProductWidget $productWidget)
    {
        $productWidget->delete();

        return response()->json(['status' => 'deleted']);
    }

    /**
     * @return array{widget: array<string, mixed>, items: ?array<int, array<string, mixed>>, regenerate_token?: bool}
     */
    private function validateWidget(Request $request, ?ProductWidget $widget = null): array
    {
        $id = $widget?->id;
        $itemsRule = $widget ? ['sometimes', 'array'] : ['required', 'array'];

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => [
                'nullable',
                'string',
                'max:255',
                Rule::unique('product_widgets', 'slug')->ignore($id),
            ],
            'status' => ['nullable', Rule::in(['draft', 'published'])],
            'shop_id' => ['nullable', 'integer', 'exists:shops,id'],
            'locale' => ['nullable', 'string', 'max:12'],
            'settings' => ['nullable', 'array'],
            'items' => $itemsRule,
            'items.*.product_id' => ['nullable', 'uuid', 'exists:products,id'],
            'items.*.product_variant_id' => ['nullable', 'uuid', 'exists:product_variants,id'],
            'items.*.position' => ['nullable', 'integer', 'min:0'],
            'items.*.payload' => ['nullable', 'array'],
            'regenerate_token' => ['sometimes', 'boolean'],
        ]);

        $slug = $data['slug'] ?? Str::slug($data['name']);
        if ($slug === '') {
            $slug = 'widget-'.Str::lower(Str::random(6));
        }

        $widgetPayload = [
            'name' => $data['name'],
            'slug' => $slug,
            'status' => $data['status'] ?? ($widget?->status ?? 'draft'),
            'shop_id' => $data['shop_id'] ?? $widget?->shop_id,
            'locale' => $data['locale'] ?? $widget?->locale,
            'settings' => $data['settings'] ?? ($widget?->settings ?? null),
        ];

        $itemsPayload = null;
        if (array_key_exists('items', $data)) {
            $items = $data['items'] ?? [];
            $itemsPayload = [];
            foreach ($items as $index => $item) {
                $itemsPayload[] = [
                    'product_id' => $item['product_id'] ?? null,
                    'product_variant_id' => $item['product_variant_id'] ?? null,
                    'position' => $item['position'] ?? $index,
                    'payload' => $this->normalizePayload($item['payload'] ?? []),
                ];
            }
        }

        return [
            'widget' => $widgetPayload,
            'items' => $itemsPayload,
            'regenerate_token' => $data['regenerate_token'] ?? false,
        ];
    }

    /**
     * @param  array<mixed>  $payload
     * @return array<string, mixed>
     */
    private function normalizePayload(array $payload): array
    {
        $payload['tags'] = array_values(array_filter(
            array_map(static fn ($tag) => is_string($tag) ? trim($tag) : null, $payload['tags'] ?? []),
            static fn ($tag) => $tag !== null && $tag !== ''
        ));

        if (isset($payload['variant_options']) && is_array($payload['variant_options'])) {
            $payload['variant_options'] = array_values(array_map(function ($option) {
                if (! is_array($option)) {
                    return [];
                }

                return array_filter($option, static fn ($value) => $value !== null);
            }, $payload['variant_options']));
        }

        return $payload;
    }

    /**
     * @param  array<int, array<string, mixed>>|null  $items
     */
    private function syncItems(ProductWidget $widget, ?array $items): void
    {
        if ($items === null) {
            return;
        }

        $widget->items()->delete();

        foreach ($items as $position => $item) {
            $widget->items()->create([
                'product_id' => $item['product_id'] ?? null,
                'product_variant_id' => $item['product_variant_id'] ?? null,
                'position' => $item['position'] ?? $position,
                'payload' => $item['payload'] ?? [],
            ]);
        }
    }

    /**
     * @return array{html: string, styles: string, settings: array<string, mixed>}
     */
    private function refreshMarkup(ProductWidget $widget): array
    {
        $widget->load('items');
        $render = $this->renderer->render($widget);
        $widget->html_markup = $render['html'];
        $widget->save();

        return $render;
    }

    /**
     * @param  array{html: string, styles: string, settings: array<string, mixed>}|null  $render
     */
    private function transformWidget(ProductWidget $widget, ?array $render = null): array
    {
        $widget->loadMissing('items');

        $render ??= $this->renderer->render($widget);

        $scriptUrl = secure_url(sprintf('/widgets/%s.js', $widget->public_token));
        $containerId = Arr::get($render['settings'], 'container_id', 'kv-widget-'.$widget->public_token);

        return array_merge($widget->toArray(), [
            'script_url' => $scriptUrl,
            'embed_snippet' => sprintf(
                "<div id=\"%s\" data-kv-widget=\"%s\"></div>\n<script src=\"%s\" async data-target=\"%s\"></script>",
                e($containerId),
                e($widget->public_token),
                e($scriptUrl),
                e($containerId)
            ),
            'render' => $render,
        ]);
    }
}
