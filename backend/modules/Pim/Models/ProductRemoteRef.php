<?php

namespace Modules\Pim\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;
use Modules\Shoptet\Models\Shop;

class ProductRemoteRef extends Model
{
    use HasFactory;

    protected $table = 'product_remote_refs';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'product_id',
        'shop_id',
        'remote_guid',
        'remote_external_id',
    ];

    protected static function booted(): void
    {
        static::creating(function (ProductRemoteRef $ref) {
            if (! $ref->id) {
                $ref->id = (string) Str::uuid();
            }
        });
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }
}
