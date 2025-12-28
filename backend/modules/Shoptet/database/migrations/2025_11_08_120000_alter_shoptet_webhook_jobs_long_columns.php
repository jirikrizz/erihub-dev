<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('shoptet_webhook_jobs', function (Blueprint $table) {
            $table->text('endpoint')->nullable()->change();
            $table->text('result_url')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('shoptet_webhook_jobs', function (Blueprint $table) {
            $table->string('endpoint')->nullable()->change();
            $table->string('result_url')->nullable()->change();
        });
    }
};
