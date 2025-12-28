<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shop_attribute_mappings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('master_shop_id');
            $table->unsignedBigInteger('target_shop_id');
            $table->string('type', 50);
            $table->string('master_key');
            $table->string('master_label')->nullable();
            $table->string('target_key')->nullable();
            $table->string('target_label')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->foreign('master_shop_id')->references('id')->on('shops')->onDelete('cascade');
            $table->foreign('target_shop_id')->references('id')->on('shops')->onDelete('cascade');
            $table->unique(['master_shop_id', 'target_shop_id', 'type', 'master_key'], 'shop_attribute_mappings_master_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shop_attribute_mappings');
    }
};

