<?php

namespace Modules\Pim\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class ProductWidgetEvent extends Model
{
    use HasFactory;

    protected $table = 'product_widget_events';

    protected $fillable = [
        'id',
        'product_widget_id',
        'product_widget_item_id',
        'product_id',
        'product_variant_id',
        'shop_id',
        'locale',
        'event_type',
        'widget_public_token',
        'ip_address',
        'user_agent',
        'referer',
        'meta',
    ];

    protected $casts = [
        'meta' => 'array',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (ProductWidgetEvent $event): void {
            if (! $event->id) {
                $event->id = (string) Str::uuid();
            }
        });
    }
}
