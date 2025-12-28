<?php

use Illuminate\Support\Facades\Route;
use Modules\Shoptet\Http\Controllers\PluginController;
use Modules\Shoptet\Http\Controllers\PluginGeneratorController;
use Modules\Shoptet\Http\Controllers\PluginTemplateController;
use Modules\Shoptet\Http\Controllers\PluginVersionController;
use Modules\Shoptet\Http\Controllers\PluginAdminController;

Route::post('plugins/generate', [PluginGeneratorController::class, 'generate']);
Route::get('plugins', [PluginController::class, 'index']);
Route::get('plugins/{shoptetPlugin}', [PluginController::class, 'show']);
Route::get('plugins/{shoptetPlugin}/versions', [PluginController::class, 'versions']);
Route::put('plugins/{plugin}', [PluginController::class, 'update']);
Route::delete('plugins/{plugin}', [PluginController::class, 'destroy']);
Route::get('plugin-versions/{shoptetPluginVersion}', [PluginVersionController::class, 'show']);
Route::get('plugin-versions/{shoptetPluginVersion}/download', [PluginVersionController::class, 'download']);
Route::get('plugins/tools/flags', [PluginAdminController::class, 'flags']);
Route::post('plugins/countdown', [PluginAdminController::class, 'storeCountdown']);
Route::post('plugins/snowfall', [PluginAdminController::class, 'storeSnowfall']);
Route::post('plugins/advent-calendar', [PluginAdminController::class, 'storeAdventCalendar']);
Route::post('plugins/auto-widgets', [PluginAdminController::class, 'storeAutoWidget']);

Route::get('plugin-templates', [PluginTemplateController::class, 'index']);
Route::post('plugin-templates', [PluginTemplateController::class, 'store']);
Route::get('plugin-templates/{template}', [PluginTemplateController::class, 'show']);
Route::put('plugin-templates/{template}', [PluginTemplateController::class, 'update']);
Route::delete('plugin-templates/{template}', [PluginTemplateController::class, 'destroy']);
