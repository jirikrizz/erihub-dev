<?php

namespace Modules\Pim\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class ProductWidgetItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_widget_id',
        'product_id',
        'product_variant_id',
        'position',
        'payload',
    ];

    protected $casts = [
        'payload' => 'array',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (ProductWidgetItem $item): void {
            if (! $item->id) {
                $item->id = (string) Str::uuid();
            }
        });
    }

    public function widget(): BelongsTo
    {
        return $this->belongsTo(ProductWidget::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }
}
