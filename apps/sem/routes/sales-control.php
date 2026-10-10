<?php

use App\Http\Controllers\SalesControlController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified', 'has.role', 'check.factory'])->prefix('sales-control')->name('sales-control.')->group(function () {
    Route::get('/{kind}/{id}', [SalesControlController::class, 'page'])->whereIn('kind', ['quotes', 'orders'])->whereNumber('id')->name('page');
    Route::get('/api/quotes/{id}', [SalesControlController::class, 'quote'])->whereNumber('id')->name('quote');
    Route::get('/api/orders/{id}', [SalesControlController::class, 'order'])->whereNumber('id')->name('order');
    Route::get('/api/quotes/{id}/reviews/{review}/pdf', [SalesControlController::class, 'pdf'])->whereNumber(['id', 'review'])->name('review-pdf');
    Route::get('/api/quotes/{id}/reviews/{review}/files/{file}', [SalesControlController::class, 'quoteFile'])->whereNumber(['id', 'review', 'file'])->name('quote-file');
    Route::get('/api/orders/{id}/versions/{version}/files/{file}', [SalesControlController::class, 'orderFile'])->whereNumber(['id', 'version', 'file'])->name('order-file');
    Route::middleware('throttle:60,1')->group(function () {
        Route::post('/api/quotes/{id}/submit', [SalesControlController::class, 'submit'])->whereNumber('id');
        Route::post('/api/quotes/{id}/reviews/{review}/decision', [SalesControlController::class, 'decide'])->whereNumber(['id', 'review']);
        Route::post('/api/orders/{id}/send', [SalesControlController::class, 'send'])->whereNumber('id');
        Route::post('/api/orders/{id}/action', [SalesControlController::class, 'action'])->whereNumber('id');
    });
});
