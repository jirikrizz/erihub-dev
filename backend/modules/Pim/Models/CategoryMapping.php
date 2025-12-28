<?php

namespace Modules\Pim\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;
use Modules\Shoptet\Models\Shop;

class CategoryMapping extends Model
{
    use HasFactory;

    protected $table = 'category_mappings';

    protected $fillable = [
        'id',
        'category_node_id',
        'shop_id',
        'shop_category_node_id',
        'status',
        'confidence',
        'source',
        'notes',
    ];

    protected $casts = [
        'confidence' => 'float',
    ];

    public $incrementing = false;

    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (CategoryMapping $mapping) {
            if (! $mapping->id) {
                $mapping->id = (string) Str::uuid();
            }
        });
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(CategoryNode::class, 'category_node_id');
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function shopCategory(): BelongsTo
    {
        return $this->belongsTo(ShopCategoryNode::class, 'shop_category_node_id');
    }
}
