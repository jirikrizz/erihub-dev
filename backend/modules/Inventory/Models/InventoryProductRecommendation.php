<?php

namespace Modules\Inventory\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;
use Modules\Pim\Models\Product;
use Modules\Pim\Models\ProductVariant;

class InventoryProductRecommendation extends Model
{
    use HasFactory;

    public const TYPE_RELATED = 'related';
    public const TYPE_RECOMMENDED = 'recommended';

    protected $table = 'inventory_product_recommendations';

    protected $fillable = [
        'id',
        'product_id',
        'recommended_product_id',
        'recommended_variant_id',
        'type',
        'position',
        'score',
        'matches',
    ];

    protected $casts = [
        'score' => 'float',
        'matches' => 'array',
    ];

    public $incrementing = false;

    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (InventoryProductRecommendation $record) {
            if (! $record->id) {
                $record->id = (string) Str::uuid();
            }
        });
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function recommendedProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'recommended_product_id');
    }

    public function recommendedVariant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'recommended_variant_id');
    }
}
