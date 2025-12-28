<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('inventory_variant_forecasts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('product_variant_id');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('runway_days', 10, 2)->nullable();
            $table->string('confidence')->nullable();
            $table->text('summary');
            $table->json('recommendations')->nullable();
            $table->json('assumptions')->nullable();
            $table->json('top_markets')->nullable();
            $table->text('pricing_advice')->nullable();
            $table->text('restock_advice')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->foreign('product_variant_id')
                ->references('id')
                ->on('product_variants')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_variant_forecasts');
    }
};
