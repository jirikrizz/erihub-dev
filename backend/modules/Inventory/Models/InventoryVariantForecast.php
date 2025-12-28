<?php

namespace Modules\Inventory\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;
use Modules\Pim\Models\ProductVariant;

class InventoryVariantForecast extends Model
{
    use HasFactory;

    protected $table = 'inventory_variant_forecasts';

    protected $fillable = [
        'product_variant_id',
        'user_id',
        'runway_days',
        'confidence',
        'summary',
        'recommendations',
        'assumptions',
        'top_markets',
        'pricing_advice',
        'restock_advice',
        'payload',
        'reorder_deadline_days',
        'recommended_order_quantity',
        'order_recommendation',
        'order_rationale',
        'seasonality_summary',
        'seasonality_best_period',
        'product_health',
        'product_health_reason',
    ];

    protected $casts = [
        'runway_days' => 'float',
        'recommendations' => 'array',
        'assumptions' => 'array',
        'top_markets' => 'array',
        'payload' => 'array',
        'reorder_deadline_days' => 'float',
        'recommended_order_quantity' => 'float',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (InventoryVariantForecast $forecast) {
            if (! $forecast->id) {
                $forecast->id = (string) Str::uuid();
            }
        });
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
