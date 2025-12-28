<?php

use Illuminate\Support\Facades\Route;
use Modules\Shoptet\Http\Controllers\WebhookController;
use Modules\Shoptet\Http\Controllers\PluginAdminController;

Route::post('webhooks/{shop?}', [WebhookController::class, 'handle'])->whereNumber('shop');
Route::get('plugins/public/{shop}.js', [PluginAdminController::class, 'publicBundle'])->whereNumber('shop');
Route::get('plugins/public/card/{shop}.html', [PluginAdminController::class, 'publicCard'])->whereNumber('shop');
