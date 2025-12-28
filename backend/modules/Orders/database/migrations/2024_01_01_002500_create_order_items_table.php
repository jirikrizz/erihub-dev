<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('order_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('order_id');
            $table->uuid('product_guid')->nullable();
            $table->string('item_type')->nullable();
            $table->string('name');
            $table->string('variant_name')->nullable();
            $table->string('code')->nullable();
            $table->string('ean')->nullable();
            $table->decimal('amount', 12, 3)->nullable();
            $table->string('amount_unit')->nullable();
            $table->decimal('price_with_vat', 12, 2)->nullable();
            $table->decimal('price_without_vat', 12, 2)->nullable();
            $table->decimal('vat', 12, 2)->nullable();
            $table->decimal('vat_rate', 6, 2)->nullable();
            $table->json('data')->nullable();
            $table->timestamps();

            $table->foreign('order_id')->references('id')->on('orders')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_items');
    }
};
