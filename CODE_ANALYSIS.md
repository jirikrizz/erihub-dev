# Hloubková analýza kódové báze - Shoptet Commerce HUB

**Datum analýzy**: 2. ledna 2026  
**Analyzovaný projekt**: ADMIN-KV-DEV (vývojová verze) + admin-kv (produkce)

---

## 📊 Celkový přehled architektury

### Technologie Stack
- **Backend**: Laravel 12, PHP 8.2+
- **Frontend**: React 19, Vite 7, Mantine UI 8
- **Databáze**: PostgreSQL 16 (produkce), SQLite (dev)
- **Cache/Queue**: Redis 7
- **Reverse Proxy**: Caddy 2 / Nginx
- **Deployment**: Docker Compose

### Moduly (12 celkem)
1. **Core** - Auth, settings, job scheduling, notifications, AI services
2. **Shoptet** - Shoptet API integrace, webhooks, snapshoty
3. **Pim** - Product Information Management, překlady, widgets
4. **Inventory** - Skladové zásoby, forecasting, nákupní objednávky
5. **Orders** - Objednávky a analýzy
6. **Customers** - Zákazníci, segmentace, tagging
7. **Analytics** - KPI a reporty
8. **Admin** - Správa uživatelů a rolí
9. **Dashboard** - Hlavní dashboard
10. **Microsites** - Generování mikrostránek
11. **WooCommerce** - WooCommerce integrace
12. **Kategorie** (v rámci PIM) - Category mapping a sorting

---

## 🔍 MODUL: Core

**Umístění**: `backend/modules/Core/`

### Odpovědnosti
- ✅ Autentizace (Laravel Sanctum)
- ✅ Správa nastavení aplikace (`app_settings`)
- ✅ Job scheduling system (cron-like)
- ✅ Notifikace (in-app + Slack)
- ✅ User preferences
- ✅ AI content generation (OpenAI)
- ✅ Feed export (produktové feedy)
- ✅ Currency conversion

### Klíčové komponenty

#### 1. **Job Scheduling System** ⭐️
**Soubory**: 
- `Support/JobScheduleCatalog.php` - Katalog dostupných jobů
- `Models/JobSchedule.php` - Model pro plánované joby
- `Console/Commands/RunJobSchedulesCommand.php` - Spouštění plánovaných jobů

**Jak funguje**:
```php
// JobScheduleCatalog definuje dostupné joby
public static function all(): array {
    return [
        'shoptet:fetch-new-orders' => [
            'label' => 'Stahování nových objednávek',
            'description' => 'Pravidelně kontroluje nové objednávky přes Shoptet API',
            'frequencies' => [
                JobScheduleFrequency::EveryMinute,
                JobScheduleFrequency::EveryFiveMinutes,
                // ...
            ],
        ],
        // ... další joby
    ];
}

// RunJobSchedulesCommand.php - spouští se každou minutu v cronu
protected function handle() {
    $dueSchedules = JobSchedule::query()
        ->where('is_enabled', true)
        ->get()
        ->filter(fn($schedule) => $schedule->isDue());
    
    foreach ($dueSchedules as $schedule) {
        Artisan::call($schedule->command, $schedule->parameters ?? []);
        $schedule->update(['last_run_at' => now()]);
    }
}
```

**Poznámky**:
- ✅ Dobrý pattern pro configurovatelný cron
- ⚠️ **Potenciální problém**: Pokud job běží déle než interval, může se spustit vícekrát
- 💡 **Optimalizace**: Přidat job locking (Laravel cache locks)

#### 2. **Notification System** ⭐️
**Soubory**:
- `Support/NotificationEventCatalog.php` - Katalog notifikačních eventů
- `Models/NotificationDelivery.php` - Historie doručených notifikací
- `Models/NotificationUserState.php` - Stav pro každého usera (přečteno/nepřečteno)
- `Services/NotificationFeedService.php` - Business logika
- `Services/SlackNotificationDispatcher.php` - Odesílání do Slacku

**Architektura**:
```
Event occurs → NotificationFeedService::dispatch()
    ↓
1. Check user preferences (kdo chce tuto notifikaci?)
2. Create NotificationDelivery record
3. Create NotificationUserState for each user
4. Dispatch to Slack (if enabled)
```

