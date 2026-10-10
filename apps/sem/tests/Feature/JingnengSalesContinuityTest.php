<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Companies\{Companies, CompaniesContacts, CompaniesAddresses};
use App\Models\Workflow\{Quotes, QuoteLines, Orders};
use App\Services\Presales\{PresalesService, SalesHandoff, ExtractionGateway, ExtractionProvider};
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Queue, Storage};
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class JingnengSalesContinuityTest extends TestCase
{
    private User $owner;
    private PresalesService $service;
    protected function setUp(): void
    {
        parent::setUp(); Storage::fake('local'); Queue::fake();
        $this->withoutMiddleware(\App\Http\Middleware\CheckTaskStatus::class);
        $this->owner = $this->user(); $this->actingAs($this->owner); $this->service = app(PresalesService::class);
    }
    private function user(): User
    {
        $user = User::factory()->create();$user->assignRole(Role::firstOrCreate(['name'=>'Sales','guard_name'=>'web']));return $user;
    }
    private function key(): string { return (string) Str::uuid(); }
    private function setupInquiry(string $kind='cabinet'): array
    {
        $company = Companies::factory()->create(['active'=>1,'statu_customer'=>2,'label'=>'虚构客户 · '.$kind]);
        $contact = CompaniesContacts::factory()->create(['companies_id'=>$company->id]);
        $address = CompaniesAddresses::factory()->create(['companies_id'=>$company->id]);
        $id = $this->service->create($this->owner,$this->key(),['title'=>'虚构销售闭环 · '.$kind,'kind'=>$kind,'company_id'=>$company->id,'requirements'=>'已手工核对的虚构需求'])['id'];
        $file = $this->service->upload($id,$this->owner,$this->key(),['revision'=>1],UploadedFile::fake()->createWithContent('虚构需求.txt','需求说明：来源需求'));
        return [$id, $company, $file, ['revision'=>2,'confirmed'=>true,'note'=>'人工核对本次报价依据','version_ids'=>[$file['version_id']],
            'companies_contacts_id'=>$contact->id,'companies_addresses_id'=>$address->id,'accounting_payment_conditions_id'=>DB::table('accounting_payment_conditions')->value('id'),
            'accounting_payment_methods_id'=>DB::table('accounting_payment_methods')->value('id'),'accounting_deliveries_id'=>DB::table('accounting_deliveries')->value('id')]];
    }
    private function quote(int $id,array $input,?string $key=null)
    {
        return $this->postJson("/presales/api/inquiries/$id/quote",$input,['X-Request-ID'=>$key??$this->key()]);
    }
    public function test_both_kinds_link_customer_quote_original_versions_and_converted_order_once(): void
    {
        foreach(['cabinet','sheet_metal'] as $kind){
            [$id,$company,$file,$input]=$this->setupInquiry($kind);$key=$this->key();
            $result=$this->quote($id,$input,$key)->assertOk()->json();$qid=$result['quote_id'];
            $this->quote($id,$input,$key)->assertOk()->assertExactJson($result);
            $this->quote($id,$input)->assertOk()->assertJsonPath('quote_id',$qid)->assertJsonPath('reused',true);
            $quote=Quotes::findOrFail($qid);$this->assertSame(1,(int)$quote->statu);$this->assertSame($company->id,$quote->companies_id);
            $this->assertCount(0,$quote->QuoteLines); // no invented price or product
            $source=app(SalesHandoff::class)->source($qid,$this->owner);
            $this->assertSame($file['version_id'],$source['snapshot']['versions'][0]['id']);
            $line=QuoteLines::factory()->create(['quotes_id'=>$qid,'statu'=>1]);
            $this->postJson("/quotes/$qid/lines/json/store-order",['line_ids'=>[$line->id]])->assertOk();
            $this->postJson("/quotes/$qid/lines/json/store-order",['line_ids'=>[$line->id]])->assertUnprocessable();
            $this->assertSame(1,Orders::where('quotes_id',$qid)->count());
            $detail=$this->service->detail($id,$this->owner);$this->assertCount(1,$detail['quotes']);$this->assertCount(1,$detail['quotes'][0]['orders']);
            $this->assertSame(1,DB::table('jn_presales_events')->where('inquiry_id',$id)->where('label','确认报价依据并生成草稿')->count());
        }
    }
    public function test_new_file_or_record_version_never_replaces_quote_basis_and_blocks_stale_submit(): void
    {
        [$id,$company,$file,$input]=$this->setupInquiry();$qid=$this->quote($id,$input)->assertOk()->json('quote_id');
        $before=DB::table('jn_quote_sources')->where('quote_id',$qid)->value('snapshot');
        $this->service->upload($id,$this->owner,$this->key(),['revision'=>2,'document_id'=>$file['document_id']],UploadedFile::fake()->createWithContent('虚构需求.txt','新需求'));
        $this->quote($id,$input)->assertConflict();
        $this->quote($id,[...$input,'revision'=>3])->assertConflict(); // old file is not current
        $this->assertSame($before,DB::table('jn_quote_sources')->where('quote_id',$qid)->value('snapshot'));
        $this->assertTrue(app(SalesHandoff::class)->source($qid,$this->owner)['stale']);
        $this->get("/presales/api/inquiries/$id/versions/{$file['version_id']}/download")->assertOk();
    }
    public function test_quote_permission_and_receipt_replay_are_checked_before_data_is_returned(): void
    {
        [$id,$company,$file,$input]=$this->setupInquiry();$key=$this->key();$qid=$this->quote($id,$input,$key)->assertOk()->json('quote_id');
        $other=$this->user();$this->actingAs($other);
        $this->quote($id,$input,$key)->assertNotFound();$this->getJson("/presales/api/inquiries/$id/quote-options")->assertNotFound();
        $this->assertNull(app(SalesHandoff::class)->source($qid,$other));
        $this->assertCount(0,app(SalesHandoff::class)->companyInquiries($company->id,$other));
        $this->service->members($id,$this->owner,$this->key(),['revision'=>2,'user_ids'=>[$other->id]]);
        $this->quote($id,[...$input,'revision'=>3])->assertNotFound(); // collaborator can read, not issue
        $this->assertNotNull(app(SalesHandoff::class)->source($qid,$other));
        $this->service->members($id,$this->owner,$this->key(),['revision'=>3,'user_ids'=>[]]);
        $this->assertNull(app(SalesHandoff::class)->source($qid,$other));
        $this->getJson("/presales/api/inquiries/$id/versions/{$file['version_id']}/download")->assertNotFound();
    }
    public function test_confirmation_customer_ownership_and_file_integrity_are_required(): void
    {
        [$id,$company,$file,$input]=$this->setupInquiry();
        $this->quote($id,[...$input,'confirmed'=>false])->assertUnprocessable();
        $foreign=CompaniesContacts::factory()->create();
        $this->quote($id,[...$input,'companies_contacts_id'=>$foreign->id])->assertUnprocessable();
        $v=$this->service->version($id,$file['version_id'],$this->owner);Storage::disk('local')->put($v->path,'changed');
        $this->quote($id,$input)->assertConflict();$this->assertDatabaseCount('jn_quote_sources',0);
    }
    public function test_quotes_and_orders_search_code_and_customer_and_reject_stale_edit_form(): void
    {
        [$id,$company,$file,$input]=$this->setupInquiry();$qid=$this->quote($id,$input)->assertOk()->json('quote_id');$quote=Quotes::find($qid);
        $this->getJson('/quotes/json/list?search='.urlencode($quote->code))->assertOk()->assertJsonPath('meta.total',1);
        $this->getJson('/quotes/json/list?search='.urlencode($company->label))->assertOk()->assertJsonPath('meta.total',1);
        $hash=hash('sha256',json_encode($quote->getAttributes()));$quote->update(['label'=>'另一用户已修改']);
        $edit=[...$input,'_jn_revision'=>$hash,'label'=>'旧表单','companies_id'=>$company->id];
        $this->postJson("/quotes/edit/$qid",$edit)->assertConflict();$this->assertSame('另一用户已修改',$quote->fresh()->label);
        $order=Orders::factory()->create(['companies_id'=>$company->id]);$orderHash=hash('sha256',json_encode($order->getAttributes()));$order->update(['label'=>'最新订单']);
        $this->getJson('/orders/json/list?search='.urlencode($order->code).'&statuses[]=1&statuses[]=2&statuses[]=3&statuses[]=4&statuses[]=5')->assertOk()->assertJsonPath('meta.total',1);
        $this->postJson("/orders/edit/{$order->id}",[...$edit,'_jn_revision'=>$orderHash])->assertConflict();
    }
    public function test_foreign_lines_cannot_create_an_empty_order(): void
    {
        [$id,$company,$file,$input]=$this->setupInquiry();$qid=$this->quote($id,$input)->assertOk()->json('quote_id');$other=QuoteLines::factory()->create(['quotes_id'=>Quotes::factory()->create()->id]);
        $this->postJson("/quotes/$qid/lines/json/store-order",['line_ids'=>[$other->id]])->assertUnprocessable();
        $this->assertSame(0,Orders::where('quotes_id',$qid)->count());
    }
    public function test_provider_identity_usage_and_source_validation_are_enforced(): void
    {
        [$id,$company,$file]=$this->setupInquiry();
        $rid=$this->service->start($id,$this->owner,$this->key(),['revision'=>2,'version_ids'=>[$file['version_id']]])['run_id'];$this->service->execute($rid);
        $run=$this->service->detail($id,$this->owner)['runs'][0];
        $this->assertSame('simulation',$run['provider']['provider']);$this->assertSame(0,$run['metrics']['usage']['input_tokens']);$this->assertSame(1,$run['metrics']['attempt']);
        $bad = new class implements ExtractionProvider {
            public function identity(): array {return ['provider'=>'test','version'=>'1','mode'=>'test'];}
            public function extract(array $sources): array {return ['candidates'=>['requirements'=>['value'=>'虚构候选','sources'=>[['version_id'=>999,'line'=>1,'quote'=>'编造来源']]]],'questions'=>[]];}
        };
        $this->expectException(\UnexpectedValueException::class);app(ExtractionGateway::class)->extract($bad,[['version_id'=>1,'text'=>'原文']]);
    }
    public function test_company_edits_return_a_new_revision_and_block_stale_overwrites(): void
    {
        $company=Companies::factory()->create(['label'=>'虚构客户','intra_community_vat'=>null]);
        $revision=hash('sha256',json_encode($company->fresh()->getAttributes()));
        $input=['label'=>'虚构客户新名称','active'=>true,'_jn_revision'=>$revision];
        $result=$this->postJson("/companies/json/update/{$company->id}",$input)->assertOk();
        $this->assertNotSame($revision,$result->json('revision'));
        $this->postJson("/companies/json/update/{$company->id}",$input)->assertConflict();
        $this->postJson("/companies/json/update/{$company->id}",[...$input,'_jn_revision'=>$result->json('revision'),'label'=>'第二次保存'])->assertOk();
        $this->assertSame('第二次保存',$company->fresh()->label);
    }
    public function test_supplier_only_company_cannot_be_attached_as_a_customer(): void
    {
        $supplier=Companies::factory()->create(['active'=>1,'statu_customer'=>1]);
        $this->postJson('/presales/api/inquiries',['title'=>'虚构询价','kind'=>'cabinet','company_id'=>$supplier->id],['X-Request-ID'=>$this->key()])->assertUnprocessable();
        $this->getJson('/presales/api/companies?id='.$supplier->id)->assertOk()->assertExactJson([]);
    }
    public function test_unregistered_provider_is_rejected_without_creating_a_run(): void
    {
        [$id,$company,$file]=$this->setupInquiry();config(['presales.provider'=>'not-configured']);
        $this->postJson("/presales/api/inquiries/$id/runs",['revision'=>2,'version_ids'=>[$file['version_id']]],['X-Request-ID'=>$this->key()])->assertUnprocessable();
        $this->assertDatabaseCount('jn_ai_runs',0);
    }
}
