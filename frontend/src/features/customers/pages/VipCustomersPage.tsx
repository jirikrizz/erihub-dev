import {
  Badge,
  Button,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  Pagination,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconEye, IconStarFilled, IconStarOff } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateCustomer, type Customer } from '../../../api/customers';
import { useVipCustomers } from '../hooks/useCustomers';
import { useShops } from '../../shoptet/hooks/useShops';
import { SectionPageShell } from '../../../components/layout/SectionPageShell';
import { SurfaceCard } from '../../../components/layout/SurfaceCard';
import tableClasses from '../../../components/table/DataTable.module.css';
import { DataTableHeaderCell, type HeaderColumn } from '../../../components/table/DataTableHeaderCell';
import { sortByDescriptors, updateSortDescriptors, type SortDescriptor } from '../../../components/table/sorting';
import { useColumnResizing } from '../../../components/table/useColumnResizing';

const normalizeText = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const extractCountry = (customer: Customer): string | null => {
  const billing = (customer.billing_address ?? {}) as Record<string, unknown>;
  const deliveryList = (customer.delivery_addresses ?? []) as Record<string, unknown>[];
  const delivery = deliveryList[0] ?? {};
  const candidates: unknown[] = [
    billing.country,
    billing.countryCode,
    billing.country_code,
    billing.countryName,
    delivery.country,
    delivery.countryCode,
    delivery.country_code,
  ];

  const value = candidates.find((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
  return value ? value.toUpperCase() : null;
};

const formatCurrency = (value: number | null | undefined, currency: string) => {
  if (value === null || value === undefined) {
    return '—';
  }

  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
};

type VipSortColumn =
  | 'name'
  | 'country'
  | 'shop'
  | 'orders'
  | 'total_spent'
  | 'average_order_value'
  | 'last_order_at';

type VipColumn = VipSortColumn | 'actions';

const VIP_COLUMN_SIZE_CONFIG: Array<{ key: VipColumn; minWidth: number; defaultWidth: number }> = [
  { key: 'name', minWidth: 240, defaultWidth: 260 },
  { key: 'country', minWidth: 140, defaultWidth: 160 },
  { key: 'shop', minWidth: 200, defaultWidth: 220 },
  { key: 'orders', minWidth: 140, defaultWidth: 160 },
  { key: 'total_spent', minWidth: 160, defaultWidth: 180 },
  { key: 'average_order_value', minWidth: 160, defaultWidth: 180 },
  { key: 'last_order_at', minWidth: 180, defaultWidth: 200 },
  { key: 'actions', minWidth: 140, defaultWidth: 160 },
];

const VIP_DEFAULT_SORT: SortDescriptor<VipSortColumn> = {
  column: 'last_order_at',
  direction: 'desc',
};

const vipSortAccessors: Record<VipSortColumn, (customer: Customer) => string | number | Date | null> = {
  name: (customer) => customer.full_name ?? '',
  country: (customer) => extractCountry(customer) ?? '',
  shop: (customer) => customer.shop?.name ?? '',
  orders: (customer) => customer.completed_orders ?? customer.orders_count ?? 0,
  total_spent: (customer) => customer.total_spent_base ?? customer.total_spent ?? 0,
  average_order_value: (customer) =>
    customer.average_order_value_base ?? customer.average_order_value ?? 0,
  last_order_at: (customer) => (customer.last_order_at ? new Date(customer.last_order_at) : null),
};

export const VipCustomersPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  // @ts-expect-error - setPerPage will be used for per_page UI control
  const [perPage, setPerPage] = useState(25);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedShops, setSelectedShops] = useState<string[]>([]);
  const [aovMin, setAovMin] = useState<number | null>(null);
  const [aovMax, setAovMax] = useState<number | null>(null);
  const [debouncedAovMin] = useDebouncedValue(aovMin, 300);
  const [debouncedAovMax] = useDebouncedValue(aovMax, 300);
  const [sortState, setSortState] = useState<SortDescriptor<VipSortColumn>[]>([
    VIP_DEFAULT_SORT,
  ]);

  const params = useMemo(
    () => ({
      page,
      per_page: perPage,
      search: normalizeText(debouncedSearch) ?? undefined,
      country: selectedCountries.length > 0 ? selectedCountries : undefined,
      shop_id: selectedShops.length > 0 ? selectedShops : undefined,
      aov_min: debouncedAovMin ?? undefined,
      aov_max: debouncedAovMax ?? undefined,
    }),
    [page, perPage, debouncedSearch, selectedCountries, selectedShops, debouncedAovMin, debouncedAovMax]
  );

  const { data, isLoading } = useVipCustomers(params);
  const baseCurrency = data?.base_currency ?? 'CZK';
  const availableCountries = data?.filters?.countries ?? [];

  const shopsQuery = useShops({ per_page: 100 });
  const shopOptions = useMemo(
    () =>
      (shopsQuery.data?.data ?? []).map((shop) => ({
        value: shop.id.toString(),
        label: shop.name,
      })),
    [shopsQuery.data]
  );

  const toggleVipMutation = useMutation({
    mutationFn: (payload: { id: string; value: boolean }) =>
      updateCustomer(payload.id, { is_vip: payload.value }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customers', 'vip'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers', 'detail', variables.id] });
      notifications.show({ message: variables.value ? 'Zákazník označen jako VIP.' : 'VIP status odebrán.', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Aktualizace VIP statusu se nepodařila.', color: 'red' });
    },
  });

  const { sizes: columnSizes, startResizing, resetWidth, activeKey: resizingColumn } =
    useColumnResizing<VipColumn>(VIP_COLUMN_SIZE_CONFIG);

  const headerColumns = useMemo<HeaderColumn<VipColumn, VipSortColumn>[]>(
    () => [
      { key: 'name', label: 'Zákazník', sortable: true },
      { key: 'country', label: 'Stát', sortable: true },
      { key: 'shop', label: 'Shop', sortable: true },
      { key: 'orders', label: 'Objednávky', sortable: true, align: 'right' },
      {
        key: 'total_spent',
        label: `CLV (${baseCurrency})`,
        sortable: true,
        align: 'right',
      },
      {
        key: 'average_order_value',
        label: `AOV (${baseCurrency})`,
        sortable: true,
        align: 'right',
      },
      { key: 'last_order_at', label: 'Poslední objednávka', sortable: true },
      { key: 'actions', label: 'Akce', align: 'center' },
    ],
    [baseCurrency]
  );

  const columnCount = headerColumns.length;

  const handleHeaderSort = useCallback(
    (column: VipSortColumn, multi: boolean) => {
      setSortState((current) => updateSortDescriptors(current, column, multi));
    },
    []
  );

  const sortedVipCustomers = useMemo(() => {
    const rows = (data?.data ?? []) as Customer[];
    return sortByDescriptors(rows, sortState, vipSortAccessors);
  }, [data?.data, sortState]);

  return (
    <SectionPageShell
      section="customers.vip"
      description="Segment nejhodnotnějších zákazníků napříč všemi shopy. Filtruj podle státu, AOV nebo vyhledej konkrétního zákazníka a spravuj jejich VIP status."
    >
      <Stack gap="lg">
      <SurfaceCard>
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
              w={{ base: '100%', sm: 260 }}
            />
            <MultiSelect
              label="Stát"
              placeholder={availableCountries.length ? 'Vyber stát' : 'Státy nejsou k dispozici'}
              data={availableCountries.map((country) => ({ value: country, label: country }))}
              value={selectedCountries}
              onChange={(value) => {
                setSelectedCountries(value);
                setPage(1);
              }}
              searchable
              clearable
              w={{ base: '100%', sm: 220 }}
              nothingFoundMessage="Žádný stát"
            />
            <MultiSelect
              label="Shop"
              placeholder="Všechny"
              data={shopOptions}
              value={selectedShops}
              onChange={(value) => {
                setSelectedShops(value);
                setPage(1);
              }}
              searchable
              clearable
              w={{ base: '100%', sm: 220 }}
            />
            <NumberInput
              label={`AOV od (${baseCurrency})`}
              value={aovMin ?? undefined}
              onChange={(value) => {
                setAovMin(typeof value === 'number' ? value : null);
                setPage(1);
              }}
              min={0}
              w={{ base: '100%', sm: 180 }}
            />
            <NumberInput
              label={`AOV do (${baseCurrency})`}
              value={aovMax ?? undefined}
              onChange={(value) => {
                setAovMax(typeof value === 'number' ? value : null);
                setPage(1);
              }}
              min={0}
              w={{ base: '100%', sm: 180 }}
            />
          </Group>
        </Stack>
      </SurfaceCard>

      <SurfaceCard p="0">
        <Table highlightOnHover verticalSpacing="sm" className={tableClasses.table}>
          <Table.Thead>
            <Table.Tr>
              {headerColumns.map((column) => (
                <DataTableHeaderCell
                  key={column.key}
                  column={column}
                  sortState={sortState}
                  onToggleSort={
                    column.key === 'actions'
                      ? undefined
                      : (key, multi) => handleHeaderSort(key as VipSortColumn, multi)
                  }
                  width={columnSizes[column.key]}
                  resizeHandlers={
                    column.key === 'actions'
                      ? undefined
                      : {
                          onMouseDown: (event) => startResizing(column.key, event),
                          onDoubleClick: () => resetWidth(column.key),
                          active: resizingColumn === column.key,
                        }
                  }
                />
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading && (
              <Table.Tr>
                <Table.Td colSpan={columnCount}>
                  <Group justify="center" py="lg">
                    <Loader size="sm" />
                  </Group>
                </Table.Td>
              </Table.Tr>
            )}
            {!isLoading && sortedVipCustomers.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={columnCount}>
                  <Stack align="center" py="lg" gap={4}>
                    <IconStarFilled size={24} />
                    <Text size="sm" c="dimmed">
                      Nenašli jsme žádné VIP zákazníky podle zadaných filtrů.
                    </Text>
                  </Stack>
                </Table.Td>
              </Table.Tr>
            )}
            {sortedVipCustomers.map((customer) => {
              const shop = customer.shop;
              const country = extractCountry(customer);
              const totalSpent = customer.total_spent_base ?? customer.total_spent ?? 0;
              const aov = customer.average_order_value_base ?? customer.average_order_value ?? 0;
              const orders = customer.completed_orders ?? customer.orders_count ?? 0;

              return (
                <Table.Tr key={customer.id}>
                  <Table.Td>
                    <Stack gap={2} align="flex-start">
                      <Group gap={6}>
                        <Text fw={600}>{customer.full_name ?? 'Neznámý zákazník'}</Text>
                        <Badge color="yellow" variant="filled" leftSection={<IconStarFilled size={12} />}>
                          VIP
                        </Badge>
                      </Group>
                      {customer.email && (
                        <Text size="sm" c="dimmed">
                          {customer.email}
                        </Text>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td>{country ?? '—'}</Table.Td>
                  <Table.Td>
                    {shop ? (
                      <Stack gap={2} align="flex-start">
                        <Text size="sm" fw={500}>
                          {shop.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {shop.domain}
                        </Text>
                      </Stack>
                    ) : (
                      '—'
                    )}
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{orders}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{formatCurrency(totalSpent, baseCurrency)}</Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>{formatCurrency(aov, baseCurrency)}</Table.Td>
                  <Table.Td>
                    {customer.last_order_at
                      ? new Date(customer.last_order_at).toLocaleDateString('cs-CZ')
                      : '—'}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="center">
                      <Button
                        size="xs"
                        variant="light"
                        color="yellow"
                        leftSection={<IconStarOff size={14} />}
                        onClick={() => toggleVipMutation.mutate({ id: customer.id, value: false })}
                        loading={toggleVipMutation.isPending}
                      >
                        Odebrat VIP
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        leftSection={<IconEye size={14} />}
                        onClick={() => navigate(`/customers/${customer.id}`)}
                      >
                        Detail
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>

        <Group justify="flex-end" mt="md">
          <Pagination value={page} onChange={setPage} total={data?.last_page ?? 1} />
        </Group>
      </SurfaceCard>
    </Stack>
  </SectionPageShell>
  );
};
