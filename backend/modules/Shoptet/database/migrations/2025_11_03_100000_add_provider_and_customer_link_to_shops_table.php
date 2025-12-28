<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('shops', function (Blueprint $table) {
            if (! Schema::hasColumn('shops', 'provider')) {
                $table->string('provider', 32)->default('shoptet')->after('id');
                $table->index('provider');
            }

            if (! Schema::hasColumn('shops', 'customer_link_shop_id')) {
                $table->unsignedBigInteger('customer_link_shop_id')->nullable()->after('settings');
                $table->foreign('customer_link_shop_id')
                    ->references('id')
                    ->on('shops')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('shops', function (Blueprint $table) {
            if (Schema::hasColumn('shops', 'customer_link_shop_id')) {
                $table->dropForeign(['customer_link_shop_id']);
                $table->dropColumn('customer_link_shop_id');
            }

            if (Schema::hasColumn('shops', 'provider')) {
                $table->dropIndex(['provider']);
                $table->dropColumn('provider');
            }
        });
    }
};
