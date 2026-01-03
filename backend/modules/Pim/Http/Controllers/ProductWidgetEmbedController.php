<?php

namespace Modules\Pim\Http\Controllers;

use Illuminate\Routing\Controller;
use Modules\Pim\Models\ProductWidget;
use Modules\Pim\Services\ProductWidgetRenderer;

class ProductWidgetEmbedController extends Controller
{
    public function __construct(private readonly ProductWidgetRenderer $renderer)
    {
    }

    public function script(string $token)
    {
        $cacheKey = "widget:embed:{$token}";
        $cacheTtl = 3600; // 1 hour

        return cache()->remember($cacheKey, $cacheTtl, function () use ($token) {
            $widget = ProductWidget::query()
                ->where('public_token', $token)
                ->with('items')
                ->firstOrFail();

            if ($widget->status !== 'published') {
                abort(404);
            }

            $render = $this->renderer->render($widget);

            return response()->view('pim::widgets.script', [
                'token' => $widget->public_token,
                'html' => $render['html'],
                'styles' => $render['styles'],
                'containerId' => $render['settings']['container_id'] ?? null,
                'containerClass' => $render['settings']['container_class'] ?? null,
            ], 200, [
                'Content-Type' => 'application/javascript; charset=UTF-8',
                'Cache-Control' => 'public, max-age=3600, s-maxage=3600',
            ]);
        });
    }
}
