# Kompletní analýza - PRODUKČNÍ DATABÁZE

## 📊 Produkční data - KRITICKÉ informace

**Datum měření**: 2. ledna 2026, 21:20 UTC

### Největší tabulky (po velikosti):
1. **order_items** - 10 GB, 8,284,564 řádků ⚠️ MEGA
2. **orders** - 6.6 GB, 1,484,975 řádků ⚠️ OBROVSKÉ
3. **customers** - 901 MB, 661,570 řádků
4. **customer_accounts** - 189 MB, 602,095 řádků
5. **product_shop_overlays** - 105 MB, 23,602 řádků
6. **customer_metrics** - 103 MB, 592,496 řádků

### Důležité vztahy:
```
Orders (1.4M) → Order Items (8.2M)  [1:n relationship = obrovská tabulka!]
Customers (661k) → Customer Accounts (602k) [1:n, téměř 1:1]
Products (4.4k) → Product Variants (4.4k) → Product Shop Overlays (23k)
Products (4.4k) → Product Translations (17.9k)
```

### ⚠️ KRITICKÉ ZJIŠTĚNÍ:
**order_items tabulka je 8.2 MILIONŮ řádků!** To je ~6-7x větší než objednávky!
→ Znamená to, že průměrně je 5-6 položek na objednávku

**Implikace pro vývoj**:
- Jakákoliv migrace nebo změna schématu order_items = VELMI riziková
- Indexy jsou KRITICKÉ pro performance
- Bulk operace mohou být pomalé
- Batching je NUTNÝ

---

## 🔍 MODULÁRNÍ ARCHITEKTURA - DETAILNÍ ROZPIS

### Modul počítadlo:
- **Services**: 53 souborů
- **Models**: 55 souborů  
- **Jobs**: 22 souborů

### MODUL INVENTORY (skladové zásoby)

**Umístění**: `backend/modules/Inventory/`

**Odpovědnosti**:
- ✅ Správa skladových zásob (z Shoptetu)
- ✅ Forecasting (predikce budoucí poptávky)
- ✅ Nákupní objednávky (purchase orders z ElogistClient)
- ✅ Recommendations (doporučení co koupit)
- ✅ Stock Guard integrace (Elogist)
- ✅ Low-stock alerting

**Klíčové modely**:
- `ProductVariant` - S campos: `stock_quantity`, `min_stock_level`, `stock_status`
- `InventoryVariantMetrics` - Agregované metriky (avg prodej, variance, atd)
- `InventoryVariantForecast` - Predikce budoucích zásob
- `InventoryVariantRecommendation` - Doporučení: "koupit 500 kusů za 3 dny"
- `InventoryPurchaseOrder` - Nákupní objednávka (od/do ElogistClient)
- `InventoryStockGuardSnapshot` - Export pro ElogistClient

**Datové toky**:
```
Shoptet Snapshot → Import Products with stock_quantity
    ↓
InventoryVariantMetrics (daily/weekly calculation)
    ↓
InventoryVariantForecast (predict next 30 days)
    ↓
InventoryVariantRecommendation (AI: kolik koupit)
    ↓
InventoryPurchaseOrder (create PO for suppliers)
    ↓
ElogistClient (sync s jejich systémem)
```

**Důležité joby**:
1. `ForecastInventoryVariantsJob` - Queue: `inventory_recommendations`, Timeout: 2h
2. `GenerateInventoryRecommendationsJob` - AI generace doporučení
3. `RecalculateInventoryVariantMetricsJob` - Přepočet statistik
4. `SyncInventoryStockGuardJob` - Sync s ElogistClient

**Poznámky**:
- ⚠️ **Issue**: Forecasting je CPU-intensive (exponential smoothing na 30 dní)
- ⚠️ **Issue**: Recommendations generují miliony řádků (33M inventory_product_recommendations!)
- 💡 Potřeba partitioning tabulek

---

### MODUL CUSTOMERS (zákazníci)

**Umístění**: `backend/modules/Customers/`

**Odpovědnosti**:
- ✅ Synchronizace zákazníků (ze Shoptetu)
- ✅ Customer segmentation (VIP, dormant, atd)
- ✅ Customer tagging (nové v produkci!)
- ✅ Customer tag rules (automátické značení)
- ✅ Customer metrics (LTV, purchase frequency, atd)
- ✅ Customer notes

