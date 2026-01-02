import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  FileButton,
  Group,
  Loader,
  MultiSelect,
  Pagination,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconFilter,
  IconListSearch,
  IconSparkles,
  IconTag,
  IconTags,
  IconTrash,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import type { CSSProperties, FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '@mantine/hooks';
import { TableExportAction } from '../../../components/table/TableExportAction';
import type { InventoryVariant, InventoryVariantTag } from '../../../api/inventory';
import {
  useInventoryFilters,
  useInventoryOverview,
  useInventoryTags,
  useInventoryVariants,
  useInventoryPurchaseOrders,
  useCreateInventoryPurchaseOrder,
  useDeleteInventoryPurchaseOrder,
} from '../hooks/useInventoryOverview';
import {
  createInventoryTag,
  deleteInventoryTag,
  exportInventoryVariants,
  syncInventoryVariantTags,
  updateInventoryTag,
  bulkForecastInventoryVariants,
} from '../../../api/inventory';
import { VariantTagsCell } from '../components/VariantTagsCell';
import { VariantFlagsCell } from '../components/VariantFlagsCell';
import { TagManagerModal } from '../components/TagManagerModal';
import {
  BulkAssignTagsModal,
  type BulkAssignTagsPayload,
} from '../components/BulkAssignTagsModal';
import { useShops } from '../../shoptet/hooks/useShops';
import { useUserPreference } from '../../../hooks/useUserPreference';
import { PageShell } from '../../../components/layout/PageShell';
import { TableToolbar } from '../../../components/table/TableToolbar';
import { DataTableHeaderCell, type HeaderColumn } from '../../../components/table/DataTableHeaderCell';
import tableClasses from '../../../components/table/DataTable.module.css';
import classes from './InventoryPage.module.css';

const statusOptions: Array<{ value: InventoryVariant['stock_status'] | 'all'; label: string }> = [
  { value: 'all', label: 'Vše' },
  { value: 'in_stock', label: 'Skladem' },
  { value: 'low_stock', label: 'Nízká zásoba' },
  { value: 'sold_out', label: 'Vyprodáno' },
  { value: 'unknown', label: 'Neznámé' },
];

const statusMeta: Record<InventoryVariant['stock_status'], { label: string; color: string }> = {
  in_stock: { label: 'Skladem', color: 'teal' },
  low_stock: { label: 'Nízká zásoba', color: 'orange' },
  sold_out: { label: 'Vyprodáno', color: 'red' },
  unknown: { label: 'Neznámé', color: 'gray' },
};

const aiOrderRecommendationLabels: Record<
  NonNullable<InventoryVariant['ai_order_recommendation']>,
  string
> = {
  order_now: 'Objednat ihned',
  order_soon: 'Objednat brzy',
  monitor: 'Sledovat',
  do_not_order: 'Neobjednávat',
};

const aiOrderRecommendationColors: Record<
  NonNullable<InventoryVariant['ai_order_recommendation']>,
  string
> = {
  order_now: 'red',
  order_soon: 'orange',
  monitor: 'yellow',
  do_not_order: 'gray',
};

const aiRecommendationFilterOptions: Array<{ value: AiOrderRecommendation; label: string }> =
  Object.entries(aiOrderRecommendationLabels).map(([value, label]) => ({
    value: value as AiOrderRecommendation,
    label,
  }));

const aiProductHealthLabels: Record<'strong' | 'stable' | 'weak', string> = {
  strong: 'Silná poptávka',
  stable: 'Stabilní',
  weak: 'Slabá',
};

const aiProductHealthColors: Record<'strong' | 'stable' | 'weak', string> = {
  strong: 'teal',
  stable: 'blue',
  weak: 'red',
};

const variantNameFilterValues = [
  'Velikost: 500 ml',
  'Velikost: 400 ml',
  'Velikost: 75 ml',
  'Velikost: 33 ml',
  'Velikost: 40 ml',
  'Velikost: 30 ml tester',
  'Velikost: 2,5 ml',
  'Velikost: 1,75 ml',
  'Velikost: 10 ml',
  'Velikost: 150+5 ml',
  'Velikost: 15 ml',
  'Velikost: 150 ml',
  'Velikost: 200 ml',
  'Velikost: 50 ml',
  'Velikost: 100 ml',
  'Velikost: 100 ml tester',
  'Velikost: 1000 ml',
  'Velikost: 25 ml',
  'Velikost: 30 ml',
] as const;

const variantNameFilterOptions = variantNameFilterValues.map((value) => ({
  value,
  label: value,
}));

const resolveProductName = (variant: InventoryVariant) => {
  const payload = variant.product?.base_payload as { name?: string } | undefined;
  if (payload?.name) {
    return payload.name as string;
  }

  return variant.product?.external_guid ?? '—';
};

const resolveVariantName = (variant: InventoryVariant) => {
  if (variant.name) {
    return variant.name;
  }

  const data = (variant.data ?? {}) as Record<string, unknown>;
  const attributeCombination = data.attributeCombination as Record<string, unknown> | undefined;

  const fallback =
    (data.name as string | undefined) ??
    (data.label as string | undefined) ??
    (attributeCombination?.label as string | undefined) ??
    (attributeCombination?.name as string | undefined);

  return fallback ?? '—';
};

const resolveBrand = (variant: InventoryVariant) => {
  if (variant.brand) {
    return variant.brand;
  }

  const data = (variant.data ?? {}) as Record<string, unknown>;
  const dataBrand = data.brand as Record<string, unknown> | undefined;
  const baseBrand = variant.product?.base_payload?.brand as Record<string, unknown> | undefined;

  return (
    (dataBrand?.name as string | undefined) ??
    (data.brand as string | undefined) ??
    (baseBrand?.name as string | undefined) ??
    (variant.product?.base_payload?.brand as string | undefined) ??
    null
  );
};

const resolveSupplier = (variant: InventoryVariant) => {
  if (variant.supplier) {
    return variant.supplier;
  }

  const data = (variant.data ?? {}) as Record<string, unknown>;
  const dataSupplier = data.supplier as Record<string, unknown> | undefined;
  const baseSupplier = variant.product?.base_payload?.supplier as Record<string, unknown> | undefined;

  return (
    (dataSupplier?.name as string | undefined) ??
    (data.supplier as string | undefined) ??
    (baseSupplier?.name as string | undefined) ??
    (variant.product?.base_payload?.supplier as string | undefined) ??
    null
  );
};

const resolveDefaultCategory = (variant: InventoryVariant) => {
  if (variant.default_category_name) {
    return variant.default_category_name;
  }

  const payload = variant.product?.base_payload as Record<string, unknown> | undefined;
  const defaultCategory = payload?.defaultCategory;

  if (typeof defaultCategory === 'string') {
    const trimmed = defaultCategory.trim();
    return trimmed !== '' ? trimmed : null;
  }

  if (defaultCategory && typeof defaultCategory === 'object') {
    const name = (defaultCategory as Record<string, unknown>).name as string | undefined;
    if (name && name.trim() !== '') {
      return name.trim();
    }
  }

  return null;
};

const resolveSeasonalityLabels = (variant: InventoryVariant): string[] => {
  if (Array.isArray(variant.seasonality_labels) && variant.seasonality_labels.length > 0) {
    return variant.seasonality_labels;
  }

  const payload = variant.product?.base_payload as Record<string, unknown> | undefined;

  if (!payload) {
    return [];
  }

  const parameters = payload.filteringParameters as Array<Record<string, unknown>> | undefined;

  if (!Array.isArray(parameters)) {
    return [];
  }

  const seasonality = parameters.find(
    (parameter) =>
      typeof parameter === 'object' &&
      parameter !== null &&
      typeof parameter.code === 'string' &&
      parameter.code.trim().toLowerCase() === 'rocni-obdobi'
  );

  if (!seasonality) {
    return [];
  }

  const values = seasonality.values as Array<Record<string, unknown>> | undefined;

  if (!Array.isArray(values)) {
    return [];
  }

  const labels = values
    .map((value) => (typeof value.name === 'string' ? value.name.trim() : ''))
    .filter((name) => name !== '');

  return Array.from(new Set(labels));
};

type AiOrderRecommendation = NonNullable<InventoryVariant['ai_order_recommendation']>;

const columnLabels: Record<string, string> = {
  variant: 'Varianta',
  product: 'Produkt',
  default_category_name: 'Výchozí kategorie',
  seasonality_labels: 'Roční období',
  brand: 'Značka',
  supplier: 'Dodavatel',
  product_flags: 'Shoptet štítky',
  tags: 'Štítky',
  sku: 'SKU',
  ean: 'EAN',
  stock: 'Zásoba',
  ordered: 'Objednáno',
  min_stock_supply: 'Min. zásoba',
  price: 'Cena',
  purchase_price: 'Nákupní cena',
  lifetime_revenue: 'Lifetime obrat',
  last_30_quantity: 'Prodeje (30 dní)',
  average_daily_sales: 'Denní poptávka',
  stock_runway_days: 'Výdrž zásoby',
  ai_insight: 'AI doporučení',
};

const MIN_COLUMN_WIDTH = 120;

const DEFAULT_COLUMN_WIDTHS = {
  code: 160,
  variant: 220,
  product: 220,
  default_category_name: 220,
  seasonality_labels: 200,
  brand: 160,
  supplier: 180,
  product_flags: 220,
  tags: 200,
  sku: 140,
  ean: 140,
  status: 160,
  ai_insight: 280,
  stock: 160,
  ordered: 170,
  min_stock_supply: 160,
  price: 160,
  purchase_price: 160,
  lifetime_revenue: 200,
  last_30_quantity: 180,
  average_daily_sales: 180,
  stock_runway_days: 180,
} as const;

type ResizableColumnKey = keyof typeof DEFAULT_COLUMN_WIDTHS;
const INVENTORY_ROW_HEIGHT = 84;

const COLUMN_WIDTH_KEYS = Object.keys(DEFAULT_COLUMN_WIDTHS) as ResizableColumnKey[];

const clampColumnWidth = (value: number) => Math.max(MIN_COLUMN_WIDTH, Math.round(value));

const createColumnWidthState = (input?: Record<string, unknown>): Record<string, number> => {
  const result: Record<string, number> = { ...DEFAULT_COLUMN_WIDTHS };

  if (!input) {
    return result;
  }

  Object.entries(input).forEach(([key, value]) => {
    if (!COLUMN_WIDTH_KEYS.includes(key as ResizableColumnKey)) {
      return;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      result[key as ResizableColumnKey] = clampColumnWidth(value);
      return;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        result[key as ResizableColumnKey] = clampColumnWidth(parsed);
      }
    }
  });

  return result;
};

const columnWidthsEqual = (left: Record<string, number>, right: Record<string, number>): boolean =>
  COLUMN_WIDTH_KEYS.every((key) => left[key] === right[key]);

const DEFAULT_COLUMN_VISIBILITY: Record<string, boolean> = {
  variant: true,
  product: true,
  default_category_name: true,
  seasonality_labels: true,
  brand: true,
  supplier: true,
  product_flags: true,
  tags: true,
  sku: true,
  ean: true,
  stock: true,
  ordered: true,
  min_stock_supply: true,
  price: true,
  purchase_price: true,
  lifetime_revenue: false,
  last_30_quantity: true,
  average_daily_sales: false,
  stock_runway_days: false,
  ai_insight: true,
};

const COLUMN_KEYS = Object.keys(DEFAULT_COLUMN_VISIBILITY);

const ensureStockColumn = (visibility: Record<string, boolean>) => {
  const next = { ...visibility };
  if (!next.stock) {
    next.stock = true;
  }
  return next;
};

const visibilityFromList = (columns: string[], hasExplicitVersion = false): Record<string, boolean> => {
  if (columns.length === 0) {
    return { ...DEFAULT_COLUMN_VISIBILITY };
  }

  const visibility: Record<string, boolean> = { ...DEFAULT_COLUMN_VISIBILITY };
  COLUMN_KEYS.forEach((key) => {
    if (columns.includes(key)) {
      visibility[key] = true;
    } else if (hasExplicitVersion || (key !== 'variant' && key !== 'product')) {
      visibility[key] = false;
    }
  });

  return ensureStockColumn(visibility);
};

const visibilityToList = (visibility: Record<string, boolean>): string[] =>
  COLUMN_KEYS.filter((key) => visibility[key]);

const visibilityEqual = (left: Record<string, boolean>, right: Record<string, boolean>): boolean =>
  COLUMN_KEYS.every((key) => left[key] === right[key]);

const normalizeText = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const uniqueStringArray = (input: unknown): string[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const sanitized = input
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value !== '');

  return Array.from(new Set(sanitized));
};

const isAiRecommendation = (value: string): value is AiOrderRecommendation =>
  value in aiOrderRecommendationLabels;

const sanitizeAiRecommendations = (input: string[]): AiOrderRecommendation[] => {
  return Array.from(new Set(input.filter(isAiRecommendation)));
};

const PAGE_SIZE_OPTIONS = [
  { value: '10', label: '10 / str.' },
  { value: '25', label: '25 / str.' },
  { value: '50', label: '50 / str.' },
  { value: '100', label: '100 / str.' },
];

const resolveVariantCurrency = (variant: InventoryVariant) =>
  variant.metrics_currency_code ?? variant.currency_code ?? null;

const formatNumber = (value: number | null | undefined, maximumFractionDigits = 0) => {
  if (value === null || value === undefined) {
    return '—';
  }

  return value.toLocaleString('cs-CZ', { maximumFractionDigits });
};

