<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('product_remote_refs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('product_id');
            $table->unsignedBigInteger('shop_id');
            $table->uuid('remote_guid')->nullable();
            $table->string('remote_external_id')->nullable();
            $table->timestamps();

            $table->unique(['product_id', 'shop_id']);
            $table->unique(['shop_id', 'remote_guid']);
            $table->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $table->foreign('shop_id')->references('id')->on('shops')->cascadeOnDelete();
        });

        Schema::create('product_variant_remote_refs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('product_variant_id');
            $table->unsignedBigInteger('shop_id');
            $table->uuid('remote_guid')->nullable();
            $table->string('remote_code')->nullable();
            $table->timestamps();

            $table->unique(['product_variant_id', 'shop_id']);
            $table->unique(['shop_id', 'remote_guid']);
            $table->unique(['shop_id', 'remote_code']);
            $table->foreign('product_variant_id')->references('id')->on('product_variants')->cascadeOnDelete();
            $table->foreign('shop_id')->references('id')->on('shops')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_variant_remote_refs');
        Schema::dropIfExists('product_remote_refs');
    }
};
