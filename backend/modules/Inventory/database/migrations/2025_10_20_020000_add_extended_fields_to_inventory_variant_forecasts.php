<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('inventory_variant_forecasts', function (Blueprint $table) {
            $table->decimal('reorder_deadline_days', 10, 2)->nullable()->after('restock_advice');
            $table->decimal('recommended_order_quantity', 12, 2)->nullable()->after('reorder_deadline_days');
            $table->string('order_recommendation')->nullable()->after('recommended_order_quantity');
            $table->text('order_rationale')->nullable()->after('order_recommendation');
            $table->text('seasonality_summary')->nullable()->after('order_rationale');
            $table->string('seasonality_best_period')->nullable()->after('seasonality_summary');
            $table->string('product_health')->nullable()->after('seasonality_best_period');
            $table->text('product_health_reason')->nullable()->after('product_health');
        });
    }

    public function down(): void
    {
        Schema::table('inventory_variant_forecasts', function (Blueprint $table) {
            $table->dropColumn([
                'reorder_deadline_days',
                'recommended_order_quantity',
                'order_recommendation',
                'order_rationale',
                'seasonality_summary',
                'seasonality_best_period',
                'product_health',
                'product_health_reason',
            ]);
        });
    }
};
