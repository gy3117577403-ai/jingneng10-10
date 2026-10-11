<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('jn_data_conversations', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('owner_id')->index(); $t->string('title', 180);
            $t->boolean('archived')->default(false); $t->timestamps();
        });
        Schema::create('jn_data_answers', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('conversation_id')->index();
            $t->text('question'); $t->string('keywords', 200)->default('');
            $t->unsignedBigInteger('category_id')->nullable(); $t->boolean('include_history')->default(false);
            $t->string('mode', 20); $t->string('state', 24)->default('queued')->index();
            $t->unsignedSmallInteger('attempts')->default(0); $t->uuid('lease')->nullable();
            $t->longText('sources')->nullable(); $t->longText('answer')->nullable(); $t->text('retrieval')->nullable();
            $t->string('error_code', 40)->nullable(); $t->string('feedback', 20)->nullable(); $t->text('feedback_note')->nullable();
            $t->timestamp('started_at')->nullable(); $t->timestamp('finished_at')->nullable(); $t->timestamps();
        });
    }
    public function down(): void { Schema::dropIfExists('jn_data_answers'); Schema::dropIfExists('jn_data_conversations'); }
};
