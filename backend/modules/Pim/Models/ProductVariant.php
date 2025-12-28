<?php

namespace Modules\Pim\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;
use Modules\Pim\Models\ProductVariantShopOverlay;
use Modules\Pim\Models\ProductVariantTranslation;
use Modules\Pim\Models\ProductVariantRemoteRef;
use Modules\Inventory\Models\ProductVariantNote;
use Modules\Inventory\Models\ProductVariantTag;
use Modules\Inventory\Models\InventoryVariantForecast;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class ProductVariant extends Model
{
    use HasFactory;

    protected $fillable = [
        'id',
        'product_id',
        'code',
        'ean',
        'sku',
        'name',
        'brand',
        'supplier',
        'stock',
        'unit',
        'price',
        'purchase_price',
        'vat_rate',
        'weight',
        'min_stock_supply',
        'currency_code',
        'data',
    ];

    protected $casts = [
        'stock' => 'float',
        'price' => 'float',
        'purchase_price' => 'float',
        'vat_rate' => 'float',
        'weight' => 'float',
        'min_stock_supply' => 'float',
        'data' => 'array',
    ];

    protected $appends = ['stock_status'];

    public $incrementing = false;
    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (ProductVariant $variant) {
            if (! $variant->id) {
                $variant->id = (string) Str::uuid();
            }
        });
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function overlays(): HasMany
    {
        return $this->hasMany(ProductVariantShopOverlay::class, 'product_variant_id');
    }

    public function translations(): HasMany
    {
        return $this->hasMany(ProductVariantTranslation::class, 'product_variant_id');
    }

    public function remoteRefs(): HasMany
    {
        return $this->hasMany(ProductVariantRemoteRef::class, 'product_variant_id');
    }

    public function notes(): HasMany
    {
        return $this->hasMany(ProductVariantNote::class, 'product_variant_id');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(ProductVariantTag::class, 'product_variant_tag_assignments', 'product_variant_id', 'tag_id')
            ->withTimestamps();
    }

    public function forecasts(): HasMany
    {
        return $this->hasMany(InventoryVariantForecast::class, 'product_variant_id');
    }

    public function latestForecast(): HasOne
    {
        return $this->hasOne(InventoryVariantForecast::class, 'product_variant_id')->latestOfMany('created_at');
    }

    public function getStockStatusAttribute(): string
    {
        $stock = $this->stock;

        if ($stock === null) {
            return 'unknown';
        }

        if ($stock <= 0) {
            return 'sold_out';
        }

        $minStockSupply = $this->min_stock_supply;

        if ($minStockSupply !== null && $stock < $minStockSupply) {
            return 'low_stock';
        }

        return 'in_stock';
    }
}
