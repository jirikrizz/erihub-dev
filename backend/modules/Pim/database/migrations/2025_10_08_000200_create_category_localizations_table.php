<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('category_localizations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('category_node_id');
            $table->unsignedBigInteger('shop_id');
            $table->string('name');
            $table->string('slug')->nullable();
            $table->string('remote_guid')->nullable();
            $table->string('remote_id')->nullable();
            $table->string('url')->nullable();
            $table->string('meta_title')->nullable();
            $table->text('meta_description')->nullable();
            $table->json('data')->nullable();
            $table->timestamps();

            $table->foreign('category_node_id')->references('id')->on('category_nodes')->cascadeOnDelete();
            $table->foreign('shop_id')->references('id')->on('shops')->cascadeOnDelete();
            $table->unique(['category_node_id', 'shop_id']);
            $table->index('remote_guid');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('category_localizations');
    }
};
