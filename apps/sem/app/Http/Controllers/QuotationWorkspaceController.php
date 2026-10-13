<?php
namespace App\Http\Controllers;
use App\Services\Quotes\QuotationWorkspace;
use Illuminate\Http\Request;

class QuotationWorkspaceController extends Controller
{
    public function page(Request $r, QuotationWorkspace $s) { $s->access($r->user()); return view('workflow.quotation-workspace'); }
    public function index(Request $r, QuotationWorkspace $s) { return $this->json($s->index($r->user(), $r->all())); }
    public function history(Request $r, QuotationWorkspace $s) { return $this->json($s->history($r->user(), $r->all())); }
    public function options(Request $r, QuotationWorkspace $s) { return $this->json($s->options($r->user(), $r->all())); }
    public function detail(Request $r, QuotationWorkspace $s, int $id) { return $this->json($s->detail($r->user(), $id)); }
    public function version(Request $r, QuotationWorkspace $s, int $id, int $revision) { return $this->json($s->version($r->user(), $id, $revision)); }
    public function create(Request $r, QuotationWorkspace $s) { return $this->json($s->create($r->user(), $r->header('X-Request-ID', ''), $r->all())); }
    public function save(Request $r, QuotationWorkspace $s, int $id) { return $this->json($s->save($r->user(), $id, $r->header('X-Request-ID', ''), $r->all())); }
    public function reuse(Request $r, QuotationWorkspace $s, int $id) { return $this->json($s->reuse($r->user(), $id, $r->header('X-Request-ID', ''), $r->all())); }
    private function json(array $data) { return response()->json($data)->header('Cache-Control', 'private, no-store'); }
}
