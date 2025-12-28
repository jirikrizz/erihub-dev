<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('microsite_products', function (Blueprint $table) {
            if (! Schema::hasColumn('microsite_products', 'name')) {
                $table->string('name')->nullable()->after('product_code');
            }

            if (! Schema::hasColumn('microsite_products', 'slug')) {
                $table->string('slug')->nullable()->after('name');
            }

            if (! Schema::hasColumn('microsite_products', 'description_md')) {
                $table->text('description_md')->nullable()->after('custom_description');
            }

            if (! Schema::hasColumn('microsite_products', 'image_url')) {
                $table->string('image_url')->nullable()->after('description_md');
            }

            if (! Schema::hasColumn('microsite_products', 'price_cents')) {
                $table->integer('price_cents')->nullable()->after('custom_price');
            }

            if (! Schema::hasColumn('microsite_products', 'price_currency')) {
                $table->string('price_currency', 12)->nullable()->after('price_cents');
            }

            if (! Schema::hasColumn('microsite_products', 'tags')) {
                $table->json('tags')->nullable()->after('price_currency');
            }

            if (! Schema::hasColumn('microsite_products', 'metadata')) {
                $table->json('metadata')->nullable()->after('tags');
            }

            if (! Schema::hasColumn('microsite_products', 'active')) {
                $table->boolean('active')->default(true)->after('visible');
            }
        });
    }

    public function down(): void
    {
        Schema::table('microsite_products', function (Blueprint $table) {
            $columns = [
                'active',
                'metadata',
                'tags',
                'price_currency',
                'price_cents',
                'image_url',
                'description_md',
                'slug',
                'name',
            ];

            foreach ($columns as $column) {
                if (Schema::hasColumn('microsite_products', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
