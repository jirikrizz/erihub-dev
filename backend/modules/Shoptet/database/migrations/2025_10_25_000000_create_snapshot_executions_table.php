<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('snapshot_executions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->unsignedBigInteger('shop_id');
            $table->string('endpoint', 120);
            $table->string('status', 32)->default('running');
            $table->timestamp('requested_at')->nullable();
            $table->timestamp('downloaded_at')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->foreign('shop_id')
                ->references('id')
                ->on('shops')
                ->cascadeOnDelete();

            $table->index(['shop_id', 'endpoint']);
            $table->index(['status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('snapshot_executions');
    }
};
