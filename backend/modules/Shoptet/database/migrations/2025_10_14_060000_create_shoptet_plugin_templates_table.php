<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('shoptet_plugin_templates', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('name');
            $table->string('plugin_type', 32)->default('banner');
            $table->string('language', 32)->nullable();
            $table->string('description')->nullable();
            $table->text('goal');
            $table->string('shoptet_surface')->nullable();
            $table->text('data_sources')->nullable();
            $table->text('additional_notes')->nullable();
            $table->string('brand_primary_color', 32)->nullable();
            $table->string('brand_secondary_color', 32)->nullable();
            $table->string('brand_font_family', 120)->nullable();
            $table->json('metadata')->nullable();
            $table->boolean('is_system')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shoptet_plugin_templates');
    }
};
