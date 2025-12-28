<?php
require '/var/www/vendor/autoload.php';
$app = require '/var/www/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Modules\Inventory\Support\InventoryVariantContext;
use Modules\Pim\Models\ProductVariant;

$codes = ['0207-PPF479', '207-0016629'];
foreach ($codes as $code) {
    $variant = ProductVariant::where('code', $code)->first();
    if (! $variant) { echo "Missing $code\n"; continue; }
    $ctx = InventoryVariantContext::build($variant);
    echo "=== $code ===\n";
    echo json_encode($ctx['descriptors'] ?? [], JSON_PRETTY_PRINT) . "\n";
    echo json_encode($ctx['filter_parameters'] ?? [], JSON_PRETTY_PRINT) . "\n";
}
