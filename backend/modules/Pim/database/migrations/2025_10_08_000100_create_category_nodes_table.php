<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('category_nodes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->unsignedBigInteger('shop_id');
            $table->uuid('parent_id')->nullable();
            $table->string('guid')->unique();
            $table->string('parent_guid')->nullable();
            $table->string('name');
            $table->string('slug')->nullable();
            $table->unsignedInteger('position')->default(0);
            $table->json('data')->nullable();
            $table->timestamps();

            $table->foreign('shop_id')->references('id')->on('shops')->cascadeOnDelete();
            $table->index(['shop_id', 'parent_id']);
        });

        Schema::table('category_nodes', function (Blueprint $table) {
            $table->foreign('parent_id')
                ->references('id')
                ->on('category_nodes')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('category_nodes');
    }
};
