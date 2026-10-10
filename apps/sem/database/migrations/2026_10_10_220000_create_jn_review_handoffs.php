<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\{Role, Permission};

return new class extends Migration {
    public function up(): void
    {
        Schema::create('jn_quote_reviews', function (Blueprint $t) {
            $t->id(); $t->foreignId('quote_id')->constrained('quotes'); $t->unsignedInteger('version');
            $t->string('state', 20); $t->foreignId('submitted_by')->constrained('users');
            $t->foreignId('reviewer_id')->constrained('users'); $t->json('snapshot'); $t->char('fingerprint', 64);
            $t->text('note'); $t->text('decision_note')->nullable(); $t->foreignId('decided_by')->nullable()->constrained('users');
            $t->timestamp('decided_at')->nullable(); $t->longText('print_html');
            $t->string('draft_path'); $t->char('draft_sha256', 64);
            $t->string('approved_path')->nullable(); $t->char('approved_sha256', 64)->nullable(); $t->timestamps();
            $t->unique(['quote_id', 'version']); $t->index(['reviewer_id', 'state']);
        });
        Schema::create('jn_order_quote_reviews', function (Blueprint $t) {
            $t->foreignId('order_id')->primary()->constrained('orders'); $t->foreignId('review_id')->constrained('jn_quote_reviews');
            $t->json('line_ids'); $t->timestamp('created_at');
        });
        Schema::create('jn_technical_handoffs', function (Blueprint $t) {
            $t->id(); $t->foreignId('order_id')->unique()->constrained('orders');
            $t->foreignId('sender_id')->constrained('users'); $t->foreignId('receiver_id')->constrained('users');
            $t->string('state', 20); $t->unsignedInteger('version')->default(1); $t->unsignedInteger('revision')->default(1);
            $t->date('due_date'); $t->timestamps(); $t->index(['receiver_id', 'state']);
        });
        Schema::create('jn_handoff_versions', function (Blueprint $t) {
            $t->id(); $t->foreignId('handoff_id')->constrained('jn_technical_handoffs');
            $t->unsignedInteger('version'); $t->json('snapshot'); $t->char('fingerprint', 64);
            $t->foreignId('actor_id')->constrained('users'); $t->text('note'); $t->timestamp('created_at');
            $t->unique(['handoff_id', 'version']);
        });
        Schema::create('jn_sales_events', function (Blueprint $t) {
            $t->id(); $t->string('scope', 16); $t->unsignedBigInteger('entity_id');
            $t->foreignId('actor_id')->constrained('users'); $t->string('label', 80); $t->json('detail');
            $t->timestamp('created_at'); $t->index(['scope', 'entity_id']);
        });
        Schema::create('jn_sales_receipts', function (Blueprint $t) {
            $t->id(); $t->string('scope', 16); $t->unsignedBigInteger('entity_id'); $t->uuid('request_key');
            $t->foreignId('actor_id')->constrained('users'); $t->char('fingerprint', 64); $t->json('response');
            $t->timestamp('created_at'); $t->unique(['scope', 'entity_id', 'request_key'], 'jn_sales_request_unique');
        });
        foreach (['提交报价核对', '核对报价版本', '发起技术交接', '接收技术交接'] as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }
        foreach (['Sales' => ['提交报价核对', '发起技术交接'], '报价核对员' => ['核对报价版本'], '技术接收员' => ['接收技术交接']] as $name => $permissions) {
            Role::firstOrCreate(['name' => $name, 'guard_name' => 'web'])->givePermissionTo($permissions);
        }
        Role::where('name', 'Admin')->first()?->givePermissionTo(['提交报价核对', '核对报价版本', '发起技术交接', '接收技术交接']);
        app(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        foreach (['jn_sales_receipts', 'jn_sales_events', 'jn_handoff_versions', 'jn_technical_handoffs', 'jn_order_quote_reviews', 'jn_quote_reviews'] as $table) Schema::dropIfExists($table);
        // Do not remove roles which may have acquired manually configured permissions.
    }
};
