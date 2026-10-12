<?php
namespace App\Http\Controllers;

use App\Services\Organization\OrgDirectory;
use Illuminate\Http\Request;

class OrganizationController extends Controller
{
    public function page() { return view('organization.page'); }
    public function index(Request $r, OrgDirectory $s) { return $this->json($s->index($r->user())); }
    public function detail(Request $r, OrgDirectory $s, int $id) { return $this->json($s->detail($r->user(), $id)); }
    public function configuration(Request $r, OrgDirectory $s) { return $this->json($s->configuration($r->user())); }
    public function events(Request $r, OrgDirectory $s) { return $this->json($s->events($r->user())); }
    public function save(Request $r, OrgDirectory $s, string $kind, int $id) { return $this->json($s->save($r->user(), (string) $r->input('request_key', ''), $kind, $id, $r->except('request_key'))); }
    public function avatar(Request $r, OrgDirectory $s, int $id) { return $s->avatar($r->user(), $id); }
    public function upload(Request $r, OrgDirectory $s, int $id) { return $this->json($s->upload($r->user(), (string) $r->input('request_key', ''), $id, $r->except(['request_key', 'avatar']), $r->file('avatar'))); }
    private function json(array $data) { return response()->json($data)->header('Cache-Control', 'private, no-store'); }
}
