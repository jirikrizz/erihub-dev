<?php

namespace Modules\Pim\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;
use Modules\Shoptet\Models\Shop;

class ProductVariantRemoteRef extends Model
{
    use HasFactory;

    protected $table = 'product_variant_remote_refs';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'product_variant_id',
        'shop_id',
        'remote_guid',
        'remote_code',
    ];

    protected static function booted(): void
    {
        static::creating(function (ProductVariantRemoteRef $ref) {
            if (! $ref->id) {
                $ref->id = (string) Str::uuid();
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
