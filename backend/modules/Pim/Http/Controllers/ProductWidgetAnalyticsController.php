<?php

namespace Modules\Pim\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Arr;
use Modules\Pim\Models\ProductWidget;
use Modules\Pim\Models\ProductWidgetEvent;

class ProductWidgetAnalyticsController extends Controller
{
    public function impression(Request $request, string $publicToken)
    {
        return $this->storeEvents($request, $publicToken, 'impression');
    }

    public function click(Request $request, string $publicToken)
    {
        return $this->storeEvents($request, $publicToken, 'click');
    }

    private function storeEvents(Request $request, string $publicToken, string $eventType)
    {
        $widget = ProductWidget::query()
            ->where('public_token', $publicToken)
            ->firstOrFail();

        $validated = $request->validate([
            'items' => ['array'],
            'items.*.product_widget_item_id' => ['nullable', 'uuid'],
            'items.*.product_id' => ['nullable', 'uuid'],
            'items.*.product_variant_id' => ['nullable', 'uuid'],
            'items.*.shop_id' => ['nullable', 'integer'],
            'items.*.locale' => ['nullable', 'string', 'max:12'],
            'items.*.meta' => ['nullable', 'array'],
            'shop_id' => ['nullable', 'integer'],
            'locale' => ['nullable', 'string', 'max:12'],
            'meta' => ['nullable', 'array'],
        ]);

        $items = $validated['items'] ?? [[]];
        $ip = $request->ip();
        $userAgent = $request->userAgent();
        $referer = $request->headers->get('referer');

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            ProductWidgetEvent::create([
                'product_widget_id' => $widget->id,
                'product_widget_item_id' => Arr::get($item, 'product_widget_item_id'),
                'product_id' => Arr::get($item, 'product_id'),
                'product_variant_id' => Arr::get($item, 'product_variant_id'),
                'shop_id' => Arr::get($item, 'shop_id', $validated['shop_id'] ?? $widget->shop_id),
                'locale' => Arr::get($item, 'locale', $validated['locale'] ?? $widget->locale),
                'event_type' => $eventType,
                'widget_public_token' => $publicToken,
                'ip_address' => $ip,
                'user_agent' => $userAgent,
                'referer' => $referer,
                'meta' => Arr::get($item, 'meta', $validated['meta'] ?? null),
            ]);
        }

        return response()->json(['status' => 'ok', 'event_type' => $eventType]);
    }
}
