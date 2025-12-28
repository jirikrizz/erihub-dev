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
        Schema::table('shoptet_plugin_versions', function (Blueprint $table) {
            $table->string('bundle_key', 64)->default('main')->after('filename');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('shoptet_plugin_versions', function (Blueprint $table) {
            $table->dropColumn('bundle_key');
        });
    }
};
