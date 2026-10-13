<?php
namespace Tests\Feature;

use Tests\TestCase;
use App\Models\User;
use App\Models\Workflow\{Quotes, QuoteLines};
use App\Services\Quotes\QuotationWorkspace;
use Illuminate\Support\Facades\{DB, Queue, Storage};
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;

class JingnengQuotationWorkspaceTest extends TestCase
{
    private User $owner;
    private QuotationWorkspace $service;
    protected function setUp(): void {
        parent::setUp(); Queue::fake(); Storage::fake('local');
        $this->withoutMiddleware(\App\Http\Middleware\CheckTaskStatus::class);
        $this->owner = User::factory()->create(); $this->owner->assignRole(Role::findOrCreate('Admin', 'web'));
        $this->actingAs($this->owner); $this->service = app(QuotationWorkspace::class);
    }
    private function key(): string { return (string) Str::uuid(); }
    private function fixture(): array {
        $q = Quotes::factory()->create(['user_id' => $this->owner->id, 'statu' => 1, 'label' => '虚构报价验收']);
        $l = QuoteLines::factory()->create(['quotes_id' => $q->id, 'qty' => 2, 'selling_price' => 100, 'discount' => 5, 'use_calculated_price' => false]);
        return [$q, $l];
    }
    private function body(Quotes $q): array {
        $body = $this->service->detail($this->owner, $q->id); $body['type'] = '成套';
        $body['lines'][0]['costs'] = [['id' => 'cost-1', 'name' => '电气元件', 'spec' => '虚构型号', 'qty' => 2, 'unit' => '件', 'price' => 25, 'source' => '虚构供应商报价', 'checked' => true]];
        $body['lines'][0]['checked'] = true; $body['lines'][0]['spec'] = '600×400×800'; return $body;
    }
    private function save(Quotes $q, array $body, ?string $key = null) {
        return $this->putJson('/quotation-workspace/api/'.$q->id, $body, ['X-Request-ID' => $key ?? $this->key()]);
    }
    public function test_saves_existing_document_costs_and_immutable_versions_and_reloads(): void {
        [$q, $l] = $this->fixture(); $body=$this->body($q); $body['lines'][0]['price']=125;
        $saved=$this->save($q,$body)->assertOk()->assertJsonPath('lines.0.price',125)->assertJsonPath('revision',1)->json();
        $snapshot=DB::table('jn_quote_workspace_versions')->first()->snapshot;
        $this->assertDatabaseHas('quote_lines',['id'=>$l->id,'selling_price'=>125,'discount'=>5]);
        $saved['lines'][0]['costs'][0]['price']=30;
        $this->save($q,$saved)->assertOk()->assertJsonPath('revision',2);
        $this->getJson('/quotation-workspace/api/'.$q->id)->assertOk()->assertJsonPath('lines.0.costs.0.price',30);
        $this->assertSame($snapshot,DB::table('jn_quote_workspace_versions')->orderBy('id')->first()->snapshot);
        $this->getJson('/quotation-workspace/api/'.$q->id.'/versions/1')->assertOk()->assertJsonPath('snapshot.costs.lines.'.$l->id.'.costs.0.price',25);
    }
    public function test_retry_and_stale_or_legacy_writes_do_not_overwrite_newer_data(): void {
        [$q,$l]=$this->fixture();$body=$this->body($q);$key=$this->key();
        $a=$this->save($q,$body,$key)->assertOk()->json();$b=$this->save($q,$body,$key)->assertOk()->json();$this->assertSame($a,$b);
        $this->save($q,$body)->assertConflict();
        $l->update(['qty'=>9]);$this->save($q,$a)->assertConflict();
        $this->assertDatabaseCount('jn_quote_workspace_versions',1);
        $this->assertSame(9,(int)$l->fresh()->qty);
    }
    public function test_access_is_scoped_to_owner_and_revocation_blocks_history_and_replay(): void {
        [$q]=$this->fixture();$body=$this->body($q);$key=$this->key();$this->save($q,$body,$key)->assertOk();
        $other=User::factory()->create();$role=Role::findOrCreate('quotation-test','web');\Spatie\Permission\Models\Permission::findOrCreate('quotes-menu','web');$role->givePermissionTo('quotes-menu');$other->assignRole($role);$this->actingAs($other);
        $this->getJson('/quotation-workspace/api')->assertOk()->assertJsonPath('total',0);
        $this->getJson('/quotation-workspace/api/history')->assertOk()->assertJsonPath('total',0);
        $this->getJson('/quotation-workspace/api/'.$q->id)->assertNotFound();
        $this->save($q,$body,$key)->assertNotFound();
        $role->revokePermissionTo('quotes-menu');$other->unsetRelation('roles');$this->getJson('/quotation-workspace/api')->assertForbidden();
    }
    public function test_reuse_copies_costs_and_bom_independently_and_resets_confirmation(): void {
        [$source,$sourceLine]=$this->fixture();$original=$this->save($source,$this->body($source))->assertOk()->json();
        [$target]=$this->fixture();$targetState=$this->service->detail($this->owner,$target->id);
        $input=['token'=>$targetState['token'],'sourceId'=>$sourceLine->id,'sourceToken'=>$original['token']];$key=$this->key();
        $url='/quotation-workspace/api/'.$target->id.'/reuse';
        $copy=$this->postJson($url,$input,['X-Request-ID'=>$key])->assertOk()->assertJsonPath('lines.1.checked',false)->assertJsonPath('lines.1.costs.0.checked',false)->json();
        $this->postJson($url,$input,['X-Request-ID'=>$key])->assertOk();
        $this->assertCount(2,$target->fresh()->QuoteLines);
        $copy['lines'][1]['price']=200;$copy['lines'][1]['costs'][0]['price']=90;
        $this->save($target,$copy)->assertOk();
        $this->getJson('/quotation-workspace/api/'.$source->id)->assertJsonPath('lines.0.price',100)->assertJsonPath('lines.0.costs.0.price',25);
        $this->assertDatabaseCount('jn_quote_sources',0);
    }
    public function test_invalid_cost_and_foreign_line_roll_back_whole_save(): void {
        [$q,$l]=$this->fixture();$body=$this->body($q);$body['lines'][0]['price']=444;$body['lines'][0]['costs'][0]['price']=-1;
        $this->save($q,$body)->assertUnprocessable();$this->assertSame(100.0,(float)$l->fresh()->selling_price);
        [$other,$foreign]=$this->fixture();$body=$this->body($q);$body['lines'][0]['id']=(string)$foreign->id;
        $this->save($q,$body)->assertNotFound();$this->assertDatabaseCount('jn_quote_workspace_versions',0);
    }
    public function test_closed_or_calculated_quotes_are_readonly(): void {
        [$q,$l]=$this->fixture();$body=$this->body($q);$q->update(['statu'=>3]);
        $this->getJson('/quotation-workspace/api/'.$q->id)->assertJsonPath('readOnly',true);$this->save($q,$body)->assertConflict();
        $q->update(['statu'=>1]);$l->update(['use_calculated_price'=>true]);$this->save($q,$body)->assertConflict();
    }
    public function test_history_filters_and_source_changes_are_checked(): void {
        [$q,$l]=$this->fixture();$a=$this->save($q,$this->body($q))->assertOk()->json();
        $this->getJson('/quotation-workspace/api/history?type='.urlencode('成套').'&verified=1&q=600')->assertOk()->assertJsonPath('total',1);
        $this->getJson('/quotation-workspace/api/history?type='.urlencode('钣金'))->assertOk()->assertJsonPath('total',0);
        [$target]=$this->fixture();$t=$this->service->detail($this->owner,$target->id);$l->update(['qty'=>5]);
        $this->postJson('/quotation-workspace/api/'.$target->id.'/reuse',['sourceId'=>$l->id,'sourceToken'=>$a['token'],'token'=>$t['token']],['X-Request-ID'=>$this->key()])->assertConflict();
        $this->getJson('/quotation-workspace/api/'.$q->id)->assertJsonPath('lines.0.checked',false);
        $this->getJson('/quotation-workspace/api/history?verified=1')->assertOk()->assertJsonPath('total',0);
    }
    public function test_create_is_idempotent_uses_real_commercial_fields_and_adds_manual_line(): void {
        [$fixture]=$this->fixture();$fixture->companie->update(['active'=>1,'statu_customer'=>3]);
        $form=['title'=>'虚构新报价','type'=>'钣金','companyId'=>$fixture->companies_id,'contactId'=>$fixture->companies_contacts_id,'addressId'=>$fixture->companies_addresses_id,
            'conditionId'=>$fixture->accounting_payment_conditions_id,'methodId'=>$fixture->accounting_payment_methods_id,'deliveryId'=>$fixture->accounting_deliveries_id,'due'=>'2026-12-01'];
        $key=$this->key();$headers=['X-Request-ID'=>$key];
        $a=$this->postJson('/quotation-workspace/api',$form,$headers)->assertOk()->json();
        $b=$this->postJson('/quotation-workspace/api',$form,$headers)->assertOk()->json();$this->assertSame($a['id'],$b['id']);
        $body=$this->body($fixture);$a['lines']=[...$body['lines']];$a['lines'][0]['id']=$this->key();$a['lines'][0]['costs']=[];$a['lines'][0]['checked']=true;
        $q=Quotes::findOrFail($a['id']);$this->save($q,$a)->assertOk()->assertJsonPath('lines.0.checked',false);
        $this->assertDatabaseCount('quotes',2);$this->assertCount(1,$q->fresh()->QuoteLines);
    }
    public function test_fractional_quantities_and_legacy_presentation_lines_are_preserved(): void {
        [$q,$l]=$this->fixture();
        $section=QuoteLines::factory()->create(['quotes_id'=>$q->id,'line_type'=>'section','label'=>'原有分组']);
        $body=$this->body($q);$body['lines'][0]['qty']=2.125;$body['lines'][0]['price']=100.123;
        $this->save($q,$body)->assertOk()->assertJsonPath('lines.0.qty',2.125)->assertJsonPath('lines.0.price',100.123)->assertJsonPath('presentationCount',1);
        $this->assertNotNull($section->fresh());
        $body=$this->service->detail($this->owner,$q->id);$body['lines'][0]['price']=100.1234;
        $this->save($q,$body)->assertUnprocessable();
    }
}
