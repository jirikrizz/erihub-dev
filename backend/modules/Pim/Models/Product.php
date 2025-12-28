<?php

namespace Modules\Pim\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;
use Modules\Pim\Models\ProductVariant;
use Modules\Pim\Models\ProductShopOverlay;
use Modules\Pim\Models\ProductRemoteRef;
use Modules\Shoptet\Models\Shop;

class Product extends Model
{
    use HasFactory;

    protected $fillable = [
        'id',
        'shop_id',
        'external_guid',
        'sku',
        'status',
        'base_locale',
        'base_payload',
    ];

    protected $casts = [
        'base_payload' => 'array',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (Product $product) {
            if (! $product->id) {
                $product->id = (string) Str::uuid();
            }
        });
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function translations(): HasMany
    {
        return $this->hasMany(ProductTranslation::class);
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class);
    }

    public function overlays(): HasMany
    {
        return $this->hasMany(ProductShopOverlay::class);
    }

    public function remoteRefs(): HasMany
    {
        return $this->hasMany(ProductRemoteRef::class);
    }
}
