<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (! Schema::hasColumn('customers', 'normalized_phone')) {
                $table->string('normalized_phone', 32)->nullable()->after('phone');
                $table->index('normalized_phone', 'customers_normalized_phone_index');
            }
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            if (Schema::hasColumn('customers', 'normalized_phone')) {
                $table->dropIndex('customers_normalized_phone_index');
                $table->dropColumn('normalized_phone');
            }
        });
    }
};
