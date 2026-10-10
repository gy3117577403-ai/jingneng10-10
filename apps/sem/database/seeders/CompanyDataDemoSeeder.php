<?php
namespace Database\Seeders;
use App\Models\User;
use App\Services\CompanyData\{DataAccess, DataCatalog, DataRecords, DataSupport};
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\{DB, Hash, Storage};
use Spatie\Permission\Models\Role;
/** Fictional fixtures only; never reset existing categories, records, rules or credentials. */
class CompanyDataDemoSeeder extends Seeder
{
    public function run(): void
    {
        if (DB::table('jn_data_categories')->exists()) return;
        $admin = User::where('email', env('JINGNENG_DEMO_EMAIL', 'admin@jingneng.demo'))->firstOrFail();
        $password = env('JINGNENG_DEMO_PASSWORD'); if (!$password || strlen($password) < 16) throw new \RuntimeException('Local demo password required.');
        DB::transaction(function () use ($admin, $password) {
            $role = Role::firstOrCreate(['name' => '资料协作演示', 'guard_name' => 'web']);
            $people = [];
            foreach (['reviewer' => '资料审核员（演示）', 'reader' => '资料查阅员（演示）'] as $key => $name) {
                $u = User::firstOrCreate(['email' => 'data-' . $key . '@jingneng.demo'], ['name' => $name, 'password' => Hash::make($password), 'email_verified_at' => now()]); $u->assignRole($role); $people[$key] = $u;
            }
            $maintainers = DB::table('jn_data_groups')->insertGetId(['name' => '资料维护组（虚构演示）', 'created_at' => now(), 'updated_at' => now()]);
            foreach ([$admin->id, $people['reviewer']->id] as $uid) DB::table('jn_data_members')->insert(['group_id' => $maintainers, 'user_id' => $uid]);
            $all = array_map(fn ($action) => ['principal_type' => 'group', 'principal_id' => $maintainers, 'action' => $action, 'effect' => 'allow'], array_keys(DataAccess::ACTIONS));
            $root = DB::table('jn_data_categories')->insertGetId(['name' => '演示资料空间', 'description' => '全部为虚构演示，不代表企业实际组织或权限。', 'fields' => '[]', 'created_at' => now(), 'updated_at' => now()]);
            foreach (['guide' => '制度与作业指引（虚构）', 'ledger' => '通用业务台账（虚构）', 'limited' => '限时查阅资料（虚构）'] as $key => $name) {
                $fields = $key === 'ledger' ? [['key' => 'reference', 'label' => '关联编号', 'type' => 'text', 'required' => false, 'options' => []], ['key' => 'due_date', 'label' => '有效日期', 'type' => 'date', 'required' => true, 'options' => []], ['key' => 'status', 'label' => '处理状态', 'type' => 'select', 'required' => true, 'options' => ['待核对', '已核对']]] : [['key' => 'summary', 'label' => '说明', 'type' => 'multiline', 'required' => false, 'options' => []]];
                $cat = DB::table('jn_data_categories')->insertGetId(['name' => $name, 'parent_id' => $root, 'description' => '用于体验资料版本、权限和协作，内容均为虚构。', 'fields' => DataSupport::json($fields), 'created_at' => now(), 'updated_at' => now()]);
                $rules = [...$all, ['principal_type' => 'user', 'principal_id' => $people['reader']->id, 'action' => 'discover', 'effect' => 'allow'], ['principal_type' => 'user', 'principal_id' => $people['reader']->id, 'action' => $key === 'limited' ? 'request' : 'view', 'effect' => 'allow']];
                app(DataCatalog::class)->rules('category', $cat, $rules);
                $rid = app(DataRecords::class)->create($admin, $cat, ['code' => 'DEMO-DATA-' . strtoupper($key), 'kind' => $key === 'ledger' ? 'ledger' : 'file', 'title' => ['guide' => '设备点检作业指引（虚构演示）', 'ledger' => '演示事项核对记录', 'limited' => '供应商资料样例（虚构演示）'][$key], 'values' => $key === 'ledger' ? ['reference' => 'DEMO-001', 'due_date' => today()->addDays(30)->format('Y-m-d'), 'status' => '待核对'] : ['summary' => '仅用于功能验收，请勿作为实际作业依据。'], 'note' => '初始化虚构演示']);
                $r = DB::table('jn_data_records')->find($rid); $vid = $r->draft_version_id; $ids = [];
                if ($key !== 'ledger') {
                    $text = "虚构演示资料\n\n该文件只用于体验在线预览、版本发布与权限控制。\n不含企业真实制度、合同或生产数据。\n";
                    $path = 'company-data/originals/demo-' . $rid . '.txt'; Storage::disk('local')->put($path, $text);
                    $ids[] = DB::table('jn_data_files')->insertGetId(['record_id' => $rid, 'uploaded_by' => $admin->id, 'filename' => '虚构资料说明.txt', 'extension' => 'txt', 'mime' => 'text/plain', 'path' => $path, 'size' => strlen($text), 'sha256' => hash('sha256', $text), 'created_at' => now()]);
                }
                DB::table('jn_data_versions')->where('id', $vid)->update(['state' => 'published', 'file_ids' => DataSupport::json($ids), 'published_at' => now(), 'reviewer_id' => $people['reviewer']->id]);
                DB::table('jn_data_records')->where('id', $rid)->update(['draft_version_id' => null, 'published_version_id' => $vid]);
                app(DataSupport::class)->event($admin, 'record', $rid, '初始化演示发布版', [], $vid);
            }
        });
    }
}
