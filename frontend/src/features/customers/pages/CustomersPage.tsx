import {
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Pagination,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconEye, IconFilter, IconPlus, IconSettings, IconStarFilled, IconTag, IconX } from '@tabler/icons-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type CSSProperties,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useCustomers } from '../hooks/useCustomers';
import { useShops } from '../../shoptet/hooks/useShops';
import {
  fetchCustomers,
  fetchCustomerTags,
  fetchCustomerManualTags,
  fetchCustomerStats,
  updateCustomer,
  createCustomerTag,
  updateCustomerTag,
  deleteCustomerTag,
  type CustomerTag,
  type CustomerStats,
  type CustomerManualTagOption,
} from '../../../api/customers';
import { useUserPreference } from '../../../hooks/useUserPreference';
import { SectionPageShell } from '../../../components/layout/SectionPageShell';
import { SectionCard } from '../../../components/ui/SectionCard';
import tableClasses from '../../../components/table/DataTable.module.css';
import { DataTableHeaderCell, type HeaderColumn } from '../../../components/table/DataTableHeaderCell';
import { sortByDescriptors, updateSortDescriptors, type SortDescriptor } from '../../../components/table/sorting';
import { TableToolbar } from '../../../components/table/TableToolbar';
import { ColumnSummaryPopover } from '../../../components/table/ColumnSummaryPopover';
import { TableExportAction } from '../../../components/table/TableExportAction';
import type { Customer } from '../../../api/customers';
import { shopProviderOptions } from '../../../constants/shopProviders';
import { ShopProviderBadge } from '../../../components/shop/ShopProviderBadge';
import { TagManagerModal, type TagDefinition } from '../../../components/tags/TagManagerModal';

type SortColumn =
  | 'name'
  | 'email'
  | 'shop'
  | 'orders'
  | 'total_spent'
  | 'average_order_value'
  | 'registered_at'
  | 'last_order_at';

const SORT_COLUMNS: SortColumn[] = [
  'name',
  'email',
  'shop',
  'orders',
  'total_spent',
  'average_order_value',
  'registered_at',
  'last_order_at',
];

type ColumnKey =
  | 'email'
  | 'phone'
  | 'customer_group'
  | 'price_list'
  | 'shop'
  | 'orders_count'
  | 'total_spent'
  | 'average_order_value'
  | 'registered_at'
  | 'last_order_at';

const columnLabels: Record<ColumnKey, string> = {
  email: 'E-mail',
  phone: 'Telefon',
  customer_group: 'Štítky',
  price_list: 'Ceník',
  shop: 'Shop',
  orders_count: 'Objednávky',
  total_spent: 'CLV',
  average_order_value: 'AOV',
  registered_at: 'Registrace',
  last_order_at: 'Poslední objednávka',
};

const DEFAULT_COLUMN_VISIBILITY: Record<ColumnKey, boolean> = {
  email: true,
  phone: true,
  customer_group: true,
  price_list: false,
  shop: true,
  orders_count: true,
  total_spent: true,
  average_order_value: false,
  registered_at: true,
  last_order_at: false,
};

const CUSTOMER_COLUMN_KEYS: ColumnKey[] = [
  'email',
  'phone',
  'customer_group',
  'price_list',
  'shop',
  'orders_count',
  'total_spent',
  'average_order_value',
  'registered_at',
  'last_order_at',
];

const visibilityEqual = (
  left: Record<ColumnKey, boolean>,
  right: Record<ColumnKey, boolean>
) => CUSTOMER_COLUMN_KEYS.every((key) => left[key] === right[key]);

const normalizeColumnVisibility = (
  value: Record<string, boolean> | undefined
): Record<ColumnKey, boolean> => {
  const next: Record<ColumnKey, boolean> = { ...DEFAULT_COLUMN_VISIBILITY };

  if (value) {
    CUSTOMER_COLUMN_KEYS.forEach((key) => {
      if (typeof value[key] === 'boolean') {
        next[key] = value[key];
      }
    });
  }

  return next;
};

const normalizeText = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const uniqueStringArray = (input: unknown): string[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const sanitized = input
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry !== '');

  return Array.from(new Set(sanitized));
};

type CustomersListPreference = {
  page?: number;
  search?: string;
  shop_ids?: string[];
  orders_min?: number | null;
  orders_max?: number | null;
  clv_min?: number | null;
  clv_max?: number | null;
  last_order_from?: string | null;
  last_order_to?: string | null;
  exclude_without_orders?: boolean;
  only_without_orders?: boolean;
  tags?: string[];
  tag_mode?: 'any' | 'all';
  sort_by?: SortColumn;
  sort_dir?: 'asc' | 'desc';
  columns?: Record<ColumnKey, boolean>;
  multi_sort?: SortDescriptor<SortColumn>[];
  providers?: string[];
};

const exportTypeOptions = [
  { value: 'registered', label: 'Registrovaní' },
  { value: 'unregistered', label: 'Neregistrovaní' },
  { value: 'all', label: 'Všichni' },
];

type CustomersColumn =
  | 'name'
  | 'email'
  | 'phone'
  | 'customer_group'
  | 'price_list'
  | 'shop'
  | 'orders'
  | 'total_spent'
  | 'average_order_value'
  | 'registered_at'
  | 'last_order_at';

const CUSTOMER_COLUMN_SIZE_CONFIG: Array<{ key: CustomersColumn; minWidth: number; defaultWidth: number }> = [
  { key: 'name', minWidth: 240, defaultWidth: 280 },
  { key: 'email', minWidth: 220, defaultWidth: 260 },
  { key: 'phone', minWidth: 160, defaultWidth: 180 },
  { key: 'customer_group', minWidth: 160, defaultWidth: 180 },
  { key: 'price_list', minWidth: 140, defaultWidth: 160 },
  { key: 'shop', minWidth: 220, defaultWidth: 260 },
  { key: 'orders', minWidth: 170, defaultWidth: 200 },
  { key: 'total_spent', minWidth: 180, defaultWidth: 210 },
  { key: 'average_order_value', minWidth: 180, defaultWidth: 210 },
  { key: 'registered_at', minWidth: 180, defaultWidth: 200 },
  { key: 'last_order_at', minWidth: 180, defaultWidth: 200 },
];

const VIRTUAL_ROW_HEIGHT = 72;

const sanitizeSortDescriptors = (
  value: unknown,
  fallback: SortDescriptor<SortColumn>
): SortDescriptor<SortColumn>[] => {
  if (!Array.isArray(value)) {
    return [fallback];
  }

  const sanitized = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const column = (entry as { column?: unknown }).column;
      const direction = (entry as { direction?: unknown }).direction;

      if (!SORT_COLUMNS.includes(column as SortColumn)) {
        return null;
      }

      if (direction !== 'asc' && direction !== 'desc') {
        return null;
      }

      return { column: column as SortColumn, direction } satisfies SortDescriptor<SortColumn>;
    })
    .filter((entry): entry is SortDescriptor<SortColumn> => entry !== null);

  if (!sanitized.length) {
    return [fallback];
  }

  return sanitized;
};

const customerSortAccessors: Record<SortColumn, (customer: Customer) => string | number | Date | null> = {
  name: (customer) => customer.full_name ?? '',
  email: (customer) => customer.email ?? '',
  shop: (customer) => customer.shop?.name ?? '',
  orders: (customer) => customer.completed_orders ?? customer.orders_count ?? 0,
  total_spent: (customer) => customer.total_spent_base ?? customer.total_spent ?? 0,
  average_order_value: (customer) =>
    customer.average_order_value_base ?? customer.average_order_value ?? 0,
  registered_at: (customer) => (customer.created_at_remote ? new Date(customer.created_at_remote) : null),
  last_order_at: (customer) => (customer.last_order_at ? new Date(customer.last_order_at) : null),
};

const DEFAULT_CUSTOMER_SORT: SortDescriptor<SortColumn> = {
  column: 'last_order_at',
  direction: 'desc',
};

const FALLBACK_NAME_SORT: SortDescriptor<SortColumn> = {
  column: 'name',
  direction: 'asc',
};

const columnKeyToSortColumn: Partial<Record<ColumnKey, SortColumn>> = {
  email: 'email',
  shop: 'shop',
  orders_count: 'orders',
  total_spent: 'total_spent',
  average_order_value: 'average_order_value',
  registered_at: 'registered_at',
  last_order_at: 'last_order_at',
};

