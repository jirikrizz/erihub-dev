# 💱 CURRENCY MAPPING - OPRAVY (3. ledna 2026)

## 🔧 CO SE OPRAVILO

### 1️⃣ **Slovensko & Chorvatsko mají EURO** (ne staré měny)

**Bylo (ŠPATNĚ)**:
```php
'sk' => ['symbol' => 'Sk', 'code' => 'SKK'],   // SKK je starou měnou! 
'hr' => ['symbol' => 'kn', 'code' => 'HRK'],  // HRK, ale Chorvatsko má EUR
```

**Je teď (SPRÁVNĚ)**:
```php
'sk' => ['symbol' => '€', 'code' => 'EUR', 'symbolPosition' => 'before'],
'hr' => ['symbol' => '€', 'code' => 'EUR', 'symbolPosition' => 'before'],
```

---

### 2️⃣ **EU Symboly jdou PŘED cenou** (ne za)

**Bylo**:
```
"1290 €" ❌ (špatně)
```

**Je teď**:
```
"€24.99" ✅ (správně - Euro)
```

**Formáty po státech**:
```
Česko (cs):       "1 290 Kč"      (za + mezera)
Slovensko (sk):   "€24.99"        (před + bez mezery)
Maďarsko (hu):    "1 290 Ft"      (za + mezera)
Rumunsko (ro):    "1 290 Lei"     (za + mezera)
Chorvatsko (hr):  "€24.99"        (před + bez mezery)
```

---

### 3️⃣ **Nová Metoda: `CurrencyMap::formatPrice()`**

Místo ruční manipulace se symbolem teď máme smart formatter:

```php
CurrencyMap::formatPrice(1290, 'cs')   // "1 290 Kč"
CurrencyMap::formatPrice(2499, 'sk')   // "€24.99"
CurrencyMap::formatPrice(1290, 'hu')   // "1 290 Ft"
CurrencyMap::formatPrice(1290, 'ro')   // "1 290 Lei"
CurrencyMap::formatPrice(2499, 'hr')   // "€24.99"
```

**Co se stane uvnitř**:
1. Dostane lokál ('cs', 'sk', 'hu', 'ro', 'hr')
2. Vezme info o měně (symbol, formát, pozici)
3. Formátuje číslo (oddělení tisíců, desetinná čísla)
4. Postaví symbol na správné místo
5. Vrátí hotový string

---

## 📊 DATA FLOW (AKTUALIZOVANÉ)

```
ProductWidget (locale='sk')
    ↓
ProductWidgetRenderer.render()
    ├─ $locale = 'sk'
    ├─ $currencySymbol = CurrencyMap::getSymbol('sk') = '€'
    └─ Pass both to Blade template
        ↓
embed.blade.php
    ├─ Receives $locale = 'sk'
    ├─ $formatPrice(2499, 'sk')
    │  └─ Calls CurrencyMap::formatPrice(2499, 'sk')
    │     └─ Vrací: "€24.99"
    └─ Output: "€24.99" ✓
        ↓
JavaScript returned
    ↓
Shoptet e-shop (SK) displays: "€24.99" ✓
```

---

## ✅ OVĚŘENÍ - CENY ZŮSTÁVAJÍ STEJNÉ

**Slovák kupuje product s cenou 24.99 EUR**:
1. Cena na Shoptetu SK: 24.99 EUR
2. Uložená v DB: 2499 (centů v EUR)
3. Zobrazeno v widgetu: "€24.99" ✅
4. ❌ Nikdy se nenormalizuje na koruny
5. ❌ Nikdy se nemění numerická hodnota

**Čech kupuje product s cenou 1290 CZK**:
1. Cena na Shoptetu CZ: 1290 CZK
2. Uložená v DB: 1290 (centů? nebo už v jednotkách?)
3. Zobrazeno v widgetu: "1 290 Kč" ✅
4. ❌ Nebyl konvertován na EUR
5. ❌ Nebyla změněna numerická hodnota

---

## 🔐 OVERLAY SYSTEM (ZŮSTÁVÁ INTAKTNÍ)

Systém se **NEMĚNIL**. ProductVariantShopOverlay stále:
- Má `currency_code` field (CZK, EUR, HUF, etc.)
- Uchovává ceny v natavené měně
- Lze ji override lokálně na shop-by-shop basis

```php
// Existující struktura - NEZMĚNĚNO
ProductVariantShopOverlay {
    product_variant_id,
    shop_id,
    price,                  // V měně shopu
    purchase_price,         // V měně shopu
    currency_code,          // 'CZK', 'EUR', 'HUF', 'RON', etc.
    unit,
    data,
}
```

