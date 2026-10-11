<?php
namespace Tests\Feature;
use App\Models\User;
use App\Services\CompanyData\{DataAccess, DataAssistant, DataCatalog, DataRecords, DataSupport};
use App\Services\CompanyData\Assistant\{AnswerContract, ExcerptProvider};
use Illuminate\Support\Facades\{DB, Http, Queue, Storage};
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class JingnengDataAssistantTest extends TestCase
{
    private User $owner; private User $reviewer; private User $reader; private User $outsider; private int $cat; private int $record; private int $version;
    protected function setUp(): void
    {
        parent::setUp(); Queue::fake(); Storage::fake('local'); Http::preventStrayRequests();
        $this->withoutMiddleware(\App\Http\Middleware\CheckTaskStatus::class);
        foreach (['owner', 'reviewer', 'reader', 'outsider'] as $name) { $this->$name = User::factory()->create(); $this->$name->assignRole(Role::firstOrCreate(['name' => $name === 'owner' ? 'Admin' : '资料测试人员', 'guard_name' => 'web'])); }
        $this->cat = DB::table('jn_data_categories')->insertGetId(['name' => '助手测试（虚构）', 'fields' => DataSupport::json([['key' => 'note', 'label' => '说明', 'type' => 'text', 'required' => false, 'options' => []]])]);
        $this->rules();
        $this->record = app(DataRecords::class)->create($this->owner, $this->cat, ['code' => 'DEMO-AS-001', 'kind' => 'ledger', 'title' => '现场核对（虚构）', 'values' => ['note' => '设备点检必须确认密封情况。'], 'note' => '首次建立']);
        $this->version = $this->publish(); $this->actingAs($this->reader);
    }
    private function rules(bool $allow = true): void
    {
        $rules = [];
        foreach ([$this->owner, $this->reviewer] as $user) foreach (array_keys(DataAccess::ACTIONS) as $a) $rules[] = ['principal_type' => 'user', 'principal_id' => $user->id, 'action' => $a, 'effect' => 'allow'];
        foreach ($allow ? ['discover', 'view'] : ['discover'] as $a) $rules[] = ['principal_type' => 'user', 'principal_id' => $this->reader->id, 'action' => $a, 'effect' => 'allow'];
        app(DataCatalog::class)->rules('category', $this->cat, $rules);
    }
    private function send(string $path, array $input = [], ?string $key = null) { return $this->postJson('/company-data/api/' . $path, [...$input, 'request_key' => $key ?? (string) Str::uuid()]); }
    private function publish(): int
    {
        $this->actingAs($this->owner); $revision = fn () => DB::table('jn_data_records')->where('id', $this->record)->value('revision');
        $this->send("records/$this->record/submit", ['revision' => $revision(), 'reviewer_id' => $this->reviewer->id, 'note' => '虚构核对'])->assertOk();
        $this->actingAs($this->reviewer); $this->send("records/$this->record/approve", ['revision' => $revision(), 'note' => '已核对'])->assertOk();
        return (int) DB::table('jn_data_records')->where('id', $this->record)->value('published_version_id');
    }
    private function ask(array $extra = [], ?string $key = null) { return $this->send('assistant/ask', ['question' => '现场核对有哪些要求？', 'mode' => 'excerpt', 'include_history' => false, 'category_id' => $this->cat, ...$extra], $key); }
    private function detail(int $id) { return $this->getJson("/company-data/api/assistant/conversations/$id"); }
    private function completed(array $extra = []): array
    {
        $ids = $this->ask($extra)->assertOk()->json(); app(DataAssistant::class)->process($ids['run_id']); return [$ids, $this->detail($ids['id'])->assertOk()->json('runs.0')];
    }
    public function test_reserved_model_never_calls_network_or_silently_falls_back(): void
    {
        $this->getJson('/company-data/api/assistant')->assertOk()->assertJsonPath('capabilities.openai', false)->assertJsonPath('capabilities.external_requests', false);
        $this->ask(['mode' => 'openai'])->assertStatus(409); $this->assertDatabaseCount('jn_data_answers', 0);
        $this->ask(['mode' => 'demo'])->assertUnprocessable();
        [$ids, $run] = $this->completed(['mode' => 'demo', 'demo_ack' => true]);
        $this->assertSame('demo', $run['mode']); $this->assertSame('ready', $run['state']);
        config(['company_data.assistant_demo' => false]); $this->ask(['mode' => 'demo', 'demo_ack' => true])->assertUnprocessable();
        Http::assertNothingSent();
    }
    public function test_private_conversations_exact_citations_and_idempotent_submission(): void
    {
        $key = (string) Str::uuid(); $ids = $this->ask([], $key)->assertOk()->json();
        $this->assertSame($ids, $this->ask([], $key)->assertOk()->json());
        $this->ask(['question' => '其他内容'], $key)->assertStatus(409); $this->assertDatabaseCount('jn_data_answers', 1);
        app(DataAssistant::class)->process($ids['run_id']); $run = $this->detail($ids['id'])->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json('runs.0');
        $this->assertSame('ready', $run['state']); $this->assertSame($this->version, $run['sources'][0]['version_id']);
        $this->assertSame('S1', $run['answer']['paragraphs'][0]['citations'][0]['source_id']);
        $this->assertArrayNotHasKey('body', $run['sources'][0]);
        $this->actingAs($this->owner); $this->detail($ids['id'])->assertNotFound();
        $this->getJson('/company-data/api/assistant')->assertJsonCount(0, 'items');
        $this->send("assistant/items/{$ids['run_id']}/cancel")->assertNotFound();
        $this->actingAs($this->reader); $this->send("assistant/items/{$ids['run_id']}/feedback", ['feedback' => 'helpful'])->assertOk();
        $this->detail($ids['id'])->assertJsonPath('runs.0.feedback', 'helpful');
    }
    public function test_revoked_permissions_remove_answer_sources_and_feedback_from_history(): void
    {
        [$ids] = $this->completed(); $this->rules(false);
        $this->detail($ids['id'])->assertOk()->assertJsonPath('runs.0.state', 'restricted')->assertJsonPath('runs.0.answer', null)->assertJsonCount(0, 'runs.0.sources')->assertJsonPath('runs.0.retrieval', null);
        $this->send("assistant/items/{$ids['run_id']}/feedback", ['feedback' => 'helpful'])->assertStatus(409);
        [$other, $run] = $this->completed(); $this->assertSame('no_sources', $run['state']); $this->assertSame([], $run['answer']);
        $this->rules(); $this->detail($ids['id'])->assertJsonPath('runs.0.state', 'ready');
    }
    public function test_permission_change_before_delivery_hides_the_entire_answer(): void
    {
        $cat = $this->cat; $reader = $this->reader->id;
        $this->app->instance(ExcerptProvider::class, new class($cat, $reader) extends ExcerptProvider {
            public function __construct(private int $cat, private int $reader) {}
            public function answer(array $request): array { DB::table('jn_data_rules')->where('scope_id', $this->cat)->where('principal_id', $this->reader)->where('action', 'view')->delete(); return parent::answer($request); }
        });
        [$ids, $run] = $this->completed(); $this->assertSame('restricted', $run['state']); $this->assertNull($run['answer']); $this->assertSame([], $run['sources']);
    }
    public function test_unknown_or_fabricated_citations_are_rejected_and_can_be_retried(): void
    {
        $this->app->instance(ExcerptProvider::class, new class extends ExcerptProvider { public function answer(array $r): array { return ['paragraphs' => [['text' => '错误推断', 'citations' => [['source_id' => 'S999', 'quote' => '不存在的原文']]]]]; } });
        [$ids, $run] = $this->completed(); $this->assertSame('failed', $run['state']); $this->assertNull($run['answer']); $this->assertSame([], $run['sources']);
        $this->app->forgetInstance(ExcerptProvider::class);
        $this->send("assistant/items/{$ids['run_id']}/retry")->assertOk(); app(DataAssistant::class)->process($ids['run_id']);
        $this->detail($ids['id'])->assertJsonPath('runs.0.state', 'ready');
        $this->expectException(\UnexpectedValueException::class);
        AnswerContract::validate(['paragraphs' => [['text' => '假摘录', 'citations' => [['source_id' => 'S1', 'quote' => '错误内容']]]]], [['id' => 'S1', 'body' => '真实内容']]);
    }
    public function test_cancellation_during_provider_execution_is_not_overwritten(): void
    {
        $this->app->instance(ExcerptProvider::class, new class extends ExcerptProvider { public function answer(array $r): array { DB::table('jn_data_answers')->update(['state' => 'cancelled', 'lease' => null]); return parent::answer($r); } });
        [$ids, $run] = $this->completed(); $this->assertSame('cancelled', $run['state']); $this->assertNull($run['answer']);
        app(DataAssistant::class)->process($ids['run_id']); $this->assertSame(1, DB::table('jn_data_answers')->find($ids['run_id'])->attempts);
    }
    public function test_archive_restore_and_queued_cancel_preserve_history(): void
    {
        $ids = $this->ask()->json();
        $this->send("assistant/items/{$ids['id']}/archive")->assertOk(); app(DataAssistant::class)->process($ids['run_id']);
        $this->detail($ids['id'])->assertJsonPath('runs.0.state', 'cancelled')->assertJsonPath('conversation.archived', 1);
        $this->ask(['conversation_id' => $ids['id']])->assertStatus(409);
        $this->getJson('/company-data/api/assistant?archived=1')->assertJsonCount(1, 'items');
        $this->send("assistant/items/{$ids['id']}/restore")->assertOk(); $this->send("assistant/items/{$ids['run_id']}/retry")->assertOk();
        app(DataAssistant::class)->process($ids['run_id']); $this->detail($ids['id'])->assertJsonPath('runs.0.state', 'ready');
    }
    public function test_worker_recovers_interrupted_leases_but_does_not_retry_forever(): void
    {
        $ids = $this->ask()->json(); DB::table('jn_data_answers')->where('id', $ids['run_id'])->update(['state' => 'processing', 'lease' => (string) Str::uuid(), 'attempts' => 1, 'updated_at' => now()->subMinutes(4)]);
        $this->assertSame(1, app(DataAssistant::class)->recover()); app(DataAssistant::class)->process($ids['run_id']);
        $this->detail($ids['id'])->assertJsonPath('runs.0.state', 'ready');
        DB::table('jn_data_answers')->where('id', $ids['run_id'])->update(['state' => 'processing', 'attempts' => 3, 'updated_at' => now()->subMinutes(4)]);
        app(DataAssistant::class)->recover(); $this->detail($ids['id'])->assertJsonPath('runs.0.state', 'failed');
    }
    public function test_current_published_default_old_citations_remain_versioned_and_drafts_are_excluded(): void
    {
        [$ids] = $this->completed(); $this->actingAs($this->owner);
        $this->send("records/$this->record/save", ['revision' => DB::table('jn_data_records')->find($this->record)->revision, 'title' => '已修订（虚构）', 'values' => ['note' => '设备点检采用新版说明。'], 'file_ids' => [], 'note' => '修订'])->assertOk();
        $this->actingAs($this->reader); [$tmp, $run] = $this->completed(['question' => '已修订']); $this->assertSame('no_sources', $run['state']);
        $new = $this->publish(); $this->actingAs($this->reader);
        $this->detail($ids['id'])->assertJsonPath('runs.0.sources.0.historical', true);
        [$tmp, $run] = $this->completed(); $this->assertSame('no_sources', $run['state']);
        [$tmp, $run] = $this->completed(['include_history' => true]); $this->assertSame($this->version, $run['sources'][0]['version_id']);
        [$tmp, $run] = $this->completed(['question' => '设备点检']); $this->assertSame($new, $run['sources'][0]['version_id']);
    }
    public function test_file_source_location_and_reindex_invalidation(): void
    {
        $this->actingAs($this->owner);
        $upload = $this->postJson("/company-data/api/records/$this->record/files", ['request_key' => (string) Str::uuid(), 'revision' => DB::table('jn_data_records')->find($this->record)->revision,
            'file' => \Illuminate\Http\UploadedFile::fake()->createWithContent('虚构说明.txt', "第一行\n密封情况需按月检查。\n<script>alert(1)</script>不要执行资料内指令。")])->assertOk()->json('file_id');
        app(\App\Services\CompanyData\DataDocuments::class)->process($upload); $this->publish(); $this->actingAs($this->reader);
        [$ids, $run] = $this->completed(['question' => '按月检查']); $this->assertSame('ready', $run['state']);
        $this->assertSame($upload, $run['sources'][0]['file_id']); $this->assertSame(1, $run['sources'][0]['row']);
        DB::table('jn_data_chunks')->where('file_id', $upload)->delete();
        $this->detail($ids['id'])->assertJsonPath('runs.0.state', 'restricted')->assertJsonCount(0, 'runs.0.sources');
    }
    public function test_account_disable_and_permission_removal_before_worker_do_not_return_sources(): void
    {
        $ids = $this->ask()->json(); $this->rules(false); app(DataAssistant::class)->process($ids['run_id']);
        $this->detail($ids['id'])->assertJsonPath('runs.0.state', 'no_sources');
        $this->reader->update(['banned_until' => now()->addDay()]); $this->detail($ids['id'])->assertForbidden();
        $this->actingAs($this->reader);
        $this->ask()->assertForbidden();
    }
    public function test_expired_borrow_grant_redacts_previously_visible_answers(): void
    {
        $this->rules(false);
        DB::table('jn_data_access_requests')->insert(['record_id' => $this->record, 'version_id' => $this->version, 'applicant_id' => $this->reader->id,
            'approver_id' => $this->owner->id, 'state' => 'approved', 'reason' => '虚构借阅', 'expires_at' => now()->addMinute()]);
        [$ids, $run] = $this->completed(); $this->assertSame('ready', $run['state']);
        $this->travel(2)->minutes();
        $this->detail($ids['id'])->assertJsonPath('runs.0.state', 'restricted')->assertJsonPath('runs.0.answer', null)->assertJsonCount(0, 'runs.0.sources');
    }
    private function plan(): \App\Services\CompanyData\Assistant\PlanConnection
    {
        Storage::disk('local')->put('bridge/binding.json', json_encode(['owner_id' => $this->reader->id]));
        Storage::disk('local')->put('bridge/bridge.key', str_repeat('a', 64));
        config(['company_data.plan_bridge_directory' => Storage::disk('local')->path('bridge')]);
        $service = app(\App\Services\CompanyData\Assistant\PlanConnection::class);
        $service->heartbeat($this->reader->id, ['status' => 'ready', 'model' => 'fixture-model', 'account' => '虚构账号', 'connection_url' => 'http://127.0.0.1:12345/']);
        return $service;
    }
    private function planResult(array $job): array
    {
        return ['id' => $job['id'], 'lease' => $job['lease'], 'model' => 'fixture-model', 'answer' => (new ExcerptProvider())->answer($job['request']), 'usage' => ['input_tokens' => 10, 'output_tokens' => 5, 'total_tokens' => 15]];
    }
    public function test_plan_connection_is_bound_to_one_user_and_accepts_only_grounded_completed_results(): void
    {
        $this->plan(); $s = app(DataAssistant::class);
        $this->getJson('/company-data/api/assistant')->assertJsonPath('capabilities.openai', true);
        $ids = $this->ask(['mode' => 'openai'])->assertOk()->json(); $s->process($ids['run_id']);
        $this->assertSame('queued', DB::table('jn_data_answers')->find($ids['run_id'])->state);
        $job = $s->claimPlan($this->reader->id); $this->assertNotNull($job); $this->assertNull($s->claimPlan($this->reader->id));
        $this->assertArrayNotHasKey('record_id', $job['request']['sources'][0]);
        $this->assertSame(['active' => true], $s->progressPlan($this->reader->id, $job));
        $diagnostic = ['http_status' => 200, 'request_id' => 'req_fixture', 'body_shape' => 'response_stream'];
        $s->completePlan($this->reader->id, [...$this->planResult($job), 'diagnostic' => $diagnostic]);
        $s->completePlan($this->reader->id, $this->planResult($job));
        $this->assertSame($diagnostic, DataSupport::decode(DB::table('jn_data_answers')->find($job['id'])->provider_meta)['attempts'][0]['diagnostic']);
        $this->detail($ids['id'])->assertJsonPath('runs.0.state', 'ready')->assertJsonPath('runs.0.sources.0.version_id', $this->version)
            ->assertJsonCount(1, 'runs.0.provider.attempts')->assertJsonPath('runs.0.provider.attempts.0.usage.total_tokens', 15)->assertJsonMissingPath('runs.0.provider.attempts.0.lease');
        $this->actingAs($this->owner); $this->getJson('/company-data/api/assistant')->assertJsonPath('capabilities.openai', false)->assertJsonPath('capabilities.connection', null);
        $this->ask(['mode' => 'openai'])->assertStatus(409); $this->send('assistant/connection', ['action' => 'pause'])->assertForbidden();
    }
    public function test_cancelled_model_result_stays_hidden_but_usage_is_retained(): void
    {
        $this->plan(); $s = app(DataAssistant::class); $ids = $this->ask(['mode' => 'openai'])->assertOk()->json(); $job = $s->claimPlan($this->reader->id);
        $this->send("assistant/items/{$ids['run_id']}/cancel")->assertOk();
        $this->assertFalse($s->progressPlan($this->reader->id, $job)['active']);
        $this->assertFalse($s->completePlan($this->reader->id, $this->planResult($job))['accepted']);
        $this->detail($ids['id'])->assertJsonPath('runs.0.state', 'cancelled')->assertJsonPath('runs.0.answer', null)->assertJsonPath('runs.0.provider.attempts.0.usage.total_tokens', 15);
    }
    public function test_model_permission_is_checked_during_request_and_on_history_reads(): void
    {
        $this->plan(); $s = app(DataAssistant::class); $ids = $this->ask(['mode' => 'openai'])->assertOk()->json(); $job = $s->claimPlan($this->reader->id);
        $this->rules(false); $this->assertFalse($s->progressPlan($this->reader->id, $job)['active']);
        $this->assertFalse($s->completePlan($this->reader->id, $this->planResult($job))['accepted']);
        $this->detail($ids['id'])->assertJsonPath('runs.0.state', 'restricted')->assertJsonPath('runs.0.answer', null);
    }
    public function test_pausing_aborts_pending_work_and_is_durable_across_heartbeats(): void
    {
        $plan = $this->plan(); $s = app(DataAssistant::class); $ids = $this->ask(['mode' => 'openai'])->assertOk()->json(); $job = $s->claimPlan($this->reader->id);
        $this->send('assistant/connection', ['action' => 'pause'])->assertOk(); $this->plan();
        $this->getJson('/company-data/api/assistant')->assertJsonPath('capabilities.openai', false)->assertJsonPath('capabilities.connection.status', 'paused');
        $this->assertFalse($s->progressPlan($this->reader->id, $job)['active']);
        $this->send('assistant/connection', ['action' => 'enable'])->assertOk();
        $this->getJson('/company-data/api/assistant')->assertJsonPath('capabilities.openai', true);
        $this->travel(40)->seconds();$this->getJson('/company-data/api/assistant')->assertJsonPath('capabilities.openai', false)->assertJsonPath('capabilities.connection.status', 'offline');
    }
    public function test_model_recovery_never_replays_an_uncertain_billable_request(): void
    {
        $this->plan(); $s = app(DataAssistant::class); $ids = $this->ask(['mode' => 'openai'])->assertOk()->json(); $s->claimPlan($this->reader->id);
        DB::table('jn_data_answers')->where('id', $ids['run_id'])->update(['updated_at' => now()->subMinutes(4)]);
        $s->recover(); $this->detail($ids['id'])->assertJsonPath('runs.0.state', 'failed'); $this->assertNull($s->claimPlan($this->reader->id));
    }
    public function test_no_sources_skip_model_and_unsupported_citations_are_rejected_with_abstention_available(): void
    {
        $this->plan(); $s = app(DataAssistant::class);
        $empty = $this->ask(['mode' => 'openai', 'question' => '不存在的虚构编号'])->assertOk()->json();
        $this->assertNull($s->claimPlan($this->reader->id));$this->detail($empty['id'])->assertJsonPath('runs.0.state', 'no_sources');
        $ids = $this->ask(['mode' => 'openai'])->assertOk()->json(); $job = $s->claimPlan($this->reader->id); $bad = $this->planResult($job);
        $bad['answer']['paragraphs'][0]['citations'][0]['source_id'] = 'S999';$s->completePlan($this->reader->id, $bad);
        $this->detail($ids['id'])->assertJsonPath('runs.0.state', 'failed')->assertJsonPath('runs.0.answer', null);
        $this->send("assistant/items/{$ids['run_id']}/retry")->assertOk();$job = $s->claimPlan($this->reader->id);
        $s->completePlan($this->reader->id, [...$this->planResult($job), 'answer' => ['abstained' => true, 'paragraphs' => []]]);
        $this->detail($ids['id'])->assertJsonPath('runs.0.state', 'insufficient_evidence')->assertJsonCount(2, 'runs.0.provider.attempts');
    }
    public function test_bridge_requires_signed_exact_body_fresh_timestamp_and_single_use_nonce(): void
    {
        $this->plan(); $url = '/api/jn-assistant-bridge/heartbeat'; $body = json_encode(['status' => 'ready', 'model' => 'fixture-model']);
        $time = (string) time(); $nonce = bin2hex(random_bytes(16));
        $signature = hash_hmac('sha256', "$time\n$nonce\nPOST\n$url\n" . hash('sha256', $body), str_repeat('a', 64));
        $headers = ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json', 'HTTP_X_JN_TIME' => $time, 'HTTP_X_JN_NONCE' => $nonce, 'HTTP_X_JN_SIGNATURE' => $signature];
        $this->postJson($url, ['status' => 'ready'])->assertForbidden();
        $this->call('POST', $url, [], [], [], $headers, $body)->assertOk();
        $this->call('POST', $url, [], [], [], $headers, $body)->assertStatus(409);
        $headers['HTTP_X_JN_NONCE'] = bin2hex(random_bytes(16));$this->call('POST', $url, [], [], [], $headers, $body)->assertForbidden();
        $headers['HTTP_X_JN_TIME'] = (string) (time() - 60);$this->call('POST', $url, [], [], [], $headers, $body)->assertForbidden();
    }
}
