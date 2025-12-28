<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shop_category_nodes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->unsignedBigInteger('shop_id');
            $table->uuid('parent_id')->nullable();
            $table->string('remote_guid');
            $table->string('remote_id')->nullable();
            $table->string('parent_guid')->nullable();
            $table->string('name');
            $table->string('slug')->nullable();
            $table->unsignedInteger('position')->default(0);
            $table->string('path')->nullable();
            $table->json('data')->nullable();
            $table->timestamps();

            $table->foreign('shop_id')->references('id')->on('shops')->cascadeOnDelete();

            $table->unique(['shop_id', 'remote_guid']);
            $table->index(['shop_id', 'parent_id']);
            $table->index(['shop_id', 'parent_guid']);
            $table->index('path');
        });

        Schema::table('shop_category_nodes', function (Blueprint $table) {
            $table->foreign('parent_id')
                ->references('id')
                ->on('shop_category_nodes')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shop_category_nodes');
    }
};
