<?php

use Illuminate\Support\Facades\Route;
use Modules\Dashboard\Http\Controllers\DashboardController;
use Modules\Dashboard\Http\Controllers\DashboardNoteController;

Route::get('summary', [DashboardController::class, 'summary']);

Route::get('notes', [DashboardNoteController::class, 'index']);
Route::post('notes', [DashboardNoteController::class, 'store']);
Route::patch('notes/{note}', [DashboardNoteController::class, 'update']);
Route::delete('notes/{note}', [DashboardNoteController::class, 'destroy']);
