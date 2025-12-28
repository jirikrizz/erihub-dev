<?php

namespace Modules\Pim\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;
use Modules\Shoptet\Models\Shop;

class ProductVariantTranslation extends Model
{
    use HasFactory;

    protected $table = 'product_variant_translations';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'product_variant_id',
        'shop_id',
        'locale',
        'status',
        'name',
        'parameters',
        'data',
    ];

    protected $casts = [
        'parameters' => 'array',
        'data' => 'array',
    ];

    protected static function booted(): void
    {
        static::creating(function (ProductVariantTranslation $translation) {
            if (! $translation->id) {
                $translation->id = (string) Str::uuid();
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
