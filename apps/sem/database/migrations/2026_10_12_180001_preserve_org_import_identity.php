<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};

return new class extends Migration {
    public function up(): void
    {
        foreach (['jn_org_units', 'jn_org_people'] as $table) {
            Schema::table($table, function (Blueprint $t) { $t->string('source_key', 80)->nullable()->unique(); });
            // Existing intake used code as its external key. Preserve that identity
            // before administrators start editing their employee numbers.
            DB::table($table)->update(['source_key' => DB::raw('code')]);
        }
    }

    public function down(): void
    {
        foreach (['jn_org_units', 'jn_org_people'] as $table) {
            Schema::table($table, function (Blueprint $t) { $t->dropUnique(['source_key']); $t->dropColumn('source_key'); });
        }
    }
};
