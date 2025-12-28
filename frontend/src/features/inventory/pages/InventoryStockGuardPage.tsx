import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
  Group,
  Loader,
  Pagination,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { IconAlertCircle, IconChevronDown, IconChevronUp, IconSearch, IconSelector } from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { InventoryStockGuardMeta, InventoryStockGuardRecord } from '../../../api/inventory';
import { exportInventoryStockGuard, syncInventoryStockGuard } from '../../../api/inventory';
import { useInventoryStockGuard } from '../hooks/useInventoryOverview';
import { PageShell } from '../../../components/layout/PageShell';
import { TableToolbar } from '../../../components/table/TableToolbar';
import classes from './InventoryStockGuardPage.module.css';

const perPageOptions = [
  { value: '25', label: '25 / stránka' },
  { value: '50', label: '50 / stránka' },
  { value: '100', label: '100 / stránka' },
];

const productTypeOptions = [
  { value: '', label: 'Všechny typy' },
  { value: 'product', label: 'Fyzický produkt' },
  { value: 'product-set', label: 'Produktová sada' },
];

const numberFormatter = new Intl.NumberFormat('cs-CZ', {
  maximumFractionDigits: 2,
});

const dateTimeFormatter = new Intl.DateTimeFormat('cs-CZ', {
  dateStyle: 'short',
  timeStyle: 'short',
});

type SortField =
  | 'product_name'
  | 'variant_code'
  | 'variant_name'
  | 'product_type'
  | 'shoptet_stock'
  | 'stock_difference'
  | 'visibility';
type SortDirection = 'asc' | 'desc';

type StockGuardColumn =
  | 'product_name'
  | 'variant_code'
  | 'variant_name'
  | 'product_type'
  | 'shoptet_stock'
  | 'elogist_stock'
  | 'stock_difference'
  | 'visibility';

const STOCK_GUARD_COLUMN_LABELS: Record<StockGuardColumn, string> = {
  product_name: 'Název produktu',
  variant_code: 'Kód varianty',
  variant_name: 'Název varianty',
  product_type: 'Typ produktu',
  shoptet_stock: 'Stav Shoptet',
  elogist_stock: 'Stav Elogist',
  stock_difference: 'Rozdíl',
  visibility: 'Zobrazení',
};

const sortableFields: SortField[] = [
  'product_name',
  'variant_code',
  'variant_name',
  'product_type',
  'shoptet_stock',
  'stock_difference',
  'visibility',
];
const defaultSortField: SortField = 'variant_code';
const defaultSortDirection: SortDirection = 'asc';

const formatStock = (value: number | null | undefined) => {
  if (value === null || typeof value === 'undefined') {
    return '—';
  }

  return numberFormatter.format(value);
};

const resolveDiffClass = (value: number | null) => {
  if (value === null) {
    return undefined;
  }

  if (value > 0) {
    return classes.diffPositive;
  }

  if (value < 0) {
    return classes.diffNegative;
  }

  return classes.diffNeutral;
};

const formatProductTypeLabel = (value?: string | null) => {
  if (value === 'product-set') {
    return 'Produktová sada';
  }

  return 'Fyzický produkt';
};

