<?php
// Public widget endpoint - served directly by Nginx without Laravel routing
// This bypasses all middleware issues

require __DIR__ . '/../../../bootstrap/app.php';

use Illuminate\Http\Request;

$app = require_once __DIR__ . '/../../../bootstrap/app.php';

$request = Request::capture();

// Load Inventory module controller
$controller = new \Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController();
$response = $controller->script($request);

$response->send();
