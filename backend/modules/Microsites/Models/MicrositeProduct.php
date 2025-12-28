<?php

namespace Modules\Microsites\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Pim\Models\ProductVariant;

class MicrositeProduct extends Model
{
    use HasFactory;

    protected $fillable = [
        'microsite_id',
        'product_variant_id',
        'product_code',
        'name',
        'slug',
        'position',
        'custom_price',
        'custom_currency',
        'custom_label',
        'custom_description',
        'description_md',
        'image_url',
        'price_cents',
        'price_currency',
        'cta_text',
        'cta_url',
        'visible',
        'active',
        'tags',
        'metadata',
        'snapshot',
        'overlay',
    ];

    protected $casts = [
        'visible' => 'boolean',
        'active' => 'boolean',
        'snapshot' => 'array',
        'tags' => 'array',
        'metadata' => 'array',
        'overlay' => 'array',
    ];

    public function microsite(): BelongsTo
    {
        return $this->belongsTo(Microsite::class);
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }
}
