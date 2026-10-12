<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Symfony\Component\HttpFoundation\Response;

class CheckUserRole
{
    public function handle(Request $request, Closure $next): Response
    {
        if (auth()->check()) {
            abort_unless(\App\Services\CompanyData\DataSupport::active(auth()->user()), 403, '此账号或关联成员已停用，请联系总管理员。');
        }
        if (auth()->check() && auth()->user()->roles()->count() === 0) {
            if (Route::has('setup.index')) {
                return redirect()->route('setup.index');
            }

            abort(403, __('No role assigned.'));
        }

        return $next($request);
    }
}
