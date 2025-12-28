<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('shop_sync_cursors', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->unsignedBigInteger('shop_id');
            $table->string('key', 80);
            $table->string('cursor')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->foreign('shop_id')
                ->references('id')
                ->on('shops')
                ->cascadeOnDelete();

            $table->unique(['shop_id', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shop_sync_cursors');
    }
};
