<?php
namespace Tests\Feature;

use App\Models\User;
use App\Services\CompanyData\{DataAccess, DataCatalog};
use App\Services\Organization\OrgAccess;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Hash, Queue, Storage};
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class JingnengOrganizationTest extends TestCase
{
    private User $owner; private User $reader; private User $other;
    private int $root; private int $unit; private int $outside; private int $member;
    protected function setUp(): void
    {
        parent::setUp(); Storage::fake('local'); Queue::fake(); $this->withoutMiddleware(\App\Http\Middleware\CheckTaskStatus::class);
        foreach (['owner','reader','other'] as $key) { $this->$key = User::factory()->create(['password' => Hash::make('ExamplePass12345')]); $this->$key->assignRole(Role::firstOrCreate(['name' => $key === 'owner' ? 'Admin' : '组织成员', 'guard_name' => 'web'])); }
        DB::table('jn_org_state')->where('id',1)->update(['owner_user_id'=>$this->owner->id]); $this->actingAs($this->owner);
        $this->root = $this->unit('示例企业'); $this->unit = $this->unit('示例制造部',$this->root); $this->outside = $this->unit('示例财务部',$this->root);
        $this->member = $this->send('person/0',$this->person())->assertOk()->json('id');
    }
    private function send(string $path,array $p=[],?string $key=null) { return $this->postJson('/organization/api/'.$path,[...$p,'request_key'=>$key??(string)Str::uuid()]); }
    private function unit(string $name,?int $parent=null):int {return $this->send('unit/0',['name'=>$name,'parent_id'=>$parent,'kind'=>'department','status'=>'active'])->assertOk()->json('id');}
    private function person(array $extra=[]):array {return ['name'=>'演示成员甲','status'=>'active','needs_review'=>false,'assignments'=>[['unit_id'=>$this->unit,'title'=>'装配','position_id'=>null,'primary'=>true,'manager'=>false]],...$extra];}
    private function revision(string $table,int $id):int {return DB::table('jn_org_'.$table)->where('id',$id)->value('revision');}
    private function grant(array $actions=['browse'],?int $unit=null,bool $desc=true):int {
        $role=DB::table('jn_org_roles')->insertGetId(['name'=>'授权'.Str::uuid(),'permissions'=>json_encode($actions),'enabled'=>true]);
        return DB::table('jn_org_grants')->insertGetId(['user_id'=>$this->reader->id,'role_id'=>$role,'unit_id'=>$unit??$this->unit,'descendants'=>$desc]);
    }
    public function test_default_denies_other_admin_and_member_but_owner_can_manage():void {
        $this->getJson('/organization/api')->assertOk()->assertJsonPath('owner',true)->assertJsonCount(3,'units');
        $this->other->assignRole('Admin');$this->actingAs($this->other);$this->getJson('/organization/api')->assertForbidden();$this->getJson('/organization/api/configuration')->assertForbidden();
        $this->send('role/0',['name'=>'非法','permissions'=>['browse'],'enabled'=>true])->assertForbidden();
    }
    public function test_scoped_directory_reveals_only_context_path_without_private_notes():void {
        DB::table('jn_org_units')->where('id',$this->root)->update(['note'=>'私有上级备注']);$this->grant();$this->actingAs($this->reader);
        $r=$this->getJson('/organization/api')->assertOk()->assertJsonCount(2,'units')->assertJsonCount(1,'people');
        $this->assertNull(collect($r->json('units'))->firstWhere('id',$this->root)['note']);$this->assertNotContains($this->outside,array_column($r->json('units'),'id'));
        $this->getJson('/organization/api/people/'.$this->member)->assertOk()->assertJsonPath('contacts_visible',false)->assertJsonPath('contact',null)->assertJsonPath('can_edit',false);
    }
    public function test_units_cannot_cycle_move_outside_scope_or_delete_with_children():void {
        $this->send('unit/'.$this->root,['name'=>'循环','kind'=>'department','status'=>'active','parent_id'=>$this->unit,'revision'=>1])->assertUnprocessable();
        $this->send('unit/'.$this->root,['action'=>'delete','revision'=>1])->assertUnprocessable();
        $this->grant(['browse','units']);$this->actingAs($this->reader);
        $this->send('unit/'.$this->unit,['name'=>'制造部','kind'=>'department','status'=>'active','parent_id'=>$this->outside,'revision'=>1])->assertForbidden();
    }
    public function test_idempotency_and_revision_conflict_preserve_one_record():void {
        $key=(string)Str::uuid();$p=$this->person(['name'=>'第二位']);$first=$this->send('person/0',$p,$key)->assertOk()->json('id');
        $this->send('person/0',$p,$key)->assertOk()->assertJsonPath('id',$first);$this->assertEquals(2,DB::table('jn_org_people')->count());
        $this->send('person/0',[...$p,'name'=>'另一个内容'],$key)->assertConflict();
        $this->send('person/'.$first,[...$p,'revision'=>1])->assertOk();$this->send('person/'.$first,[...$p,'revision'=>1])->assertConflict();
    }
    public function test_member_multi_appointments_require_exactly_one_primary_and_all_write_scopes():void {
        $jobs=$this->person()['assignments'];$jobs[]=['unit_id'=>$this->outside,'primary'=>true,'manager'=>false,'title'=>'兼职'];
        $this->send('person/0',$this->person(['assignments'=>$jobs]))->assertUnprocessable();$jobs[1]['primary']=false;
        $id=$this->send('person/0',$this->person(['assignments'=>$jobs]))->assertOk()->json('id');$this->grant(['browse','people','avatars','contacts']);$this->actingAs($this->reader);
        $this->getJson('/organization/api/people/'.$id)->assertOk()->assertJsonCount(1,'assignments')->assertJsonPath('can_edit',false)->assertJsonPath('can_avatar',false);
        $this->send('person/'.$id,$this->person(['revision'=>1]))->assertForbidden();
    }
    public function test_contact_storage_and_view_are_separate_from_browse():void {
        $this->send('person/'.$this->member,$this->person(['revision'=>1,'contact'=>['phone'=>'演示联系电话','email'=>'test@example.invalid']]))->assertOk();
        $this->assertStringNotContainsString('example.invalid',DB::table('jn_org_people')->find($this->member)->contact);
        $this->grant(['browse','people']);$this->actingAs($this->reader);$this->getJson('/organization/api/people/'.$this->member)->assertOk()->assertJsonPath('contact',null);
        $this->send('person/'.$this->member,$this->person(['revision'=>2,'contact'=>['phone'=>'更改']]))->assertForbidden();
        $this->send('person/'.$this->member,$this->person(['revision'=>2,'name'=>'可编辑姓名']))->assertOk();
    }
    public function test_removing_people_keeps_history_and_releases_empty_unit():void {
        $this->send('unit/'.$this->unit,['action'=>'delete','revision'=>1])->assertUnprocessable();
        $this->send('person/'.$this->member,['action'=>'delete','revision'=>1])->assertOk();$this->getJson('/organization/api/people/'.$this->member)->assertNotFound();
        $this->assertNotNull(DB::table('jn_org_assignments')->where('person_id',$this->member)->value('ended_at'));
        $this->send('unit/'.$this->unit,['action'=>'delete','revision'=>1])->assertOk();$this->assertNotNull(DB::table('jn_org_units')->find($this->unit)->deleted_at);
    }
    public function test_position_in_use_cannot_be_removed():void {
        $pos=$this->send('position/0',['name'=>'装配班组长','enabled'=>true])->assertOk()->json('id');$jobs=$this->person()['assignments'];$jobs[0]['position_id']=$pos;
        $this->send('person/'.$this->member,$this->person(['revision'=>1,'assignments'=>$jobs]))->assertOk();$this->send('position/'.$pos,['action'=>'delete','revision'=>1])->assertUnprocessable();
        $this->send('position/'.$pos,['name'=>'装配班组长','enabled'=>false,'revision'=>1])->assertUnprocessable();
        $this->send('person/'.$this->member,$this->person(['revision'=>2,'assignments'=>$jobs,'name'=>'仍可维护']))->assertOk();
    }
    public function test_role_and_grant_revocation_apply_on_next_request_and_block_replayed_mutation():void {
        $gid=$this->grant(['browse','people']);$this->actingAs($this->reader);$key=(string)Str::uuid();$p=$this->person(['name'=>'受限维护创建']);
        $this->send('person/0',$p,$key)->assertOk();$this->actingAs($this->owner);$this->send('grant/'.$gid,['action'=>'delete','revision'=>1])->assertOk();
        $this->actingAs($this->reader);$this->getJson('/organization/api')->assertForbidden();$this->send('person/0',$p,$key)->assertForbidden();
    }
    public function test_role_fields_cannot_smuggle_admin_powers_and_expired_grant_does_not_work():void {
        $this->send('role/0',['name'=>'非法能力','permissions'=>['owner'],'enabled'=>true])->assertUnprocessable();$gid=$this->grant();DB::table('jn_org_grants')->where('id',$gid)->update(['expires_at'=>now()->subSecond()]);
        $this->actingAs($this->reader);$this->getJson('/organization/api')->assertForbidden();
    }
    public function test_owner_transfer_checks_password_and_retains_one_owner():void {
        $rev=DB::table('jn_org_state')->value('revision');$this->send('owner/0',['revision'=>$rev,'user_id'=>$this->reader->id,'password'=>'bad'])->assertUnprocessable();
        $this->send('owner/0',['revision'=>$rev,'user_id'=>$this->reader->id,'password'=>'ExamplePass12345'])->assertOk();
        $this->getJson('/organization/api/configuration')->assertForbidden();$this->actingAs($this->reader);$this->getJson('/organization/api')->assertOk()->assertJsonPath('owner',true);
        $this->assertStringNotContainsString('ExamplePass12345',json_encode(DB::table('jn_org_events')->get()));
    }
    public function test_owner_member_cannot_be_disabled_deleted_or_unlinked():void {
        $this->send('account/'.$this->member,['revision'=>1,'user_id'=>$this->owner->id])->assertOk();
        $this->send('person/'.$this->member,['action'=>'delete','revision'=>2])->assertUnprocessable();$this->send('person/'.$this->member,$this->person(['status'=>'inactive','revision'=>2]))->assertUnprocessable();
        $this->send('account/'.$this->member,['revision'=>2,'user_id'=>$this->reader->id])->assertUnprocessable();
    }
    public function test_new_member_does_not_create_login_and_new_login_has_no_grants():void {
        $this->assertEquals(3,User::count());$r=$this->send('account/'.$this->member,['action'=>'create','revision'=>1,'email'=>'fictional@example.invalid','password'=>'ExampleOnly12345'])->assertOk();
        $account=User::find($r->json('user_id'));$this->assertTrue($account->hasRole('组织成员'));$this->assertFalse($account->hasRole('Admin'));
        $this->actingAs($account);$this->getJson('/organization/api')->assertForbidden();$this->assertEquals(0,DB::table('jn_org_grants')->where('user_id',$account->id)->count());
    }
    public function test_unverified_and_inactive_members_cannot_get_accounts():void {
        DB::table('jn_org_people')->where('id',$this->member)->update(['needs_review'=>true]);
        $this->send('account/'.$this->member,['action'=>'create','revision'=>1,'email'=>'fictional@example.invalid','password'=>'ExampleOnly12345'])->assertUnprocessable();
        DB::table('jn_org_people')->where('id',$this->member)->update(['needs_review'=>false,'status'=>'inactive']);$this->send('account/'.$this->member,['revision'=>1,'user_id'=>$this->reader->id])->assertUnprocessable();
    }
    public function test_avatar_upload_sanitizes_image_and_enforces_private_read_and_removal():void {
        $this->post('/organization/api/people/'.$this->member.'/avatar',['avatar'=>UploadedFile::fake()->image('photo.jpg',250,400),'revision'=>1,'request_key'=>(string)Str::uuid()],['Accept'=>'application/json'])->assertOk();
        $path=DB::table('jn_org_people')->find($this->member)->avatar_path;$info=getimagesize(Storage::disk('local')->path($path));$this->assertEquals([512,512],array_slice($info,0,2));
        $url='/organization/api/people/'.$this->member.'/avatar';$this->get($url)->assertOk()->assertHeader('Content-Type','image/png');
        $this->actingAs($this->other);$this->get($url)->assertForbidden();$this->actingAs($this->owner);
        $this->send('people/'.$this->member.'/avatar',['action'=>'remove','revision'=>2])->assertOk();$this->get($url)->assertNotFound();
    }
    public function test_avatar_rejects_svg_and_stale_revision():void {
        $url='/organization/api/people/'.$this->member.'/avatar';
        $this->post($url,['avatar'=>UploadedFile::fake()->createWithContent('bad.svg','<svg xmlns="http://www.w3.org/2000/svg"><script>bad</script></svg>'),'revision'=>1,'request_key'=>(string)Str::uuid()],['Accept'=>'application/json'])->assertUnprocessable();
        $this->post($url,['avatar'=>UploadedFile::fake()->image('photo.png',100,100),'revision'=>0,'request_key'=>(string)Str::uuid()],['Accept'=>'application/json'])->assertConflict();
    }
    public function test_department_acl_distinguishes_direct_and_descendants_and_rechecks_membership():void {
        $this->send('account/'.$this->member,['revision'=>1,'user_id'=>$this->reader->id])->assertOk();
        $cid=DB::table('jn_data_categories')->insertGetId(['name'=>'示例组织资料','fields'=>'[]']);$cat=DB::table('jn_data_categories')->find($cid);
        $rule=['principal_type'=>'organization','principal_id'=>$this->root,'action'=>'view','effect'=>'allow'];app(DataCatalog::class)->rules('category',$cid,[$rule]);
        $this->assertFalse((new DataAccess())->can($this->reader,'view',$cat));$rule['principal_type']='organization_tree';app(DataCatalog::class)->rules('category',$cid,[$rule]);$this->assertTrue((new DataAccess())->can($this->reader,'view',$cat));
        $deny=['principal_type'=>'user','principal_id'=>$this->reader->id,'action'=>'view','effect'=>'deny'];app(DataCatalog::class)->rules('category',$cid,[$rule,$deny]);$this->assertFalse((new DataAccess())->can($this->reader,'view',$cat));
        app(DataCatalog::class)->rules('category',$cid,[$rule]);$this->send('person/'.$this->member,$this->person(['revision'=>2,'status'=>'inactive']))->assertOk();$this->assertFalse((new DataAccess())->can($this->reader,'view',$cat));
    }
    public function test_content_reference_blocks_deleting_organization():void {
        $cid=DB::table('jn_data_categories')->insertGetId(['name'=>'组织资料','fields'=>'[]']);app(DataCatalog::class)->rules('category',$cid,[['principal_type'=>'organization','principal_id'=>$this->outside,'action'=>'view','effect'=>'allow']]);
        $this->send('unit/'.$this->outside,['revision'=>1,'action'=>'delete'])->assertUnprocessable();
    }
    public function test_bootstrap_does_not_replace_owner_and_demo_import_is_idempotent():void {
        $this->artisan('organization:initialize',['--owner'=>$this->owner->email,'--demo'=>true])->assertExitCode(0);$units=DB::table('jn_org_units')->count();$people=DB::table('jn_org_people')->count();
        DB::table('jn_org_people')->where('source_key','demo-person-0')->update(['code'=>'EMP-0001','name'=>'已人工修改']);
        $this->artisan('organization:initialize',['--owner'=>$this->owner->email,'--demo'=>true])->assertExitCode(0);$this->assertEquals($units,DB::table('jn_org_units')->count());$this->assertEquals($people,DB::table('jn_org_people')->count());
        $this->assertDatabaseHas('jn_org_people',['source_key'=>'demo-person-0','code'=>'EMP-0001','name'=>'已人工修改']);
        $this->assertEquals(3,User::count());$this->assertEquals(0,DB::table('jn_org_grants')->count());
    }
    public function test_sorted_import_still_rejects_more_than_twelve_levels_without_partial_writes():void {
        $units=[];for($i=1;$i<=13;$i++)$units[]=['key'=>'deep-'.$i,'name'=>'示例层级'.$i,'parent'=>$i>1?'deep-'.($i-1):null,'kind'=>'department'];
        $path=tempnam(sys_get_temp_dir(),'org-test-');file_put_contents($path,json_encode(['units'=>$units,'people'=>[]]));
        try {try {$this->artisan('organization:initialize',['--owner'=>$this->owner->email,'--file'=>$path])->run();$this->fail('Expected depth rejection');}catch(\RuntimeException $e){$this->assertStringContainsString('12层',$e->getMessage());}$this->assertDatabaseMissing('jn_org_units',['code'=>'deep-1']);} finally {unlink($path);}
    }
    public function test_non_numeric_target_missing_key_and_unknown_kind_are_rejected():void {
        $this->postJson('/organization/api/person/0',$this->person())->assertUnprocessable();$this->send('person/nope',$this->person())->assertNotFound();$this->send('anything/0',[])->assertNotFound();
    }
    public function test_direct_only_maintainer_cannot_create_out_of_scope_child():void {
        $this->grant(['browse','units'],$this->unit,false);$this->actingAs($this->reader);
        $this->send('unit/0',['name'=>'越界下级','kind'=>'team','parent_id'=>$this->unit,'status'=>'active'])->assertForbidden();$this->assertDatabaseMissing('jn_org_units',['name'=>'越界下级']);
    }
    public function test_inactive_member_loses_direct_document_rules_and_org_session_access():void {
        $this->send('account/'.$this->member,['revision'=>1,'user_id'=>$this->reader->id])->assertOk();$this->grant();
        $cid=DB::table('jn_data_categories')->insertGetId(['name'=>'直接授权资料','fields'=>'[]']);$cat=DB::table('jn_data_categories')->find($cid);
        app(DataCatalog::class)->rules('category',$cid,[['principal_type'=>'user','principal_id'=>$this->reader->id,'action'=>'view','effect'=>'allow']]);
        $this->assertTrue((new DataAccess())->can($this->reader,'view',$cat));$this->send('person/'.$this->member,$this->person(['revision'=>2,'status'=>'inactive']))->assertOk();
        $this->assertFalse((new DataAccess())->can($this->reader,'view',$cat));$this->actingAs($this->reader);$this->getJson('/organization/api')->assertForbidden();$this->getJson('/company-data/api')->assertForbidden();
    }
    public function test_existing_account_management_cannot_delete_current_owner():void {
        $this->expectException(\Illuminate\Validation\ValidationException::class);$this->owner->delete();
    }
    public function test_existing_account_management_cannot_ban_current_owner():void {
        $this->expectException(\Illuminate\Validation\ValidationException::class);$this->owner->update(['banned_until'=>now()->addYear()]);
    }
    public function test_zero_assignment_and_parent_ids_have_validation_errors_not_database_errors():void {
        $p=$this->person();$p['assignments'][0]['unit_id']=0;$this->send('person/0',$p)->assertUnprocessable();
        $this->send('unit/0',['name'=>'零上级','kind'=>'team','parent_id'=>0,'status'=>'active'])->assertUnprocessable();
    }
}
