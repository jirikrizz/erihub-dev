<?php

namespace Modules\Customers\Http\Controllers;

use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Modules\Core\Services\CurrencyConverter;
use Modules\Customers\Models\Customer;
use Modules\Customers\Models\CustomerMetric;
use Modules\Customers\Models\CustomerNote;
use Modules\Customers\Models\CustomerTagRule;
use Modules\Customers\Services\CustomerGroupService;
use Modules\Customers\Services\CustomerProductInsightService;
use Modules\Customers\Support\CustomerTagConfig;
use Modules\Orders\Models\Order;
use Modules\Orders\Support\OrderStatusResolver;
use Illuminate\Support\Str;
use Modules\Shoptet\Models\Shop;
use Throwable;

class CustomerController extends Controller
{
    public function __construct(
        private readonly CurrencyConverter $currencyConverter,
        private readonly OrderStatusResolver $orderStatusResolver,
        private readonly CustomerGroupService $customerGroupService,
        private readonly CustomerProductInsightService $productInsightService
    )
    {
    }

    public function export(Request $request): StreamedResponse
    {
        $data = $request->validate([
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
            'type' => ['nullable', 'in:registered,unregistered,all'],
        ]);

        $shopId = (int) $data['shop_id'];
        $type = $data['type'] ?? 'registered';

        $baseQuery = Customer::query()
            ->where('shop_id', $shopId)
            ->orderBy('id');

        if ($type === 'unregistered') {
            $baseQuery->where('customer_group', CustomerTagConfig::GUEST);
        } elseif ($type === 'registered') {
            $baseQuery->where(function ($query) {
                $query
                    ->whereNull('customer_group')
                    ->orWhere('customer_group', '<>', CustomerTagConfig::GUEST);
            });
        }

        $filename = sprintf(
            'customers_%s_shop_%d_%s.csv',
            $type,
            $shopId,
            now()->format('Ymd_His')
        );

        return response()->streamDownload(function () use ($baseQuery, $shopId) {
            $handle = fopen('php://output', 'w');
            if (! $handle) {
                return;
            }

            // UTF-8 BOM for Excel compatibility
            fwrite($handle, chr(0xEF).chr(0xBB).chr(0xBF));

            fputcsv($handle, [
                'E-mail',
                'Telefon',
                'Jméno',
                'Příjmení',
                'Adresa – ulice',
                'Adresa – číslo popisné',
                'Adresa – město',
                'Adresa – PSČ',
                'Adresa – stát',
                'Objednávky (JSON)',
            ]);

            $baseQuery->chunkById(500, function ($chunk) use ($handle, $shopId) {
                $customerIds = $chunk->pluck('id');
                if ($customerIds->isEmpty()) {
                    return;
                }

                $customers = Customer::query()
                    ->whereIn('id', $customerIds)
                    ->with(['orders' => function ($query) use ($shopId) {
                        $query
                            ->select([
                                'id',
                                'code',
                                'ordered_at',
                                'customer_guid',
                                'shop_id',
                                'status',
                                'total_with_vat',
                                'currency_code',
                            ])
                            ->where('shop_id', $shopId)
                            ->orderBy('ordered_at');
                    }])
                    ->orderBy('id')
                    ->get();

                foreach ($customers as $customer) {
                    $this->appendCustomerPresentation($customer);
                    [$firstName, $lastName] = $this->splitName($customer);
                    $addressFields = $this->extractAddressFields($customer);

                    $ordersPayload = $customer->orders
                        ->map(function ($order) {
                            return [
                                'code' => $order->code,
                                'status' => $order->status,
                                'ordered_at' => $order->ordered_at ? $order->ordered_at->toIso8601String() : null,
                                'total_with_vat' => $order->total_with_vat,
                                'currency' => $order->currency_code,
                            ];
                        })
                        ->filter(fn ($payload) => $payload['code'])
                        ->values()
                        ->all();

                    fputcsv($handle, [
                        $customer->email,
                        $customer->phone,
                        $firstName,
                        $lastName,
                        $addressFields['street'] ?? null,
                        $addressFields['house_number'] ?? null,
                        $addressFields['city'] ?? null,
                        $addressFields['zip'] ?? null,
                        $addressFields['country'] ?? null,
                        json_encode($ordersPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    ]);
                }
            });

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    public function index(Request $request)
    {
        $perPage = (int) $request->integer('per_page', 25);
        $perPage = $perPage > 0 ? min($perPage, 100) : 25;

        $baseQuery = $this->buildBaseQuery($request);
        $filtersBaseQuery = clone $baseQuery;

        $query = $this->buildMetricsQuery($baseQuery, $request, true);

        $sortBy = $request->string('sort_by')->toString() ?: 'last_order_at';
        $sortDir = strtolower($request->string('sort_dir')->toString()) === 'desc' ? 'desc' : 'asc';

        $sortedQuery = (clone $query);

        switch ($sortBy) {
            case 'email':
                $sortedQuery->orderBy('customers.email', $sortDir);
                break;
            case 'orders':
                $sortedQuery->orderByRaw('COALESCE(metrics.orders_count, 0) '.$sortDir);
                break;
            case 'total_spent':
                $sortedQuery->orderByRaw('COALESCE(metrics.total_spent_base, 0) '.$sortDir);
                break;
            case 'average_order_value':
                $sortedQuery->orderByRaw('COALESCE(metrics.average_order_value_base, 0) '.$sortDir);
                break;
            case 'registered_at':
                $sortedQuery->orderBy('customers.created_at_remote', $sortDir);
                break;
            case 'last_order_at':
                $sortedQuery->orderByRaw('metrics.last_order_at '.$sortDir.' NULLS LAST');
                break;
            case 'shop':
                $sortedQuery->orderBy('shops.name', $sortDir);
                break;
            case 'name':
            default:
                $sortedQuery->orderBy('customers.full_name', $sortDir);
                break;
        }

        $countQuery = (clone $query)
            ->cloneWithout(['orders', 'columns', 'limit', 'offset'])
            ->cloneWithoutBindings(['order', 'select']);

        $completedStatuses = $this->orderStatusResolver->completed();
        $problemStatuses = $this->orderStatusResolver->excludedFromCompleted();

        $customers = $sortedQuery
            ->simplePaginate($perPage)
            ->appends($request->query());

        $total = $this->countWithCache(
            $countQuery,
            'customers:'.md5(json_encode($request->query(), JSON_THROW_ON_ERROR))
        );

        $customers->getCollection()->each(function (Customer $customer) use ($completedStatuses, $problemStatuses) {
            $customer->setAttribute('base_currency', $this->currencyConverter->getBaseCurrency());

            $orderProviders = $customer->getAttribute('order_providers');

            if (is_string($orderProviders)) {
                $decoded = json_decode($orderProviders, true);
                $orderProviders = json_last_error() === JSON_ERROR_NONE && is_array($decoded) ? $decoded : [];
            } elseif (! is_array($orderProviders)) {
                $orderProviders = [];
            }

            $orderProviders = collect($orderProviders)
                ->filter(static fn ($value) => is_string($value) && $value !== '')
                ->map(static fn ($value) => strtolower($value))
                ->unique()
                ->values()
                ->all();

            $customer->setAttribute('order_providers', $orderProviders);

            $primaryProvider = $customer->getAttribute('shop_provider') ?? $customer->shop?->provider;

            if (! $primaryProvider && $orderProviders !== []) {
                $primaryProvider = $orderProviders[0];
            }

            $customer->setAttribute('shop_provider', $primaryProvider);

            $ordersCount = (int) ($customer->getAttribute('orders_count') ?? 0);
            $problemOrders = (int) ($customer->getAttribute('problem_orders') ?? 0);
            $customer->setAttribute('problem_orders', $problemOrders);

            $completedOrdersAttr = $customer->getAttribute('completed_orders');
            $completedOrders = ($completedStatuses !== [] && $completedOrdersAttr !== null)
                ? (int) $completedOrdersAttr
                : max($ordersCount - $problemOrders, 0);

            $customer->setAttribute('completed_orders', $completedOrders);
            $customer->setAttribute('first_order_at', $this->formatMetricTimestamp($customer, $customer->getAttribute('first_order_at')));
            $customer->setAttribute('last_order_at', $this->formatMetricTimestamp($customer, $customer->getAttribute('last_order_at')));
            $this->appendCustomerPresentation($customer);
        });

        $payload = $this->transformPaginator($customers, $total);
        $payload['base_currency'] = $this->currencyConverter->getBaseCurrency();

        if ($request->boolean('include_filters')) {
            $payload['filters'] = [
                'countries' => $this->availableCountries($filtersBaseQuery),
                'tags' => $this->tagFilterOptions(),
            ];
        }

        return response()->json($payload);
    }

    public function vip(Request $request)
    {
        $request->merge([
            'is_vip' => true,
            'include_filters' => true,
            // do not include countries for VIP view (expensive DISTINCT over JSONB)
            'include_countries' => false,
        ]);

        return $this->index($request);
    }

    public function listManualTags()
    {
        $rows = DB::table('customers')
            ->selectRaw("DISTINCT TRIM(tag) as label, LOWER(TRIM(tag)) as value")
            ->crossJoin(DB::raw("jsonb_array_elements_text(COALESCE((customers.data->'tags')::jsonb, '[]'::jsonb)) as tag"))
            ->whereRaw("TRIM(tag) <> ''")
            ->orderBy('label')
            ->limit(200)
            ->get()
            ->map(fn ($row) => [
                'value' => $row->value,
                'label' => $row->label,
                'type' => 'manual',
            ]);

        return response()->json(['data' => $rows]);
    }

    public function stats(Request $request)
    {
        $baseQuery = $this->buildBaseQuery($request);
        $query = $this->buildMetricsQuery($baseQuery, $request, false);

        $totals = (clone $query)
            ->selectRaw('COUNT(*) as total_count')
            ->selectRaw('SUM(COALESCE(metrics.orders_count, 0)) as orders_sum')
            ->selectRaw('AVG(COALESCE(metrics.orders_count, 0)) as orders_avg')
            ->selectRaw('SUM(COALESCE(metrics.total_spent_base, 0)) as clv_sum')
            ->selectRaw('AVG(COALESCE(metrics.total_spent_base, 0)) as clv_avg')
            ->selectRaw('SUM(COALESCE(metrics.average_order_value_base, 0)) as aov_sum')
            ->selectRaw('AVG(COALESCE(metrics.average_order_value_base, 0)) as aov_avg')
            ->first();

        return response()->json([
            'total_count' => (int) ($totals?->total_count ?? 0),
            'orders_sum' => (float) ($totals?->orders_sum ?? 0),
            'orders_avg' => (float) ($totals?->orders_avg ?? 0),
            'clv_sum' => (float) ($totals?->clv_sum ?? 0),
            'clv_avg' => (float) ($totals?->clv_avg ?? 0),
            'aov_sum' => (float) ($totals?->aov_sum ?? 0),
            'aov_avg' => (float) ($totals?->aov_avg ?? 0),
        ]);
    }

    private function buildBaseQuery(Request $request): Builder
    {
        $baseQuery = Customer::query();

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $baseQuery->where(function ($builder) use ($search) {
                $term = '%'.$search.'%';
                $builder->where('customers.full_name', 'like', $term)
                    ->orWhere('customers.email', 'like', $term)
                    ->orWhere('customers.phone', 'like', $term);
            });
        }

        $isVipParam = $request->input('is_vip');
        if ($isVipParam !== null && $isVipParam !== '') {
            $isVip = filter_var($isVipParam, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($isVip !== null) {
                $baseQuery->where('customers.is_vip', $isVip);
            }
        }

        $providers = $this->parseProviders($request->input('provider'));
        $selectedShopIds = $this->parseIds($request->input('shop_id'));
        $providerShopIds = [];

        if ($providers !== [] && Shop::hasProviderColumn()) {
            $providerShopIds = Shop::query()
                ->whereIn('provider', $providers)
                ->pluck('id')
                ->map(static fn ($id) => (int) $id)
                ->all();
        }

        if ($selectedShopIds !== []) {
            $baseQuery->where(function (Builder $query) use ($selectedShopIds) {
                $query->whereIn('customers.shop_id', $selectedShopIds)
                    ->orWhereExists(function ($subQuery) use ($selectedShopIds) {
                        $subQuery
                            ->selectRaw('1')
                            ->from('orders')
                            ->whereIn('orders.shop_id', $selectedShopIds)
                            ->whereRaw('orders.customer_guid::text = customers.guid::text');
                    });
            });
        }

        if ($providers !== []) {
            $baseQuery->where(function (Builder $query) use ($providers, $providerShopIds) {
                if ($providerShopIds !== []) {
                    $query->whereIn('customers.shop_id', $providerShopIds);
                }

                $query->orWhereExists(function ($subQuery) use ($providers, $providerShopIds) {
                    $subQuery->selectRaw('1')
                        ->from('orders')
                        ->join('shops as order_shops', 'order_shops.id', '=', 'orders.shop_id')
                        ->whereRaw('orders.customer_guid::text = customers.guid::text');

                    if ($providerShopIds !== []) {
                        $subQuery->whereIn('orders.shop_id', $providerShopIds);
                    } else {
                        $subQuery->whereIn('order_shops.provider', $providers);
                    }
                });
            });
        }

        $tagKeys = $this->parseTags($request->input('tag'));
        if ($tagKeys !== []) {
            $mode = strtolower((string) $request->input('tag_mode', 'any')) === 'all' ? 'all' : 'any';
            $tagKeys = array_values(array_unique($tagKeys));

            if ($mode === 'all') {
                foreach ($tagKeys as $tagKey) {
                    $baseQuery->where(function (Builder $builder) use ($tagKey) {
                        $this->applyTagFilter($builder, $tagKey);
                    });
                }
            } else {
                $baseQuery->where(function (Builder $builder) use ($tagKeys) {
                    foreach ($tagKeys as $tagKey) {
                        $builder->orWhere(function (Builder $inner) use ($tagKey) {
                            $this->applyTagFilter($inner, $tagKey);
            if ($request->boolean('include_countries', true)) {
                $filters['countries'] = $this->availableCountries($filtersBaseQuery);
            }
                        });
                    }
                });
            }
        }

        if (! $request->boolean('include_hidden')) {
            $this->excludeCustomersWithHiddenManualTags($baseQuery, $tagKeys);
        }

        if ($request->filled('registered_from')) {
            $baseQuery->where('customers.created_at_remote', '>=', $request->date('registered_from')->startOfDay());
        }

        if ($request->filled('registered_to')) {
            $baseQuery->where('customers.created_at_remote', '<=', $request->date('registered_to')->endOfDay());
        }

        if ($request->filled('country')) {
            $countries = array_filter(array_map(
                fn ($value) => $this->normalizeCountry($value),
                Arr::wrap($request->input('country'))
            ));

            if ($countries !== []) {
                $baseQuery->where(function (Builder $builder) use ($countries) {
                    foreach ($countries as $country) {
                        $builder->orWhereRaw(
                            "UPPER(COALESCE(
                                customers.billing_address->>'country',
                                customers.billing_address->>'countryCode',
                                customers.billing_address->>'country_code',
                                customers.billing_address->>'countryName'
                            )) = ?",
                            [$country]
                        );
                    }
                });
            }
        }

        return $baseQuery;
    }

    private function excludeCustomersWithHiddenManualTags(Builder $query, array $allowedTagKeys = []): void
    {
        $normalizedAllowed = array_values(array_filter(
            array_map(fn ($tag) => $this->normalizeBadgeValue(is_string($tag) ? $tag : null), $allowedTagKeys),
            static fn ($value) => $value !== null
        ));

        $extraSql = '';
        $bindings = [];

        if ($normalizedAllowed !== []) {
            $placeholders = implode(', ', array_fill(0, count($normalizedAllowed), '?'));
            $extraSql = " AND LOWER(TRIM(customer_tags.name)) NOT IN ({$placeholders})";
            $bindings = $normalizedAllowed;
        }

        $query->whereRaw(
            "NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(COALESCE((customers.data->'tags')::jsonb, '[]'::jsonb)) AS customer_tag
                JOIN customer_tags ON LOWER(TRIM(customer_tags.name)) = LOWER(TRIM(customer_tag))
                WHERE customer_tags.is_hidden = true{$extraSql}
            )",
            $bindings
        );
    }

    private function buildMetricsQuery(Builder $baseQuery, Request $request, bool $includeSelects = true): Builder
    {
        $completedStatuses = $this->orderStatusResolver->completed();
        $problemStatuses = $this->orderStatusResolver->excludedFromCompleted();
        $problemStatusSql = $this->buildStatusList($problemStatuses);
        $completedStatusSql = $this->buildStatusList($completedStatuses);

        $problemSelect = $problemStatusSql
            ? "(SELECT COUNT(*) FROM orders WHERE orders.customer_guid::text = customers.guid::text AND orders.status IN ({$problemStatusSql}))"
            : '0';

        $completedSelect = $completedStatusSql
            ? "(SELECT COUNT(*) FROM orders WHERE orders.customer_guid::text = customers.guid::text AND orders.status IN ({$completedStatusSql}))"
            : 'NULL';

        $query = (clone $baseQuery);

        if ($includeSelects) {
            $query->select('customers.*')
                ->addSelect(DB::raw('COALESCE(metrics.orders_count, 0) AS orders_count'))
                ->addSelect(DB::raw('COALESCE(metrics.total_spent, 0) AS total_spent'))
                ->addSelect(DB::raw('COALESCE(metrics.total_spent_base, 0) AS total_spent_base'))
                ->addSelect(DB::raw('COALESCE(metrics.average_order_value, 0) AS average_order_value'))
                ->addSelect(DB::raw('COALESCE(metrics.average_order_value_base, 0) AS average_order_value_base'))
                ->addSelect(DB::raw('metrics.first_order_at AS first_order_at'))
                ->addSelect(DB::raw('metrics.last_order_at AS last_order_at'))
                ->addSelect(DB::raw("{$problemSelect} AS problem_orders"))
                ->addSelect(DB::raw("{$completedSelect} AS completed_orders"))
                ->addSelect(DB::raw('shops.provider AS shop_provider'))
                ->addSelect(DB::raw("COALESCE((SELECT json_agg(DISTINCT order_shops.provider) FROM orders JOIN shops AS order_shops ON order_shops.id = orders.shop_id WHERE orders.customer_guid::text = customers.guid::text), '[]'::json) AS order_providers"));
        }

        $query->leftJoin('customer_metrics as metrics', 'metrics.customer_guid', '=', 'customers.guid')
            ->leftJoin('shops', 'shops.id', '=', 'customers.shop_id');

        if ($request->filled('orders_min')) {
            $query->whereRaw('COALESCE(metrics.orders_count, 0) >= ?', [(int) $request->input('orders_min')]);
        }

        if ($request->filled('orders_max')) {
            $query->whereRaw('COALESCE(metrics.orders_count, 0) <= ?', [(int) $request->input('orders_max')]);
        }

        if ($request->filled('aov_min')) {
            $query->whereRaw('COALESCE(metrics.average_order_value_base, 0) >= ?', [(float) $request->input('aov_min')]);
        }

        if ($request->filled('aov_max')) {
            $query->whereRaw('COALESCE(metrics.average_order_value_base, 0) <= ?', [(float) $request->input('aov_max')]);
        }

        if ($request->filled('clv_min')) {
            $query->whereRaw('COALESCE(metrics.total_spent_base, 0) >= ?', [(float) $request->input('clv_min')]);
        }

        if ($request->filled('clv_max')) {
            $query->whereRaw('COALESCE(metrics.total_spent_base, 0) <= ?', [(float) $request->input('clv_max')]);
        }

        if ($request->filled('last_order_from')) {
            $query->where('metrics.last_order_at', '>=', $request->date('last_order_from')->startOfDay());
        }

        if ($request->filled('last_order_to')) {
            $query->where('metrics.last_order_at', '<=', $request->date('last_order_to')->endOfDay());
        }

        if ($request->boolean('only_without_orders')) {
            $query->whereNull('metrics.last_order_at');
        } elseif ($request->boolean('exclude_without_orders')) {
            $query->whereNotNull('metrics.last_order_at');
        }

        return $query;
    }

    private function appendCustomerPresentation(Customer $customer): void
    {
        $groupKey = $customer->customer_group ?? CustomerTagConfig::REGISTERED;

        $customer->setAttribute('group_key', $groupKey);
        $customer->setAttribute('group_label', $this->customerGroupService->labelFor($groupKey));
        $customer->setAttribute('tags', $this->extractManualTags($customer));
        $customer->setAttribute('tag_badges', $this->presentCustomerBadges($customer));
    }

    private function extractManualTags(Customer $customer): array
    {
        $data = $customer->data ?? [];
        $tags = Arr::get($data, 'tags', []);

        if (! is_array($tags)) {
            return [];
        }

        $sanitized = array_values(array_filter(array_map(static function ($tag) {
            if (! is_string($tag)) {
                return null;
            }

            $trimmed = trim($tag);
            return $trimmed === '' ? null : $trimmed;
        }, $tags), static fn ($tag) => $tag !== null));

        return array_values(array_unique($sanitized));
    }

    private function presentCustomerBadges(Customer $customer): array
    {
        $data = $customer->data ?? [];
        $tags = Arr::get($data, 'tags', []);

        if (! is_array($tags)) {
            $tags = [];
        }

        $map = $this->badgeKeyMap();
        $standardKeys = [
            CustomerTagConfig::REGISTERED,
            CustomerTagConfig::GUEST,
            CustomerTagConfig::COMPANY,
            CustomerTagConfig::VIP,
        ];

        $autoTags = collect(Arr::get($data, 'auto_tags', []))
            ->filter(fn ($tag) => is_array($tag))
            ->map(function (array $tag) {
                $label = isset($tag['label']) ? trim((string) $tag['label']) : '';
                if ($label === '') {
                    return null;
                }

                $key = isset($tag['key']) && (string) $tag['key'] !== ''
                    ? (string) $tag['key']
                    : 'auto:'.Str::slug($label, '-');

                return [
                    'key' => $key,
                    'label' => $label,
                    'color' => isset($tag['color']) && (string) $tag['color'] !== '' ? (string) $tag['color'] : 'gray',
                    'source_rule_id' => isset($tag['source_rule_id']) && (string) $tag['source_rule_id'] !== '' ? (string) $tag['source_rule_id'] : null,
                    'source_rule_name' => isset($tag['source_rule_name']) && (string) $tag['source_rule_name'] !== '' ? (string) $tag['source_rule_name'] : null,
                    'normalized' => $this->normalizeBadgeValue($label),
                ];
            })
            ->filter()
            ->keyBy(fn ($tag) => $tag['normalized'] ?? $tag['key']);

        $badges = [];
        $seenKeys = [];

        foreach ($tags as $tag) {
            if (! is_string($tag)) {
                continue;
            }

            $label = trim($tag);
            if ($label === '') {
                continue;
            }

            $normalized = $this->normalizeBadgeValue($label);
            $key = null;
            $type = 'custom';
            $color = null;
            $source = null;

            if ($normalized !== null && isset($map[$normalized])) {
                $key = $map[$normalized];
                $type = in_array($key, $standardKeys, true) ? 'standard' : 'custom';
            } elseif ($normalized !== null && $autoTags->has($normalized)) {
                $auto = $autoTags->get($normalized);
                $key = $auto['key'];
                $type = 'automatic';
                $color = $auto['color'];
                $source = [
                    'rule_id' => $auto['source_rule_id'],
                    'rule_name' => $auto['source_rule_name'],
                ];
            } else {
                $key = 'custom:'.Str::slug($label, '-');
                if ($key === 'custom:') {
                    $key = 'custom';
                }
            }

            if (isset($seenKeys[$key])) {
                continue;
            }

            $seenKeys[$key] = true;

            $badges[] = [
                'key' => $key,
                'label' => $label,
                'type' => $type,
                'color' => $color,
                'source' => $source,
            ];
        }

        foreach ($autoTags as $auto) {
            $key = $auto['key'];
            if (isset($seenKeys[$key])) {
                continue;
            }

            $seenKeys[$key] = true;

            $badges[] = [
                'key' => $key,
                'label' => $auto['label'],
                'type' => 'automatic',
                'color' => $auto['color'],
                'source' => [
                    'rule_id' => $auto['source_rule_id'],
                    'rule_name' => $auto['source_rule_name'],
                ],
            ];
        }

        if ($badges === []) {
            $groupKey = $customer->customer_group ?? CustomerTagConfig::REGISTERED;
            $badges[] = [
                'key' => $groupKey,
                'label' => $this->customerGroupService->labelFor($groupKey),
                'type' => 'standard',
                'color' => null,
                'source' => null,
            ];
        }

        return array_values($badges);
    }

    /**
     * @return array<string, string>
     */
    private function badgeKeyMap(): array
    {
        $map = [];

        foreach ($this->customerGroupService->labels() as $key => $label) {
            $normalized = $this->normalizeBadgeValue($label);
            if ($normalized !== null) {
                $map[$normalized] = $key;
            }
        }

        foreach ($this->customerGroupService->aliases() as $key => $aliases) {
            foreach ($aliases as $alias) {
                $normalized = $this->normalizeBadgeValue($alias);
                if ($normalized !== null) {
                    $map[$normalized] = $key;
                }
            }
        }

        return $map;
    }

    private function tagFilterOptions(): array
    {
        $labels = $this->customerGroupService->labels();

        $options = [
            [
                'value' => CustomerTagConfig::REGISTERED,
                'label' => $labels[CustomerTagConfig::REGISTERED] ?? 'Registrovaný',
                'type' => 'standard',
            ],
            [
                'value' => CustomerTagConfig::GUEST,
                'label' => $labels[CustomerTagConfig::GUEST] ?? 'Neregistrovaný',
                'type' => 'standard',
            ],
            [
                'value' => CustomerTagConfig::COMPANY,
                'label' => $labels[CustomerTagConfig::COMPANY] ?? 'Firma',
                'type' => 'standard',
            ],
            [
                'value' => CustomerTagConfig::VIP,
                'label' => $labels[CustomerTagConfig::VIP] ?? 'VIP',
                'type' => 'standard',
            ],
        ];

        CustomerTagRule::query()
            ->where('is_active', true)
            ->orderBy('label')
            ->get(['tag_key', 'label'])
            ->each(function (CustomerTagRule $rule) use (&$options) {
                $tagKey = strtolower($rule->tag_key);

                $options[] = [
                    'value' => $tagKey,
                    'label' => $rule->label,
                    'type' => 'automatic',
                ];
            });

        $manualTags = DB::table('customers')
            ->selectRaw("DISTINCT TRIM(tag) as label, LOWER(TRIM(tag)) as value")
            ->crossJoin(DB::raw("jsonb_array_elements_text(COALESCE((customers.data->'tags')::jsonb, '[]'::jsonb)) as tag"))
            ->whereRaw("TRIM(tag) <> ''")
            ->orderBy('label')
            ->limit(200)
            ->get();

        foreach ($manualTags as $tag) {
            $options[] = [
                'value' => $tag->value,
                'label' => $tag->label,
                'type' => 'manual',
            ];
        }

        return $options;
    }

    private function normalizeBadgeValue(?string $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $value = trim(mb_strtolower($value));

        return $value === '' ? null : $value;
    }

    private function transformPaginator(Paginator $paginator, int $total): array
    {
        $data = $paginator->toArray();

        $currentPage = $paginator->currentPage();
        $perPage = $paginator->perPage();
        $hasMore = $paginator->hasMorePages();

        $data['total'] = $total;
        $data['per_page'] = $perPage;
        $data['current_page'] = $currentPage;
        $data['from'] = $data['from'] ?? (($currentPage - 1) * $perPage + 1);
        $data['to'] = $data['from'] + count($data['data'] ?? []) - 1;

        $lastPage = $total > 0 ? (int) max(1, ceil($total / max(1, $perPage))) : ($currentPage + ($hasMore ? 1 : 0));

        $data['last_page'] = $lastPage;
        $data['first_page_url'] = $paginator->url(1);
        $data['last_page_url'] = $hasMore ? $paginator->nextPageUrl() : $paginator->url($lastPage);
        $data['prev_page_url'] = $paginator->previousPageUrl();
        $data['next_page_url'] = $paginator->nextPageUrl();

        if (! isset($data['links'])) {
            $data['links'] = $this->buildLinks($paginator, $lastPage);
        }

        return $data;
    }

    private function buildLinks(Paginator $paginator, int $lastPage): array
    {
        $current = $paginator->currentPage();
        $links = [];

        $links[] = [
            'url' => $paginator->previousPageUrl(),
            'label' => '&laquo; Previous',
            'active' => false,
        ];

        $start = max(1, $current - 2);
        $end = min(max($start + 4, $current + 2), $lastPage);
        $start = max(1, $end - 4);

        for ($page = $start; $page <= $end; $page++) {
            $links[] = [
                'url' => $paginator->url($page),
                'label' => (string) $page,
                'active' => $page === $current,
            ];
        }

        $links[] = [
            'url' => $paginator->nextPageUrl(),
            'label' => 'Next &raquo;',
            'active' => false,
        ];

        return $links;
    }

    private function countWithCache(Builder $query, string $cacheKey): int
    {
        return Cache::remember('customers:count:'.$cacheKey, now()->addMinutes(5), function () use ($query) {
            return (int) (clone $query)->count();
        });
    }

    private function availableCountries(Builder $query): array
    {
        $countryExpression = "COALESCE(
            NULLIF(customers.billing_address->>'country', ''),
            NULLIF(customers.billing_address->>'countryCode', ''),
            NULLIF(customers.billing_address->>'country_code', ''),
            NULLIF(customers.billing_address->>'countryName', '')
        )";

        return (clone $query)
            ->selectRaw("DISTINCT {$countryExpression} AS country")
            ->whereRaw("{$countryExpression} IS NOT NULL")
            ->orderBy('country')
            ->pluck('country')
            ->map(fn ($value) => $this->normalizeCountry(is_string($value) ? $value : null))
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    private function normalizeCountry(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $normalized = Str::upper(trim($value));

        return $normalized === '' ? null : $normalized;
    }

    private function parseIds(mixed $value): array
    {
        if ($value === null || $value === '') {
            return [];
        }

        $values = Arr::wrap($value);

        return array_values(array_filter(array_map(function ($item) {
            if (is_numeric($item)) {
                return (int) $item;
            }

            if (is_string($item) && ctype_digit($item)) {
                return (int) $item;
            }

            return null;
        }, $values), static fn ($id) => $id !== null));
    }

    private function parseProviders(mixed $value): array
    {
        if ($value === null || $value === '') {
            return [];
        }

        $values = is_array($value) ? $value : explode(',', (string) $value);

        return array_values(array_filter(array_map(function ($item) {
            if (! is_string($item)) {
                return null;
            }

            $trimmed = strtolower(trim($item));

            return $trimmed !== '' ? $trimmed : null;
        }, $values), static fn ($provider) => $provider !== null));
    }

    private function parseTags(mixed $value): array
    {
        if ($value === null || $value === '') {
            return [];
        }

        $values = is_array($value) ? $value : explode(',', (string) $value);

        return array_values(array_filter(array_map(function ($item) {
            if (! is_string($item)) {
                return null;
            }

            $normalized = strtolower(trim($item));

            return $normalized !== '' ? $normalized : null;
        }, $values), static fn ($tag) => $tag !== null));
    }

    private function applyTagFilter(Builder $query, string $tagKey): void
    {
        $tagKey = strtolower(trim($tagKey));

        $standardHandlers = [
            CustomerTagConfig::REGISTERED => fn (Builder $builder) => $builder->where('customers.customer_group', CustomerTagConfig::REGISTERED),
            CustomerTagConfig::GUEST => fn (Builder $builder) => $builder->where('customers.customer_group', CustomerTagConfig::GUEST),
            CustomerTagConfig::COMPANY => fn (Builder $builder) => $builder->where('customers.customer_group', CustomerTagConfig::COMPANY),
            CustomerTagConfig::VIP => fn (Builder $builder) => $builder->where('customers.is_vip', true),
        ];

        if (isset($standardHandlers[$tagKey])) {
            $standardHandlers[$tagKey]($query);

            return;
        }

        $query->where(function (Builder $builder) use ($tagKey) {
            $builder->whereRaw(
                "EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE((customers.data->'auto_tags')::jsonb, '[]'::jsonb)) AS tag WHERE tag->>'key' = ?)",
                [$tagKey]
            )->orWhereRaw(
                "EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE((customers.data->'tags')::jsonb, '[]'::jsonb)) AS tag WHERE LOWER(TRIM(tag)) = ?)",
                [$tagKey]
            );
        });
    }

    public function show(Customer $customer)
    {
        return $this->respondWithCustomer($customer);
    }

    public function showByGuid(string $guid)
    {
        $customer = Customer::query()->where('guid', $guid)->firstOrFail();

        return $this->respondWithCustomer($customer);
    }

    public function showByEmail(Request $request)
    {
        $email = trim(mb_strtolower($request->query('email', '')));

        if ($email === '') {
            abort(404, 'Customer not found.');
        }

        $customer = Customer::query()
            ->whereRaw('LOWER(email) = ?', [$email])
            ->orderBy('created_at', 'desc')
            ->first();

        if (! $customer) {
            abort(404, 'Customer not found.');
        }

        return $this->respondWithCustomer($customer);
    }

    private function respondWithCustomer(Customer $customer)
    {
        $customer->load([
            'accounts',
            'orders' => fn ($query) => $query
                ->with(['items', 'shop:id,timezone'])
                ->orderByDesc('ordered_at')
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->limit(75),
            'shop:id,name,domain,locale,is_master,timezone',
            'internalNotes' => fn ($query) => $query
                ->with('user')
                ->orderByDesc('created_at')
                ->limit(50),
        ]);

        $this->attachOrderMetrics($customer);
        $this->appendCustomerPresentation($customer);

        $customer->setAttribute('notes_history', $customer->internalNotes->map(fn (CustomerNote $note) => [
            'id' => $note->id,
            'note' => $note->note,
            'user' => [
                'id' => $note->user_id,
                'name' => $note->user?->name ?? $note->user_name,
            ],
            'created_at' => $note->created_at,
        ]));
        $customer->makeHidden(['internalNotes']);

        $customer->setAttribute('product_insights', $this->productInsightService->summarize($customer));

        return response()->json($customer);
    }

    public function update(Request $request, Customer $customer)
    {
        $data = $request->validate([
            'notes' => ['nullable', 'string'],
            'is_vip' => ['nullable', 'boolean'],
            'tags' => ['nullable', 'array'],
            'tags.*' => ['nullable', 'string'],
        ]);

        $updates = [
            'notes' => $data['notes'] ?? null,
        ];

        if ($request->has('is_vip')) {
            $updates['is_vip'] = $request->boolean('is_vip');
        }

        $customer->fill($updates);

        if (array_key_exists('tags', $data)) {
            $manualTags = array_values(array_filter(array_map(static function ($tag) {
                if (! is_string($tag)) {
                    return null;
                }

                $trimmed = trim($tag);
                return $trimmed === '' ? null : $trimmed;
            }, $data['tags'] ?? []), static fn ($tag) => $tag !== null));

            $existingData = $customer->data ?? [];
            $existingData['tags'] = array_values(array_unique($manualTags));
            $customer->data = $existingData;
        }
        $this->customerGroupService->apply($customer, [
            'is_guest' => $customer->customer_group === CustomerTagConfig::GUEST,
            'billing_address' => $customer->billing_address ?? [],
            'delivery_addresses' => $customer->delivery_addresses ?? [],
            'source_group' => Arr::get($customer->data ?? [], 'customerGroup.name'),
        ]);

        $customer->save();

        $customer->load([
            'accounts',
            'orders' => fn ($query) => $query
                ->with(['items', 'shop:id,timezone'])
                ->orderByDesc('ordered_at')
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->limit(75),
            'internalNotes' => fn ($query) => $query
                ->with('user')
                ->orderByDesc('created_at')
                ->limit(50),
            'shop:id,name,domain,locale,is_master,timezone',
        ]);

        $this->attachOrderMetrics($customer);
        $this->appendCustomerPresentation($customer);

        $customer->setAttribute('notes_history', $customer->internalNotes->map(fn (CustomerNote $note) => [
            'id' => $note->id,
            'note' => $note->note,
            'user' => [
                'id' => $note->user_id,
                'name' => $note->user?->name ?? $note->user_name,
            ],
            'created_at' => $note->created_at,
        ]));
        $customer->makeHidden(['internalNotes']);

        return response()->json($customer);
    }

    private function splitName(Customer $customer): array
    {
        $fullName = $customer->full_name
            ?? Arr::get($customer->billing_address, 'fullName')
            ?? Arr::get($customer->delivery_addresses, '0.fullName');

        if (! $fullName) {
            $first = Arr::get($customer->billing_address, 'firstName')
                ?? Arr::get($customer->delivery_addresses, '0.firstName');
            $last = Arr::get($customer->billing_address, 'lastName')
                ?? Arr::get($customer->delivery_addresses, '0.lastName');

            return [$first, $last];
        }

        $parts = preg_split('/\s+/u', trim($fullName)) ?: [];

        if (count($parts) <= 1) {
            return [$parts[0] ?? $fullName, null];
        }

        $last = array_pop($parts);
        $first = implode(' ', $parts);

        return [$first, $last];
    }

    private function extractAddressFields(Customer $customer): array
    {
        $address = $customer->billing_address;
        if (! is_array($address) || $address === []) {
            $delivery = $customer->delivery_addresses;
            if (is_array($delivery) && $delivery !== []) {
                $candidate = $delivery[0] ?? [];
                if (is_array($candidate)) {
                    $address = $candidate;
                }
            }
        }

        if (! is_array($address) || $address === []) {
            return [];
        }

        return [
            'street' => $address['street'] ?? $address['street1'] ?? null,
            'house_number' => $address['houseNumber'] ?? $address['house_number'] ?? null,
            'city' => $address['city'] ?? $address['town'] ?? null,
            'zip' => $address['zip'] ?? $address['postalCode'] ?? null,
            'country' => $address['country'] ?? $address['countryCode'] ?? null,
        ];
    }

    public function storeNote(Request $request, Customer $customer)
    {
        $data = $request->validate([
            'note' => ['required', 'string'],
        ]);

        $user = $request->user();

        if (! $user) {
            abort(403, 'Unauthenticated');
        }

        $note = $customer->internalNotes()->create([
            'note' => $data['note'],
            'user_id' => $user->getKey(),
            'user_name' => $user->name,
        ]);

        $customer->notes = $data['note'];
        $customer->save();

        return response()->json([
            'id' => $note->id,
            'note' => $note->note,
            'user' => [
                'id' => $note->user_id,
                'name' => $note->user?->name ?? $note->user_name,
            ],
            'created_at' => $note->created_at,
        ], 201);
    }

    private function attachOrderMetrics(Customer $customer): void
    {
        /** @var CustomerMetric|null $metrics */
        $metrics = CustomerMetric::query()->find($customer->guid);

        $customer->setAttribute('orders_count', (int) ($metrics?->orders_count ?? 0));
        $customer->setAttribute('total_spent', (float) ($metrics?->total_spent ?? 0.0));
        $customer->setAttribute('total_spent_base', (float) ($metrics?->total_spent_base ?? 0.0));
        $customer->setAttribute('average_order_value', (float) ($metrics?->average_order_value ?? 0.0));
        $customer->setAttribute('average_order_value_base', (float) ($metrics?->average_order_value_base ?? 0.0));
        $customer->setAttribute('first_order_at', $this->formatMetricTimestamp($customer, $metrics?->first_order_at));
        $customer->setAttribute('last_order_at', $this->formatMetricTimestamp($customer, $metrics?->last_order_at));
        $customer->setAttribute('base_currency', $this->currencyConverter->getBaseCurrency());

        $problemOrders = $this->countOrdersWithStatuses($customer->guid, $this->orderStatusResolver->excludedFromCompleted());
        $customer->setAttribute('problem_orders', $problemOrders);

        $completedStatuses = $this->orderStatusResolver->completed();
        if ($completedStatuses !== []) {
            $completedOrders = $this->countOrdersWithStatuses($customer->guid, $completedStatuses);
        } else {
            $completedOrders = max((int) ($metrics?->orders_count ?? 0) - $problemOrders, 0);
        }

        $customer->setAttribute('completed_orders', $completedOrders);
    }

    private function countOrdersWithStatuses(string $customerGuid, array $statuses): int
    {
        if ($statuses === []) {
            return 0;
        }

        return Order::query()
            ->where('customer_guid', $customerGuid)
            ->whereIn('status', $statuses)
            ->count();
    }

    private function buildStatusList(array $statuses): ?string
    {
        if ($statuses === []) {
            return null;
        }

        $pdo = DB::getPdo();

        return implode(', ', array_map(static fn (string $status) => $pdo->quote($status), $statuses));
    }

    private function formatMetricTimestamp(Customer $customer, mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        try {
            if ($value instanceof \DateTimeInterface) {
                $timestamp = Carbon::createFromInterface($value);
            } else {
                $timestamp = Carbon::parse((string) $value);
            }
        } catch (Throwable) {
            return null;
        }

        $timezone = $customer->shop?->timezone ?: config('app.timezone', 'UTC');

        return $timestamp->setTimezone($timezone)->toIso8601String();
    }
}
