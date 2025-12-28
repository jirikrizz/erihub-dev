<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->unsignedBigInteger('shop_id');
            $table->uuid('guid')->unique();
            $table->string('full_name')->nullable();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('customer_group')->nullable();
            $table->string('price_list')->nullable();
            $table->timestamp('created_at_remote')->nullable();
            $table->timestamp('updated_at_remote')->nullable();
            $table->json('billing_address')->nullable();
            $table->json('delivery_addresses')->nullable();
            $table->json('data')->nullable();
            $table->timestamps();

            $table->foreign('shop_id')->references('id')->on('shops')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};
