# 🎯 Product Widget Architecture - Kompletní Přehled

**Status**: V rozpracování  
**Datum**: 3. ledna 2026  
**Cíl**: Pochopit jak se widgety vytváří, skladují, spravují a jak je lze rozšiřovat

---

## 📊 ČÁST 1: DATABÁZOVÁ ARCHITEKTURA

### Tabulky

```
┌─────────────────────────────────┐
│      product_widgets            │
├─────────────────────────────────┤
│ id: UUID (primary)              │
│ name: string(255)               │
│ slug: string(255) unique        │
│ status: string (draft|published)│
│ public_token: UUID unique       │
│ shop_id: FK(shops)              │
│ locale: string(12) - cs/sk/...  │
│ settings: JSON                  │
│ html_markup: text (cached!)     │
│ created_at / updated_at         │
└─────────────────────────────────┘
         1:N
         │
         ├──→ product_widget_items
                ├─ id: UUID
                ├─ product_widget_id: FK
                ├─ product_id: FK(products)
                ├─ product_variant_id: FK(product_variants)
                ├─ position: int
                ├─ payload: JSON
                └─ created_at / updated_at
```

### Schema Details

**product_widgets.settings** (JSON):
```json
{
  "title": "Podobné produkty",
  "container_id": "kv-widget-123",
  "container_class": "products-block",
  "disable_styles": false,
  "heading": "Doporučujeme také"
}
```

**product_widgets.html_markup** (cached):
- Vyrenderovaný HTML widget
- Aktualizuje se v `ProductWidgetController::refreshMarkup()`
- **Zrychluje** zobrazení na Shoptet storefront

**product_widget_items.payload** (JSON - KRITICKÁ ČÁST):
```json
{
  "title": "Baccarat Rouge 540",
  "subtitle": "Eau de parfum",
  "url": "https://shop.com/baccarat-540",
  "detail_url": "https://shop.com/baccarat-540",
  "image_url": "https://cdn.com/image.jpg",
  "mini_image_url": "https://cdn.com/thumb.jpg",
  "gender": "unisex",
  "gender_icon_url": "/svg/unisex.svg",
  "appendix_background_url": "/bg/uni.svg",
  "title_color": null,
  "flags": [
    { "label": "LIMITKA", "class": "flag-premium" }
  ],
  "tags": ["Rose", "Musk", "Wood"],
  "inspired_by_brand": "Francis Kurkdjian",
  "inspired_by_title": "Baccarat Rouge 540",
  "price": {
    "current": "2490",
    "current_value": 249000,
    "original": "2990",
    "original_value": 299000,
    "volume": "100ml",
    "volume_value": 100,
    "discount": null,
    "action_price": "2190",
    "base_price": "2990"
  },
  "buy_button": {
    "label": "Do košíku",
    "variant_id": "uuid-123",
    "variant_code": "BR540-100ML",
    "attributes": {}
  },
  "detail_button": {
    "label": "Detail",
    "url": "https://shop.com/baccarat-540",
    "attributes": {}
  },
  "variant_options": [
    {
      "label": "50ml",
      "variant_id": "uuid-456",
      "price": "1890",
      "variant_price": 189000,
      "variant_original_price": 2290,
      "variant_discount_percentage": 17,
      "volume": "50ml",
      "volume_display": "50ml",
      "image_url": "...",
      "url": "..."
    }
  ],
  "original_name": "Baccarat Rouge 540",
  "match_reasons": ["Stejná inspirace: Baccarat Rouge 540"],
  "hide_match_reasons": false
}
```

---

## 🔄 ČÁST 2: WORKFLOW - VYTVÁŘENÍ WIDGETU

### Frontend Flow