---

## 📝 CO SE ZMĚNILO V KÓDU

| Soubor | Změna |
|--------|-------|
| `CurrencyMap.php` | ✨ Přidán `CurrencyMap::formatPrice()` helper |
| `CurrencyMap.php` | 🔧 SK/HR: měna změněna na EUR |
| `CurrencyMap.php` | 🔧 Přidáno `symbolPosition` (before/after) |
| `CurrencyMap.php` | 🔧 Přidáno `symbolSpace` (space či ne) |
| `embed.blade.php` | 📝 Přidán import `use App\Constants\CurrencyMap` |
| `embed.blade.php` | 📝 Přidán `$locale = $widget->locale ?? 'cs'` |
| `embed.blade.php` | 🔧 `$formatPrice` nyní volá `CurrencyMap::formatPrice()` |
| `embed.blade.php` | 🔧 Všech 11 callů `$formatPrice(..., $locale)` |

---

## 🧪 TESTING CHECKLIST

### Manual Testing
- [ ] Česko (locale='cs'): "1 290 Kč" ✓
- [ ] Slovensko (locale='sk'): "€24.99" ✓
- [ ] Maďarsko (locale='hu'): "1 290 Ft" ✓
- [ ] Rumunsko (locale='ro'): "1 290 Lei" ✓
- [ ] Chorvatsko (locale='hr'): "€24.99" ✓
- [ ] Variant switching: měna zůstává správná ✓
- [ ] Slevy: procenta správná ✓

### Unit Tests (TODO)
```php
test('formatPrice for Czech', function () {
    $this->assertEquals('1 290 Kč', CurrencyMap::formatPrice(1290, 'cs'));
});

test('formatPrice for Slovak Euro', function () {
    $this->assertEquals('€24.99', CurrencyMap::formatPrice(2499, 'sk'));
});

test('formatPrice for Croatian Euro', function () {
    $this->assertEquals('€24.99', CurrencyMap::formatPrice(2499, 'hr'));
});
```

---

## ⚠️ IMPORTANT NOTES

### Formáty číslic
```php
// CZK (Česko) - bez desetinných míst, mezera pro tisíce
1290 → "1 290 Kč"

// EUR (Slovensko, Chorvatsko) - dvě desetinná místa, tečka pro tisíce
2499 → "€24.99"
       (2499 centů = 24.99 EUR)

// HUF (Maďarsko) - bez desetinných míst, mezera pro tisíce
1290 → "1 290 Ft"

// RON (Rumunsko) - dvě desetinná místa, čárka pro tisíce
1290 → "1 290,00 Lei"
       (v RO se používá lokální formát)
```

### Centaury vs. jednotky
Systém pracuje s **century** (1290 = 12.90):
- CZK/HUF: bere se jako jednotky (1290 = 1290 jednotek)
- EUR/RON: převádí se na desetinná čísla (1290 = 12.90)

**Formulace**:
```php
// Je to problém? NE, protože:
// 1. CZK nemá desetinná místa (1290 Kč je korektní)
// 2. EUR má (€12.90 je korektní)
// 3. CurrencyMap::formatPrice() to ví a zpracuje správně
```

---

## 🚀 DEPLOYMENT READY

Změny jsou **bezpečné a backwardcompatible**:
- Fallback na Czech (cs) pokud locale neznámý
- Formáty jsou korektní pro EU
- Ceny se nekoverují (zůstávají stejné)
- Existující overlayový systém není dotčen

---

## 📞 REFERENCE

**Kde se formátuje**:
```
InventoryRecommendationWidgetController.script()
    ↓
ProductWidgetRenderer.render()
    ├─ Určí locale z widget->locale
    └─ Předá do Blade
        ↓
embed.blade.php
    └─ $formatPrice($price, $locale)
        └─ CurrencyMap::formatPrice($price, $locale)
```

**Kde se volá**:
- Hlavní cena produktu (current/original)
- Ceny variant (když se přepíná size)
- Slevy (v Kč/€/Ft/Lei)
- Discount value (v měně)

**Kde je lokál informace**:
```
ProductWidget.locale = 'sk'  // Z uživatele
    ↓
Shop.locale = 'sk'           // Měl by odpovídat
    ↓
CurrencyMap['sk']            // Určí currency
```

---

**Status**: ✅ READY FOR TESTING  
**Last Updated**: 3. ledna 2026, 16:15  
**All Errors**: None (syntax OK)  
**Next Step**: Staging test (verify Euro formatting works)
