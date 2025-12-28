<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('translation_tasks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('product_translation_id');
            $table->unsignedBigInteger('assigned_to')->nullable();
            $table->timestamp('due_at')->nullable();
            $table->string('status')->default('open');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->foreign('product_translation_id')
                ->references('id')
                ->on('product_translations')
                ->cascadeOnDelete();
            $table->foreign('assigned_to')
                ->references('id')
                ->on('users')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('translation_tasks');
    }
};
