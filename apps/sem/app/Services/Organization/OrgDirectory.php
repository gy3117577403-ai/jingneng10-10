<?php

namespace App\Services\Organization;

use App\Models\User;
use App\Services\CompanyData\DataSupport as D;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Crypt, DB, Hash, Storage};
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;

class OrgDirectory
{
    public function index(User $user): array
    {
        $a = new OrgAccess($user); $visible = $a->unitsFor('browse');
        abort_unless($a->owner || count($visible), 403, '尚未分配组织访问权限，请联系总管理员。');
        $context = $visible;
        foreach ($visible as $id) { $seen = []; while ($id && !isset($seen[$id])) { $seen[$id] = true; $context[] = $id; $id = (int) ($a->units[$id]->parent_id ?? 0); } }
        $assignments = DB::table('jn_org_assignments')->whereNull('ended_at')->get();
        $people = DB::table('jn_org_people')->whereNull('deleted_at')->orderBy('name')->get();
        $items = []; $activeIds = $people->where('status', 'active')->pluck('id')->all();
        foreach ($people as $p) {
            if (!$a->person('browse', $p->id)) continue;
            $rows = $assignments->where('person_id', $p->id)->filter(fn ($r) => $a->can('browse', (int) $r->unit_id))->values()->all();
            $items[] = $this->personData($a, $p, $rows, false);
        }
        $units = [];
        foreach ($a->units as $id => $unit) {
            if (!in_array($id, $context, true)) continue;
            $full = in_array($id, $visible, true);
            $below = array_filter($visible, fn ($child) => $a->within((int) $child, (int) $id));
            $unitAssignments = $assignments->whereIn('person_id', $activeIds);
            $units[] = [...(array) $unit, 'note' => $full ? $unit->note : null, 'context_only' => !$full,
                'direct_count' => $full ? $unitAssignments->where('unit_id', $id)->pluck('person_id')->unique()->count() : null,
                'total_count' => $full ? $unitAssignments->whereIn('unit_id', $below)->pluck('person_id')->unique()->count() : null,
                'pending_count' => $full ? $unitAssignments->whereIn('unit_id', $below)->whereIn('person_id', $people->where('needs_review', true)->pluck('id'))->pluck('person_id')->unique()->count() : null,
                'can_edit' => $full && $a->can('units', $id), 'can_people' => $full && $a->can('people', $id)];
        }
        $state = DB::table('jn_org_state')->where('id', 1)->first();
        return ['units' => $units, 'people' => $items, 'positions' => DB::table('jn_org_positions')->whereNull('deleted_at')->orderBy('name')->get()->all(),
            'owner' => $a->owner, 'owner_name' => $a->owner ? $user->name : null, 'viewer_id' => $user->id, 'revision' => $state->revision,
            'can_positions' => $a->can('positions'), 'can_audit' => $a->owner || count($a->unitsFor('audit')) > 0,
            'can_root' => $a->can('units'), 'kinds' => OrgAccess::KINDS];
    }
    private function personData(OrgAccess $a, object $p, array $rows, bool $detail): array
    {
        $contact = $detail && $a->person('contacts', $p->id);
        return ['id' => $p->id, 'name' => $p->name, 'code' => $p->code, 'status' => $p->status, 'demo' => (bool) $p->demo,
            'needs_review' => (bool) $p->needs_review, 'revision' => $p->revision, 'assignments' => $rows,
            'avatar' => $p->avatar_path ? route('organization.avatar', ['id' => $p->id, 'v' => $p->revision]) : null,
            'can_edit' => $a->person('people', $p->id, true), 'can_avatar' => $a->person('avatars', $p->id, true),
            ...($detail ? ['contacts_visible' => $contact, 'contact' => $contact && $p->contact ? D::decode(Crypt::decryptString($p->contact)) : null,
                'note' => $a->person('people', $p->id, true) ? $p->note : null,
                'user_id' => $a->owner ? $p->user_id : null, 'account' => $a->owner && $p->user_id ? $this->accountInfo($p->user_id) : null,
                'history' => DB::table('jn_org_assignments')->where('person_id', $p->id)->whereNotNull('ended_at')
                    ->whereIn('unit_id', $a->unitsFor('browse'))->orderByDesc('id')->limit(30)->get()->all()] : [])];
    }
    private function accountInfo(int $id): ?array
    {
        $u = User::find($id); return $u ? ['id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'active' => D::active($u)] : null;
    }
    public function detail(User $user, int $id): array
    {
        $a = new OrgAccess($user); $p = $this->row('people', $id); abort_unless($a->person('browse', $id), 403, '没有此成员的查看权限。');
        return $this->personData($a, $p, array_values(array_filter($a->assignments($id), fn ($r) => $a->can('browse', $r->unit_id))), true);
    }
    public function configuration(User $user): array
    {
        $a = new OrgAccess($user); $a->requireOwner();
        return ['actions' => OrgAccess::ACTIONS, 'roles' => DB::table('jn_org_roles')->get()->map(fn ($r) => [...(array) $r, 'permissions' => D::decode($r->permissions)])->all(),
            'grants' => DB::table('jn_org_grants')->get()->map(fn ($g) => [...(array) $g, 'expires_at' => $g->expires_at ? \Carbon\Carbon::parse($g->expires_at)->toIso8601String() : null])->all(), 'owner_user_id' => DB::table('jn_org_state')->where('id', 1)->value('owner_user_id'),
            'revision' => DB::table('jn_org_state')->where('id', 1)->value('revision'),
            'users' => User::orderBy('name')->get()->map(fn ($u) => ['id' => $u->id, 'name' => $u->name, 'active' => D::active($u)])->all()];
    }
    public function events(User $user): array
    {
        $a = new OrgAccess($user); $ids = $a->unitsFor('audit'); abort_unless($a->owner || count($ids), 403, '没有变更记录查看权限。');
        $events = DB::table('jn_org_events')->orderByDesc('id')->limit(500)->get()->filter(function ($e) use ($a, $ids) {
            if ($a->owner) return true;
            return ($e->kind === 'unit' && in_array((int) $e->target_id, $ids, true)) || ($e->kind === 'person' && $a->person('audit', (int) $e->target_id, true));
        })->take(100)->map(fn ($e) => [...(array) $e, 'actor' => $e->actor_id ? (User::withTrashed()->find($e->actor_id)?->name ?? '已停用账号') : '系统初始化', 'detail' => $a->owner ? D::decode($e->detail) : array_intersect_key(D::decode($e->detail), array_flip(['name', 'status']))])->values()->all();
        return ['items' => $events];
    }
    public function row(string $kind, int $id): object
    {
        $q = DB::table('jn_org_'.$kind)->where('id', $id);
        if (in_array($kind, ['units', 'positions', 'people'])) $q->whereNull('deleted_at');
        $row = $q->first(); abort_unless($row, 404, '记录不存在或已移除。'); return $row;
    }
    private function event(User $u, string $kind, int $id, string $action, array $detail): void
    {
        DB::table('jn_org_events')->insert(['actor_id' => $u->id, 'kind' => $kind, 'target_id' => $id, 'action' => $action, 'detail' => D::json($detail), 'created_at' => now()]);
    }
    public function mutate(User $u, string $key, string $op, array $input, callable $authorize, callable $write): array
    {
        validator(['key' => $key], ['key' => 'required|uuid'])->validate();
        return DB::transaction(function () use ($u, $key, $op, $input, $authorize, $write) {
            // Same lock order as content writes: membership revocation cannot race a document mutation.
            DB::table('jn_data_state')->where('id', 1)->lockForUpdate()->firstOrFail();
            DB::table('jn_org_state')->where('id', 1)->lockForUpdate()->firstOrFail();
            $u->refresh(); $a = new OrgAccess($u); $authorize($a);
            $fingerprint = hash('sha256', D::json([$op, $input]));
            $old = DB::table('jn_org_receipts')->where('actor_id', $u->id)->where('request_key', $key)->first();
            if ($old) { abort_unless(hash_equals($old->fingerprint, $fingerprint), 409, '请求内容已变化，请重新提交。'); return D::decode($old->response); }
            $result = $write($a);
            DB::table('jn_org_receipts')->insert(['actor_id' => $u->id, 'request_key' => $key, 'fingerprint' => $fingerprint, 'response' => D::json($result), 'created_at' => now()]);
            DB::table('jn_org_state')->where('id', 1)->increment('revision'); return $result;
        });
    }
    public function save(User $u, string $key, string $kind, int $id, array $p): array
    {
        $authorize = function (OrgAccess $a) use ($kind, $id, $p) {
            if (in_array($kind, ['role', 'grant', 'account', 'owner'])) { $a->requireOwner(); return; }
            if ($kind === 'position') { $a->require('positions'); return; }
            if ($kind === 'unit') {
                $a->require('units', $id ?: (($p['parent_id'] ?? null) ? (int) $p['parent_id'] : null));
                if (array_key_exists('parent_id', $p)) $a->require('units', $p['parent_id'] ? (int) $p['parent_id'] : null);
                return;
            }
            abort_unless($kind === 'person', 404);
            if ($id) abort_unless($a->person('people', $id, true), 403, '需要此成员全部任职范围的维护权限。');
            else abort_unless($a->owner || count($a->unitsFor('people')), 403, '没有成员维护权限。');
            foreach ($p['assignments'] ?? [] as $assignment) $a->require('people', (int) ($assignment['unit_id'] ?? 0));
        };
        return $this->mutate($u, $key, "$kind:$id", $p, $authorize, function (OrgAccess $a) use ($u, $kind, $id, $p) {
            $delete = ($p['action'] ?? 'save') === 'delete';
            if ($kind === 'unit') return $this->unit($u, $a, $id, $p, $delete);
            if ($kind === 'position') return $this->position($u, $id, $p, $delete);
            if ($kind === 'person') return $this->person($u, $a, $id, $p, $delete);
            if ($kind === 'role' || $kind === 'grant') return $this->permission($u, $kind, $id, $p, $delete);
            if ($kind === 'account') return $this->account($u, $id, $p);
            if ($kind === 'owner') return $this->transfer($u, $p);
            abort(404);
        });
    }
    private function unit(User $u, OrgAccess $a, int $id, array $p, bool $delete): array
    {
        $old = $id ? $this->row('units', $id) : null; if ($old) D::revision($old, $p['revision'] ?? 0);
        if ($delete || ($p['status'] ?? 'active') === 'inactive') {
            abort_unless($old, 422, '请先选择组织。');
            abort_if(DB::table('jn_org_units')->where('parent_id', $id)->whereNull('deleted_at')->exists(), 422, '请先调整下级组织归属，再停用或删除。');
            abort_if(DB::table('jn_org_assignments')->where('unit_id', $id)->whereNull('ended_at')->exists(), 422, '组织仍有任职成员，请先调整成员归属。');
            abort_if($delete && DB::table('jn_org_grants')->where('unit_id', $id)->exists(), 422, '组织仍有关联授权，请先撤销授权。');
            abort_if($delete && DB::table('jn_data_rules')->whereIn('principal_type', ['organization', 'organization_tree'])->where('principal_id', $id)->exists(), 422, '组织仍被资料权限规则引用，请先调整规则。');
            if ($delete) {
                DB::table('jn_org_units')->where('id', $id)->update(['deleted_at' => now(), 'status' => 'inactive', 'revision' => $old->revision + 1, 'updated_at' => now()]);
                $this->event($u, 'unit', $id, '移除组织', ['name' => $old->name]); return ['id' => $id];
            }
        }
        validator($p, ['name' => 'required|string|max:80', 'kind' => 'required|in:'.implode(',', array_keys(OrgAccess::KINDS)),
            'parent_id' => 'nullable|integer|min:1', 'status' => 'required|in:active,inactive', 'sort' => 'integer|min:0|max:10000', 'note' => 'nullable|string|max:2000'])->validate();
        $parent = $p['parent_id'] ?? null; $seen = []; $depth = 0;
        while ($parent) {
            abort_if((int) $parent === $id || isset($seen[$parent]) || ++$depth > 12, 422, '组织不能放到自身或下级中，最多支持12层。');
            $seen[$parent] = true; $r = $this->row('units', (int) $parent); abort_unless($r->status === 'active', 422, '上级组织已停用。'); $parent = $r->parent_id;
        }
        foreach ($a->units as $child) {
            if (!$id || !$a->within($child->id, $id)) continue;
            $subDepth = 0; $cursor = $child;
            while ((int) $cursor->id !== $id) { $subDepth++; $cursor = $a->units[$cursor->parent_id]; }
            abort_if($depth + $subDepth + 1 > 12, 422, '移动后组织层级超过12层，请调整目标位置。');
        }
        abort_if($depth >= 12, 422, '最多支持12层组织。');
        if ($old && (int) $old->parent_id !== (int) ($p['parent_id'] ?? 0) && !$a->owner) {
            foreach ($a->units as $child) if ($a->within($child->id, $id)) $a->require('units', $child->id);
        }
        $name = trim($p['name']); abort_if($name === '', 422, '请输入组织名称。');
        abort_if(DB::table('jn_org_units')->whereNull('deleted_at')->where('parent_id', $p['parent_id'] ?? null)->where('name', $name)->where('id', '!=', $id)->exists(), 422, '同一层级已有同名组织。');
        $row = ['name' => $name, 'kind' => $p['kind'], 'parent_id' => $p['parent_id'] ?? null, 'status' => $p['status'], 'sort' => $p['sort'] ?? 0, 'note' => $p['note'] ?? '', 'updated_at' => now()];
        if ($old) DB::table('jn_org_units')->where('id', $id)->update([...$row, 'revision' => $old->revision + 1]);
        else $id = DB::table('jn_org_units')->insertGetId([...$row, 'code' => 'ORG-'.Str::uuid(), 'created_at' => now()]);
        abort_unless((new OrgAccess($u))->can('units', $id), 403, '新组织超出你的授权范围，请联系总管理员。');
        $this->event($u, 'unit', $id, $old ? '更新组织' : '新增组织', $row); return ['id' => $id];
    }
    private function position(User $u, int $id, array $p, bool $delete): array
    {
        $old = $id ? $this->row('positions', $id) : null; if ($old) D::revision($old, $p['revision'] ?? 0);
        if ($delete) {
            abort_unless($old, 422); abort_if(DB::table('jn_org_assignments')->where('position_id', $id)->whereNull('ended_at')->exists(), 422, '该岗位仍有人任职，请先调整任职。');
            DB::table('jn_org_positions')->where('id', $id)->update(['deleted_at' => now(), 'enabled' => false, 'revision' => $old->revision + 1]);
        } else {
            validator($p, ['name' => 'required|string|max:80', 'description' => 'nullable|string|max:2000', 'enabled' => 'required|boolean'])->validate();
            $name = trim($p['name']); abort_if(!$name, 422, '请输入岗位名称。');
            abort_if(DB::table('jn_org_positions')->where('name', $name)->where('id', '!=', $id)->exists(), 422, '岗位名称已存在（含历史记录），请使用不同名称。');
            abort_if($old && !$p['enabled'] && DB::table('jn_org_assignments')->where('position_id', $id)->whereNull('ended_at')->exists(), 422, '该岗位仍有人任职，请先调整任职再停用。');
            $row = ['name' => $name, 'description' => $p['description'] ?? '', 'enabled' => $p['enabled'], 'updated_at' => now()];
            if ($old) DB::table('jn_org_positions')->where('id', $id)->update([...$row, 'revision' => $old->revision + 1]);
            else $id = DB::table('jn_org_positions')->insertGetId([...$row, 'created_at' => now()]);
        }
        $this->event($u, 'position', $id, $delete ? '移除岗位' : '保存岗位', ['name' => $p['name'] ?? $old?->name]); return ['id' => $id];
    }
    private function person(User $u, OrgAccess $a, int $id, array $p, bool $delete): array
    {
        $old = $id ? $this->row('people', $id) : null; if ($old) D::revision($old, $p['revision'] ?? 0);
        $owner = (int) DB::table('jn_org_state')->where('id', 1)->value('owner_user_id');
        abort_if($old && (int) $old->user_id === $owner && ($delete || ($p['status'] ?? 'active') !== 'active'), 422, '请先转交总管理员，再停用或删除关联成员。');
        if ($delete) {
            abort_unless($old, 422); DB::table('jn_org_people')->where('id', $id)->update(['deleted_at' => now(), 'status' => 'inactive', 'revision' => $old->revision + 1, 'updated_at' => now()]);
            DB::table('jn_org_assignments')->where('person_id', $id)->whereNull('ended_at')->update(['ended_at' => now()]);
            $this->event($u, 'person', $id, '移除成员', ['name' => $old->name, 'account_preserved' => true]); return ['id' => $id];
        }
        validator($p, ['name' => 'required|string|max:80', 'code' => 'nullable|string|max:80', 'status' => 'required|in:active,inactive',
            'note' => 'nullable|string|max:2000', 'needs_review' => 'boolean', 'contact.email' => 'nullable|email|max:200', 'contact.phone' => 'nullable|string|max:40',
            'assignments' => 'present|array|max:20', 'assignments.*.unit_id' => 'required|integer|min:1', 'assignments.*.position_id' => 'nullable|integer|min:1',
            'assignments.*.title' => 'nullable|string|max:80', 'assignments.*.primary' => 'required|boolean', 'assignments.*.manager' => 'required|boolean'])->validate();
        $rows = $p['assignments'];
        abort_if($p['status'] === 'active' && count($rows) === 0, 422, '在职成员至少需要一条任职关系。');
        abort_if($rows && count(array_filter($rows, fn ($r) => $r['primary'])) !== 1, 422, '请选择且仅选择一个主职。');
        $seen = [];
        foreach ($rows as $r) {
            abort_unless($a->activeUnit((int) $r['unit_id']), 422, '任职组织不存在或已停用。');
            $pk = $r['unit_id'].':'.($r['position_id'] ?? 0).':'.trim($r['title'] ?? ''); abort_if(isset($seen[$pk]), 422, '同一任职不能重复添加。'); $seen[$pk] = true;
            if (!empty($r['position_id'])) abort_unless($this->row('positions', $r['position_id'])->enabled, 422, '所选岗位已停用。');
        }
        $code = trim($p['code'] ?? ($old?->code ?? '')); if (!$code) $code = 'P-'.Str::uuid();
        abort_if(DB::table('jn_org_people')->where('code', $code)->where('id', '!=', $id)->exists(), 422, '成员编号已存在（含历史记录），姓名可以相同，编号必须唯一。');
        $name = trim($p['name']); abort_unless($name, 422, '请输入姓名。');
        $row = ['name' => $name, 'code' => $code, 'status' => $p['status'], 'needs_review' => $p['needs_review'] ?? ($old?->needs_review ?? false), 'note' => $p['note'] ?? '', 'updated_at' => now()];
        if (array_key_exists('contact', $p)) {
            if ($old) abort_unless($a->person('contacts', $id, true), 403, '修改联系方式还需要全部任职范围的联系方式权限。');
            else foreach ($rows as $r) $a->require('contacts', $r['unit_id']);
            $row['contact'] = Crypt::encryptString(D::json(['email' => $p['contact']['email'] ?? '', 'phone' => $p['contact']['phone'] ?? '']));
        }
        if ($old) DB::table('jn_org_people')->where('id', $id)->update([...$row, 'revision' => $old->revision + 1]);
        else $id = DB::table('jn_org_people')->insertGetId([...$row, 'created_at' => now()]);
        // Keep ended appointments as history; unchanged tuples keep their original start.
        $existing = DB::table('jn_org_assignments')->where('person_id', $id)->whereNull('ended_at')->get(); $keep = [];
        foreach ($rows as $r) {
            $values = ['unit_id' => (int) $r['unit_id'], 'position_id' => ($r['position_id'] ?? null) ?: null, 'title' => trim($r['title'] ?? ''), 'primary' => (bool) $r['primary'], 'manager' => (bool) $r['manager']];
            $match = $existing->first(fn ($x) => (int) $x->unit_id === $values['unit_id'] && (int) $x->position_id === (int) $values['position_id'] && $x->title === $values['title'] && (bool) $x->primary === $values['primary'] && (bool) $x->manager === $values['manager']);
            $keep[] = $match?->id ?? DB::table('jn_org_assignments')->insertGetId([...$values, 'person_id' => $id, 'created_at' => now(), 'updated_at' => now()]);
        }
        DB::table('jn_org_assignments')->where('person_id', $id)->whereNull('ended_at')->whereNotIn('id', $keep)->update(['ended_at' => now(), 'updated_at' => now()]);
        $this->event($u, 'person', $id, $old ? '更新成员与任职' : '新增成员', ['name' => $name, 'status' => $p['status'], 'assignments' => $rows, 'contact_changed' => array_key_exists('contact', $p)]);
        return ['id' => $id];
    }
    private function permission(User $u, string $kind, int $id, array $p, bool $delete): array
    {
        $table = $kind === 'role' ? 'roles' : 'grants'; $old = $id ? $this->row($table, $id) : null;
        if ($old) D::revision($old, $p['revision'] ?? 0);
        if ($delete) {
            abort_unless($old, 422); abort_if($kind === 'role' && DB::table('jn_org_grants')->where('role_id', $id)->exists(), 422, '角色仍有关联授权，请先撤销或调整授权。');
            DB::table('jn_org_'.$table)->where('id', $id)->delete();
        } elseif ($kind === 'role') {
            validator($p, ['name' => 'required|string|max:80', 'permissions' => 'present|array', 'permissions.*' => 'in:'.implode(',', array_keys(OrgAccess::ACTIONS)), 'enabled' => 'required|boolean'])->validate();
            $name = trim($p['name']); abort_unless($name, 422, '请输入角色名称。');
            abort_if(DB::table('jn_org_roles')->where('name', $name)->where('id', '!=', $id)->exists(), 422, '角色名称已存在。');
            $permissions = array_values(array_unique($p['permissions']));
            if ($permissions && !in_array('browse', $permissions)) $permissions[] = 'browse';
            $row = ['name' => $name, 'permissions' => D::json($permissions), 'enabled' => $p['enabled'], 'updated_at' => now()];
            if ($old) DB::table('jn_org_roles')->where('id', $id)->update([...$row, 'revision' => $old->revision + 1]);
            else $id = DB::table('jn_org_roles')->insertGetId([...$row, 'created_at' => now()]);
        } else {
            validator($p, ['user_id' => 'required|integer|min:1', 'role_id' => 'required|integer|min:1', 'unit_id' => 'nullable|integer|min:1', 'descendants' => 'required|boolean', 'expires_at' => 'nullable|date|after:now'])->validate();
            D::user($p['user_id']); abort_unless($this->row('roles', $p['role_id'])->enabled, 422, '角色已停用。');
            if ($p['unit_id'] ?? null) abort_unless($this->row('units', $p['unit_id'])->status === 'active', 422, '授权组织已停用。');
            abort_if(DB::table('jn_org_grants')->where('user_id', $p['user_id'])->where('role_id', $p['role_id'])->where('unit_id', $p['unit_id'] ?? null)->where('id', '!=', $id)->exists(), 422, '此账号已有相同角色和组织范围的授权，请编辑原授权。');
            $row = ['user_id' => $p['user_id'], 'role_id' => $p['role_id'], 'unit_id' => $p['unit_id'] ?? null, 'descendants' => $p['descendants'], 'expires_at' => empty($p['expires_at']) ? null : \Carbon\Carbon::parse($p['expires_at'])->setTimezone(config('app.timezone')), 'updated_at' => now()];
            if ($old) DB::table('jn_org_grants')->where('id', $id)->update([...$row, 'revision' => $old->revision + 1]);
            else $id = DB::table('jn_org_grants')->insertGetId([...$row, 'created_at' => now()]);
        }
        $this->event($u, $kind, $id, $delete ? '撤销配置' : '保存授权配置', ['configuration' => $delete ? (array) $old : array_diff_key($p, ['request_key' => true])]); return ['id' => $id];
    }
    private function account(User $u, int $id, array $p): array
    {
        $person = $this->row('people', $id); D::revision($person, $p['revision'] ?? 0);
        abort_unless($person->status === 'active' && !$person->needs_review, 422, '请先核对成员身份并确认在职，再关联或创建登录账号。');
        $action = $p['action'] ?? 'link';
        if ($action === 'create') {
            abort_if($person->user_id, 422, '成员已经关联账号。');
            validator($p, ['email' => 'required|email|max:200|unique:users,email', 'password' => ['required', 'string', 'min:12', 'max:128', 'regex:/[A-Za-z]/', 'regex:/[0-9]/']])->validate();
            $account = new User(); $account->name = $person->name; $account->email = $p['email']; $account->password = Hash::make($p['password']); $account->email_verified_at = now(); $account->save();
            $account->assignRole(Role::firstOrCreate(['name' => '组织成员', 'guard_name' => 'web']));
            $uid = $account->id;
        } elseif ($action === 'link') {
            $uid = $p['user_id'] ?? null; if ($uid) D::user((int) $uid);
            abort_if($uid && DB::table('jn_org_people')->where('user_id', $uid)->where('id', '!=', $id)->exists(), 422, '账号已关联其他成员。');
            abort_if((int) $person->user_id === (int) $u->id && (int) $uid !== (int) $u->id, 422, '不能解除或替换总管理员自己的成员关联。');
            abort_if($uid && $person->status !== 'active', 422, '请先恢复成员在职状态。');
        } else abort(422, '不支持的账号操作。');
        DB::table('jn_org_people')->where('id', $id)->update(['user_id' => $uid, 'revision' => $person->revision + 1, 'updated_at' => now()]);
        $this->event($u, 'person', $id, $action === 'create' ? '创建独立登录账号' : '关联登录账号', ['user_id' => $uid]); return ['id' => $id, 'user_id' => $uid];
    }
    private function transfer(User $u, array $p): array
    {
        $state = DB::table('jn_org_state')->where('id', 1)->first(); D::revision($state, $p['revision'] ?? 0);
        validator($p, ['user_id' => 'required|integer|min:1', 'password' => 'required|string'])->validate();
        abort_unless(Hash::check($p['password'], $u->password), 422, '当前账号密码不正确。');
        $target = D::user($p['user_id']); abort_if($target->id === $u->id, 422, '请选择另一位接任人。');
        abort_unless($target->roles()->exists(), 422, '接任账号尚未开通软件访问，请先配置账号角色。');
        $member = DB::table('jn_org_people')->where('user_id', $target->id)->first();
        abort_if($member && ($member->deleted_at || $member->status !== 'active'), 422, '接任人已停用。');
        DB::table('jn_org_state')->where('id', 1)->update(['owner_user_id' => $target->id]);
        $this->event($u, 'owner', $target->id, '转交总管理员', ['from' => $u->id, 'to' => $target->id]); return ['id' => $target->id];
    }
    public function avatar(User $u, int $id)
    {
        $a = new OrgAccess($u); $p = $this->row('people', $id); abort_unless($a->person('browse', $id), 403);
        abort_unless($p->avatar_path && Storage::disk('local')->exists($p->avatar_path), 404);
        return response(Storage::disk('local')->get($p->avatar_path))->header('Content-Type', 'image/png')->header('Cache-Control', 'private, no-store')->header('X-Content-Type-Options', 'nosniff');
    }
    public function upload(User $u, string $key, int $id, array $p, ?UploadedFile $file): array
    {
        $remove = ($p['action'] ?? '') === 'remove';
        if (!$remove) validator(['avatar' => $file], ['avatar' => 'required|file|image|mimes:jpg,jpeg,png,webp|max:5120|dimensions:min_width=64,min_height=64,max_width=6000,max_height=6000'])->validate();
        $input = ['revision' => $p['revision'] ?? 0, 'remove' => $remove, 'sha256' => $file ? hash_file('sha256', $file->getRealPath()) : null]; $written = null;
        try {
            return $this->mutate($u, $key, "avatar:$id", $input, fn (OrgAccess $a) => abort_unless($a->person('avatars', $id, true), 403), function () use ($u, $id, $p, $remove, $file, &$written) {
                $person = $this->row('people', $id); D::revision($person, $p['revision'] ?? 0);
                if (!$remove) {
                    $source = @imagecreatefromstring(file_get_contents($file->getRealPath())); abort_unless($source, 422, '图片无法读取，请使用正常的照片。');
                    $w = imagesx($source); $h = imagesy($source); $side = min($w, $h); $target = imagecreatetruecolor(512, 512);
                    imagefill($target, 0, 0, imagecolorallocate($target, 244, 246, 249));
                    imagecopyresampled($target, $source, 0, 0, (int)(($w - $side) / 2), (int)(($h - $side) / 2), 512, 512, $side, $side);
                    ob_start(); imagepng($target); $bytes = ob_get_clean(); imagedestroy($target); imagedestroy($source);
                    $written = 'organization/avatars/'.Str::uuid().'.png'; Storage::disk('local')->put($written, $bytes);
                }
                DB::table('jn_org_people')->where('id', $id)->update(['avatar_path' => $written, 'revision' => $person->revision + 1, 'updated_at' => now()]);
                $this->event($u, 'person', $id, $remove ? '移除头像' : '更新头像', []); return ['id' => $id];
            });
        } catch (\Throwable $e) { if ($written) Storage::disk('local')->delete($written); throw $e; }
    }
}
