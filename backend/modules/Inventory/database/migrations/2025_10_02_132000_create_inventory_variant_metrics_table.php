<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('inventory_variant_metrics', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('product_variant_id');
            $table->unsignedBigInteger('shop_id');
            $table->unsignedBigInteger('lifetime_orders_count')->default(0);
            $table->decimal('lifetime_quantity', 16, 3)->default(0);
            $table->decimal('lifetime_revenue', 16, 2)->default(0);
            $table->unsignedBigInteger('last_30_orders_count')->default(0);
            $table->decimal('last_30_quantity', 16, 3)->default(0);
            $table->decimal('last_30_revenue', 16, 2)->default(0);
            $table->unsignedBigInteger('last_90_orders_count')->default(0);
            $table->decimal('last_90_quantity', 16, 3)->default(0);
            $table->decimal('last_90_revenue', 16, 2)->default(0);
            $table->decimal('average_daily_sales', 16, 3)->nullable();
            $table->decimal('stock_runway_days', 16, 3)->nullable();
            $table->timestamp('last_sale_at')->nullable();
            $table->timestamps();

            $table->unique(['product_variant_id', 'shop_id']);
            $table->foreign('product_variant_id')->references('id')->on('product_variants')->cascadeOnDelete();
            $table->foreign('shop_id')->references('id')->on('shops')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_variant_metrics');
    }
};
