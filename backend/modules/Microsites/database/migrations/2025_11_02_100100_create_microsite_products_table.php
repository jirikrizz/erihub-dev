<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('microsite_products', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->uuid('microsite_id');
            $table->uuid('product_variant_id')->nullable();
            $table->string('product_code')->nullable();
            $table->integer('position')->default(0);
            $table->decimal('custom_price', 12, 2)->nullable();
            $table->string('custom_currency', 8)->nullable();
            $table->string('custom_label')->nullable();
            $table->text('custom_description')->nullable();
            $table->string('cta_text')->nullable();
            $table->string('cta_url')->nullable();
            $table->boolean('visible')->default(true);
            $table->json('snapshot')->nullable();
            $table->timestamps();

            $table->foreign('microsite_id')
                ->references('id')
                ->on('microsites')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('microsite_products');
    }
};
