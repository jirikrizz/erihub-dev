import type { InventoryVariant } from '../../../api/inventory';
import type { MicrositeProductOverlay } from '../../../api/microsites';
import type { ProductWidgetItemPayload, ProductWidgetItemVariantOption } from '../../../api/productWidgets';

export const formatCurrency = (value: number | null | undefined, currency: string | null | undefined) => {
  if (value == null || Number.isNaN(Number(value))) {
    return '';
  }

  const numericValue = Number(value);
  const isInteger = Number.isFinite(numericValue) && Number.isInteger(numericValue);
  const formatter = new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: currency || 'CZK',
    minimumFractionDigits: isInteger ? 0 : 2,
    maximumFractionDigits: isInteger ? 0 : 2,
  });

  return formatter.format(numericValue);
};

export const normalizeString = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

export const normalizeOptionalString = (value: unknown): string | null => {
  const normalized = normalizeString(value);
  return normalized === '' ? null : normalized;
};

export const stripSizePrefix = (value: string | null | undefined): string | null => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;
  const cleaned = normalized.replace(/^\s*(?:velikost|varianta|size)\s*[-:]\s*/i, '').trim();
  return cleaned === '' ? normalized : cleaned;
};

export const splitOriginalLabel = (value: string | null | undefined, fallbackBrand?: string | null) => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return { brand: fallbackBrand ?? null, title: null };
  }

  const fallbackNormalized = normalizeOptionalString(fallbackBrand);
  if (fallbackNormalized) {
    const lowerValue = normalized.toLowerCase();
    const lowerFallback = fallbackNormalized.toLowerCase();
    if (lowerValue.startsWith(lowerFallback)) {
      const stripped = normalized.substring(fallbackNormalized.length).trim();
      return {
        brand: fallbackBrand ?? fallbackNormalized,
        title: stripped === '' ? null : stripped,
      };
    }
  }

  const separators = [' - ', ' – ', ' — ', ' | ', '/', '\\'];
  for (const separator of separators) {
    if (normalized.includes(separator)) {
      const [brand, title] = normalized.split(separator, 2).map((part) => part.trim());
      return {
        brand: brand || fallbackBrand || null,
        title: title || null,
      };
    }
  }

  const tokens = normalized.split(/\s+/);
  if (tokens.length >= 3) {
    const brandTokens = tokens.slice(0, Math.min(3, tokens.length - 1));
    const titleTokens = tokens.slice(brandTokens.length);
    return {
      brand: brandTokens.join(' ') || fallbackBrand || null,
      title: titleTokens.join(' ') || null,
    };
  }

  return { brand: normalized || fallbackBrand || null, title: null };
};

const SHOPTET_CDN_ORIGIN = 'https://cdn.myshoptet.com';
const SHOP_STORAGE_PREFIX = 'usr/www.krasnevune.cz/';
const SHOP_BASE_PATH = `${SHOPTET_CDN_ORIGIN}/${SHOP_STORAGE_PREFIX}`;
const SHOP_IMAGES_ROOT = `${SHOP_BASE_PATH}user/shop/`;
const SHOP_BIG_ROOT = `${SHOP_IMAGES_ROOT}big/`;

export const ensureAbsoluteImageUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  const sanitized = trimmed.replace(/^\/+/, '');
  const lowered = sanitized.toLowerCase();

  if (lowered.startsWith('cdn.myshoptet.com/')) {
    return `https://${sanitized}`;
  }

  if (lowered.startsWith('usr/')) {
    return `${SHOPTET_CDN_ORIGIN}/${sanitized}`;
  }

  if (lowered.startsWith('user/')) {
    return `${SHOP_BASE_PATH}${sanitized}`;
  }

  const shopDirPrefixes = ['orig/', 'big/', 'medium/', 'small/', 'thumb/', 'thumbnail/'];
  if (shopDirPrefixes.some((prefix) => lowered.startsWith(prefix))) {
    return `${SHOP_IMAGES_ROOT}${sanitized}`;
  }

  return `${SHOP_BIG_ROOT}${sanitized}`;
};

export type WidgetGender = 'female' | 'male' | 'unisex' | 'unknown';

export const GENDER_THEMES: Record<WidgetGender, { color: string; icon: string; background: string }> = {
  female: {
    color: '#d6345a',
    icon: 'https://www.krasnevune.cz/user/documents/svg/female.svg',
    background: 'https://www.krasnevune.cz/user/documents/upload/woman_bg_p.svg',
  },
  male: {
    color: '#3461d6',
    icon: 'https://www.krasnevune.cz/user/documents/svg/male.svg',
    background: 'https://www.krasnevune.cz/user/documents/upload/man_bg_p.svg',
  },
  unisex: {
    color: '#000000',
    icon: 'https://www.krasnevune.cz/user/documents/svg/unisex_icon.svg',
    background: 'https://www.krasnevune.cz/user/documents/upload/uni_bg_p.svg',
  },
  unknown: {
    color: '#d6345a',
    icon: 'https://www.krasnevune.cz/user/documents/svg/female.svg',
    background: 'https://www.krasnevune.cz/user/documents/upload/woman_bg_p.svg',
  },
};

const stripDiacritics = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normalizeGenderValue = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  return stripDiacritics(trimmed).toLowerCase();
};

const FEMALE_KEYWORDS = ['zena', 'zeny', 'damska', 'damske', 'damsky', 'female', 'woman', 'women', 'lady', 'ladies'];
const MALE_KEYWORDS = ['muz', 'muzi', 'panska', 'panske', 'pansky', 'male', 'man', 'men', 'gentleman', 'gentlemen'];
const UNISEX_KEYWORDS = ['unisex', 'spolecna', 'obojpohlavni', 'oboji', 'pro vsechny', 'shared'];

const classifyGenderValue = (value: unknown): WidgetGender | null => {
  const normalized = normalizeGenderValue(value);
  if (!normalized) {
    return null;
  }

  const sanitized = normalized.replace(/-/g, ' ');
  const tokens = sanitized.split(/[\s,;/]+/).filter((token) => token !== '');
  const searchSpace = [...tokens, sanitized];

  if (searchSpace.some((token) => UNISEX_KEYWORDS.some((keyword) => token.includes(keyword)))) {
    return 'unisex';
  }

  if (sanitized.includes('damsko') && sanitized.includes('pansk')) {
    return 'unisex';
  }

  if (searchSpace.some((token) => FEMALE_KEYWORDS.some((keyword) => token.includes(keyword)) || token.includes('zen'))) {
    return 'female';
  }

  if (
    searchSpace.some((token) =>
      MALE_KEYWORDS.some((keyword) => token.includes(keyword)) || token.includes('muz') || token === 'man' || token === 'men'
    )
  ) {
    return 'male';
  }

  return null;
};

const collectGenderCandidates = (values: unknown, target: string[]): void => {
  const pushValue = (input: unknown) => {
    if (!input) {
      return;
    }
    if (Array.isArray(input)) {
      input.forEach((item) => pushValue(item));
      return;
    }
    if (typeof input === 'string') {
      const parts = input.split(/[,/|;]+/).map((part) => part.trim()).filter((part) => part !== '');
      if (parts.length === 0) {
        target.push(input);
      } else {
        parts.forEach((part) => target.push(part));
      }
      return;
    }
    if (typeof input === 'object') {
      const record = input as Record<string, unknown>;
      pushValue(record.value);
      pushValue(record.label);
      pushValue(record.name);
      pushValue(record.title);
      pushValue(record.text);
    }
  };

  pushValue(values);
};

