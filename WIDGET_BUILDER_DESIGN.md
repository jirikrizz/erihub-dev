# ŘEŠENÍ: WIDGET BUILDER SYSTEM S MULTI-LANGUAGE SUPPORT

## 📋 ARCHITEKTURA

### 1. WIDGET TYPES (Backend Enum)

```
Máte v InventoryRecommendationWidgetController již:
- 'nonfragrance' mode (produkty se stejnou inspirovanou značkou + podobné)
- 'fragrance' mode (specialista na parfumy)
- 'similarity' mode (čistě na základě vlastností)
- 'product' mode (generické doporučení)

Potřebujeme to strukturovat jako Widget Types s:
- Type ID
- Name (anglicky)
- Description
- Translations
- Algorithm
- Filters (skladem, visible)
- Limits
```

### 2. DATABÁZOVÁ STRUKTURA

```
Existuje: product_widgets table
├─ name: string
├─ slug: string  
├─ status: enum (draft, published, archived)
├─ shop_id: integer
├─ locale: string (cs/sk/hu/ro/hr)
├─ settings: json
└─ items: HasMany ProductWidgetItem

ZMĚNA POTŘEBNÁ:
- Přidat `type` field (brand_inspired, similarity_based, stock_filtered, etc.)
- Přidat `algorithm_config` JSON (settings for type)
- Přidat `translations` JSON (multi-language titles, descriptions)
```

### 3. FRONTEND STRUKTURA

```
ProductWidgetDetailPage
├─ Widget Type Selector (dropdown se všemi dostupnými typy)
├─ Widget Settings (dle typu)
│  ├─ Brand-inspired: Brand selection, limit, filters
│  ├─ Similarity: Property weights, filters
│  ├─ Stock-filtered: Visibility filters, limits
│  └─ Custom: Free product selection (ruční)
├─ Translations Tab
│  ├─ CZ: Title, description
│  ├─ SK: Title, description
│  ├─ HU: Title, description
│  ├─ RO: Title, description
│  └─ HR: Title, description
└─ Preview (jak bude vypadat na Shoptetu v různých jazycích)
```

---

## 🗂️ IMPLEMENTACE

### STEP 1: Backend - Vytvořit Widget Type System

```php
// backend/modules/Inventory/Enums/WidgetType.php

namespace Modules\Inventory\Enums;

enum WidgetType: string {
    case BRAND_INSPIRED = 'brand_inspired';      // 3 produkty se stejnou značkou + podobné
    case SIMILARITY_BASED = 'similarity_based';  // Produkty s podobnými vlastnostmi
    case STOCK_FILTERED = 'stock_filtered';      // Viditelné a skladem produkty
    case HYBRID = 'hybrid';                      // Kombinace více algoritmů
    
    public function label(): string {
        return match($this) {
            self::BRAND_INSPIRED => 'Inspirováno stejnou značkou + podobné',
            self::SIMILARITY_BASED => 'Podobné produkty (vlastnosti)',
            self::STOCK_FILTERED => 'Dostupné produkty (skladem + viditelné)',
            self::HYBRID => 'Kombinované doporučení',
        };
    }
    
    public function description(): string {
        return match($this) {
            self::BRAND_INSPIRED => 'Zobrazuje produkty se stejnou inspirovanou značkou + produkty s nejdůležitějšími shodnými vlastnostmi',
            self::SIMILARITY_BASED => 'Algoritmus porovnává všechny vlastnosti produktu a hledá maximální shodu',
            self::STOCK_FILTERED => 'Filtruje jen dostupné produkty, které mohou zákazníci koupit',
            self::HYBRID => 'Kombinuje multiple strategie pro nejlepší výsledky',
        };
    }
}
```

### STEP 2: Backend - Migrate ProductWidget

```php
// backend/modules/Pim/database/migrations/2025_01_03_add_widget_type.php

Schema::table('product_widgets', function (Blueprint $table) {
    $table->string('type')->default('custom')->after('status');
    $table->json('algorithm_config')->nullable()->after('settings');
    $table->json('translations')->nullable()->after('algorithm_config');
    
    $table->index('type');
});
```

### STEP 3: Backend - Update ProductWidget Model

