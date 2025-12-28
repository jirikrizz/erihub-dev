import { AreaChart } from '@mantine/charts';
import {
  Alert,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import type { AnalyticsKpisParams, AnalyticsOrdersParams, AnalyticsProductsParams } from '../../../api/analytics';
import { useShops } from '../../shoptet/hooks/useShops';
import { useAnalyticsKpis } from '../hooks/useAnalyticsKpis';
import { useAnalyticsOrders } from '../hooks/useAnalyticsOrders';
import { useAnalyticsLocations } from '../hooks/useAnalyticsLocations';
import { useAnalyticsSettings } from '../../settings/hooks/useAnalyticsSettings';
import { useAnalyticsProducts } from '../hooks/useAnalyticsProducts';
import classes from './AnalyticsPage.module.css';
import { PageShell } from '../../../components/layout/PageShell';

type RangeOption = 'last_7_days' | 'last_30_days' | 'month_to_date' | 'quarter_to_date' | 'year_to_date' | 'custom';

type FiltersState = {
  shopIds: string[];
  range: RangeOption;
  from: string;
  to: string;
  compare: boolean;
  compareMode: 'previous_period' | 'previous_year';
  groupBy: NonNullable<AnalyticsOrdersParams['group_by']>;
};

type ProductFiltersState = {
  limit: number;
  sort: 'revenue' | 'units' | 'orders' | 'repeat_rate' | 'repeat_customers';
  direction: 'asc' | 'desc';
  search: string;
};

const RANGE_OPTIONS: { value: RangeOption; label: string }[] = [
  { value: 'last_7_days', label: 'Posledních 7 dní' },
  { value: 'last_30_days', label: 'Posledních 30 dní' },
  { value: 'month_to_date', label: 'Tento měsíc' },
  { value: 'quarter_to_date', label: 'Toto čtvrtletí' },
  { value: 'year_to_date', label: 'Tento rok' },
  { value: 'custom', label: 'Vlastní' },
];

const GROUP_BY_OPTIONS: { value: NonNullable<AnalyticsOrdersParams['group_by']>; label: string }[] = [
  { value: 'day', label: 'Denně' },
  { value: 'week', label: 'Týdně' },
  { value: 'month', label: 'Měsíčně' },
  { value: 'year', label: 'Ročně' },
];

const PRODUCT_SORT_OPTIONS: { value: ProductFiltersState['sort']; label: string }[] = [
  { value: 'revenue', label: 'Tržby' },
  { value: 'units', label: 'Prodáno ks' },
  { value: 'orders', label: 'Objednávky' },
  { value: 'repeat_rate', label: 'Repeat ratio' },
  { value: 'repeat_customers', label: 'Opakovaní zákazníci' },
];

const PRODUCT_DIRECTION_OPTIONS: { value: ProductFiltersState['direction']; label: string }[] = [
  { value: 'desc', label: 'Sestupně' },
  { value: 'asc', label: 'Vzestupně' },
];

const formatDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const calculateRangeDates = (range: RangeOption): { from: string; to: string } => {
  const today = new Date();
  const to = formatDate(today);

  const clone = (date: Date) => new Date(date.getTime());

  switch (range) {
    case 'last_7_days': {
      const fromDate = clone(today);
      fromDate.setDate(fromDate.getDate() - 6);
      return { from: formatDate(fromDate), to };
    }
    case 'last_30_days': {
      const fromDate = clone(today);
      fromDate.setDate(fromDate.getDate() - 29);
      return { from: formatDate(fromDate), to };
    }
    case 'month_to_date': {
      const fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: formatDate(fromDate), to };
    }
    case 'quarter_to_date': {
      const quarter = Math.floor(today.getMonth() / 3);
      const fromDate = new Date(today.getFullYear(), quarter * 3, 1);
      return { from: formatDate(fromDate), to };
    }
    case 'year_to_date': {
      const fromDate = new Date(today.getFullYear(), 0, 1);
      return { from: formatDate(fromDate), to };
    }
    default:
      return { from: '', to: '' };
  }
};

const DAY_MS = 24 * 60 * 60 * 1000;

const calculatePreviousRange = (
  mode: FiltersState['compareMode'],
  from: string,
  to: string
): { from: string; to: string } | null => {
  if (!from || !to) {
    return null;
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate < fromDate) {
    return null;
  }

  if (mode === 'previous_year') {
    const prevFrom = new Date(fromDate);
    prevFrom.setFullYear(prevFrom.getFullYear() - 1);
    const prevTo = new Date(toDate);
    prevTo.setFullYear(prevTo.getFullYear() - 1);

    return {
      from: formatDate(prevFrom),
      to: formatDate(prevTo),
    };
  }

  const diffDays = Math.max(0, Math.round((toDate.getTime() - fromDate.getTime()) / DAY_MS));
  const previousPeriodEnd = new Date(fromDate.getTime() - DAY_MS);
  const previousPeriodStart = new Date(previousPeriodEnd.getTime() - diffDays * DAY_MS);

  return {
    from: formatDate(previousPeriodStart),
    to: formatDate(previousPeriodEnd),
  };
};

