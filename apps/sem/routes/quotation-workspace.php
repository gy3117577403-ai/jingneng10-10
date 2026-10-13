<?php
use App\Http\Controllers\QuotationWorkspaceController as C;
use Illuminate\Support\Facades\Route;
Route::middleware(['auth', 'verified', 'has.role', 'check.factory'])->prefix('quotation-workspace')->name('quotation-workspace.')->group(function () {
    Route::get('/', [C::class, 'page'])->name('page');
    Route::get('/api', [C::class, 'index'])->name('index');
    Route::get('/api/history', [C::class, 'history']);
    Route::get('/api/options', [C::class, 'options']);
    Route::get('/api/{id}', [C::class, 'detail'])->whereNumber('id');
    Route::get('/api/{id}/versions/{revision}', [C::class, 'version'])->whereNumber(['id', 'revision']);
    Route::middleware('throttle:60,1')->group(function () {
        Route::post('/api', [C::class, 'create']);
        Route::put('/api/{id}', [C::class, 'save'])->whereNumber('id');
        Route::post('/api/{id}/reuse', [C::class, 'reuse'])->whereNumber('id');
    });
});
