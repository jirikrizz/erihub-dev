<?php

namespace Modules\Core\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Modules\Customers\Models\Customer;
use Modules\Orders\Models\Order;
use Modules\Pim\Models\Product;

class FeedExportService
{
    /**
     * @var array<string, array{
     *     key: string,
     *     label: string,
     *     description: string,
     *     supports_time_range: bool,
     *     default_fields: list<string>,
     *     fields: array<string, array{label: string}>
     * }>
     */
    private const DEFINITIONS = [
        'customers' => [
            'key' => 'customers',
            'label' => 'Zákazníci',
            'description' => 'Export zákaznické báze včetně segmentace a základních atributů.',
            'supports_time_range' => true,
            'default_fields' => ['id', 'guid', 'email', 'full_name', 'customer_group', 'is_vip', 'orders_count', 'created_at'],
            'fields' => [
                'id' => ['label' => 'ID'],
                'guid' => ['label' => 'GUID'],
                'email' => ['label' => 'E-mail'],
                'full_name' => ['label' => 'Jméno'],
                'customer_group' => ['label' => 'Skupina'],
                'is_vip' => ['label' => 'VIP'],
                'shop_id' => ['label' => 'Shop ID'],
                'shop_name' => ['label' => 'Název shopu'],
                'shop_domain' => ['label' => 'Doména shopu'],
                'phone' => ['label' => 'Telefon'],
                'normalized_phone' => ['label' => 'Telefon (normalizovaný)'],
                'orders_count' => ['label' => 'Počet objednávek'],
                'order_codes' => ['label' => 'Čísla objednávek'],
                'total_spent' => ['label' => 'Utraceno (měna shopu)'],
                'total_spent_base' => ['label' => 'Utraceno (základní měna)'],
                'average_order_value' => ['label' => 'Průměrná objednávka'],
                'average_order_value_base' => ['label' => 'Průměrná objednávka (základní měna)'],
                'first_order_at' => ['label' => 'První objednávka'],
                'last_order_at' => ['label' => 'Poslední objednávka'],
                'created_at' => ['label' => 'Vytvořeno'],
                'updated_at' => ['label' => 'Upraveno'],
                'created_at_remote' => ['label' => 'Vytvořeno (Shoptet)'],
                'updated_at_remote' => ['label' => 'Upraveno (Shoptet)'],
                'billing_address' => ['label' => 'Fakturační adresa'],
                'delivery_addresses' => ['label' => 'Doručovací adresy'],
                'notes' => ['label' => 'Poznámky'],
                'data' => ['label' => 'Metadata'],
            ],
        ],
        'orders' => [
            'key' => 'orders',
            'label' => 'Objednávky',
            'description' => 'Export objednávek s částkami, statusem a kontakty.',
            'supports_time_range' => true,
            'default_fields' => ['id', 'code', 'status', 'shop_name', 'customer_email', 'total_with_vat', 'currency_code', 'ordered_at'],
            'fields' => [
                'id' => ['label' => 'ID'],
                'code' => ['label' => 'Kód'],
                'status' => ['label' => 'Stav'],
                'source' => ['label' => 'Zdroj'],
                'shop_id' => ['label' => 'Shop ID'],
                'shop_name' => ['label' => 'Název shopu'],
                'shop_domain' => ['label' => 'Doména shopu'],
                'customer_guid' => ['label' => 'Customer GUID'],
                'customer_email' => ['label' => 'Customer E-mail'],
                'customer_phone' => ['label' => 'Customer Telefon'],
                'customer_name' => ['label' => 'Customer jméno'],
                'total_with_vat' => ['label' => 'Cena s DPH'],
                'total_without_vat' => ['label' => 'Cena bez DPH'],
                'total_vat' => ['label' => 'DPH'],
                'total_with_vat_base' => ['label' => 'Cena s DPH (základ)'],
                'total_without_vat_base' => ['label' => 'Cena bez DPH (základ)'],
                'total_vat_base' => ['label' => 'DPH (základ)'],
                'currency_code' => ['label' => 'Měna'],
                'ordered_at' => ['label' => 'Objednáno'],
                'ordered_at_local' => ['label' => 'Objednáno (lokální čas)'],
                'created_at' => ['label' => 'Vytvořeno'],
                'updated_at' => ['label' => 'Upraveno'],
                'billing_address' => ['label' => 'Fakturační adresa'],
                'delivery_address' => ['label' => 'Doručovací adresa'],
                'payment' => ['label' => 'Platba'],
                'shipping' => ['label' => 'Doprava'],
                'price' => ['label' => 'Cenové položky'],
                'data' => ['label' => 'Metadata'],
                'items' => ['label' => 'Položky objednávky'],
            ],
        ],
        'products' => [
            'key' => 'products',
            'label' => 'Produkty',
            'description' => 'Export produktů dostupných v HUBu.',
            'supports_time_range' => false,
            'default_fields' => ['id', 'shop_id', 'sku', 'status', 'base_locale'],
            'fields' => [
                'id' => ['label' => 'ID'],
                'shop_id' => ['label' => 'Shop ID'],
                'external_guid' => ['label' => 'Externí GUID'],
                'sku' => ['label' => 'SKU'],
                'status' => ['label' => 'Stav'],
                'base_locale' => ['label' => 'Výchozí jazyk'],
                'base_payload' => ['label' => 'Základní payload'],
                'created_at' => ['label' => 'Vytvořeno'],
                'updated_at' => ['label' => 'Upraveno'],
            ],
        ],
    ];

