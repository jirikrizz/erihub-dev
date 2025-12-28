<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('product_variants', function (Blueprint $table) {
            $table->string('name')->nullable()->after('sku');
            $table->string('brand')->nullable()->after('name');
            $table->string('supplier')->nullable()->after('brand');

            $table->index('name');
            $table->index('brand');
            $table->index('supplier');
        });
    }

    public function down(): void
    {
        Schema::table('product_variants', function (Blueprint $table) {
            $table->dropIndex('product_variants_name_index');
            $table->dropIndex('product_variants_brand_index');
            $table->dropIndex('product_variants_supplier_index');

            $table->dropColumn(['name', 'brand', 'supplier']);
        });
    }
};
