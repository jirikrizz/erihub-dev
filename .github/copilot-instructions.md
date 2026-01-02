# 🚀 Shoptet Commerce HUB - AI Coding Agent Instructions (v2025)

**Tento dokument je tvoje Bible** pro vývoj na ADMIN-KV-DEV projektu.  
Pravidelně se odkázuji sem. Všechno co tady je, je KRITICKY DŮLEŽITÉ.

---

## 🎯 NEJDŮLEŽITĚJŠÍ PRAVIDLA (NIKDY NEPORUŠ)

### 1. PRODUKCE JE SFINTOSVANÁ
- ✅ **Čti produkci** jako referencí
- ❌ **NEMĚŇ produkci bez:** Backupu, Pre-deployment checklistu, Health checks
- ✅ Vyvíjej na **local + staging**, testuj na staging, deployuj s deploy.sh

### 2. PRODUKČNÍ DATA JSOU POSVÁTNÁ
- **Order items**: 8.2 milionů řádků (10 GB!) 
- **Orders**: 1.4 milionů (6.6 GB)
- **Customers**: 661 tisíc (901 MB)
- **Nikdy** DELETE bez dokumentace, **Vždy** BACKUP před změnou schema

### 3. QUEUE JE KRITICKÁ
- Snapshots = 2h timeout, ŽÁDNÉ retries (=data loss risk!)
- Vždy zapiš `$this->queue = 'specific_queue'` do job konstruktoru
- Monitoruj `/storage/logs/queue-worker.log` když cokoli deployuješ

---

## 📊 PROJECT STRUCTURE

```
/Users/jkriz/Desktop/ADMIN-KV-DEV/
├── backend/                    # Laravel 12 API
│   └── modules/               # 12 modułů (Core, Shoptet, PIM, Inventory, ...)
│       ├── Shoptet/           # 🔴 KRITICKÝ: API, snapshot pipeline, webhooks
│       ├── PIM/               # Products, translations (17.9k translations!)
│       ├── Inventory/         # Stock, forecasting, ML recommendations
│       ├── Orders/            # 1.4M orders (MEGA!)
│       ├── Customers/         # 661k customers, tagging, segmentation
│       ├── Core/              # Auth (Sanctum), settings, scheduling, AI
│       ├── Analytics/         # KPI reporting
│       ├── Admin/             # User/role management (Spatie permission)
│       ├── Dashboard/         # Summary views
│       ├── Microsites/        # Single-product pages (NEW)
│       ├── WooCommerce/       # Alternative channel (experimental)
│       └── [...weitere]
├── frontend/                   # React 19 + Vite 7
│   └── src/
│       ├── app/              # Router (React Router v6), providers
│       ├── features/         # Feature-based components
│       ├── api/              # Axios HTTP clients
│       ├── hooks/            # Custom hooks (useUserPreference, etc)
│       └── components/       # Mantine UI components + DataTable
├── storefront/                # Next.js customer site (separate)
├── docker-compose.yml         # 13+ services (backend, workers, postgres, redis, ...)
├── docker/                    # Caddy, Nginx, Postgres, Redis configs
└── docs/                      # Architecture docs
    ├── INDEX.md              # 👈 START HERE (navigation)
    ├── ANALYSIS_COMPLETE.md  # Executive summary
    ├── PRODUCTION_ANALYSIS.md # Database breakdown (8.2M row audit!)
    ├── CODE_ANALYSIS.md      # 53 services, 22 jobs, 55 models
    ├── DEVELOPMENT_WORKFLOW.md # Git strategy, local dev, testing
    ├── DEPLOYMENT_WORKFLOW.md  # Safe deployment procedures
    └── OPTIMIZATION_ROADMAP.md # 5-phase plan (Phase 1 CRITICAL!)
```

**PRODUKČNÍ SERVER**: 168.119.157.199 (deploy@, /home/deploy/admin-kv)  
**PRODUKČNÍ DOMAIN**: hub.krasnevune.cz (Caddy reverse proxy)  
**DATABÁZE**: PostgreSQL 16 (produkce), SQLite (dev)  

---

## 🏗️ ARCHITEKTURA - MUSÍŠ VĚDĚT

