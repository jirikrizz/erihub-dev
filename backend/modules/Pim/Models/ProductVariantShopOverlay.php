<?php

namespace Modules\Pim\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;
use Modules\Shoptet\Models\Shop;

class ProductVariantShopOverlay extends Model
{
    use HasFactory;

    protected $table = 'product_variant_shop_overlays';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'product_variant_id',
        'shop_id',
        'price',
        'purchase_price',
        'vat_rate',
        'stock',
        'min_stock_supply',
        'currency_code',
        'unit',
        'data',
    ];

    protected $casts = [
        'price' => 'float',
        'purchase_price' => 'float',
        'vat_rate' => 'float',
        'stock' => 'float',
        'min_stock_supply' => 'float',
        'data' => 'array',
    ];

    protected static function booted(): void
    {
        static::creating(function (ProductVariantShopOverlay $overlay) {
            if (! $overlay->id) {
                $overlay->id = (string) Str::uuid();
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