```php
// backend/modules/Pim/Models/ProductWidget.php

use Modules\Inventory\Enums\WidgetType;

class ProductWidget extends Model {
    protected $fillable = [
        'name',
        'slug',
        'type',        // ← NEW
        'status',
        'public_token',
        'shop_id',
        'locale',
        'settings',
        'algorithm_config',  // ← NEW
        'translations',      // ← NEW
        'html_markup',
    ];

    protected $casts = [
        'settings' => 'array',
        'algorithm_config' => 'array',
        'translations' => 'array',
        'type' => WidgetType::class,  // ← NEW
    ];

    public function getTranslation(string $locale, string $key, string $default = ''): string {
        return data_get($this->translations, "{$locale}.{$key}", $default);
    }

    public function getAlgorithmConfig(string $key = null, $default = null) {
        if ($key === null) {
            return $this->algorithm_config ?? [];
        }
        return data_get($this->algorithm_config, $key, $default);
    }
}
```

### STEP 4: Backend - Update InventoryRecommendationWidgetController

```php
// backend/modules/Inventory/Http/Controllers/InventoryRecommendationWidgetController.php

private InventoryRecommendationService $recommendations;

public function script(Request $request) {
    // Existing logic...
    
    $template = ProductWidget::with('items')->findOrFail($data['widget_id']);
    
    // Use widget's configured type/algorithm
    $recommendations = match($template->type) {
        WidgetType::BRAND_INSPIRED => $this->recommendByBrand($variant, $limit, $template),
        WidgetType::SIMILARITY_BASED => $this->recommendations->recommend($variant, $limit),
        WidgetType::STOCK_FILTERED => $this->recommendFiltered($variant, $limit, $template),
        WidgetType::HYBRID => $this->recommendHybrid($variant, $limit, $template),
        default => $this->fetchPrecomputedRecommendations($variant, $limit),
    };
    
    // ... rest of logic
}

private function recommendByBrand(ProductVariant $variant, int $limit, ProductWidget $widget): array {
    $config = $widget->getAlgorithmConfig();
    $brandLimit = $config['brand_limit'] ?? 3;
    $similarLimit = $limit - $brandLimit;
    
    // Get products with same brand
    $byBrand = $this->recommendations->recommendByBrand($variant, $brandLimit);
    
    // Get similar products
    $bySimilarity = $this->recommendations->recommend($variant, $similarLimit);
    
    // Merge and return
    return array_merge($byBrand, $bySimilarity);
}

private function recommendFiltered(ProductVariant $variant, int $limit, ProductWidget $widget): array {
    $recs = $this->recommendations->recommend($variant, $limit * 2);
    
    return array_filter($recs, function($rec) {
        $v = ProductVariant::find($rec['variant']['id']);
        
        // Filter: skladem (in stock)
        if (!$this->isInStock($v)) {
            return false;
        }
        
        // Filter: viditelný/na prodej (visible for sale)
        if (!$this->isVisibleForSale($v)) {
            return false;
        }
        
        return true;
    });
}
```

### STEP 5: Frontend - Widget Type Selector Component

```tsx
// frontend/src/features/products/components/WidgetTypeSelector.tsx

import { Card, Group, Radio, Stack, Text, Badge } from '@mantine/core';
import { WidgetType } from '../types';

interface WidgetTypeSelectorProps {
  value: WidgetType;
  onChange: (type: WidgetType) => void;
  disabled?: boolean;
}

const WIDGET_TYPES: Array<{
  value: WidgetType;
  label: string;
  description: string;
  badge?: string;
}> = [
  {
    value: 'brand_inspired',
    label: 'Inspirováno stejnou značkou',
    description: '3 produkty se stejnou inspirovanou značkou + několik podobných produktů',
    badge: 'Oblíbené',
  },
  {
    value: 'similarity_based',
    label: 'Podobné produkty',
    description: 'Algoritmus porovnává vlastnosti a hledá maximální shodu',
    badge: 'AI-powered',
  },
  {
    value: 'stock_filtered',
    label: 'Dostupné produkty',
    description: 'Zobrazuje jen produkty, které jsou skladem a viditelné pro nákup',
  },
  {
    value: 'hybrid',
    label: 'Kombinované doporučení',
    description: 'Mix všech stratégií pro nejlepší výsledky',
    badge: 'Advanced',
  },
  {
    value: 'custom',
    label: 'Vlastní výběr',
    description: 'Vy si ručně vybíráte, které produkty se mají zobrazit',
  },
];

export const WidgetTypeSelector = ({ value, onChange, disabled }: WidgetTypeSelectorProps) => {
  return (
    <Stack gap="md">
      <Text fw={600}>Typ widgetu</Text>
      {WIDGET_TYPES.map((type) => (
        <Card key={type.value} p="md" radius="md" withBorder>
          <Group gap="md">
            <Radio
              value={type.value}
              checked={value === type.value}
              onChange={() => onChange(type.value as WidgetType)}
              disabled={disabled}
            />
            <Stack gap={4} style={{ flex: 1 }}>
              <Group gap="sm">
                <Text fw={500}>{type.label}</Text>
                {type.badge && <Badge size="sm">{type.badge}</Badge>}
              </Group>
              <Text size="sm" c="dimmed">{type.description}</Text>
            </Stack>
          </Group>
        </Card>
      ))}
    </Stack>
  );
};
```