export const InventoryStockGuardPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const search = searchParams.get('search') ?? '';
  const pageParam = Number(searchParams.get('page') ?? '1');
  const perPageParam = Number(searchParams.get('perPage') ?? '25');
  const productTypeParam = searchParams.get('productType') ?? '';
  const sortParam = (searchParams.get('sort') as SortField | null) ?? defaultSortField;
  const directionParam = (searchParams.get('direction') as SortDirection | null) ?? defaultSortDirection;

  const page = Number.isNaN(pageParam) ? 1 : Math.max(1, pageParam);
  const perPage = Number.isNaN(perPageParam) ? 25 : Math.min(100, Math.max(5, perPageParam));
  const sortBy = sortableFields.includes(sortParam) ? sortParam : defaultSortField;
  const sortDirection: SortDirection = directionParam === 'desc' ? 'desc' : defaultSortDirection;
  const productType = productTypeParam === '' ? undefined : productTypeParam;

  const [searchValue, setSearchValue] = useState(search);
  const [debouncedSearch] = useDebouncedValue(searchValue, 400);
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<Record<StockGuardColumn, boolean>>({
    product_name: true,
    variant_code: true,
    variant_name: true,
    product_type: true,
    shoptet_stock: true,
    elogist_stock: true,
    stock_difference: true,
    visibility: true,
  });

  const syncMutation = useMutation({
    mutationFn: (variantIds: string[]) => syncInventoryStockGuard(variantIds),
    onSuccess: () => {
      setSelectedVariants([]);
      queryClient.invalidateQueries({ queryKey: ['inventory', 'stock-guard'] });
    },
  });

  useEffect(() => {
    setSearchValue(search);
  }, [search]);

  const applyParams = useCallback(
    (options: {
      page?: number;
      perPage?: number;
      search?: string;
      sort?: SortField;
      direction?: SortDirection;
      productType?: string | null;
      replace?: boolean;
    }) => {
      const nextSearch = options.search ?? search;
      const nextPerPage = options.perPage ?? perPage;
      const nextPage = options.page ?? page;
      const nextSort = options.sort ?? sortBy;
      const nextDirection = options.direction ?? sortDirection;
      const nextProductType = options.productType ?? productType ?? '';

      const next = new URLSearchParams();

      if (nextSearch) {
        next.set('search', nextSearch);
      }

      if (nextPerPage !== 25) {
        next.set('perPage', String(nextPerPage));
      }

      if (nextSort !== defaultSortField) {
        next.set('sort', nextSort);
      }

      if (nextDirection !== defaultSortDirection) {
        next.set('direction', nextDirection);
      }

      if (nextProductType) {
        next.set('productType', nextProductType);
      }

      next.set('page', String(nextPage));

      setSearchParams(next, options.replace ? { replace: true } : undefined);
    },
    [page, perPage, productType, search, sortBy, sortDirection, setSearchParams]
  );

  useEffect(() => {
    if (debouncedSearch === search) {
      return;
    }

    applyParams({ page: 1, search: debouncedSearch, replace: true });
  }, [applyParams, debouncedSearch, search]);

  const queryParams = useMemo(
    () => ({
      page,
      per_page: perPage,
      search: search || undefined,
      sort: sortBy,
      direction: sortDirection,
      product_type: productType,
    }),
    [page, perPage, productType, search, sortBy, sortDirection]
  );

  const { data, isLoading, isFetching } = useInventoryStockGuard(queryParams);

  const records = (data?.data ?? []) as InventoryStockGuardRecord[];
  const meta = data?.meta as InventoryStockGuardMeta | undefined;
  const elogistMeta = meta?.elogist;
  const lastSyncedAt = meta?.last_synced_at ?? null;
  const productTypeFilter = productType ?? '';
  const selectedSet = useMemo(() => new Set(selectedVariants), [selectedVariants]);
  const visibleIds = useMemo(() => records.map((record) => record.id), [records]);
  const visibleSelectedCount = visibleIds.filter((id) => selectedSet.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length;
  const someSelected = selectedVariants.length > 0;
  const someVisibleSelected = visibleSelectedCount > 0;
  const isSyncing = syncMutation.isPending;
  const syncDisabled = !someSelected || isSyncing;

  useEffect(() => {
    setSelectedVariants((prev) => {
      const filtered = prev.filter((id) => visibleIds.includes(id));

      if (filtered.length === prev.length) {
        let unchanged = true;
        for (let index = 0; index < filtered.length; index += 1) {
          if (filtered[index] !== prev[index]) {
            unchanged = false;
            break;
          }
        }

        if (unchanged) {
          return prev;
        }
      }

      return filtered;
    });
  }, [visibleIds]);

  const handlePageChange = (value: number) => {
    applyParams({ page: value });
  };

  const handlePerPageChange = (value: string | null) => {
    const next = value ? Number(value) : 25;
    applyParams({ page: 1, perPage: next });
  };

  const handleProductTypeChange = (value: string | null) => {
    applyParams({ page: 1, productType: value ?? '' });
  };

  const handleRowSelection = (id: string, checked: boolean) => {
    setSelectedVariants((prev) => {
      if (checked) {
        if (prev.includes(id)) {
          return prev;
        }

        return [...prev, id];
      }

      return prev.filter((value) => value !== id);
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const merged = Array.from(new Set([...selectedVariants, ...visibleIds]));
      setSelectedVariants(merged);
      return;
    }

    setSelectedVariants((prev) => prev.filter((id) => !visibleIds.includes(id)));
  };

  const handleExport = async () => {
    if (isExporting) {
      return;
    }

    setIsExporting(true);
    try {
      const params: Record<string, unknown> = {
        search: search || undefined,
        product_type: productType,
        sort: sortBy,
        direction: sortDirection,
      };

      const blob = await exportInventoryStockGuard(params);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hlidac-skladu-${new Date().toISOString().replace(/[:T]/g, '-').split('.')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSyncSelection = async () => {
    if (syncDisabled) {
      return;
    }

    try {
      await syncMutation.mutateAsync(selectedVariants);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSortChange = (field: SortField) => {
    const isActive = sortBy === field;
    const nextDirection: SortDirection = isActive
      ? sortDirection === 'asc'
        ? 'desc'
        : 'asc'
      : defaultSortDirection;

    applyParams({ page: 1, sort: field, direction: nextDirection });
  };

  const renderSortIcon = (field: SortField) => {
    if (sortBy !== field) {
      return <IconSelector size={14} className={classes.sortIcon} />;
    }

    return sortDirection === 'asc' ? (
      <IconChevronUp size={14} className={classes.sortIcon} />
    ) : (
      <IconChevronDown size={14} className={classes.sortIcon} />
    );
  };

  const renderSortableHeader = (label: string, field: SortField) => (
    <UnstyledButton
      onClick={() => handleSortChange(field)}
      className={classes.sortableButton}
      data-active={sortBy === field || undefined}
    >
      <Group gap={4}>
        <Text fw={600}>{label}</Text>
        {renderSortIcon(field)}
      </Group>
    </UnstyledButton>
  );

  const formatSyncedAt = (value: string | null | undefined) => {
    if (! value) {
      return 'N/A';
    }

    try {
      return dateTimeFormatter.format(new Date(value));
    } catch {
      return value;
    }
  };

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = total === 0 ? 0 : Math.min(total, from + records.length - 1);

  return (
    <PageShell
      title="Hlídač skladu"
      description="Porovnej skladové zásoby mezi Shoptetem a logistickým systémem Elogist."
    >
      {elogistMeta?.message && (
        <Alert
          radius="md"
          color={elogistMeta.enabled ? 'blue' : 'yellow'}
          title={elogistMeta.enabled ? 'Informace z Elogistu' : 'Elogist není nakonfigurovaný'}
          icon={<IconAlertCircle size={18} />}
        >
          {elogistMeta.message}
        </Alert>
      )}

      <Card withBorder radius="md" shadow="sm">
        <Stack gap="lg">
          <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
            <Group align="flex-end" gap="sm" wrap="wrap">
              <TextInput
                label="Vyhledávání"
                placeholder="Hledejte produkt, variantu nebo kód"
                value={searchValue}
                onChange={(event) => setSearchValue(event.currentTarget.value)}
                leftSection={<IconSearch size={16} />}
                rightSection={isFetching ? <Loader size="xs" /> : null}
                w={{ base: '100%', md: 360 }}
              />

              <Select
                label="Počet na stránku"
                data={perPageOptions}
                value={String(perPage)}
                onChange={handlePerPageChange}
                maw={180}
              />

              <Select
                label="Typ produktu"
                data={productTypeOptions}
                value={productTypeFilter}
                onChange={handleProductTypeChange}
                maw={220}
              />
            </Group>

          <Group gap="sm" align="flex-end">
            <Button variant="default" onClick={handleExport} loading={isExporting}>
              Exportovat CSV
            </Button>

              <Button
                onClick={handleSyncSelection}
                disabled={syncDisabled}
                loading={isSyncing}
                variant="light"
              >
                Synchronizovat dle Elogistu ({selectedVariants.length})
              </Button>
            </Group>
          </Group>

          <TableToolbar
            columns={(Object.keys(STOCK_GUARD_COLUMN_LABELS) as StockGuardColumn[]).map((key) => ({
              key,
              label: STOCK_GUARD_COLUMN_LABELS[key],
            }))}
            columnVisibility={columnVisibility}
            onToggleColumn={(key, checked) =>
              setColumnVisibility((current) => ({ ...current, [key as StockGuardColumn]: checked }))
            }
          />

          <div className={classes.tableWrapper}>
            {lastSyncedAt && (
              <Text size="sm" c="gray.6">
                Poslední synchronizace: {formatSyncedAt(lastSyncedAt)}
              </Text>
            )}
            {isLoading ? (
              <Center h="100%">
                <Loader />
              </Center>
            ) : records.length === 0 ? (
              <Center h="100%">
                <Text c="gray.6">Nebyly nalezeny žádné varianty.</Text>
              </Center>
            ) : (
              <ScrollArea>
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={36}>
                        <Checkbox
                          aria-label="Vybrat vše"
                          checked={allVisibleSelected}
                          indeterminate={!allVisibleSelected && someVisibleSelected}
                          onChange={(event) => handleSelectAll(event.currentTarget.checked)}
                        />
                      </Table.Th>
                      {columnVisibility.product_name && (
                        <Table.Th>{renderSortableHeader('Název produktu', 'product_name')}</Table.Th>
                      )}
                      {columnVisibility.variant_code && (
                        <Table.Th>{renderSortableHeader('Kód varianty', 'variant_code')}</Table.Th>
                      )}
                      {columnVisibility.variant_name && (
                        <Table.Th>{renderSortableHeader('Název varianty', 'variant_name')}</Table.Th>
                      )}
                      {columnVisibility.product_type && (
                        <Table.Th>{renderSortableHeader('Typ produktu', 'product_type')}</Table.Th>
                      )}
                      {columnVisibility.shoptet_stock && (
                        <Table.Th>{renderSortableHeader('Stav Shoptet', 'shoptet_stock')}</Table.Th>
                      )}
                      {columnVisibility.elogist_stock && <Table.Th>Stav Elogist</Table.Th>}
                      {columnVisibility.stock_difference && (
                        <Table.Th>{renderSortableHeader('Rozdíl', 'stock_difference')}</Table.Th>
                      )}
                      {columnVisibility.visibility && (
                        <Table.Th>{renderSortableHeader('Zobrazení', 'visibility')}</Table.Th>
                      )}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {records.map((record) => (
                      <Table.Tr key={record.id}>
                        <Table.Td w={36}>
                          <Checkbox
                            checked={selectedSet.has(record.id)}
                            onChange={(event) => handleRowSelection(record.id, event.currentTarget.checked)}
                            aria-label={`Vybrat variantu ${record.variant_code ?? record.product_name}`}
                          />
                        </Table.Td>
                        {columnVisibility.product_name && (
                          <Table.Td>
                            <Stack gap={2}>
                              <Text fw={600}>{record.product_name}</Text>
                              <Text size="xs" c="gray.6">
                                ID: {record.product_id}
                              </Text>
                            </Stack>
                          </Table.Td>
                        )}
                        {columnVisibility.variant_code && (
                          <Table.Td>
                            <Text fw={500}>{record.variant_code ?? '—'}</Text>
                          </Table.Td>
                        )}
                        {columnVisibility.variant_name && <Table.Td>{record.variant_name}</Table.Td>}
                        {columnVisibility.product_type && (
                          <Table.Td>
                            <Badge color={record.product_type === 'set' ? 'violet' : 'gray'} variant="light">
                              {formatProductTypeLabel(record.product_type)}
                            </Badge>
                          </Table.Td>
                        )}
                        {columnVisibility.shoptet_stock && <Table.Td>{formatStock(record.shoptet_stock)}</Table.Td>}
                        {columnVisibility.elogist_stock && <Table.Td>{formatStock(record.elogist_stock)}</Table.Td>}
                        {columnVisibility.stock_difference && (
                          <Table.Td className={resolveDiffClass(record.stock_difference)}>
                            {record.stock_difference === null ? '—' : formatStock(record.stock_difference)}
                          </Table.Td>
                        )}
                        {columnVisibility.visibility && (
                          <Table.Td>
                            <Badge
                              color={record.is_visible ? 'teal' : 'gray'}
                              variant={record.is_visible ? 'filled' : 'light'}
                            >
                              {record.is_visible ? 'Zobrazeno' : 'Skryto'}
                            </Badge>
                          </Table.Td>
                        )}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            )}
          </div>

          <Group justify="space-between" align="center" gap="md" wrap="wrap">
            <Text size="sm" c="gray.6">
              Zobrazeno {from === 0 && to === 0 ? '0' : `${from}–${to}`} z {total} variant
            </Text>
            <Pagination
              value={page}
              onChange={handlePageChange}
              total={data?.last_page ?? 1}
              disabled={isLoading || (data?.last_page ?? 1) <= 1}
            />
          </Group>
        </Stack>
      </Card>
    </PageShell>
  );
};
