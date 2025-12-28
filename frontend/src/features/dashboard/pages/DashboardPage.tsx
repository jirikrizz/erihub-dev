import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Grid,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Select,
  Skeleton,
  SegmentedControl,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconPinFilled, IconTrash } from '@tabler/icons-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { cs } from 'date-fns/locale';
import type { DashboardNote, DashboardNotePayload, DashboardRangeSelection } from '../../../api/dashboard';
import {
  createDashboardNote,
  deleteDashboardNote,
  updateDashboardNote,
} from '../../../api/dashboard';
import { useDashboardSummary } from '../hooks/useDashboardSummary';
import { useDashboardNotes } from '../hooks/useDashboardNotes';
import { useShops } from '../../shoptet/hooks/useShops';
import classes from './DashboardPage.module.css';
import { PageShell } from '../../../components/layout/PageShell';
import { useUserPreference } from '../../../hooks/useUserPreference';
import { shopProviderOptions } from '../../../constants/shopProviders';
import { ShopProviderBadge } from '../../../components/shop/ShopProviderBadge';
import { SectionCard } from '../../../components/ui/SectionCard';
import { MetricGrid } from '../../../components/ui/MetricGrid';

const formatNumber = (value: number, options?: Intl.NumberFormatOptions) =>
  Number.isFinite(value) ? new Intl.NumberFormat('cs-CZ', options).format(value) : '0';

const formatCurrency = (value: number, currency: string) =>
  Number.isFinite(value)
    ? new Intl.NumberFormat('cs-CZ', { style: 'currency', currency }).format(value)
    : `0\u00a0${currency}`;

const formatPercent = (value: number, maximumFractionDigits = 1) =>
  `${new Intl.NumberFormat('cs-CZ', {
    maximumFractionDigits,
  }).format(value * 100)}\u00a0%`;

const visibilityOptions = [
  { value: 'public', label: 'Veřejná' },
  { value: 'private', label: 'Soukromá' },
];

const rangeOptions: Array<{ value: DashboardRangeSelection; label: string }> = [
  { value: 'last_24h', label: 'Posledních 24 h' },
  { value: 'today', label: 'Dnešek' },
  { value: 'yesterday', label: 'Včera' },
];

const rangeDescriptionMap: Record<DashboardRangeSelection, string> = {
  last_24h: 'posledních 24 hodin',
  today: 'dnešní den',
  yesterday: 'včerejší den',
};

type DashboardSummaryPreference = {
  range?: DashboardRangeSelection;
  shop_ids?: number[];
  providers?: string[];
};

const noteToFormValues = (note?: DashboardNote) => ({
  title: note?.title ?? '',
  content: note?.content ?? '',
  visibility: note?.visibility ?? 'public',
  isPinned: note?.is_pinned ?? false,
});

const noteValidation = {
  content: (value: string) => (value.trim().length === 0 ? 'Poznámka nesmí být prázdná.' : null),
  visibility: (value: string) => (value === 'public' || value === 'private' ? null : 'Vyber viditelnost.'),
};

const formValuesToPayload = (values: ReturnType<typeof noteToFormValues>): DashboardNotePayload => ({
  title: values.title?.trim() === '' ? null : values.title,
  content: values.content.trim(),
  visibility: values.visibility as DashboardNotePayload['visibility'],
  is_pinned: values.isPinned,
});

const formatRelativeTime = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  try {
    return formatDistanceToNow(parseISO(value), { locale: cs, addSuffix: true });
  } catch {
    return null;
  }
};

