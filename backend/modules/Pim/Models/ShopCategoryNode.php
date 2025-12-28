<?php

namespace Modules\Pim\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;
use Modules\Shoptet\Models\Shop;

class ShopCategoryNode extends Model
{
    use HasFactory;

    protected $table = 'shop_category_nodes';

    protected $fillable = [
        'id',
        'shop_id',
        'parent_id',
        'remote_guid',
        'remote_id',
        'parent_guid',
        'name',
        'slug',
        'position',
        'path',
        'data',
        'visible',
        'customer_visibility',
        'product_ordering',
        'url',
        'index_name',
        'image',
        'menu_title',
        'title',
        'meta_description',
        'description',
        'second_description',
        'similar_category_guid',
        'related_category_guid',
    ];

    protected $casts = [
        'position' => 'integer',
        'data' => 'array',
        'visible' => 'boolean',
    ];

    public $incrementing = false;

    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (ShopCategoryNode $node) {
            if (! $node->id) {
                $node->id = (string) Str::uuid();
            }
        });
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('position')->orderBy('name');
    }

    public function mappings(): HasMany
    {
        return $this->hasMany(CategoryMapping::class, 'shop_category_node_id');
    }
}
