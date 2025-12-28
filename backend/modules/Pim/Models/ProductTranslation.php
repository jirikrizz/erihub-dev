<?php

namespace Modules\Pim\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;
use Modules\Shoptet\Models\Shop;

class ProductTranslation extends Model
{
    use HasFactory;

    protected $fillable = [
        'id',
        'product_id',
        'shop_id',
        'locale',
        'status',
        'name',
        'short_description',
        'description',
        'parameters',
        'seo',
    ];

    protected $casts = [
        'parameters' => 'array',
        'seo' => 'array',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (ProductTranslation $translation) {
            if (! $translation->id) {
                $translation->id = (string) Str::uuid();
            }
        });
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(TranslationTask::class);
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }
}
