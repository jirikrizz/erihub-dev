<?php

namespace Modules\Core\Support;

use InvalidArgumentException;
use Modules\Core\Enums\JobScheduleFrequency;

class JobScheduleCatalog
{
    /**
     * @var array<string, array{
     *     label: string,
     *     description: string,
     *     default_frequency: JobScheduleFrequency,
     *     default_cron?: string,
     *     default_timezone?: string,
     *     supports_shop?: bool,
     *     default_options?: array
     * }>
     */
    private const JOBS = [
        'orders.fetch_new' => [
            'label' => 'Stahování nových objednávek',
            'description' => 'Pravidelně stahuje nové objednávky z napojených e-shopů do administrace.',
            'default_frequency' => JobScheduleFrequency::EVERY_FIVE_MINUTES,
            'default_cron' => '*/5 * * * *',
            'default_timezone' => 'Europe/Prague',
            'supports_shop' => true,
            'default_options' => [
                'fallback_lookback_hours' => 24,
            ],
        ],
        'orders.refresh_statuses' => [
            'label' => 'Aktualizace stavů objednávek',
            'description' => 'Sleduje změny stavů již stažených objednávek a synchronizuje je s HUBem.',
            'default_frequency' => JobScheduleFrequency::EVERY_FIFTEEN_MINUTES,
            'default_cron' => '*/15 * * * *',
            'default_timezone' => 'Europe/Prague',
            'supports_shop' => true,
            'default_options' => [
                'lookback_hours' => 48,
            ],
        ],
        'orders.refresh_statuses_deep' => [
            'label' => 'Aktualizace stavů objednávek (hluboká)',
            'description' => 'Jednou denně zkontroluje stav objednávek hluboko do minulosti.',
            'default_frequency' => JobScheduleFrequency::DAILY,
            'default_cron' => '0 3 * * *',
            'default_timezone' => 'Europe/Prague',
            'supports_shop' => true,
            'default_options' => [
                'lookback_hours' => 720,
            ],
        ],
        'products.import_master' => [
            'label' => 'Import produktů z master e-shopu',
            'description' => 'Importuje nové produkty z master e-shopu a udržuje katalog aktuální.',
            'default_frequency' => JobScheduleFrequency::HOURLY,
            'default_cron' => '0 * * * *',
            'default_timezone' => 'Europe/Prague',
            'supports_shop' => true,
            'default_options' => [
                'fallback_lookback_hours' => 168,
            ],
        ],
        'customers.recalculate_metrics' => [
            'label' => 'Přepočet zákaznických metrik',
            'description' => 'Naplánuje dávky pro přepočet agregovaných metrik zákazníků.',
            'default_frequency' => JobScheduleFrequency::DAILY,
            'default_cron' => '30 2 * * *',
            'default_timezone' => 'Europe/Prague',
            'supports_shop' => false,
            'default_options' => [
                'queue' => 'customers_metrics',
                'chunk' => 250,
            ],
        ],
        'customers.backfill_from_orders' => [
            'label' => 'Vytváření profilů z objednávek',
            'description' => 'Automaticky doplní a přiřadí profily zákazníků k objednávkám bez přiřazeného zákazníka.',
            'default_frequency' => JobScheduleFrequency::EVERY_FIFTEEN_MINUTES,
            'default_cron' => '*/15 * * * *',
            'default_timezone' => 'Europe/Prague',
            'supports_shop' => true,
            'default_options' => [
                'queue' => 'customers',
                'chunk' => 200,
            ],
        ],
        'customers.fetch_shoptet' => [
            'label' => 'Noční import zákazníků ze Shoptetu',
            'description' => 'Vyžádá snapshot zákazníků ze Shoptetu a spustí zpracování v pipeline.',
            'default_frequency' => JobScheduleFrequency::DAILY,
            'default_cron' => '30 3 * * *',
            'default_timezone' => 'Europe/Prague',
            'supports_shop' => true,
        ],
        'woocommerce.fetch_orders' => [
            'label' => 'WooCommerce – import objednávek',
            'description' => 'Pravidelně stáhne nové objednávky z napojených WooCommerce shopů.',
            'default_frequency' => JobScheduleFrequency::EVERY_FIFTEEN_MINUTES,
            'default_cron' => '*/15 * * * *',
            'default_timezone' => 'Europe/Prague',
            'supports_shop' => true,
            'default_options' => [
                'lookback_hours' => 24,
                'per_page' => 50,
                'max_pages' => 50,
            ],
        ],
        'inventory.stock_guard_sync' => [
            'label' => 'Hlídač skladu – aktualizace zásob',
            'description' => 'Každých 30 minut načte zásoby z Elogistu a uloží je pro rychlé porovnání se Shoptetem.',
            'default_frequency' => JobScheduleFrequency::CUSTOM,
            'default_cron' => '*/30 * * * *',
            'default_timezone' => 'Europe/Prague',
            'supports_shop' => false,
            'default_options' => [
                'chunk' => 200,
            ],
        ],
        'inventory.generate_recommendations' => [
            'label' => 'Předvýpočet doporučených produktů',
            'description' => 'Každý den spočítá doporučené produkty a uloží je pro rychlé zobrazení v administraci.',
            'default_frequency' => JobScheduleFrequency::DAILY,
            'default_cron' => '0 2 * * *',
            'default_timezone' => 'Europe/Prague',
            'supports_shop' => false,
            'default_options' => [
                'product_limit' => 10,
                'limit' => 6,
                'chunk' => 50,
                'exclude_keywords' => [
                    'tester',
                    'bez víčka',
                    'bez vicka',
                    'bez krabičky',
                    'bez krabicky',
                    'vzorek',
                    'sample',
                ],
            ],
        ],
        'products.sync_all_shops' => [
            'label' => 'Sync produktů ze VŠECH shopů',
            'description' => 'Pravidelně stahuje produkty ze VŠECH shopů (CZ, SK, HU, RO, HR) pro získání cen, linků, názvů per locale.',
            'default_frequency' => JobScheduleFrequency::DAILY,
            'default_cron' => '0 4 * * *',
            'default_timezone' => 'Europe/Prague',
            'supports_shop' => false,
            'default_options' => [
                'shop_ids' => [], // Prázdné = všechny shopy, nebo [1,2,3] pro konkrétní
            ],
        ],
    ];

