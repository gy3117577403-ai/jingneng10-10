<?php

namespace App\Services\CompanyData;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class DataRecords
{
    public function __construct(private DataSupport $support) {}
    public function listing(User $user, array $p): array
    {
        abort_unless(DataSupport::active($user), 403); $a = new DataAccess(); $rows = []; $visibleCats = [];
        $q = mb_strtolower(trim($p['q'] ?? ''));
        foreach (DB::table('jn_data_records')->orderByDesc('updated_at')->orderByDesc('id')->cursor() as $r) {
            $v = $a->visibleVersion($user, $r); if (!$v) continue; $visibleCats[$r->category_id] = true;
            if (!empty($p['category']) && (int) $p['category'] !== (int) $r->category_id) continue;
            if ((bool) ($p['archived'] ?? false) !== (bool) $r->archived) continue;
            $readable = $a->canVersion($user, $r, $v);
            if ($q !== '' && !str_contains(mb_strtolower($r->code . ' ' . $v->title . ($readable ? ' ' . $v->values : '')), $q)) continue;
            if (!empty($p['state']) && $p['state'] !== $v->state) continue;
            $rows[] = ['id' => $r->id, 'code' => $r->code, 'kind' => $r->kind, 'category_id' => $r->category_id, 'title' => $v->title, 'version' => $v->number, 'state' => $v->state,
                'readable' => $readable, 'archived' => (bool) $r->archived, 'updated_at' => $r->updated_at];
        }
        $cats = DB::table('jn_data_categories')->orderBy('position')->orderBy('id')->get()->keyBy('id');
        foreach ($cats as $c) if ($a->can($user, 'discover', $c) || $a->can($user, 'create', $c)) $visibleCats[$c->id] = true;
        foreach (array_keys($visibleCats) as $id) { $parent = $cats[$id]->parent_id; while ($parent) { $visibleCats[$parent] = true; $parent = $cats[$parent]->parent_id; } }
        $total = count($rows); $pages = max(1, (int) ceil($total / 30)); $page = min($pages, max(1, (int) ($p['page'] ?? 1)));
        return ['items' => array_slice($rows, ($page - 1) * 30, 30), 'total' => $total, 'page' => $page, 'pages' => $pages,
            'categories' => $cats->filter(fn ($c) => isset($visibleCats[$c->id]))->map(fn ($c) => ['id' => $c->id, 'name' => $c->name, 'parent_id' => $c->parent_id, 'revision' => $c->revision,
                'fields' => $a->can($user, 'view', $c) ? DataSupport::decode($c->fields) : [], 'abilities' => $a->abilities($user, $c)])->values()->all(),
            'manager' => DataSupport::manager($user), 'user_id' => $user->id, 'users' => DataSupport::users()];
    }
    public function detail(User $user, int $id, ?int $versionId = null): array
    {
        $a = new DataAccess(); $r = $a->record($id); $v = $a->visibleVersion($user, $r); abort_unless($v, 403, '当前无权查看这份资料。');
        if ($versionId) { $v = $a->version($versionId); abort_unless($a->canVersion($user, $r, $v), 403, '当前无权查看此版本。'); }
        $readable = $a->canVersion($user, $r, $v); $versions = [];
        foreach (DB::table('jn_data_versions')->where('record_id', $id)->orderByDesc('number')->get() as $item) if ($a->canVersion($user, $r, $item)) $versions[] = ['id' => $item->id, 'number' => $item->number, 'state' => $item->state, 'title' => $item->title, 'note' => $item->note, 'created_at' => $item->created_at, 'published_at' => $item->published_at];
        $visibleIds = array_column($versions, 'id');
        $events = DB::table('jn_data_events')->where('scope_type', 'record')->where('scope_id', $id)->where(fn ($q) => $q->whereNull('version_id')->orWhereIn('version_id', $visibleIds))->orderByDesc('id')->limit(100)->get()->map(fn ($e) => ['id' => $e->id, 'label' => $e->label, 'note' => DataSupport::decode($e->detail)['note'] ?? DataSupport::decode($e->detail)['result'] ?? null, 'actor' => User::withTrashed()->find($e->actor_id)?->name ?? '已停用人员', 'created_at' => $e->created_at])->all();
        $eligible = fn ($action) => collect(DataSupport::users())->filter(fn ($u) => $a->can(DataSupport::user($u['id']), $action, $r))->values()->all();
        return ['record' => ['id' => $r->id, 'category_id' => $r->category_id, 'category' => $a->category($r->category_id)->name, 'code' => $r->code, 'kind' => $r->kind, 'revision' => $r->revision, 'archived' => (bool) $r->archived, 'policy_mode' => $r->policy_mode,
                'draft_version_id' => $a->draft($user, $r) ? $r->draft_version_id : null, 'published_version_id' => $r->published_version_id, 'owner_id' => $r->owner_id],
            'version' => $readable ? [...(array) $v, 'values' => DataSupport::decode($v->values), 'fields' => DataSupport::decode($v->fields), 'file_ids' => DataSupport::decode($v->file_ids)] : ['id' => $v->id, 'title' => $v->title, 'number' => $v->number, 'state' => $v->state],
            'readable' => $readable, 'borrowed' => $readable && !$a->can($user, 'view', $r, false), 'abilities' => $a->abilities($user, $r), 'permissions' => $a->explain($user, $r), 'versions' => $versions,
            'edit_fields' => $a->can($user, 'edit', $r) ? DataSupport::decode($a->category($r->category_id)->fields) : [],
            'files' => $readable ? DB::table('jn_data_files')->whereIn('id', DataSupport::decode($v->file_ids))->get(['id', 'filename', 'extension', 'mime', 'size', 'sha256'])->all() : [],
            'comments' => $readable ? DB::table('jn_data_comments')->join('users', 'users.id', '=', 'actor_id')->where('record_id', $id)->where('version_id', $v->id)->orderBy('jn_data_comments.id')->get(['jn_data_comments.id', 'body', 'users.name as actor', 'jn_data_comments.created_at'])->all() : [],
            'events' => $readable ? $events : [], 'reviewers' => $a->can($user, 'submit', $r) ? $eligible('review') : [], 'approvers' => $a->can($user, 'request', $r) ? $eligible('access') : [],
            'collaborators' => $a->can($user, 'collaborate', $r) ? collect($eligible('collaborate'))->filter(fn ($u) => $a->canVersion(DataSupport::user($u['id']), $r, $v))->values()->all() : []];
    }
    public function newVersion(User $user, object $r, array $p, array $fileIds = []): int
    {
        $cat = DB::table('jn_data_categories')->where('id', $r->category_id)->firstOrFail(); $fields = DataSupport::decode($cat->fields);
        validator($p, ['title' => 'required|string|max:180', 'values' => 'present|array', 'note' => 'required|string|max:2000'])->validate();
        $values = DataSchema::values($p['values'], $fields);
        $id = DB::table('jn_data_versions')->insertGetId(['record_id' => $r->id, 'number' => (int) DB::table('jn_data_versions')->where('record_id', $r->id)->max('number') + 1,
            'title' => trim($p['title']), 'values' => DataSupport::json($values), 'fields' => DataSupport::json($fields), 'schema_version' => $cat->schema_version, 'file_ids' => DataSupport::json($fileIds), 'state' => 'draft', 'note' => trim($p['note']), 'created_by' => $user->id, 'created_at' => now()]);
        if ($r->draft_version_id) DB::table('jn_data_versions')->where('id', $r->draft_version_id)->where('state', 'draft')->update(['state' => 'superseded']);
        DB::table('jn_data_records')->where('id', $r->id)->update(['draft_version_id' => $id, 'revision' => $r->revision + 1, 'updated_at' => now()]);
        $this->support->event($user, 'record', $r->id, '保存新草稿版本', [], $id); return $id;
    }
    public function create(User $user, int $category, array $p): int
    {
        validator($p, ['code' => 'required|string|max:80', 'kind' => 'required|in:file,ledger'])->validate();
        abort_if(DB::table('jn_data_records')->where('category_id', $category)->where('code', trim($p['code']))->exists(), 422, '该分类中已存在相同编号，请打开原资料修订或换一个编号。');
        $id = DB::table('jn_data_records')->insertGetId(['category_id' => $category, 'code' => trim($p['code']), 'kind' => $p['kind'], 'owner_id' => $user->id, 'created_at' => now(), 'updated_at' => now()]);
        $this->newVersion($user, DB::table('jn_data_records')->where('id', $id)->first(), $p); return $id;
    }
    public function save(User $user, string $key, string $action, int $id, array $p): array
    {
        $required = ['create' => 'create', 'save' => 'edit', 'submit' => 'submit', 'approve' => 'review', 'reject' => 'review', 'withdraw' => 'submit', 'archive' => 'archive', 'restore' => 'archive'];
        abort_unless(isset($required[$action]), 404);
        return $this->support->mutate($user, $key, "record:$action:$id", $p, function (DataAccess $a) use ($user, $action, $id, $required) {
            $target = $action === 'create' ? $a->category($id) : $a->record($id);
            abort_unless($a->can($user, $required[$action], $target) && $a->can($user, 'view', $target, false), 403, '当前没有此操作权限。');
        }, function (DataAccess $a) use ($user, $action, $id, $p) {
            if ($action === 'create') { DataSupport::revision($a->category($id), $p['category_revision'] ?? 0); return ['id' => $this->create($user, $id, $p)]; }
            $r = $a->record($id); DataSupport::revision($r, $p['revision'] ?? 0);
            if (in_array($action, ['archive', 'restore'], true)) {
                abort_unless($action === 'archive' ? !$r->archived : $r->archived, 409, '资料状态已经变化。');
                if ($r->draft_version_id) abort_if($a->version($r->draft_version_id)->state === 'pending', 422, '请先处理或撤回待审核版本。');
                DB::table('jn_data_records')->where('id', $id)->update(['archived' => $action === 'archive', 'revision' => $r->revision + 1, 'updated_at' => now()]);
                $this->support->event($user, 'record', $id, $action === 'archive' ? '归档资料' : '恢复资料'); return ['id' => $id];
            }
            abort_if($r->archived, 422, '已归档资料需要先恢复。');
            $v = $r->draft_version_id ? $a->version($r->draft_version_id) : ($r->published_version_id ? $a->version($r->published_version_id) : null);
            if ($action === 'save') {
                abort_if($v?->state === 'pending', 422, '待审核版本不能编辑，请先撤回。');
                validator($p, ['file_ids' => 'present|array|max:20', 'file_ids.*' => 'integer'])->validate();
                foreach ($p['file_ids'] as $file) abort_unless(DB::table('jn_data_files')->where('record_id', $id)->where('id', $file)->exists(), 422, '附件不属于当前资料。');
                $this->newVersion($user, $r, $p, array_values(array_unique($p['file_ids']))); return ['id' => $id];
            }
            abort_unless($r->draft_version_id && $v, 422, '当前没有待处理草稿。');
            validator($p, ['note' => 'required|string|max:2000'])->validate();
            $changes = [];
            if ($action === 'submit') {
                abort_unless(in_array($v->state, ['draft', 'rejected', 'withdrawn'], true), 409, '当前版本不能提交。');
                // Published evidence must satisfy the current category schema at submission time.
                abort_unless((int) $v->schema_version === (int) $a->category($r->category_id)->schema_version, 409, '字段配置已更新，请先修订并保存草稿。');
                DataSchema::values(DataSupport::decode($v->values), DataSupport::decode($v->fields));
                abort_if($r->kind === 'file' && !DataSupport::decode($v->file_ids), 422, '文件资料至少需要一份附件。');
                $reviewer = DataSupport::user((int) ($p['reviewer_id'] ?? 0));
                abort_if($reviewer->id === $user->id, 422, '请指定另一位有审核权限的人员。');
                abort_unless($a->can($reviewer, 'review', $r), 422, '所选审核人当前没有审核权限。');
                $changes = ['state' => 'pending', 'reviewer_id' => $reviewer->id, 'submitted_by' => $user->id, 'submitted_at' => now(), 'decision_note' => null, 'decided_at' => null];
            } else {
                abort_unless($v->state === 'pending', 409, '该审核已经处理或撤回。');
                if ($action === 'withdraw') abort_unless((int) $v->submitted_by === (int) $user->id, 403, '只有提交人可以撤回。');
                else abort_unless((int) $v->reviewer_id === (int) $user->id && (int) $v->submitted_by !== (int) $user->id, 403, '需要指定审核人处理。');
                $changes = ['state' => ['approve' => 'published', 'reject' => 'rejected', 'withdraw' => 'withdrawn'][$action], 'decision_note' => $p['note'], 'decided_at' => now()];
                if ($action === 'approve') {
                    abort_unless((int) $v->schema_version === (int) $a->category($r->category_id)->schema_version, 409, '字段配置已变化，请退回修订后重新提交。');
                    $changes['published_at'] = now();
                }
            }
            DB::table('jn_data_versions')->where('id', $v->id)->update($changes);
            $update = ['revision' => $r->revision + 1, 'updated_at' => now()];
            if ($action === 'approve') $update += ['published_version_id' => $v->id, 'draft_version_id' => null];
            DB::table('jn_data_records')->where('id', $id)->update($update);
            $this->support->event($user, 'record', $id, ['submit' => '提交审核', 'approve' => '审核通过并发布', 'reject' => '退回修订', 'withdraw' => '撤回审核'][$action], ['note' => $p['note']], $v->id);
            return ['id' => $id];
        });
    }
}
