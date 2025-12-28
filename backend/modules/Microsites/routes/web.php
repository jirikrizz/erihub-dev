<?php

use Illuminate\Support\Facades\Route;
use Modules\Microsites\Http\Controllers\PublicMicrositeController;

Route::get('{slug}', [PublicMicrositeController::class, 'show'])
    ->where('slug', '[A-Za-z0-9\-_]+');
