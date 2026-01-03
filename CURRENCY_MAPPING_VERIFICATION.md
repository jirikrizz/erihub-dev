# 💰 CURRENCY MAPPING VERIFICATION

## ✅ DATA FLOW CONFIRMATION

### 1. WHERE PRICES COME FROM (Shoptet)

```
Shoptet API (Czech shop)
├── Product variant with price: 1290 (in CZK)
├── shop.currency_code: "CZK"
└── When synced to HUB:
    └── ProductVariant.price = 1290
    └── (stored as integer, already in shop's local currency)

Shoptet API (Slovak shop)
├── Product variant with price: 1290 (in SKK)
├── shop.currency_code: "SKK"
└── When synced to HUB:
    └── ProductVariant.price = 1290
    └── (stored as integer, already in shop's local currency)
```

**Key Point**: Each shop has its own product variants with prices in their local currency!
- Czech shop variants: prices in CZK
- Slovak shop variants: prices in SKK
- Hungarian shop variants: prices in HUF
- etc.

---

### 2. HOW PRICES ARE DISPLAYED (Widget)

**Current (BEFORE currency mapping)**:
```
Czech shop widget:
├── Displays: "1290 Kč" ✓ (correct)

Slovak shop widget:
├── Displays: "1290 Kč" ✗ (WRONG - should be "1290 Sk")
│   └── Because $formatPrice hardcoded 'Kč' symbol

Hungarian shop widget:
├── Displays: "1290 Kč" ✗ (WRONG - should be "1290 Ft")
```

**After currency mapping (WHAT WE JUST IMPLEMENTED)**:
```
Czech shop widget (ProductWidget.locale = 'cs'):
├── CurrencyMap::getSymbol('cs') → 'Kč'
├── Displays: "1290 Kč" ✓

Slovak shop widget (ProductWidget.locale = 'sk'):
├── CurrencyMap::getSymbol('sk') → 'Sk'
├── Displays: "1290 Sk" ✓

Hungarian shop widget (ProductWidget.locale = 'hu'):
├── CurrencyMap::getSymbol('hu') → 'Ft'
├── Displays: "1290 Ft" ✓
```

---

### 3. PRICE CONSISTENCY VERIFICATION

**NO CONVERSION HAPPENS**:
- Cena z Shoptet: 1290 SKK
- Zobrazeno: 1290 Sk (STEJNÁ cena, jen jiný symbol)
- ❌ Nikdy se to nekoveruje na CZK
- ❌ Nikdy se to sčítá, dělí, či mění

**SLEVY ZŮSTÁVAJÍ STEJNÉ**:
```php
// embed.blade.php - line 630-632
$priceCurrentInt = 1290;     // Ze Shoptet (SKK)
$priceOriginalInt = 1490;    // Ze Shoptet (SKK)
$priceDiscountPercent = (int) round(
    max(0, 100 - ($priceCurrentInt / $priceOriginalInt) * 100)
); // = 13%
// Output: "1290 Sk" (not "1290 Kč")
```

---

### 4. IMPLEMENTATION VERIFICATION

**What we changed**:

1. ✅ Created `CurrencyMap` constant file
   - Maps: 'cs' → 'Kč', 'sk' → 'Sk', 'hu' → 'Ft', 'ro' → 'Lei', 'hr' → 'kn'

2. ✅ Modified `ProductWidgetRenderer.render()`
   - Gets `widget->locale`
   - Calls `CurrencyMap::getSymbol($locale)`
   - Passes `$currencySymbol` to Blade template

3. ✅ Updated `embed.blade.php`
   - Changed `$formatPrice` function to accept `$symbol` parameter
   - Updated all 11 calls to pass `$currencySymbol`

**What we did NOT change**:
- ❌ Prices remain the same (no conversion)
- ❌ Discounts remain the same (no conversion)
- ❌ ProductVariant.price values (unchanged)
- ❌ Overlay prices (unchanged)

---

### 5. DATA FLOW SUMMARY

```
Shop (sk_SK, currency_code='SKK')
    ↓
Shoptet sends products with SKK prices
    ↓
ProductSnapshotImporter.import() 
    └─ Creates ProductVariant with price=1290 (in SKK)
    └─ Creates ProductVariantShopOverlay with price (in SKK)
    ↓
Widget creation (ProductWidget.locale='sk')
    ↓
GET /api/widgets/inventory/recommendations.js?shop_id=1
    ↓
InventoryRecommendationWidgetController.script()
    └─ Finds ProductVariant.price = 1290 (SKK)
    └─ Passes to ProductWidgetRenderer
    ↓
ProductWidgetRenderer.render()
    └─ Gets widget.locale = 'sk'
    └─ Gets currencySymbol = CurrencyMap::getSymbol('sk') = 'Sk'
    └─ Passes $currencySymbol to Blade
    ↓
embed.blade.php rendering
    └─ $formatPrice(1290, 'Sk') → "1290 Sk"
    ↓
JavaScript returned to Shoptet e-shop
    └─ Displays: "1290 Sk" (correct!)
```

---

## 🎯 WHAT THIS IMPLEMENTATION DOES

✅ **Displays correct currency symbol** based on widget locale
✅ **No price conversion** - prices stay from Shoptet
✅ **Works with multi-shop setup** - each shop keeps its own currency
✅ **Supports 5 locales** - CZ, SK, HU, RO, HR (extensible)
✅ **Backward compatible** - defaults to 'Kč' if locale missing

---

## ⚠️ IMPORTANT NOTES FOR USER

### Pricing Expectations
- **Slovenský e-shop**: Produkty mají ceny v SKK ze Shoptetu, zobrazují se jako "1290 Sk" (ne "1290 Kč")
- **Maďarský e-shop**: Produkty mají ceny v HUF ze Shoptetu, zobrazují se jako "1290 Ft"
- **Ceny NEJSOU konvertovány** - jsou stejné jako na Shoptetu v jeho měně

### Widget Locale Setting
```php
// Slouží k určení měny - MUSÍ být nastavená správně!
ProductWidget::create([
    'locale' => 'sk',  // 'cs', 'sk', 'hu', 'ro', 'hr'
    // ...
]);
```

### Where to Check
```
Frontend: /features/products/pages/ProductWidgetDetailPage.tsx
└─ When creating widget, user picks locale/language
└─ This determines the currency symbol displayed

Backend: ProductWidgetRenderer.php (line 116-121)
└─ Locale → Currency symbol mapping happens here
```

---

## 📋 IMPLEMENTATION CHECKLIST

- [x] CurrencyMap constant file created
- [x] ProductWidgetRenderer updated (passes $currencySymbol)
- [x] embed.blade.php $formatPrice updated (accepts $symbol parameter)
- [x] All 11 price formatting calls updated (pass $currencySymbol)
- [x] Navigation buttons shadow removed (Phase 1)
- [ ] Testing on staging (next)
- [ ] Deployment (after testing)

---

## 🚀 NEXT STEP

Test the changes:
1. Create widget for Czech shop (locale='cs') → should show "1290 Kč"
2. Create widget for Slovak shop (locale='sk') → should show "1290 Sk"
3. Verify discount percentages remain unchanged

**No data conversion should happen - only symbol changes!**
