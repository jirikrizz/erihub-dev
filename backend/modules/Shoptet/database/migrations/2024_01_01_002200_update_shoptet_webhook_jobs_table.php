<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('shoptet_webhook_jobs', function (Blueprint $table) {
            $table->string('endpoint')->nullable()->after('event');
            $table->string('result_url')->nullable()->after('snapshot_path');
            $table->timestamp('valid_until')->nullable()->after('result_url');
        });
    }

    public function down(): void
    {
        Schema::table('shoptet_webhook_jobs', function (Blueprint $table) {
            $table->dropColumn(['endpoint', 'result_url', 'valid_until']);
        });
    }
};
