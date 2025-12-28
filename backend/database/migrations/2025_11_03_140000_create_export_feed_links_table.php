<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('export_feed_links', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('type');
            $table->json('fields');
            $table->string('format', 16);
            $table->unsignedInteger('cache_ttl');
            $table->string('range_mode', 16)->default('none');
            $table->timestampTz('date_from')->nullable();
            $table->timestampTz('date_to')->nullable();
            $table->unsignedInteger('relative_interval')->nullable();
            $table->string('token')->unique();
            $table->timestampTz('last_used_at')->nullable();
            $table->timestampsTz();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('export_feed_links');
    }
};
