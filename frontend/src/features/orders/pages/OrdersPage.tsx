import {
  Badge,
  Button,
  Collapse,
  Group,
  Loader,
  MultiSelect,
  Pagination,
  Popover,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
  useMantineTheme,
  ActionIcon,
} from '@mantine/core';
import { useDebouncedValue, useDisclosure, useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrderFilters, useOrders, useSyncOrders } from '../hooks/useOrders';
import { useShops } from '../../shoptet/hooks/useShops';
import type { Order } from '../../../api/orders';
import type { AxiosError } from 'axios';
import { format } from 'date-fns';
import { useUserPreference } from '../../../hooks/useUserPreference';
import { IconAdjustments, IconRefresh, IconSum } from '@tabler/icons-react';
import { SectionPageShell } from '../../../components/layout/SectionPageShell';
import { SurfaceCard } from '../../../components/layout/SurfaceCard';
import { TableToolbar } from '../../../components/table/TableToolbar';
import { shopProviderOptions } from '../../../constants/shopProviders';
import { ShopProviderBadge } from '../../../components/shop/ShopProviderBadge';

type RangeOption = {
  value: string;
  label: string;
  days: number;
};

const RANGE_OPTIONS: RangeOption[] = [
  { value: '3d', label: 'Poslední 3 dny', days: 3 },
  { value: '1w', label: 'Poslední týden', days: 7 },
  { value: '2w', label: 'Poslední 2 týdny', days: 14 },
  { value: '30d', label: 'Posledních 30 dní', days: 30 },
];

const formatShoptetDate = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm:ssxxxx");

