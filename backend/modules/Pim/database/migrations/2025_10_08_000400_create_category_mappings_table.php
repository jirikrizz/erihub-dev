<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('category_mappings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('category_node_id');
            $table->unsignedBigInteger('shop_id');
            $table->uuid('shop_category_node_id');
            $table->string('status')->default('suggested');
            $table->decimal('confidence', 5, 2)->nullable();
            $table->string('source')->default('auto');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->foreign('category_node_id')->references('id')->on('category_nodes')->cascadeOnDelete();
            $table->foreign('shop_id')->references('id')->on('shops')->cascadeOnDelete();
            $table->foreign('shop_category_node_id')->references('id')->on('shop_category_nodes')->cascadeOnDelete();

            $table->unique(['shop_id', 'category_node_id']);
            $table->unique(['shop_id', 'shop_category_node_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('category_mappings');
    }
};
