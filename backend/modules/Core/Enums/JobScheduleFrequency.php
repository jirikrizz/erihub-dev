<?php

namespace Modules\Core\Enums;

enum JobScheduleFrequency: string
{
    case EVERY_FIVE_MINUTES = 'every_five_minutes';
    case EVERY_FIFTEEN_MINUTES = 'every_fifteen_minutes';
    case HOURLY = 'hourly';
    case DAILY = 'daily';
    case WEEKLY = 'weekly';
    case CUSTOM = 'custom';

    public function label(): string
    {
        return match ($this) {
            self::EVERY_FIVE_MINUTES => 'Každých 5 minut',
            self::EVERY_FIFTEEN_MINUTES => 'Každých 15 minut',
            self::HOURLY => 'Každou hodinu',
            self::DAILY => 'Denně',
            self::WEEKLY => 'Týdně',
            self::CUSTOM => 'Vlastní plán',
        };
    }

    public function defaultCronExpression(): ?string
    {
        return match ($this) {
            self::EVERY_FIVE_MINUTES => '*/5 * * * *',
            self::EVERY_FIFTEEN_MINUTES => '*/15 * * * *',
            self::HOURLY => '0 * * * *',
            self::DAILY => '0 3 * * *',
            self::WEEKLY => '0 4 * * 1',
            self::CUSTOM => null,
        };
    }
}