export const DashboardPage = () => {
  const queryClient = useQueryClient();
  const [rangeSelection, setRangeSelection] = useState<DashboardRangeSelection>('last_24h');
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const resolvedShopIds = useMemo(
    () =>
      selectedShopIds
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.trunc(value)),
    [selectedShopIds]
  );
  const normalizedShopIds = useMemo(
    () => [...resolvedShopIds].sort((left, right) => left - right),
    [resolvedShopIds]
  );
  const resolvedProviders = useMemo(
    () =>
      Array.from(
        new Set(
          selectedProviders
            .map((value) => value.trim().toLowerCase())
            .filter((value) => value !== '')
        )
      ).sort((left, right) => left.localeCompare(right)),
    [selectedProviders]
  );
  const {
    value: storedPreference,
    isLoading: preferenceLoading,
    save: saveDashboardPreference,
  } = useUserPreference<DashboardSummaryPreference>('dashboard.summary.filters');
  const [preferenceHydrated, setPreferenceHydrated] = useState(false);
  const preferenceSaveTimeoutRef = useRef<number | null>(null);
  const lastSavedPreferenceRef = useRef<string | null>(null);
  const { data: shopsData, isLoading: shopsLoading } = useShops({ per_page: 100, provider: 'all' });
  const shopOptions = useMemo(
    () =>
      (shopsData?.data ?? []).map((shop) => ({
        value: String(shop.id),
        label: shop.name ?? shop.domain ?? `Shop ${shop.id}`,
      })),
    [shopsData]
  );
  const providerOptions = useMemo(
    () => shopProviderOptions((shopsData?.data ?? []).map((shop) => shop.provider ?? 'shoptet')),
    [shopsData]
  );
  const { data: summary, isLoading: summaryLoading, error: summaryError } = useDashboardSummary(
    rangeSelection,
    normalizedShopIds,
    resolvedProviders
  );
  const isDefaultPreference = useCallback((preference: DashboardSummaryPreference | null) => {
    if (!preference) {
      return true;
    }

    const range = preference.range ?? 'last_24h';
    const hasShopFilter = Array.isArray(preference.shop_ids) && preference.shop_ids.length > 0;
    const hasProviderFilter = Array.isArray(preference.providers) && preference.providers.length > 0;

    return range === 'last_24h' && !hasShopFilter && !hasProviderFilter;
  }, []);
  useEffect(() => {
    if (preferenceHydrated || preferenceLoading) {
      return;
    }

    const preference = storedPreference ?? null;

    const normalizedRange = (preference?.range && ['last_24h', 'today', 'yesterday'].includes(preference.range))
      ? preference.range
      : 'last_24h';

    const normalizedShops =
      Array.isArray(preference?.shop_ids)
        ? preference!.shop_ids
            .map((value) => (typeof value === 'number' ? value : Number(value)))
            .filter((value) => Number.isFinite(value) && value > 0)
            .map((value) => Math.trunc(value))
        : [];

    const normalizedProviders =
      Array.isArray(preference?.providers)
        ? Array.from(
            new Set(
              preference!.providers
                .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
                .filter((value) => value !== '')
            )
          ).sort((left, right) => left.localeCompare(right))
        : [];

    setRangeSelection(normalizedRange);
    setSelectedShopIds(normalizedShops.map((value) => String(value)));
    setSelectedProviders(normalizedProviders);
    setPreferenceHydrated(true);

    const normalizedPreference: DashboardSummaryPreference = {
      range: normalizedRange,
    };

    if (normalizedShops.length > 0) {
      normalizedPreference.shop_ids = normalizedShops;
    }

    if (normalizedProviders.length > 0) {
      normalizedPreference.providers = normalizedProviders;
    }

    lastSavedPreferenceRef.current = isDefaultPreference(normalizedPreference)
      ? '__default__'
      : JSON.stringify(normalizedPreference);
  }, [
    isDefaultPreference,
    preferenceHydrated,
    preferenceLoading,
    storedPreference,
  ]);
  const buildPreferencePayload = useCallback((): DashboardSummaryPreference => {
    const payload: DashboardSummaryPreference = {
      range: rangeSelection,
    };

    if (normalizedShopIds.length > 0) {
      payload.shop_ids = normalizedShopIds;
    }

    if (resolvedProviders.length > 0) {
      payload.providers = resolvedProviders;
    }

    return payload;
  }, [rangeSelection, normalizedShopIds, resolvedProviders]);
  useEffect(() => {
    if (!preferenceHydrated) {
      return;
    }

    const payload = buildPreferencePayload();
    const isDefault = isDefaultPreference(payload);
    const serialized = isDefault ? '__default__' : JSON.stringify(payload);

    if (lastSavedPreferenceRef.current === serialized) {
      return;
    }

    if (preferenceSaveTimeoutRef.current !== null) {
      window.clearTimeout(preferenceSaveTimeoutRef.current);
    }

    preferenceSaveTimeoutRef.current = window.setTimeout(() => {
      lastSavedPreferenceRef.current = serialized;

      if (isDefault) {
        saveDashboardPreference(null);
      } else {
        saveDashboardPreference(payload);
      }
    }, 400);
  }, [
    buildPreferencePayload,
    isDefaultPreference,
    preferenceHydrated,
    saveDashboardPreference,
  ]);
  useEffect(() => {
    return () => {
      if (preferenceSaveTimeoutRef.current !== null) {
        window.clearTimeout(preferenceSaveTimeoutRef.current);
      }
    };
  }, []);
