<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->index(['shop_id', 'status', 'ordered_at'], 'orders_shop_status_ordered_at_idx');
            $table->index(['customer_email', 'ordered_at'], 'orders_customer_email_ordered_at_idx');
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->index(['order_id', 'amount'], 'order_items_order_id_amount_idx');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex('orders_shop_status_ordered_at_idx');
            $table->dropIndex('orders_customer_email_ordered_at_idx');
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->dropIndex('order_items_order_id_amount_idx');
        });
    }
};