const collectGenderParameters = (parameters: unknown, candidates: string[]): void => {
  if (!parameters) {
    return;
  }

  const inspectEntry = (entry: unknown) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const record = entry as Record<string, unknown>;
    const keyCandidates = [record.code, record.key, record.name, record.label, record.title];
    const shouldInspect = keyCandidates.some((candidate) => {
      const normalized = normalizeGenderValue(candidate);
      if (!normalized) {
        return false;
      }
      return normalized.includes('pohl') || normalized.includes('gender') || normalized.includes('sex');
    });

    if (shouldInspect) {
      collectGenderCandidates(record.values, candidates);
      collectGenderCandidates(record.value, candidates);
      collectGenderCandidates(record.label, candidates);
      collectGenderCandidates(record.name, candidates);
    }
  };

  if (Array.isArray(parameters)) {
    parameters.forEach((entry) => inspectEntry(entry));
    return;
  }

  if (typeof parameters === 'object') {
    Object.values(parameters as Record<string, unknown>).forEach((entry) => {
      if (Array.isArray(entry)) {
        entry.forEach((subEntry) => inspectEntry(subEntry));
      } else {
        inspectEntry(entry);
      }
    });
  }
};

const normalizeParameterKey = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const normalized = stripDiacritics(trimmed).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return normalized === '' ? null : normalized;
};

const collectParameterValuesMatching = (
  source: unknown,
  matcher: (key: string) => boolean,
  target: string[],
  seen: Set<string>
): void => {
  const pushValue = (input: unknown) => {
    if (input == null) {
      return;
    }
    if (Array.isArray(input)) {
      input.forEach((entry) => pushValue(entry));
      return;
    }
    if (typeof input === 'object') {
      const record = input as Record<string, unknown>;
      // Prefer structured value fields (often keep the raw brand) before labels that may contain titles.
      pushValue(record.value);
      pushValue(record.values);
      pushValue(record.label);
      pushValue(record.displayName);
      pushValue(record.name);
      pushValue(record.title);
      pushValue(record.text);
      return;
    }
    if (typeof input === 'string' || typeof input === 'number') {
      const text = String(input).trim();
      if (text === '') {
        return;
      }
      const normalized = stripDiacritics(text).toLowerCase();
      if (normalized === '') {
        return;
      }
      if (seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      target.push(text);
    }
  };

  const inspectEntry = (entry: unknown) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const record = entry as Record<string, unknown>;
    const keyCandidates = [
      record.code,
      record.key,
      record.name,
      record.label,
      record.title,
      record.slug,
      record.parameter,
      record.category,
    ];

    const matches = keyCandidates.some((candidate) => {
      const normalized = normalizeParameterKey(candidate);
      return normalized ? matcher(normalized) : false;
    });

    if (!matches) {
      return;
    }

    pushValue(record.value);
    pushValue(record.values);
    pushValue(record.label);
    pushValue(record.name);
    pushValue(record.text);
  };

  const traverse = (input: unknown): void => {
    if (input == null) {
      return;
    }
    if (Array.isArray(input)) {
      input.forEach((item) => {
        traverse(item);
      });
      return;
    }
    if (typeof input === 'object') {
      inspectEntry(input);
      Object.values(input as Record<string, unknown>).forEach((value) => {
        if (value && (typeof value === 'object' || Array.isArray(value))) {
          traverse(value);
        }
      });
    }
  };

  traverse(source);
};

const gatherParameterValues = (sources: unknown[], matcher: (key: string) => boolean): string[] => {
  const values: string[] = [];
  const seen = new Set<string>();
  sources.forEach((source) => collectParameterValuesMatching(source, matcher, values, seen));
  return values;
};

const BRAND_FIELD_KEYS = [
  'znacka-2',
  'znacka_originalu',
  'znackaOriginalu',
  'original_brand',
  'originalBrand',
  'znacka',
  'značka',
  'brand',
  'brand_name',
  'brandName',
  'vyrobce',
  'výrobce',
  'vyrobca',
  'manufacturer',
  'producer',
];

const matchesBrandParameterKey = (key: string): boolean => {
  const normalized = normalizeParameterKey(key);
  if (!normalized) {
    return false;
  }
  return (
    normalized === 'znacka' ||
    normalized === 'znacka 2' ||
    normalized === 'znacka-2' ||
    normalized === 'znacka2' ||
    normalized.includes('znacka 2')
  );
};

const matchesExactBrandParameterKey = (key: string): boolean => {
  const normalized = normalizeParameterKey(key);
  if (!normalized) {
    return false;
  }
  return normalized === 'znacka-2' || normalized === 'znacka 2' || normalized === 'znacka2';
};

const matchesInspirationParameterKey = (key: string): boolean => {
  const normalized = normalizeParameterKey(key);
  if (!normalized) {
    return false;
  }
  if (normalized === 'desc') {
    return true;
  }
  return normalized.includes('inspiro') || normalized.includes('inspirac') || normalized.includes('podobn');
};

const LOREAL_BRAND_MAP: Record<string, string> = {
  'ysl': 'Yves Saint Laurent',
  'yves saint laurent': 'Yves Saint Laurent',
  'giorgio armani': 'Armani',
  'armani': 'Armani',
  'prada': 'Prada',
  'valentino': 'Valentino',
  'mugler': 'Mugler',
  'thierry mugler': 'Mugler',
  'viktor & rolf': 'Viktor & Rolf',
  'viktor&rolf': 'Viktor & Rolf',
  'diesel': 'Diesel',
  'ralph lauren': 'Ralph Lauren',
  'azzaro': 'Azzaro',
  'cacharel': 'Cacharel',
  'maison margiela': 'Maison Margiela',
  'lancome': 'Lancôme',
  'lancôme': 'Lancôme',
  'atelier cologne': 'Atelier Cologne',
};

const sanitizeBrandSearchText = (value: string): string =>
  stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9&]+/g, ' ')
    .trim();

const SANITIZED_LOREAL_BRAND_ENTRIES: Array<{ needle: string; brand: string }> = Object.entries(LOREAL_BRAND_MAP).map(
  ([needle, brand]) => ({
    needle: sanitizeBrandSearchText(needle),
    brand,
  })
);

const extractStringValue = (input: unknown): string | null => {
  if (typeof input === 'string' || typeof input === 'number') {
    const text = String(input).trim();
    return text === '' ? null : text;
  }
  if (Array.isArray(input)) {
    for (const entry of input) {
      const extracted = extractStringValue(entry);
      if (extracted) {
        return extracted;
      }
    }
    return null;
  }
  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>;
    const candidateKeys = ['value', 'values', 'label', 'name', 'title', 'text'];
    for (const key of candidateKeys) {
      if (key in record) {
        const extracted = extractStringValue(record[key]);
        if (extracted) {
          return extracted;
        }
      }
    }
  }
  return null;
};

const GENERIC_BRAND_LABELS = new Set(['znacka', 'znacka2', 'znackaoriginalu', 'brand', 'originalbrand']);

