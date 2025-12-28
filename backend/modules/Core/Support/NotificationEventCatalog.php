<?php

namespace Modules\Core\Support;

class NotificationEventCatalog
{
    public const CHANNELS = ['ui', 'email', 'slack'];

    private const EVENTS = [
        'inventory.low-stock' => ['ui' => true],
        'inventory.out-of-stock' => ['ui' => true, 'slack' => true],
        'inventory.restock' => ['ui' => true],
        'inventory.slow-mover' => ['ui' => false],
        'orders.high-value' => ['ui' => true, 'slack' => true],
        'orders.status-changed' => ['ui' => false],
        'orders.import-failed' => ['ui' => true, 'slack' => true],
        'orders.volume-spike' => ['ui' => false],
        'customers.vip-created' => ['ui' => true],
        'customers.metrics-ready' => ['ui' => true],
        'customers.backfill-issue' => ['ui' => true],
        'pim.translation-assigned' => ['ui' => true],
        'pim.translation-approved' => ['ui' => false],
        'pim.push-failed' => ['ui' => true, 'slack' => true],
        'shoptet.snapshot-success' => ['ui' => true],
        'shoptet.snapshot-failed' => ['ui' => true, 'slack' => true],
        'shoptet.token-expiring' => ['ui' => true],
        'shoptet.master-product-added' => ['ui' => true],
        'analytics.digest-ready' => ['ui' => false],
        'system.job-failed' => ['ui' => true, 'slack' => true],
        'system.queue-stalled' => ['ui' => true, 'slack' => true],
        'system.release-deployed' => ['ui' => false],
    ];

    public static function eventIds(): array
    {
        return array_keys(self::EVENTS);
    }

    public static function isValidEvent(string $eventId): bool
    {
        return array_key_exists($eventId, self::EVENTS);
    }

    public static function isValidChannel(string $channel): bool
    {
        return in_array($channel, self::CHANNELS, true);
    }

    public static function defaultForChannel(string $eventId, string $channel): bool
    {
        if (! self::isValidEvent($eventId)) {
            return false;
        }

        $definition = self::EVENTS[$eventId];

        if (array_key_exists($channel, $definition)) {
            return (bool) $definition[$channel];
        }

        if ($channel === 'ui') {
            return (bool) ($definition['ui'] ?? false);
        }

        return false;
    }
}