```
┌─────────────────────────────────────────────────────────────┐
│ ProductWidgetDetailPage.tsx                                 │
├─────────────────────────────────────────────────────────────┤
│ 1. User klikne "Nový widget"                                │
│    → WidgetFormState initialized (empty)                    │
│                                                             │
│ 2. User vyplní:                                             │
│    - name: "Inspirované parfumy"                           │
│    - slug: (auto-generated)                                │
│    - shop_id: 1                                            │
│    - locale: "cs"                                          │
│    - settings: { heading: "...", ... }                     │
│                                                             │
│ 3. User přidává produkty (ProductPickerModal)              │
│    - Hledá variant v databázi                              │
│    - Klika na produkt → fetchOriginalInfo() → API call     │
│    - applyOriginalInfoToPayload() → obohacuje data         │
│    - WidgetItemFormValue se přidá do form.items[]          │
│                                                             │
│ 4. User edituje položku (updateItemPayload)                │
│    - Změní cenu: updateItemPrice(index, "current", "2500") │
│    - Změní tag: form.items[i].payload.tags = [...]         │
│    - Změní brand: form.items[i].payload.inspired_by_brand  │
│                                                             │
│ 5. User klikne ULOŽIT                                       │
│    → buildPayloadForRequest() → builduje complete payload  │
│    → POST /api/pim/product-widgets                         │
└─────────────────────────────────────────────────────────────┘
```

### Payload Structure (Frontend → Backend)

```typescript
// ProductWidgetUpsertPayload
{
  name: "Inspirované parfumy",
  slug: "inspirovane-parfumy",
  status: "published",
  shop_id: 1,
  locale: "cs",
  settings: {
    heading: "Doporučujeme také",
    container_id: "kv-widget-xyz",
    container_class: "products-block",
    disable_styles: false
  },
  items: [
    {
      product_id: "uuid-product-1",
      product_variant_id: "uuid-variant-1",
      position: 0,
      payload: {
        title: "Baccarat Rouge 540",
        price: { current: "2490", original: "2990" },
        // ... dalších 30+ polí
      }
    }
    // ... dalších položek
  ],
  regenerate_token: false
}
```

### Backend Processing

```php
// ProductWidgetController::store()
1. validateWidget($request)
   - Validace všech polí
   - normalizePayload() - čistí tagy, variant_options, atd.
   - Vrací structured payload

2. ProductWidget::create($payload['widget'])
   - Uloží do tabulky product_widgets
   - Automaticky generuje: id, public_token

3. syncItems($widget, $payload['items'])
   - Smaže staré ProductWidgetItem
   - Vytvoří nové pro každou položku
   - Uloží kompletní payload do JSON

4. refreshMarkup($widget)
   - ProductWidgetRenderer::render()
   - Vyrenderuje Blade šablonu s CSS
   - Uloží HTML do widget.html_markup
   - Vrací: { html, styles, settings }
```

---

## 📁 ČÁST 3: SPRÁVA WIDGETŮ

### CRUD Operace

#### **CREATE** ✅
```
POST /api/pim/product-widgets
{
  name: "Widget name",
  items: [ { product_variant_id, payload }, ... ],
  status: "draft"
}
Response: ProductWidget { id, public_token, html_markup, ... }
```

#### **READ** ✅
```
GET /api/pim/product-widgets              # list all
GET /api/pim/product-widgets/{id}         # fetch one with render

Response: {
  id, name, slug, status, shop_id, locale,
  items: [ ProductWidgetItem[], ],
  render: { html, styles, settings }
}
```

#### **UPDATE** ✅
```
PUT /api/pim/product-widgets/{id}
{
  name, slug, status, locale, settings,
  items: [ { position, payload }, ... ]
}
```

#### **DELETE** ✅
```
DELETE /api/pim/product-widgets/{id}
```

#### **MANAGE ITEMS** (částečně)
```
Úprava jednotlivé položky:
  PUT /api/pim/product-widgets/{id}
    → Replace všechny items najednou

❌ CHYBÍ:
  - PATCH /api/pim/product-widgets/{id}/items/{item_id}
  - DELETE /api/pim/product-widgets/{id}/items/{item_id}
  - POST /api/pim/product-widgets/{id}/items
```

### Frontend UI (ProductWidgetDetailPage.tsx)

