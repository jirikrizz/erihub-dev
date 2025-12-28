<?php

namespace Modules\Core\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;
use Modules\Shoptet\Models\Shop;

class ExportFeedLink extends Model
{
    use HasFactory;

    protected $table = 'export_feed_links';

    protected $fillable = [
        'name',
        'type',
        'shop_id',
        'fields',
        'format',
        'cache_ttl',
        'range_mode',
        'date_from',
        'date_to',
        'relative_interval',
        'token',
        'last_used_at',
    ];

    protected $casts = [
        'fields' => 'array',
        'date_from' => 'datetime',
        'date_to' => 'datetime',
        'last_used_at' => 'datetime',
        'shop_id' => 'int',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (ExportFeedLink $link): void {
            if (! $link->id) {
                $link->id = (string) Str::uuid();
            }

            if (! $link->token) {
                $link->token = Str::uuid()->toString();
            }
        });
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }
}
