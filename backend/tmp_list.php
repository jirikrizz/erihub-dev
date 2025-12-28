<?php
require '/var/www/vendor/autoload.php';
$app = require '/var/www/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Modules\Inventory\Services\InventoryRecommendationService;
use Modules\Pim\Models\ProductVariant;
use Illuminate\Support\Arr;

$service = app(InventoryRecommendationService::class);
$base = ProductVariant::where('code', '0207-PPF479')->first();
$recs = $service->recommend($base, 100);
foreach ($recs as $idx => $rec) {
    $code = Arr::get($rec, 'variant.code');
    $score = $rec['score'] ?? null;
    if ($code === '207-0016629') {
        echo "FOUND at $idx score=$score\n";
        echo json_encode($rec['matches'] ?? [], JSON_PRETTY_PRINT) . "\n";
        exit;
    }
}
echo "NOT FOUND\n";
