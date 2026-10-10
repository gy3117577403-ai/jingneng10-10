<?php

namespace App\Http\Controllers;

use App\Services\SalesControl\{QuoteReview, TechnicalHandoff};
use Illuminate\Http\Request;

class SalesControlController extends Controller
{
    public function page(Request $request, string $kind, int $id)
    {
        $service = $kind === 'quotes' ? app(QuoteReview::class) : app(TechnicalHandoff::class);
        $context = $service->context($id, $request->user());
        return response()->view('sales-control.page', compact('kind', 'id', 'context'))->header('Cache-Control', 'private, no-store');
    }
    public function quote(Request $request, int $id, QuoteReview $service) { return response()->json($service->context($id, $request->user()))->header('Cache-Control', 'no-store'); }
    public function order(Request $request, int $id, TechnicalHandoff $service) { return response()->json($service->context($id, $request->user()))->header('Cache-Control', 'no-store'); }
    public function submit(Request $request, int $id, QuoteReview $service) { return response()->json($service->submit($id, $request->user(), $request->header('X-Request-ID', ''), $request->all())); }
    public function decide(Request $request, int $id, int $review, QuoteReview $service) { return response()->json($service->decide($id, $review, $request->user(), $request->header('X-Request-ID', ''), $request->all())); }
    public function pdf(Request $request, int $id, int $review, QuoteReview $service) { return $service->pdf($id, $review, $request->user()); }
    public function quoteFile(Request $request, int $id, int $review, int $file, QuoteReview $service) { return $service->sourceFile($id, $review, $file, $request->user()); }
    public function send(Request $request, int $id, TechnicalHandoff $service) { return response()->json($service->send($id, $request->user(), $request->header('X-Request-ID', ''), $request->all())); }
    public function action(Request $request, int $id, TechnicalHandoff $service) { return response()->json($service->action($id, $request->user(), $request->header('X-Request-ID', ''), $request->all())); }
    public function orderFile(Request $request, int $id, int $version, int $file, TechnicalHandoff $service) { return $service->file($id, $version, $file, $request->user()); }
}