    /**
     * @return list<string>
     */
    public static function keys(): array
    {
        return array_keys(self::JOBS);
    }

    public static function contains(string $jobType): bool
    {
        return isset(self::JOBS[$jobType]);
    }

    /**
     * @return array{
     *     job_type: string,
     *     label: string,
     *     description: string,
     *     default_frequency: JobScheduleFrequency,
     *     default_cron: string,
     *     default_timezone: string,
     *     supports_shop: bool
     * }
     */
    public static function definition(string $jobType): array
    {
        if (! isset(self::JOBS[$jobType])) {
            throw new InvalidArgumentException("Unknown job schedule type [{$jobType}]");
        }

        $definition = self::JOBS[$jobType];
        $frequency = $definition['default_frequency'];
        $defaultCron = $definition['default_cron'] ?? $frequency->defaultCronExpression() ?? '* * * * *';
        $defaultTimezone = $definition['default_timezone'] ?? config('app.timezone', 'UTC');
        $supportsShop = $definition['supports_shop'] ?? false;

        return [
            'job_type' => $jobType,
            'label' => $definition['label'],
            'description' => $definition['description'],
            'default_frequency' => $frequency,
            'default_cron' => $defaultCron,
            'default_timezone' => $defaultTimezone,
            'supports_shop' => $supportsShop,
            'default_options' => $definition['default_options'] ?? [],
        ];
    }

    /**
     * @return list<array{
     *     job_type: string,
     *     label: string,
     *     description: string,
     *     default_frequency: string,
     *     default_frequency_label: string,
     *     default_cron: string,
     *     default_timezone: string,
     *     supports_shop: bool
     * }>
     */
    public static function catalog(): array
    {
        return array_values(array_map(
            function (string $jobType): array {
                $definition = self::definition($jobType);

                return [
                    'job_type' => $jobType,
                    'label' => $definition['label'],
                    'description' => $definition['description'],
                    'default_frequency' => $definition['default_frequency']->value,
                    'default_frequency_label' => $definition['default_frequency']->label(),
                    'default_cron' => $definition['default_cron'],
                    'default_timezone' => $definition['default_timezone'],
                    'supports_shop' => $definition['supports_shop'],
                    'default_options' => $definition['default_options'],
                ];
            },
            self::keys()
        ));
    }

