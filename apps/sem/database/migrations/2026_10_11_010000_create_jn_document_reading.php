<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('jn_data_documents', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('file_id')->unique();
            $t->string('source_hash', 64); $t->string('processor', 40)->default('reading-v1');
            $t->string('state', 24)->default('queued')->index(); $t->unsignedInteger('attempts')->default(0);
            $t->string('lease', 40)->nullable(); $t->string('preview_path')->nullable();
            $t->string('preview_type', 20)->nullable(); $t->unsignedInteger('pages')->default(0);
            $t->unsignedInteger('empty_pages')->default(0); $t->unsignedInteger('chunks')->default(0);
            $t->string('message', 500)->default('正在排队处理。'); $t->timestamps();
            $t->foreign('file_id')->references('id')->on('jn_data_files');
        });
        Schema::create('jn_data_chunks', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('file_id')->index(); $t->unsignedInteger('position');
            $t->unsignedInteger('page')->default(1); $t->unsignedInteger('row')->default(1); $t->string('location', 220); $t->longText('body');
            $t->unique(['file_id', 'position']); $t->foreign('file_id')->references('id')->on('jn_data_files');
        });
    }
    public function down(): void { Schema::dropIfExists('jn_data_chunks'); Schema::dropIfExists('jn_data_documents'); }
};
