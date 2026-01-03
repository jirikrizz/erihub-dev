# 📊 Widget Data Flow & Simplification Analysis

## 🎯 CURRENT STATE ANALYSIS

### 1. HOW DATA FLOWS (Request → Rendered HTML)

```
USER CLICKS VARIANT (e.g., "50ml")
        ↓
JavaScript Event: shoptetVariantChanged
        ↓
loadRecommendationWidget(variant_id, product_code)
        ↓
HTTP GET /api/widgets/inventory/recommendations.js?
  - widget_id=5
  - variant_id=7894
  - variant_code=NAR-LOST-50ML
  - mode=brand        ← Determines algorithm
  - limit=8
  - shop_id=1
        ↓
BACKEND: InventoryRecommendationWidgetController.script()
  1. Find ProductVariant (1 query)
  2. Execute algorithm (2-4 queries):
     - fetchProductRecommendations() if mode=product
     - $recommendations->recommend() if mode=similarity
     - recommendByInspirationType() if mode=fragrance/nonfragrance
  3. For each recommended variant:
     - Load ProductVariant with overlays (2 queries × 8 = 16 queries)
     - Extract metadata (inspired_by_brand, inspired_by_title, price, size)
     - Format pricing
  4. Render Blade template: embed.blade.php
        ↓
RETURNS: JavaScript string (~8-15 KB)
  ```javascript
  (function() {
    var html = '<div>...product cards...';
    var container = document.getElementById('...');
    container.innerHTML = html;
  })();
  ```
        ↓
FRONTEND: Executes JavaScript
        ↓
DOM UPDATES: Slider with product cards, prices, images
```

### 2. WHERE METADATA COMES FROM (Product Card Data)

**Shoptet Webhook Payload** (when product is synced):
```json
{
  "variant": {
    "variant_id": 7894,
    "variant_code": "NAR-LOST-50ML",
    "variant_title": "Narcos Lost 50ml",
    "variant_price": 1290,
    "variant_image": "https://..../img.jpg",
    "metadata": {
      "inspired_by_brand": "Narsiso Rodrigues",
      "inspired_by_title": "Lost in Space",
      "original_brand": "Narciso Rodriguez",
      "original_name": "Lost in Cologne",
      "znacka2": "Narciso",
      "gender": "male",
      "fragrance_type_reco": "Wood, Musk, Spicy"
    }
  }
}
```

**Storage in DB**:
- `product_variants` table
- `variant_metadata` (JSON column with all fields)
- `product_snapshot_items` (raw Shoptet data)

**Access in Blade Template**:
```php
$metadata['inspired_by_brand']     // Narsiro Rodrigues
$metadata['inspired_by_title']     // Lost in Space
$metadata['original_brand']        // Narciso Rodriguez
$item['gender']                    // male
$item['inspired_by_brand']         // passed from controller
```

**Fallback Logic** (if field missing):
```php
// Line 541-550 in embed.blade.php
if (!$defaultInspiredBrand) {
    $defaultInspiredBrand = $normalizeOptionalString(
        Arr::get($metadata, 'original_brand')
    ) ?? Arr::get($metadata, 'znacka-2')
      ?? Arr::get($metadata, 'znacka2');
}

// Falls back to brand detection from product metadata
if (!$defaultInspiredBrand) {
    $defaultInspiredBrand = $resolveBrandCandidate($metadata);
}
```

### 3. CURRENCY HANDLING (CURRENT - HARDCODED)

**Current Implementation**:
```php
// Line 27-35 in embed.blade.php
$formatPrice = static function($priceInt) {
    if ($priceInt === null) {
        return null;
    }
    
    $price = $priceInt / 100;
    return number_format($price, 0, ',', ' ') . ' Kč';  // ← HARDCODED!
};
```

**Usage** (every product card):
```php
$priceCurrentDisplay = ($formatPrice)($priceCurrentInt);
// Output: "1 290 Kč"
```