    /**
     * @return array<string, string>
     */
    public static function validateOptions(string $jobType, ?array $options): array
    {
        $options = $options ?? [];
        $errors = [];

        switch ($jobType) {
            case 'orders.refresh_statuses':
                if (array_key_exists('lookback_hours', $options)) {
                    $value = $options['lookback_hours'];

                    if ($value === '' || $value === null) {
                        break;
                    }

                    if (! is_numeric($value)) {
                        $errors['lookback_hours'] = 'Zadej počet hodin jako číslo.';
                        break;
                    }

                    $hours = (int) $value;
                    if ($hours < 1 || $hours > 720) {
                        $errors['lookback_hours'] = 'Povolený rozsah je 1 až 720 hodin (max. 30 dní).';
                    }
                }

                break;
            case 'orders.fetch_new':
                if (array_key_exists('fallback_lookback_hours', $options)) {
                    $value = $options['fallback_lookback_hours'];

                    if ($value === '' || $value === null) {
                        break;
                    }

                    if (! is_numeric($value)) {
                        $errors['fallback_lookback_hours'] = 'Zadej počet hodin jako číslo.';
                        break;
                    }

                    $hours = (int) $value;
                    if ($hours < 1 || $hours > 720) {
                        $errors['fallback_lookback_hours'] = 'Povolený rozsah je 1 až 720 hodin (max. 30 dní).';
                    }
                }

                break;
            case 'customers.recalculate_metrics':
                if (array_key_exists('chunk', $options)) {
                    $value = $options['chunk'];

                    if ($value === null || $value === '') {
                        break;
                    }

                    if (! is_numeric($value)) {
                        $errors['chunk'] = 'Zadej velikost dávky jako číslo.';
                        break;
                    }

                    $chunk = (int) $value;
                    if ($chunk < 1 || $chunk > 5000) {
                        $errors['chunk'] = 'Povolený rozsah velikosti dávky je 1 až 5000.';
                    }
                }

                if (array_key_exists('queue', $options)) {
                    $value = $options['queue'];

                    if ($value === null || $value === '') {
                        $errors['queue'] = 'Zadej název fronty.';
                        break;
                    }

                    if (! is_string($value)) {
                        $errors['queue'] = 'Název fronty musí být řetězec.';
                    }
                }

                break;
            case 'customers.backfill_from_orders':
                if (array_key_exists('chunk', $options)) {
                    $value = $options['chunk'];

                    if ($value === null || $value === '') {
                        break;
                    }

                    if (! is_numeric($value)) {
                        $errors['chunk'] = 'Zadej počet objednávek v jedné dávce jako číslo.';
                        break;
                    }

                    $chunk = (int) $value;
                    if ($chunk < 10 || $chunk > 2000) {
                        $errors['chunk'] = 'Povolený rozsah velikosti dávky je 10 až 2000 objednávek.';
                    }
                }

                if (array_key_exists('queue', $options)) {
                    $value = $options['queue'];

                    if ($value === null || $value === '') {
                        $errors['queue'] = 'Zadej název fronty.';
                        break;
                    }

                    if (! is_string($value)) {
                        $errors['queue'] = 'Název fronty musí být řetězec.';
                    }
                }

                break;
            case 'woocommerce.fetch_orders':
                if (array_key_exists('lookback_hours', $options)) {
                    $value = $options['lookback_hours'];

                    if ($value !== null && $value !== '') {
                        if (! is_numeric($value)) {
                            $errors['lookback_hours'] = 'Zadej počet hodin jako číslo.';
                        } else {
                            $hours = (int) $value;
                            if ($hours < 1 || $hours > 720) {
                                $errors['lookback_hours'] = 'Povolený rozsah je 1 až 720 hodin (max. 30 dní).';
                            }
                        }
                    }
                }

                if (array_key_exists('per_page', $options)) {
                    $value = $options['per_page'];

                    if ($value !== null && $value !== '') {
                        if (! is_numeric($value)) {
                            $errors['per_page'] = 'Počet záznamů na stránku zadej jako číslo.';
                        } else {
                            $perPage = (int) $value;
                            if ($perPage < 1 || $perPage > 100) {
                                $errors['per_page'] = 'Povolený rozsah je 1 až 100 objednávek na stránku.';
                            }
                        }
                    }
                }

                if (array_key_exists('max_pages', $options)) {
                    $value = $options['max_pages'];

                    if ($value !== null && $value !== '') {
                        if (! is_numeric($value)) {
                            $errors['max_pages'] = 'Zadej maximální počet stránek jako číslo.';
                        } else {
                            $pages = (int) $value;
                            if ($pages < 1) {
                                $errors['max_pages'] = 'Maximální počet stránek musí být alespoň 1.';
                            }
                        }
                    }
                }

                break;
        }

        return $errors;
    }

