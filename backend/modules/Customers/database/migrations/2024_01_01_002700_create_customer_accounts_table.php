<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('customer_accounts', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('customer_id');
            $table->uuid('account_guid')->nullable();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->boolean('main_account')->default(false);
            $table->boolean('authorized')->default(false);
            $table->boolean('email_verified')->default(false);
            $table->json('data')->nullable();
            $table->timestamps();

            $table->foreign('customer_id')->references('id')->on('customers')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_accounts');
    }
};
