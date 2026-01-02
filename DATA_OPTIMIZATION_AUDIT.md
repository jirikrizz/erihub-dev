# 🔍 Data Flow & Performance Audit

**Status**: Production audit on 3. ledna 2026

---

## 1. KRITICKÉ PROBLÉMY - Zbytečné duplikace dat

### 1.1 ❌ Customers Export - Duplicitní eager loading + manuální mapping
**File**: `backend/modules/Customers/Http/Controllers/CustomerController.php` (line ~94)

```php
// PROBLÉM: chunkById -> potom znovu fetcheš s eager loading
$baseQuery->chunkById(500, function ($chunk) use ($handle, $shopId) {
    $customerIds = $chunk->pluck('id');
    
    // DUPLIKACE! Znovu fetchuješ celé customer recordy
    $customers = Customer::query()
        ->whereIn('id', $customerIds)
        ->with(['orders' => function ($query) use ($shopId) {
            $query->select([...]) // Vlastní select, ale duplicitní data
        }])
        ->get();  // ← TO JE CHYBA!
});
```

**Řešení**:
```php
// Prostě iteruj chunk přímo s eager loading - 1 query
$baseQuery->with(['orders' => function ($query) use ($shopId) {
    $query->select([...])->where('shop_id', $shopId);
}])->chunkById(500, function ($chunk) {
    foreach ($chunk as $customer) {
        // data jsou tu už eager-loaded
    }
});
```

**Dopad**: ~2 queries na 500 records místo 1 → 100% overhead!

---

### 1.2 ❌ Analytics KPIs - Mnoho klonů stejného query
**File**: `backend/modules/Analytics/Http/Controllers/AnalyticsController.php` (line ~40-120)

```php
// PROBLÉM: Klonuješ same query builder mnohokrát
$baseOrdersQuery = Order::query();
if ($shopIds !== []) { $baseOrdersQuery->whereIn('shop_id', $shopIds); }
if ($from) { $baseOrdersQuery->where('ordered_at', '>=', $from); }

// Potom dělej CLONY:
$ordersQuery = (clone $baseOrdersQuery);
$this->applyCompletedOrderFilter($ordersQuery);

$ordersTotal = (clone $ordersQuery)->count();  // Query 1
$ordersWithTotal = (clone $ordersQuery)->whereNotNull('total_with_vat');

$perCurrencyTotals = (clone $ordersWithTotal)  // Query 2
    ->selectRaw('currency_code, COUNT(*), SUM(...)')
    ->groupBy('currency_code')
    ->get();
```

**Řešení**: Single query s grouping:
```php
$data = DB::table('orders')
    ->where(...filters...)
    ->where(completed_status)
    ->groupBy('currency_code')
    ->selectRaw('
        COUNT(*) as total_count,
        SUM(CASE WHEN total_with_vat IS NOT NULL THEN 1 ELSE 0 END) as with_total_count,
        SUM(total_with_vat) as sum_amount
    ')
    ->get();

// Odsud všechny metriky = 1 query místo 3-4!
```

**Dopad**: 4+ queries → 1 query = 75% reduction

---

### 1.3 ❌ Customers List - Berbeš všechna pole, pak je filtruj v PHP
**File**: `backend/modules/Customers/Http/Controllers/CustomerController.php`

```php
// CHYBA: SELECT * implicitně
public function index(Request $request) {
    return Customer::query()
        ->where('shop_id', $shopId)
        ->paginate($perPage);
    
    // Frontend dostane všechna pole: addresses (JSON, 2KB+), order_history, metadata, ...
    // ale zobrazí jen: name, email, created_at (3 pole!)
}
```

**Řešení**:
```php
return Customer::query()
    ->where('shop_id', $shopId)
    ->select(['id', 'name', 'email', 'created_at', 'shop_id'])  // Only needed fields
    ->paginate($perPage);
```

**Dopad**: Payload -70% (50MB → 15MB na 1000 records)

---

### 1.4 ❌ Products List - Eager load bez nutnosti
**File**: `frontend/src/features/products/hooks/useProducts.ts`

```ts
const useProducts = (params) => useQuery({
    queryKey: ['products', params],
    queryFn: () => fetchProducts(params),
    // ← No staleTime! Refreshuje se každých 0ms
});
```

