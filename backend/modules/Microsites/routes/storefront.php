<?php

use Illuminate\Support\Facades\Route;
use Modules\Microsites\Http\Controllers\StorefrontMicroshopController;

Route::get('microshops/resolve', [StorefrontMicroshopController::class, 'resolve']);
