<?php

namespace Modules\Core\Services;

use App\Models\User;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Modules\Core\Models\JobSchedule;
use Modules\Core\Models\NotificationUserState;
use Modules\Core\Services\SettingsService;
use Modules\Core\Services\UserPreferenceService;
use Modules\Core\Support\JobScheduleCatalog;
use Modules\Core\Support\NotificationEventCatalog;
use Modules\Core\Support\NotificationPreferenceNormalizer;
use Modules\Customers\Models\CustomerMetric;
use Modules\Inventory\Support\InventoryNotificationSettings;
use Modules\Pim\Models\ProductVariant;
use Modules\Shoptet\Models\SnapshotExecution;

class NotificationFeedService
{
    private const MAX_LIMIT = 200;
    private const VIP_THRESHOLD = 25000.0;
    private const RETENTION_DAYS = 7;

    public function __construct(
        private readonly CurrencyConverter $currencyConverter,
        private readonly SettingsService $settings,
        private readonly UserPreferenceService $preferences
    ) {
    }

    /**
     * @param  array{
     *     limit?: int|string|null,
     *     status?: string|null,
     *     module?: string|null,
     *     severity?: string|null,
     *     search?: string|null
     * }  $params
     */
    public function feedFor(User $user, array $params = []): array
    {
        $limit = $this->normalizeLimit($params['limit'] ?? 50);
        $statusFilter = $this->normalizeStatus($params['status'] ?? null);
        $moduleFilter = $this->normalizeFilterValue($params['module'] ?? null);
        $severityFilter = $this->normalizeFilterValue($params['severity'] ?? null);
        $searchFilter = $this->normalizeFilterValue($params['search'] ?? null);

        $disabledEvents = $this->disabledEventsFor($user);
        $notifications = $this->collectNotifications($disabledEvents);

        $states = NotificationUserState::query()
            ->where('user_id', $user->id)
            ->whereIn('notification_id', $notifications->pluck('id')->all())
            ->pluck('read_at', 'notification_id');

        $enriched = $notifications->map(function (array $item) use ($states) {
            $isRead = $states->has($item['id']);

            $item['status'] = $isRead ? 'read' : 'new';
            $item['created_at'] = $this->formatTimestamp($item['created_at']);

            return $item;
        });

        $totalUnread = $enriched->where('status', 'new')->count();

        $filtered = $enriched->when($moduleFilter, fn (Collection $collection) => $collection->filter(
            fn (array $item) => strcasecmp((string) $item['module'], (string) $moduleFilter) === 0
        ))->when($severityFilter, fn (Collection $collection) => $collection->filter(
            fn (array $item) => strcasecmp((string) $item['severity'], (string) $severityFilter) === 0
        ))->when($statusFilter, fn (Collection $collection) => $collection->filter(
            fn (array $item) => $statusFilter === 'all' ? true : $item['status'] === $statusFilter
        ))->when($searchFilter, function (Collection $collection) use ($searchFilter) {
            $normalized = Str::lower($searchFilter);

            return $collection->filter(function (array $item) use ($normalized) {
                $haystacks = [
                    Str::lower($item['title'] ?? ''),
                    Str::lower($item['message'] ?? ''),
                    Str::lower(Arr::get($item, 'metadata.shop_name', '')),
                ];

                return collect($haystacks)->contains(fn ($value) => $value !== '' && Str::contains($value, $normalized));
            });
        });

        $availableModules = $notifications->pluck('module')->filter()->unique()->values()->all();
        $availableSeverities = $notifications->pluck('severity')->filter()->unique()->values()->all();

        return [
            'logs' => $filtered->take($limit)->values()->all(),
            'unread_count' => $totalUnread,
            'fetched_at' => now()->toISOString(),
            'available_filters' => [
                'modules' => $availableModules,
                'severities' => $availableSeverities,
            ],
        ];
    }