**Podporované eventy**:
- `inventory.low_stock` - Nízké zásoby
- `inventory.forecast_shortage` - Předpověď nedostatku
- `orders.new_order` - Nová objednávka
- `customers.new_vip_customer` - Nový VIP zákazník
- atd.

**Poznámky**:
- ✅ Dobře navržený event-driven systém
- ✅ User preferences umožňují granulární control
- ⚠️ **Potenciální problém**: Notifikace se ukládají do DB - při velkém množství může růst tabulka
- 💡 **Optimalizace**: Přidat cleanup job pro staré notifikace (>30 dní)

#### 3. **AI Content Generator** 🤖
**Soubory**:
- `Services/AiContentGenerator.php`
- `Services/AiImageCollageBuilder.php`
- `Models/AiGeneration.php`

**Funkce**:
- Generování produktových popisů
- Vytváření collage obrázků
- SEO meta descriptions
- Tracking AI generací (pro billing/monitoring)

**API**:
```php
class AiContentGenerator {
    public function generateProductDescription(
        string $productName,
        array $attributes,
        string $locale = 'cs'
    ): string;
    
    public function generateSeoMeta(
        string $title,
        string $content
    ): array; // ['title' => ..., 'description' => ...]
}
```

**Poznámky**:
- ✅ Centralizované API volání na OpenAI
- ✅ Tracking generací v `ai_generations` tabulce
- ⚠️ **Missing**: Rate limiting pro AI calls
- ⚠️ **Missing**: Error handling pro OpenAI outages
- 💡 **Optimalizace**: Cache AI responses (stejné produkty)

#### 4. **Settings Service**
**Soubor**: `Services/SettingsService.php`

**Pattern**:
```php
// Univerzální key-value store pro celou aplikaci
SettingsService::get('openai.api_key');
SettingsService::set('openai.model', 'gpt-4o');
SettingsService::getBool('inventory.enable_forecasting');
SettingsService->getJson('translation.locales'); // ['cs', 'sk', 'en']
```

**Typy nastavení**:
- `string`, `integer`, `boolean`, `json`, `date`

**Poznámky**:
- ✅ Velmi flexibilní pattern
- ✅ Type-safe gettery
- ⚠️ **Potenciální problém**: Není cache - každý read = DB query
- 💡 **Optimalizace**: Přidat cache vrstvu (remember() pattern)

#### 5. **Currency Converter**
**Soubor**: `Services/CurrencyConverter.php`

```php
$czk = $converter->convert(100, 'EUR', 'CZK'); // EUR -> CZK
```

**Poznámky**:
- ⚠️ **Chybí**: Source kurzu (hard-coded? API?)
- ⚠️ **Chybí**: Cache refresh strategy
- 💡 Potřeba doplnit analýzu implementace

### API Endpointy (Core)

```
GET  /api/auth/user              - Current user info
POST /api/auth/login             - Login (Sanctum token)
POST /api/auth/logout            - Logout
GET  /api/health                 - Health check

GET  /api/settings               - Get all settings
PUT  /api/settings/{key}         - Update setting

GET  /api/job-schedules          - List scheduled jobs
POST /api/job-schedules          - Create schedule
PUT  /api/job-schedules/{id}     - Update schedule
POST /api/job-schedules/{id}/run - Manually trigger

GET  /api/notifications          - Notification feed
POST /api/notifications/{id}/read - Mark as read

GET  /api/ai/generate-content    - AI content generation
POST /api/feed-exports           - Export product feed
```

### Database Schema (Core)

