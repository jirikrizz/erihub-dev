<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->index(['shop_id', 'created_at_remote'], 'customers_shop_created_at_index');
            $table->index('email');
            $table->index('full_name');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropIndex('customers_full_name_index');
            $table->dropIndex('customers_email_index');
            $table->dropIndex('customers_shop_created_at_index');
        });
    }
};