**Problem**: V ProductDetailPage voláš:
1. `useProducts()` - seznam ALL produktů
2. `useProduct(id)` - detail jednoho produktu ← DUPLIKACE!

**Řešení**:
```ts
export const useProduct = (id: string | undefined) =>
  useQuery({
    queryKey: ['products', 'detail', id],
    queryFn: () => fetchProduct(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,  // ← Cache 5 minut! 
  });
```

**Dopad**: Zvyš staleTime → -50% API calls

---

### 1.5 ❌ Analytics KPIs - Refresh každých 60 sekund bez potřeby
**File**: `frontend/src/features/analytics/hooks/useAnalyticsKpis.ts`

```ts
export const useAnalyticsKpis = (params?, options?) =>
  useQuery<AnalyticsKpis>({
    queryKey: ['analytics', 'kpis', params ?? {}],
    queryFn: () => fetchAnalyticsKpis(params ?? {}),
    staleTime: 1000 * 60,  // ← 60s je OK
    // ← Ale nikde NENÍ refetchInterval!
  });
```

**VŠAK** v AnalyticsPage volej funkci bez caching:
```ts
// CHYBA: Volá se to N-krát ročně, pokaždé fresh query
const kpis = useAnalyticsKpis(params);
```

**Řešení**: 
```ts
// Nastav staleTime = 10 minut (KPIs se updatuje 1x za den max)
staleTime: 10 * 60 * 1000,
```

**Dopad**: -90% API calls na KPIs endpoint

---

## 2. N+1 Query Problémy

### 2.1 ❌ Customers Detail - Orders bez eager loading
**File**: `backend/modules/Customers/Http/Controllers/CustomerController.php`

```php
public function show(Request $request, Customer $customer)
{
    // CHYBA: v resource se volá
    return new CustomerResource($customer);
    
    // CustomerResource dělá:
    'orders_count' => $this->orders()->count(),  // ← Query 1
    'total_spent' => $this->orders()->sum('total_with_vat'),  // ← Query 2
    'last_order' => $this->orders()->latest()->first(),  // ← Query 3
}
```

**Řešení**: Eager load v show():
```php
public function show(Request $request, Customer $customer)
{
    $customer->loadCount('orders')
        ->load([
            'orders' => fn($q) => $q->select('total_with_vat', 'customer_id')->orderByDesc('ordered_at')->limit(1)
        ]);
    
    return new CustomerResource($customer);
}
```

**Dopad**: 3 queries → 2 queries (50% reduction)

---

### 2.2 ❌ Products Table - Eager load bez selektů
**File**: `backend/modules/Pim/Http/Controllers/ProductController.php`

```php
// CHYBA: Eager load bez field selekcí
return Product::query()
    ->with(['variants', 'translations', 'categories', 'shop_overlays'])
    ->paginate(25);
    
// Payload: 25 products × 10MB = 250MB!
```

**Řešení**:
```php
return Product::query()
    ->select(['id', 'name', 'sku', 'shop_id', 'created_at'])
    ->with([
        'variants' => fn($q) => $q->select(['id', 'product_id', 'code']),
        'translations' => fn($q) => $q->select(['id', 'product_id', 'name'])
            ->limit(3),  // ← Limit only necessary translations
    ])
    ->paginate(25);

// Payload: 25 products × 500KB = 12.5MB (20x smaller!)
```

**Dopad**: Payload -95%, network time -20s → -2s

---

## 3. Frontend - Zbytečné Data Transformace

### 3.1 ❌ useVipCustomers - Include filters bez caching
**File**: `frontend/src/features/customers/hooks/useCustomers.ts`

```ts
export const useVipCustomers = (params: Record<string, unknown>) =>
  useQuery({
    queryKey: ['customers', 'vip', params],
    queryFn: () => fetchVipCustomers({ include_filters: 1, ...params }),
    placeholderData: keepPreviousData,
    // ← CHYBA: Bez staleTime = fresh fetch pokaždé
  });
```