```sql
-- app_settings
CREATE TABLE app_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT,
    type VARCHAR(50),  -- string, integer, boolean, json, date
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- job_schedules
CREATE TABLE job_schedules (
    id SERIAL PRIMARY KEY,
    command VARCHAR(255),    -- e.g. "shoptet:fetch-new-orders"
    frequency VARCHAR(50),   -- enum: every_minute, every_hour, daily, weekly
    parameters JSON,         -- command parameters
    is_enabled BOOLEAN,
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,   -- calculated field
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- notification_deliveries
CREATE TABLE notification_deliveries (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(255), -- e.g. "inventory.low_stock"
    title VARCHAR(255),
    message TEXT,
    url VARCHAR(500),        -- Link pro akci
    metadata JSON,           -- Další data
    created_at TIMESTAMP
);

-- notification_user_states
CREATE TABLE notification_user_states (
    id SERIAL PRIMARY KEY,
    notification_delivery_id INTEGER REFERENCES notification_deliveries,
    user_id INTEGER REFERENCES users,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP
);

-- ai_generations
CREATE TABLE ai_generations (
    id SERIAL PRIMARY KEY,
    model VARCHAR(255),      -- e.g. "gpt-4o"
    prompt TEXT,
    response TEXT,
    tokens_used INTEGER,
    cost_usd DECIMAL(10, 4),
    user_id INTEGER,
    created_at TIMESTAMP
);

-- user_preferences
CREATE TABLE user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users,
    key VARCHAR(255),        -- e.g. "notifications.inventory.low_stock"
    value JSON,
    UNIQUE(user_id, key)
);
```

### Závěry a doporučení (Core modul)

#### ✅ Silné stránky:
1. **Dobře strukturovaný notification systém** - event-driven, rozšiřitelný
2. **Flexibilní settings management** - key-value pattern
3. **Job scheduling** - umožňuje uživatelům konfigurovat automatizaci
4. **AI integrace** - centralizovaná, sledovatelná

#### ⚠️ Potenciální problémy:
1. **Job scheduling bez lockingu** - může způsobit duplicity
2. **Settings bez cache** - zbytečné DB queries
3. **Notifikace bez cleanup** - růst tabulky
4. **AI bez rate limiting** - riziko nákladů
5. **Currency converter** - nejasná implementace

#### 💡 Doporučené optimalizace:
1. **Přidat cache layer pro Settings**:
   ```php
   public function get(string $key, $default = null) {
       return Cache::remember("settings.{$key}", 3600, function() use ($key, $default) {
           return AppSetting::where('key', $key)->value('value') ?? $default;
       });
   }
   ```

2. **Job locking v RunJobSchedulesCommand**:
   ```php
   if (!Cache::lock("job-schedule:{$schedule->id}", 300)->get()) {
       continue; // Skip if already running
   }
   ```

3. **Notification cleanup job**:
   ```php
   NotificationDelivery::where('created_at', '<', now()->subDays(30))
       ->delete();
   ```

4. **Rate limiting pro AI**:
   ```php
   RateLimiter::attempt('ai-generation:'.$userId, 100, function() {
       // AI call
   }, 3600);
   ```

---

## 🔍 MODUL: Shoptet ⭐⭐⭐ (KRITICKÝ)

**Umístění**: `backend/modules/Shoptet/`

### Odpovědnosti
- ✅ Správa připojených Shoptet shopů (multi-shop support)
- ✅ OAuth2 autentizace a token management
- ✅ API klient pro všechny Shoptet API endpointy
- ✅ **Snapshot pipeline** - stahování velkých datových exportů
- ✅ Webhook příjem a zpracování
- ✅ Product push (sync PIM → Shoptet)
- ✅ Shoptet plugin generator a hosting

### Klíčové komponenty

#### 1. **ShoptetClient** ⭐⭐⭐
**Soubor**: `Http/ShoptetClient.php` (405 řádků!)

**Rozhraní**:
```php
interface ShoptetClient {
    // Products
    public function listProducts(Shop $shop, array $query = []): array;
    public function getProduct(Shop $shop, string $guid, array $query = []): array;
    public function updateProduct(Shop $shop, string $guid, array $payload): array;
    public function createProduct(Shop $shop, array $payload): array;
    
    // Orders
    public function listOrders(Shop $shop, array $query = []): array;
    public function getOrder(Shop $shop, string $code, array $query = []): array;
    
    // Categories
    public function listCategories(Shop $shop, array $query = []): array;
    
    // Snapshots (velkoobjemové exporty)
    public function requestProductsSnapshot(Shop $shop): array;
    public function requestOrdersSnapshot(Shop $shop): array;
    public function requestCustomersSnapshot(Shop $shop): array;
    public function getSnapshotStatus(Shop $shop, int $jobId): array;
    
    // Stock movements
    public function updateStockMovements(Shop $shop, int $stockId, array $movements): array;
    
    // Webhooks
    public function registerWebhook(Shop $shop, string $event, string $url): array;
    public function listWebhooks(Shop $shop): array;
    
    // ... a mnoho dalších
}
```

