<?php

use App\Http\Controllers\PresalesController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified', 'has.role', 'check.factory'])->prefix('presales')->name('presales.')->group(function () {
    Route::get('/', [PresalesController::class, 'page'])->name('index');
    Route::get('/inquiries/{inquiry}', [PresalesController::class, 'page'])->whereNumber('inquiry')->name('show');
    Route::get('/examples/{kind}', [PresalesController::class, 'example'])->name('example');
    Route::prefix('api')->group(function () {
        Route::get('/inquiries', [PresalesController::class, 'index']);
        Route::get('/inquiries/{inquiry}', [PresalesController::class, 'show'])->whereNumber('inquiry');
        Route::get('/inquiries/{inquiry}/users', [PresalesController::class, 'users'])->whereNumber('inquiry');
        Route::get('/inquiries/{inquiry}/versions/{version}/download', [PresalesController::class, 'download'])->whereNumber(['inquiry', 'version']);
        Route::middleware('throttle:60,1')->group(function () {
            Route::post('/inquiries', [PresalesController::class, 'create']);
            Route::put('/inquiries/{inquiry}', [PresalesController::class, 'update'])->whereNumber('inquiry');
            Route::put('/inquiries/{inquiry}/members', [PresalesController::class, 'members'])->whereNumber('inquiry');
            Route::post('/inquiries/{inquiry}/files', [PresalesController::class, 'upload'])->whereNumber('inquiry');
            Route::post('/inquiries/{inquiry}/runs', [PresalesController::class, 'start'])->whereNumber('inquiry');
            Route::post('/inquiries/{inquiry}/runs/{run}/review', [PresalesController::class, 'review'])->whereNumber(['inquiry', 'run']);
            Route::post('/inquiries/{inquiry}/runs/{run}/retry', [PresalesController::class, 'retry'])->whereNumber(['inquiry', 'run']);
            Route::post('/inquiries/{inquiry}/runs/{run}/cancel', [PresalesController::class, 'cancel'])->whereNumber(['inquiry', 'run']);
        });
    });
});