### STEP 6: Frontend - Multi-Language Translations

```tsx
// frontend/src/features/products/components/WidgetTranslations.tsx

import { Stack, Tabs, TextInput, Textarea, Text } from '@mantine/core';
import { useForm } from '@mantine/form';

interface TranslationData {
  title: string;
  description: string;
  heading?: string;
}

interface WidgetTranslationsProps {
  value: Record<string, TranslationData>;
  onChange: (translations: Record<string, TranslationData>) => void;
}

const LOCALES = [
  { code: 'cs', label: '🇨🇿 Čeština' },
  { code: 'sk', label: '🇸🇰 Slovenčina' },
  { code: 'hu', label: '🇭🇺 Magyar' },
  { code: 'ro', label: '🇷🇴 Română' },
  { code: 'hr', label: '🇭🇷 Hrvatski' },
];

export const WidgetTranslations = ({ value, onChange }: WidgetTranslationsProps) => {
  return (
    <Stack gap="md">
      <Text fw={600}>Jazykové verze</Text>
      <Tabs defaultValue="cs">
        <Tabs.List>
          {LOCALES.map((locale) => (
            <Tabs.Tab key={locale.code} value={locale.code}>
              {locale.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {LOCALES.map((locale) => (
          <Tabs.Panel key={locale.code} value={locale.code} pt="md">
            <WidgetTranslationForm
              locale={locale.code}
              data={value[locale.code]}
              onSave={(updated) =>
                onChange({
                  ...value,
                  [locale.code]: updated,
                })
              }
            />
          </Tabs.Panel>
        ))}
      </Tabs>
    </Stack>
  );
};

interface WidgetTranslationFormProps {
  locale: string;
  data?: TranslationData;
  onSave: (data: TranslationData) => void;
}

const WidgetTranslationForm = ({ locale, data, onSave }: WidgetTranslationFormProps) => {
  const form = useForm<TranslationData>({
    initialValues: data || { title: '', description: '', heading: '' },
  });

  return (
    <form onSubmit={form.onSubmit(onSave)}>
      <Stack gap="md">
        <TextInput
          label="Nadpis"
          placeholder="např. Doporučené produkty"
          {...form.getInputProps('title')}
        />
        <Textarea
          label="Popis"
          placeholder="Krátký popis co se v widgetu zobrazuje"
          {...form.getInputProps('description')}
        />
        <TextInput
          label="Nadpis v HTML (volitelné)"
          placeholder="Pokud chceš jiný nadpis v samotném widgetu"
          {...form.getInputProps('heading')}
        />
        <Button onClick={() => onSave(form.values)}>
          Uložit překlad
        </Button>
      </Stack>
    </form>
  );
};
```

### STEP 7: Frontend - Algorithm Config per Type

