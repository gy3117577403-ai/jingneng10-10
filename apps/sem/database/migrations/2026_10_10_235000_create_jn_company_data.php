<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};
use Spatie\Permission\Models\{Permission, Role};

return new class extends Migration {
    public function up(): void
    {
        Schema::create('jn_data_state', function (Blueprint $t) { $t->unsignedInteger('id')->primary(); $t->unsignedBigInteger('revision')->default(1); });
        DB::table('jn_data_state')->insert(['id' => 1, 'revision' => 1]);
        Schema::create('jn_data_groups', function (Blueprint $t) {
            $t->id(); $t->string('name', 80)->unique(); $t->unsignedInteger('revision')->default(1); $t->timestamps();
        });
        Schema::create('jn_data_members', function (Blueprint $t) {
            $t->foreignId('group_id')->constrained('jn_data_groups'); $t->foreignId('user_id')->constrained('users'); $t->unique(['group_id', 'user_id']);
        });
        Schema::create('jn_data_categories', function (Blueprint $t) {
            $t->id(); $t->foreignId('parent_id')->nullable()->constrained('jn_data_categories'); $t->string('name', 80);
            $t->text('description')->nullable(); $t->json('fields'); $t->unsignedInteger('schema_version')->default(1);
            $t->unsignedInteger('revision')->default(1); $t->integer('position')->default(0); $t->boolean('enabled')->default(true); $t->timestamps();
        });
        Schema::create('jn_data_records', function (Blueprint $t) {
            $t->id(); $t->foreignId('category_id')->constrained('jn_data_categories'); $t->string('code', 80);
            $t->string('kind', 16); $t->string('policy_mode', 16)->default('inherit'); $t->foreignId('owner_id')->constrained('users');
            $t->unsignedBigInteger('draft_version_id')->nullable(); $t->unsignedBigInteger('published_version_id')->nullable();
            $t->unsignedInteger('revision')->default(1); $t->boolean('archived')->default(false); $t->timestamps();
            $t->unique(['category_id', 'code']);
        });
        Schema::create('jn_data_versions', function (Blueprint $t) {
            $t->id(); $t->foreignId('record_id')->constrained('jn_data_records'); $t->unsignedInteger('number');
            $t->string('title', 180); $t->json('values'); $t->json('fields'); $t->unsignedInteger('schema_version'); $t->json('file_ids');
            $t->string('state', 20)->default('draft'); $t->text('note'); $t->foreignId('created_by')->constrained('users');
            $t->foreignId('reviewer_id')->nullable()->constrained('users'); $t->foreignId('submitted_by')->nullable()->constrained('users');
            $t->timestamp('submitted_at')->nullable(); $t->text('decision_note')->nullable(); $t->timestamp('decided_at')->nullable();
            $t->timestamp('published_at')->nullable(); $t->timestamp('created_at'); $t->unique(['record_id', 'number']);
        });
        Schema::create('jn_data_files', function (Blueprint $t) {
            $t->id(); $t->foreignId('record_id')->constrained('jn_data_records'); $t->foreignId('uploaded_by')->constrained('users');
            $t->string('filename', 200); $t->string('extension', 16); $t->string('mime', 120); $t->string('path');
            $t->unsignedBigInteger('size'); $t->char('sha256', 64); $t->timestamp('created_at');
        });
        Schema::create('jn_data_rules', function (Blueprint $t) {
            $t->id(); $t->string('scope_type', 16); $t->unsignedBigInteger('scope_id');
            $t->string('principal_type', 16); $t->unsignedBigInteger('principal_id')->default(0); $t->string('action', 20); $t->string('effect', 8);
            $t->unique(['scope_type', 'scope_id', 'principal_type', 'principal_id', 'action'], 'jn_data_rule_unique');
        });
        Schema::create('jn_data_access_requests', function (Blueprint $t) {
            $t->id(); $t->foreignId('record_id')->constrained('jn_data_records'); $t->foreignId('version_id')->constrained('jn_data_versions');
            $t->foreignId('applicant_id')->constrained('users'); $t->foreignId('approver_id')->constrained('users');
            $t->string('state', 16)->default('pending'); $t->unsignedInteger('revision')->default(1);
            $t->text('reason'); $t->text('decision_note')->nullable(); $t->timestamp('expires_at'); $t->timestamps();
            $t->index(['applicant_id', 'state', 'expires_at'], 'jn_data_access_lookup');
        });
        Schema::create('jn_data_tasks', function (Blueprint $t) {
            $t->id(); $t->foreignId('record_id')->constrained('jn_data_records'); $t->foreignId('version_id')->constrained('jn_data_versions');
            $t->foreignId('created_by')->constrained('users'); $t->foreignId('assignee_id')->constrained('users');
            $t->string('title', 160); $t->text('description'); $t->date('due_date'); $t->string('state', 16)->default('open');
            $t->text('result')->nullable(); $t->unsignedInteger('revision')->default(1); $t->timestamps(); $t->index(['assignee_id', 'state']);
        });
        Schema::create('jn_data_comments', function (Blueprint $t) {
            $t->id(); $t->foreignId('record_id')->constrained('jn_data_records'); $t->foreignId('version_id')->constrained('jn_data_versions');
            $t->foreignId('actor_id')->constrained('users'); $t->text('body'); $t->timestamp('created_at');
        });
        Schema::create('jn_data_imports', function (Blueprint $t) {
            $t->id(); $t->foreignId('category_id')->constrained('jn_data_categories'); $t->foreignId('actor_id')->constrained('users');
            $t->string('filename', 200); $t->string('path'); $t->char('sha256', 64); $t->json('headers'); $t->json('rows'); $t->json('mapping');
            $t->unsignedInteger('category_revision'); $t->json('result'); $t->string('state', 16)->default('preview'); $t->timestamps();
        });
        Schema::create('jn_data_events', function (Blueprint $t) {
            $t->id(); $t->string('scope_type', 16); $t->unsignedBigInteger('scope_id'); $t->foreignId('actor_id')->constrained('users');
            $t->unsignedBigInteger('version_id')->nullable(); $t->string('label', 80); $t->json('detail'); $t->timestamp('created_at');
            $t->index(['scope_type', 'scope_id']);
        });
        Schema::create('jn_data_receipts', function (Blueprint $t) {
            $t->id(); $t->foreignId('actor_id')->constrained('users'); $t->uuid('request_key'); $t->char('fingerprint', 64);
            $t->json('response'); $t->timestamp('created_at'); $t->unique(['actor_id', 'request_key']);
        });
        Permission::firstOrCreate(['name' => '管理资料中心', 'guard_name' => 'web']);
        Role::where('name', 'Admin')->first()?->givePermissionTo('管理资料中心');
        app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        foreach (['receipts', 'events', 'imports', 'comments', 'tasks', 'access_requests', 'rules', 'files', 'versions', 'records', 'members', 'groups', 'categories', 'state'] as $name) Schema::dropIfExists('jn_data_' . $name);
    }
};