    public function markAsRead(User $user, string $notificationId): void
    {
        NotificationUserState::query()->updateOrCreate(
            [
                'user_id' => $user->id,
                'notification_id' => $notificationId,
            ],
            [
                'read_at' => now(),
            ]
        );
    }

    /**
     * @param  array<int, string>|null  $notificationIds
     */
    public function markAllAsRead(User $user, ?array $notificationIds = null): void
    {
        $ids = collect($notificationIds ?? [])
            ->filter(fn ($id) => is_string($id) && $id !== '')
            ->values();

        if ($ids->isEmpty()) {
            $ids = $this->collectNotifications($this->disabledEventsFor($user))->pluck('id');
        }

        if ($ids->isEmpty()) {
            return;
        }

        $now = now();

        $payload = $ids
            ->unique()
            ->map(fn (string $id) => [
                'user_id' => $user->id,
                'notification_id' => $id,
                'read_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ])
            ->values()
            ->all();

        NotificationUserState::query()->upsert(
            $payload,
            ['user_id', 'notification_id'],
            ['read_at', 'updated_at']
        );
    }

    public function countUnread(User $user): int
    {
        $disabledEvents = $this->disabledEventsFor($user);
        $notifications = $this->collectNotifications($disabledEvents);

        if ($notifications->isEmpty()) {
            return 0;
        }

        $states = NotificationUserState::query()
            ->where('user_id', $user->id)
            ->whereIn('notification_id', $notifications->pluck('id')->all())
            ->pluck('read_at', 'notification_id');

        return $notifications
            ->reject(fn (array $item) => $states->has($item['id']))
            ->count();
    }

    public function collectNotifications(array $disabledEventIds = []): Collection
    {
        return $this
            ->collectSnapshotNotifications()
            ->concat($this->collectJobScheduleNotifications())
            ->concat($this->collectInventoryNotifications())
            ->concat($this->collectCustomerNotifications())
            ->unique('id')
            ->sortByDesc(fn (array $item) => $item['created_at'] instanceof CarbonInterface
                ? $item['created_at']->getTimestamp()
                : 0)
            ->filter(fn (array $item) => ! in_array($item['event_id'], $disabledEventIds, true))
            ->values()
            ->take(self::MAX_LIMIT);
    }

    private function collectInventoryNotifications(): Collection
    {
        $settings = InventoryNotificationSettings::sanitize($this->settings->getJson(
            InventoryNotificationSettings::SETTINGS_KEY,
            InventoryNotificationSettings::defaults()
        ));

        $threshold = $settings['low_stock_threshold'] ?? 0;
        $watchIds = $settings['watch_variant_ids'] ?? [];

        $lowStockVariants = ProductVariant::query()
            ->with(['product.shop'])
            ->whereNotNull('stock')
            ->where('stock', '>', 0)
            ->where(function ($query) use ($threshold) {
                if ($threshold > 0) {
                    $query->where('stock', '<=', $threshold);
                }

                $query->orWhere(function ($inner) {
                    $inner->whereNotNull('min_stock_supply')
                        ->whereColumn('stock', '<', 'min_stock_supply');
                });
            })
            ->orderBy('stock')
            ->limit(80)
            ->get();

        $lowStockEntries = $lowStockVariants->map(function (ProductVariant $variant) use ($threshold) {
            $limit = $variant->min_stock_supply ?? ($threshold > 0 ? $threshold : null);
            $createdAt = $variant->updated_at
                ? CarbonImmutable::parse($variant->updated_at)
                : CarbonImmutable::now();

            $stockSignature = $variant->stock !== null
                ? (string) (int) ceil(max($variant->stock, 0))
                : 'unknown';

            return [
                'id' => sprintf(
                    'inventory_low_stock:%s:%s',
                    $variant->getKey(),
                    $stockSignature
                ),
                'event_id' => 'inventory.low-stock',
                'title' => sprintf('Nízká zásoba: %s', $this->inventoryVariantTitle($variant)),
                'message' => $this->inventoryLowStockMessage($variant, $limit),
                'severity' => 'warning',
                'module' => 'inventory',
                'channel' => 'ui',
                'created_at' => $createdAt,
                'metadata' => $this->inventoryVariantMetadata($variant, [
                    'threshold' => $limit,
                ]),
            ];
        });

        $soldOutEntries = collect();

        if ($watchIds !== []) {
            $soldOutEntries = ProductVariant::query()
                ->with(['product.shop'])
                ->whereIn('id', $watchIds)
                ->get()
                ->filter(function (ProductVariant $variant) {
                    $stock = $variant->stock;

                    return $stock === null ? false : $stock <= 0;
                })
                ->map(function (ProductVariant $variant) {
                    $createdAt = $variant->updated_at
                        ? CarbonImmutable::parse($variant->updated_at)
                        : CarbonImmutable::now();

                    $cycleSignature = $variant->updated_at?->format('YmdHis') ?? '0';

                    return [
                        'id' => sprintf(
                            'inventory_out_of_stock:%s:%s',
                            $variant->getKey(),
                            $cycleSignature
                        ),
                        'event_id' => 'inventory.out-of-stock',
                        'title' => sprintf('Vyprodáno: %s', $this->inventoryVariantTitle($variant)),
                        'message' => $this->inventoryOutOfStockMessage($variant),
                        'severity' => 'error',
                        'module' => 'inventory',
                        'channel' => 'ui',
                        'created_at' => $createdAt,
                        'metadata' => $this->inventoryVariantMetadata($variant),
                    ];
                });
        }

        return $lowStockEntries->concat($soldOutEntries)->values();
    }

    private function inventoryVariantTitle(ProductVariant $variant): string
    {
        $candidates = [
            $this->inventoryVariantProductName($variant),
            $variant->name,
            $variant->code,
            $variant->sku,
        ];

        foreach ($candidates as $candidate) {
            if ($candidate && trim((string) $candidate) !== '') {
                return (string) $candidate;
            }
        }

        return 'Varianta';
    }

    private function inventoryVariantProductName(ProductVariant $variant): ?string
    {
        $product = $variant->product;

        if (! $product) {
            return null;
        }

        $basePayload = $product->base_payload ?? [];
        $name = Arr::get($basePayload, 'name');

        if (is_string($name) && trim($name) !== '') {
            return $name;
        }

        return $product->sku ?: null;
    }

    private function inventoryShopName(ProductVariant $variant): ?string
    {
        $shop = $variant->product?->shop;

        if ($shop?->name) {
            return $shop->name;
        }

        $shopId = $variant->product?->shop_id;

        return $shopId ? sprintf('Shop #%d', $shopId) : null;
    }

    private function inventoryLowStockMessage(ProductVariant $variant, ?int $threshold): string
    {
        $parts = [
            sprintf(
                '%s má skladem %s',
                $this->inventoryVariantTitle($variant),
                $this->formatQuantity($variant->stock, $variant->unit)
            ),
        ];

        $limit = $variant->min_stock_supply ?? $threshold;

        if ($limit !== null) {
            $parts[] = sprintf('limit je %s', $this->formatQuantity($limit, $variant->unit));
        }

        if ($shopName = $this->inventoryShopName($variant)) {
            $parts[] = sprintf('shop %s', $shopName);
        }

        return implode(' – ', $parts).'.';
    }

    private function inventoryOutOfStockMessage(ProductVariant $variant): string
    {
        $parts = [
            sprintf('%s je vyprodaná', $this->inventoryVariantTitle($variant)),
        ];

        if ($shopName = $this->inventoryShopName($variant)) {
            $parts[] = sprintf('shop %s', $shopName);
        }

        return implode(' – ', $parts).'.';
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function inventoryVariantMetadata(ProductVariant $variant, array $extra = []): array
    {
        $shopId = $variant->product?->shop?->id ?? $variant->product?->shop_id;
        $shopName = $variant->product?->shop?->name ?? $this->inventoryShopName($variant);

        $metadata = [
            'variant_id' => $variant->getKey(),
            'code' => $variant->code,
            'sku' => $variant->sku,
            'product_name' => $this->inventoryVariantProductName($variant),
            'stock' => $variant->stock,
            'min_stock_supply' => $variant->min_stock_supply,
            'unit' => $variant->unit,
            'shop_id' => $shopId,
            'shop_name' => $shopName,
        ] + $extra;

        return array_filter(
            $metadata,
            static fn ($value) => $value !== null
        );
    }

    private function formatQuantity(float|int|null $value, ?string $unit = null): string
    {
        if ($value === null) {
            return '0';
        }

        $isInt = abs((float) $value - (int) $value) < 0.0001;
        $formatted = $isInt ? (string) (int) $value : number_format((float) $value, 2, ',', ' ');

        return $unit ? sprintf('%s %s', $formatted, $unit) : $formatted;
    }

    /**
     * @return list<string>
     */
    private function disabledEventsFor(User $user): array
    {
        $preference = $this->preferences->get($user, 'notifications.events');
        $normalized = NotificationPreferenceNormalizer::normalize(
            $preference?->value,
            strict: false
        );

        $disabled = [];

        foreach (NotificationEventCatalog::eventIds() as $eventId) {
            $override = $normalized[$eventId]['ui'] ?? null;

            if (is_bool($override)) {
                $enabled = $override;
            } else {
                $enabled = NotificationEventCatalog::defaultForChannel($eventId, 'ui');
            }

            if (! $enabled) {
                $disabled[] = $eventId;
            }
        }

        return $disabled;
    }

    private function collectSnapshotNotifications(): Collection
    {
        $cutoff = CarbonImmutable::now()->subDays(self::RETENTION_DAYS);

        return SnapshotExecution::query()
            ->with('shop')
            ->whereNotNull('finished_at')
            ->where('finished_at', '>=', $cutoff)
            ->orderByDesc('finished_at')
            ->limit(self::MAX_LIMIT)
            ->get()
            ->map(function (SnapshotExecution $execution): ?array {
                $status = $execution->status;
                $endpoint = $execution->endpoint ?? '';
                $shopName = $execution->shop?->name ?? sprintf('Shop #%d', $execution->shop_id);
                $label = $this->snapshotLabel($endpoint);
                $processed = (int) ($execution->meta['processed_count'] ?? 0);
                $duration = $this->deriveDuration($execution->started_at, $execution->finished_at) ?? null;
                $createdAt = CarbonImmutable::parse($execution->finished_at ?? $execution->updated_at ?? $execution->created_at);

                $isSuccess = in_array($status, ['completed', 'processed'], true);
                $isFailure = in_array($status, ['error', 'download_failed', 'missing_snapshot', 'invalid_snapshot'], true);

                if (! $isSuccess && ! $isFailure) {
                    return null;
                }

                if ($isFailure && str_contains(Str::lower($endpoint), 'orders')) {
                    $eventId = 'orders.import-failed';
                    $module = 'orders';
                } else {
                    $eventId = $isSuccess ? 'shoptet.snapshot-success' : 'shoptet.snapshot-failed';
                    $module = 'shoptet';
                }

                $severity = $isSuccess ? 'success' : 'error';
                $title = $this->snapshotTitle($eventId, $label);
                $message = $this->snapshotMessage(
                    $eventId,
                    $shopName,
                    $label,
                    $status,
                    $processed,
                    $duration,
                    $execution->meta ?? []
                );

                return [
                    'id' => sprintf('snapshot:%s', $execution->getKey()),
                    'event_id' => $eventId,
                    'title' => $title,
                    'message' => $message,
                    'severity' => $severity,
                    'module' => $module,
                    'channel' => 'ui',
                    'created_at' => $createdAt,
                    'metadata' => [
                        'snapshot_execution_id' => $execution->getKey(),
                        'shop_id' => $execution->shop_id,
                        'shop_name' => $shopName,
                        'endpoint' => $endpoint,
                        'status' => $status,
                        'processed_count' => $processed ?: null,
                        'duration_seconds' => $duration,
                    ],
                ];
            })
            ->filter()
            ->values();
    }

    private function collectJobScheduleNotifications(): Collection
    {
        $cutoff = CarbonImmutable::now()->subDays(self::RETENTION_DAYS);

        return JobSchedule::query()
            ->with('shop')
            ->whereNotNull('last_run_at')
            ->where('last_run_at', '>=', $cutoff)
            ->orderByDesc('last_run_at')
            ->limit(self::MAX_LIMIT)
            ->get()
            ->flatMap(function (JobSchedule $schedule): array {
                $entries = [];
                $label = $this->jobScheduleLabel($schedule->job_type);
                $shopName = $schedule->shop?->name;
                $createdAt = CarbonImmutable::parse($schedule->last_run_ended_at ?? $schedule->last_run_at);
                $duration = $this->deriveDuration($schedule->last_run_at, $schedule->last_run_ended_at);

                if ($schedule->last_run_status === 'failed') {
                    $entries[] = [
                        'id' => sprintf(
                            'job_schedule:%s:%s',
                            $schedule->getKey(),
                            $schedule->last_run_at?->format('YmdHis') ?? 'unknown'
                        ),
                        'event_id' => 'system.job-failed',
                        'title' => sprintf('Plán „%s“ selhal', $label),
                        'message' => $this->jobScheduleFailureMessage($label, $shopName, $schedule->last_run_message),
                        'severity' => 'error',
                        'module' => 'system',
                        'channel' => 'ui',
                        'created_at' => $createdAt,
                        'metadata' => [
                            'job_schedule_id' => $schedule->getKey(),
                            'job_type' => $schedule->job_type,
                            'shop_id' => $schedule->shop_id,
                            'shop_name' => $shopName,
                            'last_run_message' => $schedule->last_run_message,
                            'duration_seconds' => $duration,
                        ],
                    ];
                }

                if ($schedule->job_type === 'customers.recalculate_metrics' && $schedule->last_run_status === 'completed') {
                    $entries[] = [
                        'id' => sprintf(
                            'customer_metrics:%s:%s',
                            $schedule->getKey(),
                            $schedule->last_run_at?->format('YmdHis') ?? 'unknown'
                        ),
                        'event_id' => 'customers.metrics-ready',
                        'title' => 'Zákaznické metriky přepočteny',
                        'message' => $this->customerMetricsMessage($shopName, $duration),
                        'severity' => 'info',
                        'module' => 'customers',
                        'channel' => 'ui',
                        'created_at' => $createdAt,
                        'metadata' => [
                            'job_schedule_id' => $schedule->getKey(),
                            'shop_id' => $schedule->shop_id,
                            'shop_name' => $shopName,
                            'duration_seconds' => $duration,
                        ],
                    ];
                }

                return $entries;
            })
            ->values();
    }

    private function collectCustomerNotifications(): Collection
    {
        $cutoff = CarbonImmutable::now()->subDays(self::RETENTION_DAYS);

        return CustomerMetric::query()
            ->select([
                'customer_metrics.customer_guid',
                'customer_metrics.total_spent',
                'customer_metrics.total_spent_base',
                'customer_metrics.orders_count',
                'customer_metrics.last_order_at',
                'customers.full_name',
                'customers.email',
                'customers.shop_id',
                'customers.created_at as customer_created_at',
                'shops.name as shop_name',
            ])
            ->join('customers', 'customers.guid', '=', 'customer_metrics.customer_guid')
            ->leftJoin('shops', 'shops.id', '=', 'customers.shop_id')
            ->where('customer_metrics.total_spent_base', '>=', self::VIP_THRESHOLD)
            ->where(function ($query) use ($cutoff) {
                $query->where('customer_metrics.last_order_at', '>=', $cutoff)
                    ->orWhereNull('customer_metrics.last_order_at');
            })
            ->orderByDesc('customer_metrics.last_order_at')
            ->limit(80)
            ->get()
            ->map(function ($row): array {
                $guid = (string) $row->customer_guid;
                $lastOrderAt = $row->last_order_at
                    ? CarbonImmutable::parse($row->last_order_at)
                    : CarbonImmutable::parse($row->customer_created_at);
                $amountBase = $row->total_spent_base ?? $row->total_spent ?? 0.0;
                $ordersCount = (int) ($row->orders_count ?? 0);
                $customerName = $row->full_name ?: ($row->email ?: 'Neznámý zákazník');
                $shopName = $row->shop_name ?? ($row->shop_id ? sprintf('Shop #%d', $row->shop_id) : null);

                return [
                    'id' => sprintf(
                        'customer_vip:%s:%s',
                        $guid,
                        $lastOrderAt?->format('YmdHis') ?? 'unknown'
                    ),
                    'event_id' => 'customers.vip-created',
                    'title' => sprintf('Nový VIP zákazník: %s', $customerName),
                    'message' => $this->vipCustomerMessage($customerName, $amountBase, $ordersCount, $shopName),
                    'severity' => 'success',
                    'module' => 'customers',
                    'channel' => 'ui',
                    'created_at' => $lastOrderAt ?? CarbonImmutable::now(),
                    'metadata' => [
                        'customer_guid' => $guid,
                        'customer_email' => $row->email,
                        'shop_id' => $row->shop_id,
                        'shop_name' => $shopName,
                        'orders_count' => $ordersCount,
                        'total_spent_base' => $amountBase,
                    ],
                ];
            })
            ->values();
    }

    private function snapshotLabel(?string $endpoint): string
    {
        if (! $endpoint) {
            return 'snapshot';
        }

        $normalized = Str::lower($endpoint);

        if (str_contains($normalized, 'orders')) {
            return 'objednávek';
        }

        if (str_contains($normalized, 'products')) {
            return 'produktů';
        }

        if (str_contains($normalized, 'customers')) {
            return 'zákazníků';
        }

        if ($path = parse_url($endpoint, PHP_URL_PATH)) {
            $segments = collect(explode('/', $path))->filter();
            if ($segments->isNotEmpty()) {
                return Str::replace('-', ' ', $segments->last());
            }
        }

        return $endpoint;
    }

    private function snapshotTitle(string $eventId, string $label): string
    {
        return match ($eventId) {
            'shoptet.snapshot-success' => sprintf('Snapshot %s dokončen', $label),
            'orders.import-failed' => 'Import objednávek selhal',
            default => sprintf('Snapshot %s selhal', $label),
        };
    }

    /**
     * @param  array<string, mixed>  $meta
     */
    private function snapshotMessage(
        string $eventId,
        string $shopName,
        string $label,
        ?string $status,
        int $processed,
        ?int $duration,
        array $meta
    ): string {
        $details = [];

        if ($processed > 0) {
            $details[] = sprintf('zpracováno %s záznamů', number_format($processed, 0, ',', ' '));
        }

        if ($duration !== null) {
            $details[] = sprintf('trvání %s', $this->formatDuration($duration));
        }

        if ($eventId === 'orders.import-failed') {
            $reason = $meta['error'] ?? $status ?? 'neznámý důvod';

            return sprintf(
                '%s – snapshot objednávek selhal (%s).',
                $shopName,
                Str::headline((string) $reason)
            );
        }

        if ($eventId === 'shoptet.snapshot-success') {
            $suffix = $details !== [] ? ' ('.implode(', ', $details).')' : '';

            return sprintf('%s – snapshot %s dokončen%s.', $shopName, $label, $suffix);
        }

        $reason = $meta['error'] ?? $status ?? 'neznámý důvod';

        return sprintf(
            '%s – snapshot %s selhal (%s).',
            $shopName,
            $label,
            Str::headline((string) $reason)
        );
    }

    private function jobScheduleLabel(?string $jobType): string
    {
        if (! $jobType) {
            return 'Neznámý plán';
        }

        if (JobScheduleCatalog::contains($jobType)) {
            return JobScheduleCatalog::definition($jobType)['label'];
        }

        return Str::headline($jobType);
    }

    private function jobScheduleFailureMessage(?string $label, ?string $shopName, ?string $message): string
    {
        $parts = [];

        if ($shopName) {
            $parts[] = sprintf('Shop %s', $shopName);
        }

        if ($message) {
            $parts[] = $message;
        }

        if ($parts === []) {
            return sprintf('Plán „%s“ skončil chybou.', $label ?? 'neznámý');
        }

        return implode(' – ', $parts);
    }

    private function customerMetricsMessage(?string $shopName, ?int $duration): string
    {
        $parts = [];

        if ($shopName) {
            $parts[] = sprintf('Shop %s', $shopName);
        } else {
            $parts[] = 'Centrální metriky';
        }

        if ($duration !== null) {
            $parts[] = sprintf('zpracování %s', $this->formatDuration($duration));
        }

        $parts[] = 'výsledky aktualizovány';

        return implode(' – ', $parts).'.';
    }

    private function vipCustomerMessage(string $name, float $amountBase, int $ordersCount, ?string $shopName): string
    {
        $parts = [
            sprintf('%s utratil(a) %s', $name, $this->formatCurrency($amountBase)),
        ];

        if ($ordersCount > 0) {
            $parts[] = sprintf('počet objednávek %d', $ordersCount);
        }

        if ($shopName) {
            $parts[] = sprintf('shop %s', $shopName);
        }

        return implode(' – ', $parts).'.';
    }

    private function formatTimestamp(CarbonInterface|string|null $value): string
    {
        if ($value instanceof CarbonInterface) {
            return $value->toISOString();
        }

        if (is_string($value)) {
            return CarbonImmutable::parse($value)->toISOString();
        }

        return CarbonImmutable::now()->toISOString();
    }

    private function deriveDuration(?CarbonInterface $from, ?CarbonInterface $to): ?int
    {
        if (! $from || ! $to) {
            return null;
        }

        $seconds = $to->diffInSeconds($from, true);

        return $seconds > 0 ? $seconds : null;
    }

    private function formatDuration(int $seconds): string
    {
        if ($seconds < 60) {
            return sprintf('%d s', $seconds);
        }

        $minutes = intdiv($seconds, 60);
        $remainingSeconds = $seconds % 60;

        if ($minutes < 60) {
            return $remainingSeconds > 0
                ? sprintf('%d min %d s', $minutes, $remainingSeconds)
                : sprintf('%d min', $minutes);
        }

        $hours = intdiv($minutes, 60);
        $remainingMinutes = $minutes % 60;

        if ($remainingMinutes === 0) {
            return sprintf('%d h', $hours);
        }

        return sprintf('%d h %d min', $hours, $remainingMinutes);
    }

    private function formatCurrency(float $amount): string
    {
        $currency = $this->currencyConverter->getBaseCurrency();

        return sprintf('%s %s', number_format($amount, 0, ',', ' '), $currency);
    }

    private function normalizeLimit(int|string|null $limit): int
    {
        $value = is_numeric($limit) ? (int) $limit : 50;

        return max(1, min($value, self::MAX_LIMIT));
    }

    private function normalizeStatus(?string $status): ?string
    {
        if (! $status) {
            return null;
        }

        $normalized = Str::lower(trim($status));

        return in_array($normalized, ['new', 'read', 'all'], true) ? $normalized : null;
    }

    private function normalizeFilterValue(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }
}