const isGenericBrandLabel = (value: string | null | undefined): boolean => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return false;
  }
  const simplified = stripDiacritics(normalized).toLowerCase().replace(/\s+/g, '');
  return GENERIC_BRAND_LABELS.has(simplified);
};

const extractBrandFromParameters = (sources: unknown[]): string | null => {
  let result: string | null = null;

  const inspectEntry = (entry: unknown): void => {
    if (result || !entry || typeof entry !== 'object') {
      return;
    }
    const record = entry as Record<string, unknown>;
    const keyCandidates = [
      record.code,
      record.key,
      record.name,
      record.label,
      record.title,
      record.slug,
      record.parameter,
      record.category,
    ];

    const matches = keyCandidates.some((candidate) => {
      const normalized = normalizeParameterKey(candidate);
      return normalized ? matchesExactBrandParameterKey(normalized) : false;
    });

    if (matches) {
      const valueCandidate = extractStringValue(record.value) ?? extractStringValue(record.values);
      if (valueCandidate) {
        result = valueCandidate;
        return;
      }

      const labelCandidate =
        extractStringValue(record.label) ??
        extractStringValue(record.name) ??
        extractStringValue(record.title) ??
        extractStringValue(record.text);
      if (labelCandidate && !isGenericBrandLabel(labelCandidate)) {
        result = labelCandidate;
        return;
      }
    }

    Object.values(record).forEach((value) => {
      if (!result && (Array.isArray(value) || typeof value === 'object')) {
        inspectEntry(value);
      }
    });
  };

  sources.forEach((source) => {
    if (!result) {
      inspectEntry(source);
    }
  });

  return result;
};


const detectBrandMatch = (value: string | null | undefined): string | null => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }
  const sanitized = sanitizeBrandSearchText(normalized);
  if (!sanitized) {
    return null;
  }
  for (const entry of SANITIZED_LOREAL_BRAND_ENTRIES) {
    if (sanitized.includes(entry.needle)) {
      return entry.brand;
    }
  }
  return null;
};

const resolveBrandCandidate = (value: unknown, depth = 0): string | null => {
  if (value == null || depth > 4) {
    return null;
  }

  if (typeof value === 'string') {
    const normalized = normalizeOptionalString(value);
    if (!normalized) {
      return null;
    }
    const mapped = detectBrandMatch(normalized);
    return mapped ?? normalized;
  }

  if (Array.isArray(value)) {
    let fallback: string | null = null;
    for (const entry of value) {
      const candidate = resolveBrandCandidate(entry, depth + 1);
      if (candidate) {
        const mapped = detectBrandMatch(candidate);
        if (mapped) {
          return mapped;
        }
        if (!fallback) {
          fallback = candidate;
        }
      }
    }
    return fallback;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, 'znacka-2')) {
      const preferred = resolveBrandCandidate(record['znacka-2'], depth + 1);
      if (preferred) {
        const mapped = detectBrandMatch(preferred);
        if (mapped) {
          return mapped;
        }
        return preferred;
      }
    }
    if (Object.prototype.hasOwnProperty.call(record, 'original_brand')) {
      const preferredOriginal = resolveBrandCandidate(record['original_brand'], depth + 1);
      if (preferredOriginal) {
        const mappedOriginal = detectBrandMatch(preferredOriginal);
        if (mappedOriginal) {
          return mappedOriginal;
        }
        return preferredOriginal;
      }
    }
    if (Object.prototype.hasOwnProperty.call(record, 'originalBrand')) {
      const preferredOriginalAlt = resolveBrandCandidate(record['originalBrand'], depth + 1);
      if (preferredOriginalAlt) {
        const mappedOriginalAlt = detectBrandMatch(preferredOriginalAlt);
        if (mappedOriginalAlt) {
          return mappedOriginalAlt;
        }
        return preferredOriginalAlt;
      }
    }

    const direct =
      normalizeOptionalString(record.label) ??
      normalizeOptionalString(record.name) ??
      normalizeOptionalString(record.title) ??
      normalizeOptionalString(record.text) ??
      normalizeOptionalString(record.value);

    if (direct) {
      const mappedDirect = detectBrandMatch(direct);
      return mappedDirect ?? direct;
    }

    for (const key of BRAND_FIELD_KEYS) {
      if (key in record) {
        const candidate = resolveBrandCandidate(record[key], depth + 1);
        if (candidate) {
          const mapped = detectBrandMatch(candidate);
          if (mapped) {
            return mapped;
          }
          return candidate;
        }
      }
    }
  }

  return null;
};

const extractNumericValue = (value: unknown): number | null => {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, '').replace(',', '.');
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number.parseFloat(match[0]);
      return Number.isNaN(parsed) ? null : parsed;
    }
  }

  return null;
};

const currencyAliases: Record<string, string> = {
  'Kč': 'CZK',
  'KČ': 'CZK',
  CZK: 'CZK',
  '€': 'EUR',
  EUR: 'EUR',
  '$': 'USD',
  USD: 'USD',
};

const extractCurrencyCode = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const stripped = value.replace(/[0-9\s.,-]/g, '').trim();
  if (stripped === '') {
    return null;
  }
  const upper = stripped.toUpperCase();
  if (currencyAliases[upper]) {
    return currencyAliases[upper];
  }
  if (upper.length === 3) {
    return upper;
  }
  return null;
};

const buildVolumeDisplay = (value: number | null, unit: string | null, fallback: string | null): string | null => {
  if (value == null && !fallback) {
    return null;
  }

  if (fallback) {
    return fallback;
  }

  if (value == null) {
    return null;
  }

  const rounded = Number.isInteger(value) ? value.toFixed(0) : value.toString().replace('.', ',');
  return unit ? `${rounded} ${unit}` : rounded;
};

const extractInspiredTitleFromValue = (value: unknown, brand: string | null | undefined): string | null => {
  const textValue = normalizeOptionalString(value);
  if (!textValue) {
    return null;
  }

  let extracted = textValue;
  const inspirationMatch = extracted.match(/inspirov[aá]no\s*[,:-]*\s*(.*)$/i);
  if (inspirationMatch && inspirationMatch[1]) {
    extracted = inspirationMatch[1].trim();
  }

  extracted = extracted.replace(/^[,\-–:;\s]+/, '').trim();

  if (brand) {
    const normalizedBrand = stripDiacritics(brand).toLowerCase();
    const normalizedExtracted = stripDiacritics(extracted).toLowerCase();
    if (normalizedExtracted.startsWith(normalizedBrand)) {
      extracted = extracted.slice(brand.length).trim();
      extracted = extracted.replace(/^[,\-–:;\s]+/, '').trim();
    }
  }

  return extracted || null;
};

const findBrandInText = (value: unknown): string | null => {
  const textValue = normalizeOptionalString(value);
  if (!textValue) {
    return null;
  }

  const sanitized = sanitizeBrandSearchText(textValue);
  if (sanitized === '') {
    return null;
  }

  for (const entry of SANITIZED_LOREAL_BRAND_ENTRIES) {
    if (sanitized.includes(entry.needle)) {
      return entry.brand;
    }
  }

  return null;
};

