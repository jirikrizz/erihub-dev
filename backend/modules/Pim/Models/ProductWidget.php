<?php

namespace Modules\Pim\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;
use Modules\Shoptet\Models\Shop;

class ProductWidget extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'slug',
        'status',
        'public_token',
        'shop_id',
        'locale',
        'settings',
        'html_markup',
    ];

    protected $casts = [
        'settings' => 'array',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (ProductWidget $widget): void {
            if (! $widget->id) {
                $widget->id = (string) Str::uuid();
            }

            if (! $widget->public_token) {
                $widget->public_token = (string) Str::uuid();
            }
        });
    }

    public function items(): HasMany
    {
        return $this->hasMany(ProductWidgetItem::class)->orderBy('position');
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function regenerateToken(): void
    {
        $this->public_token = (string) Str::uuid();
    }
}
