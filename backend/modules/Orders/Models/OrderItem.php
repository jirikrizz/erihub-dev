<?php

namespace Modules\Orders\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class OrderItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'id',
        'order_id',
        'product_guid',
        'item_type',
        'name',
        'variant_name',
        'code',
        'ean',
        'amount',
        'amount_unit',
        'price_with_vat',
        'price_without_vat',
        'vat',
        'vat_rate',
        'data',
    ];

    protected $casts = [
        'amount' => 'float',
        'price_with_vat' => 'float',
        'price_without_vat' => 'float',
        'vat' => 'float',
        'vat_rate' => 'float',
        'data' => 'array',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (OrderItem $item) {
            if (! $item->id) {
                $item->id = (string) Str::uuid();
            }
        });
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
