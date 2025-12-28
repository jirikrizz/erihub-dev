<?php

namespace Modules\Inventory\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;
use Modules\Pim\Models\ProductVariant;
use Modules\Shoptet\Models\Shop;

class InventoryStockGuardSnapshot extends Model
{
    use HasFactory;

    protected $table = 'inventory_stock_guard_snapshots';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'product_variant_id',
        'product_id',
        'variant_code',
        'shop_id',
        'shoptet_stock',
        'elogist_stock',
        'stock_difference',
        'synced_at',
    ];

    protected $casts = [
        'shoptet_stock' => 'float',
        'elogist_stock' => 'float',
        'stock_difference' => 'float',
        'synced_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $snapshot) {
            if (! $snapshot->id) {
                $snapshot->id = (string) Str::uuid();
            }
        });
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class, 'shop_id');
    }
}