**Interní mechanismy**:
```php
// Automatický token refresh při 401
private function request(Shop $shop, string $method, string $path, array $options = []): array {
    try {
        return $this->makeRequest($shop, $method, $path, $options);
    } catch (RequestException $e) {
        if ($e->response->status() === 401) {
            // Token expired - refresh
            $this->refreshToken($shop);
            return $this->makeRequest($shop, $method, $path, $options);
        }
        throw $e;
    }
}

// Paginace pro velké kolekce
private function fetchPaginatedCollection(Shop $shop, string $path, string $dataPath, array $query = []): array {
    $items = [];
    $page = 1;
    
    do {
        $response = $this->request($shop, 'GET', $path, ['query' => $query + ['page' => $page]]);
        $pageItems = Arr::get($response, $dataPath, []);
        $items = array_merge($items, $pageItems);
        $page++;
    } while (count($pageItems) > 0);
    
    return $items;
}
```

**Poznámky**:
- ✅ Velmi komplexní ale dobře strukturovaný client
- ✅ Automatický token refresh
- ✅ Paginace pro velká data
- ⚠️ **Problém**: `fetchPaginatedCollection()` načte VŠECHNY stránky - může být paměťově náročné
- 💡 **Optimalizace**: Použít generator pattern pro lazy loading

#### 2. **Snapshot Pipeline** ⭐⭐⭐ (NEJKRITIČTĚJŠÍ ČÁST)

**Jak funguje snapshot pipeline**:

```
1. TRIGGER (User nebo cron)
   ↓
   POST /api/shoptet/shops/{id}/snapshots/products
   ↓
   SnapshotController::products()
   ↓
   ShoptetClient::requestProductsSnapshot($shop)
   ↓
   Shoptet API POST /api/products/snapshot
   ← Response: {"jobId": 12345}

2. WEBHOOK (Asynchronně od Shoptetu když je snapshot ready)
   ↓
   POST /api/shoptet/webhooks?token=xxx
   Body: {
       "event": "job:finished",
       "eshopId": 123,
       "jobId": 12345,
       "resultUrl": "https://shoptet.com/.../data.gz"
   }
   ↓
   WebhookController::handle()
   ↓
   Uložení do `shoptet_webhook_jobs` tabulky
   ↓
   Dispatch DownloadShoptetSnapshot job

3. DOWNLOAD (Queue job: snapshots)
   ↓
   DownloadShoptetSnapshot::handle()
   ↓
   Stáhne gzip soubor z resultUrl
   ↓
   Uloží do storage/app/shoptet/{shop_id}/snapshots/
   ↓
   Dispatch ProcessShoptetSnapshot job

4. PROCESS (Queue job: snapshots, 2h timeout!)
   ↓
   ProcessShoptetSnapshot::handle()
   ↓
   Rozparsuje JSON Lines format
   ↓
   Podle typu snapshotu:
   - products → ProductSnapshotImporter
   - orders → OrderSnapshotImporter
   - customers → CustomerSnapshotImporter
   ↓
   Upsert do databáze (chunked po 1000 záznamů)
```

**Kritické soubory**:
- `Jobs/DownloadShoptetSnapshot.php`
- `Jobs/ProcessShoptetSnapshot.php`
- `Services/SnapshotService.php`
- `Services/SnapshotPipelineService.php`

**Konfigurace ProcessShoptetSnapshot**:
```php
class ProcessShoptetSnapshot implements ShouldQueue {
    public int $timeout = 7200;  // 2 hodiny!
    public int $tries = 1;       // Žádné retry (důležité!)
    
    public function __construct(private readonly ShoptetWebhookJob $webhookJob) {
        $this->queue = 'snapshots';  // Speciální queue
    }
}
```