```
┌──────────────────────────────────────────┐
│ Widget Basic Info                        │
├──────────────────────────────────────────┤
│ Name: [input]                           │
│ Slug: [input]                           │
│ Status: [draft|published]               │
│ Shop: [select]                          │
│ Locale: [cs|sk|hu|ro|hr]               │
│ Settings (advanced):                    │
│   - Container ID                        │
│   - Container Class                     │
│   - Disable Styles                      │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ Widget Items (draggable list)            │
├──────────────────────────────────────────┤
│ ╔════════════════════════════════════╗  │
│ ║ 1. Baccarat Rouge 540             ║  │
│ ║ [Edit] [Remove] [⋮ drag handle]   ║  │
│ ║                                    ║  │
│ ║ Basic:                              ║  │
│ ║   Title: [editable]                ║  │
│ ║   URL: [editable]                  ║  │
│ ║                                    ║  │
│ ║ Price:                              ║  │
│ ║   Current: [editable]              ║  │
│ ║   Original: [editable]             ║  │
│ ║   Discount: [calc or manual]       ║  │
│ ║                                    ║  │
│ ║ Inspiration (voor nonFragrance):   ║  │
│ ║   Brand: [editable]                ║  │
│ ║   Title: [editable]                ║  │
│ ║                                    ║  │
│ ║ Tags:                               ║  │
│ ║   [Rose] [Musk] [Wood] [+Add]     ║  │
│ ║                                    ║  │
│ ║ Variants:                           ║  │
│ ║   50ml - 1890 Kč                  ║  │
│ ║   100ml - 2490 Kč [selected]      ║  │
│ ║                                    ║  │
│ ║ [Advanced] (flags, genders, etc)   ║  │
│ ╚════════════════════════════════════╝  │
│                                          │
│ [+ Přidat produkty] [Uložit] [Zrušit]  │
└──────────────────────────────────────────┘
```

---

## 🎯 ČÁST 4: RENDERING PIPELINE

### ProductWidgetRenderer.php (Backend)

```
Input:  ProductWidget { id, items[], settings, locale }
├─ Normalizuje items
│  ├─ Extrahuje payload z každého ProductWidgetItem
│  ├─ Mapuje payload na strukturu pro Blade
│  ├─ Výsledek: array items[] se všemi poli
│
├─ Normalizuje flags, tags, variant_options
│  ├─ Filtruje null hodnoty
│  ├─ Konvertuje datové typy
│
├─ Připravuje settings
│  ├─ Generuje container_id (pokud chybí)
│  ├─ Slučuje třídy CSS
│
└─ Volá view('pim::widgets.embed', $prepared)
   ├─ embed.blade.php renderuje HTML
   ├─ buildStyles() vrací CSS string
   └─ Output: { html, styles, settings }
```

### embed.blade.php (Blade Template)

```
STRUKTURA:
┌─────────────────────────────────────┐
│ <style>                             │
│   CSS rules (inline)                │
│ </style>                            │
│                                     │
│ <div id="container" class="...">   │
│   <h3>Heading</h3>                 │
│   <div class="kv-widget-slider">   │
│     <button class="nav prev">◄</button>
│     <div class="viewport">          │
│       <div class="track">           │
│         @foreach items as item      │
│           <div class="slide">       │
│             <div class="p">         │
│               <a class="image">     │
│                 <img src="...">     │
│               </a>                  │
│               <div class="name">    │
│                 {{ item.title }}    │
│               </div>                │
│               <div class="appendix">│
│                 Zaměňována s:       │
│                 {{ brand }} {{ title }}
│               </div>                │
│               <div class="tags">    │
│                 @foreach tags       │
│                   <span>{{ tag }}</span>
│               </div>                │
│               <div class="price">   │
│                 {{ current }} Kč    │
│                 <del>{{ original }} Kč</del>
│               </div>                │
│               <button>Do košíku</button>
│             </div>                  │
│           </div>                    │
│         @endforeach                 │
│       </div>                        │
│     </div>                          │
│     <button class="nav next">►</button>
│   </div>                            │
│ </div>                              │
└─────────────────────────────────────┘
```

### Caching Strategy

```
┌─ ProductWidget.html_markup
│  └─ Uloží se vyrenderovaný HTML
│  └─ Aktualizuje se pouze když se změní widget
│  └─ Na Shoptet frontend se vrací z cache
│
├─ ProductWidgetRenderer.buildStyles()
│  └─ Vrací CSS na letu (není cachován)
│  └─ **PROBLÉM**: Vyrenderuje se 2x (inline + buildStyles)
│
└─ Blade View Cache (Laravel)
   └─ Blade šablona se kompiluje do PHP cache
   └─ **PROBLÉM**: Obrovská šablona = pomalé kompilování
```

---

## 🔌 ČÁST 5: INTEGRAČNÍ BODY

### Shoptet Integration

