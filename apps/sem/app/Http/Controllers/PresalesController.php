<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Presales\PresalesService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PresalesController extends Controller
{
    public function __construct(private PresalesService $service) {}
    private function key(Request $request): string { return (string) $request->header('X-Request-ID', ''); }
    public function page(Request $r, ?int $inquiry = null)
    {
        if ($inquiry) { $this->service->record($inquiry, $r->user()); }
        return response()->view('presales.workspace', ['initialId' => $inquiry, 'userName' => $r->user()->name])->header('Cache-Control', 'no-store');
    }
    public function index(Request $r)
    {
        $data = $r->validate(['q' => 'nullable|string|max:160', 'kind' => 'nullable|in:cabinet,sheet_metal', 'page' => 'nullable|integer|min:1'], [], ['q' => '搜索内容', 'kind' => '业务类型', 'page' => '页码']);
        return response()->json($this->service->listing($r->user(), $data['q'] ?? '', $data['kind'] ?? '', $data['page'] ?? 1))->header('Cache-Control', 'no-store');
    }
    public function create(Request $r) { return response()->json($this->service->create($r->user(), $this->key($r), $r->all())); }
    public function show(Request $r, int $inquiry) { return response()->json($this->service->detail($inquiry, $r->user()))->header('Cache-Control', 'no-store'); }
    public function update(Request $r, int $inquiry) { return response()->json($this->service->update($inquiry, $r->user(), $this->key($r), $r->all())); }
    public function members(Request $r, int $inquiry) { return response()->json($this->service->members($inquiry, $r->user(), $this->key($r), $r->all())); }
    public function users(Request $r, int $inquiry)
    {
        $this->service->record($inquiry, $r->user(), true);
        return response()->json(User::whereHas('roles')->orderBy('name')->limit(200)->get(['id', 'name']))->header('Cache-Control', 'no-store');
    }
    public function upload(Request $r, int $inquiry)
    {
        $r->validate(['file' => 'required|file|max:25600', 'revision' => 'required|integer|min:1', 'document_id' => 'nullable|integer|min:1'], [], ['file' => '资料文件', 'revision' => '记录版本', 'document_id' => '资料']);
        return response()->json($this->service->upload($inquiry, $r->user(), $this->key($r), $r->only('revision', 'document_id'), $r->file('file')));
    }
    public function download(Request $r, int $inquiry, int $version)
    {
        $v = $this->service->version($inquiry, $version, $r->user());
        $path = Storage::disk('local')->path($v->path);
        abort_unless(is_file($path) && hash_equals($v->sha256, hash_file('sha256', $path)), 409, '原件校验未通过，请联系负责人。');
        return response()->download($path, $v->filename, ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }
    public function start(Request $r, int $inquiry) { return response()->json($this->service->start($inquiry, $r->user(), $this->key($r), $r->all())); }
    public function review(Request $r, int $inquiry, int $run) { return response()->json($this->service->review($inquiry, $run, $r->user(), $this->key($r), $r->all())); }
    public function retry(Request $r, int $inquiry, int $run) { return response()->json($this->service->control($inquiry, $run, $r->user(), $this->key($r), 'retry')); }
    public function cancel(Request $r, int $inquiry, int $run) { return response()->json($this->service->control($inquiry, $run, $r->user(), $this->key($r), 'cancel')); }
    public function example(Request $r, string $kind)
    {
        abort_unless(in_array($kind, ['cabinet', 'sheet_metal']), 404);
        $label = $kind === 'cabinet' ? '成套' : '钣金';
        return response("客户名称：虚构客户 · {$label}\n期望交期：2026-12-20\n需求说明：{$label}演示需求，参数待技术核对，不用于生产。\n", 200,
            ['Content-Type' => 'text/plain; charset=utf-8', 'Content-Disposition' => "attachment; filename=presales-{$kind}-demo.txt", 'Cache-Control' => 'no-store']);
    }
}
