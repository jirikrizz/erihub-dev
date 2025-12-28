<?php

namespace Modules\Shoptet\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class SnapshotExecution extends Model
{
    use HasFactory;

    protected $table = 'snapshot_executions';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'shop_id',
        'endpoint',
        'status',
        'requested_at',
        'downloaded_at',
        'processed_at',
        'started_at',
        'finished_at',
        'meta',
    ];

    protected $casts = [
        'requested_at' => 'datetime',
        'downloaded_at' => 'datetime',
        'processed_at' => 'datetime',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
        'meta' => 'array',
    ];

    protected static function booted(): void
    {
        static::creating(function (SnapshotExecution $execution) {
            if (! $execution->id) {
                $execution->id = (string) Str::uuid();
            }
        });
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }
}