**Klíčové modely**:
- `Customer` - 661k řádků
- `CustomerAccount` - 602k řádků (dřívější účet)
- `CustomerTag` - Tagy zákazníků (nové)
- `CustomerTagRule` - Pravidla pro automtické tagging
- `CustomerMetrics` - Agregované metriky (592k řádků!)
- `CustomerNote` - Poznámky k zákazníkům

**Datové toky**:
```
Shoptet Customer Snapshot → CustomerSnapshotImporter
    ↓
Customer + CustomerAccount models
    ↓
RecalculateCustomerMetricsJob (weekly)
    ↓
CustomerMetrics (LTV, frequency, avg_order_value, atd)
    ↓
ApplyCustomerTagRulesJob (daily)
    ↓
CustomerTag (automatic segmentation)
```

**Poznámky**:
- ✅ Customer tagging je nový a moderní feature
- ⚠️ **Issue**: 602k customer_accounts - proč jsou obě tabulky?
- ⚠️ **Issue**: CustomerMetrics má 592k řádků - je to 1:1 s customers?
- 💡 **Výzva**: Jak propojit zákazníky mezi více shopy?

---

### MODUL ORDERS (objednávky)

**Umístění**: `backend/modules/Orders/`

**Odpovědnosti**:
- ✅ Synchronizace objednávek (ze Shoptetu)
- ✅ Order items tracking
- ✅ Order analysis a reporting

**Klíčové modely**:
- `Order` - 1.4M řádků! ⚠️
- `OrderItem` - 8.2M řádků! ⚠️⚠️⚠️ MEGA TABULKA
- Status tracking (pending, processing, shipped, delivered)

**Datový tok**:
```
Shoptet Order Snapshot → OrderSnapshotImporter
    ↓
Order model (1.4M)
    ↓
OrderItem model (8.2M) - jedna řádka na položku
```

**Poznámky**:
- ⚠️ **KRITICKÉ**: order_items je ENORM - 10 GB na disku!
- ⚠️ **Issue**: Žádné partitioning (měl by být)
- 💡 **Performance risk**: Jakákoliv analýza všech order items = pomalá
- 💡 **Archiving**: Staré objednávky (>1 rok) by měly být archivovány

---

### MODUL PIM (Product Information Management)

**Umístění**: `backend/modules/Pim/`

**Odpovědnosti**:
- ✅ Správa produktů a variant
- ✅ Překlady produktů (workflow: draft → review → approved → synced)
- ✅ Product overlays (shop-specific customization)
- ✅ Category mapping (Shoptet → vlastní kategorie)
- ✅ Category sorting (ordenování produktů v kategoriích)
- ✅ Product widgets (embedded produktové seznamy)
- ✅ Attribute mapping (párování atributů)

**Klíčové modely**:
- `Product` - 4.4k řádků (UUID jako PK!)
- `ProductVariant` - 4.4k řádků
- `ProductTranslation` - 17.9k řádků (překlady)
- `ProductVariantTranslation` - 17.4k řádků
- `ProductShopOverlay` - 23.6k řádků (shop-specific data)
- `ProductWidget` - Embedded list widgety
- `CategoryNode` - Vlastní kategorie
- `CategoryMapping` - Mapování Shoptet → vlastní kategorie

**Translation Workflow** (KRITICKÝ):
```
1. DRAFT - Editor píše překlad
2. IN_REVIEW - Editor podá k review
3. APPROVED - Reviewer schválí
4. SYNCED - Automaticky synchnuto do Shoptetu
```

**Poznámky**:
- ✅ UUID jako primary key (good practice!)
- ✅ Workflow management pro překlady
- ✅ AI translation assistance (v produkci!)
- ⚠️ **Issue**: Product je málo (4.4k) - jsou nové produkty?
- ⚠️ **Issue**: Translations neodpovídá - 17.9k vs očekávaných 4.4k × locales
- 💡 Potřeba analýzy jak jsou produkty propojeny mezi shopy

---

### MODUL ANALYTICS (analýzy a reporty)

**Umístění**: `backend/modules/Analytics/`

**Odpovědnosti**:
- ✅ KPI dashboard (počet produktů, orders, revenue, atd)
- ✅ Report generation
- ✅ Data analysis

**Poznámky**:
- Relativně jednoduchý modul
- Používá data z ostatních modulů

---

### MODUL DASHBOARD

**Umístění**: `backend/modules/Dashboard/`

**Odpovědnosti**:
- ✅ Hlavní dashboard se souhrnem

---

### MODUL ADMIN

