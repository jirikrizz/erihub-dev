<?php
require '/var/www/vendor/autoload.php';
$app = require '/var/www/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Modules\Pim\Models\ProductVariant;
use Modules\Inventory\Models\InventoryVariantRecommendation;
use Modules\Inventory\Services\InventoryRecommendationService;

$service = app(InventoryRecommendationService::class);
$codes = [
    '0207-PPF479',
    '0207-PPH158',
    '0207-PPF2503',
    '0207-0008303',
    '0207-PPF7036'
];

foreach ($codes as $code) {
    $variant = ProductVariant::where('code', $code)->first();
    if (! $variant) {
        echo "Missing variant $code\n";
        continue;
    }
    InventoryVariantRecommendation::where('variant_id', $variant->id)->delete();
    $recs = $service->recommend($variant, 12);
    $pos = 0;
    foreach ($recs as $rec) {
        if ($pos >= 12) { break; }
        $recId = $rec['variant']['id'] ?? null;
        if (! $recId || $recId === $variant->id) { continue; }
        InventoryVariantRecommendation::create([
            'variant_id' => $variant->id,
            'recommended_variant_id' => $recId,
            'position' => $pos++,
            'score' => $rec['score'] ?? null,
            'matches' => $rec['matches'] ?? [],
        ]);
    }
    echo "Rebuilt $code with $pos items\n";
}
