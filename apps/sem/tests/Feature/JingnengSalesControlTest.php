<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Workflow\{Quotes, QuoteLines, Orders};
use App\Services\Presales\PresalesService;
use App\Services\SalesControl\{QuoteReview, TechnicalHandoff, FlowSupport};
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Queue, Storage};
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class JingnengSalesControlTest extends TestCase
{
    private User $owner;
    private User $reviewer;
    private User $receiver;
    private QuoteReview $review;
    protected function setUp(): void
    {
        parent::setUp(); Storage::fake('local'); Queue::fake();
        $this->withoutMiddleware(\App\Http\Middleware\CheckTaskStatus::class);
        $this->owner = $this->user('Sales'); $this->reviewer = $this->user('报价核对员'); $this->receiver = $this->user('技术接收员');
        $this->review = app(QuoteReview::class); $this->actingAs($this->owner);
    }
    private function user(string $role): User { $u = User::factory()->create(); $u->assignRole(Role::findByName($role, 'web')); return $u; }
    private function key(): string { return (string) Str::uuid(); }
    private function fixture(string $kind = 'cabinet'): array
    {
        $q = Quotes::factory()->create(['user_id' => $this->owner->id, 'statu' => 1, 'label' => '虚构' . $kind, 'comment' => '验收专用']);
        $line = QuoteLines::factory()->create(['quotes_id' => $q->id, 'qty' => 2, 'selling_price' => 100, 'discount' => 0, 'statu' => 1]);
        $p = app(PresalesService::class);
        $iid = $p->create($this->owner, $this->key(), ['title' => '虚构需求', 'kind' => $kind, 'company_id' => null, 'requirements' => '核对虚构资料'])['id'];
        $f = $p->upload($iid, $this->owner, $this->key(), ['revision' => 1], UploadedFile::fake()->createWithContent('虚构资料.txt', '这是验收资料原件'));
        DB::table('jn_quote_sources')->insert(['inquiry_id' => $iid, 'quote_id' => $q->id, 'revision' => 2, 'snapshot' => '{}', 'confirmed_by' => $this->owner->id, 'created_at' => now()]);
        return [$q, $line, $iid, $f];
    }
    private function submission(Quotes $q, ?int $reviewer = null): array
    {
        $context = $this->review->context($q->id, $this->owner);
        return ['fingerprint' => $context['fingerprint'], 'reviewer_id' => $reviewer ?? $this->reviewer->id, 'version_ids' => array_column($context['current']['materials']['files'], 'id'), 'note' => '人工核对后提交', 'confirmed' => true];
    }
    private function submit(Quotes $q): int { return $this->review->submit($q->id, $this->owner, $this->key(), $this->submission($q))['review_id']; }
    private function decide(Quotes $q, int $rid, string $decision = 'approve')
    {
        $this->actingAs($this->reviewer);
        return $this->postJson("/sales-control/api/quotes/$q->id/reviews/$rid/decision", ['decision' => $decision, 'confirmed' => true, 'note' => '已核对虚构资料'], ['X-Request-ID' => $this->key()]);
    }
    private function approvedOrder(): array
    {
        [$q, $line, $iid, $file] = $this->fixture(); $rid = $this->submit($q); $this->decide($q, $rid)->assertOk();
        $this->actingAs($this->owner);
        $this->postJson("/quotes/$q->id/lines/json/store-order", ['line_ids' => [$line->id]])->assertOk();
        return [Orders::where('quotes_id', $q->id)->firstOrFail(), $q, $iid, $file, $rid];
    }
    private function handoffInput(Orders $order, ?int $receiver = null): array
    {
        $c = app(TechnicalHandoff::class)->context($order->id, $this->owner);
        return ['fingerprint' => $c['fingerprint'], 'revision' => $c['handoff']->revision ?? 0, 'receiver_id' => $receiver ?? $this->receiver->id,
            'due_date' => '2026-12-20', 'note' => '交接虚构需求与资料', 'confirmed' => true, 'checklist' => ['数量已核对', '资料已核对'],
            'version_ids' => array_column($c['current']['materials']['files'], 'id')];
    }
    private function handoffAction(Orders $o, string $action, array $extra = [])
    {
        $this->actingAs($this->receiver);
        return $this->postJson("/sales-control/api/orders/$o->id/action", ['revision' => DB::table('jn_technical_handoffs')->where('order_id', $o->id)->value('revision'),
            'action' => $action, 'note' => '处理虚构交接', ...$extra], ['X-Request-ID' => $this->key()]);
    }
    public function test_both_kinds_return_resubmit_freeze_pdf_and_convert_only_confirmed_version(): void
    {
        foreach (['cabinet', 'sheet_metal'] as $kind) {
            $this->actingAs($this->owner); [$q, $line] = $this->fixture($kind);
            $this->postJson("/quotes/$q->id/lines/json/store-order", ['line_ids' => [$line->id]])->assertConflict();
            $rid = $this->submit($q); $original = DB::table('jn_quote_reviews')->find($rid); $bytes = Storage::disk('local')->get($original->draft_path);
            $this->assertStringStartsWith('%PDF-', $bytes);
            $this->decide($q, $rid, 'reject')->assertOk();
            $line->update(['selling_price' => 125]); $rid2 = $this->submit($q); $this->assertNotSame($rid, $rid2);
            $this->decide($q, $rid2)->assertOk();
            $approved = DB::table('jn_quote_reviews')->find($rid2);
            $this->assertSame(125.0, (float) FlowSupport::decode($approved->snapshot)['lines'][0]['selling_price']);
            $this->assertSame($bytes, Storage::disk('local')->get($original->draft_path));
            $this->get("/sales-control/api/quotes/$q->id/reviews/$rid2/pdf")->assertOk();
            $this->actingAs($this->owner); $this->postJson("/quotes/$q->id/lines/json/store-order", ['line_ids' => [$line->id]])->assertOk();
            $order = Orders::where('quotes_id', $q->id)->first();
            $this->assertDatabaseHas('jn_order_quote_reviews', ['order_id' => $order->id, 'review_id' => $rid2]);
            $this->assertSame(125.0, (float) $order->OrderLines->first()->selling_price);
        }
    }
    public function test_new_prices_files_and_tampered_originals_block_confirmation(): void
    {
        [$q, $line, $iid, $file] = $this->fixture(); $rid = $this->submit($q);
        $line->update(['qty' => 3]); $this->decide($q, $rid)->assertConflict();
        $rid2 = $this->submit($q);
        app(PresalesService::class)->upload($iid, $this->owner, $this->key(), ['revision' => 2, 'document_id' => $file['document_id']], UploadedFile::fake()->createWithContent('新版.txt', '变更资料'));
        $this->decide($q, $rid2)->assertConflict();
        $rid3 = $this->submit($q); $v = DB::table('jn_file_versions')->orderByDesc('id')->first(); Storage::disk('local')->put($v->path, '损坏');
        $this->decide($q, $rid3)->assertConflict();
        $this->decide($q, $rid3, 'reject')->assertOk();
    }
    public function test_replay_is_idempotent_and_revoked_reviewer_cannot_read_files_or_decide(): void
    {
        [$q, , $iid, $file] = $this->fixture(); $body = $this->submission($q); $key = $this->key();
        $a = $this->review->submit($q->id, $this->owner, $key, $body); $b = $this->review->submit($q->id, $this->owner, $key, $body); $this->assertSame($a, $b);
        $this->assertTrue($this->review->submit($q->id, $this->owner, $this->key(), $body)['reused']);
        $rid = $a['review_id']; $this->actingAs($this->reviewer);
        $this->get("/sales-control/api/quotes/$q->id/reviews/$rid/files/{$file['version_id']}")->assertOk();
        $this->getJson("/presales/api/inquiries/$iid")->assertNotFound();
        $key = $this->key(); $input = ['decision' => 'approve', 'note' => '已确认', 'confirmed' => true];
        $url = "/sales-control/api/quotes/$q->id/reviews/$rid/decision";
        $this->postJson($url, $input, ['X-Request-ID' => $key])->assertOk();
        $this->reviewer->removeRole('报价核对员'); $this->reviewer->assignRole('Sales');
        $this->postJson($url, $input, ['X-Request-ID' => $key])->assertNotFound();
        $this->get("/sales-control/api/quotes/$q->id/reviews/$rid/pdf")->assertNotFound();
        $this->get("/sales-control/api/quotes/$q->id/reviews/$rid/files/{$file['version_id']}")->assertNotFound();
    }
    public function test_handoff_receive_request_supplement_reassign_complete_preserves_history(): void
    {
        [$o, $q, $iid, $file] = $this->approvedOrder(); $service = app(TechnicalHandoff::class);
        $service->send($o->id, $this->owner, $this->key(), $this->handoffInput($o));
        $this->handoffAction($o, 'accept')->assertOk(); $this->handoffAction($o, 'request_info')->assertOk();
        $other = $this->user('技术接收员');
        $service->send($o->id, $this->owner, $this->key(), $this->handoffInput($o, $other->id));
        $this->actingAs($this->receiver); $this->getJson("/sales-control/api/orders/$o->id")->assertNotFound();
        $this->get("/sales-control/api/orders/$o->id/versions/1/files/{$file['version_id']}")->assertNotFound();
        $this->receiver = $other; $this->handoffAction($o, 'accept')->assertOk();
        $this->handoffAction($o, 'complete', ['checked' => [0]])->assertUnprocessable();
        $this->handoffAction($o, 'complete', ['checked' => [0, 1]])->assertOk();
        $this->assertDatabaseCount('jn_handoff_versions', 2);
        $this->assertDatabaseHas('jn_technical_handoffs', ['order_id' => $o->id, 'state' => 'completed', 'version' => 2]);
        $this->assertSame(1, (int) $o->fresh()->statu); // No production release.
        $this->assertSame($q->id, $o->quotes_id);
    }
    public function test_handoff_stale_revision_and_new_files_block_acceptance_but_can_be_returned(): void
    {
        [$o, , $iid, $file] = $this->approvedOrder(); $service = app(TechnicalHandoff::class); $input = $this->handoffInput($o);
        $key = $this->key(); $a = $service->send($o->id, $this->owner, $key, $input); $this->assertSame($a, $service->send($o->id, $this->owner, $key, $input));
        app(PresalesService::class)->upload($iid, $this->owner, $this->key(), ['revision' => 2, 'document_id' => $file['document_id']], UploadedFile::fake()->createWithContent('变更.txt', '新的需求'));
        $this->handoffAction($o, 'accept')->assertConflict(); $this->handoffAction($o, 'return')->assertOk();
        $this->actingAs($this->owner);
        $this->postJson("/sales-control/api/orders/$o->id/send", $input, ['X-Request-ID' => $this->key()])->assertConflict();
        $this->getJson("/sales-control/api/orders/$o->id")->assertOk()->assertJsonPath('stale', true);
    }
    public function test_inbox_follows_actual_actor_and_ignores_unrelated_users(): void
    {
        [$q] = $this->fixture(); $rid = $this->submit($q); $this->actingAs($this->reviewer);
        $this->getJson('/workspace/inbox?scope=mine')->assertOk()->assertJsonFragment(['source' => 'quote_review']);
        $other = $this->user('报价核对员'); $this->actingAs($other);
        $this->getJson('/workspace/inbox?scope=all')->assertOk()->assertJsonMissing(['source' => 'quote_review']);
        $this->getJson("/sales-control/api/quotes/$q->id")->assertNotFound();
        $this->decide($q, $rid, 'reject')->assertOk(); $this->actingAs($this->owner);
        $this->getJson('/workspace/inbox?scope=mine')->assertOk()->assertJsonFragment(['state' => '待修改']);
    }
    public function test_scheduler_never_schedules_the_unbounded_monitor(): void
    {
        $schedule = app(\Illuminate\Console\Scheduling\Schedule::class);
        foreach ($schedule->events() as $event) {
            if (str_contains($event->command ?? '', 'pulse:check')) $this->assertStringContainsString('--once', $event->command);
        }
        $this->assertFalse((bool) config('pulse.enabled')); // isolated test environment
    }
    public function test_reassigned_owner_loses_requested_inbox_and_only_quote_fields_are_shared(): void
    {
        [$q] = $this->fixture();
        $q->companie->update(['comment' => 'Private customer notes', 'account_general_customer' => 'Internal account']);
        $rid = $this->submit($q);
        $snapshot = FlowSupport::decode(DB::table('jn_quote_reviews')->find($rid)->snapshot);
        $this->assertArrayNotHasKey('comment', $snapshot['relations']['companie']);
        $this->assertArrayNotHasKey('account_general_customer', $snapshot['relations']['companie']);
        $this->getJson('/workspace/inbox?scope=requested')->assertOk()->assertJsonFragment(['source' => 'quote_review']);
        $other = $this->user('Sales'); $q->update(['user_id' => $other->id]);
        $this->getJson('/workspace/inbox?scope=requested')->assertOk()->assertJsonMissing(['source' => 'quote_review']);
        $this->getJson("/sales-control/api/quotes/$q->id")->assertNotFound();
        $this->actingAs($this->reviewer);
        $this->getJson("/sales-control/api/quotes/$q->id")->assertOk(); // Explicit reviewer remains assigned.
    }

    public function test_banned_people_are_not_offered_for_assignment(): void
    {
        $this->reviewer->forceFill(['banned_until' => now()->addDay()])->save();
        $ids = array_column(app(FlowSupport::class)->users('核对报价版本'), 'id');
        $this->assertNotContains($this->reviewer->id, $ids);
        [$q] = $this->fixture();
        $this->postJson("/sales-control/api/quotes/$q->id/submit", $this->submission($q), ['X-Request-ID' => $this->key()])->assertUnprocessable();
    }

    public function test_stopped_quote_cannot_be_confirmed_but_can_be_returned(): void
    {
        [$q] = $this->fixture(); $rid = $this->submit($q); $q->update(['statu' => 5]);
        $this->decide($q, $rid)->assertConflict();
        $this->decide($q, $rid, 'reject')->assertOk();
    }
}