    /**
     * @return list<array{key: string, label: string, description: string, supports_time_range: bool, default_fields: list<string>, fields: list<array{key: string, label: string}>}>
     */
    public function definitions(): array
    {
        return collect(self::DEFINITIONS)
            ->map(fn (array $definition) => [
                'key' => $definition['key'],
                'label' => $definition['label'],
                'description' => $definition['description'],
                'supports_time_range' => $definition['supports_time_range'],
                'default_fields' => $definition['default_fields'],
                'fields' => collect($definition['fields'])
                    ->map(fn (array $field, string $fieldKey) => [
                        'key' => $fieldKey,
                        'label' => $field['label'],
                    ])
                    ->values()
                    ->all(),
            ])
            ->values()
            ->all();
    }

    /**
     * @return list<string>
     */
    public function definitionKeys(): array
    {
        return array_keys(self::DEFINITIONS);
    }

    /**
     * @return array{key: string, label: string, description: string, supports_time_range: bool, default_fields: list<string>, fields: array<string, array{label: string}>}
     */
    public function definition(string $type): array
    {
        if (! isset(self::DEFINITIONS[$type])) {
            throw new \InvalidArgumentException("Unknown feed type [{$type}]");
        }

        return self::DEFINITIONS[$type];
    }

    /**
     * @return list<array{key: string, label: string}>
     */
    public function formatOptions(): array
    {
        return [
            ['key' => 'csv', 'label' => 'CSV'],
            ['key' => 'xml', 'label' => 'XML'],
        ];
    }

    /**
     * @return list<array{value: int, label: string}>
     */
    public function relativeRangeOptions(): array
    {
        return [
            ['value' => 86400, 'label' => 'Posledních 24 hodin'],
            ['value' => 7 * 86400, 'label' => 'Posledních 7 dní'],
            ['value' => 30 * 86400, 'label' => 'Posledních 30 dní'],
            ['value' => 90 * 86400, 'label' => 'Posledních 90 dní'],
        ];
    }

    /**
     * @return list<string>
     */
    public function formatKeys(): array
    {
        return ['csv', 'xml'];
    }

    /**
     * @return list<array{value: int, label: string}>
     */
    public function cacheIntervals(): array
    {
        return [
            ['value' => 300, 'label' => 'Každých 5 minut'],
            ['value' => 900, 'label' => 'Každých 15 minut'],
            ['value' => 3600, 'label' => 'Každou hodinu'],
            ['value' => 14400, 'label' => 'Každé 4 hodiny'],
        ];
    }

    /**
     * @return list<int>
     */
    public function cacheIntervalValues(): array
    {
        return array_column($this->cacheIntervals(), 'value');
    }

    /**
     * @return list<int>
     */
    public function relativeRangeValues(): array
    {
        return array_column($this->relativeRangeOptions(), 'value');
    }

