<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_variant_recommendations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('variant_id');
            $table->uuid('recommended_variant_id');
            $table->unsignedInteger('position');
            $table->decimal('score', 10, 4)->nullable();
            $table->json('matches')->nullable();
            $table->timestamps();

            $table->foreign('variant_id')
                ->references('id')
                ->on('product_variants')
                ->cascadeOnDelete();

            $table->foreign('recommended_variant_id')
                ->references('id')
                ->on('product_variants')
                ->cascadeOnDelete();

            $table->unique(['variant_id', 'recommended_variant_id']);
            $table->index(['variant_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_variant_recommendations');
    }
};
