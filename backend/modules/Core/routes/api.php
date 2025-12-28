<?php

use Illuminate\Support\Facades\Route;
use Modules\Core\Http\Controllers\AiContentController;
use Modules\Core\Http\Controllers\AuthController;
use Modules\Core\Http\Controllers\FeedExportController;
use Modules\Core\Http\Controllers\AutomationStatusController;
use Modules\Core\Http\Controllers\JobLogController;
use Modules\Core\Http\Controllers\JobScheduleController;
use Modules\Core\Http\Controllers\NotificationController;
use Modules\Core\Http\Controllers\SettingsController;
use Modules\Core\Http\Controllers\UserPreferenceController;

Route::get('/health', fn () => ['status' => 'ok']);

Route::post('auth/login', [AuthController::class, 'login']);
Route::middleware('auth:sanctum')->group(function () {
    Route::post('auth/logout', [AuthController::class, 'logout']);

    Route::get('settings/openai', [SettingsController::class, 'showOpenAi']);
    Route::post('settings/openai', [SettingsController::class, 'storeOpenAi']);
    Route::get('settings/google-ai', [SettingsController::class, 'showGoogleAi']);
    Route::post('settings/google-ai', [SettingsController::class, 'storeGoogleAi']);
    Route::get('settings/slack', [SettingsController::class, 'showSlack']);
    Route::post('settings/slack', [SettingsController::class, 'storeSlack']);
    Route::get('settings/elogist', [SettingsController::class, 'showElogist']);
    Route::post('settings/elogist', [SettingsController::class, 'storeElogist']);
    Route::get('settings/analytics', [SettingsController::class, 'showAnalytics']);
    Route::post('settings/analytics', [SettingsController::class, 'storeAnalytics']);
    Route::get('settings/orders-status-mapping', [SettingsController::class, 'showOrderStatusMapping']);
   Route::post('settings/orders-status-mapping', [SettingsController::class, 'storeOrderStatusMapping']);
   Route::get('settings/inventory-forecast-profile', [SettingsController::class, 'showInventoryForecastProfile']);
   Route::post('settings/inventory-forecast-profile', [SettingsController::class, 'storeInventoryForecastProfile']);
    Route::middleware('permission:section.settings.inventory-notifications')->group(function () {
        Route::get('settings/inventory-notifications', [SettingsController::class, 'showInventoryNotificationSettings']);
        Route::post('settings/inventory-notifications', [SettingsController::class, 'storeInventoryNotificationSettings']);
    });
    Route::middleware('permission:section.settings.inventory-recommendations')->group(function () {
        Route::get('settings/inventory-recommendations', [SettingsController::class, 'showInventoryRecommendationSettings']);
        Route::post('settings/inventory-recommendations', [SettingsController::class, 'storeInventoryRecommendationSettings']);
    });
    Route::get('settings/customers', [SettingsController::class, 'showCustomerSettings']);
    Route::post('settings/customers', [SettingsController::class, 'storeCustomerSettings']);

    Route::middleware('permission:section.notifications')->group(function () {
        Route::get('notifications/logs', [NotificationController::class, 'index']);
        Route::post('notifications/logs/{notification}/read', [NotificationController::class, 'markAsRead']);
        Route::post('notifications/logs/read-all', [NotificationController::class, 'markAllAsRead']);
    });

    Route::get('settings/user-preferences/{key}', [UserPreferenceController::class, 'show']);
    Route::post('settings/user-preferences/{key}', [UserPreferenceController::class, 'store']);
    Route::delete('settings/user-preferences/{key}', [UserPreferenceController::class, 'destroy']);

    Route::middleware('permission:section.settings.automation')->group(function () {
        Route::get('settings/job-schedules', [JobScheduleController::class, 'index']);
        Route::post('settings/job-schedules', [JobScheduleController::class, 'store']);
        Route::put('settings/job-schedules/{schedule}', [JobScheduleController::class, 'update']);
        Route::delete('settings/job-schedules/{schedule}', [JobScheduleController::class, 'destroy']);
        Route::get('settings/job-logs', [JobLogController::class, 'index']);
        Route::get('settings/automation/status', [AutomationStatusController::class, 'show']);
    });

    Route::middleware('permission:section.settings.exports')->group(function () {
        Route::get('settings/export-feeds/options', [FeedExportController::class, 'options']);
        Route::get('settings/export-feeds/links', [FeedExportController::class, 'index']);
        Route::post('settings/export-feeds/links', [FeedExportController::class, 'store']);
        Route::delete('settings/export-feeds/links/{link}', [FeedExportController::class, 'destroy']);
    });

    Route::middleware('permission:section.ai.content')->group(function () {
        Route::post('ai/content/text', [AiContentController::class, 'generateText']);
        Route::post('ai/content/image', [AiContentController::class, 'generateImage']);
        Route::post('ai/content/image/edit', [AiContentController::class, 'editImage']);
        Route::post('ai/content/video', [AiContentController::class, 'generateVideo']);
        Route::get('ai/content/video/{jobId}', [AiContentController::class, 'videoStatus']);
        Route::post('ai/content/upload', [AiContentController::class, 'uploadImage']);
        Route::post('ai/content/collage', [AiContentController::class, 'createCollage']);
        Route::get('ai/content/history', [AiContentController::class, 'history']);
    });
});

Route::get('export-feeds/{token}', [FeedExportController::class, 'download'])->name('export-feeds.download');
