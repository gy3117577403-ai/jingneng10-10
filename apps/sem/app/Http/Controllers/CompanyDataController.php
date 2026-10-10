<?php
namespace App\Http\Controllers;
use App\Services\CompanyData\{DataSupport, DataCatalog, DataRecords, DataCollaboration, DataFiles, DataImports, DataDocuments, DataSearch};
use Illuminate\Http\Request;
class CompanyDataController extends Controller
{
    public function page() { return view('company-data.page'); }
    public function index(Request $r, DataRecords $s) { return $this->json($s->listing($r->user(), $r->validate(['q' => 'nullable|string|max:200', 'category' => 'nullable|integer', 'state' => 'nullable|in:draft,pending,published,rejected,withdrawn', 'archived' => 'nullable|boolean', 'page' => 'nullable|integer|min:1']))); }
    public function detail(Request $r, DataRecords $s, int $id) { return $this->json($s->detail($r->user(), $id, $r->integer('version') ?: null)); }
    public function configuration(Request $r, DataCatalog $s) { return $this->json($s->configuration($r->user())); }
    public function catalog(Request $r, DataCatalog $s, string $kind, int $id) { return $this->json($s->save($r->user(), $this->key($r), $kind, $id, $r->except('request_key'))); }
    public function record(Request $r, DataRecords $s, int $id, string $action) { return $this->json($s->save($r->user(), $this->key($r), $action, $id, $r->except('request_key'))); }
    public function collaboration(Request $r, DataCollaboration $s) { return $this->json(['items' => $s->items($r->user()), 'users' => DataSupport::users()]); }
    public function collaborate(Request $r, DataCollaboration $s, int $id, string $action) { return $this->json($s->save($r->user(), $this->key($r), $action, $id, $r->except('request_key'))); }
    public function upload(Request $r, DataFiles $s, int $id) { $r->validate(['file' => 'required|file']); return $this->json($s->upload($r->user(), $this->key($r), $id, $r->except(['request_key', 'file']), $r->file('file'))); }
    public function file(Request $r, DataFiles $s, int $id, int $version, int $file) { return $s->serve($r->user(), $id, $version, $file, $r->boolean('download'), $r->integer('page', 1), $r->integer('row', 1)); }
    public function search(Request $r, DataSearch $s) { return $this->json($s->search($r->user(), $r->validate(['q' => 'nullable|string|max:200', 'category' => 'nullable|integer', 'history' => 'nullable|boolean', 'page' => 'nullable|integer|min:1']))); }
    public function retryDocument(Request $r, DataDocuments $s, int $id, int $version, int $file) { return $this->json($s->retry($r->user(), $this->key($r), $id, $version, $file)); }
    public function imports(Request $r, DataImports $s) { return $this->json(['items' => $s->get($r->user())]); }
    public function batch(Request $r, DataImports $s, int $id) { return $this->json($s->get($r->user(), $id)); }
    public function stage(Request $r, DataImports $s, int $id) { $r->validate(['file' => 'required|file']); return $this->json($s->stage($r->user(), $this->key($r), $id, $r->file('file'))); }
    public function importAction(Request $r, DataImports $s, int $id) { return $this->json($s->action($r->user(), $this->key($r), $id, $r->except('request_key'))); }
    public function export(Request $r, DataImports $s, int $id) { return $s->export($r->user(), $id, $r->boolean('template')); }
    private function key(Request $r): string { return (string) $r->input('request_key', ''); }
    private function json(array $data) { return response()->json($data)->header('Cache-Control', 'private, no-store'); }
}
