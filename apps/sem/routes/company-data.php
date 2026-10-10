<?php
use App\Http\Controllers\CompanyDataController as C;
use Illuminate\Support\Facades\Route;
Route::middleware(['auth', 'verified', 'has.role', 'check.factory'])->prefix('company-data')->name('company-data.')->group(function () {
    Route::get('/', [C::class, 'page'])->name('page');
    Route::prefix('api')->group(function () {
        Route::get('/', [C::class, 'index'])->name('index');
        Route::get('/records/{id}', [C::class, 'detail'])->whereNumber('id');
        Route::get('/configuration', [C::class, 'configuration']);
        Route::get('/collaboration', [C::class, 'collaboration']);
        Route::get('/imports', [C::class, 'imports']);
        Route::get('/imports/{id}', [C::class, 'batch'])->whereNumber('id');
        Route::get('/export/{id}', [C::class, 'export'])->whereNumber('id');
        Route::get('/records/{id}/versions/{version}/files/{file}', [C::class, 'file'])->whereNumber(['id', 'version', 'file']);
        Route::middleware('throttle:90,1')->group(function () {
            Route::post('/catalog/{kind}/{id}', [C::class, 'catalog'])->whereIn('kind', ['category', 'group', 'policy'])->whereNumber('id');
            Route::post('/records/{id}/{action}', [C::class, 'record'])->whereIn('action', ['create', 'save', 'submit', 'approve', 'reject', 'withdraw', 'archive', 'restore'])->whereNumber('id');
            Route::post('/collaboration/{id}/{action}', [C::class, 'collaborate'])->whereIn('action', ['comment', 'task', 'request', 'task-action', 'access-action'])->whereNumber('id');
            Route::post('/records/{id}/files', [C::class, 'upload'])->whereNumber('id');
            Route::post('/imports/stage/{id}', [C::class, 'stage'])->whereNumber('id');
            Route::post('/imports/{id}', [C::class, 'importAction'])->whereNumber('id');
        });
    });
});