    /**
     * @param  list<string>  $fields
     * @return list<string>
     */
    public function validateFields(string $type, array $fields): array
    {
        $definition = $this->definition($type);
        $allowed = array_keys($definition['fields']);

        $filtered = collect($fields)
            ->filter(fn ($field) => is_string($field) && in_array($field, $allowed, true))
            ->unique()
            ->values()
            ->all();

        if ($filtered === []) {
            throw new \InvalidArgumentException('No valid fields selected for feed export.');
        }

        return $filtered;
    }

    /**
     * @param  list<string>  $fields
     * @return list<array<string, mixed>>
     */
    public function buildFeed(
        string $type,
        array $fields,
        ?CarbonImmutable $from = null,
        ?CarbonImmutable $to = null,
        ?int $shopId = null
    ): array {
        $definition = $this->definition($type);

        if (($definition['supports_time_range'] ?? false) === false && ($from || $to)) {
            $from = null;
            $to = null;
        }

        return match ($type) {
            'customers' => $this->buildCustomersFeed($fields, $from, $to, $shopId),
            'orders' => $this->buildOrdersFeed($fields, $from, $to, $shopId),
            'products' => $this->buildProductsFeed($fields, $shopId),
            default => throw new \InvalidArgumentException("Unsupported feed type [{$type}]"),
        };
    }

    public function render(string $format, string $type, array $fields, array $rows): string
    {
        return match ($format) {
            'csv' => $this->renderCsv($fields, $rows),
            'xml' => $this->renderXml($type, $rows),
            default => throw new \InvalidArgumentException("Unsupported format [{$format}]"),
        };
    }

    /**
     * @param  list<string>  $fields
     * @return list<array<string, mixed>>
     */
    private function buildCustomersFeed(
        array $fields,
        ?CarbonImmutable $from,
        ?CarbonImmutable $to,
        ?int $shopId
    ): array {
        $query = Customer::query()->orderBy('created_at');

        if ($shopId !== null) {
            $query->where('shop_id', $shopId);
        }

        $needsShop = in_array('shop_name', $fields, true) || in_array('shop_domain', $fields, true);
        $needsOrders = $this->needsCustomerOrders($fields) || $from !== null || $to !== null;
        $needsMetrics = $this->needsCustomerMetrics($fields);

        if ($needsShop) {
            $query->with('shop:id,name,domain');
        }

        if ($needsOrders) {
            $query->with(['orders' => function ($orders) use ($from, $to) {
                $orders->select(['id', 'code', 'customer_guid', 'ordered_at', 'created_at']);
                $this->applyOrderDateRange($orders, $from, $to);
            }]);
        }

        if ($needsMetrics) {
            $query->with('metrics');
        }

        if ($from !== null || $to !== null) {
            $query->where(function ($builder) use ($from, $to) {
                $builder->where(function ($inner) use ($from, $to) {
                    if ($from !== null) {
                        $inner->where('created_at', '>=', $from);
                    }

                    if ($to !== null) {
                        $inner->where('created_at', '<=', $to);
                    }
                });

                $builder->orWhereExists(function ($subquery) use ($from, $to) {
                    $subquery->selectRaw('1')
                        ->from('orders')
                        ->whereRaw("orders.customer_guid <> ''")
                        ->whereRaw('orders.customer_guid IS NOT NULL')
                        ->whereRaw('orders.customer_guid::uuid = customers.guid');

                    $this->applyOrderDateRange($subquery, $from, $to);
                });
            });
        }

        return $query
            ->get()
            ->map(fn (Customer $customer) => $this->mapCustomerRow($customer, $fields, $from, $to))
            ->values()
            ->all();
    }

