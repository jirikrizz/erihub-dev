<?php

namespace Modules\Inventory\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;
use Modules\Pim\Models\ProductVariant;
use Modules\Shoptet\Models\Shop;

class InventoryVariantMetric extends Model
{
    use HasFactory;

    protected $fillable = [
        'id',
        'product_variant_id',
        'shop_id',
        'lifetime_orders_count',
        'lifetime_quantity',
        'lifetime_revenue',
        'last_30_orders_count',
        'last_30_quantity',
        'last_30_revenue',
        'last_90_orders_count',
        'last_90_quantity',
        'last_90_revenue',
        'average_daily_sales',
        'stock_runway_days',
        'last_sale_at',
    ];

    protected $casts = [
        'lifetime_quantity' => 'float',
        'lifetime_revenue' => 'float',
        'last_30_quantity' => 'float',
        'last_30_revenue' => 'float',
        'last_90_quantity' => 'float',
        'last_90_revenue' => 'float',
        'average_daily_sales' => 'float',
        'stock_runway_days' => 'float',
        'last_sale_at' => 'datetime',
    ];

    public $incrementing = false;

    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (InventoryVariantMetric $metric) {
            if (! $metric->id) {
                $metric->id = (string) Str::uuid();
            }
        });
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }
}