const formatPrice = (value: number | null | undefined, currency?: string | null) => {
  if (value === null || value === undefined) {
    return '—';
  }

  const formatted = value.toLocaleString('cs-CZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return currency ? `${formatted} ${currency}` : formatted;
};

const formatDateLabel = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('cs-CZ');
};

const formatDateTimeLabel = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('cs-CZ');
};

const formatAiDeadlineLabel = (days: number | string | null | undefined): string => {
  if (days === null || days === undefined) {
    return '—';
  }

  const numeric = typeof days === 'string' ? Number(days) : days;

  if (!Number.isFinite(numeric)) {
    return '—';
  }

  if (numeric <= 0) {
    return 'Okamžitě';
  }

  if (numeric < 1) {
    return `Do ${Math.max(numeric * 24, 1).toFixed(0)} hodin`;
  }

  if (numeric < 7) {
    return `Do ${numeric.toFixed(1)} dne`;
  }

  return `Do ${numeric.toFixed(1)} dnů`;
};

const formatFileSize = (bytes: number | null | undefined): string => {
  if (!Number.isFinite(bytes ?? NaN) || !bytes || bytes <= 0) {
    return '';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const precision = unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
};

const resolveErrorMessage = (error: unknown, fallback: string): string => {
  if (error && typeof error === 'object') {
    const responseData = (error as { response?: { data?: unknown } }).response?.data;

    if (responseData && typeof responseData === 'object') {
      const message = (responseData as { message?: string }).message;
      if (typeof message === 'string' && message.trim() !== '') {
        return message.trim();
      }

      const errors = (responseData as { errors?: Record<string, unknown> }).errors;
      if (errors && typeof errors === 'object') {
        const firstEntry = Object.values(errors)[0];
        if (Array.isArray(firstEntry) && typeof firstEntry[0] === 'string') {
          const firstMessage = firstEntry[0].trim();
          if (firstMessage !== '') {
            return firstMessage;
          }
        }

        if (typeof firstEntry === 'string' && firstEntry.trim() !== '') {
          return firstEntry.trim();
        }
      }
    }

    const generic = (error as { message?: string }).message;
    if (typeof generic === 'string' && generic.trim() !== '') {
      return generic.trim();
    }
  }

  return fallback;
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : null;
};

type SortableColumn =
  | 'code'
  | 'variant'
  | 'brand'
  | 'supplier'
  | 'stock'
  | 'ordered'
  | 'min_stock_supply'
  | 'price'
  | 'purchase_price'
  | 'lifetime_revenue'
  | 'last_30_quantity'
  | 'average_daily_sales'
  | 'stock_runway_days';

type InventoryListPreference = {
  page?: number;
  page_size?: number;
  stock_status?: 'all' | InventoryVariant['stock_status'];
  search?: string;
  code?: string;
  sku?: string;
  ean?: string;
  product?: string;
  variant?: string;
  variant_name?: string[];
  product_name?: string;
  brand?: string[];
  supplier?: string[];
  flag?: string[];
  shop_id?: string[];
  tag_id?: string[];
  default_category?: string[];
  seasonality?: string[];
  ai_order_recommendation?: AiOrderRecommendation[];
  sort_by?: SortableColumn;
  sort_dir?: 'asc' | 'desc';
  columns?: Record<string, boolean>;
  selection?: string[];
  column_widths?: Record<string, number>;
};

export const InventoryPage = () => {
  const { data: overview } = useInventoryOverview();
  const { data: filtersData } = useInventoryFilters();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const parseArrayParam = useCallback(
    (key: string): string[] => {
      const repeated = searchParams.getAll(key);
      if (repeated.length > 0) {
        return repeated
          .map((value) => value.trim())
          .filter((value) => value !== '');
      }

      const single = searchParams.get(key);
      if (!single) {
        return [];
      }

      return single
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value !== '');
    },
    [searchParams]
  );

  const commitSearchParams = useCallback(
    (mutator: (params: URLSearchParams) => void, replace = true) => {
      const next = new URLSearchParams(searchParams);
      mutator(next);
      setSearchParams(next, { replace });
    },
    [searchParams, setSearchParams]
  );

  const {
    value: storedPreference,
    isLoading: preferenceLoading,
    save: saveInventoryPreference,
  } = useUserPreference<InventoryListPreference>('inventory.variants.list');

  const [preferenceHydrated, setPreferenceHydrated] = useState(false);
  const preferenceHydrationRef = useRef(false);
  const preferenceSaveTimeoutRef = useRef<number | null>(null);
  const lastSavedPreferenceRef = useRef<string | null>(null);

  useEffect(() => {
    if (!searchParams.has('selection')) {
      return;
    }

    commitSearchParams((params) => {
      params.delete('selection');
    });
  }, [commitSearchParams, searchParams]);

  const arraysEqual = useCallback((left: string[], right: string[]) => {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => value === right[index]);
  }, []);

  const normalizeStatusParam = useCallback(
    (value: string | null): 'all' | InventoryVariant['stock_status'] => {
      const allowed: Array<'in_stock' | 'low_stock' | 'sold_out' | 'unknown'> = [
        'in_stock',
        'low_stock',
        'sold_out',
        'unknown',
      ];

      if (!value) {
        return 'all';
      }

      return allowed.includes(value as typeof allowed[number])
        ? (value as InventoryVariant['stock_status'])
        : 'all';
    },
    []
  );

  const normalizeSortColumn = useCallback(
    (value: string | null): SortableColumn => {
      const allowed: SortableColumn[] = [
        'code',
        'variant',
        'brand',
        'supplier',
        'stock',
        'ordered',
        'min_stock_supply',
        'price',
        'purchase_price',
        'lifetime_revenue',
        'last_30_quantity',
        'average_daily_sales',
        'stock_runway_days',
      ];

      if (!value) {
        return 'code';
      }

      return allowed.includes(value as SortableColumn) ? (value as SortableColumn) : 'code';
    },
    []
  );

  const normalizeSortDirection = useCallback((value: string | null): 'asc' | 'desc' => {
    return value === 'desc' ? 'desc' : 'asc';
  }, []);

  const parsePageParam = useCallback((value: string | null): number => {
    const parsed = value ? Number(value) : 1;

    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
  }, []);

  const normalizePageSize = useCallback((value: string | number | null): number => {
    const allowed = [10, 25, 50, 100];
    const parsed = typeof value === 'number' ? value : value ? Number(value) : 25;

    return allowed.includes(parsed) ? parsed : 25;
  }, []);

  const [page, setPage] = useState(() => parsePageParam(searchParams.get('page')));
  const [pageSize, setPageSize] = useState(() => normalizePageSize(searchParams.get('page_size')));
  const [status, setStatus] = useState<'all' | InventoryVariant['stock_status']>(() =>
    normalizeStatusParam(searchParams.get('stock_status'))
  );
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [code, setCode] = useState(() => searchParams.get('code') ?? '');
  const [sku, setSku] = useState(() => searchParams.get('sku') ?? '');
  const [ean, setEan] = useState(() => searchParams.get('ean') ?? '');
  const [productIdentifier, setProductIdentifier] = useState(
    () => searchParams.get('product') ?? ''
  );
  const [variantName, setVariantName] = useState(() => searchParams.get('variant') ?? '');
  const [variantNameFilter, setVariantNameFilter] = useState<string[]>(() =>
    parseArrayParam('variant_name')
  );
  const [productName, setProductName] = useState(
    () => searchParams.get('product_name') ?? ''
  );
  const [brand, setBrand] = useState<string[]>(() => parseArrayParam('brand'));
  const [supplier, setSupplier] = useState<string[]>(() => parseArrayParam('supplier'));
  const [flagFilter, setFlagFilter] = useState<string[]>(() => parseArrayParam('flag'));
  const [shopFilter, setShopFilter] = useState<string[]>(() => parseArrayParam('shop_id'));
  const [tagFilter, setTagFilter] = useState<string[]>(() => parseArrayParam('tag_id'));
  const [categoryFilter, setCategoryFilter] = useState<string[]>(() =>
    parseArrayParam('default_category')
  );
  const [seasonalityFilter, setSeasonalityFilter] = useState<string[]>(() =>
    parseArrayParam('seasonality')
  );
  const [aiOrderRecommendations, setAiOrderRecommendations] = useState<AiOrderRecommendation[]>(() =>
    sanitizeAiRecommendations(parseArrayParam('ai_order_recommendation'))
  );
  const [orderFile, setOrderFile] = useState<File | null>(null);
  const [orderFileLabel, setOrderFileLabel] = useState('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [arrivalDaysInput, setArrivalDaysInput] = useState('14');
  const [expectedArrivalDate, setExpectedArrivalDate] = useState('');
  const [deletingOrderId, setDeletingOrderId] = useState<number | null>(null);
  const [columnFilters, setColumnFilters] = useState({
    orderedMin: '',
    orderedMax: '',
    priceMin: '',
    priceMax: '',
    purchasePriceMin: '',
    purchasePriceMax: '',
    lifetimeMin: '',
    lifetimeMax: '',
    sales30Min: '',
    sales30Max: '',
    demandMin: '',
    demandMax: '',
    runwayMin: '',
    runwayMax: '',
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedVariantsMap, setSelectedVariantsMap] = useState<Record<string, InventoryVariant>>(
    () => ({})
  );
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() =>
    visibilityFromList(
      parseArrayParam('columns'),
      searchParams.get('columns_version') === '3'
    )
  );
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    createColumnWidthState()
  );
  const [tagManagerOpened, setTagManagerOpened] = useState(false);
  const [bulkAssignOpened, setBulkAssignOpened] = useState(false);
  const [bulkAssignLoading, setBulkAssignLoading] = useState(false);
  const queryClient = useQueryClient();
  const lastSelectedIndexRef = useRef<number | null>(null);
  const { data: tagsData } = useInventoryTags();
  const sortedTags = useMemo(
    () =>
      [...(tagsData ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, 'cs', { sensitivity: 'base' })
      ),
    [tagsData]
  );
  const ordersQuery = useInventoryPurchaseOrders();
  const createOrderMutation = useCreateInventoryPurchaseOrder();
  const deleteOrderMutation = useDeleteInventoryPurchaseOrder();
  const tagFilterOptions = useMemo(
    () =>
      sortedTags.map((tag) => ({
        value: String(tag.id),
        label: tag.is_hidden ? `${tag.name} (schováno)` : tag.name,
      })),
    [sortedTags]
  );
  const orders = ordersQuery.data ?? [];
  const ordersLoading = ordersQuery.isLoading;
  const [sort, setSort] = useState<{ column: SortableColumn; direction: 'asc' | 'desc' }>(() => ({
    column: normalizeSortColumn(searchParams.get('sort_by')),
    direction: normalizeSortDirection(searchParams.get('sort_dir')),
  }));

  const syncVariantTagsMutation = useMutation({
    mutationFn: ({ variantId, tagIds }: { variantId: string; tagIds: number[] }) =>
      syncInventoryVariantTags(variantId, tagIds),
    onSuccess: (_tags, variables) => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'variants'] });
      if (variables.variantId) {
        queryClient.invalidateQueries({ queryKey: ['inventory', 'variant', variables.variantId] });
      }
      notifications.show({ message: 'Štítky byly uloženy', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Uložení štítků selhalo', color: 'red' });
    },
  });

  const createTagMutation = useMutation({
    mutationFn: (payload: { name: string; color?: string | null; is_hidden: boolean }) =>
      createInventoryTag(payload),
    onSuccess: (tag) => {
      queryClient.setQueryData<InventoryVariantTag[] | undefined>(
        ['inventory', 'tags'],
        (current) => {
          if (!current) {
            return [tag];
          }

          const exists = current.some((entry) => entry.id === tag.id);
          return exists ? current : [...current, tag];
        }
      );
      queryClient.invalidateQueries({ queryKey: ['inventory', 'variants'] });
      notifications.show({ message: 'Štítek byl vytvořen', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Vytvoření štítku selhalo', color: 'red' });
    },
  });

  const updateTagMutation = useMutation({
    mutationFn: ({
      tagId,
      payload,
    }: {
      tagId: number;
      payload: { name: string; color?: string | null; is_hidden: boolean };
    }) => updateInventoryTag(tagId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'tags'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'variants'] });
      notifications.show({ message: 'Štítek byl upraven', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Úprava štítku selhala', color: 'red' });
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: (tagId: number) => deleteInventoryTag(tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'tags'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'variants'] });
      notifications.show({ message: 'Štítek byl odstraněn', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Smazání štítku selhalo', color: 'red' });
    },
  });

  const [showOrdersPanel, setShowOrdersPanel] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);

  const clearSelection = useCallback(() => {
    const next = new Set<string>();
    setSelectedIds(next);
    setShowSelectedOnly(false);
    setSelectedVariantsMap({});
    lastSelectedIndexRef.current = null;
  }, []);

  const toggleSort = useCallback(
    (column: SortableColumn) => {
      setSort((current) => {
        const next: { column: SortableColumn; direction: 'asc' | 'desc' } =
          current.column === column
            ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
            : { column, direction: 'asc' };

        commitSearchParams((params) => {
          if (next.column === 'code' && next.direction === 'asc') {
            params.delete('sort_by');
            params.delete('sort_dir');
          } else {
            params.set('sort_by', next.column);
            params.set('sort_dir', next.direction);
          }
          params.delete('page');
        });

        return next;
      });
      clearSelection();
      setPage(1);
    },
    [clearSelection, commitSearchParams]
  );

  const forecastBulkMutation = useMutation({
    mutationFn: (variantIds: string[]) => bulkForecastInventoryVariants(variantIds),
    onSuccess: (_response, variantIds) => {
      notifications.show({
        message:
          variantIds.length === 1
            ? 'AI doporučení bude vytvořeno pro 1 variantu.'
            : `AI doporučení budou vytvořena pro ${variantIds.length.toLocaleString('cs-CZ')} variant.`,
        color: 'green',
      });
      clearSelection();
    },
    onError: () => {
      notifications.show({
        message: 'Naplánování AI doporučení selhalo.',
        color: 'red',
      });
    },
  });

  const handleTextFilterChange = useCallback(
    (key: string, value: string, setter: (next: string) => void) => {
      setter(value);
      clearSelection();
      setPage(1);
      commitSearchParams((params) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
        params.delete('page');
      });
    },
    [clearSelection, commitSearchParams]
  );

  const handleArrayFilterChange = useCallback(
    (key: string, values: string[], setter: (next: string[]) => void) => {
      const normalized = Array.from(
        new Set(
          values
            .map((value) => value.trim())
            .filter((value) => value !== '')
        )
      );

      setter(normalized);
      clearSelection();
      setPage(1);
      commitSearchParams((params) => {
        params.delete(key);
        normalized.forEach((value) => params.append(key, value));
        params.delete('page');
      });
    },
    [clearSelection, commitSearchParams]
  );

  const getColumnWidth = useCallback(
    (key: ResizableColumnKey) => columnWidths[key] ?? DEFAULT_COLUMN_WIDTHS[key],
    [columnWidths]
  );

  const getColumnStyle = useCallback(
    (key: ResizableColumnKey): CSSProperties => {
      const width = getColumnWidth(key);
      return { width, minWidth: width };
    },
    [getColumnWidth]
  );

  const updateColumnParams = useCallback(
    (visibility: Record<string, boolean>) => {
      const enabledColumns = visibilityToList(visibility);
      commitSearchParams((params) => {
        params.delete('columns');
        if (!visibilityEqual(visibility, DEFAULT_COLUMN_VISIBILITY)) {
          enabledColumns.forEach((columnKey) => params.append('columns', columnKey));
          params.set('columns_version', '3');
        } else {
          params.delete('columns_version');
        }
      });
    },
    [commitSearchParams]
  );

  const handleColumnVisibilityChange = useCallback(
    (key: string, checked: boolean) => {
      setColumnVisibility((current) => {
        const next = ensureStockColumn({ ...current, [key]: checked });
        updateColumnParams(next);
        return next;
      });
    },
    [updateColumnParams]
  );

  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [debouncedCode] = useDebouncedValue(code, 250);
  const [debouncedSku] = useDebouncedValue(sku, 250);
  const [debouncedEan] = useDebouncedValue(ean, 250);
  const [debouncedProductIdentifier] = useDebouncedValue(productIdentifier, 250);
  const [debouncedVariantName] = useDebouncedValue(variantName, 250);
  const [debouncedProductName] = useDebouncedValue(productName, 250);

  const { data: shopsResponse } = useShops({ per_page: 200 });

  const shopOptions = useMemo(() => {
    const list = shopsResponse?.data ?? [];
    return list.map((shop) => ({
      value: String(shop.id),
      label: shop.name ?? shop.domain ?? `Shop #${shop.id}`,
    }));
  }, [shopsResponse?.data]);

  const normalizedVariantNameFilter = useMemo(
    () => [...variantNameFilter].sort((a, b) => a.localeCompare(b, 'cs', { sensitivity: 'base' })),
    [variantNameFilter]
  );
  const normalizedShopFilter = useMemo(() => [...shopFilter].sort(), [shopFilter]);
  const normalizedTagFilter = useMemo(() => [...tagFilter].sort(), [tagFilter]);
  const normalizedFlagFilter = useMemo(() => [...flagFilter].sort(), [flagFilter]);
  const normalizedCategoryFilter = useMemo(() => [...categoryFilter].sort(), [categoryFilter]);
  const normalizedSeasonalityFilter = useMemo(
    () => [...seasonalityFilter].sort(),
    [seasonalityFilter]
  );
  const normalizedAiOrderRecommendations = useMemo(
    () => [...aiOrderRecommendations].sort(),
    [aiOrderRecommendations]
  );

  const buildPreferencePayload = useCallback((): InventoryListPreference => {
    const selectionList = Array.from(selectedIds).slice(0, 200);
    const columnsSnapshot = ensureStockColumn({ ...columnVisibility });

    return {
      page,
      page_size: pageSize,
      stock_status: status,
      search: normalizeText(search),
      code: normalizeText(code),
      sku: normalizeText(sku),
      ean: normalizeText(ean),
      product: normalizeText(productIdentifier),
      variant: normalizeText(variantName),
      variant_name: [...normalizedVariantNameFilter],
      product_name: normalizeText(productName),
      brand: [...brand],
      supplier: [...supplier],
      flag: [...normalizedFlagFilter],
      shop_id: [...normalizedShopFilter],
      tag_id: [...normalizedTagFilter],
      ai_order_recommendation: [...normalizedAiOrderRecommendations],
      default_category: [...normalizedCategoryFilter],
      seasonality: [...normalizedSeasonalityFilter],
      sort_by: sort.column,
      sort_dir: sort.direction,
      columns: columnsSnapshot,
      selection: selectionList,
      column_widths: { ...columnWidths },
    };
  }, [
    brand,
    code,
    columnVisibility,
    columnWidths,
    normalizedFlagFilter,
    normalizedShopFilter,
    normalizedTagFilter,
    page,
    pageSize,
    productIdentifier,
    productName,
    search,
    selectedIds,
    sku,
    sort.column,
    sort.direction,
    status,
    supplier,
    variantName,
    ean,
    normalizedVariantNameFilter,
    normalizedAiOrderRecommendations,
    normalizedCategoryFilter,
    normalizedSeasonalityFilter,
  ]);

  const isDefaultPreference = useCallback((preference: InventoryListPreference) => {
    const columnsSnapshot = ensureStockColumn({
      ...DEFAULT_COLUMN_VISIBILITY,
      ...(preference.columns ?? {}),
    });
    const widthsSnapshot = createColumnWidthState(preference.column_widths);
    const defaultWidths = createColumnWidthState();

    const isArrayEmpty = (value: string[] | undefined) => !value || value.length === 0;

    return (
      (preference.page ?? 1) === 1 &&
      (preference.page_size ?? 25) === 25 &&
      (preference.stock_status ?? 'all') === 'all' &&
      preference.search === undefined &&
      preference.code === undefined &&
      preference.sku === undefined &&
      preference.ean === undefined &&
      preference.product === undefined &&
      preference.variant === undefined &&
      preference.product_name === undefined &&
      isArrayEmpty(preference.brand) &&
      isArrayEmpty(preference.supplier) &&
      isArrayEmpty(preference.variant_name) &&
      isArrayEmpty(preference.flag) &&
      isArrayEmpty(preference.shop_id) &&
      isArrayEmpty(preference.tag_id) &&
      isArrayEmpty(preference.default_category) &&
      isArrayEmpty(preference.seasonality) &&
      isArrayEmpty(preference.ai_order_recommendation) &&
      (preference.sort_by ?? 'code') === 'code' &&
      (preference.sort_dir ?? 'asc') === 'asc' &&
      (!preference.selection || preference.selection.length === 0) &&
      visibilityEqual(columnsSnapshot, DEFAULT_COLUMN_VISIBILITY) &&
      columnWidthsEqual(widthsSnapshot, defaultWidths)
    );
  }, []);

  useEffect(() => {
    if (!preferenceHydrated) {
      return;
    }

    const payload = buildPreferencePayload();
    const defaultPreference = isDefaultPreference(payload);

    const serialized = defaultPreference ? '__default__' : JSON.stringify(payload);

    if (lastSavedPreferenceRef.current === serialized) {
      return;
    }

    if (preferenceSaveTimeoutRef.current !== null) {
      window.clearTimeout(preferenceSaveTimeoutRef.current);
    }

    preferenceSaveTimeoutRef.current = window.setTimeout(() => {
      lastSavedPreferenceRef.current = serialized;

      if (defaultPreference) {
        saveInventoryPreference(null);
      } else {
        saveInventoryPreference(payload);
      }
    }, 600);
  }, [
    buildPreferencePayload,
    isDefaultPreference,
    preferenceHydrated,
    saveInventoryPreference,
  ]);

  useEffect(() => {
    return () => {
      if (preferenceSaveTimeoutRef.current !== null) {
        window.clearTimeout(preferenceSaveTimeoutRef.current);
      }
    };
  }, []);

  const params = useMemo(() => {
    const query: Record<string, unknown> = {
      page,
      per_page: pageSize,
      sort_by: sort.column,
      sort_dir: sort.direction,
    };

    // showSelectedOnly je řešeno klientsky, ids neposíláme do API
    if (debouncedSearch) {
      query.search = debouncedSearch;
    }
    if (debouncedCode) {
      query.code = debouncedCode;
    }
    if (debouncedSku) {
      query.sku = debouncedSku;
    }
    if (debouncedEan) {
      query.ean = debouncedEan;
    }
    if (debouncedProductIdentifier) {
      query.product = debouncedProductIdentifier;
    }
    if (status !== 'all') {
      query.stock_status = status;
    }
    if (debouncedVariantName) {
      query.variant = debouncedVariantName;
    }
    if (variantNameFilter.length > 0) {
      query.variant_name = variantNameFilter;
    }
    if (debouncedProductName) {
      query.product_name = debouncedProductName;
    }
    if (brand.length > 0) {
      query.brand = brand;
    }
    if (supplier.length > 0) {
      query.supplier = supplier;
    }
    if (normalizedFlagFilter.length > 0) {
      query.flag = normalizedFlagFilter;
    }
    if (normalizedShopFilter.length > 0) {
      query.shop_id = normalizedShopFilter;
    }
    if (tagFilter.length > 0) {
      query.tag_id = tagFilter;
    }
    if (categoryFilter.length > 0) {
      query.default_category = categoryFilter;
    }
    if (seasonalityFilter.length > 0) {
      query.seasonality = seasonalityFilter;
    }
    if (aiOrderRecommendations.length > 0) {
      query.ai_order_recommendation = aiOrderRecommendations;
    }

    return query;
  }, [
    page,
    pageSize,
    sort.column,
    sort.direction,
    debouncedSearch,
    debouncedCode,
    debouncedSku,
    debouncedEan,
    debouncedProductIdentifier,
    status,
    debouncedVariantName,
    variantNameFilter,
    debouncedProductName,
    brand,
    supplier,
    normalizedFlagFilter,
    normalizedShopFilter,
    tagFilter,
    categoryFilter,
    seasonalityFilter,
    aiOrderRecommendations,
    showSelectedOnly,
    selectedIds,
  ]);

  const { data, isLoading } = useInventoryVariants(params);

  const variants = useMemo(() => {
    const list = data?.data ?? [];
    const seen = new Set<string>();
    const deduped = list.filter((variant) => {
      if (seen.has(variant.id)) return false;
      seen.add(variant.id);
      return true;
    });
    return deduped;
  }, [data]);
  const variantsMap = useMemo(() => new Map(variants.map((variant) => [variant.id, variant])), [variants]);

  useEffect(() => {
    if (showSelectedOnly) {
      setPage(1);
    }
  }, [showSelectedOnly]);

  useEffect(() => {
    if (showSelectedOnly && selectedIds.size === 0) {
      setShowSelectedOnly(false);
    }
  }, [selectedIds, showSelectedOnly]);

  useEffect(() => {
    if (
      lastSelectedIndexRef.current !== null &&
      (lastSelectedIndexRef.current < 0 || lastSelectedIndexRef.current >= variants.length)
    ) {
      lastSelectedIndexRef.current = null;
    }
  }, [variants]);

  const brandOptions = useMemo(() => {
    const fromApi = filtersData?.brands ?? [];
    const fromPage = variants
      .map((variant) => resolveBrand(variant))
      .filter((value): value is string => Boolean(value));

    const unique = Array.from(new Set([...fromApi, ...fromPage]));
    return unique.map((value) => ({ value, label: value }));
  }, [filtersData?.brands, variants]);

  const supplierOptions = useMemo(() => {
    const fromApi = filtersData?.suppliers ?? [];
    const fromPage = variants
      .map((variant) => resolveSupplier(variant))
      .filter((value): value is string => Boolean(value));

    const unique = Array.from(new Set([...fromApi, ...fromPage]));
    return unique.map((value) => ({ value, label: value }));
  }, [filtersData?.suppliers, variants]);

  const flagOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();

    const registerFlag = (flag: { code?: string; title?: string | null } | null | undefined) => {
      if (!flag) {
        return;
      }

      const code = typeof flag.code === 'string' ? flag.code.trim() : '';
      if (code === '') {
        return;
      }

      const title = typeof flag.title === 'string' && flag.title.trim() !== '' ? flag.title.trim() : code;

      if (!map.has(code)) {
        const label = title !== code ? `${title} (${code})` : code;
        map.set(code, { value: code, label });
      }
    };

    (filtersData?.flags ?? []).forEach((flag) => registerFlag(flag));
    variants.forEach((variant) => {
      (variant.product_flags ?? []).forEach((flag) => registerFlag(flag));
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'cs', { sensitivity: 'base' }));
  }, [filtersData?.flags, variants]);

  const defaultCategoryOptions = useMemo(() => {
    const fromApi = filtersData?.default_categories ?? [];
    const fromPage = variants
      .map((variant) => resolveDefaultCategory(variant))
      .filter((value): value is string => Boolean(value));

    const unique = Array.from(new Set([...fromApi, ...fromPage]));
    return unique.map((value) => ({ value, label: value }));
  }, [filtersData?.default_categories, variants]);

  const seasonalityOptions = useMemo(() => {
    const fromApi = filtersData?.seasonality ?? [];
    const fromPage = variants.flatMap((variant) => resolveSeasonalityLabels(variant));
    const unique = Array.from(new Set([...fromApi, ...fromPage]));

    return unique.map((value) => ({ value, label: value }));
  }, [filtersData?.seasonality, variants]);

  useEffect(() => {
    if (preferenceHydrated || preferenceLoading) {
      return;
    }

    const preference = storedPreference;
    const hasExplicitQuery = searchParams.toString() !== '';

    if (!preference) {
      lastSavedPreferenceRef.current = '__default__';
      setPreferenceHydrated(true);
      return;
    }

    const normalizedSelection = uniqueStringArray(preference.selection ?? []).slice(0, 200);
    if (normalizedSelection.length > 0) {
      setSelectedIds(new Set(normalizedSelection));
    }

    const normalizedColumns = ensureStockColumn({
      ...DEFAULT_COLUMN_VISIBILITY,
      ...(preference.columns ?? {}),
    });

    const normalizedBrand = uniqueStringArray(preference.brand ?? []);
    const normalizedSupplier = uniqueStringArray(preference.supplier ?? []);
    const normalizedFlag = uniqueStringArray(preference.flag ?? []);
    const normalizedShopFilter = uniqueStringArray(preference.shop_id ?? []);
    const normalizedTagFilter = uniqueStringArray(preference.tag_id ?? []);
    const normalizedDefaultCategories = uniqueStringArray(preference.default_category ?? []);
    const normalizedSeasonality = uniqueStringArray(preference.seasonality ?? []);
    const normalizedAiOrder = sanitizeAiRecommendations(preference.ai_order_recommendation ?? []);
    const normalizedVariantNames = uniqueStringArray(preference.variant_name ?? []);
    const normalizedColumnWidths = createColumnWidthState(preference.column_widths);

    const trackedPayload: InventoryListPreference = {
      page: preference.page ?? 1,
      page_size: preference.page_size ?? 25,
      stock_status: preference.stock_status ?? 'all',
      search: preference.search ?? undefined,
      code: preference.code ?? undefined,
      sku: preference.sku ?? undefined,
      ean: preference.ean ?? undefined,
      product: preference.product ?? undefined,
      variant: preference.variant ?? undefined,
      variant_name: normalizedVariantNames,
      product_name: preference.product_name ?? undefined,
      brand: normalizedBrand,
      supplier: normalizedSupplier,
      flag: normalizedFlag,
      shop_id: normalizedShopFilter,
      tag_id: normalizedTagFilter,
      default_category: normalizedDefaultCategories,
      seasonality: normalizedSeasonality,
      ai_order_recommendation: normalizedAiOrder,
      sort_by: preference.sort_by ?? 'code',
      sort_dir: preference.sort_dir ?? 'asc',
      columns: normalizedColumns,
      selection: normalizedSelection,
      column_widths: normalizedColumnWidths,
    };

    if (hasExplicitQuery) {
      lastSavedPreferenceRef.current = isDefaultPreference(trackedPayload)
        ? '__default__'
        : JSON.stringify(trackedPayload);
      setPreferenceHydrated(true);
      return;
    }

    preferenceHydrationRef.current = true;

    const nextPage = preference.page ? Math.max(1, Math.floor(preference.page)) : 1;
    const nextPageSize = normalizePageSize(preference.page_size ?? null);
    const nextStatus = normalizeStatusParam(preference.stock_status ?? null);
    const nextSortColumn = preference.sort_by ? normalizeSortColumn(preference.sort_by) : 'code';
    const nextSortDirection = preference.sort_dir ? normalizeSortDirection(preference.sort_dir) : 'asc';

    setPage(nextPage);
    setPageSize(nextPageSize);
    setStatus(nextStatus);
    setSearch(preference.search ?? '');
    setCode(preference.code ?? '');
    setSku(preference.sku ?? '');
    setEan(preference.ean ?? '');
    setProductIdentifier(preference.product ?? '');
    setVariantName(preference.variant ?? '');
    setVariantNameFilter(normalizedVariantNames);
    setProductName(preference.product_name ?? '');
    setBrand(normalizedBrand);
    setSupplier(normalizedSupplier);
    setFlagFilter(normalizedFlag);
    setShopFilter(normalizedShopFilter);
    setTagFilter(normalizedTagFilter);
    setCategoryFilter(normalizedDefaultCategories);
    setSeasonalityFilter(normalizedSeasonality);
    setAiOrderRecommendations(normalizedAiOrder);
    setSort({ column: nextSortColumn, direction: nextSortDirection });
    setColumnVisibility(normalizedColumns);
    setColumnWidths(normalizedColumnWidths);
    setSelectedIds(new Set(normalizedSelection));

    commitSearchParams((params) => {
      if (nextPage > 1) {
        params.set('page', String(nextPage));
      } else {
        params.delete('page');
      }

      if (nextPageSize !== 25) {
        params.set('page_size', String(nextPageSize));
      } else {
        params.delete('page_size');
      }

      if (nextStatus !== 'all') {
        params.set('stock_status', nextStatus);
      } else {
        params.delete('stock_status');
      }

      const setTextParam = (key: string, value: string) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      };

      setTextParam('search', preference.search ?? '');
      setTextParam('code', preference.code ?? '');
      setTextParam('sku', preference.sku ?? '');
      setTextParam('ean', preference.ean ?? '');
      setTextParam('product', preference.product ?? '');
      setTextParam('variant', preference.variant ?? '');
      setTextParam('product_name', preference.product_name ?? '');

      params.delete('variant_name');
      normalizedVariantNames.forEach((value) => params.append('variant_name', value));

      params.delete('brand');
      normalizedBrand.forEach((value) => params.append('brand', value));

      params.delete('supplier');
      normalizedSupplier.forEach((value) => params.append('supplier', value));

      params.delete('flag');
      normalizedFlag.forEach((value) => params.append('flag', value));

      params.delete('shop_id');
      normalizedShopFilter.forEach((value) => params.append('shop_id', value));

      params.delete('tag_id');
      normalizedTagFilter.forEach((value) => params.append('tag_id', value));

      params.delete('default_category');
      normalizedDefaultCategories.forEach((value) => params.append('default_category', value));

      params.delete('seasonality');
      normalizedSeasonality.forEach((value) => params.append('seasonality', value));

      params.delete('ai_order_recommendation');
      normalizedAiOrder.forEach((value) => params.append('ai_order_recommendation', value));

      if (nextSortColumn === 'code' && nextSortDirection === 'asc') {
        params.delete('sort_by');
        params.delete('sort_dir');
      } else {
        params.set('sort_by', nextSortColumn);
        params.set('sort_dir', nextSortDirection);
      }

      params.delete('columns');
      if (!visibilityEqual(normalizedColumns, DEFAULT_COLUMN_VISIBILITY)) {
        visibilityToList(normalizedColumns).forEach((columnKey) => params.append('columns', columnKey));
        params.set('columns_version', '3');
      } else {
        params.delete('columns_version');
      }
    });

    lastSavedPreferenceRef.current = isDefaultPreference(trackedPayload)
      ? '__default__'
      : JSON.stringify(trackedPayload);
    setPreferenceHydrated(true);
  }, [
    commitSearchParams,
    normalizePageSize,
    normalizeSortColumn,
    normalizeSortDirection,
    normalizeStatusParam,
    preferenceHydrated,
    preferenceLoading,
    searchParams,
    isDefaultPreference,
    storedPreference,
  ]);

  useEffect(() => {
    const hydratingFromPreference = preferenceHydrationRef.current;
    if (hydratingFromPreference) {
      preferenceHydrationRef.current = false;
    }

    let shouldResetSelection = false;

    const nextPage = parsePageParam(searchParams.get('page'));
    if (nextPage !== page) {
      setPage(nextPage);
    }

    const nextStatus = normalizeStatusParam(searchParams.get('stock_status'));
    if (nextStatus !== status) {
      setStatus(nextStatus);
      shouldResetSelection = true;
    }

    const nextSearch = searchParams.get('search') ?? '';
    if (nextSearch !== search) {
      setSearch(nextSearch);
      shouldResetSelection = true;
    }

    const nextCode = searchParams.get('code') ?? '';
    if (nextCode !== code) {
      setCode(nextCode);
      shouldResetSelection = true;
    }

    const nextSku = searchParams.get('sku') ?? '';
    if (nextSku !== sku) {
      setSku(nextSku);
      shouldResetSelection = true;
    }

    const nextEan = searchParams.get('ean') ?? '';
    if (nextEan !== ean) {
      setEan(nextEan);
      shouldResetSelection = true;
    }

    const nextProductIdentifier = searchParams.get('product') ?? '';
    if (nextProductIdentifier !== productIdentifier) {
      setProductIdentifier(nextProductIdentifier);
      shouldResetSelection = true;
    }

    const nextVariantName = searchParams.get('variant') ?? '';
    if (nextVariantName !== variantName) {
      setVariantName(nextVariantName);
      shouldResetSelection = true;
    }

    const nextVariantNameFilter = parseArrayParam('variant_name');
    if (!arraysEqual(nextVariantNameFilter, variantNameFilter)) {
      setVariantNameFilter(nextVariantNameFilter);
      shouldResetSelection = true;
    }

    const nextProductName = searchParams.get('product_name') ?? '';
    if (nextProductName !== productName) {
      setProductName(nextProductName);
      shouldResetSelection = true;
    }

    const nextBrand = parseArrayParam('brand');
    if (!arraysEqual(nextBrand, brand)) {
      setBrand(nextBrand);
      shouldResetSelection = true;
    }

    const nextSupplier = parseArrayParam('supplier');
    if (!arraysEqual(nextSupplier, supplier)) {
      setSupplier(nextSupplier);
      shouldResetSelection = true;
    }

    const nextShopFilter = parseArrayParam('shop_id');
    if (!arraysEqual(nextShopFilter, shopFilter)) {
      setShopFilter(nextShopFilter);
      shouldResetSelection = true;
    }

    const nextTagFilter = parseArrayParam('tag_id');
    if (!arraysEqual(nextTagFilter, tagFilter)) {
      setTagFilter(nextTagFilter);
      shouldResetSelection = true;
    }

    const nextCategoryFilter = parseArrayParam('default_category');
    if (!arraysEqual(nextCategoryFilter, categoryFilter)) {
      setCategoryFilter(nextCategoryFilter);
      shouldResetSelection = true;
    }

    const nextSeasonalityFilter = parseArrayParam('seasonality');
    if (!arraysEqual(nextSeasonalityFilter, seasonalityFilter)) {
      setSeasonalityFilter(nextSeasonalityFilter);
      shouldResetSelection = true;
    }

    const nextAiOrder = sanitizeAiRecommendations(parseArrayParam('ai_order_recommendation'));
    if (!arraysEqual(nextAiOrder, aiOrderRecommendations)) {
      setAiOrderRecommendations(nextAiOrder);
      shouldResetSelection = true;
    }

    const nextSortColumn = normalizeSortColumn(searchParams.get('sort_by'));
    const nextSortDirection = normalizeSortDirection(searchParams.get('sort_dir'));
    if (nextSortColumn !== sort.column || nextSortDirection !== sort.direction) {
      setSort({ column: nextSortColumn, direction: nextSortDirection });
      shouldResetSelection = true;
    }

    const nextColumns = parseArrayParam('columns');
    const desiredVisibility = visibilityFromList(
      nextColumns,
      searchParams.get('columns_version') === '3'
    );
    if (!visibilityEqual(columnVisibility, desiredVisibility)) {
      setColumnVisibility(desiredVisibility);
    }

    const nextPageSize = normalizePageSize(searchParams.get('page_size'));
    if (nextPageSize !== pageSize) {
      setPageSize(nextPageSize);
    }

    // Necháváme výběr (checkboxy) zachovaný i při změně parametrů/paginace,
    // takže výběr nezapisujeme na prázdno.
    void shouldResetSelection;

  }, [
    arraysEqual,
    variantNameFilter,
    brand,
    columnVisibility,
    code,
    ean,
    normalizePageSize,
    normalizeSortColumn,
    normalizeSortDirection,
    normalizeStatusParam,
    page,
    pageSize,
    parseArrayParam,
    parsePageParam,
    productIdentifier,
    productName,
    search,
    searchParams,
    categoryFilter,
    shopFilter,
    tagFilter,
    seasonalityFilter,
    sku,
    sort,
    status,
    supplier,
    variantName,
    aiOrderRecommendations,
  ]);

  const assigningVariantId =
    syncVariantTagsMutation.isPending && syncVariantTagsMutation.variables
      ? syncVariantTagsMutation.variables.variantId
      : null;

  const creatingTag = createTagMutation.isPending;

  const updatingTagId =
    updateTagMutation.isPending && updateTagMutation.variables
      ? updateTagMutation.variables.tagId
      : null;

  const deletingTagId =
    deleteTagMutation.isPending && deleteTagMutation.variables !== undefined
      ? deleteTagMutation.variables
      : null;

  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    variants.length > 0 && variants.every((variant) => selectedIds.has(variant.id));
  const someVisibleSelected =
    variants.length > 0 && variants.some((variant) => selectedIds.has(variant.id));
  const totalCount = data?.total ?? 0;
  const handleColumnFilterChange = useCallback(
    (key: keyof typeof columnFilters, value: string) => {
      setColumnFilters((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const baseRows = showSelectedOnly
    ? Array.from(selectedIds)
        .map((id) => selectedVariantsMap[id])
        .filter((variant): variant is InventoryVariant => Boolean(variant))
    : variants;

  const variantMatchesColumnFilters = useCallback(
    (variant: InventoryVariant) => {
      const orderedValue = toNumber(variant.ordered_quantity) ?? 0;
      const priceValue = toNumber(variant.price) ?? 0;
      const purchasePriceValue = toNumber(variant.purchase_price) ?? 0;
      const lifetimeValue = toNumber(variant.lifetime_revenue) ?? 0;
      const sales30Value = toNumber(variant.last_30_quantity) ?? 0;
      const demandValue = toNumber(variant.average_daily_sales) ?? 0;
      const runwayValue = toNumber(variant.stock_runway_days) ?? 0;

      const minOk = (input: string, value: number) =>
        input.trim() === '' || value >= Number(input);
      const maxOk = (input: string, value: number) =>
        input.trim() === '' || value <= Number(input);

      if (!minOk(columnFilters.orderedMin, orderedValue) || !maxOk(columnFilters.orderedMax, orderedValue)) {
        return false;
      }
      if (!minOk(columnFilters.priceMin, priceValue) || !maxOk(columnFilters.priceMax, priceValue)) {
        return false;
      }
      if (
        !minOk(columnFilters.purchasePriceMin, purchasePriceValue) ||
        !maxOk(columnFilters.purchasePriceMax, purchasePriceValue)
      ) {
        return false;
      }
      if (!minOk(columnFilters.lifetimeMin, lifetimeValue) || !maxOk(columnFilters.lifetimeMax, lifetimeValue)) {
        return false;
      }
      if (!minOk(columnFilters.sales30Min, sales30Value) || !maxOk(columnFilters.sales30Max, sales30Value)) {
        return false;
      }
      if (!minOk(columnFilters.demandMin, demandValue) || !maxOk(columnFilters.demandMax, demandValue)) {
        return false;
      }
      if (!minOk(columnFilters.runwayMin, runwayValue) || !maxOk(columnFilters.runwayMax, runwayValue)) {
        return false;
      }
      return true;
    },
    [columnFilters]
  );

  const tableRows = useMemo(
    () => baseRows.filter((variant) => variantMatchesColumnFilters(variant)),
    [baseRows, variantMatchesColumnFilters]
  );
  const displayedCount = tableRows.length;

  useEffect(() => {
    setSelectedVariantsMap((current) => {
      const next = { ...current };
      variants.forEach((variant) => {
        if (selectedIds.has(variant.id)) {
          next[variant.id] = variant;
        }
      });
      return next;
    });
  }, [variants, selectedIds]);

  const headerSortState = useMemo(
    () => [{ column: sort.column, direction: sort.direction }],
    [sort]
  );

  const headerColumns = useMemo<HeaderColumn<string, SortableColumn>[]>(
    () => {
      const renderRangeFilter = (
        minKey: keyof typeof columnFilters,
        maxKey: keyof typeof columnFilters
      ) => (
        <Stack gap={6}>
          <TextInput
            size="xs"
            placeholder="od"
            type="number"
            value={columnFilters[minKey]}
            onChange={(event) => handleColumnFilterChange(minKey, event.currentTarget.value)}
          />
          <TextInput
            size="xs"
            placeholder="do"
            type="number"
            value={columnFilters[maxKey]}
            onChange={(event) => handleColumnFilterChange(maxKey, event.currentTarget.value)}
          />
        </Stack>
      );

      const rangeActive = (minKey: keyof typeof columnFilters, maxKey: keyof typeof columnFilters) =>
        columnFilters[minKey].trim() !== '' || columnFilters[maxKey].trim() !== '';

      const cols: HeaderColumn<string, SortableColumn>[] = [];

      cols.push({ key: 'code', label: 'Kód', sortable: true, sortKey: 'code' });

      if (columnVisibility.variant) {
        cols.push({ key: 'variant', label: 'Varianta', sortable: true, sortKey: 'variant' });
      }
      if (columnVisibility.product) {
        cols.push({ key: 'product', label: 'Produkt' });
      }
      if (columnVisibility.default_category_name) {
        cols.push({ key: 'default_category_name', label: 'Výchozí kategorie' });
      }
      if (columnVisibility.seasonality_labels) {
        cols.push({ key: 'seasonality_labels', label: 'Roční období' });
      }
      if (columnVisibility.brand) {
        cols.push({ key: 'brand', label: 'Značka', sortable: true, sortKey: 'brand' });
      }
      if (columnVisibility.supplier) {
        cols.push({ key: 'supplier', label: 'Dodavatel', sortable: true, sortKey: 'supplier' });
      }
      if (columnVisibility.product_flags) {
        cols.push({ key: 'product_flags', label: 'Shoptet štítky' });
      }
      if (columnVisibility.tags) {
        cols.push({ key: 'tags', label: 'Štítky' });
      }
      if (columnVisibility.sku) {
        cols.push({ key: 'sku', label: 'SKU' });
      }
      if (columnVisibility.ean) {
        cols.push({ key: 'ean', label: 'EAN' });
      }

      cols.push({ key: 'status', label: 'Stav' });

      if (columnVisibility.ai_insight) {
        cols.push({ key: 'ai_insight', label: 'AI doporučení' });
      }
      if (columnVisibility.stock) {
        cols.push({ key: 'stock', label: 'Zásoba', sortable: true, sortKey: 'stock' });
      }
      if (columnVisibility.ordered) {
        cols.push({
          key: 'ordered',
          label: 'Objednáno',
          sortable: true,
          sortKey: 'ordered',
          filterContent: renderRangeFilter('orderedMin', 'orderedMax'),
          filterActive: rangeActive('orderedMin', 'orderedMax'),
        });
      }
      if (columnVisibility.min_stock_supply) {
        cols.push({
          key: 'min_stock_supply',
          label: 'Min. zásoba',
          sortable: true,
          sortKey: 'min_stock_supply',
        });
      }
      if (columnVisibility.price) {
        cols.push({
          key: 'price',
          label: 'Cena',
          sortable: true,
          sortKey: 'price',
          filterContent: renderRangeFilter('priceMin', 'priceMax'),
          filterActive: rangeActive('priceMin', 'priceMax'),
        });
      }
      if (columnVisibility.purchase_price) {
        cols.push({
          key: 'purchase_price',
          label: 'Nákupní cena',
          sortable: true,
          sortKey: 'purchase_price',
          filterContent: renderRangeFilter('purchasePriceMin', 'purchasePriceMax'),
          filterActive: rangeActive('purchasePriceMin', 'purchasePriceMax'),
        });
      }
      if (columnVisibility.lifetime_revenue) {
        cols.push({
          key: 'lifetime_revenue',
          label: 'Lifetime obrat',
          sortable: true,
          sortKey: 'lifetime_revenue',
          filterContent: renderRangeFilter('lifetimeMin', 'lifetimeMax'),
          filterActive: rangeActive('lifetimeMin', 'lifetimeMax'),
        });
      }
      if (columnVisibility.last_30_quantity) {
        cols.push({
          key: 'last_30_quantity',
          label: 'Prodeje (30 dní)',
          sortable: true,
          sortKey: 'last_30_quantity',
          filterContent: renderRangeFilter('sales30Min', 'sales30Max'),
          filterActive: rangeActive('sales30Min', 'sales30Max'),
        });
      }
      if (columnVisibility.average_daily_sales) {
        cols.push({
          key: 'average_daily_sales',
          label: 'Denní poptávka',
          sortable: true,
          sortKey: 'average_daily_sales',
          filterContent: renderRangeFilter('demandMin', 'demandMax'),
          filterActive: rangeActive('demandMin', 'demandMax'),
        });
      }
      if (columnVisibility.stock_runway_days) {
        cols.push({
          key: 'stock_runway_days',
          label: 'Výdrž zásoby',
          sortable: true,
          sortKey: 'stock_runway_days',
          filterContent: renderRangeFilter('runwayMin', 'runwayMax'),
          filterActive: rangeActive('runwayMin', 'runwayMax'),
        });
      }

      return cols;
    },
    [columnFilters, columnVisibility, handleColumnFilterChange]
  );


  const visibleColumnCount = 1 + headerColumns.length;

  const handleHeaderSort = useCallback(
    (column: SortableColumn) => {
      toggleSort(column);
    },
    [toggleSort]
  );

  const renderTruncatedText = useCallback(
    (value: string | null | undefined, size: 'sm' | 'xs' = 'sm') => {
      if (!value) {
        return null;
      }
      return (
        <Tooltip label={value} withinPortal multiline>
          <Text size={size} className={classes.truncate}>
            {value}
          </Text>
        </Tooltip>
      );
    },
    []
  );

  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const tableViewportHeight = useMemo(() => {
    const target = tableRows.length * INVENTORY_ROW_HEIGHT;
    return Math.min(720, Math.max(360, target || 360));
  }, [tableRows.length]);

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableViewportRef.current,
    estimateSize: () => INVENTORY_ROW_HEIGHT,
    overscan: 8,
    measureElement: (element) => element?.getBoundingClientRect().height ?? INVENTORY_ROW_HEIGHT,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalVirtualHeight = rowVirtualizer.getTotalSize();

  const totalTableWidth = useMemo(() => {
    const selectionWidth = 34;
    const fallbackWidth = 160;
    const columnsWidth = headerColumns.reduce((sum, column) => {
      const key = column.key as ResizableColumnKey;
      if (COLUMN_WIDTH_KEYS.includes(key)) {
        return sum + getColumnWidth(key);
      }
      return sum + fallbackWidth;
    }, 0);
    return selectionWidth + columnsWidth;
  }, [getColumnWidth, headerColumns]);

  const handleSelectAllVisible = useCallback(
    (checked: boolean) => {
      setSelectedIds((current) => {
        const next = new Set(current);

        if (checked) {
          variants.forEach((variant) => next.add(variant.id));
        } else {
          variants.forEach((variant) => next.delete(variant.id));
        }

        return next;
      });
      setSelectedVariantsMap((current) => {
        const next = { ...current };
        variants.forEach((variant) => {
          if (checked) {
            next[variant.id] = variant;
          } else {
            delete next[variant.id];
          }
        });
        return next;
      });
      if (checked && variants.length > 0) {
        lastSelectedIndexRef.current = variants.length - 1;
      } else if (!checked) {
        lastSelectedIndexRef.current = null;
      }
    },
    [variants]
  );

  const handleSelectVariant = useCallback(
    (
      variant: InventoryVariant,
      checked: boolean,
      meta: { shiftKey?: boolean } = {}
    ) => {
      const variantId = variant.id;
      const currentIndex = variants.findIndex((entry) => entry.id === variantId);

      if (currentIndex === -1) {
        return;
      }

      setSelectedIds((current) => {
        const next = new Set(current);

        const indices: number[] = [];

        if (meta.shiftKey && lastSelectedIndexRef.current !== null) {
          const lastIndex = lastSelectedIndexRef.current;
          const start = Math.min(lastIndex, currentIndex);
          const end = Math.max(lastIndex, currentIndex);
          for (let index = start; index <= end; index += 1) {
            indices.push(index);
          }
        } else {
          indices.push(currentIndex);
        }

        indices.forEach((index) => {
          const target = variants[index];
          if (!target) {
            return;
          }

          if (checked) {
            next.add(target.id);
          } else {
            next.delete(target.id);
          }
        });

        return next;
      });

      setSelectedVariantsMap((current) => {
        const next = { ...current };
        if (checked) {
          next[variantId] = variant;
        } else {
          delete next[variantId];
        }
        return next;
      });

      lastSelectedIndexRef.current = currentIndex;
    },
    [variants]
  );

  const handleExport = useCallback(
    async (options: { scope: 'all' | 'selected'; columns: 'all' | 'visible' }) => {
      const idsToExport = Array.from(selectedIds);
      const shouldExportSelected = options.scope === 'selected' && idsToExport.length > 0;

      const exportParams: Record<string, unknown> = { ...params };
      if (options.columns === 'visible') {
        exportParams.columns = visibilityToList(columnVisibility);
        exportParams.columns_version = '3';
      }
      if (shouldExportSelected) {
        exportParams.ids = idsToExport;
      }

      const blob = await exportInventoryVariants(exportParams);

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventory_variants_${new Date().toISOString()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      if (shouldExportSelected) {
        clearSelection();
      }
    },
    [clearSelection, columnVisibility, params, selectedIds]
  );

  const handleOrderFileChange = useCallback((file: File | null) => {
    if (file) {
      setOrderFile(file);
      const sizeLabel = formatFileSize(file.size);
      setOrderFileLabel(sizeLabel ? `${file.name} • ${sizeLabel}` : file.name);
      return;
    }

    setOrderFile(null);
    setOrderFileLabel('');
  }, []);

  const clearOrderFile = useCallback(() => {
    handleOrderFileChange(null);
  }, [handleOrderFileChange]);

  const handleOrderUpload = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!orderFile) {
        notifications.show({ message: 'Vyber soubor s objednávkou.', color: 'yellow' });
        return;
      }
      if (!orderDate) {
        notifications.show({ message: 'Vyber datum objednávky.', color: 'yellow' });
        return;
      }

      const formData = new FormData();
      formData.append('file', orderFile);
      formData.append('ordered_at', orderDate);
      if (arrivalDaysInput.trim() !== '') {
        formData.append('arrival_in_days', arrivalDaysInput.trim());
      }
      if (expectedArrivalDate.trim() !== '') {
        formData.append('expected_arrival_at', expectedArrivalDate.trim());
      }

      try {
        await createOrderMutation.mutateAsync(formData);
        notifications.show({ message: 'Excel byl nahrán a zpracován.', color: 'green' });
        clearOrderFile();
        setExpectedArrivalDate('');
      } catch (error) {
        console.error(error);
        notifications.show({
          message: resolveErrorMessage(error, 'Nahrání selhalo.'),
          color: 'red',
        });
      }
    },
    [arrivalDaysInput, clearOrderFile, createOrderMutation, expectedArrivalDate, orderDate, orderFile]
  );

  const handleDeleteOrder = useCallback(
    async (orderId: number) => {
      const confirmed = window.confirm(
        'Opravdu chceš tento Excel odstranit? Z tabulky se smažou i navázaná data.'
      );
      if (!confirmed) {
        return;
      }

      try {
        setDeletingOrderId(orderId);
        await deleteOrderMutation.mutateAsync(orderId);
        notifications.show({ message: 'Objednávka byla odstraněna.', color: 'green' });
      } catch (error) {
        console.error(error);
        notifications.show({
          message: resolveErrorMessage(error, 'Odstranění selhalo.'),
          color: 'red',
        });
      } finally {
        setDeletingOrderId(null);
      }
    },
    [deleteOrderMutation]
  );

  const handlePageChange = (nextPage: number) => {
    const normalized = Number.isFinite(nextPage) && nextPage > 0 ? Math.floor(nextPage) : 1;
    if (normalized === page) {
      return;
    }

    setPage(normalized);
    commitSearchParams((params) => {
      if (normalized === 1) {
        params.delete('page');
      } else {
        params.set('page', String(normalized));
      }
    }, false);
  };

  const handlePageSizeChange = (value: string | null) => {
    const normalized = normalizePageSize(value);

    if (normalized === pageSize) {
      return;
    }

    setPageSize(normalized);
    setPage(1);
    commitSearchParams((params) => {
      if (normalized === 25) {
        params.delete('page_size');
      } else {
        params.set('page_size', String(normalized));
      }
      params.delete('page');
    });
  };

  const handleAssignTags = async (variantId: string, tagIds: number[]) => {
    try {
      await syncVariantTagsMutation.mutateAsync({ variantId, tagIds });
      return true;
    } catch {
      return false;
    }
  };

  const handleBulkAssignToSelection = async ({
    existingTagIds,
    newTagName,
    newTagColor,
  }: BulkAssignTagsPayload) => {
    if (selectedIds.size === 0) {
      notifications.show({ message: 'Nejsou vybrané žádné varianty', color: 'red' });
      return;
    }

    const tagIdsSet = new Set(existingTagIds);

    try {
      setBulkAssignLoading(true);

      if (newTagName && newTagName.trim() !== '') {
        const trimmedName = newTagName.trim();

        if (trimmedName.length > 120) {
          notifications.show({
            message: 'Název štítku může mít maximálně 120 znaků',
            color: 'red',
          });
          setBulkAssignLoading(false);
          return;
        }

        const createdTag = await createTagMutation.mutateAsync({
          name: trimmedName,
          color: newTagColor?.trim() || null,
          is_hidden: false,
        });

        tagIdsSet.add(createdTag.id);
      }

      if (tagIdsSet.size === 0) {
        notifications.show({
          message: 'Vyberte alespoň jeden štítek',
          color: 'red',
        });
        setBulkAssignLoading(false);
        return;
      }

      const targetVariantIds = Array.from(selectedIds);
      let updatedCount = 0;

      for (const variantId of targetVariantIds) {
        const variant = variantsMap.get(variantId);
        if (!variant) {
          continue;
        }

        const currentTagIds = (variant.tags ?? []).map((tag) => tag.id);
        const merged = Array.from(new Set<number>([...currentTagIds, ...tagIdsSet]));

        await syncInventoryVariantTags(variantId, merged);
        updatedCount += 1;
      }

      await queryClient.invalidateQueries({ queryKey: ['inventory', 'variants'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory', 'variant'] });

      notifications.show({
        message: `Štítky byly přidány k ${updatedCount} variantám`,
        color: 'green',
      });

      setBulkAssignOpened(false);
      clearSelection();
    } catch {
      notifications.show({ message: 'Hromadné přiřazení štítků selhalo', color: 'red' });
    } finally {
      setBulkAssignLoading(false);
    }
  };

  const handleBulkForecast = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      notifications.show({ message: 'Vyber alespoň jednu variantu.', color: 'yellow' });
      return;
    }

    forecastBulkMutation.mutate(ids);
  }, [forecastBulkMutation, selectedIds]);

  const handleCreateTagFromModal = async (
    payload: { name: string; color: string | null; is_hidden: boolean }
  ) => {
    const trimmed = payload.name.trim();

    if (trimmed.length === 0) {
      notifications.show({ message: 'Název štítku nesmí být prázdný', color: 'red' });
      return false;
    }

    if (trimmed.length > 120) {
      notifications.show({ message: 'Název štítku může mít maximálně 120 znaků', color: 'red' });
      return false;
    }

    const color = payload.color?.trim() ?? null;

    try {
      await createTagMutation.mutateAsync({
        name: trimmed,
        color,
        is_hidden: payload.is_hidden,
      });
      return true;
    } catch {
      return false;
    }
  };

  const handleUpdateTag = async (
    tagId: number,
    payload: { name: string; color: string | null; is_hidden: boolean }
  ) => {
    const trimmed = payload.name.trim();

    if (trimmed.length === 0) {
      notifications.show({ message: 'Název štítku nesmí být prázdný', color: 'red' });
      return false;
    }

    if (trimmed.length > 120) {
      notifications.show({ message: 'Název štítku může mít maximálně 120 znaků', color: 'red' });
      return false;
    }

    const color = payload.color?.trim() ?? null;

    try {
      await updateTagMutation.mutateAsync({
        tagId,
        payload: { name: trimmed, color, is_hidden: payload.is_hidden },
      });
      return true;
    } catch {
      return false;
    }
  };

  const handleDeleteTag = async (tagId: number) => {
    const confirmed = window.confirm('Opravdu chcete smazat tento štítek?');

    if (!confirmed) {
      return false;
    }

    try {
      await deleteTagMutation.mutateAsync(tagId);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <PageShell
      className={classes.page}
      title="Inventář"
      description="Kompletní přehled zásob, filtrů a exportu z jednoho místa."
    >
      <SimpleGrid
        cols={{ base: 1, sm: 2, md: 3, lg: 4, xl: 6 }}
        spacing="md"
        className={classes.metricsGrid}
      >
        <Card withBorder className={classes.metricCard} padding="md">
          <Text className={classes.metricLabel}>Produkty</Text>
          <Text className={classes.metricValue}>{overview?.total_products ?? 0}</Text>
        </Card>
        <Card withBorder className={classes.metricCard} padding="md">
          <Text className={classes.metricLabel}>Varianty</Text>
          <Text className={classes.metricValue}>{overview?.total_variants ?? 0}</Text>
        </Card>
        <Card withBorder className={classes.metricCard} padding="md">
          <Text className={classes.metricLabel}>Skladem</Text>
          <Text className={classes.metricValue} data-tone="teal">
            {overview?.in_stock_variants ?? 0}
          </Text>
        </Card>
        <Card withBorder className={classes.metricCard} padding="md">
          <Text className={classes.metricLabel}>Vyprodáno</Text>
          <Text className={classes.metricValue} data-tone="red">
            {overview?.sold_out_variants ?? 0}
          </Text>
        </Card>
        <Card withBorder className={classes.metricCard} padding="md">
          <Text className={classes.metricLabel}>Nízká zásoba</Text>
          <Text className={classes.metricValue} data-tone="orange">
            {overview?.low_stock_variants ?? 0}
          </Text>
        </Card>
        <Card withBorder className={classes.metricCard} padding="md">
          <Text className={classes.metricLabel}>Neznámé zásoby</Text>
          <Text className={classes.metricValue} data-tone="gray">
            {overview?.unknown_stock_variants ?? 0}
          </Text>
        </Card>
      </SimpleGrid>

      <Group justify="flex-start" gap="sm" wrap="wrap">
        {!showOrdersPanel && (
          <Button
            variant="light"
            size="xs"
            radius="xl"
            leftSection={<IconUpload size={14} />}
            onClick={() => setShowOrdersPanel(true)}
          >
            Nahrát objednávku
          </Button>
        )}
        {showOrdersPanel && (
          <Button
            variant="subtle"
            size="xs"
            radius="xl"
            leftSection={<IconX size={14} />}
            onClick={() => setShowOrdersPanel(false)}
          >
            Skrýt objednávky
          </Button>
        )}
        {!showFiltersPanel && (
          <Button
            variant="light"
            size="xs"
            radius="xl"
            leftSection={<IconFilter size={14} />}
            onClick={() => setShowFiltersPanel(true)}
          >
            Rozšířená filtrace
          </Button>
        )}
        {showFiltersPanel && (
          <Button
            variant="subtle"
            size="xs"
            radius="xl"
            leftSection={<IconX size={14} />}
            onClick={() => setShowFiltersPanel(false)}
          >
            Skrýt filtry
          </Button>
        )}
      </Group>

      {showOrdersPanel && (
        <Card withBorder className={classes.sectionCard}>
          <div className={classes.sectionHeaderTitle}>
            <Title order={4}>Objednávky u dodavatelů</Title>
            <Text size="sm" className={classes.sectionSubtitle}>
              Nahraj Excel (kód varianty + počet kusů) a udrž přehled, co je právě na cestě.
            </Text>
          </div>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" className={classes.ordersGrid}>
          <form onSubmit={handleOrderUpload} className={classes.orderForm}>
            <Stack gap="sm">
              <div>
                <Text fw={600}>Nová objednávka</Text>
                <Text size="sm" className={classes.ordersHint}>
                  Vzor Pure 6.11.xlsx – první sloupec kód varianty, druhý počet kusů. Hlavička nevadí.
                </Text>
              </div>

              <div>
                <Group gap="xs" wrap="wrap">
                  <FileButton onChange={handleOrderFileChange} accept=".xlsx,.xls">
                    {(props) => (
                      <Button variant="light" leftSection={<IconUpload size={16} />} {...props}>
                        Vybrat Excel
                      </Button>
                    )}
                  </FileButton>
                  {orderFile && (
                    <Button
                      type="button"
                      variant="subtle"
                      color="gray"
                      size="compact-sm"
                      onClick={clearOrderFile}
                    >
                      Odebrat
                    </Button>
                  )}
                </Group>
                <Text size="sm" className={classes.orderFileInfo}>
                  {orderFileLabel || 'Zatím není vybraný žádný soubor (.xlsx nebo .xls).'}
                </Text>
              </div>

              <TextInput
                label="Datum objednávky"
                type="date"
                value={orderDate}
                onChange={(event) => setOrderDate(event.currentTarget.value)}
                required
              />

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <TextInput
                  label="Doručení do (dnů)"
                  type="number"
                  min={0}
                  placeholder="např. 14"
                  value={arrivalDaysInput}
                  onChange={(event) => setArrivalDaysInput(event.currentTarget.value)}
                />
                <TextInput
                  label="Odhadovaný termín doručení"
                  type="date"
                  value={expectedArrivalDate}
                  onChange={(event) => setExpectedArrivalDate(event.currentTarget.value)}
                />
              </SimpleGrid>
              <Text size="xs" className={classes.ordersHint}>
                Vyplň alespoň jeden údaj o doručení – počet dnů nebo konkrétní datum.
              </Text>

              <Group justify="space-between">
                <Text size="sm" className={classes.ordersHint}>
                  Po uložení se data propíší do sloupce „Objednáno“ u konkrétních variant.
                </Text>
                <Button type="submit" loading={createOrderMutation.isPending}>
                  Uložit objednávku
                </Button>
              </Group>
            </Stack>
          </form>

          <div className={classes.ordersList}>
            <div className={classes.ordersListHeader}>
              <div>
                <Text fw={600}>Nahrané soubory</Text>
                <Text size="sm" className={classes.ordersHint}>
                  Přehled všech Excelů včetně termínu doručení a celkového množství.
                </Text>
              </div>
              <Badge variant="light" color="gray">
                {orders.length.toLocaleString('cs-CZ')} souborů
              </Badge>
            </div>
            <div className={classes.ordersTableWrapper}>
              {ordersLoading ? (
                <Text size="sm" className={classes.ordersEmpty}>
                  Načítám seznam…
                </Text>
              ) : orders.length === 0 ? (
                <Text size="sm" className={classes.ordersEmpty}>
                  Zatím nejsou nahrané žádné Excel soubory.
                </Text>
              ) : (
                <ScrollArea h={260} offsetScrollbars>
                  <Table className={classes.ordersTable} highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Soubor</Table.Th>
                        <Table.Th>Objednáno</Table.Th>
                        <Table.Th>Odhad doručení</Table.Th>
                        <Table.Th>Nahráno</Table.Th>
                        <Table.Th w={60}>Akce</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {orders.map((order) => {
                        const orderedAtLabel = formatDateLabel(order.ordered_at) ?? '—';
                        const expectedLabel = formatDateLabel(order.expected_arrival_at);
                        const arrivalDaysLabel =
                          typeof order.arrival_days === 'number'
                            ? `+${order.arrival_days} dnů`
                            : null;
                        const createdLabel = formatDateTimeLabel(order.created_at) ?? '—';
                        const deleting = deletingOrderId === order.id && deleteOrderMutation.isPending;

                        return (
                          <Table.Tr key={order.id}>
                            <Table.Td>
                              <Text fw={600}>{order.original_filename}</Text>
                              <Group gap={6} align="center">
                                <Badge size="sm" variant="light" color="blue">
                                  {formatNumber(order.total_quantity, 0)} ks
                                </Badge>
                                <Text size="xs" c="dimmed">
                                  {order.variant_codes_count.toLocaleString('cs-CZ')} kódů
                                </Text>
                              </Group>
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm">{orderedAtLabel}</Text>
                            </Table.Td>
                            <Table.Td>
                              {expectedLabel ? (
                                <div className={classes.ordersArrivalCell}>
                                  <Badge size="sm" variant="light" color="teal">
                                    {expectedLabel}
                                  </Badge>
                                  {arrivalDaysLabel && (
                                    <Text size="xs" c="dimmed">
                                      {arrivalDaysLabel}
                                    </Text>
                                  )}
                                </div>
                              ) : arrivalDaysLabel ? (
                                <Text size="sm">{arrivalDaysLabel}</Text>
                              ) : (
                                <Text size="sm" c="dimmed">
                                  —
                                </Text>
                              )}
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm">{createdLabel}</Text>
                            </Table.Td>
                            <Table.Td>
                              <ActionIcon
                                variant="subtle"
                                color="red"
                                onClick={() => handleDeleteOrder(order.id)}
                                aria-label="Smazat soubor"
                                disabled={deleting}
                              >
                                {deleting ? <Loader size="xs" /> : <IconTrash size={16} />}
                              </ActionIcon>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              )}
            </div>
          </div>
        </SimpleGrid>
      </Card>
      )}

      {showFiltersPanel && (
      <Card withBorder className={classes.sectionCard}>
        <div className={classes.sectionHeader}>
          <div className={classes.sectionHeaderTitle}>
            <Title order={4}>Varianty</Title>
            <Text size="sm" className={classes.sectionSubtitle}>
              Spravuj přehled zásob, filtruj a exportuj podle potřeby.
            </Text>
          </div>
          <Select
            label="Stav skladu"
            data={statusOptions}
            value={status}
            onChange={(value) => {
              const normalized = normalizeStatusParam(value);
              setStatus(normalized);
              clearSelection();
              setPage(1);
              commitSearchParams((params) => {
                if (normalized === 'all') {
                  params.delete('stock_status');
                } else {
                  params.set('stock_status', normalized);
                }
                params.delete('page');
              });
            }}
          />
        </div>

        <div className={classes.filterSections}>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="sm">
            <TextInput
              label="Hledat"
              placeholder="Kód, SKU, EAN..."
              value={search}
              onChange={(event) =>
                handleTextFilterChange('search', event.currentTarget.value, setSearch)
              }
            />
            <TextInput
              label="Název varianty"
              value={variantName}
              onChange={(event) =>
                handleTextFilterChange('variant', event.currentTarget.value, setVariantName)
              }
            />
            <TextInput
              label="Název produktu"
              value={productName}
              onChange={(event) =>
                handleTextFilterChange('product_name', event.currentTarget.value, setProductName)
              }
            />
            <TextInput
              label="Kód varianty"
              value={code}
              onChange={(event) =>
                handleTextFilterChange('code', event.currentTarget.value, setCode)
              }
            />
            <TextInput
              label="SKU"
              value={sku}
              onChange={(event) =>
                handleTextFilterChange('sku', event.currentTarget.value, setSku)
              }
            />
            <TextInput
              label="EAN"
              value={ean}
              onChange={(event) =>
                handleTextFilterChange('ean', event.currentTarget.value, setEan)
              }
            />
            <TextInput
              label="Produkt"
              placeholder="GUID nebo SKU produktu"
              value={productIdentifier}
              onChange={(event) =>
                handleTextFilterChange('product', event.currentTarget.value, setProductIdentifier)
              }
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="sm">
            <MultiSelect
              label="Varianty podle názvu"
              data={variantNameFilterOptions}
              value={variantNameFilter}
              searchable
              placeholder="Vyber varianty"
              nothingFoundMessage="Žádné varianty"
              clearable
              onChange={(value) =>
                handleArrayFilterChange('variant_name', value, setVariantNameFilter)
              }
            />
            <MultiSelect
              label="Značky"
              data={brandOptions}
              value={brand}
              searchable
              placeholder="Vyber značky"
              nothingFoundMessage="Žádné značky"
              onChange={(value) => handleArrayFilterChange('brand', value, setBrand)}
            />
            <MultiSelect
              label="Dodavatelé"
              data={supplierOptions}
              value={supplier}
              searchable
              placeholder="Vyber dodavatele"
              nothingFoundMessage="Žádní dodavatelé"
              onChange={(value) => handleArrayFilterChange('supplier', value, setSupplier)}
            />
            <MultiSelect
              label="Shopy"
              data={shopOptions}
              value={shopFilter}
              searchable
              placeholder="Všechny shopy"
              nothingFoundMessage="Žádné shopy"
              clearable
              onChange={(value) => handleArrayFilterChange('shop_id', value, setShopFilter)}
            />
            <MultiSelect
              label="Výchozí kategorie"
              data={defaultCategoryOptions}
              value={categoryFilter}
              searchable
              placeholder="Vyber kategorie"
              nothingFoundMessage="Žádné kategorie"
              clearable
              onChange={(value) =>
                handleArrayFilterChange('default_category', value, setCategoryFilter)
              }
            />
            <MultiSelect
              label="Štítky"
              data={tagFilterOptions}
              value={tagFilter}
              searchable
              placeholder="Vyber štítky"
              nothingFoundMessage="Žádné štítky"
              clearable
              onChange={(value) => handleArrayFilterChange('tag_id', value, setTagFilter)}
            />
            <MultiSelect
              label="Štítky Shoptet"
              data={flagOptions}
              value={flagFilter}
              searchable
              placeholder="Vyber štítky"
              nothingFoundMessage="Žádné štítky"
              clearable
              onChange={(value) => handleArrayFilterChange('flag', value, setFlagFilter)}
            />
            <MultiSelect
              label="Roční období"
              data={seasonalityOptions}
              value={seasonalityFilter}
              searchable
              placeholder="Vyber období"
              nothingFoundMessage="Žádná období"
              clearable
              onChange={(value) =>
                handleArrayFilterChange('seasonality', value, setSeasonalityFilter)
              }
            />
            <MultiSelect
              label="AI doporučení"
              data={aiRecommendationFilterOptions}
              value={aiOrderRecommendations}
              searchable
              placeholder="Vyber doporučení"
              nothingFoundMessage="Žádná doporučení"
              clearable
              onChange={(value) =>
                handleArrayFilterChange('ai_order_recommendation', value, (next) =>
                  setAiOrderRecommendations(sanitizeAiRecommendations(next))
                )
              }
            />
          </SimpleGrid>
        </div>
      </Card>
      )}

      <Card withBorder className={classes.tableCard}>
        <Stack gap="sm">
          <Stack gap="xs">
            <Group justify="space-between" align="center" wrap="wrap" className={classes.tableHeader}>
              <div className={classes.headerTitle}>
                <Text fw={700} size="lg" c="var(--app-text-primary)">
                  Přehled seznamu
                </Text>
                <Text size="sm" c="var(--app-text-secondary)">
                  Seznam variant podle aktuálních filtrů.
                </Text>
              </div>
              <div className={classes.pageSizeControl}>
                <Select
                  size="xs"
                  radius="xl"
                  variant="light"
                  styles={{
                    root: { height: 36 },
                    input: {
                      height: 36,
                      paddingInline: '12px',
                      paddingBlock: '12px',
                      fontWeight: 600,
                      fontSize: '0.95rem',
                    },
                    section: { marginRight: 6 },
                  }}
                  value={String(pageSize)}
                  onChange={handlePageSizeChange}
                  data={PAGE_SIZE_OPTIONS}
                  w={120}
                  rightSectionWidth={28}
                  aria-label="Počet na stránku"
                />
              </div>
            </Group>

            <Group gap="xs" wrap="wrap" align="center" className={classes.countsRow}>
              <Badge color="blue" variant="light" size="xs" radius="xl">
                Vybrané: {selectedCount.toLocaleString('cs-CZ')}
              </Badge>
              <Badge color="gray" variant="light" size="xs" radius="xl">
                Filtrované: {totalCount.toLocaleString('cs-CZ')}
              </Badge>
              <Badge color="gray" variant="light" size="xs" radius="xl">
                Zobrazeno: {displayedCount.toLocaleString('cs-CZ')}
              </Badge>
              <Badge color="gray" variant="light" size="xs" radius="xl">
                Celkem: {totalCount.toLocaleString('cs-CZ')}
              </Badge>
              <Badge color="gray" variant="light" size="xs" radius="xl">
                Na stránce: {pageSize.toLocaleString('cs-CZ')}
              </Badge>
            </Group>

            <Group justify="space-between" gap="sm" wrap="wrap" align="center" className={classes.actionBar}>
              <Group gap="xs" wrap="wrap" align="center" className={classes.actionButtons}>
                {selectedCount > 0 && (
                  <Button
                    variant="filled"
                    size="xs"
                    radius="xl"
                    leftSection={<IconTag size={14} />}
                    onClick={() => setBulkAssignOpened(true)}
                  >
                    Přiřadit štítky
                  </Button>
                )}
                <Button
                  variant="light"
                  size="xs"
                  radius="xl"
                  leftSection={<IconTags size={14} />}
                  onClick={() => setTagManagerOpened(true)}
                >
                  Správa štítků
                </Button>
                <Button
                  variant="light"
                  size="xs"
                  radius="xl"
                  leftSection={<IconSparkles size={14} />}
                  onClick={handleBulkForecast}
                  disabled={selectedCount === 0}
                  loading={forecastBulkMutation.isPending}
                >
                  Vytvořit AI doporučení
                </Button>
                {selectedCount > 0 && (
                  <>
                    <Button
                      variant={showSelectedOnly ? 'filled' : 'light'}
                      size="xs"
                      radius="xl"
                      leftSection={<IconListSearch size={14} />}
                      onClick={() => {
                        if (showSelectedOnly) {
                          setShowSelectedOnly(false);
                        } else if (selectedIds.size > 0) {
                          setShowSelectedOnly(true);
                          setPage(1);
                        }
                      }}
                    >
                      {showSelectedOnly ? 'Zobrazit všechny' : 'Zobrazit vybrané'}
                    </Button>
                    <Button
                      variant="subtle"
                      size="xs"
                      radius="xl"
                      leftSection={<IconX size={14} />}
                      onClick={clearSelection}
                    >
                      Odznačit vše
                    </Button>
                  </>
                )}
              </Group>

              {showSelectedOnly && selectedCount > 0 && (
                <Text size="sm" fw={600} c="var(--app-text-secondary)" className={classes.selectedNotice}>
                  Zobrazeny pouze označené
                </Text>
              )}

              <Group gap="xs" align="center" wrap="wrap" className={classes.toolbarActions}>
                <TableToolbar
                  columns={Object.entries(columnLabels).map(([key, label]) => ({ key, label }))}
                  columnVisibility={columnVisibility}
                  onToggleColumn={(key, checked) => {
                    if (key === 'stock' && !checked) return;
                    handleColumnVisibilityChange(key as string, checked);
                  }}
                  buttonSize="xs"
                  radius="xl"
                />
                <TableExportAction
                  totalCount={totalCount}
                  selectedCount={selectedCount}
                  onExport={handleExport}
                  label="Export"
                  size="xs"
                  radius="xl"
                  variant="light"
                />
              </Group>
            </Group>
          </Stack>
        </Stack>

        <div
          ref={tableViewportRef}
          style={{
            height: tableViewportHeight,
            maxHeight: '72vh',
            minHeight: 320,
            overflowY: 'auto',
            overflowX: 'auto',
          }}
        >
          <div style={{ minWidth: Math.max(1200, totalTableWidth) }}>
            <Table
              highlightOnHover
              verticalSpacing="sm"
              withRowBorders={false}
              className={tableClasses.table}
              style={{ width: totalTableWidth }}
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th className={tableClasses.selectionHeader}>
                    <Checkbox
                      aria-label="Vybrat všechny varianty na stránce"
                      checked={tableRows.length > 0 && allVisibleSelected}
                      indeterminate={!allVisibleSelected && someVisibleSelected}
                      onChange={(event) => handleSelectAllVisible(event.currentTarget.checked)}
                      size="sm"
                      radius="sm"
                    />
                  </Table.Th>
                  {headerColumns.map((column) => {
                    const width = COLUMN_WIDTH_KEYS.includes(column.key as ResizableColumnKey)
                      ? getColumnWidth(column.key as ResizableColumnKey)
                      : undefined;

                    const sortable = Boolean(column.sortable);

                    return (
                      <DataTableHeaderCell
                        key={column.key}
                        column={column}
                        sortState={headerSortState}
                        onToggleSort={
                          sortable
                            ? (col) => handleHeaderSort(col as SortableColumn)
                            : undefined
                        }
                        width={width}
                      />
                    );
                  })}
                </Table.Tr>
              </Table.Thead>
      {isLoading && (
        <Table.Tbody>
          <Table.Tr>
            <Table.Td colSpan={visibleColumnCount}>Načítám…</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      )}

      {!isLoading && tableRows.length === 0 && (
        <Table.Tbody>
          <Table.Tr>
            <Table.Td colSpan={visibleColumnCount}>Žádné varianty neodpovídají filtrům.</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      )}

      {!isLoading && tableRows.length > 0 && (
        <Table.Tbody
          className={tableClasses.body}
          style={{
            height: totalVirtualHeight,
          }}
        >
      {virtualRows.map((virtualRow) => {
        const variant = tableRows[virtualRow.index];
                const statusKey = (variant.stock_status ?? 'unknown') as InventoryVariant['stock_status'];
                const statusDefinition = statusMeta[statusKey];
                const stockValue = toNumber(variant.stock);
                const minStockValue = toNumber(variant.min_stock_supply);
                const priceValue = toNumber(variant.price);
                const purchasePriceValue = toNumber(variant.purchase_price);
                const lifetimeRevenue = toNumber(variant.lifetime_revenue);
                const last30Quantity = toNumber(variant.last_30_quantity);
                const averageDailySales = toNumber(variant.average_daily_sales);
                const stockRunway = toNumber(variant.stock_runway_days);
                const orderedQuantity = toNumber(variant.ordered_quantity);
                const stockWithOrders =
                  (stockValue ?? 0) + (orderedQuantity ?? 0);
                const orderedRunwayExtension =
                  averageDailySales && averageDailySales > 0 && orderedQuantity
                    ? orderedQuantity / averageDailySales
                    : null;
                const stockRunwayWithOrders =
                  averageDailySales && averageDailySales > 0
                    ? stockWithOrders / averageDailySales
                    : null;
                const runwayDelta =
                  stockRunway !== null && stockRunwayWithOrders !== null
                    ? stockRunwayWithOrders - stockRunway
                    : orderedRunwayExtension;
                const runwayDeltaLabel =
                  runwayDelta && runwayDelta > 0 ? formatNumber(runwayDelta, 1) : null;
                const defaultCategory = resolveDefaultCategory(variant);
                const seasonalityLabels = resolveSeasonalityLabels(variant);
                const orderedArrivalLabel = formatDateLabel(variant.ordered_expected_arrival_at);
                const hasOrderedQuantity = orderedQuantity !== null && orderedQuantity > 0;

                const stockLabel = formatNumber(stockValue ?? null, 2);
                const orderedStockLabel = hasOrderedQuantity
                  ? formatNumber(orderedQuantity, 2)
                  : null;
                const minStockLabel = formatNumber(minStockValue ?? null, 2);
                const stockRunwayLabel =
                  stockRunway !== null ? formatNumber(stockRunway, 1) : null;
                const aiOrderRecommendation = variant.ai_order_recommendation ?? null;
                const aiDeadlineDays = variant.ai_reorder_deadline_days ?? null;
                const aiProductHealth = variant.ai_product_health ?? null;
                const aiOrderLabel = aiOrderRecommendation
                  ? aiOrderRecommendationLabels[aiOrderRecommendation]
                  : null;
                const aiOrderColor = aiOrderRecommendation
                  ? aiOrderRecommendationColors[aiOrderRecommendation]
                  : 'gray';
                const aiDeadlineLabel = formatAiDeadlineLabel(aiDeadlineDays);
                const aiHealthLabel = aiProductHealth
                  ? aiProductHealthLabels[aiProductHealth]
                  : null;
                const aiHealthColor = aiProductHealth
                  ? aiProductHealthColors[aiProductHealth]
                  : 'gray';
                const aiSeasonalitySummary = variant.ai_seasonality_summary ?? null;
                const aiLastForecastLabel = variant.ai_last_forecast_at
                  ? new Date(variant.ai_last_forecast_at).toLocaleString('cs-CZ')
                  : null;
                const aiProductHealthReason = variant.ai_product_health_reason ?? null;

                return (
                  <Table.Tr
                    key={variant.id}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className={tableClasses.virtualRow}
                    style={{
                      position: 'absolute',
                      top: virtualRow.start,
                      left: 0,
                      right: 0,
                      height: virtualRow.size,
                      cursor: 'pointer',
                    }}
                    onClick={() => navigate(`/inventory/variants/${variant.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(`/inventory/variants/${variant.id}`);
                      }
                    }}
                    tabIndex={0}
                  >
                    <Table.Td
                      className={tableClasses.selectionCell}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <Checkbox
                        aria-label={`Vybrat variantu ${variant.code}`}
                        checked={selectedIds.has(variant.id)}
                        size="sm"
                        radius="sm"
                        onChange={(event) => {
                          const nativeEvent = event.nativeEvent as
                            | MouseEvent
                            | PointerEvent
                            | KeyboardEvent
                            | TouchEvent;
                        handleSelectVariant(variant, event.currentTarget.checked, {
                          shiftKey: Boolean(nativeEvent.shiftKey),
                        });
                      }}
                      />
                    </Table.Td>
                    <Table.Td className={tableClasses.cell} style={getColumnStyle('code')}>
                      <Text fw={600}>{variant.code}</Text>
                      {variant.product?.external_guid &&
                        renderTruncatedText(variant.product.external_guid, 'xs')}
                    </Table.Td>
                    {columnVisibility.variant && (
                      <Table.Td className={tableClasses.cell} style={getColumnStyle('variant')}>
                        <Text fw={500}>{resolveVariantName(variant)}</Text>
                        {variant.unit &&
                          renderTruncatedText(`Jednotka: ${variant.unit}`, 'xs')}
                      </Table.Td>
                    )}
                    {columnVisibility.product && (
                      <Table.Td className={tableClasses.cell} style={getColumnStyle('product')}>
                        <Text fw={500}>{resolveProductName(variant)}</Text>
                        {variant.product?.sku &&
                          renderTruncatedText(`SKU produktu: ${variant.product.sku}`, 'xs')}
                      </Table.Td>
                    )}
                    {columnVisibility.default_category_name && (
                      <Table.Td
                        className={tableClasses.cell}
                        style={getColumnStyle('default_category_name')}
                      >
                        {defaultCategory ?? '—'}
                      </Table.Td>
                    )}
                    {columnVisibility.seasonality_labels && (
                      <Table.Td
                        className={tableClasses.cell}
                        style={getColumnStyle('seasonality_labels')}
                      >
                        {seasonalityLabels.length === 0 ? (
                          '—'
                        ) : (
                          <Group gap={4} wrap="wrap">
                            {seasonalityLabels.map((label) => (
                              <Badge key={label} variant="light" color="gray">
                                {label}
                              </Badge>
                            ))}
                          </Group>
                        )}
                      </Table.Td>
                    )}
                    {columnVisibility.brand && (
                      <Table.Td className={tableClasses.cell} style={getColumnStyle('brand')}>
                        {renderTruncatedText(resolveBrand(variant) ?? '—')}
                      </Table.Td>
                    )}
                    {columnVisibility.supplier && (
                      <Table.Td className={tableClasses.cell} style={getColumnStyle('supplier')}>
                        {renderTruncatedText(resolveSupplier(variant) ?? '—')}
                      </Table.Td>
                    )}
                    {columnVisibility.product_flags && (
                      <Table.Td className={tableClasses.cell} style={getColumnStyle('product_flags')}>
                        <VariantFlagsCell flags={variant.product_flags ?? []} />
                      </Table.Td>
                    )}
                    {columnVisibility.tags && (
                      <Table.Td
                        className={tableClasses.cell}
                        style={getColumnStyle('tags')}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <VariantTagsCell
                          assignedTags={variant.tags ?? []}
                          allTags={sortedTags}
                          onAssign={(tagIds) => handleAssignTags(variant.id, tagIds)}
                          isSaving={assigningVariantId === variant.id && syncVariantTagsMutation.isPending}
                        />
                      </Table.Td>
                    )}
                    {columnVisibility.sku && (
                      <Table.Td className={tableClasses.cell} style={getColumnStyle('sku')}>
                        {variant.sku ?? '—'}
                      </Table.Td>
                    )}
                    {columnVisibility.ean && (
                      <Table.Td className={tableClasses.cell} style={getColumnStyle('ean')}>
                        {variant.ean ?? '—'}
                      </Table.Td>
                    )}
                    <Table.Td className={tableClasses.cell} style={getColumnStyle('status')}>
                      <Badge color={statusDefinition.color}>{statusDefinition.label}</Badge>
                    </Table.Td>
                    {columnVisibility.ai_insight && (
                      <Table.Td className={tableClasses.cell} style={getColumnStyle('ai_insight')}>
                        <Group gap={6} wrap="wrap" className={classes.aiCell}>
                          {aiOrderLabel ? (
                            <Tooltip
                              withinPortal
                              multiline
                              label={[
                                aiDeadlineLabel ? `Objednat do: ${aiDeadlineLabel}` : null,
                                aiProductHealthReason,
                                aiSeasonalitySummary,
                                aiLastForecastLabel,
                              ]
                                .filter(Boolean)
                                .join('\n')}
                            >
                              <Badge color={aiOrderColor}>{aiOrderLabel}</Badge>
                            </Tooltip>
                          ) : (
                            <Badge variant="light" color="gray">
                              Bez doporučení
                            </Badge>
                          )}
                          {aiHealthLabel && (
                            <Tooltip withinPortal label={`Poptávka: ${aiHealthLabel}`}>
                              <Badge color={aiHealthColor} variant="light">
                                {aiHealthLabel}
                              </Badge>
                            </Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                    )}
                    {columnVisibility.stock && (
                      <Table.Td className={tableClasses.cell} style={getColumnStyle('stock')}>
                        <Stack gap={2} align="flex-start">
                          <Text fw={500}>
                            {stockLabel}
                            {orderedStockLabel ? ` (+ ${orderedStockLabel})` : ''}
                          </Text>
                          {variant.unit && (
                            <Text size="xs" c="var(--app-text-tertiary)">
                              {variant.unit}
                            </Text>
                          )}
                        </Stack>
                      </Table.Td>
                    )}
                    {columnVisibility.ordered && (
                      <Table.Td className={tableClasses.cell} style={getColumnStyle('ordered')}>
                        {hasOrderedQuantity ? (
                          <div className={classes.orderedCell}>
                            <Text fw={600}>{formatNumber(orderedQuantity, 0)} ks</Text>
                            {orderedArrivalLabel ? (
                              <Badge size="sm" variant="light" color="teal">
                                Dorazí {orderedArrivalLabel}
                              </Badge>
                            ) : (
                              <Text size="xs" c="var(--app-text-tertiary)">
                                Bez potvrzeného data
                              </Text>
                            )}
                          </div>
                        ) : (
                          <Text size="sm" c="var(--app-text-tertiary)">
                            —
                          </Text>
                        )}
                      </Table.Td>
                    )}
                    {columnVisibility.min_stock_supply && (
                      <Table.Td className={tableClasses.cell} style={getColumnStyle('min_stock_supply')}>
                        {minStockLabel}
                      </Table.Td>
                    )}
                    {columnVisibility.price && (
                      <Table.Td className={tableClasses.cell} style={getColumnStyle('price')}>
                        {formatPrice(priceValue, resolveVariantCurrency(variant))}
                      </Table.Td>
                    )}
                    {columnVisibility.purchase_price && (
                      <Table.Td className={tableClasses.cell} style={getColumnStyle('purchase_price')}>
                        {formatPrice(purchasePriceValue, resolveVariantCurrency(variant))}
                      </Table.Td>
                    )}
                    {columnVisibility.lifetime_revenue && (
                      <Table.Td className={tableClasses.cell} style={getColumnStyle('lifetime_revenue')}>
                        {formatPrice(lifetimeRevenue, resolveVariantCurrency(variant))}
                      </Table.Td>
                    )}
                    {columnVisibility.last_30_quantity && (
                      <Table.Td className={tableClasses.cell} style={getColumnStyle('last_30_quantity')}>
                        {last30Quantity !== null ? `${formatNumber(last30Quantity, 0)} ks` : '—'}
                      </Table.Td>
                    )}
                    {columnVisibility.average_daily_sales && (
                      <Table.Td className={tableClasses.cell} style={getColumnStyle('average_daily_sales')}>
                        {averageDailySales && averageDailySales > 0
                          ? `${averageDailySales.toFixed(2)} ks/den`
                          : '—'}
                      </Table.Td>
                    )}
                    {columnVisibility.stock_runway_days && (
                      <Table.Td className={tableClasses.cell} style={getColumnStyle('stock_runway_days')}>
                        <Stack gap={2} align="flex-start">
                          {renderTruncatedText(
                            stockRunwayLabel ? `${stockRunwayLabel} dnů` : '—'
                          ) || (
                            <Text fw={500} className={classes.truncate}>
                              —
                            </Text>
                          )}
                          {runwayDeltaLabel &&
                            renderTruncatedText(`(+ ${runwayDeltaLabel} dnů s objednaným množstvím)`, 'xs')}
                        </Stack>
                      </Table.Td>
                    )}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
            )}
          </Table>
          </div>
        </div>

        {!showSelectedOnly && (
          <div className={classes.paginationRow}>
            <Pagination value={page} onChange={handlePageChange} total={data?.last_page ?? 1} />
          </div>
        )}
      </Card>

      <TagManagerModal
        opened={tagManagerOpened}
        tags={sortedTags}
        onClose={() => setTagManagerOpened(false)}
        onCreate={handleCreateTagFromModal}
        onUpdate={handleUpdateTag}
        onDelete={handleDeleteTag}
        creating={creatingTag}
        updatingTagId={updatingTagId}
        deletingTagId={deletingTagId}
      />

      <BulkAssignTagsModal
        opened={bulkAssignOpened}
        tags={sortedTags}
        selectionCount={selectedCount}
        loading={bulkAssignLoading}
        onClose={() => {
          if (!bulkAssignLoading) {
            setBulkAssignOpened(false);
          }
        }}
        onConfirm={handleBulkAssignToSelection}
      />
    </PageShell>
  );
};
