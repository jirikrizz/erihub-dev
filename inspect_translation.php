<?php
require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$translation = Modules\Pim\Models\ProductTranslation::with(['product', 'product.overlays', 'product.variants', 'product.variants.overlays'])->find('8f6ebdc9-537b-415f-9517-a8421ba70d6c');
if (! $translation) {
    echo "Translation not found\n";
    exit(1);
}

echo "Translation status: {$translation->status}\n";

echo "Parameters (translation->parameters):\n";
var_export($translation->parameters);
echo "\n\nProduct overlay for shop {$translation->shop_id}:\n";
$productOverlay = $translation->product->overlays->firstWhere('shop_id', $translation->shop_id);
if ($productOverlay) {
    var_export($productOverlay->data);
} else {
    echo "(none)\n";
}

echo "\n\nVariants for product:\n";
foreach ($translation->product->variants as $variant) {
    echo "Variant {$variant->code}:\n";
    $overlay = $variant->overlays->firstWhere('shop_id', $translation->shop_id);
    if ($overlay) {
        var_export($overlay->data);
    } else {
        echo "  (no overlay)\n";
    }
    echo "\n";
}
