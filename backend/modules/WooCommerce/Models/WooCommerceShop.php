<?php

namespace Modules\WooCommerce\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Shoptet\Models\Shop;

class WooCommerceShop extends Model
{
    use HasFactory;

    protected $table = 'woocommerce_shops';

    protected $fillable = [
        'shop_id',
        'base_url',
        'api_version',
        'consumer_key',
        'consumer_secret',
        'last_synced_at',
    ];

    protected $casts = [
        'consumer_key' => 'encrypted',
        'consumer_secret' => 'encrypted',
        'last_synced_at' => 'datetime',
    ];

    protected $hidden = [
        'consumer_key',
        'consumer_secret',
    ];

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function getSanitizedBaseUrlAttribute(): string
    {
        $url = rtrim($this->base_url, '/');

        if (! str_contains($url, '://')) {
            $url = 'https://'.$url;
        }

        return $url;
    }
}
