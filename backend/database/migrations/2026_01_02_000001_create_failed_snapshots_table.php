<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('failed_snapshots', function (Blueprint $table) {
            $table->id();
            $table->uuid('webhook_job_id');
            $table->foreign('webhook_job_id')->references('id')->on('shoptet_webhook_jobs')->cascadeOnDelete();
            $table->foreignId('shop_id')->constrained('shoptet_shops')->cascadeOnDelete();
            $table->string('endpoint')->nullable();
            $table->string('status')->default('pending'); // pending, retrying, resolved
            $table->integer('retry_count')->default(0);
            $table->integer('max_retries')->default(3);
            $table->text('error_message')->nullable();
            $table->json('context')->nullable(); // Store any additional context
            $table->timestamp('first_failed_at')->useCurrent();
            $table->timestamp('last_failed_at')->useCurrent();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->index(['shop_id', 'status']);
            $table->index(['status', 'created_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('failed_snapshots');
    }
};
