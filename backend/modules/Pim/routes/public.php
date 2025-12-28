<?php

use Illuminate\Support\Facades\Route;
use Modules\Pim\Http\Controllers\ProductWidgetEmbedController;

Route::get('widgets/{token}.js', [ProductWidgetEmbedController::class, 'script'])
    ->where('token', '[A-Za-z0-9\-]+');
