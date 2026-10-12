<?php
namespace App\Console\Commands;

use App\Models\User;
use App\Services\CompanyData\DataSupport as D;
use App\Services\Organization\OrgAccess;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\{DB, Storage};

/** Explicit local bootstrap/import. No passwords, roles or source screenshots are imported. */
class OrganizationInitialize extends Command
{
    protected $signature = 'organization:initialize {--owner= : Existing active login email; used only when no owner exists} {--file= : Private normalized JSON path} {--demo : Explicitly create fictional sample data}';
    protected $description = '初始化唯一组织总管理员，或幂等导入组织与待核对成员';
    public function handle(): int
    {
        $data = null;
        if ($this->option('file')) $data = json_decode(file_get_contents($this->option('file')), true, 64, JSON_THROW_ON_ERROR);
        if ($this->option('demo')) { if ($data) { $this->error('演示与私有导入不能同时执行。'); return self::FAILURE; } $data = $this->demo(); }
        if ($data) {
            validator($data, ['units' => 'required|array|max:500', 'units.*.key' => 'required|string|max:70|distinct', 'units.*.parent' => 'nullable|string|max:70', 'units.*.name' => 'required|string|max:80', 'units.*.kind' => 'required|in:'.implode(',', array_keys(OrgAccess::KINDS)), 'people' => 'array|max:5000', 'people.*.key' => 'required|string|max:70|distinct', 'people.*.name' => 'required|string|max:80', 'people.*.unit' => 'required|string|max:70', 'people.*.title' => 'nullable|string|max:80', 'people.*.note' => 'nullable|string|max:2000'])->validate();
            $keys = array_column($data['units'], 'key');
            foreach ($data['units'] as $unit) if (($unit['parent'] ?? null) && !in_array($unit['parent'], $keys, true)) throw new \RuntimeException('导入包含未知上级组织。');
            foreach ($data['people'] ?? [] as $p) if (!in_array($p['unit'], $keys, true)) throw new \RuntimeException('成员引用未知组织。');
        }
        $counts = DB::transaction(function () use ($data) {
            DB::table('jn_data_state')->where('id', 1)->lockForUpdate()->firstOrFail();
            $state = DB::table('jn_org_state')->where('id', 1)->lockForUpdate()->firstOrFail();
            if (!$state->owner_user_id) {
                $owner = User::where('email', $this->option('owner'))->first();
                if (!$owner || !D::active($owner) || !$owner->hasRole('Admin')) throw new \RuntimeException('首次初始化需要指定现有在用管理员邮箱。');
                DB::table('jn_org_state')->where('id', 1)->update(['owner_user_id' => $owner->id]);
            } elseif ($this->option('owner') && User::find($state->owner_user_id)?->email !== $this->option('owner')) throw new \RuntimeException('已有总管理员；请通过界面使用当前密码转交。');
            foreach (['组织只读' => ['browse'], '成员维护' => ['browse', 'people', 'avatars', 'contacts'], '部门维护' => ['browse', 'people', 'avatars', 'contacts', 'units', 'audit']] as $name => $permissions) {
                if (!DB::table('jn_org_roles')->where('name', $name)->exists()) DB::table('jn_org_roles')->insert(['name' => $name, 'permissions' => D::json($permissions), 'created_at' => now(), 'updated_at' => now()]);
            }
            $unitCount = 0; $peopleCount = 0; $ids = []; $depths = []; $pending = $data['units'] ?? [];
            for ($pass = 0; count($pending) && $pass < 12; $pass++) {
                $next = [];
                foreach ($pending as $unit) {
                    if (($unit['parent'] ?? null) && !isset($ids[$unit['parent']])) { $next[] = $unit; continue; }
                    $depths[$unit['key']] = ($depths[$unit['parent'] ?? ''] ?? 0) + 1;
                    if ($depths[$unit['key']] > 12) throw new \RuntimeException('组织超过12层，已回滚导入。');
                    $existing = DB::table('jn_org_units')->where('source_key', $unit['key'])->first();
                    if ($existing?->deleted_at) throw new \RuntimeException('导入编号对应已删除组织，不允许静默恢复。');
                    $ids[$unit['key']] = $existing?->id ?? DB::table('jn_org_units')->insertGetId(['source_key' => $unit['key'], 'code' => $unit['key'], 'name' => $unit['name'], 'kind' => $unit['kind'], 'parent_id' => $ids[$unit['parent'] ?? ''] ?? null, 'sort' => $unit['sort'] ?? 0, 'note' => $unit['note'] ?? '', 'created_at' => now(), 'updated_at' => now()]);
                    if (!$existing) $unitCount++;
                }
                $pending = $next;
            }
            if ($pending) throw new \RuntimeException('组织存在循环关系或超过12层，已回滚导入。');
            foreach ($data['people'] ?? [] as $p) {
                if (DB::table('jn_org_people')->where('source_key', $p['key'])->exists()) continue;
                $pid = DB::table('jn_org_people')->insertGetId(['source_key' => $p['key'], 'name' => $p['name'], 'code' => $p['key'], 'needs_review' => !$this->option('demo'), 'demo' => (bool) $this->option('demo'), 'note' => $p['note'] ?? '', 'created_at' => now(), 'updated_at' => now()]);
                $position = null; $title = trim($p['title'] ?? '');
                if ($title !== '') $position = DB::table('jn_org_positions')->where('name', $title)->value('id') ?? DB::table('jn_org_positions')->insertGetId(['name' => $title, 'created_at' => now(), 'updated_at' => now()]);
                DB::table('jn_org_assignments')->insert(['person_id' => $pid, 'unit_id' => $ids[$p['unit']], 'position_id' => $position, 'title' => $title, 'primary' => true, 'manager' => (bool) ($p['manager'] ?? false), 'created_at' => now(), 'updated_at' => now()]);
                if ($this->option('demo') && isset($p['avatar'])) {
                    $path = 'organization/avatars/demo-'.$p['avatar'].'.png';
                    Storage::disk('local')->put($path, file_get_contents(public_path('images/org-demo/'.$p['avatar'].'.png')));
                    DB::table('jn_org_people')->where('id', $pid)->update(['avatar_path' => $path]);
                }
                $peopleCount++;
            }
            DB::table('jn_org_state')->where('id', 1)->increment('revision');
            DB::table('jn_org_events')->insert(['actor_id' => null, 'kind' => 'import', 'target_id' => null, 'action' => '初始化或导入组织', 'detail' => D::json(['new_units' => $unitCount, 'new_people' => $peopleCount, 'demo' => (bool) $this->option('demo')]), 'created_at' => now()]);
            return [$unitCount, $peopleCount];
        });
        $this->info("完成：新增组织 {$counts[0]}，新增成员 {$counts[1]}。未创建登录账号或成员授权。"); return self::SUCCESS;
    }
    private function demo(): array
    {
        $units = [];
        foreach ([['demo-company', null, '示例制造企业', 'company'], ['demo-gm', 'demo-company', '总经办', 'department'], ['demo-prod', 'demo-gm', '生产计划部', 'department'], ['demo-workshop', 'demo-prod', '车间', 'workshop'], ['demo-sheet', 'demo-workshop', '钣金车间', 'workshop'], ['demo-set', 'demo-workshop', '成套车间', 'workshop'], ['demo-project', 'demo-workshop', '制造项目组', 'project'], ['demo-warehouse', 'demo-prod', '仓库', 'department'], ['demo-cut', 'demo-sheet', '下料', 'team'], ['demo-weld', 'demo-sheet', '焊接', 'team'], ['demo-assembly', 'demo-sheet', '装配', 'team'], ['demo-sales', 'demo-gm', '销售与服务中心', 'department'], ['demo-finance', 'demo-gm', '财务部', 'department'], ['demo-quality', 'demo-gm', '品质部', 'department'], ['demo-tech', 'demo-gm', '技术部', 'department'], ['demo-ai', 'demo-gm', '智能项目组', 'project']] as $i => [$key, $parent, $name, $kind]) $units[] = compact('key', 'parent', 'name', 'kind') + ['sort' => $i];
        $people = [];
        foreach ([['林辰', 'lin-chen'], ['周然', 'zhou-ran'], ['顾宁', 'gu-ning'], ['许言', 'xu-yan'], ['陈安', 'chen-an']] as $i => [$name, $avatar]) $people[] = ['key' => 'demo-person-'.$i, 'name' => $name, 'unit' => 'demo-assembly', 'title' => $i ? '装配' : '装配班组长', 'manager' => !$i, 'avatar' => $avatar];
        return compact('units', 'people');
    }
}
