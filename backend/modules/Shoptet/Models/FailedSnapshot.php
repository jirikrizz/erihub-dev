<?php

namespace Modules\Shoptet\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FailedSnapshot extends Model
{
    protected $fillable = [
        'webhook_job_id',
        'shop_id',
        'endpoint',
        'status',
        'retry_count',
        'max_retries',
        'error_message',
        'context',
        'first_failed_at',
        'last_failed_at',
        'resolved_at',
    ];

    protected $casts = [
        'context' => 'json',
        'first_failed_at' => 'datetime',
        'last_failed_at' => 'datetime',
        'resolved_at' => 'datetime',
    ];

    public function webhookJob(): BelongsTo
    {
        return $this->belongsTo(ShoptetWebhookJob::class);
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    public function canRetry(): bool
    {
        return $this->retry_count < $this->max_retries && $this->status === 'pending';
    }

    public function markAsRetrying(): void
    {
        $this->update([
            'status' => 'retrying',
            'retry_count' => $this->retry_count + 1,
            'last_failed_at' => now(),
        ]);
    }

    public function markAsResolved(): void
    {
        $this->update([
            'status' => 'resolved',
            'resolved_at' => now(),
        ]);
    }

    public function markAsFailed(string $errorMessage): void
    {
        $this->update([
            'status' => 'pending',
            'error_message' => $errorMessage,
            'last_failed_at' => now(),
        ]);
    }
}
