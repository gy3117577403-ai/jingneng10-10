<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('jn_inquiries', function (Blueprint $t) {
            $t->foreignId('company_id')->nullable()->constrained('companies')->restrictOnDelete();
        });
        Schema::create('jn_quote_sources', function (Blueprint $t) {
            $t->id();
            $t->foreignId('inquiry_id')->constrained('jn_inquiries')->restrictOnDelete();
            $t->foreignId('quote_id')->unique()->constrained('quotes')->restrictOnDelete();
            $t->unsignedInteger('revision');
            $t->json('snapshot');
            $t->foreignId('confirmed_by')->constrained('users')->restrictOnDelete();
            $t->timestamp('created_at');
            $t->unique(['inquiry_id', 'revision']);
        });
        Schema::table('jn_ai_runs', function (Blueprint $t) {
            $t->json('provider_snapshot')->nullable();
            $t->json('metrics')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('jn_ai_runs', fn (Blueprint $t) => $t->dropColumn(['provider_snapshot', 'metrics']));
        Schema::dropIfExists('jn_quote_sources');
        Schema::table('jn_inquiries', fn (Blueprint $t) => $t->dropConstrainedForeignId('company_id'));
    }
};
