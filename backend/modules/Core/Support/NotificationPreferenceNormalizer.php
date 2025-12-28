<?php

namespace Modules\Core\Support;

use InvalidArgumentException;

class NotificationPreferenceNormalizer
{
    public static function normalize(mixed $value, bool $strict = true): ?array
    {
        if ($value === null) {
            return null;
        }

        if (! is_array($value)) {
            if ($strict) {
                throw new InvalidArgumentException('Hodnota musí být asociativní pole událostí.');
            }

            return null;
        }

        $result = [];

        foreach ($value as $eventId => $rawChannels) {
            if (! is_string($eventId)) {
                if ($strict) {
                    throw new InvalidArgumentException('Identifikátor události musí být text.');
                }

                continue;
            }

            if (! NotificationEventCatalog::isValidEvent($eventId)) {
                if ($strict) {
                    throw new InvalidArgumentException("Neznámá notifikační událost: {$eventId}");
                }

                continue;
            }

            if (is_bool($rawChannels)) {
                $rawChannels = ['ui' => $rawChannels];
            } elseif (! is_array($rawChannels)) {
                if ($strict) {
                    throw new InvalidArgumentException("Nesprávná struktura pro událost {$eventId}.");
                }

                continue;
            }

            $channels = [];

            foreach ($rawChannels as $channel => $enabled) {
                if (! is_string($channel)) {
                    if ($strict) {
                        throw new InvalidArgumentException("Neplatný název kanálu u události {$eventId}.");
                    }

                    continue;
                }

                if (! NotificationEventCatalog::isValidChannel($channel)) {
                    if ($strict) {
                        throw new InvalidArgumentException("Neznámý kanál '{$channel}' u události {$eventId}.");
                    }

                    continue;
                }

                if (! is_bool($enabled)) {
                    if ($strict) {
                        throw new InvalidArgumentException(
                            "Kanál '{$channel}' u události {$eventId} musí být boolean."
                        );
                    }

                    continue;
                }

                $channels[$channel] = $enabled;
            }

            if ($channels !== []) {
                $result[$eventId] = $channels;
            }
        }

        return $result === [] ? null : $result;
    }
}
