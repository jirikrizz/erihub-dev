<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('microsite_products', function (Blueprint $table) {
            if (! Schema::hasColumn('microsite_products', 'overlay')) {
                $table->json('overlay')->nullable()->after('snapshot');
            }
        });
    }

    public function down(): void
    {
        Schema::table('microsite_products', function (Blueprint $table) {
            if (Schema::hasColumn('microsite_products', 'overlay')) {
                $table->dropColumn('overlay');
            }
        });
    }
};
