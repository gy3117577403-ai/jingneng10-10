<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Workflow\Quotes;
use App\Services\Presales\PresalesService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Queue, Storage, DB};
use Illuminate\Support\Str;
use Spatie\Permission\Models\{Role, Permission};
use Tests\TestCase;

class FocusedWorkspaceTest extends TestCase
{
    private function user(): User
    {
        $user=User::factory()->create();$user->assignRole(Role::firstOrCreate(['name'=>'Sales','guard_name'=>'web']));return $user;
    }
    public function test_inbox_and_search_enforce_record_permissions_and_revocation(): void
    {
        Storage::fake('local');Queue::fake();$owner=$this->user();$other=$this->user();$service=app(PresalesService::class);
        $id=$service->create($owner,(string)Str::uuid(),['title'=>'虚构核对事项','kind'=>'cabinet'])['id'];
        $upload=$service->upload($id,$owner,(string)Str::uuid(),['revision'=>1],UploadedFile::fake()->createWithContent('虚构需求.txt',"客户名称：虚构客户\n需求说明：虚构测试"));
        $run=$service->start($id,$owner,(string)Str::uuid(),['revision'=>2,'version_ids'=>[$upload['version_id']]]);$service->execute($run['run_id']);
        $this->actingAs($other)->getJson('/workspace/inbox?scope=all')->assertOk()->assertJsonPath('total',0);
        $this->getJson('/workspace/search?q=虚构')->assertOk()->assertJsonCount(0,'items');
        $service->members($id,$owner,(string)Str::uuid(),['revision'=>2,'user_ids'=>[$other->id]]);
        $this->getJson('/workspace/inbox?scope=all')->assertOk()->assertJsonPath('total',1)->assertJsonPath('items.0.key','presales:'.$run['run_id']);
        $this->getJson('/workspace/inbox?scope=mine')->assertJsonPath('total',0);
        $this->getJson('/workspace/inbox?scope=requested')->assertJsonPath('total',0);
        $this->getJson('/workspace/search?q=虚构')->assertJsonCount(2,'items')->assertHeader('Cache-Control','no-store, private');
        $service->members($id,$owner,(string)Str::uuid(),['revision'=>3,'user_ids'=>[]]);
        $this->getJson('/workspace/inbox?scope=all')->assertJsonPath('total',0);
        $this->getJson('/workspace/search?q=虚构需求')->assertJsonCount(0,'items');
        $this->actingAs($owner)->getJson('/workspace/inbox?scope=requested')->assertJsonPath('total',1)->assertJsonPath('items.0.state','需重新提取');
    }

    public function test_business_sources_respect_module_permissions_and_owner_scope(): void
    {
        $owner=$this->user();$other=$this->user();$quote=Quotes::factory()->create(['label'=>'虚构来源报价','statu'=>1,'user_id'=>$owner->id]);
        $this->actingAs($other)->getJson('/workspace/inbox?scope=all')->assertOk()->assertJsonPath('total',0);
        $this->getJson('/workspace/search?q=虚构来源报价')->assertJsonCount(0,'items');
        $other->givePermissionTo(Permission::firstOrCreate(['name'=>'quotes-menu','guard_name'=>'web']));
        $this->getJson('/workspace/inbox?scope=all')->assertJsonPath('total',1)->assertJsonPath('items.0.key','quote:'.$quote->id);
        $this->getJson('/workspace/inbox?scope=mine')->assertJsonPath('total',0);
        $this->getJson('/workspace/search?q=虚构来源报价')->assertJsonCount(1,'items');
        $quote->update(['statu'=>3]);$this->getJson('/workspace/inbox?scope=all')->assertJsonPath('total',0);
    }

    public function test_source_limit_reports_true_total_and_search_happens_before_limit(): void
    {
        $owner=$this->user();$owner->givePermissionTo(Permission::firstOrCreate(['name'=>'quotes-menu','guard_name'=>'web']));
        Quotes::factory()->count(51)->create(['label'=>'虚构分页报价','statu'=>1,'user_id'=>$owner->id]);
        $target=Quotes::factory()->create(['label'=>'唯一查找目标','statu'=>1,'user_id'=>$owner->id]);
        $this->actingAs($owner)->getJson('/workspace/inbox')->assertOk()->assertJsonPath('total',52)->assertJsonCount(50,'items');
        $this->getJson('/workspace/inbox?q=唯一查找目标')->assertJsonPath('total',1)->assertJsonPath('items.0.key','quote:'.$target->id);
        $this->getJson('/workspace/inbox?scope=invalid')->assertUnprocessable();
    }
}
