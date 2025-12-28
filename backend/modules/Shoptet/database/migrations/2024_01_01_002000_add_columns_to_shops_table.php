<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('shops', function (Blueprint $table) {
            $table->string('api_mode')->default('premium');
            $table->string('webhook_token')->nullable();
            $table->string('webhook_secret')->nullable();

            $table->index('webhook_token');
        });
    }

    public function down(): void
    {
        Schema::table('shops', function (Blueprint $table) {
            $table->dropIndex(['webhook_token']);
            $table->dropColumn(['api_mode', 'webhook_token', 'webhook_secret']);
        });
    }
};
