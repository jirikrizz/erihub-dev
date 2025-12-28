<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('product_widgets', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('status')->default('draft');
            $table->uuid('public_token')->unique();
            $table->unsignedBigInteger('shop_id')->nullable();
            $table->string('locale', 12)->nullable();
            $table->json('settings')->nullable();
            $table->text('html_markup')->nullable();
            $table->timestamps();

            $table->foreign('shop_id')->references('id')->on('shops')->cascadeOnDelete();
        });

        Schema::create('product_widget_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('product_widget_id');
            $table->uuid('product_id')->nullable();
            $table->uuid('product_variant_id')->nullable();
            $table->unsignedInteger('position')->default(0);
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->foreign('product_widget_id')->references('id')->on('product_widgets')->cascadeOnDelete();
            $table->foreign('product_id')->references('id')->on('products')->nullOnDelete();
            $table->foreign('product_variant_id')->references('id')->on('product_variants')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_widget_items');
        Schema::dropIfExists('product_widgets');
    }
};