const resolveBrandFromTextSources = (source: unknown): string | null => {
  if (source == null) {
    return null;
  }

  if (Array.isArray(source)) {
    for (const entry of source) {
      const candidate = resolveBrandFromTextSources(entry);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }

  if (typeof source === 'object') {
    for (const value of Object.values(source as Record<string, unknown>)) {
      const candidate = resolveBrandFromTextSources(value);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }

  return findBrandInText(source);
};

const stripBrandFromTitle = (title: string | null | undefined, brand: string | null | undefined): string | null => {
  const rawTitle = normalizeOptionalString(title);
  if (!rawTitle) {
    return null;
  }
  const normalizedBrand = normalizeOptionalString(brand);
  if (!normalizedBrand) {
    return rawTitle;
  }
  const brandPattern = sanitizeBrandSearchText(normalizedBrand);
  const titlePattern = sanitizeBrandSearchText(rawTitle);
  if (brandPattern && titlePattern.startsWith(brandPattern)) {
    const stripped = rawTitle.substring(normalizedBrand.length).trim();
    return stripped === '' ? rawTitle : stripped;
  }
  return rawTitle;
};

const extractImageUrl = (input: unknown): string | null => {
  if (typeof input === 'string') {
    return ensureAbsoluteImageUrl(input);
  }

  if (!input || typeof input !== 'object') {
    return null;
  }

  const record = input as Record<string, unknown>;
  const candidates = [
    record.url,
    record.image,
    record.image_url,
    record.imageUrl,
    record.src,
    record.path,
    record.original,
    record.full,
    record.fullSize,
  ];

  for (const candidate of candidates) {
    const normalized = ensureAbsoluteImageUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const gatherImageUrls = (sources: unknown[]): string[] => {
  const results: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (value: string | null | undefined) => {
    const normalized = ensureAbsoluteImageUrl(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    results.push(normalized);
  };

  const traverse = (input: unknown): void => {
    if (input == null) {
      return;
    }

    if (typeof input === 'string' || typeof input === 'number') {
      addCandidate(String(input));
      return;
    }

    if (Array.isArray(input)) {
      input.forEach((entry) => traverse(entry));
      return;
    }

    if (typeof input === 'object') {
      const record = input as Record<string, unknown>;
      addCandidate(extractImageUrl(record));

      const nestedKeys = [
        'url',
        'image',
        'image_url',
        'imageUrl',
        'src',
        'path',
        'full',
        'fullSize',
        'original',
        'preview',
        'thumb',
        'thumbnail',
        'small',
        'medium',
        'large',
        'default',
      ];

      nestedKeys.forEach((key) => {
        if (key in record) {
          traverse(record[key]);
        }
      });

      Object.values(record).forEach((value) => {
        if (value && (Array.isArray(value) || typeof value === 'object')) {
          traverse(value);
        }
      });
    }
  };

  sources.forEach((source) => traverse(source));

  return results;
};

const detectWidgetGender = (
  variant: InventoryVariant,
  snapshot: Record<string, unknown> | undefined,
  productPayload: Record<string, unknown>,
  variantData: Record<string, unknown>
): WidgetGender => {
  const candidates: string[] = [];

  const push = (value: unknown) => collectGenderCandidates(value, candidates);

  if (Array.isArray(variant.filter_parameters)) {
    variant.filter_parameters.forEach((parameter) => {
      const normalizedName = normalizeGenderValue(parameter.name);
      if (normalizedName && (normalizedName.includes('pohl') || normalizedName.includes('gender') || normalizedName.includes('sex'))) {
        push(parameter.values);
      }
    });
  }

  const snapshotParameters = snapshot && typeof snapshot === 'object' ? (snapshot.parameters as unknown) : undefined;
  collectGenderParameters(snapshotParameters, candidates);
  collectGenderParameters(variantData.parameters, candidates);
  collectGenderParameters(variantData.filteringParameters, candidates);
  collectGenderParameters(productPayload.descriptiveParameters, candidates);
  collectGenderParameters(productPayload.filteringParameters, candidates);

  push(variantData.gender);
  push(variantData.sex);
  push(productPayload.gender);
  push(productPayload.sex);
  push(snapshot?.gender);

  if (Array.isArray(variant.filter_parameters)) {
    variant.filter_parameters.forEach((parameter) => push(parameter.values));
  }

  if (Array.isArray(variant.tags)) {
    variant.tags.forEach((tag) => push(tag.name));
  }

  let hasFemale = false;
  let hasMale = false;

  for (const candidate of candidates) {
    const classification = classifyGenderValue(candidate);
    if (classification === 'unisex') {
      return 'unisex';
    }
    if (classification === 'female') {
      hasFemale = true;
    }
    if (classification === 'male') {
      hasMale = true;
    }
  }

  if (hasFemale && hasMale) {
    return 'unisex';
  }
  if (hasFemale) {
    return 'female';
  }
  if (hasMale) {
    return 'male';
  }

  return 'unknown';
};

export const buildDefaultPayload = (
  variant: InventoryVariant,
  snapshot: Record<string, unknown> | undefined
): ProductWidgetItemPayload => {
  const snapshotRecord = (snapshot ?? {}) as Record<string, unknown>;
  const productBasePayload = (variant.product?.base_payload ?? {}) as Record<string, unknown>;
  const variantData = (variant.data ?? {}) as Record<string, unknown>;

  const imageSources: unknown[] = [
    snapshotRecord.images,
    snapshotRecord.image,
    snapshotRecord.media,
    snapshotRecord.gallery,
    snapshotRecord.default_image,
    snapshotRecord.defaultImage,
    snapshotRecord.mainImage,
    snapshotRecord.main_image,
    (snapshotRecord.product as Record<string, unknown> | undefined)?.images,
    variantData.images,
    variantData.image,
    variantData.image_url,
    variantData.imageUrl,
    variantData.media,
    variantData.gallery,
    productBasePayload.images,
    productBasePayload.image,
    productBasePayload.media,
  ];

  const resolvedImages = gatherImageUrls(imageSources);
  const firstImage = resolvedImages[0];
  const secondImage = resolvedImages[1];
  const priceValue =
    typeof variant.price === 'number'
      ? variant.price
      : typeof snapshotRecord.price === 'number'
      ? (snapshotRecord.price as number)
      : null;
  const basePayloadCurrency = variant.product?.base_payload?.currency;
  const currency =
    variant.currency_code ??
    (typeof snapshotRecord.currency === 'string' ? (snapshotRecord.currency as string) : null) ??
    (typeof basePayloadCurrency === 'string' ? basePayloadCurrency : null) ??
    'CZK';
  const detectedGender = detectWidgetGender(variant, snapshotRecord, productBasePayload, variantData);
  const genderTheme = GENDER_THEMES[detectedGender] ?? GENDER_THEMES.unknown;
  const rawTitle =
    normalizeOptionalString(snapshotRecord.nazev_produktu as string | undefined) ??
    normalizeOptionalString(productBasePayload.displayName as string | undefined) ??
    normalizeOptionalString(productBasePayload.name as string | undefined) ??
    normalizeOptionalString(variant.name ?? '') ??
    normalizeOptionalString(snapshotRecord.name as string | undefined) ??
    variant.code ?? 'Produkt';
  const defaultTitle = stripSizePrefix(rawTitle) ?? rawTitle;
  const DEFAULT_SUBTITLE = 'Parfémovaná voda, zaměňována s:';
  const defaultSubtitle = DEFAULT_SUBTITLE;
  const baseOriginalName =
    normalizeOptionalString(snapshotRecord.nazev_originalu as string | undefined) ??
    normalizeOptionalString(productBasePayload.original_name as string | undefined) ??
    normalizeOptionalString(productBasePayload.originalName as string | undefined) ??
    normalizeOptionalString(variantData.original_name as string | undefined) ??
    normalizeOptionalString(variantData.originalName as string | undefined) ??
    null;
  const subtitleValue = defaultSubtitle ?? 'Parfémovaná voda, zaměňována s:';

  const parameterSources: unknown[] = [
    snapshotRecord.parameters,
    variantData.parameters,
    variantData.filteringParameters,
    productBasePayload.descriptiveParameters,
    productBasePayload.filteringParameters,
    variant.filter_parameters,
  ];

  const structuredBrandCandidate = extractBrandFromParameters(parameterSources);
  const resolvedStructuredBrand = resolveBrandCandidate(structuredBrandCandidate);
  const structuredBrandText = resolvedStructuredBrand ?? null;
  const brandParameterValues = gatherParameterValues(parameterSources, matchesBrandParameterKey);
  const inspirationParameterValues = gatherParameterValues(parameterSources, matchesInspirationParameterKey);
  const dominantIngredientValues = gatherParameterValues(parameterSources, (key) =>
    key.includes('dominant') && (key.includes('ingred') || key.includes('sloz'))
  );
  const fragranceValues = gatherParameterValues(parameterSources, (key) => key.includes('druh') && key.includes('vune'));

  const productRecord = (variant.product ?? {}) as Record<string, unknown>;
  const productVariants = Array.isArray(productRecord['variants']) ? productRecord['variants'] : [];
  const productVariantsByCode = new Map<string, Record<string, unknown>>();
  productVariants.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const record = entry as Record<string, unknown>;
    const codeCandidate = normalizeOptionalString(record.code);
    if (codeCandidate) {
      productVariantsByCode.set(codeCandidate, record);
    }
    const altCodeCandidate = normalizeOptionalString(record['variant_code'] ?? record['variantCode']);
    if (altCodeCandidate && !productVariantsByCode.has(altCodeCandidate)) {
      productVariantsByCode.set(altCodeCandidate, record);
    }
  });
  const snapshotProductRecord = (snapshotRecord.product ?? {}) as Record<string, unknown>;
  const productSizeUnit =
    normalizeOptionalString(productBasePayload.product_size_unit as string | undefined) ??
    normalizeOptionalString(productBasePayload.unit as string | undefined) ??
    normalizeOptionalString(snapshotRecord.unit as string | undefined) ??
    normalizeOptionalString(variantData.unit as string | undefined) ??
    null;

  const textualBrandSources: unknown[] = [
    inspirationParameterValues,
    snapshotRecord.nazev_originalu,
    baseOriginalName,
    defaultTitle,
    snapshotRecord.popis,
    snapshotRecord.description,
    variantData.description,
    productBasePayload.description,
  ];
  const brandFromText = resolveBrandFromTextSources(textualBrandSources);

  const brandFromParameters =
    brandParameterValues.length > 0 ? resolveBrandCandidate(brandParameterValues) : null;

  const otherStructuredBrandSources: unknown[] = [
    variant.brand,
    productRecord['brand'],
    productRecord['brand_name'],
    productRecord['brandName'],
    productRecord['znacka'],
    productRecord['vyrobce'],
    productRecord['manufacturer'],
    productRecord['producer'],
    productRecord['original_brand'],
    productRecord['originalBrand'],
    productBasePayload.brand,
    productBasePayload.brand_name,
    productBasePayload.brandName,
    productBasePayload.znacka,
    productBasePayload.vyrobce,
    productBasePayload.manufacturer,
    productBasePayload.producer,
    productBasePayload.original_brand,
    productBasePayload.originalBrand,
    variantData.brand,
    variantData.brand_name,
    variantData.brandName,
    variantData.znacka,
    variantData.manufacturer,
    variantData.producer,
    variantData.original_brand,
    variantData.originalBrand,
    snapshotRecord.znacka,
    snapshotRecord.brand,
    snapshotRecord.brand_name,
    snapshotRecord.brandName,
    snapshotRecord.manufacturer,
    snapshotRecord.producer,
    snapshotRecord.vyrobce,
    snapshotRecord.original_brand,
    snapshotRecord.originalBrand,
    snapshotProductRecord['brand'],
    snapshotProductRecord['znacka'],
    snapshotProductRecord['manufacturer'],
  ];
  const brandFromStructuredFallback = resolveBrandCandidate(otherStructuredBrandSources);

  const fallbackTextualBrandSources: unknown[] = [
    snapshotRecord.nazev_produktu,
    snapshotRecord.name,
    variant.name,
    productBasePayload.displayName,
    productBasePayload.name,
  ];
  const brandFromFallbackText = resolveBrandFromTextSources(fallbackTextualBrandSources);

  let defaultBrand: string | null = structuredBrandText ?? null;

  if (!defaultBrand && brandFromParameters) {
    defaultBrand = brandFromParameters;
  } else if (!defaultBrand && brandFromText) {
    defaultBrand = brandFromText;
  } else if (!defaultBrand && brandFromStructuredFallback) {
    defaultBrand = brandFromStructuredFallback;
  } else if (!defaultBrand && brandFromFallbackText) {
    defaultBrand = brandFromFallbackText;
  } else if (!defaultBrand) {
    const variantBrand = resolveBrandFromTextSources(productVariants);
    if (variantBrand) {
      defaultBrand = variantBrand;
    }
  }
  const inspiredTitleFromParameters = (() => {
    for (const candidate of inspirationParameterValues) {
      const resolved = extractInspiredTitleFromValue(candidate, defaultBrand);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  })();
  const rawOriginalLabel =
    normalizeOptionalString(snapshotRecord.nazev_originalu as string | undefined) ??
    inspiredTitleFromParameters ??
    baseOriginalName;

  const strippedOriginalLabel = stripBrandFromTitle(rawOriginalLabel, defaultBrand);
  const defaultOriginalName = strippedOriginalLabel ?? rawOriginalLabel ?? baseOriginalName ?? defaultTitle;

  const originalLabelCandidate = rawOriginalLabel ?? defaultOriginalName ?? defaultTitle;
  const splitOriginal = splitOriginalLabel(originalLabelCandidate, structuredBrandText ?? defaultBrand);
  const resolvedOriginalBrand = structuredBrandText ?? defaultBrand ?? splitOriginal.brand ?? null;
  const resolvedOriginalTitle =
    splitOriginal.title ?? strippedOriginalLabel ?? inspiredTitleFromParameters ?? baseOriginalName ?? originalLabelCandidate ?? defaultTitle;

  if (typeof window !== 'undefined') {
    try {
      console.log('[microsite-brand-debug]', {
        variantId: variant.id,
        variantCode: variant.code,
        structuredBrandCandidate,
        structuredBrandText,
        resolvedStructuredBrand,
        brandParameterValues,
        brandFromText,
        brandFromStructuredFallback,
        brandFromFallbackText,
        rawOriginalLabel,
        strippedOriginalLabel,
        resolvedOriginalBrand,
        resolvedOriginalTitle,
      });
    } catch (error) {
      console.warn('[microsite-brand-debug] failed to log', error);
    }
  }

  const variantTagCandidates = Array.isArray(variant.tags)
    ? variant.tags
        .map((tag) => normalizeOptionalString(tag.name))
        .filter((tag): tag is string => !!tag)
    : [];

  const collectedTags: string[] = [];
  const seenTags = new Set<string>();
  const pushTag = (value: string | null | undefined) => {
    if (!value) {
      return;
    }
    const normalized = stripDiacritics(value).toLowerCase();
    if (normalized === '' || seenTags.has(normalized)) {
      return;
    }
    seenTags.add(normalized);
    collectedTags.push(value);
  };

  pushTag(dominantIngredientValues[0]);
  fragranceValues.slice(0, 2).forEach((value) => pushTag(value));

  if (collectedTags.length < 3) {
    variantTagCandidates.forEach((value) => {
      if (collectedTags.length >= 3) {
        return;
      }
      pushTag(value);
    });
  }

  type VariantOptionSnapshot = {
    label?: unknown;
    name?: unknown;
    currency?: unknown;
    price?: unknown;
    original_price?: unknown;
    variant_id?: unknown;
    id?: unknown;
    url?: unknown;
    image_url?: unknown;
    discount?: unknown;
    mini_image_url?: unknown;
    detail_url?: unknown;
    volume?: unknown;
    code?: unknown;
    variant_code?: unknown;
    inspired_by_brand?: unknown;
    inspired_by_title?: unknown;
    stock_level?: unknown;
  };

  const variantOptionsRaw: VariantOptionSnapshot[] =
    Array.isArray(snapshot?.variant_options) && snapshot.variant_options
      ? (snapshot.variant_options as VariantOptionSnapshot[])
      : [];

  const variantOptions: ProductWidgetItemVariantOption[] = [];

  variantOptionsRaw.forEach((option) => {
    const optionIndex = variantOptions.length;
    const record = option as Record<string, unknown>;
    const baseLabel = normalizeOptionalString(option.label ?? option.name);
    const cleanedBaseLabel = baseLabel ? baseLabel.replace(/^\s*[^:]+:\s*/i, '').trim() || null : null;

    const rawPrice = option.price;
    const rawOriginalPrice = option.original_price;
    const optionPriceNumber = extractNumericValue(rawPrice ?? record['variant_price']);
    const optionOriginalPriceNumber = extractNumericValue(rawOriginalPrice ?? record['variant_original_price']);

    const optionPriceValue = optionPriceNumber != null ? Math.round(optionPriceNumber) : null;
    const optionOriginalPriceValue = optionOriginalPriceNumber != null ? Math.round(optionOriginalPriceNumber) : null;

    const optionDiscountPercent =
      optionPriceValue != null && optionOriginalPriceValue != null && optionOriginalPriceValue > 0
        ? Math.round(Math.max(0, 100 - (optionPriceValue / optionOriginalPriceValue) * 100))
        : null;
    const optionDiscountValue =
      optionPriceValue != null && optionOriginalPriceValue != null
        ? Math.max(optionOriginalPriceValue - optionPriceValue, 0)
        : null;

    let priceCurrent: string | null = null;
    if (optionPriceValue != null) {
      priceCurrent = formatCurrency(optionPriceValue, currency);
    } else if (typeof rawPrice === 'string') {
      priceCurrent = normalizeOptionalString(rawPrice);
    }

    let priceOriginal: string | null = null;
    if (optionOriginalPriceValue != null) {
      priceOriginal = formatCurrency(optionOriginalPriceValue, currency);
    } else if (typeof rawOriginalPrice === 'string') {
      priceOriginal = normalizeOptionalString(rawOriginalPrice);
    }

    const variantId = normalizeOptionalString(
      option.variant_id ?? option.id ?? record['variant-id'] ?? record['variantId']
    );
    const variantCode = normalizeOptionalString(
      record.code ?? option.variant_code ?? record['variant_code'] ?? record['variant-code'] ?? record['variantCode']
    );
    const optionUrl = normalizeOptionalString(option.url ?? record['variant_url'] ?? record['variant-url']);
    const productVariantRecord = variantCode ? productVariantsByCode.get(variantCode) : null;
    const productVariantUrl = normalizeOptionalString(
      (productVariantRecord as Record<string, unknown> | undefined)?.url ??
        (productVariantRecord as Record<string, unknown> | undefined)?.detail_url ??
        (productVariantRecord as Record<string, unknown> | undefined)?.detailUrl
    );
    const detailUrl = normalizeOptionalString(
      option.detail_url ?? record['detail_url'] ?? record['detail-url'] ?? optionUrl ?? productVariantUrl
    );
    const rawVolumeText = normalizeOptionalString(
      option.volume ?? record['variant_size'] ?? record['variant-size'] ?? record.size
    );
    const volumeValueNumber = extractNumericValue(rawVolumeText ?? option.volume ?? record['variant_size']);

    const resolvedLabelRaw = rawVolumeText ?? cleanedBaseLabel ?? baseLabel ?? `Varianta ${optionIndex + 1}`;
    const resolvedLabel = stripSizePrefix(resolvedLabelRaw) ?? resolvedLabelRaw;
    const displaySize = buildVolumeDisplay(volumeValueNumber, productSizeUnit, rawVolumeText ?? cleanedBaseLabel ?? baseLabel);
    const attributeSizeValue =
      displaySize ??
      rawVolumeText ??
      buildVolumeDisplay(volumeValueNumber, productSizeUnit, null) ??
      resolvedLabel;

    const payload: ProductWidgetItemVariantOption = {
      label: resolvedLabel,
    };

    const optionBrand =
      resolveBrandCandidate([
        option.inspired_by_brand,
        record.inspired_by_brand,
        record.brand,
        record.brand_name,
        record.brandName,
        record.znacka,
        record['znacka-2'],
        productVariantRecord?.brand,
        productVariantRecord?.brand_name,
        productVariantRecord?.brandName,
        productVariantRecord?.znacka,
        productVariantRecord?.['znacka-2'],
      ]) ?? defaultBrand;
    const optionOriginalNameValue =
      normalizeOptionalString(
        (option.inspired_by_title as string | undefined) ??
          (record.inspired_by_title as string | undefined) ??
          (record.original_name as string | undefined) ??
          (record.originalName as string | undefined) ??
          (record.nazev_originalu as string | undefined) ??
          (record['nazev-originalu'] as string | undefined) ??
          (record.nazevOriginalu as string | undefined)
      ) ?? defaultOriginalName;
    const optionOriginalSplit = splitOriginalLabel(
      optionOriginalNameValue,
      structuredBrandText ?? optionBrand ?? resolvedOriginalBrand ?? defaultBrand
    );
    const resolvedOptionBrand = structuredBrandText ?? optionBrand ?? resolvedOriginalBrand ?? defaultBrand;
    const resolvedOptionTitle =
      optionOriginalSplit.title ?? optionOriginalNameValue ?? resolvedOriginalTitle ?? defaultOriginalName;

    if (typeof window !== 'undefined') {
      try {
        console.log('[microsite-variant-debug]', {
          productVariantId: variant.id,
          optionIndex,
          optionOriginalNameValue,
          structuredBrandText,
          optionBrand,
          resolvedOptionBrand,
          resolvedOptionTitle,
        });
      } catch (error) {
        console.warn('[microsite-variant-debug] failed to log', error);
      }
    }

    if (variantId) {
      payload.variant_id = variantId;
    }

    if (variantCode) {
      payload.code = variantCode;
    }

    const resolvedVariantUrl = optionUrl ?? productVariantUrl ?? detailUrl ?? null;

    if (resolvedVariantUrl) {
      payload.url = resolvedVariantUrl;
    }

    if (detailUrl) {
      payload.detail_url = detailUrl;
      if (!payload.url) {
        payload.url = detailUrl;
      }
    }

    if (priceCurrent) {
      payload.price = priceCurrent;
    }

    if (priceOriginal) {
      payload.original_price = priceOriginal;
    }

    const optionImageSources = [
      option.image_url,
      record['variant_image'],
      record['variant-image'],
      record.image,
      record.images,
      record.media,
      record.gallery,
      productVariantRecord?.image,
      productVariantRecord?.images,
      (productVariantRecord as Record<string, unknown> | undefined)?.media,
      (productVariantRecord as Record<string, unknown> | undefined)?.gallery,
    ];
    const optionImages = gatherImageUrls(optionImageSources);
    if (optionImages.length > 0) {
      payload.image_url = optionImages[0];
      payload.variant_image = optionImages[0];
    }

    const optionMiniSources = [
      option.mini_image_url,
      record['mini_image_url'],
      record['mini-image-url'],
      record['variant_mini_image'],
      record['variant-mini-image'],
      record['miniImage'],
      record['mini-image'],
      productVariantRecord?.mini_image_url,
      (productVariantRecord as Record<string, unknown> | undefined)?.miniImage,
    ];
    const optionMiniImages = gatherImageUrls(optionMiniSources);
    if (optionMiniImages.length > 0) {
      payload.mini_image_url = optionMiniImages[0];
      payload.variant_mini_image = optionMiniImages[0];
    }

    const discount = normalizeOptionalString(option.discount);
    if (discount) {
      payload.discount = discount;
    }

    if (resolvedOptionBrand) {
      payload.inspired_by_brand = resolvedOptionBrand;
    }

    if (resolvedOptionTitle) {
      payload.inspired_by_title = resolvedOptionTitle;
    }

    if (displaySize) {
      payload.volume = displaySize;
      payload.volume_display = displaySize;
      payload.variant_size = displaySize;
    } else if (resolvedLabel) {
      payload.volume = resolvedLabel;
      payload.volume_display = resolvedLabel;
      payload.variant_size = resolvedLabel;
    }

    if (volumeValueNumber != null) {
      payload.volume_value = volumeValueNumber;
    }

    if (attributeSizeValue != null) {
      payload.volume_attribute = attributeSizeValue ?? null;
    } else if (resolvedLabel) {
      payload.volume_attribute = resolvedLabel;
    }

    if (optionPriceValue != null) {
      payload.price_value = optionPriceValue;
    }

    if (optionOriginalPriceValue != null) {
      payload.original_price_value = optionOriginalPriceValue;
    }

    if (priceCurrent) {
      payload.variant_price_display = priceCurrent;
      payload.variant_price = priceCurrent;
    }

    if (priceOriginal) {
      payload.variant_original_price_display = priceOriginal;
      payload.variant_original_price = priceOriginal;
    }

    if (detailUrl) {
      payload.variant_detail_url = detailUrl;
    }

    if (optionUrl) {
      payload.variant_url = optionUrl;
    }

    const discountPercentage = optionDiscountPercent ?? null;
    if (discountPercentage != null) {
      payload.variant_discount_percentage = discountPercentage;
    }

    const discountValueNumber =
      optionDiscountValue ??
      (optionOriginalPriceValue != null && optionPriceValue != null
        ? Math.max(optionOriginalPriceValue - optionPriceValue, 0)
        : null);
    if (discountValueNumber != null && discountValueNumber > 0) {
      payload.variant_discount_value = formatCurrency(discountValueNumber, currency);
    }

    const resolveStockLevel = (value: unknown): number | null => {
      if (typeof value === 'number' && !Number.isNaN(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number.parseFloat(value.replace(',', '.'));
        return Number.isNaN(parsed) ? null : parsed;
      }
      return null;
    };

    const rawStockLevel =
      resolveStockLevel(option.stock_level) ??
      resolveStockLevel(record['stock_level']) ??
      resolveStockLevel(productVariantRecord?.stock_level);
    if (rawStockLevel != null) {
      payload.variant_stock_level = rawStockLevel;
    }

    variantOptions.push(payload);
  });

  const defaultOption =
    variantOptions.find(
      (option) => option.variant_id === variant.id || (!!option.code && option.code === variant.code)
    ) ?? null;

  const fallbackOption = defaultOption ?? (variantOptions.length > 0 ? variantOptions[0] : null);
  const fallbackBrand = normalizeOptionalString(
    (fallbackOption?.inspired_by_brand as string | undefined) ?? defaultBrand ?? null
  );
  const fallbackInspiredTitle = normalizeOptionalString(
    (fallbackOption?.inspired_by_title as string | undefined) ??
      inspiredTitleFromParameters ??
      defaultOriginalName ??
      fallbackBrand ??
      null
  );

  const defaultPriceCurrent = fallbackOption?.price ?? (priceValue != null ? formatCurrency(priceValue, currency) : '');
  const defaultOriginalPrice = fallbackOption?.original_price ?? defaultPriceCurrent;
  const defaultVolume = fallbackOption?.volume ?? '';
  const defaultDiscount = fallbackOption?.discount ?? '';
  const fallbackDetailCandidate = normalizeOptionalString(
    (snapshot?.detail_url as string | undefined) ??
      (snapshot?.url as string | undefined) ??
      (variantData.detail_url as string | undefined) ??
      (variantData.detailUrl as string | undefined) ??
      (productBasePayload.detail_url as string | undefined) ??
      (productBasePayload.detailUrl as string | undefined) ??
      (productBasePayload.url as string | undefined)
  );

  const defaultDetailUrl =
    normalizeOptionalString(fallbackOption?.detail_url ?? fallbackOption?.url ?? fallbackDetailCandidate) ?? '#';
  const defaultImageUrl = ensureAbsoluteImageUrl(fallbackOption?.image_url) ?? firstImage ?? '';
  const defaultMiniImageUrl = ensureAbsoluteImageUrl(fallbackOption?.mini_image_url) ?? secondImage ?? '';
  const defaultVariantId = fallbackOption?.variant_id ?? variant.id ?? null;
  const defaultVariantCode = fallbackOption?.code ?? variant.code ?? null;

  return {
    title: defaultTitle,
    subtitle: subtitleValue,
    url: defaultDetailUrl,
    detail_url: defaultDetailUrl,
    image_url: defaultImageUrl,
    mini_image_url: defaultMiniImageUrl,
    gender_icon_url: genderTheme.icon,
    gender: detectedGender !== 'unknown' ? detectedGender : null,
    title_color: genderTheme.color,
    appendix_background_url: genderTheme.background,
    original_name: resolvedOriginalTitle ?? fallbackInspiredTitle ?? defaultOriginalName,
    inspired_by_brand: resolvedOriginalBrand ?? fallbackBrand,
    inspired_by_title:
      resolvedOriginalTitle ?? fallbackInspiredTitle ?? defaultOriginalName ?? resolvedOriginalBrand ?? fallbackBrand ?? null,
    tags: collectedTags,
    flags: [],
    price: {
      current: defaultPriceCurrent,
      original: defaultOriginalPrice,
      volume: defaultVolume,
      discount: defaultDiscount,
    },
    buy_button: {
      label: 'Do košíku',
      variant_id: defaultVariantId,
      variant_code: defaultVariantCode,
    },
    detail_button: {
      label: 'Detail',
      url: defaultDetailUrl,
    },
    variant_options: variantOptions,
  };
};

type OriginalInfo = {
  productName: string | null;
  originalName: string | null;
  imageUrl: string | null;
};

const ORIGINAL_INFO_ENDPOINT = 'https://app.krasnevune.cz/original/originalApp.php';

export const fetchOriginalInfo = async (variantCode: string | null | undefined): Promise<OriginalInfo | null> => {
  if (!variantCode) {
    return null;
  }

  try {
    const response = await fetch(`${ORIGINAL_INFO_ENDPOINT}?productid=${encodeURIComponent(variantCode)}`, {
      method: 'GET',
      credentials: 'omit',
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json().catch(() => null);
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const entry = data[0];
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const record = entry as Record<string, unknown>;

    return {
      productName: normalizeOptionalString(record.nazev_produktu),
      originalName: normalizeOptionalString(record.nazev_originalu),
      imageUrl: ensureAbsoluteImageUrl(record.url_fotky),
    };
  } catch (error) {
    console.warn('[product-widget] Failed to fetch original info', error);
    return null;
  }
};

export const applyOriginalInfoToPayload = (
  payload: ProductWidgetItemPayload,
  info: OriginalInfo | null
): ProductWidgetItemPayload => {
  if (!info) {
    return payload;
  }

  const next: ProductWidgetItemPayload = {
    ...payload,
  };

  if (info.originalName) {
    next.original_name = info.originalName;
    next.inspired_by_title = info.originalName;
  }

  if (info.imageUrl) {
    next.mini_image_url = info.imageUrl;
  }

  return next;
};

type MicrositeOverlayBuildOptions = {
  defaultCtaUrl?: string | null;
  defaultCtaLabel?: string;
  widgetPayload?: ProductWidgetItemPayload | null;
};

export type MicrositeOverlayBuildResult = {
  overlay: MicrositeProductOverlay;
  tags: string[];
  metadata: Record<string, unknown>;
};

export const buildMicrositeOverlay = (
  variant: InventoryVariant,
  snapshot: Record<string, unknown> | undefined,
  options?: MicrositeOverlayBuildOptions
): MicrositeOverlayBuildResult => {
  const snapshotRecord = (snapshot ?? {}) as Record<string, unknown>;
  const variantData = (variant.data ?? {}) as Record<string, unknown>;
  const widgetPayload = options?.widgetPayload ?? buildDefaultPayload(variant, snapshotRecord);

  const gallerySources: unknown[] = [
    snapshotRecord.images,
    snapshotRecord.media,
    snapshotRecord.gallery,
    variantData.images,
    variantData.media,
    (variant.product?.base_payload as Record<string, unknown> | undefined)?.images,
    widgetPayload.image_url,
    widgetPayload.mini_image_url,
  ];
  const gallery = gatherImageUrls(gallerySources);
  const primaryImage =
    ensureAbsoluteImageUrl(widgetPayload.image_url) ??
    ensureAbsoluteImageUrl(widgetPayload.mini_image_url) ??
    (gallery.length ? gallery[0] : null);

  const rawTitle =
    normalizeOptionalString(widgetPayload.title) ??
    normalizeOptionalString(variant.name) ??
    normalizeOptionalString(snapshotRecord.name) ??
    variant.code ??
    'Produkt';
  const cleanedTitle = stripSizePrefix(rawTitle) ?? rawTitle;

  const priceValue =
    extractNumericValue(widgetPayload.price?.current ?? null) ??
    (typeof variant.price === 'number'
      ? variant.price
      : typeof snapshotRecord.price === 'number'
      ? Number(snapshotRecord.price)
      : null);
  const currency =
    extractCurrencyCode(widgetPayload.price?.current ?? null) ??
    normalizeOptionalString(variant.currency_code) ??
    normalizeOptionalString(snapshotRecord.currency) ??
    'CZK';

  const description =
    normalizeOptionalString(widgetPayload.price?.volume) ??
    normalizeOptionalString(widgetPayload.subtitle) ??
    normalizeOptionalString(snapshotRecord.description as string | undefined) ??
    normalizeOptionalString(variantData.description) ??
    null;

  const detailUrl =
    normalizeOptionalString(widgetPayload.detail_button?.url) ??
    normalizeOptionalString(widgetPayload.url) ??
    normalizeOptionalString(variantData.detail_url ?? variantData.detailUrl) ??
    normalizeOptionalString(snapshotRecord.detail_url ?? snapshotRecord.url) ??
    null;

  const tags = Array.isArray(widgetPayload.tags)
    ? widgetPayload.tags
        .map((tag) => normalizeOptionalString(tag))
        .filter((tag): tag is string => Boolean(tag))
    : [];

  const gender = (widgetPayload.gender as WidgetGender | null) ?? 'unknown';
  const genderTheme = GENDER_THEMES[gender] ?? GENDER_THEMES.unknown;

  const overlay: MicrositeProductOverlay = {
    title: cleanedTitle ?? undefined,
    subtitle: widgetPayload.subtitle ?? undefined,
    description: description ?? undefined,
    badge: tags[0] ?? undefined,
    detail_url: detailUrl ?? undefined,
    image_url: primaryImage ?? undefined,
    gallery: gallery.length ? gallery : undefined,
    price:
      priceValue != null
        ? {
            current_value: priceValue,
            currency: currency ?? 'CZK',
          }
        : undefined,
    cta:
      options?.defaultCtaUrl && options.defaultCtaUrl.trim() !== ''
        ? {
            label: options.defaultCtaLabel ?? 'Koupit',
            href: options.defaultCtaUrl,
          }
        : detailUrl
        ? {
            label: widgetPayload.detail_button?.label ?? 'Detail',
            href: detailUrl,
          }
        : undefined,
    tags: tags.length ? tags : undefined,
  };

  const metadata: Record<string, unknown> = {
    variant_options: widgetPayload.variant_options ?? [],
    gender,
    gender_theme: genderTheme,
    inspired_by_brand: widgetPayload.inspired_by_brand ?? null,
    inspired_by_title: widgetPayload.inspired_by_title ?? null,
    original_name: widgetPayload.original_name ?? null,
    volume: widgetPayload.price?.volume ?? null,
    widget_payload: widgetPayload,
  };

  return {
    overlay,
    tags,
    metadata,
  };
};
