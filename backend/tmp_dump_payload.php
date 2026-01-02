<?php
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

try {
    $productCode = $argv[1] ?? 'UNIQGA851';

    $variant = Modules\Pim\Models\ProductVariant::query()->with('product')->where('code', $productCode)->first();
    if (! $variant) {
        echo "VARIANT_NOT_FOUND\n";
        exit(1);
    }

    $resolver = $app->make(Modules\Microsites\Services\MicrositeProductResolver::class);
    $shopId = $variant->product?->shop_id ?? null;
    $snapshot = $resolver->snapshotByVariantId($variant->id, $shopId);

    $out = [
        'variant_code' => $variant->code,
        'variant_id' => (string) $variant->id,
        'product_base_payload' => $variant->product?->base_payload ?? null,
        'product_base_payload_keys' => is_array($variant->product?->base_payload) ? array_keys($variant->product->base_payload) : null,
        'snapshot_metadata' => $snapshot['metadata'] ?? null,
        'snapshot_base_payload' => $snapshot['base_payload'] ?? null,
        'snapshot_base_payload_keys' => is_array($snapshot['base_payload'] ?? null) ? array_keys($snapshot['base_payload']) : null,
        'variant_data' => $variant->data ?? null,
    ];

    echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
} catch (Throwable $e) {
    echo "ERROR: " . $e->getMessage() . "\n" . $e->getTraceAsString() . "\n";
}
