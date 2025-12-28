<?php

namespace Modules\Orders\Http\Controllers;

use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Modules\Core\Services\CurrencyConverter;
use Modules\Orders\Models\Order;
use Modules\Pim\Models\ProductVariant;
use Modules\Shoptet\Models\Shop;

class OrderController extends Controller
{
    public function __construct(private readonly CurrencyConverter $currencyConverter)
    {
    }

    public function index(Request $request)
    {
        $perPage = (int) $request->integer('per_page', 25);
        $perPage = $perPage > 0 ? min($perPage, 100) : 25;

        $providers = $this->parseProviders($request->input('provider'));
        $ordersQuery = Order::query()
            ->select([
                'id',
                'shop_id',
                'code',
                'guid',
                'customer_guid',
                'status',
                'source',
                'customer_name',
                'customer_email',
                'customer_phone',
                'ordered_at',
                'total_with_vat',
                'total_without_vat',
                'total_vat',
                'total_with_vat_base',
                'total_without_vat_base',
                'total_vat_base',
                'currency_code',
            ])
            ->with(['shop:id,name,is_master,timezone,currency_code,provider'])
            ->when($request->filled('status'), function ($query) use ($request) {
                $statuses = $request->input('status', []);
                $statuses = is_array($statuses) ? $statuses : explode(',', (string) $statuses);
                $statuses = array_filter(array_map(fn ($status) => trim((string) $status), $statuses));

                if ($statuses !== []) {
                    $query->whereIn('status', $statuses);
                }
            })
            ->when(($shopIds = $this->parseIds($request->input('shop_id'))) !== [], function ($query) use ($shopIds) {
                $query->whereIn('shop_id', $shopIds);
            })
            ->when($providers !== [], function ($query) use ($providers) {
                $query->whereHas('shop', function ($shopQuery) use ($providers) {
                    if (Shop::hasProviderColumn()) {
                        $shopQuery->whereIn('provider', $providers);
                    }
                });
            })
            ->when($request->filled('search'), function ($query) use ($request) {
                $term = '%'.trim((string) $request->query('search')).'%';

                $query->where(function ($builder) use ($term) {
                    $builder->where('code', 'like', $term)
                        ->orWhere('customer_email', 'like', $term)
                        ->orWhere('customer_name', 'like', $term)
                        ->orWhere('customer_phone', 'like', $term);
                });
            })
            ->when($request->filled('customer'), function ($query) use ($request) {
                $term = '%'.trim((string) $request->query('customer')).'%';

                $query->where(function ($builder) use ($term) {
                    $builder->where('customer_email', 'like', $term)
                        ->orWhere('customer_name', 'like', $term)
                        ->orWhere('customer_phone', 'like', $term);
                });
            })
            ->when($request->filled('product'), function ($query) use ($request) {
                $term = '%'.trim((string) $request->query('product')).'%';

                $query->whereHas('items', function ($items) use ($term) {
                    $items->where(function ($builder) use ($term) {
                        $builder->where('code', 'like', $term)
                            ->orWhere('name', 'like', $term)
                            ->orWhere('variant_name', 'like', $term);
                    });
                });
            })
            ->when($request->filled('date_from'), function ($query) use ($request) {
                $date = $this->parseDate($request->input('date_from'))->startOfDay();
                $query->where('ordered_at', '>=', $date);
            })
            ->when($request->filled('date_to'), function ($query) use ($request) {
                $date = $this->parseDate($request->input('date_to'))->endOfDay();
                $query->where('ordered_at', '<=', $date);
            });

        [$sortColumn, $sortDirection] = $this->resolveSort(
            $request->string('sort_by')->toString(),
            $request->string('sort_dir')->toString()
        );

        $countQuery = (clone $ordersQuery)->cloneWithout(['orders', 'columns', 'limit', 'offset'])
            ->cloneWithoutBindings(['order', 'select']);

        $orders = (clone $ordersQuery)
            ->orderBy($sortColumn, $sortDirection)
            ->simplePaginate($perPage)
            ->appends($request->query());

        $orders->getCollection()->each(function (Order $order) {
            if ($order->relationLoaded('shop')) {
                $order->setAttribute('shop_provider', $order->shop?->provider);
            }
        });

        $total = $this->resolveTotalCount($request, $countQuery, $shopIds, $providers);

        return response()->json($this->transformPaginator($orders, $total));
    }

    public function show(Order $order)
    {
        $order->load([
            'items',
            'customer.accounts',
            'shop:id,name,is_master,timezone,currency_code',
        ]);

        $variants = collect();

        if ($order->items->isNotEmpty()) {
            $codes = $order->items
                ->pluck('code')
                ->filter()
                ->unique();

            if ($codes->isNotEmpty()) {
                $variants = ProductVariant::query()
                    ->whereIn('code', $codes)
                    ->whereHas('product', fn ($query) => $query->where('shop_id', $order->shop_id))
                    ->pluck('id', 'code');
            }

            $order->items->each(function ($item) use ($variants) {
                if ($item->code && $variants->has($item->code)) {
                    $item->setAttribute('variant_id', $variants->get($item->code));
                }
            });
        }

        return response()->json($order);
    }

