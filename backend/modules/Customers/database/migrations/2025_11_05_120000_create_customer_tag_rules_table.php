<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('customer_tag_rules', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('tag_key', 64);
            $table->string('label', 255);
            $table->string('color', 32)->default('gray');
            $table->boolean('is_active')->default(true);
            $table->integer('priority')->default(0);
            $table->string('match_type', 12)->default('all');
            $table->json('conditions')->nullable();
            $table->boolean('set_vip')->default(false);
            $table->text('description')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['is_active', 'priority']);
            $table->index('tag_key');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_tag_rules');
    }
};