### Module System (12 modulů + Service Providers)
- Каждый modul v `backend/modules/{Name}/` má vlastní:
  - `{Name}ServiceProvider.php` - auto-discovery routes, migrations
  - `Http/Controllers/` - API endpoints
  - `Models/` - Eloquent models
  - `Jobs/` - Queue jobs
  - `Services/` - Business logic (53 services total!)
  - `routes/api.php` - Auto-prefixed s `/api/{modul}`, např. `/api/shoptet/shops`

### Queue Architecture (KRITICKÁ!)
6 specializovaných front:
```
snapshots                  → ProcessShoptetSnapshot (2h timeout, 7200s)
orders                     → Order processing (20min timeout)
customers                  → Customer sync (2h timeout)
customers_metrics          → Metrics calculation (2h timeout)
microsites                 → Page generation (2h timeout)
inventory_recommendations  → ML forecasting (2h timeout)
default                    → General tasks
```

**⚠️ VŽDY** v job konstruktoru:
```php
public function __construct() {
    $this->queue = 'snapshots'; // nebo correct queue!
}
```

### Shoptet Snapshot Pipeline (4-STEP FLOW - KRITICKÝ!)
1. **Trigger**: POST `/api/shoptet/shops/{id}/snapshots/{products|orders|customers}`
2. **Webhook**: Shoptet pošle `job:finished` → uloží se v `shoptet_webhook_jobs` tabulce
3. **Download**: DownloadShoptetSnapshot stáhne gzip ze Shoptet → `/storage/app/shoptet/{shop}/snapshots/`
4. **Process**: ProcessShoptetSnapshot parsuje JSON Lines → dispatch na:
   - ProductSnapshotImporter (upsert products, variants, translations)
   - OrderSnapshotImporter (upsert orders, items - 8.2M rows!)
   - CustomerSnapshotImporter (upsert customers)

**⚠️ PROBLEMA**: Tries = 1 (ŽÁDNÉ RETRIES!) → Pokud job selže = data loss!  
**👉 PHASE 1**: Přidat retry mechanism + failed snapshot recovery

---

## 💻 LOCAL DEVELOPMENT

### Setup bez Docker (macOS)
```bash
cd backend
composer install
cp .env.example .env

# Update .env:
# DB_CONNECTION=sqlite
# DATABASE_URL="sqlite:database/dev.sqlite"

php artisan migrate --seed    # admin@example.com / secret
php artisan serve              # http://localhost:8000

# V jiném terminálu - queue worker:
php artisan queue:work --queue=snapshots,default --timeout=7200

# Frontend (jiný terminal):
cd frontend
npm install
npm run dev                    # http://localhost:5173
```

### Setup s Docker (lepší, vícero services)
```bash
# Install dependencies
docker compose run --rm backend composer install
docker compose run --rm frontend npm install

# Start infra
docker compose up -d postgres redis

# Setup DB
docker compose run --rm backend php artisan migrate --seed

# Start all services
docker compose up -d
# API:  http://localhost:8080
# Frontend: http://localhost:5173

# Queue worker logs (pokud máš --profile workers)
tail -f backend/storage/logs/queue-worker.log
```

**Poznámka**: Queue workers v docker-compose běží automaticky s `--profile workers`.

---

## 🔥 CRITICAL FINDINGS (zjistil jsem)

### 1. SNAPSHOT JOB NEMÁ RETRY!
- **Problem**: ProcessShoptetSnapshot má `tries = 1` (bez retries)
- **Risk**: Pokud job selže = 100k produktů se nenaimportuje!
- **Solution (Phase 1)**: Přidat retry mechanism + failed snapshot queue

### 2. ORDER ITEMS EXPONENTIAL GROWTH
- **Problem**: 8.2M řádků BEZ partitioning (bude neudržitelné)
- **Risk**: Za 3 roky = 50M řádků (neprůchod pro queries)
- **Solution (Phase 2)**: Quarterly partitioning (2024 Q1, Q2, Q3, Q4, ...)

### 3. SETTINGS SERVICE - ŽÁDNÝ CACHE
- **Problem**: `SettingsService::get('key')` = vždy DB query
- **Risk**: 500+ DB reads denně (zbytečně)
- **Solution (Phase 1)**: Cache::remember() s 1h TTL

### 4. SHOPTET PAGINATION - MEMORY EXHAUSTION
- **Problem**: `fetchPaginatedCollection()` loaduje ALL pages do paměti najednou
- **Risk**: 200k produktů najednou v RAM (OOM crash)
- **Solution (Phase 2)**: Generátor pattern (lazy loading)

