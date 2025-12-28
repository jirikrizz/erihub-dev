<?php

namespace Modules\Inventory\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;
use Modules\Pim\Models\ProductVariant;

class InventoryVariantRecommendation extends Model
{
    use HasFactory;

    protected $table = 'inventory_variant_recommendations';

    protected $fillable = [
        'id',
        'variant_id',
        'recommended_variant_id',
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
        static::creating(function (InventoryVariantRecommendation $record) {
            if (! $record->id) {
                $record->id = (string) Str::uuid();
            }
        });
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }

    public function recommendedVariant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'recommended_variant_id');
    }
}