    public static function sanitizeOptions(string $jobType, ?array $options): ?array
    {
        $definition = self::definition($jobType);
        $defaults = $definition['default_options'] ?? [];

        $options = $options ?? [];

        $normalized = $defaults;

        switch ($jobType) {
            case 'orders.refresh_statuses':
                $raw = $options['lookback_hours'] ?? $defaults['lookback_hours'] ?? 48;
                $hours = is_numeric($raw) ? (int) $raw : ($defaults['lookback_hours'] ?? 48);
                $hours = max(1, min(720, $hours));
                $normalized['lookback_hours'] = $hours;
                break;
            case 'orders.fetch_new':
                $rawFallback = $options['fallback_lookback_hours'] ?? $defaults['fallback_lookback_hours'] ?? 24;
                $fallback = is_numeric($rawFallback) ? (int) $rawFallback : ($defaults['fallback_lookback_hours'] ?? 24);
                $fallback = max(1, min(720, $fallback));
                $normalized['fallback_lookback_hours'] = $fallback;
                break;
            case 'customers.recalculate_metrics':
                $rawChunk = $options['chunk'] ?? $defaults['chunk'] ?? 250;
                $chunk = is_numeric($rawChunk) ? (int) $rawChunk : ($defaults['chunk'] ?? 250);
                $chunk = max(1, min(5000, $chunk));

                $rawQueue = $options['queue'] ?? $defaults['queue'] ?? 'customers_metrics';
                $queue = is_string($rawQueue) ? trim($rawQueue) : (string) ($defaults['queue'] ?? 'customers_metrics');
                if ($queue === '') {
                    $queue = $defaults['queue'] ?? 'customers_metrics';
                }

                $normalized['chunk'] = $chunk;
                $normalized['queue'] = $queue;
                break;
            case 'customers.backfill_from_orders':
                $rawChunkBackfill = $options['chunk'] ?? $defaults['chunk'] ?? 200;
                $chunkBackfill = is_numeric($rawChunkBackfill) ? (int) $rawChunkBackfill : ($defaults['chunk'] ?? 200);
                $chunkBackfill = max(10, min(2000, $chunkBackfill));

                $rawQueueBackfill = $options['queue'] ?? $defaults['queue'] ?? 'customers';
                $queueBackfill = is_string($rawQueueBackfill) ? trim($rawQueueBackfill) : (string) ($defaults['queue'] ?? 'customers');
                if ($queueBackfill === '') {
                    $queueBackfill = $defaults['queue'] ?? 'customers';
                }

                $normalized['chunk'] = $chunkBackfill;
                $normalized['queue'] = $queueBackfill;
                break;
            case 'woocommerce.fetch_orders':
                $rawLookback = $options['lookback_hours'] ?? $defaults['lookback_hours'] ?? 24;
                $lookback = is_numeric($rawLookback) ? (int) $rawLookback : ($defaults['lookback_hours'] ?? 24);
                $lookback = max(1, min(720, $lookback));

                $rawPerPage = $options['per_page'] ?? $defaults['per_page'] ?? 50;
                $perPage = is_numeric($rawPerPage) ? (int) $rawPerPage : ($defaults['per_page'] ?? 50);
                $perPage = max(1, min(100, $perPage));

                $rawMaxPages = $options['max_pages'] ?? $defaults['max_pages'] ?? 50;
                $maxPages = is_numeric($rawMaxPages) ? (int) $rawMaxPages : ($defaults['max_pages'] ?? 50);
                $maxPages = max(1, $maxPages);

                $normalized['lookback_hours'] = $lookback;
                $normalized['per_page'] = $perPage;
                $normalized['max_pages'] = $maxPages;
                break;
            default:
                $normalized = array_replace($defaults, $options);
        }

        return $normalized === [] ? null : $normalized;
    }
}
