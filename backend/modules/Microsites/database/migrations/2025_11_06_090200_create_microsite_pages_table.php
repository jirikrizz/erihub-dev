<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('microsite_pages', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('microsite_id');
            $table->string('path');
            $table->string('title');
            $table->text('body_md')->nullable();
            $table->json('layout')->nullable();
            $table->boolean('published')->default(true);
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->unique(['microsite_id', 'path']);
            $table->foreign('microsite_id')
                ->references('id')
                ->on('microsites')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('microsite_pages');
    }
};