### 5. JOB DUPLICATION - NO LOCKING
- **Problem**: FetchNewOrdersJob, RecalculateCustomerMetricsJob mohou běžet 2x samtidě
- **Risk**: Duplicitní zpracování, data inconsistency
- **Solution (Phase 1)**: Cache::lock() pattern

### 6. NO PRODUCTION MONITORING
- **Problem**: Queue failures, slow queries, error rates = invisible bez SSH
- **Risk**: Downtime bez notifikace, optimizace bez data
- **Solution (Phase 3)**: Monitoring dashboard

---

## 📈 DATABASE - MUSÍŠ VĚDĚT

### Velikost (30 GB total)
| Table | Rows | Size | Kritické? |
|-------|------|------|-----------|
| order_items | 8,284,564 | 10 GB | 🔴 YES - partitioning Phase 2 |
| orders | 1,410,203 | 6.6 GB | 🔴 YES |
| customers | 661,034 | 901 MB | 🟡 WATCH |
| customer_metrics | 592,480 | 780 MB | Denormalized, OK |
| products | 4,421 | 45 MB | Normální |
| product_translations | 17,931 | 25 MB | Normální |

### JSON Kolumny (POZOR!)
```php
// shop_tokens.token_data = JSON
// product_translations.content = JSON (translation data)
// Vždy validuj strukturu před uložením!
```

### Soft Deletes (probabil)
- Používáme je na Models (ne deletovat, soft delete)
- Dotazy automaticky filtrují `deleted_at IS NULL`

---

## 🎯 CODE CONVENTIONS

### Backend (Laravel)

**Module Routes** - auto-prefixed!
```php
// backend/modules/Shoptet/routes/api.php
Route::get('/shops', [...]);  // becomes GET /api/shoptet/shops
```

**API Resources** - vždy transformuj output!
```php
Route::get('/products/{id}', function(Product $id) {
    return new ProductResource($id);  // Transformed output
});
```

**Permissions** - Spatie
```php
// In models or controllers:
$user->hasRole('admin')
$user->hasPermission('edit_products')
$user->can('publish', $product)  // Policy
```

**Activity Log** - pro audit trail
```php
activity()
    ->causedBy($user)
    ->performedOn($product)
    ->log('Product published');
```

**Large Dataset Jobs** - chunking + transaction
```php
// ProcessShoptetSnapshot.php
DB::transaction(function() {
    foreach ($items->chunk(1000) as $chunk) {
        ProductSnapshotImporter::import($chunk);
    }
});
```

### Frontend (React)

**Query Keys** - consistent format!
```typescript
// hooks/useProducts.ts
const query = useQuery({
    queryKey: ['pim', 'products', shopId],  // [module, entity, id]
    queryFn: () => pimApi.getProducts(shopId),
});

const query = useQuery({
    queryKey: ['orders', 'list', { page: 1, shop: shopId }],
    queryFn: () => ordersApi.getOrders({ page: 1, shop: shopId }),
});
```

**Forms** - Mantine useForm + react-hook-form
```tsx
const form = useForm<ProductFormData>({
    initialValues: { name: '', sku: '' },
    validate: zodResolver(productSchema),
});

// Advanced: use react-hook-form directly for complex fields
```

**Tables** - Virtual scrolling pro >1000 rows!
```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function DataTable({ data }) {
    const virtualizer = useVirtualizer({
        count: data.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 35,
    });
    // ... render virtualized rows
}
```

**Notifications** - Mantine service
```typescript
import { notifications } from '@mantine/notifications';

notifications.show({
    title: 'Product published',
    message: 'Product is now live on Shoptet',
    color: 'green',
});
```

**API Calls** - Axios + Sanctum token
```typescript
// frontend/src/api/client.ts
const client = axios.create({
    baseURL: '/api',
    headers: {
        'Authorization': `Bearer ${token}`,  // Sanctum
    },
});

export const pimApi = {
    getProducts: (shopId) => client.get(`/pim/shops/${shopId}/products`),
};
```

---

## 📋 WORKFLOW

### Git Strategy (GIT FLOW)
```
main               # Production releases
  └─ develop      # Integration branch
      ├─ feature/product-ai      # Feature branches
      ├─ feature/customer-segmentation
      ├─ bugfix/snapshot-retry   # Bugfix branches
      └─ hotfix/critical-fix     # Emergency production fixes
```