**Problem**: 
- Works only for Czech shops
- Slovakia shops need "Sk" or "SKK"
- Hungary needs "Ft"
- Romania needs "Lei" or "RON"
- Croatia needs "kn" or "HRK"

### 4. HOW TO DETERMINE CORRECT CURRENCY

**Source of Truth**: Shop model & ProductWidget model
```php
class Shop extends Model {
    // Currently has:
    public $shop_id;           // Shoptet ID
    public $shop_name;
    public $country;           // Could be 'CZ', 'SK', 'HU', 'RO', 'HR'
    public $locale;            // Could be 'cs', 'sk', 'hu', 'ro', 'hr'
}

class ProductWidget extends Model {
    // Currently has:
    public $shop_id;           // Links to shop
    public $locale;            // 'cs', 'sk', etc.
    // Currently missing:
    // public $currency;        // 'CZK', 'SKK', 'HUF', 'RON', 'HRK'
}
```

**Mapping Logic Needed**:
```php
// backend/app/Constants/CurrencyMap.php (NEW FILE)
return [
    'cs' => ['currency' => 'CZK', 'symbol' => 'Kč'],
    'sk' => ['currency' => 'SKK', 'symbol' => 'Sk'],
    'hu' => ['currency' => 'HUF', 'symbol' => 'Ft'],
    'ro' => ['currency' => 'RON', 'symbol' => 'Lei'],
    'hr' => ['currency' => 'HRK', 'symbol' => 'kn'],
];
```

## 🎨 SLIDER STYLING - CURRENT COMPLEXITY

### Navigation Buttons (Lines 524-1150)

**Current Styling**:
```html
<button
    class="kv-widget-nav kv-widget-prev is-disabled"
    type="button"
    style="
        width: 44px; 
        height: 44px; 
        border-radius: 50%; 
        border: 1px solid rgba(208, 213, 232, 0.8); 
        background: #ffffff; 
        color: #1fb56b; 
        display: inline-flex; 
        align-items: center; 
        justify-content: center; 
        cursor: pointer; 
        box-shadow: 0 14px 28px rgba(31, 181, 107, 0.2);    ← SHADOW!
        transition: background 0.2s ease, color 0.2s ease, 
                    border-color 0.2s ease, box-shadow 0.2s ease;
        position: absolute; 
        top: 50%; 
        transform: translateY(-50%); 
        left: 8px; 
        z-index: 2;
    "
>‹</button>
```

**Issues**:
1. ✗ Box-shadow adds visual weight: `0 14px 28px rgba(31, 181, 107, 0.2)`
2. ✗ Transition on box-shadow (expensive animation)
3. ✗ Complex 44px circular button (could be smaller/more minimal)
4. ✓ Border is nice and clean (keep it)
5. ✓ Positioning is good (keep it)

### Simplification Strategy

**Remove Shadow + Simplify Transitions**:
```html
<button
    class="kv-widget-nav kv-widget-prev is-disabled"
    type="button"
    style="
        width: 44px; 
        height: 44px; 
        border-radius: 50%; 
        border: 1px solid rgba(208, 213, 232, 0.8); 
        background: #ffffff; 
        color: #1fb56b; 
        display: inline-flex; 
        align-items: center; 
        justify-content: center; 
        cursor: pointer; 
        transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
        position: absolute; 
        top: 50%; 
        transform: translateY(-50%); 
        left: 8px; 
        z-index: 2;
    "
>‹</button>
```

**Changes**:
- ✅ Remove: `box-shadow: 0 14px 28px rgba(31, 181, 107, 0.2);`
- ✅ Simplify transition: Remove `box-shadow 0.2s ease` from transition list

### Product Cards (Keeping as-is)

**Current Structure** (Lines 970-1140):
```html
<div class="product brx-product" style="
    border: 1px solid rgb(201, 201, 201); 
    border-radius: 30px; 
    padding: 20px 15px; 
    margin-bottom: 40px; 
    display: block; 
    width: 300px; 
    min-width: 300px;
">
    <!-- Image with gender icon, tags -->
    <!-- Product name with subtitle (brand + fragrance inspiration) -->
    <!-- Variant options (sizes) -->
    <!-- Price display -->
    <!-- Buy button -->
</div>
```

