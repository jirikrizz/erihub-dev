<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('product_translations', function (Blueprint $table) {
            $table->unsignedBigInteger('shop_id')->nullable()->after('product_id');
        });

        Schema::table('product_translations', function (Blueprint $table) {
            $table->dropUnique('product_translations_product_id_locale_unique');
            $table->unique(['product_id', 'shop_id', 'locale'], 'product_translations_product_shop_locale_unique');
            $table->foreign('shop_id')->references('id')->on('shops')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('product_translations', function (Blueprint $table) {
            $table->dropForeign(['shop_id']);
            $table->dropUnique('product_translations_product_shop_locale_unique');
            $table->dropColumn('shop_id');
            $table->unique(['product_id', 'locale'], 'product_translations_product_id_locale_unique');
        });
    }
};
