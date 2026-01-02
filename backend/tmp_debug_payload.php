<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

try {
    $productCode = $argv[1] ?? 'UNIQGA851';

    $controller = $app->make(Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController::class);

    $variant = Modules\Pim\Models\ProductVariant::query()->with('product')->where('code', $productCode)->first();
    if (! $variant) {
        echo "VARIANT_NOT_FOUND\n";
        exit(1);
    }

    $refc = new ReflectionClass($controller);
    if (! $refc->hasMethod('buildItemPayload')) {
        echo "METHOD_MISSING\n";
        exit(1);
    }

    // obtain snapshot via resolver
    $resolver = $app->make(Modules\Microsites\Services\MicrositeProductResolver::class);
    $shopId = $variant->product?->shop_id ?? null;
    $snapshot = $resolver->snapshotByVariantId($variant->id, $shopId);
    if (! is_array($snapshot)) {
        echo "SNAPSHOT_MISSING\n";
        exit(1);
    }

    $recommendation = [
        'variant' => [
            'id' => $variant->id,
            'code' => $variant->code,
            'data' => $variant->data ?? [],
        ],
    ];

    $method = $refc->getMethod('buildItemPayload');
    $method->setAccessible(true);

    $baseContext = Modules\Inventory\Support\InventoryVariantContext::build($variant);
    $baseBrand = null;
    $hideMatchReasons = false;

    $payloadObj = $method->invoke($controller, $snapshot, $recommendation, $variant, $baseContext, $baseBrand, $hideMatchReasons, $shopId);

    echo json_encode($payloadObj, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
    // emulate renderer price normalization and print it
    $pricePayload = \Illuminate\Support\Arr::wrap($payloadObj['price'] ?? []);
    $normalizedPrice = [
        'current' => $pricePayload['current'] ?? ($payloadObj['price_current'] ?? null),
        'original' => $pricePayload['original'] ?? ($payloadObj['price_original'] ?? null),
        'volume' => $pricePayload['volume'] ?? ($payloadObj['price_volume'] ?? null),
        'discount' => $pricePayload['discount'] ?? ($payloadObj['price_discount'] ?? null),
        'action_price' => $pricePayload['action_price'] ?? ($payloadObj['price']['action_price'] ?? ($payloadObj['price_action'] ?? ($payloadObj['action_price'] ?? null))),
        'base_price' => $pricePayload['base_price'] ?? ($payloadObj['price']['base_price'] ?? ($payloadObj['price_base'] ?? ($payloadObj['base_price'] ?? null))),
    ];
    echo "\n---- NORMALIZED PRICE ----\n" . json_encode($normalizedPrice, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n---- END NORMALIZED PRICE ----\n";
    // Also render this payload through ProductWidgetRenderer to inspect the final HTML
    $renderer = $app->make(Modules\Pim\Services\ProductWidgetRenderer::class);
    $fakeWidget = new Modules\Pim\Models\ProductWidget();
    $fakeWidget->public_token = 'debug-token';
    $fakeWidget->settings = ['container_id' => 'kv-debug-container'];
    $fakeWidget->items = collect([ (object) ['payload' => $payloadObj, 'position' => 0] ]);

    $rendered = $renderer->render($fakeWidget);
    $html = $rendered['html'] ?? '';
    // print short snippet around data-default-price for manual inspection
    if (is_string($html) && ($pos = strpos($html, 'data-default-price')) !== false) {
        $start = max(0, $pos - 120);
        $snippet = substr($html, $start, 400);
        echo "\n---- HTML SNIPPET ----\n" . $snippet . "\n---- END SNIPPET ----\n";
    } else {
        echo "NO_HTML_SNIPPET_FOUND\n";
    }
} catch (Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n" . $e->getTraceAsString() . "\n";
}
