<?php

namespace Modules\Orders\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;
use Modules\Customers\Models\Customer;
use Modules\Shoptet\Models\Shop;

class Order extends Model
{
    use HasFactory;

    protected $fillable = [
        'id',
        'shop_id',
        'code',
        'guid',
        'customer_guid',
        'status',
        'source',
        'customer_name',
        'customer_email',
        'customer_phone',
        'ordered_at',
        'total_with_vat',
        'total_without_vat',
        'total_vat',
        'total_with_vat_base',
        'total_without_vat_base',
        'total_vat_base',
        'currency_code',
        'price',
        'billing_address',
        'delivery_address',
        'payment',
        'shipping',
        'data',
    ];

    protected $casts = [
        'ordered_at' => 'datetime',
        'total_with_vat' => 'float',
        'total_without_vat' => 'float',
        'total_vat' => 'float',
        'total_with_vat_base' => 'float',
        'total_without_vat_base' => 'float',
        'total_vat_base' => 'float',
        'price' => 'array',
        'billing_address' => 'array',
        'delivery_address' => 'array',
        'payment' => 'array',
        'shipping' => 'array',
        'data' => 'array',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    protected $appends = [
        'ordered_at_local',
    ];

    protected static function booted(): void
    {
        static::creating(function (Order $order) {
            if (! $order->id) {
                $order->id = (string) Str::uuid();
            }
        });
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_guid', 'guid');
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function getOrderedAtLocalAttribute(): ?string
    {
        if (! $this->ordered_at) {
            return null;
        }

        $timezone = $this->shop?->timezone ?? config('app.timezone', 'UTC');

        return $this->ordered_at->clone()->setTimezone($timezone)->toIso8601String();
    }
}
