<?php
use App\Http\Controllers\OrganizationController as C;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth', 'verified', 'has.role', 'check.factory'])->prefix('organization')->name('organization.')->group(function () {
    Route::get('/', [C::class, 'page'])->name('page');
    Route::prefix('api')->group(function () {
        Route::get('/', [C::class, 'index'])->name('index');
        Route::get('/people/{id}', [C::class, 'detail'])->whereNumber('id');
        Route::get('/configuration', [C::class, 'configuration']);
        Route::get('/events', [C::class, 'events']);
        Route::get('/people/{id}/avatar', [C::class, 'avatar'])->whereNumber('id')->name('avatar');
        Route::middleware('throttle:90,1')->group(function () {
            Route::post('/people/{id}/avatar', [C::class, 'upload'])->whereNumber('id');
            Route::post('/{kind}/{id}', [C::class, 'save'])->whereIn('kind', ['unit', 'position', 'person', 'role', 'grant', 'account', 'owner'])->whereNumber('id');
        });
    });
});