**Umístění**: `backend/modules/Admin/`

**Odpovědnosti**:
- ✅ Správa uživatelů
- ✅ Role a permissions (Spatie)

---

### MODUL MICROSITES (mikrostránky)

**Umístění**: `backend/modules/Microsites/` (NOVÝ!)

**Odpovědnosti**:
- ✅ Generování single-product págí (mikrostránky)
- ✅ Publikace mikrostránek
- ✅ Product resolver (který produkt je na které stránce)

**Datový tok**:
```
Product → MicrositeGenerator → HTML stránka
    ↓
Microsite + MicrositePublication (record)
    ↓
Publish (deploy na web)
```

**Poznámky**:
- Nový modul - potřeba podrobnější analýza
- Pravděpodobně je experimentální

---

### MODUL WOOCOMMERCE (integraci)

**Umístění**: `backend/modules/WooCommerce/` (NOVÝ!)

**Odpovědnosti**:
- ✅ WooCommerce integrace (alternativa k Shoptetu)
- ✅ Sync produktů s WooCommerce

**Poznámky**:
- Nový modul - experimentální
- Umožňuje spravovat i WooCommerce e-shopy

---

## 🔄 DATOVÉ TOKY - KOMPLETNÍ MAPA

### Primární datový tok (Shoptet → HUB):
```
┌─────────────────────────────────────────────────────────┐
│ SHOPTET API (oauth2-authenticated)                      │
└────────────────┬────────────────────────────────────────┘
                 │
    ┌────────────┴────────────┬──────────────┐
    │                         │              │
    ▼                         ▼              ▼
SNAPSHOT PIPELINE    INCREMENTAL SYNC    WEBHOOKS
    │                   │                  │
    ├─ Products         ├─ New Orders      └─ job:finished
    ├─ Orders           ├─ Order Updates       → StorageClient
    └─ Customers        └─ Product Updates     → DownloadShoptetSnapshot
                                               → ProcessShoptetSnapshot
         ↓
    ┌─────────────────────────┐
    │ SNAPSHOT IMPORTER       │
    │ (Processes JSON Lines)  │
    └────────┬────────────────┘
             │
    ┌────────┴──────────┬──────────┐
    │                   │          │
    ▼                   ▼          ▼
 PRODUCTS         ORDERS      CUSTOMERS
 + Variants       + Items      + Accounts
 + Translations   + Metrics    + Metrics
 + Overlays
    │
    └─→ METRICS CALCULATION (daily)
         │
         ├─ CustomerMetrics
         ├─ InventoryVariantMetrics
         └─ ...
```

### Sekundární datové toky:
```
PIM → PUSH → Shoptet API
 (Manual translation push)

Inventory → Stock Updates → Shoptet
 (Update stock quantities)

Customer Tags → Applied via Rules
 (Daily job updates customer segments)
```

---

## 🗄️ DATABASE SCHÉMA - KRITICKÉ TABULKY

### TIER 1: FOUNDATION (core data, musí fungovat)

```
shops (100s)
├── shop_tokens (OAuth2)
└── [1:1 relationships]

products (4k)
├── product_variants (4k)
├── product_translations (17k)
├── product_variant_translations (17k)
├── product_shop_overlays (23k)
└── [translations per locale]

orders (1.4M) ⚠️ BIG
└── order_items (8.2M) ⚠️⚠️ MEGA!
    [~5.5 items per order on average]

customers (661k)
├── customer_accounts (602k)
└── customer_metrics (592k) [1:1 with customers?]
```

### TIER 2: ANALYTICS (derived, can be recalculated)

```
inventory_variant_metrics (13k)
├── inventory_variant_recommendations (9k)
└── inventory_variant_forecasts (...)

inventory_product_recommendations (33M!) ⚠️ HUGE

snapshot_executions (96k) [audit trail]

notification_deliveries (...)
notification_user_states (1.7k)
```

### TIER 3: FEATURES (new/experimental)

```
customer_tags (...)
customer_tag_rules (...)
product_widgets (384 kB)
microsites (568 kB)
shoptet_plugin_versions (2.8 MB)
```

---

## 🚀 FRONTEND - ARCHITEKTURA (React 19 + Mantine UI 8)

