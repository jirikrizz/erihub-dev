<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_purchase_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('original_filename');
            $table->string('storage_path');
            $table->date('ordered_at');
            $table->date('expected_arrival_at')->nullable();
            $table->unsignedInteger('arrival_days')->nullable();
            $table->unsignedInteger('items_count')->default(0);
            $table->unsignedInteger('variant_codes_count')->default(0);
            $table->decimal('total_quantity', 12, 2)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_purchase_orders');
    }
};
