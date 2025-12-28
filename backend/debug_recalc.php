<?php
require __DIR__.'/vendor/autoload.php';
$app = require __DIR__.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Modules\Pim\Models\ProductVariant;
use Modules\Inventory\Services\InventoryMetricsService;
use Modules\Inventory\Jobs\RecalculateInventoryVariantMetricsJob;

$ids = ProductVariant::query()->orderBy('created_at')->limit(1)->pluck('id')->all();

$job = new RecalculateInventoryVariantMetricsJob($ids);
$job->handle(app(InventoryMetricsService::class));

