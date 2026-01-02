<?php
// Temporary debug endpoint — prints controller response for given widget request.
// Remove after use.
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
// Boot the container
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);

// Build request from globals
$request = Illuminate\Http\Request::createFromGlobals();
// Ensure query params exist
$params = [];
$params['widget_id'] = $_GET['widget_id'] ?? null;
$params['product_code'] = $_GET['product_code'] ?? null;
$params['limit'] = $_GET['limit'] ?? 12;
$params['container'] = $_GET['container'] ?? null;
$params['page_type'] = $_GET['page_type'] ?? null;
$params['language'] = $_GET['language'] ?? null;
$params['currency'] = $_GET['currency'] ?? null;
$params['mode'] = $_GET['mode'] ?? null;

foreach ($params as $k => $v) {
    if ($v !== null) {
        $request->query->set($k, $v);
    }
}

try {
    $controller = $app->make(Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController::class);
    $response = $controller->script($request);
    http_response_code($response->getStatusCode());
    foreach ($response->headers->all() as $name => $values) {
        header($name . ': ' . implode(',', $values));
    }
    echo $response->getContent();
} catch (Throwable $e) {
    http_response_code(500);
    echo "ERROR: " . $e->getMessage() . "\n" . $e->getTraceAsString();
}
