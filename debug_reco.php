<?php
require __DIR__ . '/backend/vendor/autoload.php';

$app = require __DIR__ . '/backend/bootstrap/app.php';
$kernel = $app->make(Illuminate\\Contracts\\Console\\Kernel::class);
$kernel->bootstrap();

use Modules\\Pim\\Models\\ProductVariant;
use Modules\\Inventory\\Services\\InventoryRecommendationService;

$variantId = $argv[1] ?? null;
if (!$variantId) {
    fwrite(STDERR, "Missing variant id\n");
    exit(1);
}

$variant = ProductVariant::with('product')->find($variantId);
if (!$variant) {
    fwrite(STDERR, "Variant not found\n");
    exit(1);
}

$service = app(InventoryRecommendationService::class);
$recommendations = $service->recommend($variant, 6);

print(json_encode($recommendations, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
