<?php

namespace Modules\Customers\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;
use Modules\Customers\Models\CustomerAccount;
use Modules\Customers\Models\CustomerNote;
use Modules\Customers\Models\CustomerMetric;
use Modules\Orders\Models\Order;
use Modules\Shoptet\Models\Shop;

class Customer extends Model
{
    use HasFactory;

    protected $fillable = [
        'id',
        'shop_id',
        'guid',
        'full_name',
        'email',
        'phone',
        'normalized_phone',
        'customer_group',
        'price_list',
        'created_at_remote',
        'updated_at_remote',
        'billing_address',
        'delivery_addresses',
        'data',
        'notes',
        'is_vip',
    ];

    protected $casts = [
        'created_at_remote' => 'datetime',
        'updated_at_remote' => 'datetime',
        'billing_address' => 'array',
        'delivery_addresses' => 'array',
        'data' => 'array',
        'notes' => 'string',
        'is_vip' => 'boolean',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (Customer $customer) {
            if (! $customer->id) {
                $customer->id = (string) Str::uuid();
            }
        });
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function accounts(): HasMany
    {
        return $this->hasMany(CustomerAccount::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class, 'customer_guid', 'guid');
    }

    public function internalNotes(): HasMany
    {
        return $this->hasMany(CustomerNote::class)->latest();
    }

    public function metrics(): HasOne
    {
        return $this->hasOne(CustomerMetric::class, 'customer_guid', 'guid');
    }
}
