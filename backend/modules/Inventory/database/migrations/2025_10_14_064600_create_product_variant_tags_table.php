<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('product_variant_tags', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('name')->unique();
            $table->string('color', 16)->nullable();
            $table->timestamps();
        });

        Schema::create('product_variant_tag_assignments', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->uuid('product_variant_id');
            $table->unsignedBigInteger('tag_id');
            $table->timestamps();

            $table->foreign('product_variant_id')->references('id')->on('product_variants')->cascadeOnDelete();
            $table->foreign('tag_id')->references('id')->on('product_variant_tags')->cascadeOnDelete();
            $table->unique(['product_variant_id', 'tag_id'], 'variant_tag_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_variant_tag_assignments');
        Schema::dropIfExists('product_variant_tags');
    }
};
