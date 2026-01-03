<?php
// Public widget endpoint - served directly by Nginx
// This file is served as a PHP script directly without going through Laravel routing

// Load Composer autoloader
require __DIR__ . '/../../../../vendor/autoload.php';

// Create a minimal Illuminate app just to load the controller
require __DIR__ . '/../../../../bootstrap/app.php';

// Capture the request
$request = \Illuminate\Http\Request::capture();

// Disable all middleware and services
$kernel = app(\Illuminate\Contracts\Http\Kernel::class);

// Call the controller method directly
$controller = new \Modules\Inventory\Http\Controllers\InventoryRecommendationWidgetController();

try {
    // Set proper content type for JavaScript
    header('Content-Type: application/javascript; charset=utf-8');
    
    // Call the controller method
    $response = $controller->script($request);
    
    // Send response
    $response->header('Content-Type', 'application/javascript')->send();
} catch (\Exception $e) {
    header('Content-Type: application/javascript; charset=utf-8', true, 500);
    echo 'console.error("Widget error: ' . addslashes($e->getMessage()) . '");';
}
