<?php

namespace App\Constants;

/**
 * Currency mapping by locale/language code
 * Maps language/locale codes to currency symbols and codes
 */
class CurrencyMap
{
    /**
     * Locale to currency symbol mapping
     * 
     * @return array<string, array<string, string>>
     */
    public static function get(): array
    {
        return [
            'cs' => [
                'symbol' => 'Kč',
                'code' => 'CZK',
                'name' => 'Koruna česká',
                'locale' => 'cs_CZ',
                'symbolPosition' => 'after',
                'symbolSpace' => ' ',
            ],
            'sk' => [
                'symbol' => '€',
                'code' => 'EUR',
                'name' => 'Euro',
                'locale' => 'sk_SK',
                'symbolPosition' => 'before',
                'symbolSpace' => '',
            ],
            'hu' => [
                'symbol' => 'Ft',
                'code' => 'HUF',
                'name' => 'Maďarský forint',
                'locale' => 'hu_HU',
                'symbolPosition' => 'after',
                'symbolSpace' => ' ',
            ],
            'ro' => [
                'symbol' => 'Lei',
                'code' => 'RON',
                'name' => 'Rumunský lei',
                'locale' => 'ro_RO',
                'symbolPosition' => 'after',
                'symbolSpace' => ' ',
            ],
            'hr' => [
                'symbol' => '€',
                'code' => 'EUR',
                'name' => 'Euro',
                'locale' => 'hr_HR',
                'symbolPosition' => 'before',
                'symbolSpace' => '',
            ],
            'en' => [
                'symbol' => '€',
                'code' => 'EUR',
                'name' => 'Euro',
                'locale' => 'en_US',
                'symbolPosition' => 'before',
                'symbolSpace' => '',
            ],
        ];
    }

    /**
     * Get currency symbol for specific locale
     * 
     * @param string $locale Language code (e.g., 'cs', 'sk', 'hu', 'ro', 'hr')
     * @param string $fallback Fallback symbol if locale not found
     * @return string Currency symbol
     */
    public static function getSymbol(string $locale, string $fallback = 'Kč'): string
    {
        $map = self::get();
        return $map[$locale]['symbol'] ?? $fallback;
    }

    /**
     * Get currency code for specific locale
     * 
     * @param string $locale Language code (e.g., 'cs', 'sk', 'hu', 'ro', 'hr')
     * @param string $fallback Fallback code if locale not found
     * @return string Currency code
     */
    public static function getCode(string $locale, string $fallback = 'CZK'): string
    {
        $map = self::get();
        return $map[$locale]['code'] ?? $fallback;
    }

    /**
     * Get full currency info for specific locale
     * 
     * @param string $locale Language code (e.g., 'cs', 'sk', 'hu', 'ro', 'hr')
     * @return array<string, string>|null Currency info or null if not found
     */
    public static function getInfo(string $locale): ?array
    {
        $map = self::get();
        return $map[$locale] ?? null;
    }

    /**
     * Check if locale is supported
     * 
     * @param string $locale Language code
     * @return bool
     */
    public static function isSupported(string $locale): bool
    {
        return isset(self::get()[$locale]);
    }

    /**
     * Format price with currency symbol in correct position
     * 
     * @param int|float|null $price Price in cents (e.g., 1290 = 12.90)
     * @param string $locale Language code (e.g., 'cs', 'sk', 'hu', 'ro', 'hr')
     * @return string|null Formatted price (e.g., "1 290 Kč" or "€24.99")
     */
    public static function formatPrice($price, string $locale = 'cs'): ?string
    {
        if ($price === null) {
            return null;
        }

        $info = self::getInfo($locale);
        if (!$info) {
            $info = self::getInfo('cs'); // Fallback to Czech
        }

        $symbol = $info['symbol'];
        $position = $info['symbolPosition'] ?? 'after';
        $space = $info['symbolSpace'] ?? ' ';

        // Convert cents to decimal (1290 -> 12.90)
        $decimal = is_float($price) ? $price : ($price / 100);

        // Format based on locale
        if ($locale === 'cs') {
            // Czech: "1 290 Kč"
            $formatted = number_format($decimal, 0, ',', ' ');
        } elseif (in_array($locale, ['sk', 'hr'])) {
            // Euro (Slovak, Croatian): "€24.99"
            $formatted = number_format($decimal, 2, '.', '');
        } elseif ($locale === 'hu') {
            // Hungarian: "1 290 Ft"
            $formatted = number_format($decimal, 0, ',', ' ');
        } elseif ($locale === 'ro') {
            // Romanian: "1 290 Lei"
            $formatted = number_format($decimal, 2, ',', '.');
        } else {
            // Default: format as Czech
            $formatted = number_format($decimal, 0, ',', ' ');
        }

        // Apply symbol at correct position
        if ($position === 'before') {
            return $symbol . $space . $formatted;
        } else {
            return $formatted . $space . $symbol;
        }
    }
}
