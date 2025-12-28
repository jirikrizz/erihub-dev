<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->decimal('total_with_vat_base', 14, 2)->nullable()->after('total_with_vat');
            $table->decimal('total_without_vat_base', 14, 2)->nullable()->after('total_without_vat');
            $table->decimal('total_vat_base', 14, 2)->nullable()->after('total_vat');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn([
                'total_with_vat_base',
                'total_without_vat_base',
                'total_vat_base',
            ]);
        });
    }
};
