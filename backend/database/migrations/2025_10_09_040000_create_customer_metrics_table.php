<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_metrics', function (Blueprint $table) {
            $table->uuid('customer_guid')->primary();
            $table->unsignedBigInteger('orders_count')->default(0);
            $table->decimal('total_spent', 14, 2)->default(0);
            $table->decimal('total_spent_base', 14, 2)->default(0);
            $table->decimal('average_order_value', 14, 2)->default(0);
            $table->decimal('average_order_value_base', 14, 2)->default(0);
            $table->timestamp('first_order_at')->nullable();
            $table->timestamp('last_order_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_metrics');
    }
};
