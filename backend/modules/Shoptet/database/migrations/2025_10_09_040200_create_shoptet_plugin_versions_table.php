<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('shoptet_plugin_versions', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('plugin_id');
            $table->unsignedInteger('version');
            $table->string('filename');
            $table->text('summary')->nullable();
            $table->text('description')->nullable();
            $table->longText('code');
            $table->json('installation_steps')->nullable();
            $table->json('testing_checklist')->nullable();
            $table->json('dependencies')->nullable();
            $table->json('warnings')->nullable();
            $table->timestamps();

            $table->foreign('plugin_id')->references('id')->on('shoptet_plugins')->cascadeOnDelete();
            $table->unique(['plugin_id', 'version']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shoptet_plugin_versions');
    }
};
