<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\Workflow\{Quotes, Orders};
use App\Services\SalesControl\{FlowSupport, QuoteReview};

/** Serialize the existing sales editor and the review/handoff against the same parent row. */
class SalesRecordLock
{
    public function handle(Request $request, Closure $next, string $kind)
    {
        if ($request->isMethodSafe() || !$request->user()) return $next($request);
        $id = $request->route('quoteId') ?? $request->route('idQuote') ?? $request->route('orderId') ?? $request->route('idOrder') ?? $request->route('id');
        if (is_object($id)) $id = $id->id;
        if (!is_numeric($id)) return $next($request);
        return DB::transaction(function () use ($request, $next, $kind, $id) {
            $model = $kind === 'quote' ? Quotes::class : Orders::class;
            $record = $model::withoutGlobalScopes()->whereKey($id)->lockForUpdate()->first();
            if ($record) {
                $controlled = $kind === 'quote' ? app(QuoteReview::class)->required($record) : DB::table('jn_technical_handoffs')->where('order_id', $id)->exists();
                if ($controlled) abort_unless(FlowSupport::owns($request->user(), $record), 403, '只有负责人或管理员可以修改这份记录。');
            }
            return $next($request);
        });
    }
}
