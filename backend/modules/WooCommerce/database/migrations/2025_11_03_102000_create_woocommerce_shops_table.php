<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('woocommerce_shops', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('shop_id')->unique();
            $table->string('base_url');
            $table->string('api_version', 32)->default(config('woocommerce.api_version', 'wc/v3'));
            $table->text('consumer_key');
            $table->text('consumer_secret');
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->foreign('shop_id')
                ->references('id')
                ->on('shops')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('woocommerce_shops');
    }
};
