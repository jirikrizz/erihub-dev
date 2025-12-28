<?php

namespace Modules\Core\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class NotificationDelivery extends Model
{
    use HasFactory;

    protected $table = 'notification_deliveries';

    protected $fillable = [
        'notification_id',
        'event_id',
        'channel',
        'payload',
        'delivered_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'delivered_at' => 'datetime',
    ];

    public static function hasDelivered(string $channel, string $notificationId): bool
    {
        return static::query()
            ->where('channel', $channel)
            ->where('notification_id', $notificationId)
            ->exists();
    }
}
