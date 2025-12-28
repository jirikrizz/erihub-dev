<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('product_variant_translations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('product_variant_id');
            $table->unsignedBigInteger('shop_id')->nullable();
            $table->string('locale')->index();
            $table->string('status')->default('draft');
            $table->string('name')->nullable();
            $table->json('parameters')->nullable();
            $table->json('data')->nullable();
            $table->timestamps();

            $table->unique(['product_variant_id', 'shop_id', 'locale']);
            $table->foreign('product_variant_id')->references('id')->on('product_variants')->cascadeOnDelete();
            $table->foreign('shop_id')->references('id')->on('shops')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_variant_translations');
    }
};