    /**
     * @param  list<string>  $fields
     * @return list<array<string, mixed>>
     */
    private function buildOrdersFeed(
        array $fields,
        ?CarbonImmutable $from,
        ?CarbonImmutable $to,
        ?int $shopId
    ): array {
        $query = Order::query()->orderByRaw('COALESCE(ordered_at, created_at)')->orderBy('created_at');

        if ($shopId !== null) {
            $query->where('shop_id', $shopId);
        }

        if (in_array('shop_name', $fields, true) || in_array('shop_domain', $fields, true)) {
            $query->with('shop:id,name,domain');
        }

        if (in_array('items', $fields, true)) {
            $query->with(['items' => function ($items) {
                $items->select(['id', 'order_id', 'product_guid', 'item_type', 'name', 'variant_name', 'code', 'ean', 'amount', 'amount_unit', 'price_with_vat', 'price_without_vat', 'vat', 'vat_rate', 'data']);
            }]);
        }

        $this->applyOrderDateRange($query, $from, $to);

        return $query
            ->get()
            ->map(fn (Order $order) => $this->mapOrderRow($order, $fields))
            ->values()
            ->all();
    }

    /**
     * @param  list<string>  $fields
     * @return list<array<string, mixed>>
     */
    private function buildProductsFeed(array $fields, ?int $shopId): array
    {
        $query = Product::query()->orderBy('created_at');

        if ($shopId !== null) {
            $query->where('shop_id', $shopId);
        }

        return $this->extractRows($query->get(), $fields);
    }

    /**
     * @param  Collection<int, mixed>  $items
     * @param  list<string>  $fields
     * @return list<array<string, mixed>>
     */
    private function extractRows(Collection $items, array $fields): array
    {
        return $items
            ->map(function ($item) use ($fields) {
                return collect($fields)
                    ->mapWithKeys(function ($field) use ($item) {
                        $value = data_get($item, $field);

                        if ($value instanceof \DateTimeInterface) {
                            $value = CarbonImmutable::parse($value)->toIso8601String();
                        } elseif (is_array($value)) {
                            $value = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                        } elseif (is_bool($value)) {
                            $value = $value ? '1' : '0';
                        }

                        return [$field => $value];
                    })
                    ->all();
            })
            ->values()
            ->all();
    }