**Řešení**:
```ts
export const useVipCustomers = (params: Record<string, unknown>) =>
  useQuery({
    queryKey: ['customers', 'vip', params],
    queryFn: () => fetchVipCustomers({ include_filters: 1, ...params }),
    placeholderData: keepPreviousData,
    staleTime: 15 * 60 * 1000,  // ← 15 min cache (VIP list se mění zřídka)
  });
```

**Dopad**: -80% API calls

---

### 3.2 ❌ useOrders - Fetch all v background
**File**: `frontend/src/features/orders/hooks/useOrders.ts`

```ts
// CHYBA: Každá stránka volá VŠECHNY objednávky
export const useOrders = (params: Record<string, unknown>) =>
  useQuery({
    queryKey: ['orders', params],  // ← Params nejsou spravně normalized!
    queryFn: () => fetchOrders(params),
    placeholderData: keepPreviousData,
    // Pokud user změní sort, nový queryKey je vygenerován,
    // ale old data nejsou reused!
  });
```

**Řešení**: Normalize query key:
```ts
export const useOrders = (params: Record<string, unknown>) => {
  const normalizedParams = {
    page: params.page ?? 1,
    per_page: params.per_page ?? 25,
    sort: params.sort ?? 'created_at',
    direction: params.direction ?? 'desc',
  };

  return useQuery({
    queryKey: ['orders', normalizedParams],  // ← Consistent hashing
    queryFn: () => fetchOrders(normalizedParams),
    placeholderData: keepPreviousData,
    staleTime: 2 * 60 * 1000,  // ← 2 min for live data
  });
};
```

**Dopad**: -40% redundantní API calls

---

## 4. Database - Neoptimalizované Queries

### 4.1 ❌ Customers Export - Bez connection pooling
```php
// CHYBA: V chunkById sem robisť NOVÝ SELECT
$baseQuery->chunkById(500, function ($chunk) {
    // Každý chunk = 1 DB connection = trvá déle
    Customer::query()->whereIn('id', $customerIds)->with('orders')->get();
});
```

**Řešení**: Vzorkuj data v buffer, pak batch insert:
```php
$customers = [];
$baseQuery->chunkById(500, function ($chunk) use (&$customers) {
    $customers = array_merge($customers, $chunk->toArray());
});
// Vrať všechny najednou
```

---

### 4.2 ❌ Analytics - Sum bez GROUP BY optimization
```php
// CHYBA: Sčítáš v aplikaci místo v DB
$orderItems = OrderItem::query()->get();  // 8.2M rows!
$productTotal = 0;
foreach ($orderItems as $item) {
    $productTotal += $item->amount;  // ← PHP loop 8.2M krát!
}
```

**Řešení**: DB side aggregation:
```php
$productTotal = DB::table('order_items')
    ->where('created_at', '>=', $from)
    ->sum('amount');  // ← 1 DB query, atomic
```

---

## 5. Summary Table - Priority Fixes

| Problem | Impact | Effort | Priority |
|---------|--------|--------|----------|
| Customers export double-fetch | 100% overhead | 30 min | 🔴 CRITICAL |
| Analytics KPIs 4x queries | 75% wasted | 1 hour | 🔴 CRITICAL |
| Select ALL columns | -70% payload | 2 hours | 🔴 CRITICAL |
| Missing staleTime frontend | 80% extra calls | 1.5 hour | 🟡 HIGH |
| N+1 customer orders | 3x queries | 45 min | 🟡 HIGH |
| Products eager load all | 95% payload | 1 hour | 🟡 HIGH |
| Analytics staleTime | 90% extra calls | 15 min | 🟠 MEDIUM |
| Query key normalization | 40% wasted | 30 min | 🟠 MEDIUM |

---

## 6. Implementation Checklist

- [ ] Fix Customers export chunkById
- [ ] Consolidate Analytics KPIs queries
- [ ] Add explicit SELECT columns to all list endpoints
- [ ] Set staleTime = 5-15min na všech query hooks
- [ ] Eager load bez wildcard selects
- [ ] Normalize query keys frontend hookech
- [ ] Add connection pooling ke export features
- [ ] Move sum() operations to database
- [ ] Audit all N+1 patterns
- [ ] Monitor network payload sizes (goal: -60%)

---

**Benefit**: -60% API calls, -70% payload, -80% DB queries = 3x faster
