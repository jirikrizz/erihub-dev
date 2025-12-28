<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_product_recommendations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('product_id');
            $table->uuid('recommended_product_id');
            $table->uuid('recommended_variant_id')->nullable();
            $table->string('type', 32);
            $table->unsignedInteger('position');
            $table->decimal('score', 12, 4)->nullable();
            $table->json('matches')->nullable();
            $table->timestamps();

            $table->foreign('product_id')
                ->references('id')
                ->on('products')
                ->cascadeOnDelete();

            $table->foreign('recommended_product_id')
                ->references('id')
                ->on('products')
                ->cascadeOnDelete();

            $table->foreign('recommended_variant_id')
                ->references('id')
                ->on('product_variants')
                ->nullOnDelete();

            $table->unique(['product_id', 'type', 'recommended_product_id']);
            $table->index(['product_id', 'type', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_product_recommendations');
    }
};