```
1. EMBED na Shoptet:
   <script src="https://hub.kv.cz/api/pim/product-widgets/{public_token}/script"></script>
   
   Endpoint: GET /api/pim/product-widgets/{token}/script
   ├─ Najde widget podle public_token
   ├─ Renderuje HTML + CSS + JS pro Shoptet
   ├─ Cache: 30 sekund (Content-Type: application/javascript)

2. SHOPTET PLUGIN:
   - Plugin generuje <script> tag automaticky
   - Data source: "widget" (náš widget) nebo "inventory_recommendations"
   - Umístění: before/after/prepend/append

3. MULTI-SHOP:
   - Widget: shop_id (kterému shopu patří)
   - Overlay: per shop prices/currencies
   - Translations: per shop/locale names
```

### Inventory Recommendations Integration

```
// Auto-generate widgety
POST /api/pim/auto-widgets/nonFragrance
{
  shop_id: 1,
  locale: "cs",
  limit: 12,
  algorithm: "trending|bestselling|new"
}

Response: {
  // Vyrenderovaný widget
  html, styles, settings
}

❌ IMPLEMENTACE: V ROZPRACOVÁNÍ
   - builNonFragranceWidget() zatím ignoruje inspiraci
   - Měl by používat InventoryRecommendationService
```

---

## 🚀 ČÁST 6: BUDOUCÍ MOŽNOSTI VYUŽITÍ

### 1. **Multi-Language Support** ✅ (Částečně)
```
Podporuje se: widget.locale (cs, sk, hu, ro, hr)
              Dynamické translation strings v Blade

❌ CHYBÍ:
- Translations service (strings jsou hardcoded v Blade)
- Per-shop/locale variant customizace
```

### 2. **Dynamic Widget Builder API** 🚧
```
POST /api/pim/auto-widgets/generate
{
  algorithm: "inspiration_based|bestselling|seasonal",
  base_variant_id?: "uuid",  // For inspiration matching
  filter_by?: "brand|category|price_range",
  limit: 12,
  shop_id: 1,
  locale: "cs"
}

Response: Complete ProductWidget ready to publish
```

### 3. **Bulk Import/Export** 🔄
```
Export widgety jako JSON:
  GET /api/pim/product-widgets/export?format=json&status=published
  
Import z JSON/CSV:
  POST /api/pim/product-widgets/import
  {
    source: "csv|json",
    data: "...",
    merge_strategy: "replace|append|skip_duplicates"
  }

USE CASES:
- Backup/restore
- Multi-tenant migration
- Template library pro više shopů
```

### 4. **Template System** 🎨
```
Standardní templates:
  - "horizontal_slider" (current)
  - "grid_2x6"
  - "vertical_list"
  - "carousel_with_details"
  - "comparison_table"

Per-widget template selection:
  settings: {
    template: "horizontal_slider",
    theme: "light|dark",
    accent_color: "#1fb56b"
  }
```

### 5. **A/B Testing** 📊
```
Vytvořit 2 varianty widgetu:
  Widget A: sorting by trending
  Widget B: sorting by price

Track metrics:
  - CTR (click-through rate)
  - Conversion rate
  - Avg order value

Dashboard pro porovnání výkonu
```

### 6. **AI-Powered Recommendations** 🤖
```
Auto-select produkty na základě:
- Nákupního chování zákazníka
- Sezóních trendů
- ML modelu (collaborative filtering)
- Product similarity (obsah)

Real-time updates:
  Cron job: Refresh widgety 2x denně
  Redis cache pro performance
```

### 7. **Widget Analytics** 📈
```
Track per-widget metrics:
  - Impressions (kolikrát se widget zobrazil)
  - Clicks (na jaké produkty klikli)
  - Revenue impact (jaké zboží se prodalo)

Endpoint: GET /api/pim/product-widgets/{id}/analytics
Response: {
  period: "today|week|month",
  impressions: 1234,
  clicks: 45,
  ctr: "3.6%",
  items: [
    { product_id, clicks, revenue, rank }
  ]
}
```

### 8. **Widget Scheduling** ⏰
```
Publikovat widgety v určitém čase:

settings: {
  published_at: "2026-02-14T10:00:00Z",
  expires_at: "2026-03-01T23:59:59Z",
  schedule: "seasonal"  // Valentine's day widget
}

Cron job kontroluje & publikuje
```

