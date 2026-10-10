<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class JingnengPresalesSeeder extends Seeder
{
    public function run(): void
    {
        $owner = User::where('email', env('JINGNENG_DEMO_EMAIL', 'admin@jingneng.demo'))->firstOrFail();
        foreach (['cabinet' => ['CT', '成套控制柜'], 'sheet_metal' => ['BJ', '钣金支架']] as $kind => [$code, $name]) {
            DB::transaction(function () use ($owner, $kind, $code, $name) {
                if (DB::table('jn_inquiries')->where('code', 'DEMO-INQ-' . $code)->exists()) { return; }
                $id = DB::table('jn_inquiries')->insertGetId(['code' => 'DEMO-INQ-' . $code, 'kind' => $kind,
                    'title' => $name . '询价（虚构演示）', 'customer_name' => '', 'owner_id' => $owner->id,
                    'requirements' => '', 'created_at' => now(), 'updated_at' => now()]);
                DB::table('jn_presales_events')->insert(['inquiry_id' => $id, 'actor_id' => $owner->id,
                    'label' => '建立虚构演示询价', 'detail' => '{}', 'created_at' => now()]);
            });
        }
    }
}