```tsx
// frontend/src/features/products/components/WidgetAlgorithmConfig.tsx

import { Stack, Text, NumberInput, Group, Checkbox, Select } from '@mantine/core';

interface WidgetAlgorithmConfigProps {
  type: string;
  value: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

export const WidgetAlgorithmConfig = ({
  type,
  value,
  onChange,
}: WidgetAlgorithmConfigProps) => {
  if (type === 'custom') {
    return null;
  }

  return (
    <Stack gap="md">
      <Text fw={600}>Nastavení algoritmu</Text>

      {type === 'brand_inspired' && (
        <NumberInput
          label="Počet produktů se stejnou značkou"
          min={1}
          max={8}
          value={value.brand_limit ?? 3}
          onChange={(val) => onChange({ ...value, brand_limit: val })}
        />
      )}

      {type === 'stock_filtered' && (
        <Stack gap="sm">
          <Checkbox
            label="Jen skladem (in stock)"
            checked={value.in_stock ?? true}
            onChange={(e) => onChange({ ...value, in_stock: e.currentTarget.checked })}
          />
          <Checkbox
            label="Jen viditelné pro nákup"
            checked={value.visible_for_sale ?? true}
            onChange={(e) => onChange({ ...value, visible_for_sale: e.currentTarget.checked })}
          />
        </Stack>
      )}

      {(type === 'similarity_based' || type === 'hybrid') && (
        <NumberInput
          label="Limit produktů"
          min={1}
          max={12}
          value={value.limit ?? 6}
          onChange={(val) => onChange({ ...value, limit: val })}
        />
      )}
    </Stack>
  );
};
```

### STEP 8: Update ProductWidgetDetailPage

```tsx
// Přidej do ProductWidgetDetailPage.tsx

const [formState, setFormState] = useState<WidgetFormState>(createEmptyForm());

return (
  <SectionPageShell section="products" title="Widget editor">
    <Stack gap="md">
      {/* Existing fields */}
      <TextInput label="Název" {...form} />
      <TextInput label="Slug" {...form} />
      
      {/* NEW: Widget Type Selector */}
      <WidgetTypeSelector
        value={formState.type}
        onChange={(type) =>
          setFormState({ ...formState, type })
        }
      />

      {/* NEW: Algorithm Config (per type) */}
      <WidgetAlgorithmConfig
        type={formState.type}
        value={formState.algorithmConfig}
        onChange={(config) =>
          setFormState({ ...formState, algorithmConfig: config })
        }
      />

      {/* NEW: Multi-language Translations */}
      <WidgetTranslations
        value={formState.translations}
        onChange={(translations) =>
          setFormState({ ...formState, translations })
        }
      />

      {/* NEW: Preview (per language) */}
      <Card withBorder>
        <Stack gap="md">
          <Text fw={600}>Náhled</Text>
          <WidgetPreview
            type={formState.type}
            translations={formState.translations}
            algorithmConfig={formState.algorithmConfig}
          />
        </Stack>
      </Card>

      {/* Existing items/settings */}
      ...
    </Stack>
  </SectionPageShell>
);
```

---

## 📚 TRANSLATIONS FILE STRUCTURE

```json
{
  "cs": {
    "title": "Doporučené produkty",
    "description": "Produkty vybrané speciálně pro vás",
    "heading": "Doporučujeme také"
  },
  "sk": {
    "title": "Odporúčané produkty",
    "description": "Produkty vybrané špeciálne pre vás",
    "heading": "Odporúčame aj"
  },
  "hu": {
    "title": "Ajánlott termékek",
    "description": "Ön számára kiválasztott termékek",
    "heading": "Azt is ajánljuk"
  },
  "ro": {
    "title": "Produse recomandate",
    "description": "Produse selectate special pentru tine",
    "heading": "Recomandăm și"
  },
  "hr": {
    "title": "Preporučeni proizvodi",
    "description": "Proizvodi posebno odabrani za vas",
    "heading": "Preporučujemo i"
  }
}
```

---

## 🚀 IMPLEMENTAČNÍ PLÁN

| Fáze | Čas | Co se dělá |
|------|-----|-----------|
| 1 | 30 min | Migration + Model update (ProductWidget.type, algorithm_config, translations) |
| 2 | 1h | Backend logic (WidgetType enum, recommendation methods) |
| 3 | 1.5h | Frontend components (TypeSelector, AlgorithmConfig, Translations) |
| 4 | 30 min | Integration to ProductWidgetDetailPage |
| 5 | 30 min | Testing & translations data |
| **TOTAL** | **3.5 HODINY** | **Kompletní Widget Builder s multi-language support** |

---

**Chcete, aby jsem to implementoval?** 👍

Mohu udělat v pořadí:
1. ✅ Migration + Backend enum + Model update
2. ✅ Frontend komponenty  
3. ✅ Translations setup
4. ✅ Integration & testing
