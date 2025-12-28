<?php

declare(strict_types=1);

require __DIR__ . '/vendor/autoload.php';

$app = require __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Http\Request;
use Modules\Shoptet\Http\Controllers\PluginAdminController;

$controller = app(PluginAdminController::class);

$payload = [
    'shop_id' => 1,
    'name' => 'Test',
    'widget_id' => '098663ec-c9af-4511-a599-d733e53052a1',
    'page_targets' => ['productDetail'],
    'selector' => '.p-detail-inner',
    'placement' => 'after',
    'bundle_key' => 'main',
    'max_attempts' => 60,
    'poll_interval_ms' => 500,
    'data_source' => 'inventory_recommendations',
    'recommendation_limit' => 8,
];

$request = Request::create('/api/shoptet/plugins/auto-widgets', 'POST', $payload);
$response = $controller->storeAutoWidget($request);

echo $response->getStatusCode(), PHP_EOL;
echo $response->getContent(), PHP_EOL;
