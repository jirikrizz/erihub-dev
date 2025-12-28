<?php

namespace Modules\Inventory\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Modules\Pim\Models\ProductVariant;

class ProductVariantTag extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'color',
        'is_hidden',
    ];

    protected $casts = [
        'is_hidden' => 'boolean',
    ];

    public function variants(): BelongsToMany
    {
        return $this->belongsToMany(ProductVariant::class, 'product_variant_tag_assignments', 'tag_id', 'product_variant_id')
            ->withTimestamps();
    }
}