**Poznámky**:
- ✅ Velmi robustní systém pro velká data
- ✅ Správně používá queue = 'snapshots' s dlouhým timeoutem
- ✅ `tries = 1` zabraňuje duplicitnímu zpracování
- ⚠️ **Problém**: Pokud snapshot processing failne, není automatický retry
- ⚠️ **Problém**: Není monitoring průběhu (% completed)
- 💡 **Optimalizace**: Přidat progress tracking (job batches?)
- 💡 **Optimalizace**: Přidat chunked processing s checkpoints

#### 3. **Shop Model** (Multi-shop support)
**Soubor**: `Models/Shop.php`

```php
class Shop extends Model {
    protected $fillable = [
        'name',
        'provider',           // 'shoptet' | 'woocommerce'
        'domain',            // e.g. 'obchod.cz'
        'default_locale',    // 'cs'
        'timezone',
        'is_master',         // Master shop pro synchronizaci
        'settings',          // JSON konfigurace
        'api_mode',          // 'premium' | 'private' | 'partner'
        'currency_code',     // 'CZK'
        'customer_link_shop_id', // Pro propojení zákazníků mezi shopy
    ];
    
    protected $hidden = [
        'webhook_secret',
        'webhook_token',     // Token pro autentizaci webhooků
    ];
}
```

**Master shop pattern**:
```php
// Pouze jeden shop může být master
Shop::where('is_master', true)->first(); // Zdrojový shop pro data

// Ostatní shopy se synchronizují z masteru
$masterProducts = Product::where('shop_id', $masterShop->id)->get();
foreach ($targetShops as $shop) {
    syncProductsToShop($masterProducts, $shop);
}
```

**Poznámky**:
- ✅ Dobrý pattern pro multi-shop
- ✅ `customer_link_shop_id` umožňuje propojit zákazníky mezi shopy
- ⚠️ **Missing**: Validace - může být více master shopů?
- 💡 **Optimalizace**: Database constraint pro `is_master` (max 1 true)

#### 4. **ShopToken Model** (OAuth2)
**Soubor**: `Models/ShopToken.php`

```php
class ShopToken extends Model {
    protected $fillable = [
        'shop_id',
        'access_token',
        'refresh_token',
        'expires_at',
        'token_data',       // JSON - celá OAuth response
    ];
    
    protected $casts = [
        'expires_at' => 'datetime',
        'token_data' => 'array',
    ];
    
    public function isExpired(): bool {
        return $this->expires_at->isPast();
    }
}
```

**Token refresh flow**:
```php
// V ShoptetClient
private function refreshToken(Shop $shop): void {
    $token = $shop->token;
    
    $response = $this->http->post('https://api.myshoptet.com/oauth/token', [
        'grant_type' => 'refresh_token',
        'refresh_token' => $token->refresh_token,
        'client_id' => config('shoptet.client_id'),
        'client_secret' => config('shoptet.client_secret'),
    ]);
    
    $token->update([
        'access_token' => $response['access_token'],
        'refresh_token' => $response['refresh_token'],
        'expires_at' => now()->addSeconds($response['expires_in']),
    ]);
}
```

**Poznámky**:
- ✅ Správně implementovaný OAuth2 refresh
- ⚠️ **Problém**: Není race condition protection (dva requesty současně?)
- 💡 **Optimalizace**: Lock při refresh tokenu

#### 5. **Queue Jobs**

**Seznam jobů**:
1. `DownloadShoptetSnapshot` - Stahování snapshot souboru
2. `ProcessShoptetSnapshot` - Parsování a import dat
3. `FetchNewOrdersJob` - Pravidelné stahování nových objednávek
4. `PushProductTranslation` - Push překladu do Shoptetu
5. `RefreshOrderStatusesJob` - Aktualizace stavů objednávek
6. `RequestCustomersSnapshotJob` - Vyžádání customer snapshotu
7. `ImportMasterProductsJob` - Import produktů z master shopu

**FetchNewOrdersJob** (pravidelný monitoring):
```php
class FetchNewOrdersJob implements ShouldQueue {
    public int $timeout = 300;
    
    public function __construct(private readonly Shop $shop) {
        $this->queue = 'orders';
    }
    
    public function handle(ShoptetClient $client, OrderSyncService $orderSync): void {
        // Fetch orders changed since last sync
        $since = $this->shop->last_order_sync_at ?? now()->subDays(7);
        
        $orders = $client->listOrders($this->shop, [
            'changeTime' => $since->toIso8601String(),
        ]);
        
        foreach ($orders as $orderData) {
            $orderSync->syncOrder($this->shop, $orderData);
        }
        
        $this->shop->update(['last_order_sync_at' => now()]);
    }
}
```