const {
  data: notes,
  isLoading: notesLoading,
  error: notesError,
} = useDashboardNotes(50);
const deferredSummary = useDeferredValue(summary);
  const [deferredContentVisible, setDeferredContentVisible] = useState(false);

  useEffect(() => {
    // Odlož vyrenderování těžších sekcí, aby se první paint zrychlil
    const idle = (window as any).requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 120));
    const cancelIdle =
      (window as any).cancelIdleCallback ?? ((id: number) => window.clearTimeout(id as unknown as number));

    const handle = idle(() => setDeferredContentVisible(true), { timeout: 250 });
    return () => cancelIdle(handle);
  }, []);
  const effectiveRange: DashboardRangeSelection = summary?.range.selection ?? rangeSelection;

  const [editingNote, setEditingNote] = useState<DashboardNote | null>(null);
  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false);

  const createForm = useForm({
    initialValues: noteToFormValues(),
    validate: noteValidation,
  });

  const editForm = useForm({
    initialValues: noteToFormValues(),
    validate: noteValidation,
  });

  const createMutation = useMutation({
    mutationFn: (payload: DashboardNotePayload) => createDashboardNote(payload),
    onSuccess: () => {
      notifications.show({ message: 'Poznámka byla přidána.', color: 'green' });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'notes'] });
      createForm.reset();
    },
    onError: () => {
      notifications.show({ message: 'Uložení poznámky se nezdařilo.', color: 'red' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: DashboardNotePayload }) =>
      updateDashboardNote(id, payload),
    onSuccess: () => {
      notifications.show({ message: 'Poznámka byla upravena.', color: 'green' });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'notes'] });
      closeEdit();
    },
    onError: () => {
      notifications.show({ message: 'Úprava poznámky se nezdařila.', color: 'red' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDashboardNote(id),
    onSuccess: () => {
      notifications.show({ message: 'Poznámka byla odstraněna.', color: 'green' });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'notes'] });
    },
    onError: () => {
      notifications.show({ message: 'Smazání poznámky selhalo.', color: 'red' });
    },
  });

  const stats = useMemo(() => {
    if (!deferredSummary) {
      return [];
    }

    return [
      {
        label: 'Dokončené objednávky',
        value: formatNumber(deferredSummary.totals.orders),
        description: 'Počet dokončených objednávek za 24 hodin.',
      },
      {
        label: 'Tržby (24h)',
        value: formatCurrency(deferredSummary.totals.revenue_base, deferredSummary.base_currency),
        description: `Součet všech objednávek v základní měně (${deferredSummary.base_currency}).`,
      },
      {
        label: 'Průměrná hodnota objednávky',
        value: formatCurrency(deferredSummary.totals.average_order_value_base, deferredSummary.base_currency),
        description: 'Průměr v základní měně za poslední den.',
      },
      {
        label: 'Prodáno kusů',
        value: formatNumber(deferredSummary.totals.items_sold, { maximumFractionDigits: 1 }),
        description: 'Celkový počet kusů prodaných napříč obchody.',
      },
      {
        label: 'Noví zákazníci',
        value: formatNumber(deferredSummary.totals.new_customers),
        description: 'Počet nově založených zákazníků.',
      },
      {
        label: 'Aktivní zákazníci',
        value: formatNumber(deferredSummary.totals.active_customers),
        description: 'Unikátní zákazníci s objednávkou v posledních 24 hodinách.',
      },
      {
        label: 'Vrací se k nákupu',
        value: formatNumber(deferredSummary.totals.returning_customers),
        description: `Zákazníci s historií před aktuálním obdobím (${formatPercent(deferredSummary.totals.returning_customers_share)}).`,
      },
      {
        label: 'Vrací se zákazníci (%)',
        value: formatPercent(deferredSummary.totals.returning_customers_share),
        description: 'Podíl aktivních zákazníků se starší objednávkou.',
      },
    ];
  }, [deferredSummary]);

  const handleCreateSubmit = createForm.onSubmit((values) => {
    const payload = formValuesToPayload(values);
    createMutation.mutate(payload);
  });

  const handleEditOpen = (note: DashboardNote) => {
    createForm.clearErrors();
    editForm.clearErrors();
    setEditingNote(note);
    editForm.setValues(noteToFormValues(note));
    openEdit();
  };

  const handleEditSubmit = editForm.onSubmit((values) => {
    if (!editingNote) {
      return;
    }

    const payload = formValuesToPayload(values);
    updateMutation.mutate({ id: editingNote.id, payload });
  });

  const handleDelete = (note: DashboardNote) => {
    deleteMutation.mutate(note.id);
  };

  const topShopsRows = useMemo(
    () => (deferredSummary?.top_shops ?? []).slice(0, 8),
    [deferredSummary?.top_shops]
  );
  const topProductsRows = useMemo(
    () => (deferredSummary?.top_products ?? []).slice(0, 8),
    [deferredSummary?.top_products]
  );
  const couponUsageRows = useMemo(
    () => (deferredSummary?.coupon_usage ?? []).slice(0, 10),
    [deferredSummary?.coupon_usage]
  );
  const paymentBreakdownRows = useMemo(
    () => (deferredSummary?.payment_breakdown ?? []).slice(0, 10),
    [deferredSummary?.payment_breakdown]
  );
  const shippingBreakdownRows = useMemo(
    () => (deferredSummary?.shipping_breakdown ?? []).slice(0, 10),
    [deferredSummary?.shipping_breakdown]
  );
  const topLocationsRows = useMemo(
    () => (deferredSummary?.top_locations ?? []).slice(0, 20),
    [deferredSummary?.top_locations]
  );
  const statusBreakdownRows = useMemo(
    () => (deferredSummary?.status_breakdown ?? []).slice(0, 12),
    [deferredSummary?.status_breakdown]
  );
  const [locationSort, setLocationSort] = useState<'orders' | 'revenue'>('orders');
  const [locationLimit, setLocationLimit] = useState<string>('8');
  const locationLimitNumber = useMemo(() => {
    const parsed = Number(locationLimit);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 8;
  }, [locationLimit]);
  const visibleTopLocations = useMemo(() => {
    const rows = [...topLocationsRows];

    if (locationSort === 'revenue') {
      rows.sort((left, right) => {
        if (right.revenue_base === left.revenue_base) {
          return right.orders_count - left.orders_count;
        }
        return right.revenue_base - left.revenue_base;
      });
    } else {
      rows.sort((left, right) => {
        if (right.orders_count === left.orders_count) {
          return right.revenue_base - left.revenue_base;
        }
        return right.orders_count - left.orders_count;
      });
    }

    return rows.slice(0, locationLimitNumber);
  }, [topLocationsRows, locationSort, locationLimitNumber]);
  const comparison = deferredSummary?.comparison ?? null;

  const rangeDescriptor = rangeDescriptionMap[effectiveRange];
  const timezone = deferredSummary?.range.timezone ?? 'UTC';

  return (
    <PageShell
      title="Dashboard"
      description={`Souhrn metrik pro ${rangeDescriptor} (časová zóna ${timezone}).`}
      actions={
        <>
          <MultiSelect
            data={providerOptions}
            value={selectedProviders}
            onChange={(value) => {
              const normalized = Array.from(new Set(value.map((entry) => entry.toLowerCase())));
              setSelectedProviders(normalized);
            }}
            onClear={() => setSelectedProviders([])}
            placeholder="Všechny zdroje"
            clearable
            searchable
            size="sm"
            comboboxProps={{ withinPortal: true }}
            nothingFoundMessage="Nenalezeno"
            disabled={shopsLoading && providerOptions.length === 0}
            className={classes.shopFilter}
            maxDropdownHeight={240}
          />
          <MultiSelect
            data={shopOptions}
            value={selectedShopIds}
            onChange={setSelectedShopIds}
            onClear={() => setSelectedShopIds([])}
            placeholder="Všechny shopy"
            clearable
            searchable
            size="sm"
            comboboxProps={{ withinPortal: true }}
            nothingFoundMessage="Žádný shop"
            disabled={shopsLoading}
            className={classes.shopFilter}
            maxDropdownHeight={260}
          />
          <SegmentedControl
            value={rangeSelection}
            onChange={(value) => setRangeSelection(value as DashboardRangeSelection)}
            data={rangeOptions}
            size="sm"
          />
          {(summaryLoading || shopsLoading) && <Loader size="sm" />}
        </>
      }
    >
      {summaryError && (
        <Alert color="red" title="Nepodařilo se načíst souhrn">
          Zkuste prosím stránku obnovit. Pokud problém přetrvává, kontaktuj správce.
        </Alert>
      )}

      {summaryLoading ? (
        <Grid>
          {stats.map((stat) => (
            <Grid.Col key={stat.label} span={{ base: 12, md: 6, lg: 3 }}>
              <Skeleton height={96} radius="lg" />
            </Grid.Col>
          ))}
        </Grid>
      ) : (
        <MetricGrid
          items={stats.map((stat) => ({
            label: stat.label,
            value: stat.value,
            description: stat.description,
          }))}
        />
      )}

      <Grid>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Stack gap="lg">
            {deferredContentVisible && comparison && summary && (
              <SectionCard
                className={classes.sectionCard}
                title="Srovnání s loňskem"
                subtitle={`Stejný den před rokem (${new Intl.DateTimeFormat('cs-CZ').format(new Date(comparison.range.from))}).`}
              >
                <Stack gap="lg">
                  <Table highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th className={classes.tableHeading}>Metrika</Table.Th>
                        <Table.Th ta="right" className={classes.tableHeading}>
                          Aktuálně
                        </Table.Th>
                        <Table.Th ta="right" className={classes.tableHeading}>
                          Loni
                        </Table.Th>
                        <Table.Th ta="right" className={classes.tableHeading}>
                          Δ
                        </Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {[
                        {
                          label: 'Objednávky',
                          current: summary.totals.orders,
                          previous: comparison.totals.orders,
                          format: formatNumber,
                        },
                        {
                          label: 'Tržby',
                          current: summary.totals.revenue_base,
                          previous: comparison.totals.revenue_base,
                          format: (value: number) => formatCurrency(value, summary.base_currency),
                        },
                        {
                          label: 'Průměrná objednávka',
                          current: summary.totals.average_order_value_base,
                          previous: comparison.totals.average_order_value_base,
                          format: (value: number) => formatCurrency(value, summary.base_currency),
                        },
                        {
                          label: 'Prodáno kusů',
                          current: summary.totals.items_sold,
                          previous: comparison.totals.items_sold,
                          format: (value: number) => formatNumber(value, { maximumFractionDigits: 1 }),
                        },
                        {
                          label: 'Vrací se zákazníci (%)',
                          current: summary.totals.returning_customers_share,
                          previous: comparison.totals.returning_customers_share,
                          format: (value: number) => formatPercent(value),
                        },
                      ].map((row) => {
                        const delta = row.current - row.previous;
                        const deltaPercent = row.previous !== 0 ? delta / row.previous : null;

                        return (
                          <Table.Tr key={row.label}>
                            <Table.Td>{row.label}</Table.Td>
                            <Table.Td ta="right">{row.format(row.current)}</Table.Td>
                            <Table.Td ta="right">{row.format(row.previous)}</Table.Td>
                            <Table.Td ta="right">
                              <Group gap={4} justify="flex-end">
                                <Text>{row.format(delta)}</Text>
                                {deltaPercent !== null && (
                                  <Text size="xs" c={delta >= 0 ? 'green' : 'red'}>
                                    {delta >= 0 ? '+' : ''}
                                    {formatPercent(deltaPercent)}
                                  </Text>
                                )}
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </Stack>
              </SectionCard>
            )}
            {deferredContentVisible && (
              <SectionCard
                className={classes.sectionCard}
                title="Top shopy podle tržeb"
                subtitle="Nejvýkonnější prodejci za posledních 24 hodin."
              >
                {summaryLoading ? (
                  <Skeleton height={120} radius="sm" />
                ) : topShopsRows.length === 0 ? (
                  <Text className={classes.sectionSubtitle}>
                    Žádné objednávky za sledované období.
                  </Text>
                ) : (
                  <Stack gap="xs" className={classes.listCard}>
                    {topShopsRows.map((shop, index) => (
                      <div key={`${shop.shop_id ?? 'unknown'}-${shop.shop_name}`} className={classes.listRow}>
                        <Group gap="md" align="flex-start">
                          <div className={classes.listRank}>{index + 1}</div>
                          <div className={classes.listHeader}>
                            <Group gap="6" align="center" wrap="wrap">
                              <Text fw={600}>{shop.shop_name ?? 'Neznámý shop'}</Text>
                              <ShopProviderBadge provider={shop.provider} />
                            </Group>
                            <Text className={classes.listMeta}>
                              {formatNumber(shop.orders_count)} objednávek
                            </Text>
                          </div>
                        </Group>
                        <Text className={classes.listValue}>
                          {formatCurrency(shop.revenue_base, summary?.base_currency ?? 'CZK')}
                        </Text>
                      </div>
                    ))}
                  </Stack>
                )}
              </SectionCard>
            )}

            {deferredContentVisible && (
              <SectionCard
                className={classes.sectionCard}
                title="Nejprodávanější produkty"
                subtitle="Seřazeno podle počtu prodaných kusů."
              >
                {summaryLoading ? (
                  <Skeleton height={160} radius="sm" />
                ) : topProductsRows.length === 0 ? (
                  <Text className={classes.sectionSubtitle}>
                    Žádné prodeje produktů za sledované období.
                  </Text>
                ) : (
                  <Stack gap="xs" className={classes.listCard}>
                    {topProductsRows.map((product, index) => (
                      <div key={`${product.code ?? 'undefined'}-${index}`} className={classes.listRow}>
                        <Group gap="md" align="flex-start">
                          <div className={classes.listRank}>{index + 1}</div>
                          <div className={classes.listHeader}>
                            <Group gap="6" align="center" wrap="wrap">
                              <Text fw={600}>{product.name}</Text>
                              <ShopProviderBadge provider={product.provider} />
                            </Group>
                            <Text className={classes.listMeta}>
                              {product.shop_name ?? 'Neznámý shop'} • {product.code ?? '—'}
                            </Text>
                          </div>
                        </Group>
                        <Text className={classes.listValue}>
                          {formatNumber(product.quantity, { maximumFractionDigits: 1 })}
                        </Text>
                      </div>
                    ))}
                  </Stack>
                )}
              </SectionCard>
            )}

            {deferredContentVisible && (
              <SectionCard
                className={classes.sectionCard}
                title="Top lokality"
                subtitle={
                  locationSort === 'revenue'
                    ? 'Města a PSČ seřazené podle obratu v období.'
                    : 'Města a PSČ seřazené podle počtu objednávek.'
                }
                actions={
                  !summaryLoading && topLocationsRows.length > 0 ? (
                    <Group gap="xs" className={classes.topLocationsControls}>
                      <SegmentedControl
                        value={locationSort}
                        onChange={(value) => setLocationSort(value as 'orders' | 'revenue')}
                        data={[
                          { value: 'orders', label: 'Objednávky' },
                          { value: 'revenue', label: 'Obrat' },
                        ]}
                        size="xs"
                      />
                      <Select
                        value={locationLimit}
                        onChange={(value) => setLocationLimit(value ?? '8')}
                        data={[
                          { value: '5', label: 'Top 5' },
                          { value: '8', label: 'Top 8' },
                          { value: '12', label: 'Top 12' },
                        ]}
                        size="xs"
                        comboboxProps={{ withinPortal: true }}
                        aria-label="Počet zobrazených lokalit"
                      />
                    </Group>
                  ) : null
                }
              >
                {summaryLoading ? (
                  <Skeleton height={160} radius="sm" />
                ) : visibleTopLocations.length === 0 ? (
                  <Text className={classes.sectionSubtitle}>
                    Žádné objednávky s adresou pro zobrazení statistik.
                  </Text>
                ) : (
                  <Stack gap="xs" className={classes.listCard}>
                    {visibleTopLocations.map((location, index) => (
                      <div
                        key={`${location.postal_code}-${location.city}-${index}`}
                        className={classes.listRow}
                      >
                        <Group gap="md" align="flex-start" style={{ flex: 1 }}>
                          <div className={classes.listRank}>{index + 1}</div>
                          <Stack gap="2" className={classes.listHeader} style={{ flex: 1 }}>
                            <Text fw={600}>
                              {location.city} ({location.postal_code})
                            </Text>
                            <Text className={classes.listMeta}>
                              {location.region ?? 'Bez regionu'}
                            </Text>
                            {location.top_product && (
                              <Text className={classes.listMeta}>
                                Nejprodávanější: {location.top_product.name}
                                {location.top_product.quantity
                                  ? ` (${formatNumber(location.top_product.quantity, { maximumFractionDigits: 1 })} ks)`
                                  : ''}
                              </Text>
                            )}
                          </Stack>
                        </Group>
                        <Stack gap="2" align="flex-end">
                          <Text className={classes.listValue}>
                            {formatNumber(location.orders_count)} objednávek
                          </Text>
                          <Text className={classes.listMeta}>
                            {formatCurrency(location.revenue_base, summary?.base_currency ?? 'CZK')}
                          </Text>
                        </Stack>
                      </div>
                    ))}
                  </Stack>
                )}
              </SectionCard>
            )}

            {deferredContentVisible && (
              <Grid>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <SectionCard
                    className={classes.sectionCard}
                    title="Kupóny"
                    subtitle="Nejčastěji použité kupóny za posledních 24 hodin."
                  >
                    {summaryLoading ? (
                      <Skeleton height={120} radius="sm" />
                    ) : couponUsageRows.length === 0 ? (
                      <Text className={classes.sectionSubtitle}>
                        Žádné kupóny v posledním období.
                      </Text>
                    ) : (
                      <Table highlightOnHover>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Kód</Table.Th>
                            <Table.Th>Název</Table.Th>
                            <Table.Th ta="right">Využití</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {couponUsageRows.map((coupon) => (
                            <Table.Tr key={`${coupon.code}-${coupon.name ?? 'coupon'}`}>
                              <Table.Td>{coupon.code}</Table.Td>
                              <Table.Td>{coupon.name ?? 'Bez názvu'}</Table.Td>
                              <Table.Td ta="right">{formatNumber(coupon.uses)}</Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    )}
                  </SectionCard>
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 6 }}>
                  <SectionCard
                    className={classes.sectionCard}
                    title="Platební metody"
                    subtitle="Rozložení dokončených objednávek podle platby."
                  >
                    {summaryLoading ? (
                      <Skeleton height={120} radius="sm" />
                    ) : paymentBreakdownRows.length === 0 ? (
                      <Text className={classes.sectionSubtitle}>
                        Žádné platby v posledním období.
                      </Text>
                    ) : (
                      <Table highlightOnHover>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Metoda</Table.Th>
                            <Table.Th ta="right">Objednávky</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {paymentBreakdownRows.map((row) => (
                            <Table.Tr key={`${row.name}-${row.orders_count}`}>
                              <Table.Td>{row.name}</Table.Td>
                              <Table.Td ta="right">{formatNumber(row.orders_count)}</Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    )}
                  </SectionCard>
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 6 }}>
                  <SectionCard
                    className={classes.sectionCard}
                    title="Doprava"
                    subtitle="Nejvyužívanější způsoby dopravy."
                  >
                    {summaryLoading ? (
                      <Skeleton height={120} radius="sm" />
                    ) : shippingBreakdownRows.length === 0 ? (
                      <Text className={classes.sectionSubtitle}>
                        Žádné doručení v posledním období.
                      </Text>
                    ) : (
                      <Table highlightOnHover>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Doprava</Table.Th>
                            <Table.Th ta="right">Objednávky</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {shippingBreakdownRows.map((row) => (
                            <Table.Tr key={`${row.name}-${row.orders_count}`}>
                              <Table.Td>{row.name}</Table.Td>
                              <Table.Td ta="right">{formatNumber(row.orders_count)}</Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    )}
                  </SectionCard>
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 6 }}>
                  <SectionCard
                    className={classes.sectionCard}
                    title="Stavy objednávek"
                    subtitle="Distribuce všech objednávek podle stavu."
                  >
                    {summaryLoading ? (
                      <Skeleton height={120} radius="sm" />
                    ) : statusBreakdownRows.length === 0 ? (
                      <Text className={classes.sectionSubtitle}>
                        Žádné objednávky v období.
                      </Text>
                    ) : (
                      <Table highlightOnHover>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Stav</Table.Th>
                            <Table.Th ta="right">Objednávky</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {statusBreakdownRows.map((row) => (
                            <Table.Tr key={`${row.status}-${row.orders_count}`}>
                              <Table.Td>{row.status}</Table.Td>
                              <Table.Td ta="right">{formatNumber(row.orders_count)}</Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    )}
                  </SectionCard>
                </Grid.Col>
              </Grid>
            )}
            <SectionCard
              className={classes.sectionCard}
              title="Integrace a fronty"
              subtitle="Stav napojení na Shoptet a Laravel queue za posledních 24 hodin."
            >
              {summaryLoading || !summary ? (
                <Skeleton height={90} radius="sm" />
              ) : (
                <Grid>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Stack gap={6}>
                      <Text size="sm" fw={500}>
                        Shoptet webhooky
                      </Text>
                      <Group gap="xs">
                        <Badge color="blue" variant="light">
                          Přijaté: {formatNumber(summary.sync.webhooks_total)}
                        </Badge>
                        <Badge color="green" variant="light">
                          Zpracované: {formatNumber(summary.sync.webhooks_processed)}
                        </Badge>
                        <Badge color="red" variant="light">
                          Chyby: {formatNumber(summary.sync.webhooks_failed)}
                        </Badge>
                      </Group>
                    </Stack>
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Stack gap={6}>
                      <Text size="sm" fw={500}>
                        Queue worker
                      </Text>
                      <Group gap="xs">
                        <Badge color={summary.sync.failed_jobs === 0 ? 'teal' : 'red'} variant="light">
                          Nezpracované chyby: {formatNumber(summary.sync.failed_jobs)}
                        </Badge>
                      </Group>
                    </Stack>
                  </Grid.Col>
                </Grid>
              )}
            </SectionCard>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Stack gap="lg">
            <Card padding="xl" shadow="none" withBorder={false} className={classes.sectionCard}>
              <form onSubmit={handleCreateSubmit}>
                <Stack gap="md">
                  <div className={classes.sectionHeader}>
                    <Text className={classes.sectionTitle}>Poznámky</Text>
                    <Text className={classes.sectionSubtitle}>
                      Zaznamenej důležité informace pro sebe nebo celý tým.
                    </Text>
                  </div>
                  <TextInput
                    label="Titulek"
                    placeholder="Shrnutí sprintu"
                    {...createForm.getInputProps('title')}
                  />
                  <Textarea
                    label="Obsah"
                    placeholder="Co se podařilo, co řešíme dál..."
                    autosize
                    minRows={3}
                    {...createForm.getInputProps('content')}
                  />
                  <Select
                    label="Viditelnost"
                    data={visibilityOptions}
                    {...createForm.getInputProps('visibility')}
                  />
                  <Switch
                    label="Připnout poznámku"
                    {...createForm.getInputProps('isPinned', { type: 'checkbox' })}
                  />
                  <Button type="submit" loading={createMutation.isPending}>
                    Uložit poznámku
                  </Button>
                </Stack>
              </form>
            </Card>

            {notesError && (
              <Alert color="red" title="Poznámky se nepodařilo načíst">
                Zkuste to prosím znovu později.
              </Alert>
            )}

            <Stack gap="sm">
              {(notes ?? []).map((note) => {
                const createdHuman = formatRelativeTime(note.created_at);
                const updatedHuman = formatRelativeTime(note.updated_at);

                return (
                  <Card
                    key={note.id}
                    shadow="none"
                    padding="md"
                    withBorder={false}
                    className={classes.notesCard}
                  >
                    <Stack gap="sm">
                      <Group justify="space-between" align="flex-start">
                        <Stack gap={4} style={{ flex: 1 }}>
                          <Group gap="xs">
                            <Text fw={600}>{note.title || 'Bez titulku'}</Text>
                            <Badge size="sm" color={note.visibility === 'public' ? 'blue' : 'gray'} variant="light">
                              {note.visibility === 'public' ? 'Veřejná' : 'Soukromá'}
                            </Badge>
                            {note.is_pinned && (
                              <Tooltip label="Připnutá poznámka">
                                <IconPinFilled size={16} />
                              </Tooltip>
                            )}
                          </Group>
                          <Text className={classes.noteBody} style={{ whiteSpace: 'pre-wrap' }}>
                            {note.content}
                          </Text>
                        </Stack>
                        {note.can_edit && (
                          <Group gap={4} align="flex-start">
                            <Tooltip label="Upravit">
                              <ActionIcon variant="subtle" size="sm" onClick={() => handleEditOpen(note)}>
                                <IconPencil size={16} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Smazat">
                              <ActionIcon
                                variant="subtle"
                                color="red"
                                size="sm"
                                onClick={() => handleDelete(note)}
                                disabled={deleteMutation.isPending}
                              >
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        )}
                      </Group>
                      <Divider />
                      <Group gap="xs" justify="space-between">
                        <Text className={classes.noteMeta}>
                          Autor: {note.author?.name ?? 'Neznámý uživatel'}
                        </Text>
                        <Text className={classes.noteMeta}>
                          {updatedHuman && updatedHuman !== createdHuman
                            ? `Aktualizováno ${updatedHuman}`
                            : createdHuman || 'Vytvořeno nyní'}
                        </Text>
                      </Group>
                    </Stack>
                  </Card>
                );
              })}

              {notesLoading && <Loader size="sm" />}

              {!notesLoading && (notes ?? []).length === 0 && !notesError && (
                <Card padding="lg" shadow="none" withBorder={false} className={classes.notesCard}>
                  <Text className={classes.sectionSubtitle}>
                    Zatím zde nejsou žádné poznámky. Přidej první poznámku přes formulář výše.
                  </Text>
                </Card>
              )}
            </Stack>
          </Stack>
        </Grid.Col>
      </Grid>

      <Modal
        opened={editOpened}
        onClose={closeEdit}
        title={editingNote?.title || 'Upravit poznámku'}
        centered
        size="lg"
      >
        <form onSubmit={handleEditSubmit}>
          <Stack gap="md">
            <TextInput label="Titulek" {...editForm.getInputProps('title')} />
            <Textarea label="Obsah" autosize minRows={4} {...editForm.getInputProps('content')} />
            <Select label="Viditelnost" data={visibilityOptions} {...editForm.getInputProps('visibility')} />
            <Switch label="Připnout poznámku" {...editForm.getInputProps('isPinned', { type: 'checkbox' })} />
            <Group justify="flex-end" gap="sm">
              <Button variant="subtle" onClick={closeEdit} disabled={updateMutation.isPending}>
                Zrušit
              </Button>
              <Button type="submit" loading={updateMutation.isPending}>
                Uložit změny
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </PageShell>
  );
};
