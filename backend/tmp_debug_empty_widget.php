<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

try {
    $renderer = $app->make(Modules\Pim\Services\ProductWidgetRenderer::class);
    $fakeWidget = new Modules\Pim\Models\ProductWidget();
    $fakeWidget->public_token = 'debug-empty';
    $fakeWidget->settings = ['container_id' => 'kv-debug-empty'];
    $fakeWidget->items = collect([]);

    $rendered = $renderer->render($fakeWidget);
    echo "HTML LENGTH: " . strlen($rendered['html'] ?? '') . "\n";
    echo "HTML: \n" . ($rendered['html'] ?? '') . "\n";
} catch (Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n" . $e->getTraceAsString() . "\n";
}
