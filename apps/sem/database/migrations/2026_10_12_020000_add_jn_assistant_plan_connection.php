<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('jn_data_answers', fn (Blueprint $t) => $t->longText('provider_meta')->nullable());
        Schema::table('jn_data_answers', fn (Blueprint $t) => $t->string('error_code', 100)->nullable()->change());
        Schema::create('jn_data_plan_connections', function (Blueprint $t) {
            $t->unsignedBigInteger('owner_id')->primary();
            $t->string('desired', 24)->default('enabled');
            $t->string('status', 32)->default('offline');
            $t->text('metadata')->nullable();
            $t->timestamp('heartbeat_at')->nullable();
            $t->timestamps();
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('jn_data_plan_connections');
        Schema::table('jn_data_answers', fn (Blueprint $t) => $t->dropColumn('provider_meta'));
    }
};
