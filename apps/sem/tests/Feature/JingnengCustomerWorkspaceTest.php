<?php
namespace Tests\Feature;

use Tests\TestCase;
use App\Models\User;
use App\Models\Companies\{Companies, CompaniesContacts};
use App\Models\Workflow\Quotes;
use Illuminate\Support\Facades\{Queue, Storage, DB};
use Illuminate\Support\Str;
use Spatie\Permission\Models\{Role, Permission};

class JingnengCustomerWorkspaceTest extends TestCase
{
    private User $owner;
    private string $url = '/quotation-workspace/api/customers';
    protected function setUp(): void {
        parent::setUp(); Queue::fake(); Storage::fake('local');
        $this->withoutMiddleware(\App\Http\Middleware\CheckTaskStatus::class);
        $this->owner = User::factory()->create(); $this->owner->assignRole(Role::findOrCreate('Admin', 'web')); $this->actingAs($this->owner);
    }
    private function body(): array {
        return ['name'=>'虚构客户-客户工作区', 'comment'=>'仅用于自动验收', 'website'=>'', 'active'=>true, 'customerStatus'=>'3',
            'contacts'=>[['id'=>(string)Str::uuid(), 'name'=>'虚构联系人', 'mobile'=>'010-00000000']],
            'addresses'=>[['id'=>(string)Str::uuid(), 'label'=>'虚构办公地址', 'adress'=>'虚构路零号', 'city'=>'虚构市']]];
    }
    private function create(array $body, ?string $key = null) { return $this->postJson($this->url,$body,['X-Request-ID'=>$key ?? (string)Str::uuid()]); }
    private function save(array $body, ?string $key = null) { return $this->putJson($this->url.'/'.$body['id'],$body,['X-Request-ID'=>$key ?? (string)Str::uuid()]); }
    public function test_create_retry_search_and_create_quote_use_the_same_customer(): void {
        $body=$this->body();$key=(string)Str::uuid();$c=$this->create($body,$key)->assertOk()->json();
        $this->create($body,$key)->assertOk()->assertJsonPath('id',$c['id']);
        $this->assertDatabaseCount('companies',1);$this->assertDatabaseCount('companies_contacts',1);
        $this->getJson($this->url.'?q=010-00000000')->assertOk()->assertJsonPath('total',1);
        $fixture=Quotes::factory()->create(['user_id'=>$this->owner->id,'companies_id'=>Companies::factory()->create()->id]);
        $q=$this->postJson('/quotation-workspace/api',['title'=>'虚构客户关联报价','type'=>'成套','companyId'=>$c['id'],'contactId'=>$c['contacts'][0]['id'],'addressId'=>$c['addresses'][0]['id'],
            'conditionId'=>$fixture->accounting_payment_conditions_id,'methodId'=>$fixture->accounting_payment_methods_id,'deliveryId'=>$fixture->accounting_deliveries_id,'due'=>'2026-12-01'],['X-Request-ID'=>(string)Str::uuid()])->assertOk()->json();
        $this->assertSame((int)$c['id'],(int)$q['companyId']);
        $this->getJson('/quotation-workspace/api?companyId='.$c['id'])->assertOk()->assertJsonPath('total',1)->assertJsonPath('quotes.0.id',$q['id']);
        $this->getJson($this->url.'/'.$c['id'])->assertOk()->assertJsonPath('quoteCount',1);
    }
    public function test_duplicate_and_stale_edits_do_not_overwrite_current_customer(): void {
        $body=$this->body();$c=$this->create($body)->assertOk()->json();
        $body['name']='  '.$body['name'].'  ';$this->create($body)->assertUnprocessable();
        $c['comment']='新的客户说明';$saved=$this->save($c)->assertOk()->json();
        $c['comment']='过期窗口';$this->save($c)->assertConflict();
        $contact=CompaniesContacts::findOrFail($saved['contacts'][0]['id']);$contact->update(['mobile'=>'010-11111111']);
        $this->save($saved)->assertConflict();
        $this->assertDatabaseHas('companies',['id'=>$c['id'],'comment'=>'新的客户说明']);
    }
    public function test_maintenance_preserves_business_fields_children_and_quote_snapshots(): void {
        $c=$this->create($this->body())->assertOk()->json();$company=Companies::findOrFail($c['id']);$company->update(['discount'=>12,'statu_supplier'=>2]);
        $quote=Quotes::factory()->create(['user_id'=>$this->owner->id,'companies_id'=>$company->id,'companies_contacts_id'=>$c['contacts'][0]['id'],'companies_addresses_id'=>$c['addresses'][0]['id']]);
        $before=$quote->fresh()->getAttributes();$c=$this->getJson($this->url.'/'.$c['id'])->json();$c['contacts']=[];$c['addresses']=[];$c['name']='虚构客户修订名';$c['discount']=99;
        $this->save($c)->assertOk();
        $this->assertSame(12.0,(float)$company->fresh()->discount);$this->assertSame(2,(int)$company->fresh()->statu_supplier);
        $this->assertSame($before,$quote->fresh()->getAttributes());$this->assertCount(1,$company->fresh()->Contacts);$this->assertCount(1,$company->fresh()->Addresses);
        $this->assertDatabaseCount('jn_quote_workspace_versions',0);
    }
    public function test_foreign_contact_id_and_invalid_email_roll_back_whole_edit(): void {
        $c=$this->create($this->body())->assertOk()->json();$other=$this->body();$other['name']='虚构其他客户';$foreign=$this->create($other)->assertOk()->json();
        $c['name']='不应保存';$c['contacts'][0]['id']=$foreign['contacts'][0]['id'];$this->save($c)->assertNotFound();
        $this->assertDatabaseHas('companies',['id'=>$c['id'],'label'=>'虚构客户-客户工作区']);
        $c=$this->getJson($this->url.'/'.$c['id'])->json();$c['contacts'][0]['mail']='invalid';$this->save($c)->assertUnprocessable();
    }
    public function test_permission_and_owner_rules_keep_quote_counts_and_mutations_scoped(): void {
        $c=$this->create($this->body())->assertOk()->json();$other=User::factory()->create();
        Quotes::factory()->create(['user_id'=>$this->owner->id,'companies_id'=>$c['id']]);
        Quotes::factory()->create(['user_id'=>$other->id,'companies_id'=>$c['id']]);
        $role=Role::findOrCreate('customer-test','web');foreach(['quotes-menu','companies-menu'] as $p) Permission::findOrCreate($p,'web');$role->givePermissionTo(['quotes-menu','companies-menu']);$other->assignRole($role);$this->actingAs($other);
        $this->getJson($this->url.'/'.$c['id'])->assertOk()->assertJsonPath('canEdit',false)->assertJsonPath('quoteCount',1);
        $this->getJson('/quotation-workspace/api?companyId='.$c['id'])->assertOk()->assertJsonPath('total',1);
        $this->save($c)->assertForbidden();
        $role->revokePermissionTo('companies-menu');$other->unsetRelation('roles');$this->getJson($this->url)->assertForbidden();
    }
    public function test_personal_customer_raw_name_and_inactive_customer_are_preserved(): void {
        $c=$this->create($this->body())->assertOk()->json();Companies::find($c['id'])->update(['client_type'=>2,'civility'=>'Mx','label'=>'Given','last_name'=>'Family']);
        $c=$this->getJson($this->url.'/'.$c['id'])->assertOk()->assertJsonPath('editName','Given')->json();$c['name']=$c['editName'];$c['active']=false;
        $this->save($c)->assertOk()->assertJsonPath('canQuote',false)->assertJsonPath('name','Mx Given Family');
        $this->getJson($this->url.'?scope=active')->assertJsonPath('total',0);$this->getJson($this->url.'?scope=inactive')->assertJsonPath('total',1);
    }
}
