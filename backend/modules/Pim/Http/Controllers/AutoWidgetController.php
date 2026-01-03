<?php

namespace Modules\Pim\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Pim\Services\AutoWidgetBuilderService;
use Modules\Shoptet\Models\Shop;

class AutoWidgetController extends Controller
{
    public function __construct(
        private readonly AutoWidgetBuilderService $builder
    ) {
    }

    /**
     * Build nonFragrance widget
     * POST /api/pim/auto-widgets/nonFragrance
     */
    public function buildNonFragrance(Request $request)
    {
        $validated = $request->validate([
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
            'locale' => ['required', 'string', 'in:cs,sk,hu,ro,hr'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:20'],
            'exclude_keywords' => ['nullable', 'array'],
            'exclude_keywords.*' => ['string'],
        ]);

        $shop = Shop::findOrFail($validated['shop_id']);
        $locale = $validated['locale'];
        $limit = $validated['limit'] ?? 10;
        $options = [
            'exclude_keywords' => $validated['exclude_keywords'] ?? [],
        ];

        $widget = $this->builder->buildNonFragranceWidget($shop, $locale, $limit, $options);

        return response()->json([
            'widget' => $widget->load('items'),
            'message' => 'NonFragrance widget vytvořen úspěšně',
        ], 201);
    }

    /**
     * Build products widget
     * POST /api/pim/auto-widgets/products
     */
    public function buildProducts(Request $request)
    {
        $validated = $request->validate([
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
            'locale' => ['required', 'string', 'in:cs,sk,hu,ro,hr'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:20'],
            'algorithm' => ['nullable', 'string', 'in:mixed,trending,new_arrivals'],
        ]);

        $shop = Shop::findOrFail($validated['shop_id']);
        $locale = $validated['locale'];
        $limit = $validated['limit'] ?? 6;
        $options = [
            'algorithm' => $validated['algorithm'] ?? 'mixed',
        ];

        $widget = $this->builder->buildProductsWidget($shop, $locale, $limit, $options);

        return response()->json([
            'widget' => $widget->load('items'),
            'message' => 'Products widget vytvořen úspěšně',
        ], 201);
    }

    /**
     * Preview widget data without creating
     * POST /api/pim/auto-widgets/preview
     */
    public function preview(Request $request)
    {
        $validated = $request->validate([
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
            'locale' => ['required', 'string', 'in:cs,sk,hu,ro,hr'],
            'type' => ['required', 'string', 'in:nonFragrance,products'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:20'],
            'algorithm' => ['nullable', 'string'],
        ]);

        $shop = Shop::findOrFail($validated['shop_id']);
        $locale = $validated['locale'];
        $type = $validated['type'];
        $limit = $validated['limit'] ?? 6;

        if ($type === 'nonFragrance') {
            $widget = $this->builder->buildNonFragranceWidget($shop, $locale, $limit, [
                'preview' => true,
            ]);
        } else {
            $widget = $this->builder->buildProductsWidget($shop, $locale, $limit, [
                'algorithm' => $validated['algorithm'] ?? 'mixed',
                'preview' => true,
            ]);
        }

        // Return widget data but don't persist (delete immediately after creating)
        $data = $widget->load('items')->toArray();
        $widget->delete();

        return response()->json([
            'preview' => $data,
            'message' => 'Preview vygenerován',
        ]);
    }
}