export const AnalyticsPage = () => {
  const defaultRange = calculateRangeDates('last_30_days');
  const initialFilters: FiltersState = {
    shopIds: [],
    range: 'last_30_days',
    from: defaultRange.from,
    to: defaultRange.to,
    compare: true,
    compareMode: 'previous_period',
    groupBy: 'day',
  };
  const [formFilters, setFormFilters] = useState<FiltersState>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(initialFilters);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [settingsInitialised, setSettingsInitialised] = useState(false);
  const [locationMetric, setLocationMetric] = useState<'orders' | 'revenue'>('orders');
  const [locationLimit, setLocationLimit] = useState<string>('10');
  const [productFilters, setProductFilters] = useState<ProductFiltersState>({
    limit: 25,
    sort: 'revenue',
    direction: 'desc',
    search: '',
  });
  const { data: shopsData, isLoading: shopsLoading } = useShops({ per_page: 100 });
  const { data: analyticsSettings } = useAnalyticsSettings();

  const shopOptions = useMemo(
    () =>
      (shopsData?.data ?? []).map((shop) => ({
        value: String(shop.id),
        label: shop.name ?? shop.domain ?? `Shop ${shop.id}`,
      })),
    [shopsData]
  );

  useEffect(() => {
    if (!analyticsSettings || settingsInitialised) {
      return;
    }

    const range = (analyticsSettings.default_range as RangeOption) ?? 'last_30_days';
    const { from, to } = calculateRangeDates(range);

    setFormFilters((current) => ({
      ...current,
      range,
      from: from || current.from,
      to: to || current.to,
      compare: analyticsSettings.compare_enabled ?? true,
    }));

    setAppliedFilters((current) => ({
      ...current,
      range,
      from: from || current.from,
      to: to || current.to,
      compare: analyticsSettings.compare_enabled ?? true,
    }));

    setSettingsInitialised(true);
  }, [analyticsSettings, settingsInitialised]);

  const resolvedShopIds = useMemo(
    () =>
      appliedFilters.shopIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    [appliedFilters.shopIds]
  );

  const queryParams = useMemo<AnalyticsKpisParams>(() => {
    const params: AnalyticsKpisParams = {};
    if (resolvedShopIds.length > 0) {
      params.shop_ids = resolvedShopIds;
    }
    if (appliedFilters.from) {
      params.from = appliedFilters.from;
    }
    if (appliedFilters.to) {
      params.to = appliedFilters.to;
    }
    return params;
  }, [appliedFilters.from, appliedFilters.to, resolvedShopIds]);

  const currentRange = useMemo(() => ({ from: appliedFilters.from, to: appliedFilters.to }), [appliedFilters.from, appliedFilters.to]);
  const previousRange = useMemo(() => {
    if (!appliedFilters.compare) {
      return null;
    }

    return calculatePreviousRange(appliedFilters.compareMode, currentRange.from, currentRange.to);
  }, [appliedFilters.compare, appliedFilters.compareMode, currentRange]);

  const formPreviousRange = useMemo(() => {
    if (!formFilters.compare) {
      return null;
    }

    return calculatePreviousRange(formFilters.compareMode, formFilters.from, formFilters.to);
  }, [formFilters.compare, formFilters.compareMode, formFilters.from, formFilters.to]);

  const { data, isFetching } = useAnalyticsKpis(queryParams);
  const orderParams = useMemo<AnalyticsOrdersParams>(() => ({
    ...(resolvedShopIds.length > 0 ? { shop_ids: resolvedShopIds } : {}),
    ...(appliedFilters.from ? { from: appliedFilters.from } : {}),
    ...(appliedFilters.to ? { to: appliedFilters.to } : {}),
    group_by: appliedFilters.groupBy,
  }), [appliedFilters.from, appliedFilters.to, appliedFilters.groupBy, resolvedShopIds]);

  const { data: ordersData, isFetching: ordersFetching } = useAnalyticsOrders(orderParams);
  const productParams = useMemo<AnalyticsProductsParams>(() => {
    const params: AnalyticsProductsParams = {
      sort: productFilters.sort,
      direction: productFilters.direction,
    };

    if (resolvedShopIds.length > 0) {
      params.shop_ids = resolvedShopIds;
    }

    if (appliedFilters.from) {
      params.from = appliedFilters.from;
    }

    if (appliedFilters.to) {
      params.to = appliedFilters.to;
    }

    if (productFilters.limit > 0) {
      params.limit = productFilters.limit;
    }

    if (productFilters.search.trim() !== '') {
      params.search = productFilters.search.trim();
    }

    return params;
  }, [
    appliedFilters.from,
    appliedFilters.to,
    productFilters.direction,
    productFilters.limit,
    productFilters.search,
    productFilters.sort,
    resolvedShopIds,
  ]);
  const { data: productsData, isFetching: productsFetching } = useAnalyticsProducts(productParams, {
    enabled: activeTab === 'products',
  });
  const locationParams = useMemo(() => {
    const limitValue = Number(locationLimit);
    const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.trunc(limitValue) : 10;
    return {
      ...(resolvedShopIds.length > 0 ? { shop_ids: resolvedShopIds } : {}),
      ...(appliedFilters.from ? { from: appliedFilters.from } : {}),
      ...(appliedFilters.to ? { to: appliedFilters.to } : {}),
      metric: locationMetric,
      limit,
    };
  }, [appliedFilters.from, appliedFilters.to, locationLimit, locationMetric, resolvedShopIds]);

  const { data: locationsData, isFetching: locationsFetching } = useAnalyticsLocations(locationParams);

  const previousParams = useMemo<AnalyticsKpisParams | undefined>(() => {
    if (!appliedFilters.compare || !previousRange) {
      return undefined;
    }

    return {
      ...(resolvedShopIds.length > 0 ? { shop_ids: resolvedShopIds } : {}),
      from: previousRange.from,
      to: previousRange.to,
    };
  }, [appliedFilters.compare, previousRange, resolvedShopIds]);

  const previousKpisQuery = useAnalyticsKpis(previousParams, { enabled: !!previousParams });

  const previousOrdersParams = useMemo<AnalyticsOrdersParams | undefined>(() => {
    if (!appliedFilters.compare || !previousRange) {
      return undefined;
    }

    return {
      ...(resolvedShopIds.length > 0 ? { shop_ids: resolvedShopIds } : {}),
      from: previousRange.from,
      to: previousRange.to,
      group_by: appliedFilters.groupBy,
    };
  }, [appliedFilters.compare, appliedFilters.groupBy, previousRange, resolvedShopIds]);

  const previousOrdersQuery = useAnalyticsOrders(previousOrdersParams, { enabled: !!previousOrdersParams });

  const previousData = previousKpisQuery.data;
  const previousOrdersData = previousOrdersQuery.data;
  const ordersComparisonTotals = useMemo(() => {
    if (
      !appliedFilters.compare ||
      !ordersData?.totals ||
      !previousOrdersData?.totals
    ) {
      return null;
    }

    const diffWithPercent = (currentValue: number, previousValue: number) => {
      const diff = currentValue - previousValue;
      const percent = previousValue !== 0 ? (diff / previousValue) * 100 : null;
      return { diff, percent };
    };

    return {
      ordersCount: diffWithPercent(ordersData.totals.orders_count ?? 0, previousOrdersData.totals.orders_count ?? 0),
      ordersValue: diffWithPercent(ordersData.totals.orders_value ?? 0, previousOrdersData.totals.orders_value ?? 0),
      ordersAverage: diffWithPercent(
        ordersData.totals.orders_average_value ?? 0,
        previousOrdersData.totals.orders_average_value ?? 0
      ),
      status: (() => {
        if (!ordersData.status_breakdown || !previousOrdersData.status_breakdown) {
          return [];
        }

        const previousMap = new Map(
          previousOrdersData.status_breakdown.map((item) => [item.status, item])
        );

        return ordersData.status_breakdown.map((current) => {
          const previous = previousMap.get(current.status);

          const countDiff = previous
            ? current.orders_count - previous.orders_count
            : current.orders_count;
          const shareDiff = previous
            ? current.share - previous.share
            : current.share;

          return {
            status: current.status,
            current,
            previous,
            countDiff,
            shareDiff,
          };
        });
      })(),
    };
  }, [appliedFilters.compare, ordersData, previousOrdersData]);
  const baseCurrency = data?.orders_base_currency ?? 'CZK';
  const ordersBaseCurrency = ordersData?.totals.base_currency ?? baseCurrency;
  const productsBaseCurrency = productsData?.meta?.base_currency ?? baseCurrency;
  const productSummary = productsData?.meta?.summary;
  const displayedProducts = productsData?.data ?? [];
  const productsTotalCount = productSummary?.products_total ?? displayedProducts.length;
  const productFiltersChanged =
    productFilters.limit !== 25 ||
    productFilters.sort !== 'revenue' ||
    productFilters.direction !== 'desc' ||
    productFilters.search.trim() !== '';
  const analyticsLocations = locationsData?.data ?? [];

  const formatNumber = (value: number | undefined, options?: Intl.NumberFormatOptions) =>
    typeof value === 'number'
      ? value.toLocaleString('cs-CZ', { maximumFractionDigits: 0, ...options })
      : '—';

  const formatCurrencyValue = (value: number | undefined, currency: string = baseCurrency) =>
    typeof value === 'number'
      ? `${value.toLocaleString('cs-CZ', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })} ${currency}`
      : '—';

  const formatCurrencyWithCode = (value: number, currency: string) =>
    new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);

  const formatPercentValue = (value: number | undefined, maximumFractionDigits = 1) =>
    typeof value === 'number'
      ? `${value.toLocaleString('cs-CZ', { maximumFractionDigits })} %`
      : '—';

  const formatSignedDecimal = (value: number, maximumFractionDigits = 2) =>
    new Intl.NumberFormat('cs-CZ', {
      maximumFractionDigits,
      minimumFractionDigits: 0,
      signDisplay: 'always',
    }).format(value);

  const metricDefinitions: Record<string, { label: string; type: 'number' | 'currency' | 'percentage' | 'decimal' }> = {
    products_total: { label: 'Produkty', type: 'number' },
    products_sold_total: { label: 'Prodáno kusů', type: 'number' },
    webhooks_downloaded: { label: 'Stažené snapshoty', type: 'number' },
    webhooks_failed: { label: 'Chyby snapshotů', type: 'number' },
    orders_total: { label: 'Objednávky celkem', type: 'number' },
    orders_total_value: { label: 'Obrat celkem', type: 'currency' },
    orders_average_value: { label: 'Průměrná hodnota objednávky', type: 'currency' },
    customers_total: { label: 'Zákazníci', type: 'number' },
    customers_repeat_ratio: { label: 'Podíl vracejících se zákazníků', type: 'percentage' },
    new_customers_total: { label: 'Noví zákazníci', type: 'number' },
    customers_orders_average: { label: 'Objednávky na zákazníka', type: 'decimal' },
  };

  const currentMetricValues: Record<string, number | null> = {
    products_total: data?.products_total ?? null,
    products_sold_total: data?.products_sold_total ?? null,
    webhooks_downloaded: data?.webhooks_downloaded ?? null,
    webhooks_failed: data?.webhooks_failed ?? null,
    orders_total: data?.orders_total ?? null,
    orders_total_value: data?.orders_total_value ?? null,
    orders_average_value: data?.orders_average_value ?? null,
    customers_total: data?.customers_total ?? null,
    customers_repeat_ratio: data?.customers_repeat_ratio ?? null,
    new_customers_total: data?.new_customers_total ?? null,
    customers_orders_average: data?.customers_orders_average ?? null,
  };

  const previousMetricValues: Record<string, number | null> | null = appliedFilters.compare && previousData
    ? {
        products_total: previousData.products_total ?? null,
        products_sold_total: previousData.products_sold_total ?? null,
        webhooks_downloaded: previousData.webhooks_downloaded ?? null,
        webhooks_failed: previousData.webhooks_failed ?? null,
        orders_total: previousData.orders_total ?? null,
        orders_total_value: previousData.orders_total_value ?? null,
        orders_average_value: previousData.orders_average_value ?? null,
        customers_total: previousData.customers_total ?? null,
        customers_repeat_ratio: previousData.customers_repeat_ratio ?? null,
        new_customers_total: previousData.new_customers_total ?? null,
        customers_orders_average: previousData.customers_orders_average ?? null,
      }
    : null;

  const formatSignedNumber = (value: number) =>
    new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0, signDisplay: 'always' }).format(value);

  const formatSignedCurrency = (value: number, currency: string) =>
    new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      signDisplay: 'always',
    }).format(value);

  const formatSignedPercent = (value: number) =>
    `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 1, signDisplay: 'always' }).format(value)}%`;

  const metricKeys = analyticsSettings?.visible_metrics?.length
    ? analyticsSettings.visible_metrics
    : Object.keys(metricDefinitions);

  const showMetricComparison = appliedFilters.compare && !!previousMetricValues;

  const metrics = metricKeys
    .filter((key): key is keyof typeof metricDefinitions => key in metricDefinitions)
    .map((key) => {
      const definition = metricDefinitions[key];
      const currentValue = currentMetricValues[key];
      const previousValue = previousMetricValues?.[key] ?? null;

      let formattedValue: string;

      if (definition.type === 'currency') {
        formattedValue = formatCurrencyValue(currentValue ?? undefined, baseCurrency);
      } else if (definition.type === 'decimal') {
        formattedValue = formatNumber(currentValue ?? undefined, {
          maximumFractionDigits: 2,
          minimumFractionDigits: 0,
        });
      } else if (definition.type === 'percentage') {
        const percentageValue = typeof currentValue === 'number' ? currentValue * 100 : undefined;
        formattedValue = formatPercentValue(percentageValue);
      } else {
        formattedValue = formatNumber(currentValue ?? undefined);
      }

      let deltaText: string | null = null;
      let deltaColor: string | undefined;

      if (
        showMetricComparison &&
        typeof currentValue === 'number' &&
        typeof previousValue === 'number'
      ) {
        const diff = currentValue - previousValue;
        const percent = previousValue !== 0 ? (diff / previousValue) * 100 : null;

        if (definition.type === 'currency') {
          const diffText = formatSignedCurrency(diff, baseCurrency);
          const percentText = percent !== null ? formatSignedPercent(percent) : null;
          deltaText = percentText ? `${diffText} (${percentText})` : diffText;
          deltaColor = diff >= 0 ? 'teal.6' : 'red.6';
        } else if (definition.type === 'percentage') {
          const diffPoints = diff * 100;
          const diffText = formatSignedPercent(diffPoints);
          const percentText = percent !== null ? formatSignedPercent(percent) : null;
          deltaText = percentText ? `${diffText} (${percentText})` : diffText;
          deltaColor = diff >= 0 ? 'teal.6' : 'red.6';
        } else if (definition.type === 'decimal') {
          const diffText = formatSignedDecimal(diff, 2);
          const percentText = percent !== null ? formatSignedPercent(percent) : null;
          deltaText = percentText ? `${diffText} (${percentText})` : diffText;
          deltaColor = diff >= 0 ? 'teal.6' : 'red.6';
        } else {
          const diffText = formatSignedNumber(diff);
          const percentText = percent !== null ? formatSignedPercent(percent) : null;
          deltaText = percentText ? `${diffText} (${percentText})` : diffText;
          deltaColor = diff >= 0 ? 'teal.6' : 'red.6';
        }
      }

      return {
        label: definition.label,
        value: formattedValue,
        deltaText,
        deltaColor,
      };
    });

  const handleRangeChange = (value: RangeOption) => {
    setFormFilters((current) => {
      if (value === 'custom') {
        return { ...current, range: value };
      }

      const { from, to } = calculateRangeDates(value);
      return { ...current, range: value, from, to };
    });
  };

  const handleApplyFilters = () => {
    setAppliedFilters((current) => ({
      ...current,
      ...formFilters,
      shopIds: [...formFilters.shopIds],
    }));
  };

  return (
    <PageShell
      className={classes.page}
      title="Analytika"
      description="Přehled výkonu napříč obchody s možností okamžitého porovnání."
    >
      <Card withBorder className={classes.sectionCard}>
        <div className={classes.sectionHeader}>
          <div className={classes.sectionHeaderTitle}>
            <Title order={4}>Filtry</Title>
            <Text size="sm" className={classes.sectionSubtitle}>
              Vyber e-shopy a období pro přehled metrik.
            </Text>
          </div>
          {isFetching && <Loader size="sm" />}
        </div>

        <div className={classes.filtersLayout}>
          <div className={classes.filtersToolbar}>
            <Select
              label="Období"
              data={RANGE_OPTIONS}
              value={formFilters.range}
              onChange={(value) => value && handleRangeChange(value as RangeOption)}
              comboboxProps={{ withinPortal: true }}
            />
            <Group gap="xs" align="center">
              <Switch
                label="Porovnat"
                checked={formFilters.compare}
                onChange={(event) => {
                  const { checked } = event.currentTarget;
                  setFormFilters((current) => ({ ...current, compare: checked }));
                }}
              />
              {formFilters.compare ? (
                <SegmentedControl
                  radius="xl"
                  className={classes.compareControl}
                  data={[
                    { label: 'Minulé období', value: 'previous_period' },
                    { label: 'Minulý rok', value: 'previous_year' },
                  ]}
                  value={formFilters.compareMode}
                  onChange={(value) =>
                    setFormFilters((current) => ({ ...current, compareMode: value as FiltersState['compareMode'] }))
                  }
                />
              ) : null}
            </Group>
            <Select
              label="Seskupení grafu"
              data={GROUP_BY_OPTIONS}
              value={formFilters.groupBy}
              onChange={(value) =>
                value && setFormFilters((current) => ({ ...current, groupBy: value as FiltersState['groupBy'] }))
              }
              comboboxProps={{ withinPortal: true }}
            />
          </div>
          <MultiSelect
            data={shopOptions}
            value={formFilters.shopIds}
            onChange={(value) => setFormFilters((current) => ({ ...current, shopIds: value }))}
            label="E-shopy"
            placeholder={shopsLoading ? 'Načítám e-shopy…' : 'Vyber e-shopy'}
            searchable
            clearable
            nothingFoundMessage="Nenalezeny žádné e-shopy"
            disabled={shopsLoading}
          />
          <Grid>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                type="date"
                label="Od"
                value={formFilters.from}
                onChange={(event) => {
                  const { value } = event.currentTarget;
                  setFormFilters((current) => ({ ...current, range: 'custom', from: value }));
                }}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput
                type="date"
                label="Do"
                value={formFilters.to}
                onChange={(event) => {
                  const { value } = event.currentTarget;
                  setFormFilters((current) => ({ ...current, range: 'custom', to: value }));
                }}
              />
            </Grid.Col>
          </Grid>
          {formFilters.compare && formPreviousRange ? (
            <Text size="xs" c="var(--app-text-tertiary)">
              Porovnání s obdobím {formPreviousRange.from} – {formPreviousRange.to}
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button onClick={handleApplyFilters} disabled={isFetching || ordersFetching}>
              Filtrovat
            </Button>
          </Group>
        </div>
      </Card>

      <Tabs value={activeTab} onChange={(value) => value && setActiveTab(value)} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="overview">Obecné</Tabs.Tab>
          <Tabs.Tab value="orders">Objednávky</Tabs.Tab>
          <Tabs.Tab value="products">Produkty</Tabs.Tab>
          <Tabs.Tab value="customers">Zákazníci</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="md">
          <Stack gap="lg">
            <Grid className={classes.metricsGrid}>
              {metrics.map((metric) => (
                <Grid.Col key={metric.label} span={{ base: 12, md: 4 }}>
                  <Card withBorder className={classes.metricCard} padding="lg">
                    <Text className={classes.metricLabel}>{metric.label}</Text>
                    <Text className={classes.metricValue}>{metric.value}</Text>
                    {metric.deltaText ? (
                      <Text size="xs" c={metric.deltaColor}>
                        {metric.deltaText}
                      </Text>
                    ) : null}
                  </Card>
                </Grid.Col>
              ))}
            </Grid>
            {data?.orders_value_by_currency?.length ? (
              <Card withBorder className={classes.tablesSection}>
                <Stack gap="sm">
                  <Text size="sm" fw={600}>
                    Obrat podle měny
                  </Text>
                  <ScrollArea offsetScrollbars type="auto" className={classes.tableScroll}>
                    <Table
                      highlightOnHover
                      withColumnBorders={false}
                      verticalSpacing="sm"
                      className={classes.dataTable}
                    >
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Měna</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Objednávky</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Obrat</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Přepočet ({baseCurrency})</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {data.orders_value_by_currency.map((entry) => (
                          <Table.Tr key={entry.currency}>
                            <Table.Td>{entry.currency}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>
                              {entry.orders_count.toLocaleString('cs-CZ')}
                            </Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>
                              {formatCurrencyWithCode(entry.total_amount, entry.currency)}
                            </Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>
                              {formatCurrencyValue(entry.total_amount_base)}
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Stack>
              </Card>
            ) : null}
            <Card withBorder className={classes.emptyCard}>
              <Text size="sm" c="dimmed">
                Přidej další metriky napojením BI nástrojů nebo rozšířením dat z Shoptetu.
              </Text>
            </Card>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="orders" pt="md">
          <Stack gap="lg">
            <Grid className={classes.metricsGrid}>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Card withBorder className={classes.metricCard} padding="lg">
                  <Text className={classes.metricLabel}>Objednávky</Text>
                  <Text className={classes.metricValue}>{formatNumber(ordersData?.totals.orders_count)}</Text>
                  {ordersComparisonTotals ? (
                    <Text
                      size="xs"
                      c={ordersComparisonTotals.ordersCount.diff >= 0 ? 'teal.6' : 'red.6'}
                    >
                      {formatSignedNumber(ordersComparisonTotals.ordersCount.diff)}
                      {ordersComparisonTotals.ordersCount.percent !== null
                        ? ` (${formatSignedPercent(ordersComparisonTotals.ordersCount.percent)})`
                        : ''}
                    </Text>
                  ) : null}
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Card withBorder className={classes.metricCard} padding="lg">
                  <Text className={classes.metricLabel}>Obrat ({ordersBaseCurrency})</Text>
                  <Text className={classes.metricValue}>
                    {formatCurrencyValue(ordersData?.totals.orders_value, ordersBaseCurrency)}
                  </Text>
                  {ordersComparisonTotals ? (
                    <Text
                      size="xs"
                      c={ordersComparisonTotals.ordersValue.diff >= 0 ? 'teal.6' : 'red.6'}
                    >
                      {formatSignedCurrency(ordersComparisonTotals.ordersValue.diff, ordersBaseCurrency)}
                      {ordersComparisonTotals.ordersValue.percent !== null
                        ? ` (${formatSignedPercent(ordersComparisonTotals.ordersValue.percent)})`
                        : ''}
                    </Text>
                  ) : null}
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Card withBorder className={classes.metricCard} padding="lg">
                  <Text className={classes.metricLabel}>Průměrná hodnota ({ordersBaseCurrency})</Text>
                  <Text className={classes.metricValue}>
                    {formatCurrencyValue(ordersData?.totals.orders_average_value, ordersBaseCurrency)}
                  </Text>
                  {ordersComparisonTotals ? (
                    <Text
                      size="xs"
                      c={ordersComparisonTotals.ordersAverage.diff >= 0 ? 'teal.6' : 'red.6'}
                    >
                      {formatSignedCurrency(ordersComparisonTotals.ordersAverage.diff, ordersBaseCurrency)}
                      {ordersComparisonTotals.ordersAverage.percent !== null
                        ? ` (${formatSignedPercent(ordersComparisonTotals.ordersAverage.percent)})`
                        : ''}
                    </Text>
                  ) : null}
                </Card>
              </Grid.Col>
            </Grid>

            <Card withBorder className={classes.sectionCard}>
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text size="sm" fw={600}>
                    Trend obratu
                  </Text>
                  {ordersFetching && <Loader size="sm" />}
                </Group>
                <AreaChart
                  h={260}
                  data={(ordersData?.time_series ?? []).map((entry) => ({
                    label: entry.label,
                    revenue: entry.revenue,
                  }))}
                  dataKey="label"
                  series={[{ name: 'revenue', label: `Obrat (${ordersBaseCurrency})`, color: 'indigo.5' }]}
                  curveType="monotone"
                  withDots={false}
                  withLegend
                />
              </Stack>
            </Card>

            <Card withBorder className={classes.tablesSection}>
              <Stack gap="sm">
                <Text size="sm" fw={600}>
                  Top produkty
                </Text>
                <ScrollArea offsetScrollbars type="auto" className={classes.tableScroll}>
                  <Table highlightOnHover verticalSpacing="sm" className={classes.dataTable}>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Kód</Table.Th>
                        <Table.Th>Produkt</Table.Th>
                        <Table.Th style={{ textAlign: 'right' }}>Ks</Table.Th>
                        <Table.Th style={{ textAlign: 'right' }}>Obrat ({ordersBaseCurrency})</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {ordersData?.top_products?.length ? (
                        ordersData.top_products.map((item) => (
                          <Table.Tr key={`${item.code ?? item.name}`}>
                            <Table.Td>{item.code ?? '—'}</Table.Td>
                            <Table.Td>{item.name}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>
                              {item.quantity.toLocaleString('cs-CZ')}
                            </Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>
                              {formatCurrencyValue(item.revenue, ordersBaseCurrency)}
                            </Table.Td>
                          </Table.Tr>
                        ))
                      ) : (
                        <Table.Tr>
                          <Table.Td colSpan={4}>
                            <Text size="sm" c="var(--app-text-tertiary)">
                              Zatím nejsou dostupné žádné prodeje pro vybrané období.
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Stack>
            </Card>

            <Card withBorder className={classes.tablesSection}>
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Text size="sm" fw={600}>
                    Top lokality
                  </Text>
                  <Group gap="xs" className={classes.locationsControls}>
                    <SegmentedControl
                      value={locationMetric}
                      onChange={(value) => setLocationMetric(value as 'orders' | 'revenue')}
                      data={[
                        { value: 'orders', label: 'Objednávky' },
                        { value: 'revenue', label: 'Obrat' },
                      ]}
                      size="xs"
                      disabled={analyticsLocations.length === 0}
                    />
                    <Select
                      value={locationLimit}
                      onChange={(value) => setLocationLimit(value ?? '10')}
                      data={[
                        { value: '5', label: 'Top 5' },
                        { value: '10', label: 'Top 10' },
                        { value: '20', label: 'Top 20' },
                      ]}
                      size="xs"
                      comboboxProps={{ withinPortal: true }}
                      disabled={analyticsLocations.length === 0}
                      aria-label="Počet zobrazených lokací"
                    />
                    {locationsFetching && <Loader size="xs" />}
                  </Group>
                </Group>
                {analyticsLocations.length === 0 ? (
                  <Text size="sm" c="var(--app-text-tertiary)">
                    Zatím nemáme k dispozici žádné lokality pro vybrané období.
                  </Text>
                ) : (
                  <ScrollArea offsetScrollbars type="auto" className={classes.tableScroll}>
                    <Table highlightOnHover verticalSpacing="sm" className={classes.dataTable}>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Lokace</Table.Th>
                          <Table.Th>PSČ</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Objednávky</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Obrat ({ordersBaseCurrency})</Table.Th>
                          <Table.Th>Top produkt</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {analyticsLocations.map((location) => (
                          <Table.Tr key={`${location.city}-${location.postal_code}`}>
                            <Table.Td>
                              <Text fw={600}>{location.city}</Text>
                              <Text size="xs" c="var(--app-text-tertiary)">
                                {location.region ?? 'Bez regionu'}
                              </Text>
                            </Table.Td>
                            <Table.Td>{location.postal_code}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>
                              {location.orders_count.toLocaleString('cs-CZ')}
                            </Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>
                              {formatCurrencyValue(location.revenue_base, ordersBaseCurrency)}
                            </Table.Td>
                            <Table.Td>
                              {location.top_product ? (
                                <Stack gap={2}>
                                  <Text>{location.top_product.name}</Text>
                                  {typeof location.top_product.quantity === 'number' ? (
                                    <Text size="xs" c="var(--app-text-tertiary)">
                                      {`${location.top_product.quantity.toLocaleString('cs-CZ')} ks`}
                                    </Text>
                                  ) : null}
                                </Stack>
                              ) : (
                                <Text size="sm" c="var(--app-text-tertiary)">
                                  Bez dat
                                </Text>
                              )}
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                )}
              </Stack>
            </Card>

            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Card withBorder className={classes.tablesSection}>
                  <Stack gap="sm">
                    <Text size="sm" fw={600}>
                      Podíl plateb
                    </Text>
                    <Table highlightOnHover verticalSpacing="sm" className={classes.dataTable}>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Platební metoda</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Objednávky</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Podíl</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {ordersData?.payment_breakdown?.length ? (
                          ordersData.payment_breakdown.map((item) => (
                            <Table.Tr key={`payment-${item.method}`}>
                              <Table.Td>{item.method}</Table.Td>
                              <Table.Td style={{ textAlign: 'right' }}>
                                {item.count.toLocaleString('cs-CZ')}
                              </Table.Td>
                              <Table.Td style={{ textAlign: 'right' }}>
                                {formatPercentValue(item.share, 1)}
                              </Table.Td>
                            </Table.Tr>
                          ))
                        ) : (
                          <Table.Tr>
                            <Table.Td colSpan={3}>
                              <Text size="sm" c="var(--app-text-tertiary)">
                                Nenašli jsme žádná data o platbách pro vybrané období.
                              </Text>
                            </Table.Td>
                          </Table.Tr>
                        )}
                      </Table.Tbody>
                    </Table>
                  </Stack>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Card withBorder className={classes.tablesSection}>
                  <Stack gap="sm">
                    <Text size="sm" fw={600}>
                      Podíl doprav
                    </Text>
                    <Table highlightOnHover verticalSpacing="sm" className={classes.dataTable}>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Doprava</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Objednávky</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Podíl</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {ordersData?.shipping_breakdown?.length ? (
                          ordersData.shipping_breakdown.map((item) => (
                            <Table.Tr key={`shipping-${item.method}`}>
                              <Table.Td>{item.method}</Table.Td>
                              <Table.Td style={{ textAlign: 'right' }}>
                                {item.count.toLocaleString('cs-CZ')}
                              </Table.Td>
                              <Table.Td style={{ textAlign: 'right' }}>
                                {formatPercentValue(item.share, 1)}
                              </Table.Td>
                            </Table.Tr>
                          ))
                        ) : (
                          <Table.Tr>
                            <Table.Td colSpan={3}>
                              <Text size="sm" c="var(--app-text-tertiary)">
                                Zatím nemáme informace o dopravě pro vybrané období.
                              </Text>
                            </Table.Td>
                          </Table.Tr>
                        )}
                      </Table.Tbody>
                    </Table>
                  </Stack>
                </Card>
              </Grid.Col>
            </Grid>

            <Card withBorder className={classes.tablesSection}>
              <Stack gap="sm">
                <Text size="sm" fw={600}>
                  Přehled stavů objednávek
                </Text>
                {ordersComparisonTotals?.status?.length ? (
                  <Text size="xs" c="var(--app-text-tertiary)">
                    Změna v porovnání s předchozím obdobím je uvedena u každého stavu.
                  </Text>
                ) : null}
                <Table highlightOnHover verticalSpacing="sm" className={classes.dataTable}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Stav</Table.Th>
                      <Table.Th style={{ textAlign: 'right' }}>Objednávky</Table.Th>
                      <Table.Th style={{ textAlign: 'right' }}>Podíl</Table.Th>
                      <Table.Th style={{ textAlign: 'right' }}>Obrat ({ordersBaseCurrency})</Table.Th>
                      {ordersComparisonTotals?.status?.length ? (
                        <>
                          <Table.Th style={{ textAlign: 'right' }}>Δ Objednávky</Table.Th>
                          <Table.Th style={{ textAlign: 'right' }}>Δ Podíl</Table.Th>
                        </>
                      ) : null}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {ordersData?.status_breakdown?.length ? (
                      ordersData.status_breakdown.map((item) => {
                        const comparison = ordersComparisonTotals?.status?.find((entry) => entry.status === item.status);

                        return (
                          <Table.Tr key={`status-${item.status}`}>
                            <Table.Td>{item.status}</Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>
                              {item.orders_count.toLocaleString('cs-CZ')}
                            </Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>
                              {formatPercentValue(item.share, 2)}
                            </Table.Td>
                            <Table.Td style={{ textAlign: 'right' }}>
                              {formatCurrencyValue(item.revenue_base, ordersBaseCurrency)}
                            </Table.Td>
                            {comparison ? (
                              <>
                                <Table.Td style={{ textAlign: 'right', color: comparison.countDiff >= 0 ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-red-6)' }}>
                                  {formatSignedNumber(comparison.countDiff)}
                                </Table.Td>
                                <Table.Td style={{ textAlign: 'right', color: comparison.shareDiff >= 0 ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-red-6)' }}>
                                  {formatSignedDecimal(comparison.shareDiff, 2)}%
                                </Table.Td>
                              </>
                            ) : (
                              ordersComparisonTotals?.status?.length ? (
                                <>
                                  <Table.Td style={{ textAlign: 'right' }}>—</Table.Td>
                                  <Table.Td style={{ textAlign: 'right' }}>—</Table.Td>
                                </>
                              ) : null
                            )}
                          </Table.Tr>
                        );
                      })
                    ) : (
                      <Table.Tr>
                        <Table.Td colSpan={4}>
                          <Text size="sm" c="var(--app-text-tertiary)">
                            Pro vybrané období nejsou dostupné žádné objednávky.
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </Stack>
            </Card>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="products" pt="md">
          <Stack gap="lg">
            <Stack gap="md">
              <Group align="flex-end" gap="md" wrap="wrap">
                <TextInput
                  label="Hledat produkt"
                  placeholder="Název, kód nebo značka"
                  value={productFilters.search}
                  onChange={(event) =>
                    setProductFilters((current) => ({
                      ...current,
                      search: event.currentTarget.value,
                    }))
                  }
                  style={{ flex: 1, minWidth: '220px' }}
                />
                <Select
                  label="Řadit podle"
                  data={PRODUCT_SORT_OPTIONS}
                  value={productFilters.sort}
                  onChange={(value) =>
                    value &&
                    setProductFilters((current) => ({
                      ...current,
                      sort: value as ProductFiltersState['sort'],
                    }))
                  }
                  w={220}
                />
                <Select
                  label="Směr"
                  data={PRODUCT_DIRECTION_OPTIONS}
                  value={productFilters.direction}
                  onChange={(value) =>
                    value &&
                    setProductFilters((current) => ({
                      ...current,
                      direction: value as ProductFiltersState['direction'],
                    }))
                  }
                  w={160}
                />
                <NumberInput
                  label="Počet položek"
                  min={1}
                  max={200}
                  value={productFilters.limit}
                  onChange={(value) => {
                    if (typeof value === 'number' && Number.isFinite(value)) {
                      setProductFilters((current) => ({
                        ...current,
                        limit: value,
                      }));
                    }
                  }}
                  clampBehavior="blur"
                  w={140}
                />
                <Button
                  variant="subtle"
                  onClick={() =>
                    setProductFilters({
                      limit: 25,
                      sort: 'revenue',
                      direction: 'desc',
                      search: '',
                    })
                  }
                  disabled={!productFiltersChanged}
                  style={{ marginLeft: 'auto' }}
                >
                  Reset
                </Button>
              </Group>

              {productSummary ? (
                <Grid className={classes.metricsGrid}>
                  <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                    <Card withBorder className={classes.metricCard} padding="lg">
                      <Text className={classes.metricLabel}>Tržby ({productsBaseCurrency})</Text>
                      <Text className={classes.metricValue}>
                        {formatCurrencyValue(productSummary.revenue_total_base, productsBaseCurrency)}
                      </Text>
                    </Card>
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                    <Card withBorder className={classes.metricCard} padding="lg">
                      <Text className={classes.metricLabel}>Prodáno ks</Text>
                      <Text className={classes.metricValue}>
                        {formatNumber(productSummary.units_sold_total, { maximumFractionDigits: 2 })}
                      </Text>
                    </Card>
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                    <Card withBorder className={classes.metricCard} padding="lg">
                      <Text className={classes.metricLabel}>Zákazníci celkem</Text>
                      <Text className={classes.metricValue}>
                        {formatNumber(productSummary.unique_customers_total)}
                      </Text>
                    </Card>
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                    <Card withBorder className={classes.metricCard} padding="lg">
                      <Text className={classes.metricLabel}>Repeat ratio</Text>
                      <Text className={classes.metricValue}>
                        {formatPercentValue(productSummary.repeat_purchase_rate_average * 100, 1)}
                      </Text>
                    </Card>
                  </Grid.Col>
                </Grid>
              ) : null}
            </Stack>

            <Card withBorder className={classes.sectionCard}>
              <Stack gap="md">
                <Group justify="space-between">
                  <Text size="sm" fw={600}>
                    Žebříček produktů
                  </Text>
                  {productsFetching && <Loader size="sm" />}
                </Group>
                {productsFetching && displayedProducts.length === 0 ? (
                  <Group justify="center" py="xl">
                    <Loader />
                  </Group>
                ) : (
                  <>
                    <ScrollArea offsetScrollbars type="auto" className={classes.tableScroll}>
                      <Table highlightOnHover verticalSpacing="sm" className={classes.dataTable}>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th style={{ width: '48px' }}>#</Table.Th>
                            <Table.Th>Produkt</Table.Th>
                            <Table.Th style={{ textAlign: 'right' }}>Objednávky</Table.Th>
                            <Table.Th style={{ textAlign: 'right' }}>Ks</Table.Th>
                            <Table.Th style={{ textAlign: 'right' }}>Tržby ({productsBaseCurrency})</Table.Th>
                            <Table.Th style={{ textAlign: 'right' }}>Cena / ks</Table.Th>
                            <Table.Th style={{ textAlign: 'right' }}>Zákazníci</Table.Th>
                            <Table.Th style={{ textAlign: 'right' }}>Opakované</Table.Th>
                            <Table.Th style={{ textAlign: 'right' }}>Repeat %</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {displayedProducts.length ? (
                            displayedProducts.map((product) => {
                              const breakdownEntries = product.revenue_breakdown
                                .filter(
                                  (entry) =>
                                    product.revenue_breakdown.length > 1 ||
                                    entry.currency !== productsBaseCurrency
                                )
                                .map((entry) => formatCurrencyWithCode(entry.amount, entry.currency));
                              const breakdownText =
                                breakdownEntries.length > 0 ? breakdownEntries.join(' • ') : null;
                              const secondaryName =
                                product.product_name && product.product_name !== product.name
                                  ? product.product_name
                                  : null;
                              const metaParts = [product.brand, product.variant_code, product.ean ? `EAN: ${product.ean}` : null].filter(
                                (part): part is string => Boolean(part && String(part).trim() !== '')
                              );

                              return (
                                <Table.Tr
                                  key={`${product.variant_code ?? ''}-${product.product_guid ?? ''}-${product.rank}`}
                                >
                                  <Table.Td>{product.rank}</Table.Td>
                                  <Table.Td>
                                    <Stack gap={2}>
                                      <Text fw={600}>{product.name}</Text>
                                      {secondaryName ? (
                                        <Text size="sm" c="var(--app-text-tertiary)">
                                          {secondaryName}
                                        </Text>
                                      ) : null}
                                      {metaParts.length > 0 ? (
                                        <Text size="xs" c="var(--app-text-tertiary)">
                                          {metaParts.join(' • ')}
                                        </Text>
                                      ) : null}
                                    </Stack>
                                  </Table.Td>
                                  <Table.Td style={{ textAlign: 'right' }}>
                                    {formatNumber(product.orders_count)}
                                  </Table.Td>
                                  <Table.Td style={{ textAlign: 'right' }}>
                                    {formatNumber(product.units_sold, { maximumFractionDigits: 2 })}
                                  </Table.Td>
                                  <Table.Td style={{ textAlign: 'right' }}>
                                    <Stack gap={2} align="flex-end">
                                      <Text>{formatCurrencyValue(product.revenue_base, productsBaseCurrency)}</Text>
                                      {breakdownText ? (
                                        <Text size="xs" c="var(--app-text-tertiary)" ta="right">
                                          {breakdownText}
                                        </Text>
                                      ) : null}
                                    </Stack>
                                  </Table.Td>
                                  <Table.Td style={{ textAlign: 'right' }}>
                                    {typeof product.average_unit_price_base === 'number'
                                      ? formatCurrencyValue(product.average_unit_price_base, productsBaseCurrency)
                                      : '—'}
                                  </Table.Td>
                                  <Table.Td style={{ textAlign: 'right' }}>
                                    {formatNumber(product.unique_customers)}
                                  </Table.Td>
                                  <Table.Td style={{ textAlign: 'right' }}>
                                    {formatNumber(product.repeat_customers)}
                                  </Table.Td>
                                  <Table.Td style={{ textAlign: 'right' }}>
                                    {formatPercentValue(product.repeat_purchase_rate * 100, 1)}
                                  </Table.Td>
                                </Table.Tr>
                              );
                            })
                          ) : (
                            <Table.Tr>
                              <Table.Td colSpan={9}>
                                <Text size="sm" c="var(--app-text-tertiary)">
                                  Pro zadané filtrovací podmínky jsme nenašli žádné prodeje produktů.
                                </Text>
                              </Table.Td>
                            </Table.Tr>
                          )}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                    {displayedProducts.length ? (
                      <Text size="xs" c="var(--app-text-tertiary)">
                        Zobrazeno {displayedProducts.length} z {productsTotalCount} produktů.
                      </Text>
                    ) : null}
                  </>
                )}
              </Stack>
            </Card>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="customers" pt="md">
          <Stack gap="lg">
            <Card withBorder className={classes.sectionCard}>
              <Stack gap="sm">
                <Text size="sm" fw={600}>
                  Podíl vracejících se zákazníků
                </Text>
                <Group align="baseline" gap="md">
                  <Title order={2}>
                    {formatPercentValue(
                      typeof data?.customers_repeat_ratio === 'number'
                        ? data.customers_repeat_ratio * 100
                        : undefined,
                      1
                    )}
                  </Title>
                  <Text size="sm" c="var(--app-text-tertiary)">
                    Počítáme zákazníky s objednávkou v období, kteří už dříve dokončili alespoň jednu objednávku.
                  </Text>
                </Group>
                <Group gap="lg">
                  <Stack gap={2}>
                    <Text size="xs" c="var(--app-text-tertiary)">
                      Zákazníci s dřívější objednávkou
                    </Text>
                    <Text size="sm" fw={600}>
                      {(data?.returning_customers_total ?? 0).toLocaleString('cs-CZ')}
                    </Text>
                  </Stack>
                  <Stack gap={2}>
                    <Text size="xs" c="var(--app-text-tertiary)">
                      Jedineční zákazníci s e-mailem
                    </Text>
                    <Text size="sm" fw={600}>
                      {(data?.unique_customers_total ?? 0).toLocaleString('cs-CZ')}
                    </Text>
                  </Stack>
                  {typeof data?.repeat_customers_period_total === 'number' ? (
                    <Stack gap={2}>
                      <Text size="xs" c="var(--app-text-tertiary)">
                        2+ objednávky v období
                      </Text>
                      <Text size="sm" fw={600}>
                        {data.repeat_customers_period_total.toLocaleString('cs-CZ')}
                      </Text>
                    </Stack>
                  ) : null}
                  {typeof data?.new_customers_total === 'number' ? (
                    <Stack gap={2}>
                    <Text size="xs" c="var(--app-text-tertiary)">
                      Noví zákazníci v období
                    </Text>
                      <Text size="sm" fw={600}>
                        {data.new_customers_total.toLocaleString('cs-CZ')}
                      </Text>
                    </Stack>
                  ) : null}
                </Group>
              </Stack>
            </Card>

            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Card withBorder className={classes.metricCard} padding="lg">
                  <Stack gap="xs">
                    <Text size="xs" c="var(--app-text-tertiary)">
                      Obrat vracejících se zákazníků
                    </Text>
                    <Title order={4}>
                      {formatCurrencyValue(data?.returning_revenue_base, baseCurrency)}
                    </Title>
                    <Text size="xs" c="var(--app-text-tertiary)">
                      {`Objednávky: ${(data?.returning_orders_total ?? 0).toLocaleString('cs-CZ')}`}
                    </Text>
                  </Stack>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Card withBorder className={classes.metricCard} padding="lg">
                  <Stack gap="xs">
                    <Text size="xs" c="var(--app-text-tertiary)">
                      Obrat nových zákazníků
                    </Text>
                    <Title order={4}>
                      {formatCurrencyValue(data?.new_revenue_base, baseCurrency)}
                    </Title>
                    <Text size="xs" c="var(--app-text-tertiary)">
                      {`Objednávky: ${(data?.new_orders_total ?? 0).toLocaleString('cs-CZ')}`}
                    </Text>
                  </Stack>
                </Card>
              </Grid.Col>
            </Grid>

            {typeof data?.orders_without_email_total === 'number' && data.orders_without_email_total > 0 ? (
              <Alert variant="light" color="yellow">
                <Text size="sm" c="var(--app-text-primary)">
                  {`Ve vybraném období evidujeme ${(data.orders_without_email_total).toLocaleString('cs-CZ')} objednávek bez e-mailu zákazníka. Ty nejsou započítané do statistik vracejících se nebo nových zákazníků.`}
                </Text>
              </Alert>
            ) : null}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </PageShell>
  );
};