**Poznámky**:
- ✅ Dobře strukturované joby s proper timeouty
- ✅ Každý job má správně nastavenou queue
- ⚠️ **Problém**: `FetchNewOrdersJob` může být duplikován při overlappingu
- 💡 **Optimalizace**: Přidat job locking

#### 6. **Plugin System** (Shoptet addony)
**Soubory**:
- `Http/Controllers/PluginController.php`
- `Http/Controllers/PluginAdminController.php`
- `Http/Controllers/PluginGeneratorController.php`
- `Models/ShoptetPluginVersion.php`

**Co to je**:
- Systém pro vytváření a hosting Shoptet pluginů (addony do e-shopu)
- Generator pluginů z admin rozhraní
- Verzování pluginů
- Hosting plugin souborů na `/plugins/{bundleKey}/{version}/`

**Poznámky**:
- ⚠️ **Needs review**: Tato funkcionalita je velmi specifická
- 💡 Potřeba zjistit, jak často se používá

### API Endpointy (Shoptet)

```
# Shop Management
GET    /api/shoptet/shops                          - List all shops
POST   /api/shoptet/shops                          - Create shop
GET    /api/shoptet/shops/{shop}                   - Shop detail
PUT    /api/shoptet/shops/{shop}                   - Update shop
DELETE /api/shoptet/shops/{shop}                   - Delete shop
POST   /api/shoptet/shops/{shop}/refresh-token     - Manual token refresh

# Snapshots
POST   /api/shoptet/shops/{shop}/snapshots/products   - Request products snapshot
POST   /api/shoptet/shops/{shop}/snapshots/orders     - Request orders snapshot
POST   /api/shoptet/shops/{shop}/snapshots/customers  - Request customers snapshot

# Webhook Jobs
GET    /api/shoptet/shops/{shop}/webhook-jobs         - List webhook jobs
POST   /api/shoptet/shops/{shop}/webhook-jobs/{id}/download - Manual download

# Sync
POST   /api/shoptet/shops/{shop}/sync/products        - Sync products (full)
POST   /api/shoptet/shops/{shop}/sync/products/bootstrap - Bootstrap import
POST   /api/shoptet/shops/{shop}/sync/products/{translation}/push - Push translation
POST   /api/shoptet/shops/{shop}/sync/orders          - Sync orders

# Pipelines (monitoring)
GET    /api/shoptet/shops/{shop}/pipelines            - Snapshot pipeline status

# Webhooks (public endpoint!)
POST   /api/shoptet/webhooks?token={webhook_token}    - Receive Shoptet webhooks

# Plugins
GET    /api/shoptet/plugins                           - List plugins
POST   /api/shoptet/plugins/generate                  - Generate plugin
GET    /public/plugins/{bundleKey}/{version}/         - Serve plugin files
```

### Database Schema (Shoptet)

