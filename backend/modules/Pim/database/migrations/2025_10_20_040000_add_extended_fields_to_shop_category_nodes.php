<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('shop_category_nodes', function (Blueprint $table) {
            $table->boolean('visible')->default(true);
            $table->string('customer_visibility')->nullable();
            $table->string('product_ordering')->nullable();
            $table->string('url')->nullable();
            $table->string('index_name')->nullable();
            $table->string('image')->nullable();
            $table->string('menu_title')->nullable();
            $table->string('title')->nullable();
            $table->text('meta_description')->nullable();
            $table->text('description')->nullable();
            $table->text('second_description')->nullable();
            $table->string('similar_category_guid')->nullable();
            $table->string('related_category_guid')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('shop_category_nodes', function (Blueprint $table) {
            $table->dropColumn([
                'visible',
                'customer_visibility',
                'product_ordering',
                'url',
                'index_name',
                'image',
                'menu_title',
                'title',
                'meta_description',
                'description',
                'second_description',
                'similar_category_guid',
                'related_category_guid',
            ]);
        });
    }
};