**User Decision**: "ty product card (grafika těch cards...musí zůstat"
- ✅ Keep all product card styling
- ✅ Keep images, pricing, variant options
- ✅ Keep brand/inspiration styling
- ❌ Only modify slider navigation shadow

## 📋 SUMMARY: WHAT NEEDS TO CHANGE

### Phase 1: Immediate (Slider Simplification)
**File**: `backend/modules/Pim/Resources/views/widgets/embed.blade.php`

**Changes**:
1. Line 528: Remove `box-shadow: 0 14px 28px rgba(31, 181, 107, 0.2);` from inline style
2. Line 528: Remove `box-shadow 0.2s ease` from transition list
3. Line 1149: Same changes for next button

**Impact**: Lighter, cleaner look. Performance: negligible (animation is no longer expensive).

---

### Phase 2: Currency Mapping (Multi-Language Support)
**Files**:
- New: `backend/app/Constants/CurrencyMap.php`
- Modified: `backend/modules/Pim/Resources/views/widgets/embed.blade.php` (line 27-35)
- Modified: `backend/modules/Inventory/Http/Controllers/InventoryRecommendationWidgetController.php` (script() method)
- Modified: `backend/modules/Pim/Models/ProductWidget.php` (migration + model)

**Changes**:
1. Create CurrencyMap constant file
2. Pass currency symbol to Blade template based on shop locale
3. Update $formatPrice function to use dynamic symbol
4. Store currency preference in ProductWidget model
5. Auto-detect currency from shop.locale in ProductWidgetDetailPage

**Data Flow**:
```
ProductWidget ($widget->locale = 'sk')
    ↓ (in script() endpoint)
CurrencyMap::get('sk')  // Returns ['symbol' => 'Sk', 'currency' => 'SKK']
    ↓
Pass to Blade as $currencySymbol
    ↓
$formatPrice uses $currencySymbol instead of hardcoded 'Kč'
    ↓
Product cards show: "1 290 Sk" instead of "1 290 Kč"
```

---

### Phase 3: Widget Builder (Type System + i18n)
**Already Designed in**: `WIDGET_BUILDER_DESIGN.md`

**Key Components**:
1. Database migration (add type, algorithm_config, translations)
2. WidgetType enum (brand_inspired, similarity_based, stock_filtered, custom, hybrid)
3. Frontend: TypeSelector, AlgorithmConfig, TranslationsTabs
4. Backend: execute correct algorithm based on type

---

## 🚀 RECOMMENDED ORDER OF IMPLEMENTATION

1. **TODAY**: Simplify slider styling (15 min) → Deploy immediately
2. **TOMORROW**: Currency mapping system (1.5 hours) → Test on staging
3. **NEXT WEEK**: Widget Builder complete implementation (3.5 hours) → Full feature

---

## 🎓 KEY INSIGHTS FOR USER

**Inspired By Brand + Title**:
- Stored in ProductVariant metadata
- Comes from Shoptet webhook during product sync
- Examples:
  - Product: "Dupes Narcos Lost 50ml"
  - Inspired By Brand: "Narciso Rodriguez"
  - Inspired By Title: "Lost in Cologne"
  
This is **your key data** for perfume dupes recommendations!

**Data Freshness**:
- Updates via Shoptet snapshot sync (ProductSnapshotImporter)
- Already working correctly (verified in ProductSnapshotDetailPage)
- No action needed

**Currency Display**:
- Currently hardcoded (works for CZ only)
- Can be fixed by passing locale/currency to template
- Multi-language support ready for Phase 2

**Slider Simplicity**:
- Remove shadow = 1 line deleted, 1 line shortened
- No functional change
- Cleaner visual appearance
