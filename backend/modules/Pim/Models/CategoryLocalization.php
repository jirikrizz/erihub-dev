<?php

namespace Modules\Pim\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;
use Modules\Shoptet\Models\Shop;

class CategoryLocalization extends Model
{
    use HasFactory;

    protected $fillable = [
        'id',
        'category_node_id',
        'shop_id',
        'name',
        'slug',
        'remote_guid',
        'remote_id',
        'url',
        'meta_title',
        'meta_description',
        'data',
    ];

    protected $casts = [
        'data' => 'array',
    ];

    public $incrementing = false;

    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (CategoryLocalization $localization) {
            if (! $localization->id) {
                $localization->id = (string) Str::uuid();
            }
        });
    }

    public function node(): BelongsTo
    {
        return $this->belongsTo(CategoryNode::class, 'category_node_id');
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }
}