    /**
     * @param  list<string>  $fields
     * @param  list<array<string, mixed>>  $rows
     */
    private function renderCsv(array $fields, array $rows): string
    {
        $handle = fopen('php://temp', 'r+');

        if (! $handle) {
            throw new \RuntimeException('Unable to allocate temporary stream.');
        }

        fputcsv($handle, $fields);

        foreach ($rows as $row) {
            $ordered = array_map(
                fn ($field) => $this->stringifyValue(Arr::get($row, $field)),
                $fields
            );
            fputcsv($handle, $ordered);
        }

        rewind($handle);
        $csv = stream_get_contents($handle) ?: '';
        fclose($handle);

        return $csv;
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     */
    private function renderXml(string $type, array $rows): string
    {
        $root = new \SimpleXMLElement('<?xml version="1.0" encoding="UTF-8"?><feed/>');
        $root->addAttribute('type', $type);

        foreach ($rows as $row) {
            $item = $root->addChild('item');
            foreach ($row as $field => $value) {
                $child = $item->addChild(Str::snake($field));
                $this->appendXmlValue($child, $value);
            }
        }

        $xml = $root->asXML();

        return is_string($xml) ? $xml : '';
    }

    private function stringifyValue(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        if (is_scalar($value)) {
            return (string) $value;
        }

        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '';
    }

    private function needsCustomerOrders(array $fields): bool
    {
        return collect($fields)->contains(fn ($field) => in_array($field, ['orders_count', 'order_codes'], true));
    }

    private function needsCustomerMetrics(array $fields): bool
    {
        $metricFields = [
            'orders_count',
            'total_spent',
            'total_spent_base',
            'average_order_value',
            'average_order_value_base',
            'first_order_at',
            'last_order_at',
        ];

        return collect($fields)->contains(fn ($field) => in_array($field, $metricFields, true));
    }

    /**
     * @param  list<string>  $fields
     * @return array<string, mixed>
     */
    private function mapCustomerRow(Customer $customer, array $fields, ?CarbonImmutable $from, ?CarbonImmutable $to): array
    {
        $orders = $customer->relationLoaded('orders') ? $customer->orders : null;
        $metrics = $customer->relationLoaded('metrics') ? $customer->metrics : null;

        $row = [];

        foreach ($fields as $field) {
            switch ($field) {
                case 'shop_name':
                    $row[$field] = $customer->shop?->name;
                    break;
                case 'shop_domain':
                    $row[$field] = $customer->shop?->domain;
                    break;
                case 'orders_count':
                    if ($metrics?->orders_count !== null) {
                        $row[$field] = $metrics->orders_count;
                    } elseif ($orders !== null) {
                        $row[$field] = $orders->count();
                    } else {
                        $row[$field] = $this->countCustomerOrders($customer, $from, $to);
                    }
                    break;
                case 'order_codes':
                    if ($orders !== null) {
                        $codes = $orders->pluck('code')->filter()->values();
                    } else {
                        $codes = $this->customerOrdersQuery($customer, $from, $to)->pluck('code');
                    }

                    $row[$field] = $codes->implode(', ');
                    break;
                case 'total_spent':
                    $row[$field] = $metrics?->total_spent;
                    break;
                case 'total_spent_base':
                    $row[$field] = $metrics?->total_spent_base;
                    break;
                case 'average_order_value':
                    $row[$field] = $metrics?->average_order_value;
                    break;
                case 'average_order_value_base':
                    $row[$field] = $metrics?->average_order_value_base;
                    break;
                case 'first_order_at':
                    $row[$field] = $metrics?->first_order_at?->toIso8601String();
                    break;
                case 'last_order_at':
                    $row[$field] = $metrics?->last_order_at?->toIso8601String();
                    break;
                default:
                    $row[$field] = $this->normalizeValue(data_get($customer, $field));
            }
        }

        return $row;
    }

    /**
     * @param  list<string>  $fields
     * @return array<string, mixed>
     */
    private function mapOrderRow(Order $order, array $fields): array
    {
        $row = [];

        foreach ($fields as $field) {
            switch ($field) {
                case 'shop_name':
                    $row[$field] = $order->shop?->name;
                    break;
                case 'shop_domain':
                    $row[$field] = $order->shop?->domain;
                    break;
                case 'items':
                    $items = $order->relationLoaded('items') ? $order->items : $order->items()->get();
                    $row[$field] = $items->map(fn ($item) => $item->toArray())->all();
                    break;
                default:
                    $row[$field] = $this->normalizeValue(data_get($order, $field));
            }
        }

        return $row;
    }

    private function normalizeValue(mixed $value): mixed
    {
        if ($value instanceof \DateTimeInterface) {
            return CarbonImmutable::parse($value)->toIso8601String();
        }

        if (is_bool($value)) {
            return $value ? '1' : '0';
        }

        if ($value instanceof Collection) {
            return $value->toArray();
        }

        if ($value instanceof \JsonSerializable) {
            return $value->jsonSerialize();
        }

        return $value;
    }

    private function applyOrderDateRange($query, ?CarbonImmutable $from, ?CarbonImmutable $to): void
    {
        if ($from !== null) {
            $query->whereRaw('COALESCE(ordered_at, created_at) >= ?', [$from]);
        }

        if ($to !== null) {
            $query->whereRaw('COALESCE(ordered_at, created_at) <= ?', [$to]);
        }
    }

    private function countCustomerOrders(Customer $customer, ?CarbonImmutable $from, ?CarbonImmutable $to): int
    {
        return $this->customerOrdersQuery($customer, $from, $to)->count();
    }

    private function customerOrdersQuery(Customer $customer, ?CarbonImmutable $from, ?CarbonImmutable $to)
    {
        $query = $customer->orders()->whereNotNull('customer_guid')->where('customer_guid', '<>', '');

        $this->applyOrderDateRange($query, $from, $to);

        return $query;
    }

    private function appendXmlValue(\SimpleXMLElement $node, mixed $value): void
    {
        if (is_array($value)) {
            if ($value === []) {
                $node[0] = '';

                return;
            }

            foreach ($value as $key => $nested) {
                $childName = is_string($key) ? Str::snake((string) $key) : 'item';
                $child = $node->addChild($childName);
                $this->appendXmlValue($child, $nested);
            }

            return;
        }

        if ($value instanceof \DateTimeInterface) {
            $value = CarbonImmutable::parse($value)->toIso8601String();
        }

        if (is_bool($value)) {
            $value = $value ? '1' : '0';
        }

        $node[0] = htmlspecialchars((string) ($value ?? ''), ENT_QUOTES | ENT_XML1);
    }
}