### 9. **Widget Versioning** 📝
```
Sledovat změny widgetu:
  - product_widget_versions tabulka
  - Rollback na starou verzi
  - Diff view (co se změnilo)
  
Audit trail: kdo, kdy, co změnil
```

### 10. **Marketplace/Distribution** 🌐
```
Sdílení widgetů mezi merchant teams:

POST /api/pim/product-widgets/{id}/publish-to-marketplace
Response: {
  marketplace_url: "https://hub.kv.cz/marketplace/widgets/xyz"
}

Ostatní mohou importovat:
  POST /api/pim/product-widgets/from-marketplace/{marketplace_id}
```

---

## 📋 ČÁST 7: AKTUÁLNÍ PROBLÉMY A ŘEŠENÍ

### PROBLÉM 1: NonFragrance Widget nepoužívá inspiraci
**Status**: 🔴 Kritická  
**Severity**: High  
**Řešení**: 
- Rewrite `AutoWidgetBuilderService.buildNonFragranceWidget()`
- Použít `InventoryRecommendationService::recommendByInspirationType()`
- Dokumentace: nonFragrance-fix.md

### PROBLÉM 2: Obrovská Blade šablona
**Status**: 🟡 Design  
**Severity**: Medium  
**Řešení**:
- Rozdělit na componenty (ProductWidgetItem.blade.php, atd.)
- Extrahovat CSS do souboru
- Vytvořit WidgetTemplateEngine

### PROBLÉM 3: Chybí granulární item API
**Status**: 🟡 Feature request  
**Severity**: Medium  
**Řešení**:
```php
// Nové routes:
PATCH /api/pim/product-widgets/{id}/items/{item_id}
POST  /api/pim/product-widgets/{id}/items
DELETE /api/pim/product-widgets/{id}/items/{item_id}
```

### PROBLÉM 4: Hardcoded Czech Strings
**Status**: 🟡 Localization  
**Severity**: Medium  
**Řešení**:
- Vytvořit WidgetTranslator service
- JSON files pro všechny jazyky
- Blade: `{{ __('widget.previous_product') }}`

### PROBLÉM 5: Duplicitní CSS & Inline Styles
**Status**: 🟡 Performance  
**Severity**: Medium  
**Řešení**:
- CSS generovat jako soubor (ne inline)
- Minify + gzip
- Inline only critical CSS pro first paint

---

## 💡 ČÁST 8: IMPLEMENTAČNÍ ROADMAP

```
FÁZE 1 (Týden 1):
☐ Fix nonFragrance logic
☐ Repair granular item endpoints
☐ Add localization strings

FÁZE 2 (Týden 2-3):
☐ Extract CSS to file
☐ Refactor Blade templates
☐ Create WidgetTemplateEngine

FÁZE 3 (Týden 4-5):
☐ Auto-widget builder API
☐ Widget import/export
☐ Basic analytics

FÁZE 4 (Měsíc 2):
☐ Template system
☐ A/B testing
☐ Widget scheduling

FÁZE 5+ (Dlouhodobě):
☐ AI recommendations
☐ Advanced analytics
☐ Marketplace
```

---

## 🔗 REFERENCE

**Database**:
- [migration: create_product_widgets_tables.php](backend/modules/Pim/database/migrations/2025_11_06_090000_create_product_widgets_tables.php)

**Backend**:
- [ProductWidgetController.php](backend/modules/Pim/Http/Controllers/ProductWidgetController.php)
- [ProductWidgetRenderer.php](backend/modules/Pim/Services/ProductWidgetRenderer.php)
- [ProductWidget model](backend/modules/Pim/Models/ProductWidget.php)
- [ProductWidgetItem model](backend/modules/Pim/Models/ProductWidgetItem.php)

**Frontend**:
- [ProductWidgetDetailPage.tsx](frontend/src/features/products/pages/ProductWidgetDetailPage.tsx)
- [useProductWidgets.ts](frontend/src/features/products/hooks/useProductWidgets.ts)
- [productWidgets API](frontend/src/api/productWidgets.ts)

**Rendering**:
- [embed.blade.php](backend/modules/Pim/Resources/views/widgets/embed.blade.php)
- [script.blade.php](backend/modules/Pim/Resources/views/widgets/script.blade.php)

---

**Poznámka**: Tato dokumentace je živý dokument. Bude se aktualizovat se změnami v systému.
