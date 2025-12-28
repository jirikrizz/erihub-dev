<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('microsites', function (Blueprint $table) {
            if (! Schema::hasColumn('microsites', 'locale')) {
                $table->string('locale', 12)->nullable()->after('slug');
            }

            if (! Schema::hasColumn('microsites', 'currency')) {
                $table->string('currency', 12)->nullable()->after('locale');
            }

            if (! Schema::hasColumn('microsites', 'brand')) {
                $table->json('brand')->nullable()->after('currency');
            }

            if (! Schema::hasColumn('microsites', 'primary_domain')) {
                $table->string('primary_domain')->nullable()->after('brand');
            }

            if (! Schema::hasColumn('microsites', 'domains')) {
                $table->json('domains')->nullable()->after('primary_domain');
            }
        });
    }

    public function down(): void
    {
        Schema::table('microsites', function (Blueprint $table) {
            if (Schema::hasColumn('microsites', 'domains')) {
                $table->dropColumn('domains');
            }

            if (Schema::hasColumn('microsites', 'primary_domain')) {
                $table->dropColumn('primary_domain');
            }

            if (Schema::hasColumn('microsites', 'brand')) {
                $table->dropColumn('brand');
            }

            if (Schema::hasColumn('microsites', 'currency')) {
                $table->dropColumn('currency');
            }

            if (Schema::hasColumn('microsites', 'locale')) {
                $table->dropColumn('locale');
            }
        });
    }
};
