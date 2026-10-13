<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('jn_quote_workspaces', function (Blueprint $t) {
            $t->unsignedBigInteger('quote_id')->primary();
            $t->unsignedInteger('revision')->default(1);
            $t->longText('payload');
            $t->timestamps();
        });
        Schema::create('jn_quote_workspace_versions', function (Blueprint $t) {
            $t->id(); $t->unsignedBigInteger('quote_id'); $t->unsignedInteger('revision');
            $t->unsignedBigInteger('actor_id'); $t->longText('snapshot'); $t->timestamp('created_at');
            $t->unique(['quote_id', 'revision']);
        });
    }
    public function down(): void
    {
        Schema::dropIfExists('jn_quote_workspace_versions');
        Schema::dropIfExists('jn_quote_workspaces');
    }
};