    public function filters()
    {
        $statuses = Order::query()
            ->whereNotNull('status')
            ->select('status')
            ->distinct()
            ->orderBy('status')
            ->pluck('status')
            ->filter()
            ->values();

        return response()->json([
            'statuses' => $statuses,
            'base_currency' => $this->currencyConverter->getBaseCurrency(),
        ]);
    }

    private function resolveSort(?string $sortBy, ?string $sortDir): array
    {
        $allowed = [
            'ordered_at' => 'ordered_at',
            'total_with_vat' => 'total_with_vat',
            'status' => 'status',
            'code' => 'code',
            'customer' => 'customer_name',
        ];

        $column = $allowed[$sortBy ?? ''] ?? 'ordered_at';

        $direction = Str::lower($sortDir ?? '') === 'asc' ? 'asc' : 'desc';

        return [$column, $direction];
    }

    private function parseDate(string $value): Carbon
    {
        $appTimezone = config('app.timezone', 'UTC');

        return Carbon::parse($value, $appTimezone)->setTimezone('UTC');
    }

    private function transformPaginator(Paginator $paginator, ?int $total): array
    {
        $data = $paginator->toArray();

        $currentPage = $paginator->currentPage();
        $perPage = $paginator->perPage();
        $hasMore = $paginator->hasMorePages();

        $data['total'] = $total;
        $data['per_page'] = $perPage;
        $data['current_page'] = $currentPage;
        $data['from'] = $data['from'] ?? (($currentPage - 1) * $perPage + 1);
        $data['to'] = $data['to'] ?? ($data['from'] + count($data['data'] ?? []) - 1);

        if ($total !== null) {
            $lastPage = (int) max(1, ceil($total / max(1, $perPage)));
            $data['last_page'] = $lastPage;
            $data['first_page_url'] = $paginator->url(1);
            $data['last_page_url'] = $paginator->url($lastPage);
        } else {
            $data['last_page'] = $currentPage + ($hasMore ? 1 : 0);
            $data['first_page_url'] = $paginator->url(1);
            $data['last_page_url'] = $hasMore ? $paginator->nextPageUrl() : null;
        }

        $data['prev_page_url'] = $paginator->previousPageUrl();
        $data['next_page_url'] = $paginator->nextPageUrl();

        if (! isset($data['links'])) {
            $data['links'] = $this->buildLinks($paginator, $data['last_page']);
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

    private function resolveTotalCount(Request $request, Builder $query, array $shopIds, array $providers): ?int
    {
        $providers = array_values(array_filter($providers, static fn ($value) => is_string($value) && $value !== ''));

        if ($providers !== [] && Shop::hasProviderColumn()) {
            $providerShopIds = Shop::query()
                ->whereIn('provider', $providers)
                ->pluck('id')
                ->all();

            $shopIds = array_values(array_unique(array_merge($shopIds, $providerShopIds)));
        }

        if ($this->usesOnlySourceFilter($request, $providers !== [])) {
            if ($shopIds !== []) {
                $total = (int) Shop::query()->whereIn('id', $shopIds)->sum('orders_total');

                if ($total === 0) {
                    $cacheKey = 'shop:'.implode(',', $shopIds);
                    $total = $this->countWithCache($query, $cacheKey);

                    if (count($shopIds) === 1) {
                        Shop::query()->whereKey($shopIds[0])->update(['orders_total' => $total]);
                    }
                }

                return $total;
            }

            $total = (int) Shop::query()->sum('orders_total');

            if ($total === 0) {
                $total = $this->countWithCache($query, 'all');
            }

            return $total;
        }

        $cacheKey = 'filters:'.md5(json_encode($request->query(), JSON_THROW_ON_ERROR));

        return $this->countWithCache($query, $cacheKey);
    }

    private function usesOnlySourceFilter(Request $request, bool $providerFilterApplied): bool
    {
        $filters = ['status', 'search', 'customer', 'product', 'date_from', 'date_to'];

        foreach ($filters as $filter) {
            if ($request->filled($filter)) {
                return false;
            }
        }

        if ($providerFilterApplied) {
            return true;
        }

        return true;
    }

    private function parseIds(mixed $value): array
    {
        if ($value === null || $value === '') {
            return [];
        }

        $values = is_array($value) ? $value : explode(',', (string) $value);

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

    private function countWithCache(Builder $query, string $cacheKey): int
    {
        return Cache::remember('orders:count:'.$cacheKey, now()->addMinutes(5), function () use ($query) {
            return (int) (clone $query)->count();
        });
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
}
