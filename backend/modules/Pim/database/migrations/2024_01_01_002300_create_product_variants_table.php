<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('product_variants', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('product_id');
            $table->string('code')->index();
            $table->string('ean')->nullable();
            $table->string('sku')->nullable();
            $table->decimal('stock', 12, 3)->nullable();
            $table->string('unit')->nullable();
            $table->decimal('price', 12, 2)->nullable();
            $table->decimal('purchase_price', 12, 2)->nullable();
            $table->decimal('vat_rate', 6, 2)->nullable();
            $table->decimal('weight', 10, 3)->nullable();
            $table->decimal('min_stock_supply', 12, 3)->nullable();
            $table->string('currency_code', 3)->nullable();
            $table->json('data')->nullable();
            $table->timestamps();

            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_variants');
    }
};
