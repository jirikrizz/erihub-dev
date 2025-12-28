<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_stock_guard_snapshots', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('product_variant_id')
                ->constrained('product_variants')
                ->cascadeOnDelete();
            $table->foreignUuid('product_id')
                ->nullable()
                ->constrained('products')
                ->nullOnDelete();
            $table->unsignedBigInteger('shop_id');
            $table->string('variant_code')->nullable();
            $table->decimal('shoptet_stock', 15, 4)->nullable();
            $table->decimal('elogist_stock', 15, 4)->nullable();
            $table->decimal('stock_difference', 15, 4)->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();

            $table->foreign('shop_id')->references('id')->on('shops')->cascadeOnDelete();
            $table->unique(['product_variant_id', 'shop_id'], 'inventory_stock_guard_unique_variant_shop');
            $table->index('shop_id');
            $table->index('variant_code');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_stock_guard_snapshots');
    }
};
