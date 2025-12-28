<?php

namespace Modules\Inventory\Support;

class InventoryNotificationSettings
{
    public const SETTINGS_KEY = 'inventory_notification_settings';

    public static function defaults(): array
    {
        return [
            'low_stock_threshold' => 5,
            'watch_variant_ids' => [],
        ];
    }

    public static function sanitize(?array $value): array
    {
        $defaults = self::defaults();

        if (! is_array($value)) {
            return $defaults;
        }

        $threshold = $value['low_stock_threshold'] ?? $defaults['low_stock_threshold'];
        $threshold = is_numeric($threshold) ? (int) $threshold : $defaults['low_stock_threshold'];
        if ($threshold < 0) {
            $threshold = 0;
        }
        if ($threshold > 100000) {
            $threshold = 100000;
        }

        $watchIds = $value['watch_variant_ids'] ?? $defaults['watch_variant_ids'];
        if (! is_array($watchIds)) {
            $watchIds = [];
        }

        $normalizedIds = [];
        foreach ($watchIds as $id) {
            if (! is_string($id)) {
                continue;
            }

            $trimmed = trim($id);

            if ($trimmed === '') {
                continue;
            }

            $normalizedIds[] = $trimmed;
        }

        $normalizedIds = array_values(array_unique($normalizedIds));

        return [
            'low_stock_threshold' => $threshold,
            'watch_variant_ids' => $normalizedIds,
        ];
    }
}