const formatDisplayDate = (value: string | null | undefined) => {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
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

type OrdersListPreference = {
  page?: number;
  statuses?: string[];
  search?: string;
  shop_id?: number | null;
  range?: string;
  product?: string;
  customer?: string;
  date_from?: string | null;
  date_to?: string | null;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
  providers?: string[];
};

type OrderColumn = 'code' | 'shop' | 'date' | 'customer' | 'total' | 'status';

const ORDER_COLUMN_LABELS: Record<OrderColumn, string> = {
  code: 'Kód',
  shop: 'Shop',
  date: 'Datum',
  customer: 'Zákazník',
  total: 'Celkem',
  status: 'Stav',
};

const ORDER_COLUMN_KEYS: OrderColumn[] = ['code', 'shop', 'date', 'customer', 'total', 'status'];
const DEFAULT_ORDER_COLUMN_VISIBILITY: Record<OrderColumn, boolean> = {
  code: true,
  shop: true,
  date: true,
  customer: true,
  total: true,
  status: true,
};

export const OrdersPage = () => {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.md})`);
  const [filtersOpened, { toggle: toggleFilters, open: openFilters, close: closeFilters }] = useDisclosure(true);

  const [page, setPage] = useState(1);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [shopId, setShopId] = useState<number | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [range, setRange] = useState<string>('30d');
  const [product, setProduct] = useState('');
  const [customer, setCustomer] = useState('');
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('ordered_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [debouncedProduct] = useDebouncedValue(product, 300);
  const [debouncedCustomer] = useDebouncedValue(customer, 300);
  const [orderColumnVisibility, setOrderColumnVisibility] = useState<Record<OrderColumn, boolean>>(
    DEFAULT_ORDER_COLUMN_VISIBILITY
  );
  const resolvedProviders = useMemo(
    () =>
      Array.from(
        new Set(
          providers
            .map((value) => value.trim().toLowerCase())
            .filter((value) => value !== '')
        )
      ),
    [providers]
  );
  const navigate = useNavigate();

  const {
    value: storedPreference,
    isLoading: preferenceLoading,
    save: saveOrdersPreference,
  } = useUserPreference<OrdersListPreference>('orders.list');

  const [preferenceHydrated, setPreferenceHydrated] = useState(false);
  const preferenceSaveTimeoutRef = useRef<number | null>(null);
  const lastSavedPreferenceRef = useRef<string | null>(null);

  const params = useMemo(
    () => ({
      page,
      shop_id: shopId ?? undefined,
      status: statuses.length > 0 ? statuses : undefined,
      search: debouncedSearch || undefined,
      product: debouncedProduct || undefined,
      customer: debouncedCustomer || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      sort_by: sortBy,
      sort_dir: sortDir,
      provider: resolvedProviders.length > 0 ? resolvedProviders : undefined,
    }),
    [
      page,
      shopId,
      statuses,
      debouncedSearch,
      debouncedProduct,
      debouncedCustomer,
      dateFrom,
      dateTo,
      sortBy,
      sortDir,
      resolvedProviders,
    ]
  );

  const { data, isLoading } = useOrders(params);
  const shopsQuery = useShops({ per_page: 50, provider: 'all' });
  const syncOrders = useSyncOrders();
  const orderFilters = useOrderFilters();
  const hasSetInitialShop = useRef(false);
  const baseCurrency = orderFilters.data?.base_currency ?? 'CZK';
  const baseCurrencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat('cs-CZ', {
        style: 'currency',
        currency: baseCurrency,
        maximumFractionDigits: 2,
      }),
    [baseCurrency]
  );

  const isDefaultOrdersPreference = useCallback((preference: OrdersListPreference) => {
    const statusesEmpty = !preference.statuses || preference.statuses.length === 0;
    const rangeValue = preference.range ?? '30d';
    const shopUnset = preference.shop_id === null || preference.shop_id === undefined;
    const sortByValue = preference.sort_by ?? 'ordered_at';
    const sortDirValue = preference.sort_dir ?? 'desc';
    const providersEmpty = !preference.providers || preference.providers.length === 0;

    return (
      (preference.page ?? 1) === 1 &&
      statusesEmpty &&
      preference.search === undefined &&
      preference.product === undefined &&
      preference.customer === undefined &&
      rangeValue === '30d' &&
      (preference.date_from ?? null) === null &&
      (preference.date_to ?? null) === null &&
      shopUnset &&
      sortByValue === 'ordered_at' &&
      sortDirValue === 'desc' &&
      providersEmpty
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
    const nextStatuses = uniqueStringArray(preference.statuses ?? []);
    const nextSearch = typeof preference.search === 'string' ? preference.search : '';
    const nextRange = typeof preference.range === 'string' ? preference.range : '30d';
    const nextProduct = typeof preference.product === 'string' ? preference.product : '';
    const nextCustomer = typeof preference.customer === 'string' ? preference.customer : '';
    const nextDateFrom = preference.date_from ?? null;
    const nextDateTo = preference.date_to ?? null;
    const nextSortBy = typeof preference.sort_by === 'string' ? preference.sort_by : 'ordered_at';
    const nextSortDir = preference.sort_dir === 'asc' ? 'asc' : 'desc';
    const nextProviders = uniqueStringArray(preference.providers ?? []).map((value) => value.toLowerCase());

    let nextShopId: number | null = null;
    if (typeof preference.shop_id === 'number') {
      nextShopId = preference.shop_id;
    } else if (typeof preference.shop_id === 'string') {
      const parsed = Number(preference.shop_id);
      if (Number.isFinite(parsed)) {
        nextShopId = parsed;
      }
    }

    setPage(nextPage);
    setStatuses(nextStatuses);
    setSearch(nextSearch);
    setRange(nextRange);
    setProduct(nextProduct);
    setCustomer(nextCustomer);
    setDateFrom(nextDateFrom);
    setDateTo(nextDateTo);
    setSortBy(nextSortBy);
    setSortDir(nextSortDir);
    setShopId(nextShopId);
    setProviders(nextProviders);
    hasSetInitialShop.current = true;

    const trackingPayload: OrdersListPreference = {
      page: nextPage,
      statuses: nextStatuses,
      search: normalizeText(nextSearch),
      shop_id: nextShopId,
      range: nextRange,
      product: normalizeText(nextProduct),
      customer: normalizeText(nextCustomer),
      date_from: nextDateFrom,
      date_to: nextDateTo,
      sort_by: nextSortBy,
      sort_dir: nextSortDir,
      providers: nextProviders.length > 0 ? [...nextProviders] : [],
    };

    lastSavedPreferenceRef.current = isDefaultOrdersPreference(trackingPayload)
      ? '__default__'
      : JSON.stringify(trackingPayload);

    setPreferenceHydrated(true);
  }, [
    isDefaultOrdersPreference,
    preferenceHydrated,
    preferenceLoading,
    storedPreference,
  ]);

  const buildPreferencePayload = useCallback((): OrdersListPreference => {
    return {
      page,
      statuses: statuses.length > 0 ? [...statuses] : [],
      search: normalizeText(search),
      shop_id: shopId ?? null,
      range,
      product: normalizeText(product),
      customer: normalizeText(customer),
      date_from: dateFrom ?? null,
      date_to: dateTo ?? null,
      sort_by: sortBy,
      sort_dir: sortDir,
      providers: resolvedProviders.length > 0 ? [...resolvedProviders] : [],
    };
  }, [
    customer,
    dateFrom,
    dateTo,
    page,
    product,
    range,
    search,
    shopId,
    sortBy,
    sortDir,
    statuses,
    resolvedProviders,
  ]);

  useEffect(() => {
    if (!preferenceHydrated) {
      return;
    }

    const payload = buildPreferencePayload();
    const defaultPreference = isDefaultOrdersPreference(payload);
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
        saveOrdersPreference(null);
      } else {
        saveOrdersPreference(payload);
      }
    }, 600);
  }, [
    buildPreferencePayload,
    isDefaultOrdersPreference,
    preferenceHydrated,
    saveOrdersPreference,
  ]);

  useEffect(() => {
    return () => {
      if (preferenceSaveTimeoutRef.current !== null) {
        window.clearTimeout(preferenceSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isMobile) {
      closeFilters();
    } else {
      openFilters();
    }
  }, [isMobile, closeFilters, openFilters]);

  const shopOptions = useMemo(
    () =>
      (shopsQuery.data?.data ?? []).map((shop) => ({
        value: shop.id.toString(),
        label: shop.is_master ? `${shop.name} (master)` : shop.name,
        isMaster: !!shop.is_master,
      })),
    [shopsQuery.data]
  );
  const providerOptions = useMemo(
    () => shopProviderOptions((shopsQuery.data?.data ?? []).map((shop) => shop.provider ?? 'shoptet')),
    [shopsQuery.data]
  );

  const selectedRange = useMemo(
    () => RANGE_OPTIONS.find((option) => option.value === range) ?? RANGE_OPTIONS[RANGE_OPTIONS.length - 1],
    [range]
  );

  const statusOptions = useMemo(
    () =>
      (orderFilters.data?.statuses ?? []).map((statusValue) => ({
        value: statusValue,
        label: statusValue,
      })),
    [orderFilters.data]
  );

  useEffect(() => {
    if (!hasSetInitialShop.current && shopId === null && shopOptions.length > 0) {
      const master = shopOptions.find((option) => option.isMaster);
      const fallback = master ?? shopOptions[0];

      setShopId(Number(fallback.value));
      hasSetInitialShop.current = true;
    }
  }, [shopId, shopOptions]);

  const handleSyncOrders = async () => {
    if (!shopId) {
      notifications.show({
        message: 'Vyber shop, pro který chceš objednávky aktualizovat.',
        color: 'red',
      });
      return;
    }

    try {
      const now = new Date();
      const from = new Date(now.getTime() - selectedRange.days * 24 * 60 * 60 * 1000);
      from.setHours(0, 0, 0, 0);

      const payload = {
        changeTimeFrom: formatShoptetDate(from),
        changeTimeTo: formatShoptetDate(now),
      };

      const result = await syncOrders.mutateAsync({ shopId, payload });

      notifications.show({
        message: result?.message ?? 'Synchronizace objednávek byla spuštěna. Data se aktualizují během chvíle.',
        color: 'green',
      });
    } catch (error) {
      console.error(error);
      const axiosError = error as AxiosError<{ message?: string }>;
      const message = axiosError?.response?.data?.message;

      notifications.show({
        message: message ?? 'Aktualizace objednávek selhala. Zkus to prosím znovu.',
        color: 'red',
      });
    }
  };

  const orders = data?.data ?? [];
  const visibleOrderColumns = useMemo(
    () => ORDER_COLUMN_KEYS.filter((key) => orderColumnVisibility[key]),
    [orderColumnVisibility]
  );
  const orderColumnCount = Math.max(1, visibleOrderColumns.length);

  const totalSumVisible = useMemo(() => {
    return orders.reduce((acc, order) => {
      const value = order.total_with_vat_base ?? order.total_with_vat ?? 0;
      return acc + Number(value ?? 0);
    }, 0);
  }, [orders]);

  const renderTotalSummary = useCallback(() => {
    return (
      <Popover width={240} withArrow shadow="md" position="bottom-start">
        <Popover.Target>
          <ActionIcon
            variant="subtle"
            size="sm"
            radius="sm"
            aria-label="Součet celkové hodnoty objednávek"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <IconSum size={14} />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown onClick={(event) => event.stopPropagation()}>
          <Stack gap={6}>
            <Text size="xs" c="dimmed">
              Součet hodnoty zobrazených objednávek
            </Text>
            <Text fw={700}>{baseCurrencyFormatter.format(totalSumVisible)}</Text>
            <Text size="xs" c="dimmed">
              Vypočteno z aktuálně načtené stránky (základní měna).
            </Text>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    );
  }, [baseCurrencyFormatter, totalSumVisible]);

  const formatOrderTotal = (order: Order) => {
    if (order.total_with_vat === null || order.total_with_vat === undefined) {
      return '—';
    }

    const currency = order.currency_code ?? baseCurrency;
    const formatter = new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    });

    const formatted = formatter.format(order.total_with_vat);
    const baseAmount = order.total_with_vat_base ?? null;

    if (!baseAmount || currency === baseCurrency) {
      return formatted;
    }

    return `${formatted} (≈ ${baseCurrencyFormatter.format(baseAmount)})`;
  };

  const filtersVisible = !isMobile || filtersOpened;

  const filtersContent = (
    <Stack gap="sm">
      <Group gap="md" align="flex-end" wrap="wrap">
        <TextInput
          label="Vyhledávání"
          placeholder="kód nebo e-mail"
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setPage(1);
          }}
          size="sm"
          w={{ base: '100%', sm: '240px' }}
        />
        <MultiSelect
          label="Stavy"
          placeholder={orderFilters.isLoading ? 'Načítám...' : 'Vyber stavy'}
          data={statusOptions}
          value={statuses}
          onChange={(value) => {
            setStatuses(value);
            setPage(1);
          }}
          disabled={orderFilters.isLoading}
          searchable
          clearable
          size="sm"
          w={{ base: '100%', sm: '240px' }}
        />
        <TextInput
          label="Produkt"
          placeholder="kód nebo název"
          value={product}
          onChange={(event) => {
            setProduct(event.currentTarget.value);
            setPage(1);
          }}
          size="sm"
          w={{ base: '100%', sm: '220px' }}
        />
        <TextInput
          label="Zákazník"
          placeholder="jméno, email nebo telefon"
          value={customer}
          onChange={(event) => {
            setCustomer(event.currentTarget.value);
            setPage(1);
          }}
          size="sm"
          w={{ base: '100%', sm: '220px' }}
        />
      </Group>

      <Group gap="md" align="flex-end" wrap="wrap">
        <TextInput
          label="Od data"
          type="date"
          value={dateFrom ?? ''}
          onChange={(event) => {
            const value = event.currentTarget.value || null;
            setDateFrom(value);
            setPage(1);
          }}
          size="sm"
          w={{ base: '100%', sm: '180px' }}
        />
        <TextInput
          label="Do data"
          type="date"
          value={dateTo ?? ''}
          onChange={(event) => {
            const value = event.currentTarget.value || null;
            setDateTo(value);
            setPage(1);
          }}
          size="sm"
          w={{ base: '100%', sm: '180px' }}
        />
        <Select
          label="Řadit podle"
          data={[
            { value: 'ordered_at', label: 'Datum' },
            { value: 'total_with_vat', label: 'Cena' },
            { value: 'status', label: 'Stav' },
            { value: 'code', label: 'Kód' },
            { value: 'customer', label: 'Zákazník' },
          ]}
          value={sortBy}
          onChange={(value) => {
            setSortBy(value ?? 'ordered_at');
            setPage(1);
          }}
          size="sm"
          w={{ base: '100%', sm: '200px' }}
        />
        <SegmentedControl
          value={sortDir}
          onChange={(value) => {
            setSortDir(value as 'asc' | 'desc');
            setPage(1);
          }}
          data={[
            { label: 'Vzestupně', value: 'asc' },
            { label: 'Sestupně', value: 'desc' },
          ]}
          size="sm"
        />
      </Group>
    </Stack>
  );

  return (
    <SectionPageShell
      section="orders"
      description="Spravuj objednávky napříč shopy, filtruj podle období a synchronizuj data z Shoptetu na jeden klik."
    >
      <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
        <Group gap="md" align="flex-end" wrap="wrap">
          <MultiSelect
            label="Zdroj"
            placeholder={shopsQuery.isLoading ? 'Načítám...' : 'Všechny zdroje'}
            data={providerOptions}
            value={providers}
            onChange={(value) => {
              const normalized = Array.from(new Set(value.map((entry) => entry.toLowerCase())));
              setProviders(normalized);
              setPage(1);
            }}
            searchable
            clearable
            nothingFoundMessage="Nenalezeno"
            comboboxProps={{ withinPortal: true }}
            w={{ base: '100%', sm: '200px' }}
          />
          <Select
            label="Shop"
            placeholder={shopsQuery.isLoading ? 'Načítám...' : 'Vyber shop'}
            data={shopOptions.map(({ value, label }) => ({ value, label }))}
            value={shopId !== null ? shopId.toString() : null}
            onChange={(value) => {
              const newValue = value ? Number(value) : null;
              setShopId(newValue);
              setPage(1);
            }}
            disabled={shopsQuery.isLoading || syncOrders.isPending}
            clearable
            size="sm"
            w={{ base: '100%', sm: '200px' }}
          />
          <Select
            label="Období"
            data={RANGE_OPTIONS.map(({ value, label }) => ({ value, label }))}
            value={range}
            onChange={(value) => setRange(value ?? '30d')}
            disabled={syncOrders.isPending}
            size="sm"
            w={{ base: '100%', sm: '180px' }}
          />
        </Group>
        <Tooltip
          label={shopId ? `Načte změny za ${selectedRange.label}` : 'Vyber nejprve shop'}
          withArrow
          disabled={!!shopId}
        >
          <Button
            onClick={handleSyncOrders}
            loading={syncOrders.isPending}
            disabled={!shopId}
            leftSection={<IconRefresh size={16} />}
            size="sm"
          >
            Aktualizovat ({selectedRange.label})
          </Button>
        </Tooltip>
      </Group>

      <SurfaceCard>
        <Group justify="space-between" align="center" gap="sm">
          <Text fw={600}>Filtry</Text>
          {isMobile && (
            <Button
              variant="light"
              size="xs"
              leftSection={<IconAdjustments size={14} />}
              onClick={toggleFilters}
            >
              {filtersOpened ? 'Skrýt' : 'Zobrazit'}
            </Button>
          )}
        </Group>

        <Collapse in={filtersVisible} transitionDuration={200}>
          <Stack gap="sm" mt="sm">
            {filtersContent}
          </Stack>
        </Collapse>
      </SurfaceCard>

      <SurfaceCard p="0">
        <Stack gap="xs" px="md" pt="md">
          <TableToolbar
            columns={ORDER_COLUMN_KEYS.map((key) => ({ key, label: ORDER_COLUMN_LABELS[key] }))}
            columnVisibility={orderColumnVisibility}
            onToggleColumn={(key, checked) =>
              setOrderColumnVisibility((current) => ({
                ...current,
                [key as OrderColumn]: checked,
              }))
            }
          />
        </Stack>

        <ScrollArea type="auto">
          <Table highlightOnHover verticalSpacing="sm" miw={960}>
            <Table.Thead>
              <Table.Tr>
                {orderColumnVisibility.code && <Table.Th>Kód</Table.Th>}
                {orderColumnVisibility.shop && <Table.Th>Shop</Table.Th>}
                {orderColumnVisibility.date && <Table.Th>Datum</Table.Th>}
                {orderColumnVisibility.customer && <Table.Th>Zákazník</Table.Th>}
                {orderColumnVisibility.total && (
                  <Table.Th>
                    <Group justify="space-between" gap={4}>
                      <span>Celkem</span>
                      {renderTotalSummary()}
                    </Group>
                  </Table.Th>
                )}
                {orderColumnVisibility.status && <Table.Th>Stav</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading && (
                <Table.Tr>
                  <Table.Td colSpan={orderColumnCount}>
                    <Group justify="center" gap="xs" py="lg">
                      <Loader size="sm" />
                      <Text size="sm" c="dimmed">
                        Načítám objednávky...
                      </Text>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              )}
              {!isLoading && orders.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={orderColumnCount}>
                    <Stack align="center" py="lg" gap={4}>
                      <Text fw={500}>Žádné objednávky</Text>
                      <Text size="sm" c="dimmed" ta="center">
                        Uprav filtry nebo spusť synchronizaci pro vybraný shop.
                      </Text>
                    </Stack>
                  </Table.Td>
                </Table.Tr>
              )}
              {orders.map((order) => (
                <Table.Tr
                  key={order.id}
                  onClick={() => navigate(`/orders/${order.id}`)}
                  style={{
                    cursor: 'pointer',
                    transition: 'background-color 150ms ease',
                  }}
                >
                  {orderColumnVisibility.code && <Table.Td>{order.code}</Table.Td>}
                  {orderColumnVisibility.shop && (
                    <Table.Td>
                      {order.shop ? (
                        <Stack gap={2} align="flex-start">
                          <Group gap={6} wrap="wrap" align="center">
                            <Text fw={500}>{order.shop.name}</Text>
                            <ShopProviderBadge provider={order.shop_provider ?? order.shop.provider} />
                            {order.shop.is_master && (
                              <Badge size="xs" color="teal" variant="light">
                                Master
                              </Badge>
                            )}
                          </Group>
                          {(order.shop?.currency_code || order.currency_code) && (
                            <Text size="xs" c="dimmed">
                              {order.shop?.currency_code ?? order.currency_code}
                            </Text>
                          )}
                        </Stack>
                      ) : order.shop_provider ? (
                        <ShopProviderBadge provider={order.shop_provider} />
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                  )}
                  {orderColumnVisibility.date && (
                    <Table.Td>{formatDisplayDate(order.ordered_at_local ?? order.ordered_at)}</Table.Td>
                  )}
                  {orderColumnVisibility.customer && (
                    <Table.Td>
                      <Stack gap={2}>
                        <Text fw={500}>{order.customer_name ?? '—'}</Text>
                        <Text size="sm" c="dimmed">
                          {order.customer_email ?? '—'}
                        </Text>
                      </Stack>
                    </Table.Td>
                  )}
                  {orderColumnVisibility.total && <Table.Td>{formatOrderTotal(order)}</Table.Td>}
                  {orderColumnVisibility.status && (
                    <Table.Td>{order.status ? <Badge>{order.status}</Badge> : '—'}</Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>

        <Group justify="flex-end" mt="md" px="md" pb="md">
          <Pagination value={page} onChange={setPage} total={data?.last_page ?? 1} size="sm" />
        </Group>
      </SurfaceCard>
    </Stack>
  </SectionPageShell>
  );
};
