<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_purchase_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_order_id')
                ->constrained('inventory_purchase_orders')
                ->cascadeOnDelete();
            $table->foreignUuid('product_variant_id')
                ->nullable()
                ->constrained('product_variants')
                ->nullOnDelete();
            $table->string('variant_code');
            $table->decimal('quantity', 12, 2)->default(0);
            $table->timestamps();

            $table->unique(['purchase_order_id', 'variant_code']);
            $table->index('product_variant_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_purchase_order_items');
    }
};
