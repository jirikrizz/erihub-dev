<?php

namespace Modules\Pim\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;
use Modules\Shoptet\Models\Shop;

class CategoryNode extends Model
{
    use HasFactory;

    protected $fillable = [
        'id',
        'shop_id',
        'parent_id',
        'guid',
        'parent_guid',
        'name',
        'slug',
        'position',
        'data',
    ];

    protected $casts = [
        'data' => 'array',
    ];

    public $incrementing = false;

    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (CategoryNode $node) {
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

    public function localizations(): HasMany
    {
        return $this->hasMany(CategoryLocalization::class);
    }

    public function mappings(): HasMany
    {
        return $this->hasMany(CategoryMapping::class, 'category_node_id');
    }
}
