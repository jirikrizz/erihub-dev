<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('microsite_publications', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->uuid('microsite_id');
            $table->string('type'); // publish, export
            $table->string('status')->default('pending'); // pending, running, completed, failed
            $table->json('meta')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->foreign('microsite_id')
                ->references('id')
                ->on('microsites')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('microsite_publications');
    }
};
