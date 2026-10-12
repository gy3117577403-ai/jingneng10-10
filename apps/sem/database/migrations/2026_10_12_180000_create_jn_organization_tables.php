<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};

return new class extends Migration {
    public function up(): void
    {
        Schema::create('jn_org_state', function (Blueprint $t) {
            $t->unsignedBigInteger('id')->primary();
            $t->foreignId('owner_user_id')->nullable()->constrained('users')->restrictOnDelete();
            $t->unsignedInteger('revision')->default(1);
        });
        DB::table('jn_org_state')->insert(['id' => 1, 'revision' => 1]);
        Schema::create('jn_org_units', function (Blueprint $t) {
            $t->id(); $t->foreignId('parent_id')->nullable()->constrained('jn_org_units')->restrictOnDelete();
            $t->string('name', 80); $t->string('kind', 24); $t->string('code', 80)->unique();
            $t->string('status', 16)->default('active'); $t->unsignedInteger('sort')->default(0);
            $t->text('note')->nullable(); $t->unsignedInteger('revision')->default(1);
            $t->timestamps(); $t->softDeletes();
        });
        Schema::create('jn_org_positions', function (Blueprint $t) {
            $t->id(); $t->string('name', 80)->unique(); $t->text('description')->nullable();
            $t->boolean('enabled')->default(true); $t->unsignedInteger('revision')->default(1);
            $t->timestamps(); $t->softDeletes();
        });
        Schema::create('jn_org_people', function (Blueprint $t) {
            $t->id(); $t->string('name', 80); $t->string('code', 80)->unique();
            $t->foreignId('user_id')->nullable()->unique()->constrained('users')->restrictOnDelete();
            $t->string('status', 16)->default('active'); $t->boolean('needs_review')->default(false);
            $t->boolean('demo')->default(false); $t->text('contact')->nullable(); $t->text('note')->nullable();
            $t->string('avatar_path')->nullable(); $t->unsignedInteger('revision')->default(1);
            $t->timestamps(); $t->softDeletes();
        });
        Schema::create('jn_org_assignments', function (Blueprint $t) {
            $t->id(); $t->foreignId('person_id')->constrained('jn_org_people')->restrictOnDelete();
            $t->foreignId('unit_id')->constrained('jn_org_units')->restrictOnDelete();
            $t->foreignId('position_id')->nullable()->constrained('jn_org_positions')->restrictOnDelete();
            $t->string('title', 80)->default(''); $t->boolean('primary')->default(false);
            $t->boolean('manager')->default(false); $t->timestamps(); $t->timestamp('ended_at')->nullable();
            $t->index(['person_id', 'ended_at']); $t->index(['unit_id', 'ended_at']);
        });
        Schema::create('jn_org_roles', function (Blueprint $t) {
            $t->id(); $t->string('name', 80)->unique(); $t->text('permissions');
            $t->boolean('enabled')->default(true); $t->unsignedInteger('revision')->default(1); $t->timestamps();
        });
        Schema::create('jn_org_grants', function (Blueprint $t) {
            $t->id(); $t->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $t->foreignId('role_id')->constrained('jn_org_roles')->restrictOnDelete();
            $t->foreignId('unit_id')->nullable()->constrained('jn_org_units')->restrictOnDelete();
            $t->boolean('descendants')->default(true); $t->timestamp('expires_at')->nullable();
            $t->unsignedInteger('revision')->default(1); $t->timestamps();
        });
        Schema::create('jn_org_events', function (Blueprint $t) {
            $t->id(); $t->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('kind', 24); $t->unsignedBigInteger('target_id')->nullable();
            $t->string('action', 80); $t->text('detail'); $t->timestamp('created_at');
        });
        Schema::create('jn_org_receipts', function (Blueprint $t) {
            $t->id(); $t->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $t->uuid('request_key'); $t->string('fingerprint', 64); $t->text('response'); $t->timestamp('created_at');
            $t->unique(['actor_id', 'request_key']);
        });
    }

    public function down(): void
    {
        foreach (['receipts', 'events', 'grants', 'roles', 'assignments', 'people', 'positions', 'units', 'state'] as $name) Schema::dropIfExists('jn_org_'.$name);
    }
};
