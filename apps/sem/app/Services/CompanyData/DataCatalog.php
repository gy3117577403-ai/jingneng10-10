<?php

namespace App\Services\CompanyData;

use App\Models\User;
use Illuminate\Support\Facades\DB;

class DataCatalog
{
    public function __construct(private DataSupport $support) {}

    public function configuration(User $user): array
    {
        abort_unless(DataSupport::manager($user), 403, '需要资料中心配置权限。');
        return ['categories' => DB::table('jn_data_categories')->orderBy('position')->get()->map(fn ($c) => [...(array) $c, 'fields' => DataSupport::decode($c->fields)])->all(),
            'groups' => DB::table('jn_data_groups')->orderBy('id')->get()->map(fn ($g) => [...(array) $g, 'members' => DB::table('jn_data_members')->where('group_id', $g->id)->pluck('user_id')->all()])->all(),
            'rules' => DB::table('jn_data_rules')->get()->all(), 'users' => DataSupport::users(), 'actions' => DataAccess::ACTIONS,
            'events' => DB::table('jn_data_events')->whereIn('label', ['更新工作组', '更新分类与字段权限', '更新资料权限'])->orderByDesc('id')->limit(100)->get()->map(fn ($e) => ['id' => $e->id, 'label' => $e->label, 'actor' => User::withTrashed()->find($e->actor_id)?->name ?? '已停用人员', 'detail' => DataSupport::decode($e->detail), 'created_at' => $e->created_at])->all()];
    }

    public function rules(string $scope, int $id, array $rules): void
    {
        validator(['rules' => $rules], ['rules' => 'array|max:500', 'rules.*.principal_type' => 'required|in:everyone,user,group',
            'rules.*.principal_id' => 'required|integer|min:0', 'rules.*.action' => 'required|in:' . implode(',', array_keys(DataAccess::ACTIONS)), 'rules.*.effect' => 'required|in:allow,deny'])->validate();
        $seen = []; $rows = [];
        foreach ($rules as $r) {
            if ($r['principal_type'] === 'user') DataSupport::user($r['principal_id']);
            if ($r['principal_type'] === 'group') abort_unless(DB::table('jn_data_groups')->where('id', $r['principal_id'])->exists(), 422, '工作组不存在。');
            $pid = $r['principal_type'] === 'everyone' ? 0 : (int) $r['principal_id'];
            $key = $r['principal_type'] . ':' . $pid . ':' . $r['action'];
            abort_if(isset($seen[$key]), 422, '同一人员或工作组的同一操作只能配置一次。'); $seen[$key] = true;
            $rows[] = ['scope_type' => $scope, 'scope_id' => $id, 'principal_type' => $r['principal_type'], 'principal_id' => $pid, 'action' => $r['action'], 'effect' => $r['effect']];
        }
        DB::table('jn_data_rules')->where('scope_type', $scope)->where('scope_id', $id)->delete();
        if ($rows) DB::table('jn_data_rules')->insert($rows);
    }

    public function save(User $user, string $key, string $kind, int $id, array $p): array
    {
        return $this->support->mutate($user, $key, "catalog:$kind:$id", $p, fn () => abort_unless(DataSupport::manager($user), 403, '需要资料中心配置权限。'), function () use ($user, $kind, $id, $p) {
            if ($kind === 'group') {
                validator($p, ['name' => 'required|string|max:80', 'members' => 'present|array|max:1000', 'members.*' => 'integer'])->validate();
                foreach ($p['members'] as $uid) DataSupport::user($uid);
                if ($id) DataSupport::revision(DB::table('jn_data_groups')->where('id', $id)->firstOrFail(), $p['revision'] ?? 0);
                abort_if(DB::table('jn_data_groups')->where('name', trim($p['name']))->when($id, fn ($q) => $q->where('id', '!=', $id))->exists(), 422, '工作组名称已存在。');
                $row = ['name' => trim($p['name']), 'updated_at' => now()];
                if ($id) DB::table('jn_data_groups')->where('id', $id)->update([...$row, 'revision' => DB::raw('revision + 1')]);
                else $id = DB::table('jn_data_groups')->insertGetId([...$row, 'created_at' => now()]);
                DB::table('jn_data_members')->where('group_id', $id)->delete();
                foreach (array_unique($p['members']) as $uid) DB::table('jn_data_members')->insert(['group_id' => $id, 'user_id' => $uid]);
            } elseif ($kind === 'category') {
                validator($p, ['name' => 'required|string|max:80', 'description' => 'nullable|string|max:2000', 'parent_id' => 'nullable|integer', 'position' => 'required|integer|min:0|max:10000', 'enabled' => 'required|boolean', 'fields' => 'present|array', 'rules' => 'present|array'])->validate();
                $old = $id ? DB::table('jn_data_categories')->where('id', $id)->firstOrFail() : null;
                if ($old) DataSupport::revision($old, $p['revision'] ?? 0);
                abort_if(DB::table('jn_data_categories')->where('name', trim($p['name']))->where('parent_id', $p['parent_id'] ?? null)->when($id, fn ($q) => $q->where('id', '!=', $id))->exists(), 422, '同一目录下已有相同名称的分类。');
                $parent = $p['parent_id'] ?? null; $trail = [];
                while ($parent) {
                    abort_if((int) $parent === $id || isset($trail[$parent]), 422, '目录不能放到自身或自己的下级中。'); $trail[$parent] = true;
                    abort_if(count($trail) > 10, 422, '目录层级过深，请使用更简洁的分类结构。');
                    $parent = DB::table('jn_data_categories')->where('id', $parent)->firstOrFail()->parent_id;
                }
                $fields = DataSchema::fields($p['fields'], $old ? DataSupport::decode($old->fields) : [], $id && DB::table('jn_data_records')->where('category_id', $id)->exists());
                $schemaChanged = $old && DataSupport::json($fields) !== $old->fields;
                $row = ['name' => trim($p['name']), 'description' => $p['description'] ?? '', 'parent_id' => $p['parent_id'] ?? null, 'position' => $p['position'], 'enabled' => $p['enabled'], 'fields' => DataSupport::json($fields), 'updated_at' => now()];
                if ($id) DB::table('jn_data_categories')->where('id', $id)->update([...$row, 'revision' => $old->revision + 1, 'schema_version' => $old->schema_version + ($schemaChanged ? 1 : 0)]);
                else $id = DB::table('jn_data_categories')->insertGetId([...$row, 'created_at' => now()]);
                $this->rules('category', $id, $p['rules']);
            } elseif ($kind === 'policy') {
                $record = DB::table('jn_data_records')->where('id', $id)->firstOrFail(); DataSupport::revision($record, $p['revision'] ?? 0);
                validator($p, ['mode' => 'required|in:inherit,custom', 'rules' => 'present|array'])->validate();
                $this->rules('record', $id, $p['mode'] === 'custom' ? $p['rules'] : []);
                DB::table('jn_data_records')->where('id', $id)->update(['policy_mode' => $p['mode'], 'revision' => $record->revision + 1, 'updated_at' => now()]);
            } else abort(404);
            $this->support->event($user, $kind === 'policy' ? 'record' : $kind, $id, '更新' . ['group' => '工作组', 'category' => '分类与字段权限', 'policy' => '资料权限'][$kind], ['configuration' => $p]);
            return ['id' => $id];
        });
    }
}