```sql
-- shops
CREATE TABLE shops (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    provider VARCHAR(50) DEFAULT 'shoptet',  -- shoptet | woocommerce
    domain VARCHAR(255),
    default_locale VARCHAR(5),
    timezone VARCHAR(50),
    locale VARCHAR(5),
    is_master BOOLEAN DEFAULT FALSE,
    settings JSON,
    api_mode VARCHAR(20),                    -- premium | private | partner
    currency_code VARCHAR(3),
    customer_link_shop_id INTEGER REFERENCES shops(id),
    webhook_secret VARCHAR(255),
    webhook_token VARCHAR(255),              -- Pro autentizaci webhooků
    last_order_sync_at TIMESTAMP,
    orders_total INTEGER DEFAULT 0,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- shop_tokens
CREATE TABLE shop_tokens (
    id SERIAL PRIMARY KEY,
    shop_id INTEGER REFERENCES shops(id) UNIQUE,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP,
    token_data JSON,                         -- Celá OAuth response
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- shoptet_webhook_jobs
CREATE TABLE shoptet_webhook_jobs (
    id SERIAL PRIMARY KEY,
    shop_id INTEGER REFERENCES shops(id),
    webhook_event VARCHAR(255),              -- e.g. "job:finished"
    shoptet_job_id INTEGER,                  -- ID jobu na Shoptetu
    endpoint VARCHAR(255),                   -- e.g. "/api/products/snapshot"
    status VARCHAR(50),                      -- pending | downloaded | processing | completed | failed
    result_url TEXT,                         -- URL pro stažení snapshot souboru
    file_path TEXT,                          -- Lokální cesta ke staženému souboru
    payload JSON,                            -- Celý webhook payload
    processed_count INTEGER DEFAULT 0,       -- Kolik záznamů bylo zpracováno
    error_message TEXT,
    started_processing_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- shoptet_plugin_versions
CREATE TABLE shoptet_plugin_versions (
    id SERIAL PRIMARY KEY,
    bundle_key VARCHAR(255),                 -- Unikátní klíč pluginu
    version VARCHAR(50),
    manifest JSON,                           -- Plugin manifest
    files JSON,                              -- Seznam souborů
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Závěry a doporučení (Shoptet modul)

#### ✅ Silné stránky:
1. **Robustní snapshot pipeline** - zvládá velkoobjemové importy (10k+ produktů)
2. **Automatický token refresh** - OAuth2 správně implementován
3. **Multi-shop support** - dobře navržený pro správu více e-shopů
4. **Webhook systém** - asynchronní zpracování dat
5. **Queue isolation** - `snapshots` queue oddělená od ostatních

#### ⚠️ Kritická zjištění:
1. **Snapshot processing může failnout** - není retry mechanismus
2. **Token refresh race conditions** - dva requesty současně mohou způsobit problém
3. **FetchNewOrdersJob může běžet duplicitně** - chybí locking
4. **Paginace načte VŠE do paměti** - může způsobit memory exhaustion
5. **Chybí progress tracking** - uživatel neví, kolik % snapshot je hotovo

#### 💡 Doporučené optimalizace:

1. **Přidat job locking pro FetchNewOrdersJob**:
   ```php
   public function handle(...) {
       $lock = Cache::lock("fetch-orders:{$this->shop->id}", 300);
       if (!$lock->get()) {
           return; // Already running
       }
       try {
           // ... existing code ...
       } finally {
           $lock->release();
       }
   }
   ```

2. **Generator pattern pro paginaci**:
   ```php
   private function fetchPaginatedCollectionGenerator(Shop $shop, string $path, ...): \Generator {
       $page = 1;
       do {
           $response = $this->request(...);
           $items = Arr::get($response, $dataPath, []);
           
           foreach ($items as $item) {
               yield $item;  // Lazy loading!
           }
           
           $page++;
       } while (count($items) > 0);
   }
   ```

3. **Progress tracking pro snapshots**:
   ```php
   // V ProcessShoptetSnapshot
   $totalLines = $this->countLines($file);
   $processed = 0;
   
   foreach ($this->readLines($file) as $line) {
       // ... process ...
       $processed++;
       
       if ($processed % 100 === 0) {
           $this->webhookJob->update([
               'processed_count' => $processed,
               'progress_percentage' => ($processed / $totalLines) * 100,
           ]);
       }
   }
   ```

4. **Mutex pro token refresh**:
   ```php
   private function refreshToken(Shop $shop): void {
       $lock = Cache::lock("token-refresh:{$shop->id}", 10);
       $lock->block(5);  // Wait max 5 seconds
       
       try {
           $token = $shop->token->fresh();
           if (!$token->isExpired()) {
               return; // Another request already refreshed
           }
           
           // ... refresh logic ...
       } finally {
           $lock->release();
       }
   }
   ```

5. **Retry mechanismus pro failed snapshots**:
   ```php
   // Přidat do ShoptetWebhookJob model
   public function canRetry(): bool {
       return $this->status === 'failed' 
           && $this->retry_count < 3 
           && $this->created_at->isAfter(now()->subHours(24));
   }
   
   // Command pro retry
   php artisan shoptet:retry-failed-snapshots
   ```

---

## 🔍 MODUL: PIM (Product Information Management) (pokračování analýzy...)
