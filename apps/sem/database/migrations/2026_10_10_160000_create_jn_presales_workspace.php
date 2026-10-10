<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('jn_inquiries', function (Blueprint $t) {
            $t->id(); $t->string('code', 40)->unique(); $t->string('kind', 16);
            $t->string('title', 160); $t->string('customer_name', 140)->default('');
            $t->date('expected_date')->nullable(); $t->text('requirements')->nullable();
            $t->foreignId('owner_id')->constrained('users')->restrictOnDelete();
            $t->unsignedInteger('revision')->default(1); $t->timestamps();
            $t->index(['owner_id', 'updated_at']);
        });
        Schema::create('jn_inquiry_members', function (Blueprint $t) {
            $t->foreignId('inquiry_id')->constrained('jn_inquiries')->cascadeOnDelete();
            $t->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $t->primary(['inquiry_id', 'user_id']);
        });
        Schema::create('jn_documents', function (Blueprint $t) {
            $t->id(); $t->foreignId('inquiry_id')->constrained('jn_inquiries')->restrictOnDelete();
            $t->string('name', 200); $t->timestamp('created_at');
        });
        Schema::create('jn_file_versions', function (Blueprint $t) {
            $t->id(); $t->foreignId('document_id')->constrained('jn_documents')->restrictOnDelete();
            $t->unsignedInteger('version'); $t->string('filename', 200); $t->string('path')->unique();
            $t->char('sha256', 64); $t->unsignedBigInteger('size'); $t->string('extension', 12);
            $t->foreignId('uploaded_by')->constrained('users')->restrictOnDelete(); $t->timestamp('created_at');
            $t->unique(['document_id', 'version']);
        });
        Schema::create('jn_ai_runs', function (Blueprint $t) {
            $t->id(); $t->foreignId('inquiry_id')->constrained('jn_inquiries')->restrictOnDelete();
            $t->foreignId('requested_by')->constrained('users')->restrictOnDelete();
            $t->char('input_hash', 64); $t->unsignedInteger('revision');
            $t->string('state', 20)->default('queued'); $t->unsignedTinyInteger('attempts')->default(0);
            $t->uuid('execution_token')->nullable(); $t->json('sources'); $t->json('output')->nullable();
            $t->json('review')->nullable(); $t->text('error')->nullable();
            $t->timestamp('started_at')->nullable(); $t->timestamp('finished_at')->nullable();
            $t->timestamp('dispatched_at')->nullable(); $t->timestamps();
            $t->unique(['inquiry_id', 'input_hash']); $t->index(['state', 'updated_at']);
        });
        Schema::create('jn_presales_events', function (Blueprint $t) {
            $t->id(); $t->foreignId('inquiry_id')->constrained('jn_inquiries')->restrictOnDelete();
            $t->foreignId('actor_id')->nullable()->constrained('users')->restrictOnDelete();
            $t->string('label', 160); $t->json('detail'); $t->timestamp('created_at');
            $t->index(['inquiry_id', 'id']);
        });
        Schema::create('jn_presales_receipts', function (Blueprint $t) {
            $t->id(); $t->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $t->uuid('request_key'); $t->char('fingerprint', 64); $t->json('response'); $t->timestamp('created_at');
            $t->unique(['user_id', 'request_key']);
        });
    }

    public function down(): void
    {
        foreach (['jn_presales_receipts', 'jn_presales_events', 'jn_ai_runs', 'jn_file_versions', 'jn_documents', 'jn_inquiry_members', 'jn_inquiries'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