**Commit messages**:
```
feat(shoptet): add snapshot retry mechanism
fix(orders): prevent duplicate order processing
docs(api): update snapshot pipeline diagram
refactor(customers): optimize tag rule engine
test(products): add AI translation tests
```

### Pre-Deployment Checklist (VŽDY!)
- [ ] Nahrál jsem unit tests: `php artisan test`
- [ ] Frontend linting passou: `npm run lint`
- [ ] Setup na staging funguje bez chyb
- [ ] Database migrations běží bez problémů
- [ ] Všechny queue jobs jsou testované
- [ ] BACKUP je vytvořený: `ssh deploy@ ... pg_dump`
- [ ] Têméř nikdo jiný nedělá zmeny v tom čase (merge conflicts!)

### Deployment (BEZPEČNĚ)
```bash
./deploy.sh production
# Script dělá:
# 1. Pre-checks (git status, backup, health)
# 2. Backup DB (gzip)
# 3. Git pull + composer install
# 4. Database migrations
# 5. Cache clear
# 6. Service restart
# 7. Health checks
```

---

## 🆘 TROUBLESHOOTING

### Queue job je v failed state
```bash
php artisan queue:failed  # List failed
php artisan queue:retry {id}  # Retry
php artisan queue:flush  # Smaž všechny (POZOR!)
```

### Snapshot download zkrachuje
1. Check webhook job v DB: `select * from shoptet_webhook_jobs limit 10`
2. Check snapshot file: `ls -la storage/app/shoptet/{shop}/snapshots/`
3. Check timeout: `php artisan queue:work --timeout=7200` (2 hours!)
4. Pokud je to timeout → Phase 1 bude mít retry mechanism

### Performance = pomalá
1. Check DB indexes: `\dt` v psql, pak `\d {table}`
2. Check queue workers běží: `docker compose ps` (hledej queue worker)
3. Check cache hit rate: `redis-cli info stats`
4. Phase 2 bude mít performance optimizations!

### Deploy failed - potřebuji rollback
```bash
./rollback.sh
# Restores from latest backup
```

---

## 📚 MUSÍŠ SI PŘEČÍST (ORDEN)

1. **[INDEX.md](INDEX.md)** (5 min) - Navigation hub
2. **[ANALYSIS_COMPLETE.md](ANALYSIS_COMPLETE.md)** (15 min) - Big picture
3. **[PRODUCTION_ANALYSIS.md](PRODUCTION_ANALYSIS.md)** (20 min) - Database facts
4. **[DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md)** (25 min) - How to dev
5. **[OPTIMIZATION_ROADMAP.md](OPTIMIZATION_ROADMAP.md)** (35 min) - Future phases
6. **[CODE_ANALYSIS.md](CODE_ANALYSIS.md)** (45 min) - Technical deep dive

Celkem: **2 hodiny studia = Expert Level** 🎓

---

## 🚀 QUICK COMMANDS

```bash
# Local dev (Docker)
docker compose up -d
docker compose logs -f backend

# Local dev (bez Docker)
php artisan serve
php artisan queue:work --queue=snapshots,default

# Frontend dev
npm run dev

# Testing
php artisan test
npm run lint

# Production (SAFE!)
./deploy.sh production

# Backup (VŽDY!)
ssh deploy@168.119.157.199 "cd /home/deploy/admin-kv && docker compose exec -T postgres pg_dump -U admin_kv admin_kv | gzip > /home/deploy/backups/backup-$(date +%Y%m%d).sql.gz"

# Cleanup (po testing)
docker compose down -v
rm -rf backend/storage/logs/*
```

---

## 🎓 EXPERT RESOURCES

- **API Spec**: [openapi (2).json](openapi (2).json) - Shoptet OpenAPI
- **Shoptet OAuth2 Flow**: backend/modules/Shoptet/Services/ShoptetClient.php
- **Product Workflow**: draft → review → approved → synced
- **Queue Monitoring**: `tail -f backend/storage/logs/queue-worker.log`
- **Docker Services**: `docker compose ps` (13 services running)

---

**Last updated**: 2. ledna 2026  
**Status**: ✅ Fully analyzed & documented  
**Questions?** Všechny odpovědi jsou v INDEX.md, ANALYSIS_COMPLETE.md, nebo CODE_ANALYSIS.md

Vítej v týmu! 🚀 Teď jsi expert na tento projekt.
