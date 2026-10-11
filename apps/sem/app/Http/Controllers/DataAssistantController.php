<?php
namespace App\Http\Controllers;
use App\Services\CompanyData\DataAssistant;
use Illuminate\Http\Request;
class DataAssistantController extends Controller
{
    public function connection(Request $r, \App\Services\CompanyData\Assistant\PlanConnection $s) { return $this->json($s->change($r->user(), (string) $r->input('request_key'), (string) $r->input('action'))); }
    public function index(Request $r, DataAssistant $s) { return $this->json($s->listing($r->user(), $r->validate(['page' => 'nullable|integer|min:1', 'archived' => 'nullable|boolean']))); }
    public function show(Request $r, DataAssistant $s, int $id) { return $this->json($s->detail($r->user(), $id)); }
    public function ask(Request $r, DataAssistant $s) { return $this->json($s->ask($r->user(), (string) $r->input('request_key'), $r->except('request_key'))); }
    public function action(Request $r, DataAssistant $s, int $id, string $action) { return $this->json($s->action($r->user(), (string) $r->input('request_key'), $id, $action, $r->except('request_key'))); }
    private function json(array $data) { return response()->json($data)->header('Cache-Control', 'private, no-store'); }
}
