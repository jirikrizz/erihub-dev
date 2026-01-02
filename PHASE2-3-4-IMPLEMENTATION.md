# Phase 2.3 + 2.4 Implementation - Pagination Memory Optimization

**Date**: 2. ledna 2026  
**Status**: ✅ In Progress  
**Branch**: feature/phase1-phase2-optimization

---

## Summary

### Phase 2.3: Backend Pagination Memory Optimization
- **Goal**: Replace `fetchPaginatedCollection()` with generator pattern
- **Problem**: Loads all pages into memory simultaneously → OOM for 100k+ items
- **Solution**: Use PHP generators for lazy-loading pagination
- **Impact**: Memory usage: 500+ MB → <50 MB during large imports

### Phase 2.4: Frontend Server-Side Pagination
- **Goal**: Implement server-side pagination instead of client-side
- **Problem**: Frontend loads ALL rows from API, paginate in JavaScript → 500 MB+ RAM
- **Solution**: Backend returns paginated data (page + limit), frontend pages through results
- **Impact**: Faster load times, consistent memory usage, better scalability

---

## Phase 2.3 Implementation Details

### Files Modified:
1. **backend/modules/Shoptet/Http/ShoptetClient.php**
   - Added `fetchPaginatedCollectionLazy()` using PHP generators
   - Kept `fetchPaginatedCollection()` for backwards compatibility

### Methods Changed:
- `listFilteringParameters()` - Already using `fetchPaginatedCollection()`
- `listVariantParameters()` - Already using `fetchPaginatedCollection()`

### How Generator Pattern Works:
```php
private function fetchPaginatedCollectionLazy(...): \Generator {
    for ($page = 1; ; $page++) {
        $response = $this->request(...);
        $chunk = Arr::get($response, $collectionPath, []);
        
        if (is_array($chunk) && $chunk !== []) {
            foreach ($chunk as $item) {
                yield $item;  // Yield one item at a time
            }
        }
        
        // Check if there's a next page
        if (!hasNextPage($response)) {
            break;
        }
    }
}
```

### Usage Pattern:
```php
// OLD (memory-intensive):
$items = $client->fetchPaginatedCollection($endpoint);
foreach ($items as $item) {
    process($item);
}

// NEW (efficient):
foreach ($client->fetchPaginatedCollectionLazy($endpoint) as $item) {
    process($item);  // Only one page in memory at a time
}
```

### Current Callers:
- `listFilteringParameters()` - Called in AttributeMappingController (not memory-intensive, small datasets)
- `listVariantParameters()` - Called in AttributeMappingController (not memory-intensive, small datasets)

**Note**: The snapshot importers don't use `fetchPaginatedCollection()`. They process data from JSON Lines files, so they already have chunking in place.

---

## Phase 2.4 Implementation Details

### Backend - API Endpoints to Update:

1. **ProductController::index** (`/api/pim/products`)
   - Already supports `per_page` parameter ✅
   - Uses `Product::paginate()` ✅
   - Status: **READY**

2. **OrderController::index** (`/api/orders`)
   - Already supports `per_page` parameter ✅
   - Uses `Order::paginate()` ✅
   - Status: **READY**

3. **CustomerController::index** (`/api/customers`)
   - Needs to support `per_page` parameter
   - Need to add `paginate()` call
   - Status: **TODO**

4. **InventoryVariantController::index** (`/api/inventory/variants`)
   - Needs to support `per_page` parameter
   - Need to add `paginate()` call
   - Status: **TODO**

### Frontend - API Clients to Update:

1. **frontend/src/api/pim.ts**
   - `fetchProducts()` - Already accepts params ✅
   - Status: **READY**

2. **frontend/src/api/orders.ts**
   - `fetchOrders()` - Already accepts params ✅
   - Status: **READY**

3. **frontend/src/api/customers.ts**
   - `fetchCustomers()` - Already accepts params ✅
   - `fetchVipCustomers()` - Already accepts params ✅
   - Status: **READY**

4. **frontend/src/api/inventory.ts**
   - `fetchInventoryVariants()` - Need to check
   - Status: **TODO**

### Frontend - Components to Update:

1. **ProductsPage.tsx**
   - Already has pagination state with `page`, `pageSize` ✅
   - Already uses `useProducts()` hook ✅
   - Status: **VERIFY**

2. **OrdersPage.tsx**
   - Already has pagination state ✅
   - Already uses `useOrders()` hook ✅
   - Status: **VERIFY**

3. **CustomersPage.tsx**
   - Need to add pagination state
   - Status: **TODO**

4. **InventoryPage.tsx**
   - Need to check pagination state
   - Status: **TODO**

### Custom Hooks to Update:

1. **useProducts()** - Check if using page/pageSize params
2. **useOrders()** - Check if using page/pageSize params
3. **useCustomers()** - Check if using page/pageSize params
4. **useInventoryVariants()** - Check if using page/pageSize params

---

## Backend Changes Required

### 1. Update CustomerController

```php
public function index(Request $request) {
    $perPage = (int) $request->integer('per_page', 25);
    $perPage = $perPage > 0 ? min($perPage, 100) : 25;
    
    $query = Customer::query()->paginate($perPage);
    return CustomerResource::collection($query);
}
```

### 2. Update InventoryVariantController

```php
public function index(Request $request) {
    $perPage = (int) $request->integer('per_page', 50);
    $perPage = $perPage > 0 ? min($perPage, 100) : 50;
    
    $query = InventoryVariant::query()->paginate($perPage);
    return InventoryVariantResource::collection($query);
}
```

---

## Frontend Changes Required

### 1. Update API Clients
- Ensure all `fetch*()` functions accept and pass `page` and `per_page` params

### 2. Update Pages
- Add `page` and `pageSize` state
- Pass to API client calls
- Update pagination controls

### 3. Update Custom Hooks
- Add `page` and `pageSize` to query key
- Use `keepPreviousData: true` for smooth transitions

---

## Testing Checklist

### Phase 2.3:
- [ ] Memory usage remains constant while importing 100k items
- [ ] Before: 500+ MB RAM
- [ ] After: <50 MB RAM
- [ ] Generator pattern yields items correctly
- [ ] No data loss during import

### Phase 2.4:
- [ ] Products page loads only current page data
- [ ] Orders page loads only current page data
- [ ] Customers page loads only current page data
- [ ] Pagination controls work (next/prev buttons)
- [ ] Page size selector works (25, 50, 100 items)
- [ ] Virtual scrolling works for current page only
- [ ] Memory usage: <50 MB (was 500+ MB)
- [ ] Performance: Faster load times
- [ ] Browser DevTools: Network shows smaller payloads

---

## Commits

```
feat(phase2.3): Implement lazy-loading pagination with generator pattern
feat(phase2.4): Implement server-side pagination for all list endpoints
```

---

## Status

- [x] Phase 2.3: Generator pattern implemented in ShoptetClient
- [ ] Phase 2.4: Backend controllers updated
- [ ] Phase 2.4: Frontend API clients verified
- [ ] Phase 2.4: Frontend pages updated
- [ ] Phase 2.4: Custom hooks updated
- [ ] Testing complete
- [ ] Both commits ready

