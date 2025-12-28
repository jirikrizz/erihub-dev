<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('job_schedules', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('job_type');
            $table->unsignedBigInteger('shop_id')->nullable();
            $table->json('options')->nullable();
            $table->string('frequency')->default('custom');
            $table->string('cron_expression');
            $table->string('timezone')->default(config('app.timezone', 'UTC'));
            $table->boolean('enabled')->default(true);
            $table->timestamp('last_run_at')->nullable();
            $table->timestamp('last_run_ended_at')->nullable();
            $table->string('last_run_status')->nullable();
            $table->text('last_run_message')->nullable();
            $table->timestamps();

            $table->foreign('shop_id')->references('id')->on('shops')->cascadeOnDelete();
            $table->index(['job_type', 'enabled']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('job_schedules');
    }
};
