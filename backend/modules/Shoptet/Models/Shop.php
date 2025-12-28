<?php

namespace Modules\Shoptet\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\Schema;
use Modules\Shoptet\Models\ShoptetWebhookJob;

class Shop extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'provider',
        'domain',
        'default_locale',
        'timezone',
        'locale',
        'is_master',
        'settings',
        'api_mode',
        'currency_code',
        'customer_link_shop_id',
    ];

    protected $casts = [
        'settings' => 'array',
        'is_master' => 'boolean',
        'orders_total' => 'int',
    ];

    protected $hidden = [
        'webhook_secret',
        'webhook_token',
    ];

    protected $attributes = [
        'provider' => 'shoptet',
    ];

    protected static function booted(): void
    {
        static::creating(function (Shop $shop): void {
            if (! $shop->webhook_token) {
                $shop->webhook_token = bin2hex(random_bytes(16));
            }

            if (! $shop->provider) {
                $shop->provider = 'shoptet';
            }
        });
    }

    public function token(): HasOne
    {
        return $this->hasOne(ShopToken::class);
    }

    public function webhookJobs(): HasMany
    {
        return $this->hasMany(ShoptetWebhookJob::class);
    }

    public function woocommerce(): HasOne
    {
        return $this->hasOne(\Modules\WooCommerce\Models\WooCommerceShop::class, 'shop_id');
    }

    public function customerLinkTarget(): BelongsTo
    {
        return $this->belongsTo(self::class, 'customer_link_shop_id');
    }

    public static function hasProviderColumn(): bool
    {
        static $cached = null;

        if ($cached !== null) {
            return $cached;
        }

        $instance = new static();
        $table = $instance->getTable();
        $connection = $instance->getConnectionName();

        $cached = Schema::connection($connection)->hasColumn($table, 'provider');

        return $cached;
    }
}
