<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('product_widget_events', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('product_widget_id')->nullable();
            $table->uuid('product_widget_item_id')->nullable();
            $table->uuid('product_id')->nullable();
            $table->uuid('product_variant_id')->nullable();
            $table->unsignedBigInteger('shop_id')->nullable();
            $table->string('locale', 12)->nullable();
            $table->string('event_type', 32); // impression | click
            $table->uuid('widget_public_token');
            $table->string('ip_address', 64)->nullable();
            $table->text('user_agent')->nullable();
            $table->text('referer')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['widget_public_token', 'event_type']);
            $table->index(['product_widget_id', 'event_type']);
            $table->index(['product_widget_item_id', 'event_type']);
            $table->index(['product_id', 'product_variant_id']);
            $table->index(['shop_id', 'locale']);
        });

        Schema::create('product_widget_stats_daily', function (Blueprint $table) {
            $table->id();
            $table->date('stat_date');
            $table->uuid('product_widget_id')->nullable();
            $table->uuid('product_widget_item_id')->nullable();
            $table->unsignedBigInteger('shop_id')->nullable();
            $table->string('locale', 12)->nullable();
            $table->string('event_type', 32); // impression | click
            $table->unsignedBigInteger('count')->default(0);
            $table->timestamps();

            $table->unique(['stat_date', 'product_widget_id', 'product_widget_item_id', 'shop_id', 'locale', 'event_type'], 'product_widget_stats_daily_unique');
            $table->index(['product_widget_id', 'product_widget_item_id']);
            $table->index(['shop_id', 'locale']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_widget_stats_daily');
        Schema::dropIfExists('product_widget_events');
    }
};
