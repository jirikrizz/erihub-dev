<?php

namespace Modules\Shoptet\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ShoptetPlugin extends Model
{
    use HasFactory;

    protected $fillable = [
        'shop_id',
        'name',
    ];

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function versions(): HasMany
    {
        return $this->hasMany(ShoptetPluginVersion::class, 'plugin_id');
    }

    public function latestVersion(): HasOne
    {
        return $this->hasOne(ShoptetPluginVersion::class, 'plugin_id')->latestOfMany('version');
    }
}
