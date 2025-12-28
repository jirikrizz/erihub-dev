<?php

use Illuminate\Support\Facades\Route;
use Modules\Admin\Http\Controllers\UserController;

Route::get('sections', [UserController::class, 'sections']);
Route::get('roles', [UserController::class, 'roles']);
Route::get('users', [UserController::class, 'index']);
Route::post('users', [UserController::class, 'store']);
Route::post('users/{user}/roles', [UserController::class, 'syncRoles']);
Route::patch('users/{user}', [UserController::class, 'update']);
Route::delete('users/{user}', [UserController::class, 'destroy']);
