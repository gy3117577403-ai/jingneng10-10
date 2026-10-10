<?php
namespace Tests\Feature;
use App\Models\User;
use App\Services\CompanyData\{DataAccess, DataCatalog, DataRecords, DataSupport};
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Queue, Storage};
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class JingnengCompanyDataTest extends TestCase
{
    private User $owner; private User $reviewer; private User $reader; private User $outsider; private int $cat;
    protected function setUp(): void
    {
        parent::setUp(); Storage::fake('local'); Queue::fake(); $this->withoutMiddleware(\App\Http\Middleware\CheckTaskStatus::class);
        foreach (['owner', 'reviewer', 'reader', 'outsider'] as $key) { $this->$key = User::factory()->create(); $this->$key->assignRole(Role::firstOrCreate(['name' => $key === 'owner' ? 'Admin' : '资料测试人员', 'guard_name' => 'web'])); }
        $this->cat = DB::table('jn_data_categories')->insertGetId(['name' => '虚构测试分类', 'fields' => DataSupport::json($this->fields()), 'created_at' => now(), 'updated_at' => now()]);
        $this->rules(); $this->actingAs($this->owner);
    }
    private function fields(): array { return [['key' => 'amount', 'label' => '数量', 'type' => 'number', 'required' => true, 'options' => []], ['key' => 'summary', 'label' => '备注', 'type' => 'text', 'required' => false, 'options' => []]]; }
    private function key(): string { return (string) Str::uuid(); }
    private function rules(array $reader = ['discover', 'view'], array $extra = []): void
    {
        $rules = []; foreach ([$this->owner, $this->reviewer] as $u) foreach (array_keys(DataAccess::ACTIONS) as $a) $rules[] = ['principal_type' => 'user', 'principal_id' => $u->id, 'action' => $a, 'effect' => 'allow'];
        foreach ($reader as $a) $rules[] = ['principal_type' => 'user', 'principal_id' => $this->reader->id, 'action' => $a, 'effect' => 'allow'];
        app(DataCatalog::class)->rules('category', $this->cat, [...$rules, ...$extra]);
    }
    private function fixture(string $code = 'DEMO-001', string $kind = 'ledger'): int
    { return app(DataRecords::class)->create($this->owner, $this->cat, ['code' => $code, 'kind' => $kind, 'title' => '虚构版本一', 'values' => ['amount' => '0', 'summary' => '内部内容'], 'note' => '演示初始版本']); }
    private function record(int $id): object { return DB::table('jn_data_records')->find($id); }
    private function send(string $path, array $p = [], ?string $key = null) { return $this->postJson('/company-data/api/' . $path, [...$p, 'request_key' => $key ?? $this->key()]); }
    private function action(int $id, string $action, array $p = []) { return $this->send("records/$id/$action", ['revision' => $this->record($id)->revision, ...$p]); }
    private function publish(int $id): int
    {
        $this->actingAs($this->owner); $this->action($id, 'submit', ['note' => '提交虚构资料', 'reviewer_id' => $this->reviewer->id])->assertOk();
        $this->actingAs($this->reviewer); $this->action($id, 'approve', ['note' => '已核对'])->assertOk(); $this->actingAs($this->owner); return $this->record($id)->published_version_id;
    }
    private function revise(int $id, string $title = '虚构版本二') { return $this->action($id, 'save', ['title' => $title, 'values' => ['amount' => '2', 'summary' => '新内容'], 'file_ids' => [], 'note' => '更新资料']); }
    public function test_default_deny_includes_admin_and_tree_position_does_not_grant_access(): void
    {
        $id = $this->fixture(); $this->publish($id);
        $this->actingAs($this->outsider); $this->getJson('/company-data/api')->assertOk()->assertJsonCount(0, 'items'); $this->getJson("/company-data/api/records/$id")->assertForbidden();
        $parent = DB::table('jn_data_categories')->insertGetId(['name' => '父目录', 'fields' => '[]']); DB::table('jn_data_categories')->where('id', $this->cat)->update(['parent_id' => $parent]);
        app(DataCatalog::class)->rules('category', $parent, [['principal_type' => 'everyone', 'principal_id' => 0, 'action' => 'view', 'effect' => 'allow']]);
        $this->getJson("/company-data/api/records/$id")->assertForbidden();
        app(DataCatalog::class)->rules('category', $this->cat, []); $this->actingAs($this->owner); $this->getJson('/company-data/api/configuration')->assertOk(); $this->getJson("/company-data/api/records/$id")->assertForbidden();
    }
    public function test_draft_is_private_and_published_content_survives_revision_review_rejection(): void
    {
        $id = $this->fixture(); $this->actingAs($this->reader); $this->getJson('/company-data/api')->assertJsonCount(0, 'items');
        $old = $this->publish($id); $this->revise($id)->assertOk(); $draft = $this->record($id)->draft_version_id;
        $this->actingAs($this->reader); $this->getJson("/company-data/api/records/$id")->assertJsonPath('version.id', $old)->assertJsonPath('version.values.amount', '0');
        $this->getJson("/company-data/api/records/$id?version=$draft")->assertForbidden();
        $this->actingAs($this->owner); $this->action($id, 'submit', ['reviewer_id' => $this->owner->id, 'note' => '不允许自审'])->assertUnprocessable();
        $this->action($id, 'submit', ['reviewer_id' => $this->reviewer->id, 'note' => '审核'])->assertOk(); $this->revise($id)->assertUnprocessable();
        $this->action($id, 'approve', ['note' => '其他人不能代审'])->assertForbidden();
        $this->actingAs($this->reviewer); $this->action($id, 'reject', ['note' => '补充'])->assertOk();
        $this->assertSame($old, (int) $this->record($id)->published_version_id); $this->assertDatabaseHas('jn_data_versions', ['id' => $old, 'title' => '虚构版本一', 'state' => 'published']);
        $this->actingAs($this->owner); $this->revise($id, '已补充版本')->assertOk(); $this->publish($id);
        $this->actingAs($this->reader); $this->getJson("/company-data/api/records/$id")->assertJsonPath('version.title', '已补充版本'); $this->getJson("/company-data/api/records/$id?version=$old")->assertOk();
    }
    public function test_duplicate_requests_are_idempotent_stale_writes_preserve_all_versions_and_revocation_applies_to_retry(): void
    {
        $p = ['category_revision' => 1, 'code' => 'IDEMPOTENT', 'kind' => 'ledger', 'title' => '不重复', 'values' => ['amount' => '1'], 'note' => '建立']; $key = $this->key();
        $id = $this->send("records/$this->cat/create", $p, $key)->assertOk()->json('id'); $this->send("records/$this->cat/create", $p, $key)->assertOk()->assertJsonPath('id', $id);
        $this->send("records/$this->cat/create", [...$p, 'title' => '换了内容'], $key)->assertConflict();
        $revision = $this->record($id)->revision; $this->revise($id)->assertOk();
        $this->send("records/$id/save", ['revision' => $revision, 'title' => '过时写入', 'values' => ['amount' => '8'], 'file_ids' => [], 'note' => '过期'])->assertConflict();
        $this->assertSame(2, DB::table('jn_data_versions')->where('record_id', $id)->count());
        app(DataCatalog::class)->rules('category', $this->cat, []); $this->send("records/$this->cat/create", $p, $key)->assertForbidden();
    }
    public function test_file_previews_require_authorized_version_and_original_download_is_separate(): void
    {
        $id = $this->fixture('FILE', 'file');
        $this->action($id, 'submit', ['reviewer_id' => $this->reviewer->id, 'note' => '无附件'])->assertUnprocessable();
        $file = UploadedFile::fake()->createWithContent('原件.txt', '不可直接下载的演示原件');
        $fid = $this->send("records/$id/files", ['revision' => $this->record($id)->revision, 'file' => $file])->assertOk()->json('file_id');
        $version = $this->publish($id); $this->actingAs($this->reader);
        $url = "/company-data/api/records/$id/versions/$version/files/$fid";
        $this->getJson($url)->assertOk()->assertJsonPath('text', '不可直接下载的演示原件'); $this->get($url . '?download=1')->assertForbidden();
        $other = $this->fixture('OTHER'); $this->getJson("/company-data/api/records/$other/versions/$version/files/$fid")->assertForbidden();
        $this->actingAs($this->owner); $response = $this->get($url . '?download=1')->assertOk()->assertDownload();
        $this->assertStringContainsString(rawurlencode('原件.txt'), $response->headers->get('Content-Disposition'));
        $this->revise($id)->assertOk(); $new = $this->record($id)->draft_version_id; $this->get($url)->assertOk();
        $this->getJson("/company-data/api/records/$id/versions/$new/files/$fid")->assertNotFound();
        $this->actingAs($this->outsider); $this->getJson($url)->assertForbidden();
    }
    public function test_temporary_access_is_exact_version_read_only_expires_and_can_be_revoked(): void
    {
        $this->rules(['discover', 'request']); $id = $this->fixture(); $old = $this->publish($id); $this->actingAs($this->reader);
        $this->getJson("/company-data/api/records/$id")->assertOk()->assertJsonPath('readable', false)->assertJsonMissingPath('version.values');
        $request = $this->send("collaboration/$id/request", ['days' => 7, 'reason' => '核对依据', 'approver_id' => $this->owner->id])->assertOk()->json('id');
        $this->actingAs($this->reviewer); $this->send("collaboration/$request/access-action", ['revision' => 1, 'decision' => 'approve', 'note' => '错误审批人'])->assertForbidden();
        $this->actingAs($this->owner); $this->send("collaboration/$request/access-action", ['revision' => 1, 'decision' => 'approve', 'note' => '授权7天'])->assertOk();
        $this->revise($id)->assertOk(); $new = $this->publish($id);
        $this->actingAs($this->reader); $this->getJson("/company-data/api/records/$id")->assertJsonPath('version.id', $old)->assertJsonPath('readable', true)->assertJsonPath('abilities.download', false)->assertJsonPath('abilities.edit', false);
        $this->getJson("/company-data/api/records/$id?version=$new")->assertForbidden();
        $this->travel(8)->days(); $this->getJson("/company-data/api/records/$id?version=$old")->assertForbidden(); $this->travelBack();
        $this->actingAs($this->owner); $this->send("collaboration/$request/access-action", ['revision' => 2, 'decision' => 'revoke', 'note' => '任务已结束'])->assertOk();
        $this->actingAs($this->reader); $this->getJson("/company-data/api/records/$id?version=$old")->assertForbidden();
    }
    public function test_explicit_deny_wins_over_group_and_individual_allow(): void
    {
        $id = $this->fixture(); $this->publish($id); $g = DB::table('jn_data_groups')->insertGetId(['name' => '测试组']); DB::table('jn_data_members')->insert(['group_id' => $g, 'user_id' => $this->reader->id]);
        $this->rules(['discover', 'view', 'request'], [['principal_type' => 'group', 'principal_id' => $g, 'action' => 'view', 'effect' => 'deny']]);
        $this->actingAs($this->reader); $this->getJson("/company-data/api/records/$id")->assertJsonPath('readable', false);
        $this->send("collaboration/$id/request", ['days' => 1, 'reason' => '不能覆盖禁止', 'approver_id' => $this->owner->id])->assertUnprocessable();
    }
    public function test_tasks_and_comments_are_persisted_version_bound_and_rechecked_after_revocation(): void
    {
        $id = $this->fixture(); $version = $this->publish($id);
        $p = ['version_id' => $version, 'title' => '核对演示', 'description' => '核对附件', 'due_date' => today()->addDay()->format('Y-m-d'), 'assignee_id' => $this->reader->id];
        $this->send("collaboration/$id/task", $p)->assertUnprocessable();
        $tid = $this->send("collaboration/$id/task", [...$p, 'assignee_id' => $this->reviewer->id])->assertOk()->json('id');
        $this->actingAs($this->reviewer); $this->send("collaboration/$id/comment", ['version_id' => $version, 'body' => '已核对原版'])->assertOk();
        $this->send("collaboration/$tid/task-action", ['revision' => 1, 'decision' => 'accept', 'result' => '开始'])->assertOk();
        $this->send("collaboration/$tid/task-action", ['revision' => 2, 'decision' => 'block', 'result' => '补充附件'])->assertOk();
        $this->actingAs($this->owner); $this->revise($id)->assertOk(); $this->publish($id);
        $this->actingAs($this->reviewer); $this->getJson("/company-data/api/records/$id?version=$version")->assertJsonPath('comments.0.body', '已核对原版');
        $this->getJson("/company-data/api/records/$id")->assertJsonCount(0, 'comments');
        $this->getJson('/company-data/api/collaboration')->assertJsonFragment(['version_id' => $version, 'state' => 'blocked']);
        app(DataCatalog::class)->rules('category', $this->cat, []); $this->send("collaboration/$tid/task-action", ['revision' => 3, 'decision' => 'complete', 'result' => '不能越权'])->assertForbidden(); $this->getJson('/company-data/api/collaboration')->assertJsonCount(0, 'items');
    }
    public function test_catalog_cycle_schema_changes_and_incorrect_values_are_rejected(): void
    {
        $id = $this->fixture();
        $this->action($id, 'save', ['title' => '错误类型', 'values' => ['amount' => 'abc'], 'file_ids' => [], 'note' => '错误'])->assertUnprocessable();
        $payload = ['revision' => 1, 'name' => '测试分类', 'parent_id' => $this->cat, 'position' => 0, 'enabled' => true, 'fields' => $this->fields(), 'rules' => []];
        $this->send("catalog/category/$this->cat", $payload)->assertUnprocessable();
        $this->send("catalog/category/$this->cat", [...$payload, 'parent_id' => null, 'fields' => []])->assertUnprocessable();
        $this->send("catalog/category/$this->cat", [...$payload, 'parent_id' => null, 'fields' => [...$this->fields(), ['key' => 'amount', 'label' => '重复键', 'type' => 'text', 'required' => false]]])->assertUnprocessable();
        $this->actingAs($this->reader); $this->getJson('/company-data/api/configuration')->assertForbidden();
    }
    public function test_import_maps_and_validates_before_atomic_commit_and_undo(): void
    {
        $csv = "编号,名称,数量,备注\nIMP-1,导入一,0,虚构\nIMP-2,导入二,2,测试\n";
        $batch = $this->send("imports/stage/$this->cat", ['file' => UploadedFile::fake()->createWithContent('虚构台账.csv', $csv)])->assertOk()->json('id');
        $this->assertSame(0, DB::table('jn_data_records')->count());
        $this->getJson("/company-data/api/imports/$batch")->assertOk()->assertJsonPath('rows.0.values.amount', '0')->assertJsonCount(0, 'rows.0.errors');
        $key = $this->key(); $this->send("imports/$batch", ['action' => 'commit'], $key)->assertOk(); $this->send("imports/$batch", ['action' => 'commit'], $key)->assertOk(); $this->assertSame(2, DB::table('jn_data_records')->count());
        $this->send("imports/$batch", ['action' => 'undo'])->assertOk(); $this->assertSame(2, DB::table('jn_data_records')->where('archived', true)->count());
        $this->actingAs($this->reviewer); $this->getJson("/company-data/api/imports/$batch")->assertForbidden();
    }
    public function test_invalid_import_duplicate_and_modified_batch_undo_never_partially_write(): void
    {
        $id = $this->fixture('EXISTS');
        $batch = $this->send("imports/stage/$this->cat", ['file' => UploadedFile::fake()->createWithContent('错误.csv', "编号,名称,数量\nEXISTS,重复,1\nNEW,错误数字,xx\n")])->assertOk()->json('id');
        $this->send("imports/$batch", ['action' => 'commit'])->assertUnprocessable(); $this->assertSame(1, DB::table('jn_data_records')->count());
        $batch2 = $this->send("imports/stage/$this->cat", ['file' => UploadedFile::fake()->createWithContent('正确.csv', "编号,名称,数量\nNEW-A,第一,1\nNEW-B,第二,2\n")])->assertOk()->json('id');
        $this->send("imports/$batch2", ['action' => 'commit'])->assertOk(); $new = DB::table('jn_data_records')->where('code', 'NEW-B')->value('id'); $this->revise($new)->assertOk();
        $this->send("imports/$batch2", ['action' => 'undo'])->assertUnprocessable(); $this->assertSame(0, DB::table('jn_data_records')->where('archived', true)->count());
    }
    public function test_export_respects_record_policy_and_escapes_spreadsheet_formulas(): void
    {
        $id = $this->fixture('=DANGER'); $this->publish($id); $other = $this->fixture('PRIVATE'); $this->publish($other);
        DB::table('jn_data_records')->where('id', $other)->update(['policy_mode' => 'custom']);
        $response = $this->get("/company-data/api/export/$this->cat")->assertOk(); $csv = $response->streamedContent();
        $this->assertStringContainsString("'=DANGER", $csv); $this->assertStringNotContainsString('PRIVATE', $csv);
        $this->actingAs($this->reader); $this->get("/company-data/api/export/$this->cat")->assertForbidden();
    }
    public function test_group_removal_revokes_access_and_archiving_hides_records_from_readers(): void
    {
        $id = $this->fixture(); $this->publish($id); $this->action($id, 'archive')->assertOk(); $this->actingAs($this->reader); $this->getJson("/company-data/api/records/$id")->assertForbidden();
        $this->actingAs($this->owner); $this->action($id, 'restore')->assertOk();
        $g = $this->send('catalog/group/0', ['name' => '演示查看组', 'members' => [$this->reader->id]])->assertOk()->json('id');
        $this->rules([], [['principal_type' => 'group', 'principal_id' => $g, 'action' => 'view', 'effect' => 'allow']]);
        $this->actingAs($this->reader); $this->getJson("/company-data/api/records/$id")->assertOk(); $this->actingAs($this->owner);
        $this->send("catalog/group/$g", ['name' => '演示查看组', 'members' => [], 'revision' => 1])->assertOk(); $this->actingAs($this->reader); $this->getJson("/company-data/api/records/$id")->assertForbidden();
    }
    public function test_xlsx_preserves_text_codes_and_rejects_formulas_without_evaluation(): void
    {
        $book = new \PhpOffice\PhpSpreadsheet\Spreadsheet(); $sheet = $book->getActiveSheet();
        $sheet->fromArray([['编号', '名称', '数量'], ['00001', '虚构表格', 0]]);
        $sheet->setCellValueExplicit('A2', '00001', \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING);
        $sheet->setCellValueExplicit('C2', 0, \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_NUMERIC);
        $path = tempnam(sys_get_temp_dir(), 'jn-xlsx-');
        try {
            (new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($book))->save($path);
            $id = $this->send("imports/stage/$this->cat", ['file' => new UploadedFile($path, '测试.xlsx', null, null, true)])->assertOk()->json('id');
            $this->getJson("/company-data/api/imports/$id")->assertJsonPath('rows.0.code', '00001')->assertJsonPath('rows.0.values.amount', '0');
            $sheet->setCellValue('C2', '=1+1'); (new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($book))->save($path);
            $this->send("imports/stage/$this->cat", ['file' => new UploadedFile($path, '含公式.xlsx', null, null, true)])->assertUnprocessable();
            $this->assertSame(1, DB::table('jn_data_imports')->count());
        } finally { if (is_file($path)) unlink($path); $book->disconnectWorksheets(); }
    }
    public function test_wrong_file_mime_and_pending_schema_drift_are_rejected(): void
    {
        $id = $this->fixture(); $png = UploadedFile::fake()->image('image.png', 20, 20);
        $this->send("records/$id/files", ['revision' => $this->record($id)->revision, 'file' => new UploadedFile($png->getRealPath(), 'fake.pdf', null, null, true)])->assertUnprocessable();
        $this->assertSame(0, DB::table('jn_data_files')->count());
        $fid = $this->send("records/$id/files", ['revision' => $this->record($id)->revision, 'file' => $png])->assertOk()->json('file_id');
        $v = $this->record($id)->draft_version_id; $this->get("/company-data/api/records/$id/versions/$v/files/$fid")->assertOk()->assertHeader('Content-Type', 'image/png');
        $this->action($id, 'submit', ['reviewer_id' => $this->reviewer->id, 'note' => '提交'])->assertOk();
        DB::table('jn_data_categories')->where('id', $this->cat)->increment('schema_version');
        $this->actingAs($this->reviewer); $this->action($id, 'approve', ['note' => '不能忽略结构变化'])->assertConflict();
        $this->assertNull($this->record($id)->published_version_id);
    }

    private function readingFile(int $id, string $text = '阀门校准每三十天一次，演示数据。', string $name = '阅读.txt'): int
    {
        $fid = $this->send("records/$id/files", ['revision' => $this->record($id)->revision, 'file' => UploadedFile::fake()->createWithContent($name, $text)])->assertOk()->json('file_id');
        app(\App\Services\CompanyData\DataDocuments::class)->process($fid);
        return $fid;
    }
    public function test_body_search_defaults_to_current_published_version_and_rechecks_permissions(): void
    {
        $id = $this->fixture(); $fid = $this->readingFile($id); $this->getJson('/company-data/api/search?q=阀门')->assertJsonCount(0, 'items'); $old = $this->publish($id);
        $this->actingAs($this->reader); $this->getJson('/company-data/api/search?q=阀门')->assertOk()->assertJsonPath('items.0.file_id', $fid)->assertJsonPath('items.0.version_id', $old)->assertJsonMissingPath('items.0.body');
        $this->actingAs($this->owner); $this->revise($id)->assertOk(); $this->publish($id);
        $this->getJson('/company-data/api/search?q=阀门')->assertJsonCount(0, 'items');
        $this->getJson('/company-data/api/search?q=阀门&history=1')->assertJsonPath('items.0.historical', true);
        $this->rules(['discover']); $this->actingAs($this->reader);
        $this->getJson('/company-data/api/search?q=阀门&history=1')->assertJsonCount(0, 'items')->assertJsonPath('incomplete_files', 0);
        $this->getJson("/company-data/api/records/$id/versions/$old/files/$fid")->assertForbidden();
        $this->actingAs($this->owner); app(DataCatalog::class)->rules('category', $this->cat, []);
        $this->getJson('/company-data/api/search?q=阀门&history=1')->assertJsonCount(0, 'items');
    }
    public function test_reading_recovery_is_idempotent_and_failure_retry_does_not_change_original(): void
    {
        $id = $this->fixture(); $fid = $this->readingFile($id); $d = app(\App\Services\CompanyData\DataDocuments::class);
        $before = DB::table('jn_data_chunks')->count(); $d->enqueue($fid); $d->process($fid); $this->assertSame($before, DB::table('jn_data_chunks')->count());
        $hash = DB::table('jn_data_files')->where('id', $fid)->value('sha256');
        DB::table('jn_data_documents')->where('file_id', $fid)->update(['state' => 'processing', 'lease' => 'old', 'attempts' => 3, 'updated_at' => now()->subMinutes(5)]);
        $d->recover(); $this->assertDatabaseHas('jn_data_documents', ['file_id' => $fid, 'state' => 'failed']);
        $v = $this->record($id)->draft_version_id; $path = "records/$id/versions/$v/files/$fid/retry"; $key = $this->key();
        $this->send($path, [], $key)->assertOk(); $this->send($path, [], $key)->assertOk(); $d->process($fid);
        $this->assertDatabaseHas('jn_data_documents', ['file_id' => $fid, 'state' => 'ready']); $this->assertSame($before, DB::table('jn_data_chunks')->count());
        $this->assertSame($hash, DB::table('jn_data_files')->where('id', $fid)->value('sha256'));
        $this->actingAs($this->reader); $this->send($path)->assertForbidden();
    }
    public function test_spreadsheet_preview_preserves_positions_zero_values_and_formula_cache_without_calculation(): void
    {
        $id = $this->fixture(); $book = new \PhpOffice\PhpSpreadsheet\Spreadsheet(); $sheet = $book->getActiveSheet(); $sheet->setTitle('设备档案');
        $sheet->setCellValueExplicit('A1', '00007', \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING); $sheet->setCellValue('B1', 0);
        $sheet->setCellValue('C1', '=WEBSERVICE("https://invalid.example/private")'); $sheet->getCell('C1')->setCalculatedValue('保存的结果');
        $sheet->setCellValue('A51', '定位第51行'); $book->createSheet()->setTitle('检查记录')->setCellValue('A1', '每三十天检查');
        $path = tempnam(sys_get_temp_dir(), 'reading-');
        try {
            $writer = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($book); $writer->setPreCalculateFormulas(false); $writer->save($path);
            $fid = $this->readingFile($id, file_get_contents($path), '档案.xlsx');
        } finally { unlink($path); $book->disconnectWorksheets(); }
        $this->assertDatabaseHas('jn_data_documents', ['file_id' => $fid, 'state' => 'ready']); $v = $this->publish($id); $this->actingAs($this->reader);
        $url = "/company-data/api/records/$id/versions/$v/files/$fid";
        $this->getJson($url)->assertJsonPath('type', 'sheet')->assertJsonPath('rows.0.0', '00007')->assertJsonPath('rows.0.1', '0');
        $this->getJson($url . '?row=51')->assertJsonPath('start', 51)->assertJsonPath('rows.0.0', '定位第51行');
        $this->getJson($url . '?page=2')->assertJsonPath('name', '检查记录'); $this->getJson($url . '?page=3')->assertUnprocessable();
        $this->getJson('/company-data/api/search?q=定位')->assertJsonPath('items.0.row', 51)->assertJsonPath('items.0.page', 1);
        $this->get($url . '?download=1')->assertForbidden();
    }
    public function test_images_and_unsupported_files_are_not_reported_as_searchable_text_and_corrupt_office_is_retryable(): void
    {
        $id = $this->fixture(); $png = UploadedFile::fake()->image('scan.png', 10, 10);
        $fid = $this->send("records/$id/files", ['revision' => $this->record($id)->revision, 'file' => $png])->assertOk()->json('file_id');
        app(\App\Services\CompanyData\DataDocuments::class)->process($fid); $this->assertDatabaseHas('jn_data_documents', ['file_id' => $fid, 'state' => 'no_text', 'chunks' => 0]);
        $bad = $this->readingFile($id, 'not a zip file', '损坏.docx'); $this->assertDatabaseHas('jn_data_documents', ['file_id' => $bad, 'state' => 'failed']);
        $v = $this->publish($id); $this->getJson("/company-data/api/records/$id/versions/$v/files/$bad")->assertJsonPath('type', 'processing')->assertJsonPath('state', 'failed');
        $this->getJson('/company-data/api/search?q=anything')->assertJsonPath('incomplete_files', 2);
    }
    public function test_search_treats_wildcards_as_literal_and_paginates_utf8_lines(): void
    {
        $id = $this->fixture(); $this->readingFile($id, "字面%_!内容\n" . str_repeat("普通行\n", 220) . '结尾标记'); $v = $this->publish($id);
        $this->getJson('/company-data/api/search?q=' . urlencode('%_!'))->assertJsonCount(1, 'items');
        $result = $this->getJson('/company-data/api/search?q=结尾标记')->assertJsonCount(1, 'items')->json('items.0');
        $this->assertGreaterThan(200, $result['row']);
        $this->getJson("/company-data/api/records/$id/versions/$v/files/{$result['file_id']}?row={$result['row']}")->assertJsonPath('start', 201);
    }
}
