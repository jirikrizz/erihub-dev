<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('product_variant_shop_overlays', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('product_variant_id');
            $table->unsignedBigInteger('shop_id');
            $table->decimal('price', 12, 2)->nullable();
            $table->decimal('purchase_price', 12, 2)->nullable();
            $table->decimal('vat_rate', 6, 2)->nullable();
            $table->decimal('stock', 12, 3)->nullable();
            $table->decimal('min_stock_supply', 12, 3)->nullable();
            $table->string('currency_code', 3)->nullable();
            $table->string('unit')->nullable();
            $table->json('data')->nullable();
            $table->timestamps();

            $table->unique(['product_variant_id', 'shop_id']);
            $table->foreign('product_variant_id')->references('id')->on('product_variants')->cascadeOnDelete();
            $table->foreign('shop_id')->references('id')->on('shops')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_variant_shop_overlays');
    }
};
