<?php

namespace App\Services\Presales;

use App\Jobs\ProcessPresalesRun;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PresalesService
{
    private function json(mixed $value): string { return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR); }
    private function decode(?string $value): mixed { return $value === null ? null : json_decode($value, true, 512, JSON_THROW_ON_ERROR); }
    public function manages(User $user, object $record): bool { return $user->hasRole('Admin') || (int) $record->owner_id === (int) $user->id; }
    public function allowed(User $user, object $record): bool
    {
        return $this->manages($user, $record) || DB::table('jn_inquiry_members')->where('inquiry_id', $record->id)->where('user_id', $user->id)->exists();
    }
    public function record(int $id, User $user, bool $manage = false, bool $lock = false): object
    {
        $query = DB::table('jn_inquiries')->where('id', $id);
        $row = ($lock ? $query->lockForUpdate() : $query)->first();
        abort_unless($row && ($manage ? $this->manages($user, $row) : $this->allowed($user, $row)), 404, '询价不存在或你没有访问权限。');
        return $row;
    }
    private function revision(object $row, int $revision): void { abort_if((int) $row->revision !== $revision, 409, '记录已更新，请刷新后核对，再提交本次修改。'); }
    private function event(int $id, ?int $actor, string $label, array $detail = []): void
    {
        DB::table('jn_presales_events')->insert(['inquiry_id' => $id, 'actor_id' => $actor, 'label' => $label, 'detail' => $this->json($detail), 'created_at' => now()]);
    }
    private function touch(object $record): void
    {
        DB::table('jn_inquiries')->where('id', $record->id)->update(['revision' => $record->revision + 1, 'updated_at' => now()]);
    }
    /** Serialize mutations, authorize even receipt replays, and commit result with its receipt. */
    private function mutate(?int $id, User $user, string $key, string $action, array $input, bool $manage, callable $callback): array
    {
        validator(['key' => $key], ['key' => 'required|uuid'], ['key.uuid' => '请求标识无效，请刷新后重试。'], ['key' => '请求标识'])->validate();
        return DB::transaction(function () use ($id, $user, $key, $action, $input, $manage, $callback) {
            DB::table('users')->where('id', $user->id)->lockForUpdate()->first();
            $record = $id ? $this->record($id, $user, $manage, true) : null;
            $fingerprint = hash('sha256', $this->json([$id, $action, $input]));
            $receipt = DB::table('jn_presales_receipts')->where('user_id', $user->id)->where('request_key', $key)->first();
            if ($receipt) {
                abort_unless(hash_equals($receipt->fingerprint, $fingerprint), 409, '同一请求标识不能用于不同内容，请重新提交。');
                return $this->decode($receipt->response);
            }
            $result = $callback($record);
            DB::table('jn_presales_receipts')->insert(['user_id' => $user->id, 'request_key' => $key, 'fingerprint' => $fingerprint, 'response' => $this->json($result), 'created_at' => now()]);
            return $result;
        });
    }
    public function listing(User $user, string $search, string $kind, int $page): array
    {
        $query = DB::table('jn_inquiries as i')->join('users as u', 'u.id', '=', 'i.owner_id');
        if (!$user->hasRole('Admin')) {
            $query->where(fn ($q) => $q->where('i.owner_id', $user->id)->orWhereExists(fn ($m) => $m->selectRaw('1')->from('jn_inquiry_members')->whereColumn('inquiry_id', 'i.id')->where('user_id', $user->id)));
        }
        if ($kind !== '') { $query->where('i.kind', $kind); }
        if ($search !== '') {
            $query->where(fn ($q) => $q->where('i.title', 'like', '%' . $search . '%')->orWhere('i.customer_name', 'like', '%' . $search . '%')->orWhere('i.code', 'like', '%' . $search . '%'));
        }
        $total = (clone $query)->count();
        $rows = $query->select('i.*', 'u.name as owner_name')->selectSub(fn ($q) => $q->from('jn_documents')->whereColumn('inquiry_id', 'i.id')->selectRaw('count(*)'), 'document_count')
            ->selectSub(fn ($q) => $q->from('jn_ai_runs')->whereColumn('inquiry_id', 'i.id')->where('state', 'review')->selectRaw('count(*)'), 'review_count')
            ->orderByDesc('i.updated_at')->orderByDesc('i.id')->offset(($page - 1) * 20)->limit(20)->get();
        return ['items' => $rows, 'total' => $total, 'page' => $page, 'per_page' => 20];
    }
    public function detail(int $id, User $user): array
    {
        $record = $this->record($id, $user);
        $documents = DB::table('jn_documents')->where('inquiry_id', $id)->orderByDesc('id')->get()->map(function ($document) {
            $versions = DB::table('jn_file_versions')->where('document_id', $document->id)->orderByDesc('version')->get(['id', 'version', 'filename', 'sha256', 'size', 'extension', 'created_at', 'uploaded_by']);
            return [...(array) $document, 'versions' => $versions];
        });
        $runs = DB::table('jn_ai_runs')->where('inquiry_id', $id)->orderByDesc('id')->limit(100)->get()->map(function ($run) use ($record) {
            return ['id' => $run->id, 'state' => $run->state, 'revision' => $run->revision, 'stale' => $run->revision !== $record->revision,
                'attempts' => $run->attempts, 'requested_by' => $run->requested_by, 'created_at' => $run->created_at,
                'finished_at' => $run->finished_at, 'error' => $run->error, 'output' => $this->decode($run->output), 'review' => $this->decode($run->review),
                'sources' => $this->decode($run->sources), 'provider' => $this->decode($run->provider_snapshot), 'metrics' => $this->decode($run->metrics)];
        });
        $events = DB::table('jn_presales_events as e')->leftJoin('users as u', 'u.id', '=', 'e.actor_id')->where('e.inquiry_id', $id)
            ->orderByDesc('e.id')->limit(100)->get(['e.id', 'e.label', 'e.detail', 'e.created_at', 'u.name as actor_name'])
            ->map(fn ($e) => [...(array) $e, 'detail' => $this->decode($e->detail)]);
        $members = DB::table('jn_inquiry_members as m')->join('users as u', 'u.id', '=', 'm.user_id')->where('m.inquiry_id', $id)->get(['u.id', 'u.name']);
        return ['record' => [...(array) $record, 'owner_name' => User::find($record->owner_id)?->name], 'can_manage' => $this->manages($user, $record),
            'documents' => $documents, 'runs' => $runs, 'events' => $events, 'members' => $members, 'actor_id' => $user->id,
            'company' => $record->company_id ? \App\Models\Companies\Companies::find($record->company_id, ['id', 'label', 'active']) : null,
            'quotes' => app(SalesHandoff::class)->links($id)];
    }
    private function fields(array $input, bool $creating): array
    {
        $rules = ['title' => 'required|string|max:160', 'kind' => 'required|in:cabinet,sheet_metal', 'customer_name' => 'nullable|string|max:140',
            'expected_date' => 'nullable|date_format:Y-m-d', 'requirements' => 'nullable|string|max:4000',
            'company_id' => ['nullable', 'integer', \Illuminate\Validation\Rule::exists('companies', 'id')->whereNull('deleted_at')->where('active', 1)->whereIn('statu_customer', [2, 3])]];
        $data = validator($input, $rules, [], ['title' => '询价名称', 'kind' => '业务类型', 'customer_name' => '客户名称', 'expected_date' => '期望交期', 'requirements' => '需求说明'])->validate();
        $data['customer_name'] = $data['customer_name'] ?? '';
        $data['expected_date'] = $data['expected_date'] ?? null;
        $data['requirements'] = $data['requirements'] ?? '';
        return $data;
    }
    public function quote(int $id, User $user, string $key, array $input): array
    {
        return $this->mutate($id, $user, $key, 'quote', $input, true, function ($record) use ($user, $input, $id) {
            $result = app(SalesHandoff::class)->create($record, $user, $input);
            if (!$result['reused']) { $this->event($id, $user->id, '确认报价依据并生成草稿', ['quote_id' => $result['quote_id'], 'revision' => $record->revision, 'note' => trim($input['note'])]); }
            return $result;
        });
    }
    public function create(User $user, string $key, array $input): array
    {
        $data = $this->fields($input, true);
        return $this->mutate(null, $user, $key, 'create', $data, false, function () use ($data, $user) {
            $id = DB::table('jn_inquiries')->insertGetId([...$data, 'code' => 'JN-' . strtoupper((string) Str::ulid()), 'owner_id' => $user->id, 'revision' => 1, 'created_at' => now(), 'updated_at' => now()]);
            $this->event($id, $user->id, '创建询价', ['kind' => $data['kind']]);
            return ['id' => $id];
        });
    }
    public function update(int $id, User $user, string $key, array $input): array
    {
        $data = $this->fields($input, false); $revision = (int) ($input['revision'] ?? 0);
        return $this->mutate($id, $user, $key, 'update', [$data, $revision], true, function ($record) use ($data, $revision, $user, $id) {
            $this->revision($record, $revision);
            $before = array_intersect_key((array) $record, $data);
            DB::table('jn_inquiries')->where('id', $id)->update($data); $this->touch($record);
            $this->event($id, $user->id, '修改询价', ['before' => $before, 'after' => $data]);
            return ['id' => $id, 'revision' => $revision + 1];
        });
    }
    public function members(int $id, User $user, string $key, array $input): array
    {
        $ids = validator($input, ['user_ids' => 'present|array|max:20', 'user_ids.*' => 'integer|distinct|exists:users,id'], [], ['user_ids' => '协作者', 'user_ids.*' => '协作者'])->validate()['user_ids'];
        $ids = array_map('intval', $ids); sort($ids);
        return $this->mutate($id, $user, $key, 'members', [$ids, $input['revision'] ?? 0], true, function ($record) use ($ids, $id, $user, $input) {
            $this->revision($record, (int) ($input['revision'] ?? 0));
            foreach (User::whereIn('id', $ids)->get() as $member) { abort_unless($member->roles()->exists(), 422, '协作者需要先分配系统角色。'); }
            $before = DB::table('jn_inquiry_members')->where('inquiry_id', $id)->pluck('user_id')->all();
            DB::table('jn_inquiry_members')->where('inquiry_id', $id)->delete();
            foreach (array_diff($ids, [$record->owner_id]) as $uid) { DB::table('jn_inquiry_members')->insert(['inquiry_id' => $id, 'user_id' => $uid]); }
            $this->touch($record); $this->event($id, $user->id, '调整协作者', ['before' => $before, 'after' => $ids]);
            return ['id' => $id];
        });
    }
    public function upload(int $id, User $user, string $key, array $input, UploadedFile $file): array
    {
        $this->record($id, $user);
        $extension = strtolower($file->getClientOriginalExtension());
        abort_unless(in_array($extension, ['txt', 'csv', 'pdf', 'png', 'jpg', 'jpeg', 'xlsx', 'docx', 'dxf', 'step', 'stp']), 422, '请上传文本、表格、文档、图片或工程图文件。');
        abort_if($file->getSize() > 25 * 1024 * 1024, 422, '单个文件不能超过 25 MB。');
        $name = preg_replace('/[\\\\\/\x00-\x1F\x7F]/u', '_', $file->getClientOriginalName());
        abort_if(mb_strlen($name) > 200, 422, '文件名不能超过 200 个字符。');
        $hash = hash_file('sha256', $file->getRealPath()); $stored = null;
        try {
            return $this->mutate($id, $user, $key, 'upload', [$input, $name, $hash], false, function ($record) use ($input, $id, $user, $file, $extension, $name, $hash, &$stored) {
                $this->revision($record, (int) ($input['revision'] ?? 0));
                $did = (int) ($input['document_id'] ?? 0);
                if ($did) { abort_unless(DB::table('jn_documents')->where('id', $did)->where('inquiry_id', $id)->exists(), 404, '资料不存在。'); }
                else { $did = DB::table('jn_documents')->insertGetId(['inquiry_id' => $id, 'name' => $name, 'created_at' => now()]); }
                $version = (int) DB::table('jn_file_versions')->where('document_id', $did)->max('version') + 1;
                $stored = $file->storeAs('private/presales/' . $id, Str::uuid() . '.' . $extension, 'local');
                abort_unless($stored, 500, '文件未保存，请重试。');
                $vid = DB::table('jn_file_versions')->insertGetId(['document_id' => $did, 'version' => $version, 'filename' => $name, 'path' => $stored,
                    'sha256' => $hash, 'size' => $file->getSize(), 'extension' => $extension, 'uploaded_by' => $user->id, 'created_at' => now()]);
                $this->touch($record); $this->event($id, $user->id, '上传资料', ['document_id' => $did, 'version_id' => $vid, 'filename' => $name, 'version' => $version, 'sha256' => $hash]);
                return ['id' => $id, 'version_id' => $vid, 'document_id' => $did];
            });
        } catch (\Throwable $e) { if ($stored) { Storage::disk('local')->delete($stored); } throw $e; }
    }
    public function version(int $id, int $vid, User $user): object
    {
        $this->record($id, $user);
        $row = DB::table('jn_file_versions as v')->join('jn_documents as d', 'd.id', '=', 'v.document_id')->where('d.inquiry_id', $id)->where('v.id', $vid)->select('v.*')->first();
        abort_unless($row, 404, '资料版本不存在。'); return $row;
    }
    private function source(object $version): array
    {
        abort_unless(in_array($version->extension, ['txt', 'csv']), 422, '模拟提取只支持带固定标签的 UTF-8 文本或 CSV，其他格式保留为原件。');
        abort_if($version->size > 200000, 422, '模拟提取的每份文本不能超过 200 KB。');
        $raw = Storage::disk('local')->get($version->path);
        abort_unless(is_string($raw) && hash_equals($version->sha256, hash('sha256', $raw)), 409, '原件校验未通过，请检查资料后重试。');
        abort_unless(mb_check_encoding($raw, 'UTF-8'), 422, '请将文本保存为 UTF-8 编码后重新上传。');
        $text = str_replace(["\r\n", "\r"], "\n", preg_replace('/^\xEF\xBB\xBF/', '', $raw));
        abort_if(mb_strlen($text) > 40000 || str_contains($text, "\0"), 422, '文本内容超出模拟解析范围。');
        foreach (explode("\n", $text) as $line) { abort_if(mb_strlen($line) > 5000, 422, '文本单行不能超过 5000 个字符。'); }
        return ['version_id' => $version->id, 'document_id' => $version->document_id, 'version' => $version->version, 'filename' => $version->filename, 'sha256' => $version->sha256, 'text' => $text];
    }
    public function start(int $id, User $user, string $key, array $input): array
    {
        $ids = validator($input, ['version_ids' => 'required|array|min:1|max:5', 'version_ids.*' => 'integer|distinct'], [], ['version_ids' => '资料版本', 'version_ids.*' => '资料版本'])->validate()['version_ids'];
        $ids = array_map('intval', $ids); sort($ids); $revision = (int) ($input['revision'] ?? 0);
        return $this->mutate($id, $user, $key, 'start', [$ids, $revision], false, function ($record) use ($id, $user, $ids, $revision) {
            $this->revision($record, $revision); $sources = []; $docs = [];
            foreach ($ids as $vid) {
                $version = $this->version($id, $vid, $user);
                abort_if(in_array($version->document_id, $docs), 422, '同一资料只能选择一个当前版本。'); $docs[] = $version->document_id;
                abort_unless((int) DB::table('jn_file_versions')->where('document_id', $version->document_id)->max('version') === $version->version, 409, '资料已有新版本，请重新选择。');
                $sources[] = $this->source($version);
            }
            $identity = app(ExtractionGateway::class)->provider()->identity();
            $hash = hash('sha256', $this->json([$revision, $identity, array_map(fn ($s) => [$s['version_id'], $s['sha256']], $sources)]));
            $old = DB::table('jn_ai_runs')->where('inquiry_id', $id)->where('input_hash', $hash)->first();
            if ($old) { return ['id' => $id, 'run_id' => $old->id, 'reused' => true]; }
            $rid = DB::table('jn_ai_runs')->insertGetId(['inquiry_id' => $id, 'requested_by' => $user->id, 'input_hash' => $hash, 'revision' => $revision,
                'state' => 'queued', 'sources' => $this->json($sources), 'provider_snapshot' => $this->json($identity), 'created_at' => now(), 'updated_at' => now()]);
            $this->event($id, $user->id, '开始模拟提取', ['run_id' => $rid, 'version_ids' => $ids]);
            DB::afterCommit(fn () => $this->dispatch($rid));
            return ['id' => $id, 'run_id' => $rid, 'reused' => false];
        });
    }
    public function dispatch(int $id): void
    {
        try { ProcessPresalesRun::dispatch($id); DB::table('jn_ai_runs')->where('id', $id)->update(['dispatched_at' => now()]); }
        catch (\Throwable $e) { report($e); } // Durable queued row is recovered by the scheduler.
    }
    public function execute(int $id): void
    {
        $token = (string) Str::uuid();
        $run = DB::transaction(function () use ($id, $token) {
            $run = DB::table('jn_ai_runs')->where('id', $id)->lockForUpdate()->first();
            if (!$run || $run->state !== 'queued' || $run->attempts >= 3) { return null; }
            DB::table('jn_ai_runs')->where('id', $id)->update(['state' => 'running', 'attempts' => $run->attempts + 1, 'execution_token' => $token, 'started_at' => now(), 'updated_at' => now()]);
            return $run;
        });
        if (!$run) { return; }
        $started = hrtime(true); $output = null;
        try {
            $user = User::find($run->requested_by); $record = DB::table('jn_inquiries')->where('id', $run->inquiry_id)->first();
            if (!$user || !$record || !$this->allowed($user, $record)) { throw new \RuntimeException('发起人已失去资料访问权限，本次处理已停止。'); }
            $sources = $this->decode($run->sources);
            foreach ($sources as $source) {
                $version = $this->version($run->inquiry_id, $source['version_id'], $user);
                if ($this->source($version) !== $source) { throw new \RuntimeException('来源资料校验失败，请检查原件。'); }
            }
            $gateway = app(ExtractionGateway::class);
            $identity = $this->decode($run->provider_snapshot) ?? app(SimulatedExtractor::class)->identity();
            $output = $gateway->extract($gateway->provider($identity), $sources);
            $changes = ['state' => 'review', 'output' => $this->json($output), 'error' => null];
        } catch (\Throwable $e) { report($e); $changes = ['state' => 'failed', 'error' => '处理未完成，请核对资料、访问权限与提取服务配置后重试。']; }
        $changes['metrics'] = $this->json(['duration_ms' => (int) round((hrtime(true) - $started) / 1000000), 'attempt' => $run->attempts + 1, 'usage' => $output['usage'] ?? null]);
        DB::table('jn_ai_runs')->where('id', $id)->where('state', 'running')->where('execution_token', $token)
            ->update([...$changes, 'finished_at' => now(), 'updated_at' => now()]);
    }
    public function review(int $id, int $rid, User $user, string $key, array $input): array
    {
        $input['note'] = is_string($input['note'] ?? null) ? trim($input['note']) : ($input['note'] ?? null);
        $data = validator($input, ['decision' => 'required|in:accept,reject', 'note' => 'required|string|max:1000', 'fields' => 'present|array|max:3'], [], ['note' => '审核说明', 'decision' => '审核决定', 'fields' => '候选字段'])->validate();
        return $this->mutate($id, $user, $key, 'review', [$rid, $data], true, function ($record) use ($id, $rid, $user, $data) {
            $run = DB::table('jn_ai_runs')->where('id', $rid)->where('inquiry_id', $id)->lockForUpdate()->first();
            abort_unless($run && $run->state === 'review', 409, '该运行已处理或尚未到待审核状态，请刷新查看。');
            $changes = []; $before = []; $output = $this->decode($run->output);
            if ($data['decision'] === 'accept') {
                $this->revision($record, $run->revision);
                abort_if(!$data['fields'], 422, '请至少选择一个候选字段。');
                foreach ($data['fields'] as $field => $value) {
                    abort_unless(isset($output['candidates'][$field]) && SimulatedExtractor::validValue($field, $value), 422, '只能确认有效的候选字段，日期请使用年-月-日格式。');
                    $changes[$field] = $value; $before[$field] = $record->{$field};
                }
                // Check immutable original bytes again at the business-write boundary.
                foreach ($this->decode($run->sources) as $source) { abort_unless($this->source($this->version($id, $source['version_id'], $user)) === $source, 409, '来源校验失败，不能确认。'); }
                DB::table('jn_inquiries')->where('id', $id)->update($changes); $this->touch($record);
            } else { abort_if($data['fields'], 422, '驳回时不能同时提交字段修改。'); }
            $review = ['decision' => $data['decision'], 'note' => trim($data['note']), 'reviewer_id' => $user->id, 'reviewer_name' => $user->name,
                'reviewed_at' => now()->toIso8601String(), 'before' => $before, 'after' => $changes, 'base_revision' => $record->revision];
            DB::table('jn_ai_runs')->where('id', $rid)->update(['state' => $data['decision'] === 'accept' ? 'accepted' : 'rejected', 'review' => $this->json($review), 'updated_at' => now()]);
            $this->event($id, $user->id, $data['decision'] === 'accept' ? '确认候选并更新询价' : '驳回候选', ['run_id' => $rid, ...$review]);
            return ['id' => $id, 'run_id' => $rid, 'review' => $review];
        });
    }
    public function control(int $id, int $rid, User $user, string $key, string $action): array
    {
        return $this->mutate($id, $user, $key, $action, [$rid], false, function ($record) use ($id, $rid, $user, $action) {
            $run = DB::table('jn_ai_runs')->where('id', $rid)->where('inquiry_id', $id)->lockForUpdate()->first();
            abort_unless($run && ($this->manages($user, $record) || $run->requested_by === $user->id), 404, '运行不存在或没有操作权限。');
            if ($action === 'retry') {
                abort_unless($run->state === 'failed' && $run->attempts < 3, 409, '该运行当前不能重试。'); $this->revision($record, $run->revision);
                DB::table('jn_ai_runs')->where('id', $rid)->update(['state' => 'queued', 'execution_token' => null, 'error' => null, 'dispatched_at' => null, 'updated_at' => now()]);
                DB::afterCommit(fn () => $this->dispatch($rid));
            } else {
                abort_unless(in_array($run->state, ['queued', 'running', 'review', 'failed']), 409, '该运行已经结束。');
                DB::table('jn_ai_runs')->where('id', $rid)->update(['state' => 'cancelled', 'execution_token' => null, 'updated_at' => now()]);
            }
            $this->event($id, $user->id, $action === 'retry' ? '重试模拟处理' : '取消模拟处理', ['run_id' => $rid]);
            return ['id' => $id, 'run_id' => $rid];
        });
    }
    public function recover(): int
    {
        $ids = DB::table('jn_ai_runs')->where(fn ($q) => $q->where('state', 'queued')->orWhere(fn ($r) => $r->where('state', 'running')->where('started_at', '<', now()->subMinutes(2))))->orderBy('id')->limit(100)->pluck('id');
        $count = 0;
        foreach ($ids as $id) {
            $dispatch = DB::transaction(function () use ($id) {
                $row = DB::table('jn_ai_runs')->where('id', $id)->lockForUpdate()->first();
                if (!$row || !in_array($row->state, ['queued', 'running'])) { return false; }
                if ($row->state === 'running' && $row->started_at >= now()->subMinutes(2)->toDateTimeString()) { return false; }
                if ($row->state === 'queued' && $row->dispatched_at && $row->dispatched_at > now()->subMinute()->toDateTimeString()) { return false; }
                $failed = $row->attempts >= 3;
                DB::table('jn_ai_runs')->where('id', $id)->update(['state' => $failed ? 'failed' : 'queued', 'execution_token' => null,
                    'error' => $failed ? '模拟处理达到三次尝试，请检查环境后重新准备资料。' : null, 'dispatched_at' => now(), 'updated_at' => now()]);
                return !$failed;
            });
            if ($dispatch) { $this->dispatch($id); $count++; }
        }
        return $count;
    }
}
