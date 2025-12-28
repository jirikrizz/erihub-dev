<?php

namespace Modules\Core\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;
use Modules\Core\Enums\JobScheduleFrequency;
use Modules\Shoptet\Models\Shop;

class JobSchedule extends Model
{
    use HasFactory;

    protected $table = 'job_schedules';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'name',
        'job_type',
        'shop_id',
        'options',
        'frequency',
        'cron_expression',
        'timezone',
        'enabled',
        'last_run_at',
        'last_run_ended_at',
        'last_run_status',
        'last_run_message',
    ];

    protected $casts = [
        'options' => 'array',
        'enabled' => 'boolean',
        'last_run_at' => 'datetime',
        'last_run_ended_at' => 'datetime',
        'frequency' => JobScheduleFrequency::class,
    ];

    protected static function booted(): void
    {
        static::creating(function (JobSchedule $schedule) {
            if (! $schedule->id) {
                $schedule->id = (string) Str::uuid();
            }
        });
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }
}