export const CustomersPage = () => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [ordersMin, setOrdersMin] = useState<number | null>(null);
  const [ordersMax, setOrdersMax] = useState<number | null>(null);
  const [debouncedOrdersMin] = useDebouncedValue(ordersMin, 300);
  const [debouncedOrdersMax] = useDebouncedValue(ordersMax, 300);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<'any' | 'all'>('any');
  const [clvMin, setClvMin] = useState<number | null>(null);
  const [clvMax, setClvMax] = useState<number | null>(null);
  const [debouncedClvMin] = useDebouncedValue(clvMin, 300);
  const [debouncedClvMax] = useDebouncedValue(clvMax, 300);
  const [lastOrderFrom, setLastOrderFrom] = useState<string | null>(null);
  const [lastOrderTo, setLastOrderTo] = useState<string | null>(null);
  const [debouncedLastOrderFrom] = useDebouncedValue(lastOrderFrom, 300);
  const [debouncedLastOrderTo] = useDebouncedValue(lastOrderTo, 300);
  const [excludeWithoutOrders, setExcludeWithoutOrders] = useState(false);
  const [onlyWithoutOrders, setOnlyWithoutOrders] = useState(false);
  const [sortState, setSortState] = useState<SortDescriptor<SortColumn>[]>([
    DEFAULT_CUSTOMER_SORT,
  ]);
  const [columnVisibility, setColumnVisibility] = useState<Record<ColumnKey, boolean>>(
    () => ({ ...DEFAULT_COLUMN_VISIBILITY })
  );
  const [columnFilters, setColumnFilters] = useState({
    name: '',
    email: '',
    phone: '',
    customer_group: '',
    price_list: '',
    shop: '',
    ordersMin: '',
    ordersMax: '',
    totalSpentMin: '',
    totalSpentMax: '',
    averageOrderValueMin: '',
    averageOrderValueMax: '',
    registeredFrom: '',
    registeredTo: '',
    lastOrderFrom: '',
    lastOrderTo: '',
  });
  const [debouncedColumnSearch] = useDebouncedValue(
    useMemo(() => {
      const candidate = [columnFilters.name, columnFilters.email, columnFilters.phone].find(
        (value) => value.trim() !== ''
      );
      return candidate?.trim() ?? '';
    }, [columnFilters.email, columnFilters.name, columnFilters.phone]),
    300
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedCustomersMap, setSelectedCustomersMap] = useState<Record<string, Customer>>({});
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [bulkTagsOpened, setBulkTagsOpened] = useState(false);
  const [bulkTagsLoading, setBulkTagsLoading] = useState(false);
  const [bulkSelectedTags, setBulkSelectedTags] = useState<string[]>([]);
  const [bulkNewTag, setBulkNewTag] = useState('');
  const [showTagBadges] = useState(true);
  const [exportType, setExportType] = useState<'registered' | 'unregistered' | 'all'>('registered');
  const [tagManagerOpened, setTagManagerOpened] = useState(false);
  const [tagCreateLoading, setTagCreateLoading] = useState(false);
  const [tagUpdateId, setTagUpdateId] = useState<number | null>(null);
  const [tagDeleteId, setTagDeleteId] = useState<number | null>(null);
  const showColumnFilters = false;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    value: storedPreference,
    isLoading: preferenceLoading,
    save: saveCustomersPreference,
  } = useUserPreference<CustomersListPreference>('customers.list');
  const [preferenceHydrated, setPreferenceHydrated] = useState(false);
  const preferenceSaveTimeoutRef = useRef<number | null>(null);
  const lastSavedPreferenceRef = useRef<string | null>(null);
  const [filtersManuallyOpened, setFiltersManuallyOpened] = useState(false);
  const shopsQuery = useShops({ per_page: 100, provider: 'all' });
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const manualTagsQuery = useQuery<CustomerTag[]>({
    queryKey: ['customers', 'manual-tags'],
    queryFn: fetchCustomerTags,
  });
  const uniqueManualTags = useMemo(() => {
    const seen = new Set<string>();
    const result: CustomerTag[] = [];

    (manualTagsQuery.data ?? []).forEach((tag) => {
      const key = tag.value.trim().toLowerCase();
      if (key === '' || seen.has(key)) {
        return;
      }

      seen.add(key);
      result.push(tag);
    });

    return result;
  }, [manualTagsQuery.data]);
  const tagDefinitions: TagDefinition[] = useMemo(
    () =>
      uniqueManualTags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        is_hidden: tag.is_hidden,
      })),
    [uniqueManualTags]
  );
  const tagColorMap = useMemo(() => {
    const map = new Map<string, string | null>();
    uniqueManualTags.forEach((tag) => {
      map.set(tag.label.toLowerCase(), tag.color);
    });
    return map;
  }, [uniqueManualTags]);
  const tagHiddenMap = useMemo(() => {
    const map = new Map<string, boolean>();
    uniqueManualTags.forEach((tag) => {
      map.set(tag.label.toLowerCase(), tag.is_hidden);
    });
    return map;
  }, [uniqueManualTags]);
  const manualTagOptions = useMemo(
    () =>
      uniqueManualTags.map((tag) => ({
        value: tag.value,
        label: tag.label,
      })),
    [uniqueManualTags]
  );
  const manualTagsInDataQuery = useQuery<CustomerManualTagOption[]>({
    queryKey: ['customers', 'manual-tags-in-data'],
    queryFn: fetchCustomerManualTags,
  });
  const unmanagedManualTags = useMemo(() => {
    const managed = new Set((manualTagsQuery.data ?? []).map((tag) => tag.label.toLowerCase()));
    return (manualTagsInDataQuery.data ?? [])
      .map((tag) => tag.label.trim())
      .filter((label) => label !== '')
      .filter((label) => !managed.has(label.toLowerCase()))
      .sort((a, b) => a.localeCompare(b, 'cs', { sensitivity: 'base' }));
  }, [manualTagsInDataQuery.data, manualTagsQuery.data]);
  const resolvedProviders = useMemo(
    () =>
      Array.from(
        new Set(
          selectedProviders
            .map((value) => value.trim().toLowerCase())
            .filter((value) => value !== '')
        )
      ).sort((a, b) => a.localeCompare(b)),
    [selectedProviders]
  );

  const primarySort = sortState[0] ?? DEFAULT_CUSTOMER_SORT;

  const hasActiveFilters = useMemo(() => {
    return (
      (search ?? '').trim() !== '' ||
      selectedShopIds.length > 0 ||
      selectedProviders.length > 0 ||
      selectedTags.length > 0 ||
      ordersMin !== null ||
      ordersMax !== null ||
      clvMin !== null ||
      clvMax !== null ||
      lastOrderFrom !== null ||
      lastOrderTo !== null ||
      onlyWithoutOrders ||
      excludeWithoutOrders
    );
  }, [
    clvMax,
    clvMin,
    excludeWithoutOrders,
    lastOrderFrom,
    lastOrderTo,
    onlyWithoutOrders,
    ordersMax,
    ordersMin,
    search,
    selectedProviders.length,
    selectedShopIds.length,
    selectedTags.length,
  ]);
  const filtersVisible = hasActiveFilters || filtersManuallyOpened;

  const params = useMemo(
    () => ({
      page,
      per_page: perPage,
      include_filters: 1,
      search: (debouncedColumnSearch || debouncedSearch || '').trim() || undefined,
      shop_id: selectedShopIds.length > 0 ? selectedShopIds : undefined,
      provider: resolvedProviders.length > 0 ? resolvedProviders : undefined,
      tag: selectedTags.length > 0 ? selectedTags : undefined,
      tag_mode: selectedTags.length > 0 ? tagMode : undefined,
      orders_min: debouncedOrdersMin ?? undefined,
      orders_max: debouncedOrdersMax ?? undefined,
      clv_min: debouncedClvMin ?? undefined,
      clv_max: debouncedClvMax ?? undefined,
      last_order_from: debouncedLastOrderFrom ?? undefined,
      last_order_to: debouncedLastOrderTo ?? undefined,
      exclude_without_orders:
        !onlyWithoutOrders && excludeWithoutOrders ? 1 : undefined,
      only_without_orders: onlyWithoutOrders ? 1 : undefined,
      sort_by: primarySort.column,
      sort_dir: primarySort.direction,
    }),
    [
      page,
      debouncedSearch,
      selectedShopIds,
      resolvedProviders,
      selectedTags,
      tagMode,
      debouncedOrdersMin,
      debouncedOrdersMax,
      debouncedClvMin,
      debouncedClvMax,
      debouncedLastOrderFrom,
      debouncedLastOrderTo,
      excludeWithoutOrders,
      onlyWithoutOrders,
      primarySort.column,
      primarySort.direction,
      debouncedColumnSearch,
      perPage,
    ]
  );

  const { data, isLoading, isFetching } = useCustomers(params);
  const baseCurrency = data?.base_currency ?? 'CZK';

  const shopOptions = useMemo(
    () =>
      (shopsQuery.data?.data ?? []).map((shop) => ({
        value: shop.id.toString(),
        label: shop.name,
      })),
    [shopsQuery.data]
  );
  const providerOptions = useMemo(() => {
    const shopProviders = (shopsQuery.data?.data ?? []).map((shop) => shop.provider ?? 'shoptet');
    const customerProviders = (data?.data ?? []).flatMap((customer) => customer.order_providers ?? []);

    return shopProviderOptions([...shopProviders, ...customerProviders]);
  }, [data?.data, shopsQuery.data]);
  const tagOptions = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ value: string; label: string }> = [];

    (data?.filters?.tags ?? []).forEach((tag) => {
      const rawValue = tag.value?.trim();
      if (!rawValue) {
        return;
      }
      const key = rawValue.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      result.push({ value: rawValue, label: tag.label });
    });

    return result;
  }, [data?.filters?.tags]);

  const buildPreferencePayload = useCallback((): CustomersListPreference => {
    return {
      page,
      search: normalizeText(search),
      shop_ids: selectedShopIds.length > 0 ? [...selectedShopIds] : [],
      providers: resolvedProviders.length > 0 ? [...resolvedProviders] : [],
      orders_min: ordersMin ?? null,
      orders_max: ordersMax ?? null,
      tags: selectedTags.length > 0 ? [...selectedTags] : [],
      tag_mode: tagMode,
      clv_min: clvMin ?? null,
      clv_max: clvMax ?? null,
      last_order_from: lastOrderFrom,
      last_order_to: lastOrderTo,
      exclude_without_orders: excludeWithoutOrders,
      only_without_orders: onlyWithoutOrders,
      sort_by: primarySort.column,
      sort_dir: primarySort.direction,
      multi_sort: sortState,
      columns: { ...columnVisibility },
    };
  }, [
    columnVisibility,
    ordersMax,
    ordersMin,
    selectedTags,
    tagMode,
    clvMin,
    clvMax,
    lastOrderFrom,
    lastOrderTo,
    excludeWithoutOrders,
    onlyWithoutOrders,
    page,
    primarySort.column,
    primarySort.direction,
    resolvedProviders,
    search,
    selectedShopIds,
    sortState,
  ]);

  const isDefaultCustomersPreference = useCallback((preference: CustomersListPreference) => {
    const columnsSnapshot = normalizeColumnVisibility(preference.columns as Record<string, boolean> | undefined);
    const shopsEmpty = !preference.shop_ids || preference.shop_ids.length === 0;
    const providersEmpty = !preference.providers || preference.providers.length === 0;
    const tagsEmpty = !preference.tags || preference.tags.length === 0;

    const multiSort = preference.multi_sort ?? [];
    const primary = multiSort[0];

    const primaryColumn = primary?.column ?? preference.sort_by ?? 'last_order_at';
    const primaryDirection = primary?.direction ?? preference.sort_dir ?? 'desc';

    return (
      (preference.page ?? 1) === 1 &&
      preference.search === undefined &&
      shopsEmpty &&
      providersEmpty &&
      tagsEmpty &&
      (preference.orders_min ?? null) === null &&
      (preference.orders_max ?? null) === null &&
      (preference.clv_min ?? null) === null &&
      (preference.clv_max ?? null) === null &&
      (preference.last_order_from ?? null) === null &&
      (preference.last_order_to ?? null) === null &&
      (preference.exclude_without_orders ?? false) === false &&
      (preference.only_without_orders ?? false) === false &&
      ((preference.tag_mode ?? 'any') === 'any') &&
      primaryColumn === 'last_order_at' &&
      primaryDirection === 'desc' &&
      (multiSort.length <= 1) &&
      visibilityEqual(columnsSnapshot, DEFAULT_COLUMN_VISIBILITY)
    );
  }, []);

  useEffect(() => {
    if (preferenceHydrated || preferenceLoading) {
      return;
    }

    const preference = storedPreference;

    if (!preference) {
      lastSavedPreferenceRef.current = '__default__';
      setPreferenceHydrated(true);
      return;
    }

    const nextPage = preference.page && preference.page > 0 ? Math.floor(preference.page) : 1;
    const nextSearch = typeof preference.search === 'string' ? preference.search : '';
    const nextShopIds = uniqueStringArray(preference.shop_ids ?? []);
    const nextProviders = uniqueStringArray(preference.providers ?? []).map((value) => value.toLowerCase());
    const nextOrdersMin = typeof preference.orders_min === 'number' ? preference.orders_min : null;
    const nextOrdersMax = typeof preference.orders_max === 'number' ? preference.orders_max : null;
    const nextTags = uniqueStringArray(preference.tags ?? []).map((value) => value.toLowerCase());
    const nextTagMode = preference.tag_mode === 'all' ? 'all' : 'any';
    const nextClvMin = typeof preference.clv_min === 'number' ? preference.clv_min : null;
    const nextClvMax = typeof preference.clv_max === 'number' ? preference.clv_max : null;
    const nextLastOrderFrom = typeof preference.last_order_from === 'string' ? preference.last_order_from : null;
    const nextLastOrderTo = typeof preference.last_order_to === 'string' ? preference.last_order_to : null;
    const prefExcludeWithoutOrders = Boolean(preference.exclude_without_orders);
    const prefOnlyWithoutOrders = Boolean(preference.only_without_orders);
    const fallbackSort: SortDescriptor<SortColumn> = SORT_COLUMNS.includes(preference.sort_by as SortColumn)
      ? {
          column: preference.sort_by as SortColumn,
          direction: preference.sort_dir === 'asc' ? 'asc' : 'desc',
        }
      : DEFAULT_CUSTOMER_SORT;
    const nextSortState = sanitizeSortDescriptors(
      preference.multi_sort ?? [fallbackSort],
      DEFAULT_CUSTOMER_SORT
    );
    const nextPrimarySort = nextSortState[0];
    const nextColumns = normalizeColumnVisibility(preference.columns as Record<string, boolean> | undefined);

    setPage(nextPage);
    setSearch(nextSearch);
    setSelectedShopIds(nextShopIds);
    setSelectedProviders(nextProviders);
    setOrdersMin(nextOrdersMin);
    setOrdersMax(nextOrdersMax);
    setSelectedTags(nextTags);
    setTagMode(nextTagMode);
    setClvMin(nextClvMin);
    setClvMax(nextClvMax);
    setLastOrderFrom(nextLastOrderFrom);
    setLastOrderTo(nextLastOrderTo);
    setOnlyWithoutOrders(prefOnlyWithoutOrders);
    setExcludeWithoutOrders(prefOnlyWithoutOrders ? false : prefExcludeWithoutOrders);
    setSortState(nextSortState);
    setColumnVisibility(nextColumns);

    const trackingPayload: CustomersListPreference = {
      page: nextPage,
      search: normalizeText(nextSearch),
      shop_ids: nextShopIds,
      providers: nextProviders,
      orders_min: nextOrdersMin,
      orders_max: nextOrdersMax,
      tags: nextTags,
      tag_mode: nextTagMode,
      clv_min: nextClvMin,
      clv_max: nextClvMax,
      last_order_from: nextLastOrderFrom,
      last_order_to: nextLastOrderTo,
      exclude_without_orders: prefOnlyWithoutOrders ? false : prefExcludeWithoutOrders,
      only_without_orders: prefOnlyWithoutOrders,
      sort_by: nextPrimarySort.column,
      sort_dir: nextPrimarySort.direction,
      multi_sort: nextSortState,
      columns: nextColumns,
    };

    lastSavedPreferenceRef.current = isDefaultCustomersPreference(trackingPayload)
      ? '__default__'
      : JSON.stringify(trackingPayload);

    setPreferenceHydrated(true);
  }, [
    isDefaultCustomersPreference,
    preferenceHydrated,
    preferenceLoading,
    storedPreference,
  ]);

  useEffect(() => {
    if (!preferenceHydrated) {
      return;
    }

    const payload = buildPreferencePayload();
    const defaultPreference = isDefaultCustomersPreference(payload);
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
        saveCustomersPreference(null);
      } else {
        saveCustomersPreference(payload);
      }
    }, 600);
  }, [
    buildPreferencePayload,
    isDefaultCustomersPreference,
    preferenceHydrated,
    saveCustomersPreference,
  ]);

  useEffect(() => {
    return () => {
      if (preferenceSaveTimeoutRef.current !== null) {
        window.clearTimeout(preferenceSaveTimeoutRef.current);
      }
    };
  }, []);

  const handleHeaderSort = useCallback(
    (column: SortColumn, multi: boolean) => {
      setSortState((current) => updateSortDescriptors(current, column, multi));
      setPage(1);
    },
    []
  );

  const columnSizes = useMemo<Record<CustomersColumn, number>>(
    () =>
      CUSTOMER_COLUMN_SIZE_CONFIG.reduce(
        (acc, config) => ({
          ...acc,
          [config.key]: config.defaultWidth ?? config.minWidth ?? 160,
        }),
        {} as Record<CustomersColumn, number>
      ),
    []
  );

  const headerColumns = useMemo<HeaderColumn<CustomersColumn, SortColumn>[]>(
    () => [
      {
        key: 'name',
        label: 'Jméno',
        sortable: true,
        filterActive: columnFilters.name.trim() !== '',
        filterContent: (
          <Stack gap="xs">
            <TextInput
              label="Obsahuje"
              size="xs"
              value={columnFilters.name}
              onChange={(event) =>
                setColumnFilters((current) => ({ ...current, name: event.currentTarget.value }))
              }
              placeholder="Jméno nebo příjmení"
            />
            <Button
              size="xs"
              variant="subtle"
              onClick={() => setColumnFilters((current) => ({ ...current, name: '' }))}
            >
              Vymazat
            </Button>
          </Stack>
        ),
      },
      {
        key: 'email',
        label: 'E-mail',
        sortable: true,
        filterActive: columnFilters.email.trim() !== '',
        filterContent: (
          <Stack gap="xs">
            <TextInput
              label="Obsahuje"
              size="xs"
              value={columnFilters.email}
              onChange={(event) =>
                setColumnFilters((current) => ({ ...current, email: event.currentTarget.value }))
              }
              placeholder="Např. @gmail.com"
            />
            <Button
              size="xs"
              variant="subtle"
              onClick={() => setColumnFilters((current) => ({ ...current, email: '' }))}
            >
              Vymazat
            </Button>
          </Stack>
        ),
      },
      {
        key: 'phone',
        label: 'Telefon',
        filterActive: columnFilters.phone.trim() !== '',
        filterContent: (
          <Stack gap="xs">
            <TextInput
              label="Obsahuje"
              size="xs"
              value={columnFilters.phone}
              onChange={(event) =>
                setColumnFilters((current) => ({ ...current, phone: event.currentTarget.value }))
              }
              placeholder="+420..."
            />
            <Button
              size="xs"
              variant="subtle"
              onClick={() => setColumnFilters((current) => ({ ...current, phone: '' }))}
            >
              Vymazat
            </Button>
          </Stack>
        ),
      },
      {
        key: 'customer_group',
        label: 'Skupina',
        filterActive: columnFilters.customer_group.trim() !== '',
        filterContent: (
          <Stack gap="xs">
            <TextInput
              label="Štítek obsahuje"
              size="xs"
              value={columnFilters.customer_group}
              onChange={(event) =>
                setColumnFilters((current) => ({ ...current, customer_group: event.currentTarget.value }))
              }
              placeholder="VIP, custom..."
            />
            <Button
              size="xs"
              variant="subtle"
              onClick={() => setColumnFilters((current) => ({ ...current, customer_group: '' }))}
            >
              Vymazat
            </Button>
          </Stack>
        ),
      },
      {
        key: 'price_list',
        label: 'Ceník',
        filterActive: columnFilters.price_list.trim() !== '',
        filterContent: (
          <Stack gap="xs">
            <TextInput
              label="Ceník obsahuje"
              size="xs"
              value={columnFilters.price_list}
              onChange={(event) =>
                setColumnFilters((current) => ({ ...current, price_list: event.currentTarget.value }))
              }
              placeholder="Retail, B2B..."
            />
            <Button
              size="xs"
              variant="subtle"
              onClick={() => setColumnFilters((current) => ({ ...current, price_list: '' }))}
            >
              Vymazat
            </Button>
          </Stack>
        ),
      },
      {
        key: 'shop',
        label: 'Shop',
        sortable: true,
        filterActive: columnFilters.shop.trim() !== '',
        filterContent: (
          <Stack gap="xs">
            <TextInput
              label="Název / doména"
              size="xs"
              value={columnFilters.shop}
              onChange={(event) =>
                setColumnFilters((current) => ({ ...current, shop: event.currentTarget.value }))
              }
              placeholder="shop, doména, provider"
            />
            <Button
              size="xs"
              variant="subtle"
              onClick={() => setColumnFilters((current) => ({ ...current, shop: '' }))}
            >
              Vymazat
            </Button>
          </Stack>
        ),
      },
      {
        key: 'orders',
        label: 'Objednávky',
        sortable: true,
        align: 'right',
        filterActive: Boolean(columnFilters.ordersMin || columnFilters.ordersMax),
        filterContent: (
          <Stack gap="xs">
            <Group gap="xs" grow>
              <TextInput
                label="Min"
                size="xs"
                type="number"
                value={columnFilters.ordersMin}
                onChange={(event) =>
                  setColumnFilters((current) => ({ ...current, ordersMin: event.currentTarget.value }))
                }
              />
              <TextInput
                label="Max"
                size="xs"
                type="number"
                value={columnFilters.ordersMax}
                onChange={(event) =>
                  setColumnFilters((current) => ({ ...current, ordersMax: event.currentTarget.value }))
                }
              />
            </Group>
            <Button
              size="xs"
              variant="subtle"
              onClick={() =>
                setColumnFilters((current) => ({ ...current, ordersMin: '', ordersMax: '' }))
              }
            >
              Vymazat
            </Button>
          </Stack>
        ),
      },
      {
        key: 'total_spent',
        label: `CLV (${baseCurrency})`,
        sortable: true,
        align: 'right',
        filterActive: Boolean(columnFilters.totalSpentMin || columnFilters.totalSpentMax),
        filterContent: (
          <Stack gap="xs">
            <Group gap="xs" grow>
              <TextInput
                label="Min"
                size="xs"
                type="number"
                value={columnFilters.totalSpentMin}
                onChange={(event) =>
                  setColumnFilters((current) => ({
                    ...current,
                    totalSpentMin: event.currentTarget.value,
                  }))
                }
              />
              <TextInput
                label="Max"
                size="xs"
                type="number"
                value={columnFilters.totalSpentMax}
                onChange={(event) =>
                  setColumnFilters((current) => ({
                    ...current,
                    totalSpentMax: event.currentTarget.value,
                  }))
                }
              />
            </Group>
            <Button
              size="xs"
              variant="subtle"
              onClick={() =>
                setColumnFilters((current) => ({
                  ...current,
                  totalSpentMin: '',
                  totalSpentMax: '',
                }))
              }
            >
              Vymazat
            </Button>
          </Stack>
        ),
      },
      {
        key: 'average_order_value',
        label: `AOV (${baseCurrency})`,
        sortable: true,
        align: 'right',
        filterActive: Boolean(columnFilters.averageOrderValueMin || columnFilters.averageOrderValueMax),
        filterContent: (
          <Stack gap="xs">
            <Group gap="xs" grow>
              <TextInput
                label="Min"
                size="xs"
                type="number"
                value={columnFilters.averageOrderValueMin}
                onChange={(event) =>
                  setColumnFilters((current) => ({
                    ...current,
                    averageOrderValueMin: event.currentTarget.value,
                  }))
                }
              />
              <TextInput
                label="Max"
                size="xs"
                type="number"
                value={columnFilters.averageOrderValueMax}
                onChange={(event) =>
                  setColumnFilters((current) => ({
                    ...current,
                    averageOrderValueMax: event.currentTarget.value,
                  }))
                }
              />
            </Group>
            <Button
              size="xs"
              variant="subtle"
              onClick={() =>
                setColumnFilters((current) => ({
                  ...current,
                  averageOrderValueMin: '',
                  averageOrderValueMax: '',
                }))
              }
            >
              Vymazat
            </Button>
          </Stack>
        ),
      },
      {
        key: 'registered_at',
        label: 'Registrace',
        sortable: true,
        filterActive: Boolean(columnFilters.registeredFrom || columnFilters.registeredTo),
        filterContent: (
          <Stack gap="xs">
            <Group gap="xs" grow>
              <TextInput
                label="Od"
                size="xs"
                type="date"
                value={columnFilters.registeredFrom}
                onChange={(event) =>
                  setColumnFilters((current) => ({
                    ...current,
                    registeredFrom: event.currentTarget.value,
                  }))
                }
              />
              <TextInput
                label="Do"
                size="xs"
                type="date"
                value={columnFilters.registeredTo}
                onChange={(event) =>
                  setColumnFilters((current) => ({
                    ...current,
                    registeredTo: event.currentTarget.value,
                  }))
                }
              />
            </Group>
            <Button
              size="xs"
              variant="subtle"
              onClick={() =>
                setColumnFilters((current) => ({
                  ...current,
                  registeredFrom: '',
                  registeredTo: '',
                }))
              }
            >
              Vymazat
            </Button>
          </Stack>
        ),
      },
      {
        key: 'last_order_at',
        label: 'Poslední objednávka',
        sortable: true,
        filterActive: Boolean(columnFilters.lastOrderFrom || columnFilters.lastOrderTo),
        filterContent: (
          <Stack gap="xs">
            <Group gap="xs" grow>
              <TextInput
                label="Od"
                size="xs"
                type="date"
                value={columnFilters.lastOrderFrom}
                onChange={(event) =>
                  setColumnFilters((current) => ({
                    ...current,
                    lastOrderFrom: event.currentTarget.value,
                  }))
                }
              />
              <TextInput
                label="Do"
                size="xs"
                type="date"
                value={columnFilters.lastOrderTo}
                onChange={(event) =>
                  setColumnFilters((current) => ({
                    ...current,
                    lastOrderTo: event.currentTarget.value,
                  }))
                }
              />
            </Group>
            <Button
              size="xs"
              variant="subtle"
              onClick={() =>
                setColumnFilters((current) => ({
                  ...current,
                  lastOrderFrom: '',
                  lastOrderTo: '',
                }))
              }
            >
              Vymazat
            </Button>
          </Stack>
        ),
      },
    ],
    [baseCurrency, columnFilters]
  );

  const customerMatchesColumnFilters = useCallback(
    (customer: Customer) => {
      const {
        name,
        email,
        phone,
        customer_group,
        price_list,
        shop,
        ordersMin,
        ordersMax,
        totalSpentMin,
        totalSpentMax,
        averageOrderValueMin,
        averageOrderValueMax,
        registeredFrom,
        registeredTo,
        lastOrderFrom,
        lastOrderTo,
      } = columnFilters;

      const matchesText = (source: string | null | undefined, query: string) => {
        if (!query.trim()) {
          return true;
        }
        return (source ?? '').toLowerCase().includes(query.trim().toLowerCase());
      };

      if (!matchesText(customer.full_name, name)) return false;
      if (!matchesText(customer.email, email)) return false;
      if (!matchesText(customer.phone, phone)) return false;

      if (customer_group.trim()) {
        const tagMatch = (customer.tag_badges ?? []).some((badge) =>
          badge.label.toLowerCase().includes(customer_group.trim().toLowerCase())
        );
        if (!tagMatch) {
          return false;
        }
      }

      if (!matchesText(customer.price_list, price_list)) return false;

      if (shop.trim()) {
        const shopQuery = shop.trim().toLowerCase();
        const shopName = customer.shop?.name?.toLowerCase() ?? '';
        const shopDomain = customer.shop?.domain?.toLowerCase() ?? '';
        const shopProvider = customer.shop_provider?.toLowerCase() ?? '';
        const orderProviders = (customer.order_providers ?? []).map((entry) => (entry ?? '').toLowerCase());
        const matches =
          shopName.includes(shopQuery) ||
          shopDomain.includes(shopQuery) ||
          shopProvider.includes(shopQuery) ||
          orderProviders.some((provider) => provider.includes(shopQuery));
        if (!matches) {
          return false;
        }
      }

      const numericValue = (value: string) => {
        if (value === undefined || value === null) {
          return null;
        }
        const trimmed = String(value).trim();
        if (trimmed === '') {
          return null;
        }
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const ordersValue = customer.completed_orders ?? customer.orders_count ?? 0;
      const ordersMinValue = numericValue(ordersMin);
      const ordersMaxValue = numericValue(ordersMax);
      if (ordersMinValue !== null && ordersValue < ordersMinValue) return false;
      if (ordersMaxValue !== null && ordersValue > ordersMaxValue) return false;

      const totalSpent = customer.total_spent_base ?? customer.total_spent ?? 0;
      const totalSpentMinValue = numericValue(totalSpentMin);
      const totalSpentMaxValue = numericValue(totalSpentMax);
      if (totalSpentMinValue !== null && totalSpent < totalSpentMinValue) return false;
      if (totalSpentMaxValue !== null && totalSpent > totalSpentMaxValue) return false;

      const aov = customer.average_order_value_base ?? customer.average_order_value ?? 0;
      const aovMinValue = numericValue(averageOrderValueMin);
      const aovMaxValue = numericValue(averageOrderValueMax);
      if (aovMinValue !== null && aov < aovMinValue) return false;
      if (aovMaxValue !== null && aov > aovMaxValue) return false;

      const parseDate = (value: string) => {
        if (!value || value.trim() === '') {
          return null;
        }
        const date = new Date(value);
        const timestamp = date.getTime();
        return Number.isNaN(timestamp) ? null : timestamp;
      };

      const registeredAt = customer.created_at_remote ? parseDate(customer.created_at_remote) : null;
      const registeredFromValue = registeredFrom ? parseDate(registeredFrom) : null;
      const registeredToValue = registeredTo ? parseDate(registeredTo) : null;
      if (registeredFromValue !== null && (registeredAt === null || registeredAt < registeredFromValue)) return false;
      if (registeredToValue !== null && (registeredAt === null || registeredAt > registeredToValue)) return false;

      const lastOrderAt = customer.last_order_at ? parseDate(customer.last_order_at) : null;
      const lastOrderFromValue = lastOrderFrom ? parseDate(lastOrderFrom) : null;
      const lastOrderToValue = lastOrderTo ? parseDate(lastOrderTo) : null;
      if (lastOrderFromValue !== null && (lastOrderAt === null || lastOrderAt < lastOrderFromValue)) return false;
      if (lastOrderToValue !== null && (lastOrderAt === null || lastOrderAt > lastOrderToValue)) return false;

      return true;
    },
    [columnFilters]
  );

  const sortedCustomers = useMemo(() => {
    const rows = (data?.data ?? []) as Customer[];
    return sortByDescriptors(rows, sortState, customerSortAccessors);
  }, [data?.data, sortState]);

  const filteredCustomers = useMemo(
    () => sortedCustomers.filter((customer) => customerMatchesColumnFilters(customer)),
    [customerMatchesColumnFilters, sortedCustomers]
  );

  const selectedCustomersSorted = useMemo(() => {
    const selectedList = Array.from(selectedIds)
      .map((id) => selectedCustomersMap[id])
      .filter((customer): customer is Customer => Boolean(customer));
    const filtered = selectedList.filter((customer) => customerMatchesColumnFilters(customer));
    return sortByDescriptors(filtered, sortState, customerSortAccessors);
  }, [customerMatchesColumnFilters, selectedCustomersMap, selectedIds, sortState]);

  const tableRows = showSelectedOnly ? selectedCustomersSorted : filteredCustomers;
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const tableViewportHeight = useMemo(() => {
    const target = tableRows.length * VIRTUAL_ROW_HEIGHT;
    return Math.min(720, Math.max(360, target || 360));
  }, [tableRows.length]);
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableViewportRef.current,
    estimateSize: () => VIRTUAL_ROW_HEIGHT,
    overscan: 8,
    measureElement: (element) => element?.getBoundingClientRect().height ?? VIRTUAL_ROW_HEIGHT,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalVirtualHeight = rowVirtualizer.getTotalSize();

  const setPrimarySortColumn = useCallback((column: SortColumn) => {
    setSortState((current) => {
      const existing = current.find((descriptor) => descriptor.column === column);
      const direction = existing?.direction ?? 'asc';
      const remaining = current.filter((descriptor) => descriptor.column !== column);
      return [{ column, direction }, ...remaining];
    });
    setPage(1);
  }, []);

  const setPrimarySortDirection = useCallback((direction: 'asc' | 'desc') => {
    setSortState((current) => {
      const primary = current[0] ?? DEFAULT_CUSTOMER_SORT;
      const updated = { column: primary.column, direction } as SortDescriptor<SortColumn>;
      return [updated, ...current.slice(1)];
    });
    setPage(1);
  }, []);

  const toggleRowSelection = useCallback((customer: Customer, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(customer.id);
      } else {
        next.delete(customer.id);
      }
      return next;
    });

    setSelectedCustomersMap((current) => {
      if (!checked) {
        const { [customer.id]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [customer.id]: customer };
    });
  }, []);

  const toggleSelectAllVisible = useCallback(
    (checked: boolean) => {
      const visibleIds = tableRows.map((customer) => customer.id);

      setSelectedIds((current) => {
        const next = new Set(current);
        visibleIds.forEach((id) => {
          if (checked) {
            next.add(id);
          } else {
            next.delete(id);
          }
        });
        return next;
      });

      setSelectedCustomersMap((current) => {
        if (!checked) {
          const remaining = Object.fromEntries(
            Object.entries(current).filter(([id]) => !visibleIds.includes(id))
          );
          return remaining;
        }

        const additions = Object.fromEntries(
          tableRows.map((customer) => [customer.id, customer] as [string, Customer])
        );
        return { ...current, ...additions };
      });
    },
    [tableRows]
  );

  const clearAllSelections = useCallback(() => {
    setSelectedIds(new Set());
    setSelectedCustomersMap({});
    setShowSelectedOnly(false);
  }, []);

  const navigateToCustomer = useCallback(
    (id: string) => {
      navigate(`/customers/${id}`);
    },
    [navigate]
  );

  type CustomerRowProps = {
    customer: Customer;
    columnVisibility: Record<ColumnKey, boolean>;
    showTagBadges: boolean;
    tagColorMap: Map<string, string | null>;
    tagHiddenMap: Map<string, boolean>;
    selectedIds: Set<string>;
    toggleRowSelection: (customer: Customer, checked: boolean) => void;
    formatNumber: (value: number | null | undefined, digits?: number) => string;
    formatCurrency: (value: number | null | undefined) => string;
    formatDate: (value: string | null | undefined) => string;
    navigateToCustomer: (id: string) => void;
    rowStyle?: CSSProperties;
    columnSizes: Record<CustomersColumn, number>;
    measureElement?: (element: HTMLElement | null) => void;
    rowIndex?: number;
  };

  const CustomerRow = memo(function CustomerRow({
    customer,
    columnVisibility,
    showTagBadges,
    tagColorMap,
    tagHiddenMap,
    selectedIds,
    toggleRowSelection,
    formatNumber,
    formatCurrency,
    formatDate,
    navigateToCustomer,
    rowStyle,
    columnSizes,
    measureElement,
    rowIndex,
  }: CustomerRowProps) {
    const providersToDisplay = useMemo(() => {
      const shop = customer.shop;
      return Array.from(
        new Set(
          [
            customer.shop_provider,
            ...(customer.order_providers ?? []),
            shop?.provider ?? null,
          ]
            .filter((value): value is string => typeof value === 'string' && value !== '')
            .map((value) => value.toLowerCase())
        )
      );
    }, [customer]);

    const shop = customer.shop;
    const localeLabel = shop?.locale ? shop.locale.toUpperCase() : null;

    return (
      <Table.Tr
        key={customer.id}
        onClick={() => navigateToCustomer(customer.id)}
        className={`${tableClasses.virtualRow} ${tableClasses.row}`}
        style={{ cursor: 'pointer', ...rowStyle }}
        data-row-id={customer.id}
        data-index={rowIndex}
        ref={measureElement}
      >
        <Table.Td
          onClick={(event) => event.stopPropagation()}
          className={`${tableClasses.selectionCell} ${tableClasses.cell}`}
        >
          <Checkbox
            size="sm"
            radius="sm"
            aria-label="Vybrat zákazníka"
            checked={selectedIds.has(customer.id)}
            onChange={(event) => {
              event.stopPropagation();
              toggleRowSelection(customer, event.currentTarget.checked);
            }}
          />
        </Table.Td>
        <Table.Td className={tableClasses.cell} style={{ width: columnSizes.name, minWidth: columnSizes.name }}>
          <Stack gap={2} align="flex-start">
            <Group gap={6}>
              <Text fw={600}>{customer.full_name ?? '—'}</Text>
              {customer.is_vip && (
                <Badge color="yellow" variant="filled" leftSection={<IconStarFilled size={12} />}>
                  VIP
                </Badge>
              )}
            </Group>
          </Stack>
        </Table.Td>
        {columnVisibility.email && (
          <Table.Td
            className={tableClasses.cell}
            style={{ width: columnSizes.email, minWidth: columnSizes.email }}
          >
            {customer.email ?? '—'}
          </Table.Td>
        )}
        {columnVisibility.phone && (
          <Table.Td
            className={tableClasses.cell}
            style={{ width: columnSizes.phone, minWidth: columnSizes.phone }}
          >
            {customer.phone ?? '—'}
          </Table.Td>
        )}
        {columnVisibility.customer_group && (
          <Table.Td
            onClick={(event) => event.stopPropagation()}
            className={tableClasses.cell}
            style={{ width: columnSizes.customer_group, minWidth: columnSizes.customer_group }}
          >
            <Stack gap={6}>
              {showTagBadges ? (
                customer.tag_badges && customer.tag_badges.length > 0 ? (
                  <Group gap={4} wrap="wrap">
                    {customer.tag_badges.map((badge) => {
                      const derivedColor =
                        badge.color ?? tagColorMap.get(badge.label.toLowerCase()) ?? null;
                      const colorValue = typeof derivedColor === 'string' ? derivedColor.trim() : '';
                      const hasCustomColor = colorValue.startsWith('#');
                      const isHidden = tagHiddenMap.get(badge.label.toLowerCase()) ?? false;

                      const badgeColor = hasCustomColor
                        ? 'gray'
                        : colorValue !== ''
                          ? colorValue
                          : badge.type === 'automatic'
                            ? 'blue'
                            : 'gray';

                      const leftSection = hasCustomColor ? (
                        <span
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: 9999,
                            backgroundColor: colorValue,
                          }}
                        />
                      ) : null;
                      return (
                        <Badge
                          key={`${customer.id}-${badge.key}`}
                          color={badgeColor}
                          leftSection={leftSection}
                          variant={
                            badge.type === 'automatic'
                              ? 'light'
                              : badge.type === 'standard'
                                ? 'filled'
                                : 'outline'
                          }
                          size="xs"
                          title={isHidden ? 'Schované položky' : undefined}
                          style={isHidden ? { opacity: 0.6 } : undefined}
                        >
                          {badge.label}
                        </Badge>
                      );
                    })}
                  </Group>
                ) : (
                  <Text size="sm" c="dimmed">
                    —
                  </Text>
                )
              ) : (
                <Text size="sm" c="dimmed">
                  Štítky skryté
                </Text>
              )}
            </Stack>
          </Table.Td>
        )}
        {columnVisibility.price_list && (
          <Table.Td
            className={tableClasses.cell}
            style={{ width: columnSizes.price_list, minWidth: columnSizes.price_list }}
          >
            {customer.price_list ? <Badge color="violet">{customer.price_list}</Badge> : '—'}
          </Table.Td>
        )}
        {columnVisibility.shop && (
          <Table.Td
            className={tableClasses.cell}
            style={{ width: columnSizes.shop, minWidth: columnSizes.shop }}
          >
            {shop ? (
              <Stack gap={2}>
                <Group gap={6} wrap="wrap">
                  <Text size="sm" fw={500} component="span">
                    {shop.name}
                  </Text>
                  <Group gap={4} wrap="wrap">
                    {providersToDisplay.map((provider) => (
                      <ShopProviderBadge key={provider} provider={provider} />
                    ))}
                  </Group>
                  {shop.is_master && (
                    <Badge size="xs" color="teal">
                      Master
                    </Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed" component="span">
                  {shop.domain}
                  {localeLabel ? ` · ${localeLabel}` : ''}
                </Text>
              </Stack>
            ) : providersToDisplay.length ? (
              <Group gap={4} wrap="wrap">
                {providersToDisplay.map((provider) => (
                  <ShopProviderBadge key={provider} provider={provider} />
                ))}
              </Group>
            ) : (
              '—'
            )}
          </Table.Td>
        )}
        {columnVisibility.orders_count && (
          <Table.Td
            className={tableClasses.cell}
            style={{ textAlign: 'right', width: columnSizes.orders, minWidth: columnSizes.orders }}
          >
            {(() => {
              const completed = customer.completed_orders ?? customer.orders_count ?? 0;
              const problem = customer.problem_orders ?? 0;

              return `${formatNumber(completed)} / ${formatNumber(problem)}`;
            })()}
          </Table.Td>
        )}
        {columnVisibility.total_spent && (
          <Table.Td
            className={tableClasses.cell}
            style={{ textAlign: 'right', width: columnSizes.total_spent, minWidth: columnSizes.total_spent }}
          >
            {formatCurrency(customer.total_spent_base ?? customer.total_spent ?? 0)}
          </Table.Td>
        )}
        {columnVisibility.average_order_value && (
          <Table.Td
            className={tableClasses.cell}
            style={{
              textAlign: 'right',
              width: columnSizes.average_order_value,
              minWidth: columnSizes.average_order_value,
            }}
          >
            {formatCurrency(
              customer.average_order_value_base ?? customer.average_order_value ?? 0
            )}
          </Table.Td>
        )}
        {columnVisibility.registered_at && (
          <Table.Td
            className={tableClasses.cell}
            style={{ width: columnSizes.registered_at, minWidth: columnSizes.registered_at }}
          >
            {formatDate(customer.created_at_remote ?? null)}
          </Table.Td>
        )}
        {columnVisibility.last_order_at && (
          <Table.Td
            className={tableClasses.cell}
            style={{ width: columnSizes.last_order_at, minWidth: columnSizes.last_order_at }}
          >
            {formatDate(customer.last_order_at ?? null)}
          </Table.Td>
        )}
      </Table.Tr>
    );
  });

  CustomerRow.displayName = 'CustomerRow';

  const handleBulkTagsConfirm = useCallback(async () => {
    if (selectedIds.size === 0) {
      notifications.show({ color: 'red', message: 'Vyber alespoň jednoho zákazníka.' });
      return;
    }
    const trimmed = bulkNewTag.trim();
    const tagsToAdd = Array.from(new Set([...bulkSelectedTags, ...(trimmed ? [trimmed] : [])]));
    if (tagsToAdd.length === 0) {
      notifications.show({ color: 'red', message: 'Vyber nebo přidej štítek.' });
      return;
    }

    try {
      setBulkTagsLoading(true);
      if (trimmed) {
        const managedExists = (manualTagsQuery.data ?? []).some(
          (tag) => tag.label.toLowerCase() === trimmed.toLowerCase()
        );
        if (!managedExists) {
          try {
            await createCustomerTag({ name: trimmed, color: null, is_hidden: false });
          } catch (error) {
            console.error(error);
          } finally {
            await manualTagsQuery.refetch();
            await manualTagsInDataQuery.refetch();
          }
        }
      }

      const ids = Array.from(selectedIds);
      for (const id of ids) {
        const existing = selectedCustomersMap[id]?.tags ?? [];
        const nextTags = Array.from(new Set([...existing, ...tagsToAdd]));
        await updateCustomer(id, { tags: nextTags });
        setSelectedCustomersMap((current) => ({
          ...current,
          [id]: current[id] ? { ...current[id], tags: nextTags } : current[id],
        }));
      }

      queryClient.invalidateQueries({ queryKey: ['customers'] });
      notifications.show({ color: 'green', message: 'Štítky byly přidány.' });
      setBulkTagsOpened(false);
      setBulkSelectedTags([]);
      setBulkNewTag('');
    } catch (error) {
      console.error(error);
      notifications.show({ color: 'red', message: 'Hromadné přiřazení štítků selhalo.' });
    } finally {
      setBulkTagsLoading(false);
    }
  }, [
    bulkNewTag,
    bulkSelectedTags,
    manualTagsInDataQuery,
    manualTagsQuery,
    queryClient,
    selectedCustomersMap,
    selectedIds,
  ]);

  const handleTagCreate = useCallback(
    async (payload: { name: string; color: string | null; is_hidden: boolean }) => {
      setTagCreateLoading(true);
      try {
        await createCustomerTag(payload);
        await manualTagsQuery.refetch();
        await manualTagsInDataQuery.refetch();
        notifications.show({ color: 'green', message: 'Štítek vytvořen.' });
        return true;
      } catch (error) {
        console.error(error);
        notifications.show({ color: 'red', message: 'Vytvoření štítku selhalo.' });
        return false;
      } finally {
        setTagCreateLoading(false);
      }
    },
    [manualTagsInDataQuery, manualTagsQuery]
  );

  const handleTagUpdate = useCallback(
    async (tagId: number, payload: { name: string; color: string | null; is_hidden: boolean }) => {
      setTagUpdateId(tagId);
      try {
        await updateCustomerTag(tagId, payload);
        await manualTagsQuery.refetch();
        await manualTagsInDataQuery.refetch();
        notifications.show({ color: 'green', message: 'Štítek aktualizován.' });
        return true;
      } catch (error) {
        console.error(error);
        notifications.show({ color: 'red', message: 'Aktualizace štítku selhala.' });
        return false;
      } finally {
        setTagUpdateId(null);
      }
    },
    [manualTagsInDataQuery, manualTagsQuery]
  );

  const handleTagDelete = useCallback(
    async (tagId: number) => {
      setTagDeleteId(tagId);
      try {
        await deleteCustomerTag(tagId);
        await manualTagsQuery.refetch();
        await manualTagsInDataQuery.refetch();
        queryClient.invalidateQueries({ queryKey: ['customers'] });
        notifications.show({ color: 'green', message: 'Štítek odstraněn.' });
        return true;
      } catch (error) {
        console.error(error);
        notifications.show({ color: 'red', message: 'Smazání štítku selhalo.' });
        return false;
      } finally {
        setTagDeleteId(null);
      }
    },
    [manualTagsInDataQuery, manualTagsQuery, queryClient]
  );

  const handleAdoptUnmanagedTag = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        await createCustomerTag({ name: trimmed, color: null, is_hidden: false });
      } catch (error) {
        console.error(error);
      } finally {
        await manualTagsQuery.refetch();
        await manualTagsInDataQuery.refetch();
      }
    },
    [manualTagsInDataQuery, manualTagsQuery]
  );

  const numberFormattersRef = useRef<Record<number, Intl.NumberFormat>>({});

  const getNumberFormatter = useCallback((digits = 0) => {
    if (!numberFormattersRef.current[digits]) {
      numberFormattersRef.current[digits] = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: digits });
    }
    return numberFormattersRef.current[digits];
  }, []);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('cs-CZ', {
        style: 'currency',
        currency: baseCurrency,
        maximumFractionDigits: 2,
      }),
    [baseCurrency]
  );

  const formatNumber = useCallback(
    (value: number | null | undefined, digits = 0) => {
      if (value === null || value === undefined) {
        return '—';
      }

      return getNumberFormatter(digits).format(value);
    },
    [getNumberFormatter]
  );

  const formatCurrency = useCallback(
    (value: number | null | undefined) => {
      if (value === null || value === undefined) {
        return '—';
      }

      return currencyFormatter.format(value);
    },
    [currencyFormatter]
  );

  const columnSums = useMemo(() => {
    const getOrders = (customer: Customer) => customer.completed_orders ?? customer.orders_count ?? 0;
    const getTotalSpent = (customer: Customer) => customer.total_spent_base ?? customer.total_spent ?? 0;
    const getAov = (customer: Customer) =>
      customer.average_order_value_base ?? customer.average_order_value ?? 0;

    const sum = (rows: Customer[], getter: (customer: Customer) => number) =>
      rows.reduce((acc, row) => acc + Number(getter(row) ?? 0), 0);

    return {
      filtered: {
        orders: sum(filteredCustomers, getOrders),
        total_spent: sum(filteredCustomers, getTotalSpent),
        average_order_value: sum(filteredCustomers, getAov),
      },
      selected: {
        orders: sum(selectedCustomersSorted, getOrders),
        total_spent: sum(selectedCustomersSorted, getTotalSpent),
        average_order_value: sum(selectedCustomersSorted, getAov),
      },
    };
  }, [selectedCustomersSorted, tableRows]);

  const renderSumAction = useCallback(
    (column: 'orders' | 'total_spent' | 'average_order_value') => {
      const labelMap = {
        orders: 'Objednávky',
        total_spent: `CLV (${baseCurrency})`,
        average_order_value: `AOV (${baseCurrency})`,
      } as const;

      const filteredValue = columnSums.filtered[column];
      const selectedValue = columnSums.selected[column];
      const format = column === 'orders' ? formatNumber : formatCurrency;
      const hasSelected = selectedCustomersSorted.length > 0;
      const filteredAverage =
        filteredCustomers.length > 0 ? filteredValue / filteredCustomers.length : undefined;
      const selectedAverage =
        hasSelected && selectedCustomersSorted.length > 0
          ? selectedValue / selectedCustomersSorted.length
          : undefined;

      return (
        <ColumnSummaryPopover
          label={labelMap[column]}
          values={{
            allSum: stats?.[column === 'orders' ? 'orders_sum' : column === 'total_spent' ? 'clv_sum' : 'aov_sum'],
            allAverage:
              stats?.[column === 'orders' ? 'orders_avg' : column === 'total_spent' ? 'clv_avg' : 'aov_avg'],
            filteredSum: filteredValue,
            filteredAverage,
            selectedSum: hasSelected ? selectedValue : undefined,
            selectedAverage,
          }}
          formatValue={format}
          loading={statsLoading}
          onOpen={async () => {
            if (stats || statsLoading) return;
            try {
              setStatsLoading(true);
              const statsParams = {
                search: (debouncedColumnSearch || debouncedSearch || '').trim() || undefined,
                shop_id: selectedShopIds.length > 0 ? selectedShopIds : undefined,
                provider: resolvedProviders.length > 0 ? resolvedProviders : undefined,
                tag: selectedTags.length > 0 ? selectedTags : undefined,
                tag_mode: selectedTags.length > 0 ? tagMode : undefined,
                orders_min: debouncedOrdersMin ?? undefined,
                orders_max: debouncedOrdersMax ?? undefined,
                clv_min: debouncedClvMin ?? undefined,
                clv_max: debouncedClvMax ?? undefined,
                last_order_from: debouncedLastOrderFrom ?? undefined,
                last_order_to: debouncedLastOrderTo ?? undefined,
                exclude_without_orders:
                  !onlyWithoutOrders && excludeWithoutOrders ? 1 : undefined,
                only_without_orders: onlyWithoutOrders ? 1 : undefined,
              };
              const fetched = await fetchCustomerStats(statsParams);
              setStats(fetched);
            } finally {
              setStatsLoading(false);
            }
          }}
        />
      );
    },
    [
      baseCurrency,
      columnSums,
      filteredCustomers.length,
      formatCurrency,
      formatNumber,
      selectedCustomersSorted.length,
      stats,
      statsLoading,
      selectedShopIds,
      resolvedProviders,
      selectedTags,
      tagMode,
      debouncedOrdersMin,
      debouncedOrdersMax,
      debouncedClvMin,
      debouncedClvMax,
      debouncedLastOrderFrom,
      debouncedLastOrderTo,
      excludeWithoutOrders,
      onlyWithoutOrders,
      debouncedColumnSearch,
      debouncedSearch,
    ]
  );

  const headerColumnsWithActions = useMemo(
    () =>
      headerColumns.map((column) => {
        if (
          column.key === 'orders' ||
          column.key === 'total_spent' ||
          column.key === 'average_order_value'
        ) {
          return {
            ...column,
            actions: renderSumAction(column.key),
          };
        }
        return column;
      }),
    [headerColumns, renderSumAction]
  );

  const visibleHeaderColumns = useMemo(
    () =>
      headerColumnsWithActions.filter((column) => {
        switch (column.key) {
          case 'email':
            return columnVisibility.email;
          case 'phone':
            return columnVisibility.phone;
          case 'customer_group':
            return columnVisibility.customer_group;
          case 'price_list':
            return columnVisibility.price_list;
          case 'shop':
            return columnVisibility.shop;
          case 'orders':
            return columnVisibility.orders_count;
          case 'total_spent':
            return columnVisibility.total_spent;
          case 'average_order_value':
            return columnVisibility.average_order_value;
          case 'registered_at':
            return columnVisibility.registered_at;
          case 'last_order_at':
            return columnVisibility.last_order_at;
          default:
            return true;
        }
      }),
    [columnVisibility, headerColumnsWithActions]
  );

  const columnCount = visibleHeaderColumns.length + 1;
  const allVisibleSelected =
    tableRows.length > 0 && tableRows.every((customer) => selectedIds.has(customer.id));
  const someVisibleSelected = tableRows.some((customer) => selectedIds.has(customer.id));
  const totalSelected = selectedIds.size;
  // selectedOnPage lze dopočítat z tableRows v případě potřeby
  const totalFiltered = typeof data?.total === 'number' ? data.total : filteredCustomers.length;
  const totalRecords = typeof data?.total === 'number' ? data.total : totalFiltered;

  const formatDate = useCallback((value: string | null | undefined) => {
    if (!value) {
      return '—';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString('cs-CZ');
  }, []);
  const resolveColumnValue = (key: CustomersColumn, customer: Customer) => {
    switch (key) {
      case 'name':
        return customer.full_name ?? '—';
      case 'email':
        return customer.email ?? '—';
      case 'phone':
        return customer.phone ?? '—';
      case 'customer_group':
        return (customer.tag_badges ?? []).map((b) => b.label).join(', ') || '—';
      case 'price_list':
        return customer.price_list ?? '—';
      case 'shop':
        return customer.shop?.name ?? '—';
      case 'orders':
        return String(customer.completed_orders ?? customer.orders_count ?? 0);
      case 'total_spent':
        return formatCurrency(customer.total_spent_base ?? customer.total_spent ?? 0);
      case 'average_order_value':
        return formatCurrency(
          customer.average_order_value_base ?? customer.average_order_value ?? 0
        );
      case 'registered_at':
        return formatDate(customer.created_at_remote ?? null);
      case 'last_order_at':
        return formatDate(customer.last_order_at ?? null);
      default:
        return '';
    }
  };

  const fetchAllCustomersForExport = useCallback(
    async (columnsMode: 'all' | 'visible') => {
      const columnsToUse = columnsMode === 'all' ? headerColumns : visibleHeaderColumns;
      const exportPerPage = 100;
      const collected: Customer[] = [];
      let exportPage = 1;
      let expectedTotal = typeof data?.total === 'number' ? data.total : null;

      while (true) {
        const exportParams = {
          ...params,
          include_filters: 0,
          page: exportPage,
          per_page: exportPerPage,
        };

        const pageData = await fetchCustomers(exportParams);
        const rows = pageData.data ?? [];
        if (rows.length === 0) {
          break;
        }

        collected.push(...rows);
        expectedTotal = typeof pageData.total === 'number' ? pageData.total : expectedTotal;

        if (expectedTotal !== null && collected.length >= expectedTotal) {
          break;
        }

        exportPage += 1;
        if (exportPage > 5000) {
          break;
        }
      }

      return { rows: collected, columnsToUse };
    },
    [data?.total, headerColumns, params, visibleHeaderColumns]
  );

  const performLocalExport = useCallback(
    async (scope: 'all' | 'selected', columnsMode: 'all' | 'visible') => {
      if (scope === 'all') {
        const { rows, columnsToUse } = await fetchAllCustomersForExport(columnsMode);
        if (rows.length === 0) {
          notifications.show({ color: 'red', message: 'Není co exportovat.' });
          return;
        }
        const header = columnsToUse.map((col) =>
          typeof col.label === 'string' ? col.label : String(col.key)
        );
        const csvRows = rows.map((customer) =>
          columnsToUse
            .map((col) => {
              const value = resolveColumnValue(col.key, customer);
              const sanitized = value === null || value === undefined ? '' : String(value);
              return `"${sanitized.replace(/"/g, '""')}"`;
            })
            .join(',')
        );

        const csv = [header.join(','), ...csvRows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `customers_export_all_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        notifications.show({ color: 'green', message: 'Export dokončen.' });
        return;
      }

      const rows = selectedCustomersSorted;
      if (rows.length === 0) {
        notifications.show({ color: 'red', message: 'Není co exportovat.' });
        return;
      }

      const columnsToUse = columnsMode === 'all' ? headerColumns : visibleHeaderColumns;
      const header = columnsToUse.map((col) =>
        typeof col.label === 'string' ? col.label : String(col.key)
      );
      const csvRows = rows.map((customer) =>
        columnsToUse
          .map((col) => {
            const value = resolveColumnValue(col.key, customer);
            const sanitized = value === null || value === undefined ? '' : String(value);
            return `"${sanitized.replace(/"/g, '""')}"`;
          })
          .join(',')
      );

      const csv = [header.join(','), ...csvRows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `customers_export_${scope}_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      notifications.show({ color: 'green', message: 'Export dokončen.' });
    },
    [fetchAllCustomersForExport, headerColumns, resolveColumnValue, selectedCustomersSorted, visibleHeaderColumns]
  );

  const handleOrdersMinChange = (value: string | number) => {
    if (value === '' || value === null) {
      setOrdersMin(null);
    } else {
      setOrdersMin(Number(value));
    }
    setPage(1);
  };

  const handleOrdersMaxChange = (value: string | number) => {
    if (value === '' || value === null) {
      setOrdersMax(null);
    } else {
      setOrdersMax(Number(value));
    }
    setPage(1);
  };

  const handleClvMinChange = (value: string | number) => {
    if (value === '' || value === null) {
      setClvMin(null);
    } else {
      setClvMin(Number(value));
    }
    setPage(1);
  };

  const handleClvMaxChange = (value: string | number) => {
    if (value === '' || value === null) {
      setClvMax(null);
    } else {
      setClvMax(Number(value));
    }
    setPage(1);
  };

  const handleLastOrderFromChange = (value: string) => {
    const sanitized = value && value.trim() !== '' ? value : null;
    setLastOrderFrom(sanitized);
    if (sanitized) {
      setOnlyWithoutOrders(false);
      setExcludeWithoutOrders(false);
    }
    setPage(1);
  };

  const handleLastOrderToChange = (value: string) => {
    const sanitized = value && value.trim() !== '' ? value : null;
    setLastOrderTo(sanitized);
    if (sanitized) {
      setOnlyWithoutOrders(false);
    }
    setPage(1);
  };

  return (
    <SectionPageShell section="customers">
      <Stack gap="lg">
        {!filtersVisible && (
          <Group justify="flex-start">
            <Button
              variant="light"
              size="xs"
              radius="xl"
              leftSection={<IconFilter size={14} />}
              onClick={() => setFiltersManuallyOpened(true)}
            >
              Rozšířená filtrace
            </Button>
          </Group>
        )}

        {filtersVisible ? (
          <SectionCard
            title="Filtry"
            subtitle="Vyhledej a omez seznam zákazníků."
            actions={
              !hasActiveFilters && filtersManuallyOpened ? (
                <Button
                  variant="subtle"
                  size="xs"
                  radius="xl"
                  leftSection={<IconX size={14} />}
                  onClick={() => setFiltersManuallyOpened(false)}
                >
                  Skrýt
                </Button>
              ) : null
            }
          >
            <Stack gap="md">
              <Group gap="md" align="flex-end" wrap="wrap">
                <TextInput
                  label="Vyhledávání"
                  placeholder="Jméno, e-mail nebo telefon"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.currentTarget.value);
                    setPage(1);
                  }}
                  w={260}
                />
                <MultiSelect
                  label="Shop"
                  placeholder={shopsQuery.isLoading ? 'Načítám...' : 'Vyber shop'}
                  data={shopOptions}
                  value={selectedShopIds}
                  onChange={(value) => {
                    setSelectedShopIds(value);
                    setPage(1);
                  }}
                  searchable
                  clearable
                  w={220}
                />
                <MultiSelect
                  label="Zdroj"
                  placeholder={shopsQuery.isLoading ? 'Načítám...' : 'Všechny zdroje'}
                  data={providerOptions}
                  value={selectedProviders}
                  onChange={(value) => {
                    const normalized = Array.from(
                      new Set(value.map((entry) => entry.toLowerCase()))
                    );
                    setSelectedProviders(normalized);
                    setPage(1);
                  }}
                  searchable
                  clearable
                  nothingFoundMessage="Nenalezeno"
                  comboboxProps={{ withinPortal: true }}
                  w={220}
                />
                <MultiSelect
                  label="Štítky"
                  placeholder={tagOptions.length === 0 ? 'Žádné štítky' : 'Vyber štítky'}
                  data={tagOptions}
                  value={selectedTags}
                  onChange={(value) => {
                    setSelectedTags(value);
                    if (value.length === 0) {
                      setTagMode('any');
                    }
                    setPage(1);
                  }}
                  searchable
                  clearable
                  nothingFoundMessage="Nenalezeno"
                  comboboxProps={{ withinPortal: true }}
                  w={240}
                />
                <Select
                  label="Logika štítků"
                  data={[
                    { value: 'any', label: 'Stačí jeden' },
                    { value: 'all', label: 'Všechny' },
                  ]}
                  value={tagMode}
                  onChange={(value) => {
                    setTagMode(value === 'all' ? 'all' : 'any');
                    setPage(1);
                  }}
                  disabled={selectedTags.length === 0}
                  w={160}
                />
                <NumberInput
                  label="Min. objednávek"
                  value={ordersMin ?? undefined}
                  onChange={handleOrdersMinChange}
                  min={0}
                  w={160}
                />
                <NumberInput
                  label="Max. objednávek"
                  value={ordersMax ?? undefined}
                  onChange={handleOrdersMaxChange}
                  min={0}
                  w={160}
                />
                <NumberInput
                  label={`Min. CLV (${baseCurrency})`}
                  value={clvMin ?? undefined}
                  onChange={handleClvMinChange}
                  min={0}
                  w={200}
                />
                <NumberInput
                  label={`Max. CLV (${baseCurrency})`}
                  value={clvMax ?? undefined}
                  onChange={handleClvMaxChange}
                  min={0}
                  w={200}
                />
                <TextInput
                  label="Poslední objednávka od"
                  type="date"
                  value={lastOrderFrom ?? ''}
                  onChange={(event) => handleLastOrderFromChange(event.currentTarget.value)}
                  w={200}
                />
                <TextInput
                  label="Poslední objednávka do"
                  type="date"
                  value={lastOrderTo ?? ''}
                  onChange={(event) => handleLastOrderToChange(event.currentTarget.value)}
                  w={200}
                />
                <Checkbox
                  label="Ignorovat bez objednávek"
                  checked={!onlyWithoutOrders && excludeWithoutOrders}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setExcludeWithoutOrders(checked);
                    if (checked) {
                      setOnlyWithoutOrders(false);
                      setLastOrderFrom(null);
                      setLastOrderTo(null);
                    }
                    setPage(1);
                  }}
                />
                <Checkbox
                  label="Pouze bez objednávek"
                  checked={onlyWithoutOrders}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setOnlyWithoutOrders(checked);
                    if (checked) {
                      setExcludeWithoutOrders(false);
                      setLastOrderFrom(null);
                      setLastOrderTo(null);
                    }
                    setPage(1);
                  }}
                />
                <Select
                  label="Řadit podle"
                  value={primarySort.column}
                  onChange={(value) => {
                    const column = (value ?? primarySort.column) as SortColumn;
                    setPrimarySortColumn(column);
                  }}
                  data={[
                    { value: 'name', label: 'Jméno' },
                    { value: 'email', label: 'E-mail' },
                    { value: 'shop', label: 'Shop' },
                    { value: 'orders', label: 'Počet objednávek' },
                    { value: 'total_spent', label: 'CLV' },
                    { value: 'average_order_value', label: 'AOV' },
                    { value: 'registered_at', label: 'Registrace' },
                    { value: 'last_order_at', label: 'Poslední objednávka' },
                  ]}
                  w={200}
                />
                <Select
                  label="Typ exportu"
                  value={exportType}
                  onChange={(value) =>
                    setExportType(
                      value === null ? 'registered' : (value as 'registered' | 'unregistered' | 'all')
                    )
                  }
                  data={exportTypeOptions}
                  w={200}
                />
                <SegmentedControl
                  value={primarySort.direction}
                  onChange={(value) => {
                    setPrimarySortDirection(value as 'asc' | 'desc');
                  }}
                  data={[
                    { label: 'Vzestupně', value: 'asc' },
                    { label: 'Sestupně', value: 'desc' },
                  ]}
                />
              </Group>
            </Stack>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Zákazníci"
          subtitle="Seznam zákazníků podle aktuálních filtrů."
          actions={
            <Select
              size="xs"
              w={110}
              radius="xl"
              variant="light"
              styles={{
                root: {
                  height: 36,
                },
                input: {
                  height: 36,
                  paddingInline: '12px',
                  fontWeight: 600,
                },
                section: {
                  marginRight: 6,
                },
              }}
              value={String(perPage)}
              onChange={(value) => {
                const next = Number(value ?? 25);
                setPerPage(next > 0 ? next : 25);
                setPage(1);
              }}
              data={[
                { value: '10', label: '10 / str.' },
                { value: '25', label: '25 / str.' },
                { value: '50', label: '50 / str.' },
                { value: '100', label: '100 / str.' },
              ]}
              rightSectionWidth={26}
              aria-label="Počet na stránku"
            />
          }
        >
          <Stack gap="sm">
	          <Group justify="space-between" align="center" gap="sm" wrap="wrap">
	            <Group gap="xs" wrap="wrap" align="center">
	              <Badge color="blue" variant="light" size="xs" radius="xl">
	                Vybrané: {totalSelected.toLocaleString('cs-CZ')}
	              </Badge>
	              <Badge color="gray" variant="light" size="xs" radius="xl">
	                Filtrované: {totalFiltered.toLocaleString('cs-CZ')}
	              </Badge>
	              {typeof totalRecords === 'number' && (
	                <Badge color="gray" variant="light" size="xs" radius="xl">
	                  Celkem: {totalRecords.toLocaleString('cs-CZ')}
	                </Badge>
	              )}
	              <Badge color="gray" variant="light" size="xs" radius="xl">
	                Na stránce: {tableRows.length.toLocaleString('cs-CZ')}
	              </Badge>
	              {showSelectedOnly && (
	                <Badge color="indigo" variant="light" size="xs" radius="xl">
	                  Zobrazeny pouze označené
	                </Badge>
	              )}
	            </Group>
	          </Group>
	          <Group justify="space-between" gap="xs" wrap="wrap" align="center">
	            <Group gap="xs" wrap="wrap" align="center">
	              {totalSelected > 0 && (
	                <Tooltip label="Přiřadit štítky k vybraným" withArrow>
	                  <Button
	                    variant="filled"
	                    size="xs"
	                    leftSection={<IconTag size={14} />}
	                    onClick={() => setBulkTagsOpened(true)}
	                    radius="xl"
	                    px="sm"
	                  >
	                    Přiřadit štítky
	                  </Button>
	                </Tooltip>
	              )}
	              <Tooltip label="Správa štítků (stejně jako inventory)" withArrow>
	                <Button
	                  variant="light"
	                  size="xs"
	                  leftSection={<IconSettings size={14} />}
                  onClick={() => setTagManagerOpened(true)}
                  radius="xl"
	                  px="sm"
	                >
	                  Správa štítků
	                </Button>
	              </Tooltip>
              {totalSelected > 0 || showSelectedOnly ? (
                <>
                  <Tooltip label={showSelectedOnly ? 'Zobrazit všechny' : 'Zobrazit jen označené'} withArrow>
                    <Button
                      variant={showSelectedOnly ? 'filled' : 'subtle'}
                      size="xs"
                      leftSection={<IconEye size={14} />}
                      onClick={() => setShowSelectedOnly((current) => !current)}
                      radius="xl"
                      px="sm"
                    >
                      {showSelectedOnly ? 'Zobrazit vše' : 'Zobrazit označené'}
                    </Button>
                  </Tooltip>
                  <Tooltip label="Odznačit vše" withArrow>
                    <Button
                      variant="subtle"
                      size="xs"
                      leftSection={<IconX size={14} />}
                      onClick={clearAllSelections}
                      radius="xl"
                      px="sm"
                    >
                      Odznačit vše
                    </Button>
                  </Tooltip>
                </>
              ) : null}
            </Group>
            <Group gap="xs" wrap="wrap" justify="flex-end" align="center">
              <TableToolbar
                columns={Object.entries(columnLabels).map(([key, label]) => ({ key, label }))}
                columnVisibility={columnVisibility}
                onToggleColumn={(key, checked) => {
                  const columnKey = key as ColumnKey;
                  setColumnVisibility((current) => ({
                    ...current,
                    [columnKey]: checked,
                  }));

                  if (!checked) {
                    const sortColumn = columnKeyToSortColumn[columnKey];
                    if (sortColumn) {
                      setSortState((current) => {
                        const next = current.filter((descriptor) => descriptor.column !== sortColumn);
                        if (next.length === 0) {
                          if (sortColumn === DEFAULT_CUSTOMER_SORT.column) {
                            return [FALLBACK_NAME_SORT];
                          }
                          return [DEFAULT_CUSTOMER_SORT];
                        }
                        return next;
                      });
                    }
                  }
                }}
                buttonSize="xs"
                radius="xl"
              />
	              <TableExportAction
	                totalCount={showSelectedOnly ? selectedIds.size : totalRecords}
	                selectedCount={selectedIds.size}
	                onExport={({ scope, columns }) => performLocalExport(scope, columns)}
	                label="Export"
	                size="xs"
	                variant="light"
	                radius="xl"
	              />
	            </Group>
	          </Group>
	            {(isLoading || isFetching) && (
              <Group gap="xs" c="dimmed" fz="sm">
                <Loader size="xs" />
                <Text size="sm">Načítám zákazníky…</Text>
              </Group>
            )}

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
            <div style={{ minWidth: 1100 }}>
              <Table highlightOnHover verticalSpacing="sm" className={tableClasses.table}>
                <Table.Thead>
                <Table.Tr>
                  <Table.Th className={tableClasses.selectionHeader}>
                    <Checkbox
                      size="sm"
                      radius="sm"
                      aria-label="Vybrat vše na stránce"
                      checked={allVisibleSelected}
                      indeterminate={!allVisibleSelected && someVisibleSelected}
                      onChange={(event) => toggleSelectAllVisible(event.currentTarget.checked)}
                    />
                  </Table.Th>
                  {visibleHeaderColumns.map((column) => (
                    <DataTableHeaderCell
                      key={column.key}
                      column={column}
                      sortState={sortState}
                      onToggleSort={column.sortable ? handleHeaderSort : undefined}
                      width={columnSizes[column.key]}
                    />
                  ))}
                </Table.Tr>
                {showColumnFilters && (
                  <Table.Tr>
                    <Table.Th className={tableClasses.selectionHeader} />
                    {visibleHeaderColumns.map((column) => {
                      switch (column.key) {
                  case 'name':
                    return (
                      <Table.Th key={`filter-${column.key}`}>
                        <TextInput
                          size="xs"
                          placeholder="Hledat jméno"
                          value={columnFilters.name}
                          onChange={(event) =>
                            setColumnFilters((current) => ({ ...current, name: event.currentTarget.value }))
                          }
                        />
                      </Table.Th>
                    );
                  case 'email':
                    return (
                      <Table.Th key={`filter-${column.key}`}>
                        <TextInput
                          size="xs"
                          placeholder="Hledat e-mail"
                          value={columnFilters.email}
                          onChange={(event) =>
                            setColumnFilters((current) => ({ ...current, email: event.currentTarget.value }))
                          }
                        />
                      </Table.Th>
                    );
                  case 'phone':
                    return (
                      <Table.Th key={`filter-${column.key}`}>
                        <TextInput
                          size="xs"
                          placeholder="Telefon"
                          value={columnFilters.phone}
                          onChange={(event) =>
                            setColumnFilters((current) => ({ ...current, phone: event.currentTarget.value }))
                          }
                        />
                      </Table.Th>
                    );
                  case 'customer_group':
                    return (
                      <Table.Th key={`filter-${column.key}`}>
                        <TextInput
                          size="xs"
                          placeholder="Štítek"
                          value={columnFilters.customer_group}
                          onChange={(event) =>
                            setColumnFilters((current) => ({
                              ...current,
                              customer_group: event.currentTarget.value,
                            }))
                          }
                        />
                      </Table.Th>
                    );
                  case 'price_list':
                    return (
                      <Table.Th key={`filter-${column.key}`}>
                        <TextInput
                          size="xs"
                          placeholder="Ceník"
                          value={columnFilters.price_list}
                          onChange={(event) =>
                            setColumnFilters((current) => ({ ...current, price_list: event.currentTarget.value }))
                          }
                        />
                      </Table.Th>
                    );
                  case 'shop':
                    return (
                      <Table.Th key={`filter-${column.key}`}>
                        <TextInput
                          size="xs"
                          placeholder="Shop / doména"
                          value={columnFilters.shop}
                          onChange={(event) =>
                            setColumnFilters((current) => ({ ...current, shop: event.currentTarget.value }))
                          }
                        />
                      </Table.Th>
                    );
                  case 'orders':
                    return (
                      <Table.Th key={`filter-${column.key}`}>
                        <Group gap={4} grow>
                          <TextInput
                            size="xs"
                            placeholder="od"
                            type="number"
                            value={columnFilters.ordersMin}
                            onChange={(event) =>
                              setColumnFilters((current) => ({ ...current, ordersMin: event.currentTarget.value }))
                            }
                          />
                          <TextInput
                            size="xs"
                            placeholder="do"
                            type="number"
                            value={columnFilters.ordersMax}
                            onChange={(event) =>
                              setColumnFilters((current) => ({ ...current, ordersMax: event.currentTarget.value }))
                            }
                          />
                        </Group>
                      </Table.Th>
                    );
                  case 'total_spent':
                    return (
                      <Table.Th key={`filter-${column.key}`}>
                        <Group gap={4} grow>
                          <TextInput
                            size="xs"
                            placeholder="od"
                            type="number"
                            value={columnFilters.totalSpentMin}
                            onChange={(event) =>
                              setColumnFilters((current) => ({
                                ...current,
                                totalSpentMin: event.currentTarget.value,
                              }))
                            }
                          />
                          <TextInput
                            size="xs"
                            placeholder="do"
                            type="number"
                            value={columnFilters.totalSpentMax}
                            onChange={(event) =>
                              setColumnFilters((current) => ({
                                ...current,
                                totalSpentMax: event.currentTarget.value,
                              }))
                            }
                          />
                        </Group>
                      </Table.Th>
                    );
                  case 'average_order_value':
                    return (
                      <Table.Th key={`filter-${column.key}`}>
                        <Group gap={4} grow>
                          <TextInput
                            size="xs"
                            placeholder="od"
                            type="number"
                            value={columnFilters.averageOrderValueMin}
                            onChange={(event) =>
                              setColumnFilters((current) => ({
                                ...current,
                                averageOrderValueMin: event.currentTarget.value,
                              }))
                            }
                          />
                          <TextInput
                            size="xs"
                            placeholder="do"
                            type="number"
                            value={columnFilters.averageOrderValueMax}
                            onChange={(event) =>
                              setColumnFilters((current) => ({
                                ...current,
                                averageOrderValueMax: event.currentTarget.value,
                              }))
                            }
                          />
                        </Group>
                      </Table.Th>
                    );
                  case 'registered_at':
                    return (
                      <Table.Th key={`filter-${column.key}`}>
                        <Group gap={4} grow>
                          <TextInput
                            size="xs"
                            type="date"
                            value={columnFilters.registeredFrom}
                            onChange={(event) =>
                              setColumnFilters((current) => ({
                                ...current,
                                registeredFrom: event.currentTarget.value,
                              }))
                            }
                          />
                          <TextInput
                            size="xs"
                            type="date"
                            value={columnFilters.registeredTo}
                            onChange={(event) =>
                              setColumnFilters((current) => ({
                                ...current,
                                registeredTo: event.currentTarget.value,
                              }))
                            }
                          />
                        </Group>
                      </Table.Th>
                    );
                  case 'last_order_at':
                    return (
                      <Table.Th key={`filter-${column.key}`}>
                        <Group gap={4} grow>
                          <TextInput
                            size="xs"
                            type="date"
                            value={columnFilters.lastOrderFrom}
                            onChange={(event) =>
                              setColumnFilters((current) => ({
                                ...current,
                                lastOrderFrom: event.currentTarget.value,
                              }))
                            }
                          />
                          <TextInput
                            size="xs"
                            type="date"
                            value={columnFilters.lastOrderTo}
                            onChange={(event) =>
                              setColumnFilters((current) => ({
                                ...current,
                                lastOrderTo: event.currentTarget.value,
                              }))
                            }
                          />
                        </Group>
                      </Table.Th>
                    );
                    default:
                      return <Table.Th key={`filter-${column.key}`} />;
                  }
                })}
              </Table.Tr>
            )}
              </Table.Thead>
              {isLoading && (
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td colSpan={columnCount}>Načítám...</Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              )}
              {!isLoading && tableRows.length === 0 && (
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td colSpan={columnCount}>
                      <Text size="sm" c="dimmed">
                        Nenalezli jsme žádné zákazníky podle aktuálních filtrů.
                      </Text>
                    </Table.Td>
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
                    const customer = tableRows[virtualRow.index];
                    return (
                      <CustomerRow
                        key={customer.id}
                        customer={customer}
                        columnVisibility={columnVisibility}
                        showTagBadges={showTagBadges}
                        tagColorMap={tagColorMap}
                        tagHiddenMap={tagHiddenMap}
                        selectedIds={selectedIds}
                        toggleRowSelection={toggleRowSelection}
                        formatNumber={formatNumber}
                        formatCurrency={formatCurrency}
                        formatDate={formatDate}
                        navigateToCustomer={navigateToCustomer}
                        columnSizes={columnSizes}
                        measureElement={rowVirtualizer.measureElement}
                        rowIndex={virtualRow.index}
                        rowStyle={{
                          position: 'absolute',
                          top: virtualRow.start,
                          width: '100%',
                          left: 0,
                          right: 0,
                        }}
                      />
                    );
                  })}
                </Table.Tbody>
              )}
            </Table>
            </div>
          </div>

            {!showSelectedOnly && (
              <Group justify="flex-end">
                <Pagination value={page} onChange={setPage} total={data?.last_page ?? 1} />
              </Group>
            )}
          </Stack>
        </SectionCard>

        <Modal
          opened={bulkTagsOpened}
          onClose={() => {
            if (!bulkTagsLoading) {
              setBulkTagsOpened(false);
              setBulkSelectedTags([]);
              setBulkNewTag('');
            }
          }}
          title="Přiřadit štítky vybraným"
          centered
        >
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Označeno zákazníků: {selectedIds.size.toLocaleString('cs-CZ')}
            </Text>
            <MultiSelect
              label="Existující štítky"
              data={manualTagOptions}
              value={bulkSelectedTags}
              onChange={setBulkSelectedTags}
              searchable
              clearable
              nothingFoundMessage="Žádné štítky"
              disabled={bulkTagsLoading}
            />
            <TextInput
              label="Nový štítek"
              placeholder="Např. VIP jaro"
              value={bulkNewTag}
              onChange={(event) => setBulkNewTag(event.currentTarget.value)}
              disabled={bulkTagsLoading}
            />
            <Group justify="flex-end" gap="sm" mt="sm">
              <Button
                variant="subtle"
                onClick={() => {
                  setBulkTagsOpened(false);
                  setBulkSelectedTags([]);
                  setBulkNewTag('');
                }}
                disabled={bulkTagsLoading}
              >
                Zavřít
              </Button>
              <Button onClick={handleBulkTagsConfirm} loading={bulkTagsLoading}>
                Přiřadit
              </Button>
            </Group>
          </Stack>
        </Modal>
        <TagManagerModal
          opened={tagManagerOpened}
          tags={tagDefinitions}
          onClose={() => setTagManagerOpened(false)}
          onCreate={handleTagCreate}
          onUpdate={handleTagUpdate}
          onDelete={handleTagDelete}
          creating={tagCreateLoading}
          updatingTagId={tagUpdateId}
          deletingTagId={tagDeleteId}
          extraContent={
            unmanagedManualTags.length > 0 ? (
              <Stack gap="xs">
                <Text fw={500}>Štítky v datech (bez správy)</Text>
                <Text size="sm" c="dimmed">
                  Tyto štítky existují u zákazníků, ale nejsou ještě v „Správa štítků“ (nemají barvu / schování).
                  Klikni na „Přidat do správy“ a pak je můžeš upravovat nebo smazat.
                </Text>
                <Stack gap="xs">
                  {unmanagedManualTags.map((name) => (
                    <Group key={name} justify="space-between" align="center">
                      <Badge variant="light" color="gray">
                        {name}
                      </Badge>
                      <Button
                        size="xs"
                        variant="subtle"
                        leftSection={<IconPlus size={14} />}
                        onClick={() => handleAdoptUnmanagedTag(name)}
                      >
                        Přidat do správy
                      </Button>
                    </Group>
                  ))}
                </Stack>
              </Stack>
            ) : null
          }
        />
      </Stack>
    </SectionPageShell>
  );
};
