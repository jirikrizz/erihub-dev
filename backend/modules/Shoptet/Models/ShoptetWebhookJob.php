<?php

namespace Modules\Shoptet\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;
use Modules\Shoptet\Models\Shop;

class ShoptetWebhookJob extends Model
{
    use HasFactory;

    protected $table = 'shoptet_webhook_jobs';

    protected $fillable = [
        'id',
        'shop_id',
        'job_id',
        'event',
        'status',
        'endpoint',
        'payload',
        'meta',
        'snapshot_path',
        'result_url',
        'valid_until',
        'processed_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'meta' => 'array',
        'valid_until' => 'datetime',
        'processed_at' => 'datetime',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (ShoptetWebhookJob $job) {
            if (! $job->id) {
                $job->id = (string) Str::uuid();
            }
        });
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }
}
