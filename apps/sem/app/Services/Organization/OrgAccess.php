<?php

namespace App\Services\Organization;

use App\Models\User;
use App\Services\CompanyData\DataSupport;
use Illuminate\Support\Facades\DB;

/** Rebuilt for each request and again inside the shared policy/write lock. */
class OrgAccess
{
    public const ACTIONS = ['browse' => '查看组织与成员', 'contacts' => '查看联系方式', 'units' => '维护组织',
        'people' => '维护成员与任职', 'avatars' => '维护头像', 'positions' => '维护岗位', 'audit' => '查看变更记录'];
    public const KINDS = ['company' => '公司', 'department' => '部门', 'workshop' => '车间', 'team' => '班组', 'project' => '项目'];
    public array $units; public bool $owner; private array $grants; private bool $active;
    private ?array $appointments = null;

    public function __construct(public User $user)
    {
        $this->units = DB::table('jn_org_units')->whereNull('deleted_at')->get()->keyBy('id')->all();
        $this->active = DataSupport::active($user);
        $person = DB::table('jn_org_people')->where('user_id', $user->id)->first();
        if ($person && ($person->deleted_at || $person->status !== 'active')) $this->active = false;
        $this->owner = $this->active && (int) DB::table('jn_org_state')->where('id', 1)->value('owner_user_id') === (int) $user->id;
        $this->grants = DB::table('jn_org_grants as g')->join('jn_org_roles as r', 'r.id', '=', 'g.role_id')
            ->where('g.user_id', $user->id)->where('r.enabled', true)
            ->where(fn ($q) => $q->whereNull('g.expires_at')->orWhere('g.expires_at', '>', now()))
            ->get(['g.*', 'r.permissions'])->all();
    }
    public function activeUnit(int $id): bool
    {
        if ($id <= 0) return false;
        $seen = [];
        while ($id) {
            if (isset($seen[$id]) || !isset($this->units[$id]) || $this->units[$id]->status !== 'active') return false;
            $seen[$id] = true; $id = (int) $this->units[$id]->parent_id;
        }
        return true;
    }
    public function within(int $id, int $scope, bool $descendants = true): bool
    {
        $seen = [];
        while ($id && isset($this->units[$id]) && !isset($seen[$id])) {
            if ($id === $scope) return true;
            if (!$descendants) return false;
            $seen[$id] = true; $id = (int) $this->units[$id]->parent_id;
        }
        return false;
    }
    public function can(string $action, ?int $unit = null): bool
    {
        if (!$this->active) return false;
        if ($this->owner) return true;
        if ($unit !== null && !$this->activeUnit($unit)) return false;
        foreach ($this->grants as $grant) {
            if (!in_array($action, DataSupport::decode($grant->permissions), true)) continue;
            if (!$grant->unit_id) return true;
            if (!$this->activeUnit((int) $grant->unit_id)) continue;
            if ($unit !== null && $this->within($unit, (int) $grant->unit_id, (bool) $grant->descendants)) return true;
        }
        return false;
    }
    public function require(string $action, ?int $unit = null): void { abort_unless($this->can($action, $unit), 403, '当前账号没有此组织范围的操作权限。'); }
    public function requireOwner(): void { abort_unless($this->owner, 403, '此操作需要总管理员权限。'); }
    public function unitsFor(string $action): array { return array_values(array_filter(array_keys($this->units), fn ($id) => $this->can($action, (int) $id))); }
    public function assignments(int $person): array
    {
        $this->appointments ??= DB::table('jn_org_assignments')->whereNull('ended_at')->get()->groupBy('person_id')->map(fn ($rows) => $rows->all())->all();
        return $this->appointments[$person] ?? [];
    }
    public function person(string $action, int $person, bool $all = false): bool
    {
        if ($this->owner) return true;
        $rows = $this->assignments($person);
        if (!$rows) return false;
        $matched = array_filter($rows, fn ($a) => $this->can($action, (int) $a->unit_id));
        return $all ? count($rows) === count($matched) : count($matched) > 0;
    }
    /** Exact membership plus ancestor membership, for explicit content ACL subjects. */
    public static function membershipUnits(int $userId, bool $ancestors = false): array
    {
        $user = User::find($userId); if (!$user || !DataSupport::active($user)) return [];
        $access = new self($user);
        $ids = DB::table('jn_org_assignments as a')->join('jn_org_people as p', 'p.id', '=', 'a.person_id')
            ->where('p.user_id', $userId)->where('p.status', 'active')->whereNull('p.deleted_at')->whereNull('a.ended_at')->pluck('a.unit_id');
        $result = [];
        foreach ($ids as $id) {
            $id = (int) $id; if (!$access->activeUnit($id)) continue;
            do { $result[] = $id; $id = $ancestors ? (int) ($access->units[$id]->parent_id ?? 0) : 0; } while ($id && !in_array($id, $result, true));
        }
        return array_values(array_unique($result));
    }
}
