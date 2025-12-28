<?php

namespace Modules\Customers\Support;

class CustomerTagConfig
{
    public const REGISTERED = 'registered';
    public const GUEST = 'guest';
    public const COMPANY = 'company';
    public const VIP = 'vip';

    /**
     * @return array<string, string>
     */
    public static function defaultLabels(): array
    {
        return [
            self::REGISTERED => 'Zaregistrován',
            self::GUEST => 'Neregistrován',
            self::COMPANY => 'Firma',
            self::VIP => 'VIP',
        ];
    }

    /**
     * @return array<string, array<int, string>>
     */
    public static function defaultAliases(): array
    {
        return [
            self::REGISTERED => [
                'registered',
                'registrovaný',
                'registrovana',
                'registrována',
                'registrováni',
                'registrovat',
                'customer',
                'customer-final',
                'cumpărător final',
                'final customer',
                'zákazník',
            ],
            self::GUEST => [
                'guest',
                'neregistrovaný',
                'bez registrace',
                'návštěvník',
            ],
            self::COMPANY => [
                'firma',
                'company',
                'business',
                'b2b',
            ],
        ];
    }

    /**
     * @param array<string, string|int|null> $labels
     * @return array<string, string>
     */
    public static function sanitizeLabels(array $labels): array
    {
        $defaults = self::defaultLabels();

        $sanitized = [];
        foreach ($defaults as $key => $defaultLabel) {
            $value = $labels[$key] ?? $defaultLabel;

            if (! is_string($value)) {
                $value = (string) $value;
            }

            $value = trim($value);

            if ($value === '') {
                $value = $defaultLabel;
            }

            $sanitized[$key] = $value;
        }

        return $sanitized;
    }

    /**
     * @param array<string, array<int, string|null>> $aliases
     * @return array<string, array<int, string>>
     */
    public static function sanitizeAliases(array $aliases): array
    {
        $defaults = self::defaultAliases();

        $result = [];

        foreach ([self::REGISTERED, self::GUEST, self::COMPANY] as $group) {
            $entries = $aliases[$group] ?? $defaults[$group] ?? [];

            if (! is_array($entries)) {
                $entries = [$entries];
            }

            $normalized = [];

            foreach ($entries as $entry) {
                if ($entry === null) {
                    continue;
                }

                if (! is_string($entry)) {
                    $entry = (string) $entry;
                }

                $entry = trim(mb_strtolower($entry));

                if ($entry === '') {
                    continue;
                }

                $normalized[] = $entry;
            }

            if ($normalized === []) {
                $normalized = $defaults[$group] ?? [];
            }

            $result[$group] = array_values(array_unique($normalized));
        }

        return $result;
    }
}