**Struktura**:
```
frontend/src/
├── app/
│   ├── router.tsx (React Router v6)
│   ├── routes.tsx (route definitions)
│   ├── providers.tsx (Mantine + TanStack Query)
│   └── components/
│       └── AppShellRoute.tsx (layout wrapper)
├── features/
│   ├── products/ (PIM)
│   ├── orders/
│   ├── customers/
│   ├── inventory/
│   ├── analytics/
│   ├── settings/
│   └── [ostatní]
├── components/
│   ├── layout/ (AppLayout, PageShell)
│   ├── table/ (DataTable s virtualizací)
│   ├── shop/ (Shop-related)
│   └── ui/ (generic UI)
├── api/
│   ├── pim.ts
│   ├── orders.ts
│   ├── customers.ts
│   ├── inventory.ts
│   └── [ostatní API clients]
├── hooks/
│   └── useUserPreference.ts
└── theme/
    └── index.ts (Mantine theme customization)
```

**Tech Stack**:
- **Router**: React Router v6
- **State**: TanStack Query (server state) + Zustand (UI state)
- **UI**: Mantine v8 (components)
- **Table**: @tanstack/react-table + @tanstack/react-virtual (virtualization)
- **Forms**: react-hook-form + Mantine hooks
- **HTTP**: Axios
- **Build**: Vite 7

**Key features**:
- ✅ Virtual scrolling pro velké tabulky (>1000 řádků)
- ✅ Responsive design (mobile + desktop)
- ✅ Dark mode toggle
- ✅ User preferences persistence

**Poznámky**:
- ⚠️ **Issue**: Tabulky s 8M order items = MUSÍ mít server-side pagination
- 💡 **Optimization**: Implementovat infinite scroll nebo cursor pagination

---

## 📈 PERFORMANCE METRIKY - PRODUKČNÍ STAV

### Database sizes:
- **Total DB size**: ~30 GB (order_items sám 10 GB)
- **Largest table**: order_items (10 GB)
- **Row counts**: 8.2M rows v order_items

### Query performance expectations:
- **Products**: 4k řádků → Sub-second queries
- **Orders**: 1.4M řádků → Depends on index; range queries OK
- **Order Items**: 8.2M řádků → MUST use indexes, pagination REQUIRED
- **Customers**: 661k řádků → OK
- **Translations**: 17k řádků → OK

### Queue performance:
- **snapshots queue**: ~96k executions (průměrně 30 za den?)
- **Snapshot processing time**: Až 2 hodiny (300k+ rows)
- **Frontend rebuild**: Vite (hot reload) vs production build

---

## ✅ SHRNUTÍ SOUČASNÉHO STAVU

### Co funguje dobře:
1. ✅ Modular architecture (12 modules, jasně odděleno)
2. ✅ Queue system (6 specialized queues)
3. ✅ Multi-shop support
4. ✅ Webhook system (asynchronous processing)
5. ✅ React + Mantine UI (modern stack)
6. ✅ Virtual scrolling (efficient rendering)

### Co má problémy:
1. ⚠️ order_items je OBROVSKÁ (8.2M řádků, 10 GB)
2. ⚠️ Snapshot processing bez retry mechanismu
3. ⚠️ Settings bez cache
4. ⚠️ Job scheduling bez lockingu
5. ⚠️ Token refresh race conditions
6. ⚠️ Paginace načítá VŠE do paměti
7. ⚠️ AI calls bez rate limiting
8. ⚠️ Inventory recommendations (33M řádků!) - není partitioned

### Co je nové/experimentální:
1. 🟡 Microsites modul
2. 🟡 WooCommerce integrace
3. 🟡 Customer tagging + rules
4. 🟡 Product widgets

---

## 📋 ZÁVĚRY PRO BEZPEČNOST A VÝVOJ

### TIER 1: DATA INTEGRITY - MUSÍME CHRÁNIT!
- orders + order_items (1.4M + 8.2M)
- customers + customer_accounts (661k + 602k)
- products + variants (4k + 4k)

**Pravidla**:
- ❌ NIKDY bez backupu
- ❌ NIKDY bez testing na dev DB
- ❌ Migrace pouze po ranní hodině (off-peak)
- ❌ Vždy dry-run před deploy

### TIER 2: ANALYTICS - můžeme recalculate
- inventory_metrics (13k)
- customer_metrics (592k)
- recommendations (33M)

**Pravidla**:
- ✅ Lze smazat a regenerovat
- ✅ Menší riziko

### TIER 3: FEATURES - experimentální
- Microsites
- WooCommerce
- Product widgets

**Pravidla**:
- ✅ Vyšší riziko je OK (nové kódy)
- ✅ Lze rollback
