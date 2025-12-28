<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shop_attribute_value_mappings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('mapping_id');
            $table->string('master_value_key');
            $table->string('master_value_label')->nullable();
            $table->string('target_value_key')->nullable();
            $table->string('target_value_label')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->foreign('mapping_id')
                ->references('id')
                ->on('shop_attribute_mappings')
                ->onDelete('cascade');

            $table->unique(['mapping_id', 'master_value_key'], 'shop_attribute_value_mappings_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shop_attribute_value_mappings');
    }
};
