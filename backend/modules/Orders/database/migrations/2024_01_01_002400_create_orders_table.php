<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->unsignedBigInteger('shop_id');
            $table->string('code')->unique();
            $table->uuid('guid')->unique();
            $table->string('status')->nullable();
            $table->string('source')->nullable();
            $table->string('customer_name')->nullable();
            $table->string('customer_email')->nullable();
            $table->string('customer_phone')->nullable();
            $table->timestamp('ordered_at')->nullable();
            $table->decimal('total_with_vat', 12, 2)->nullable();
            $table->decimal('total_without_vat', 12, 2)->nullable();
            $table->decimal('total_vat', 12, 2)->nullable();
            $table->string('currency_code', 3)->nullable();
            $table->json('price')->nullable();
            $table->json('billing_address')->nullable();
            $table->json('delivery_address')->nullable();
            $table->json('payment')->nullable();
            $table->json('shipping')->nullable();
            $table->json('data')->nullable();
            $table->timestamps();

            $table->foreign('shop_id')->references('id')->on('shops')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
