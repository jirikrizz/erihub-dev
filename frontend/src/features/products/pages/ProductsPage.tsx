import { Button, Group, Loader, Pagination, ScrollArea, Select, Stack, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useProducts } from '../hooks/useProducts';
import { ProductsTable } from '../components/ProductsTable';
import { useShops } from '../../shoptet/hooks/useShops';
import { useUserPreference } from '../../../hooks/useUserPreference';
import { SectionPageShell } from '../../../components/layout/SectionPageShell';
import { SurfaceCard } from '../../../components/layout/SurfaceCard';
import { TableToolbar } from '../../../components/table/TableToolbar';
import { bootstrapMasterProducts, type Shop } from '../../../api/shops';

const EMPTY_SHOPS: Shop[] = [];

const translationStatusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'Ke kontrole' },
  { value: 'approved', label: 'Schváleno' },
  { value: 'synced', label: 'Nasazeno' },
];

const DEFAULT_SORT = 'created_at:desc';

const sortOptions = [
  { value: 'created_at:desc', label: 'Nejnovější' },
  { value: 'created_at:asc', label: 'Nejstarší' },
  { value: 'translation_status:asc', label: 'Chybí překlad nejdřív' },
  { value: 'translation_status:desc', label: 'Překlady hotové nejdřív' },
];

const normalizeText = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const parseNullableNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('cs-CZ');
};

type ProductsListPreference = {
  page?: number;
  per_page?: number;
  search?: string;
  translation_status?: string | null;
  source_shop_id?: number | null;
  target_shop_id?: number | null;
  sort?: string | null;
};

type ProductColumn = 'name' | 'sku' | 'master_shop' | 'coverage' | 'translation_status' | 'status';

const PRODUCT_COLUMN_LABELS: Record<ProductColumn, string> = {
  name: 'Název',
  sku: 'SKU',
  master_shop: 'Master shop',
  coverage: 'Pokrytí cílového shopu',
  translation_status: 'Stav překladu',
  status: 'Stav produktu',
};

const PRODUCT_COLUMN_KEYS: ProductColumn[] = [
  'name',
  'sku',
  'master_shop',
  'coverage',
  'translation_status',
  'status',
];

const DEFAULT_PRODUCT_COLUMNS: Record<ProductColumn, boolean> = {
  name: true,
  sku: true,
  master_shop: true,
  coverage: true,
  translation_status: true,
  status: true,
};

export const ProductsPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  // @ts-expect-error - setPerPage will be used for per_page UI control
  const [perPage, setPerPage] = useState(25);
  const [translationStatus, setTranslationStatus] = useState<string | null>(null);
  const [sort, setSort] = useState<string>(DEFAULT_SORT);
  const [search, setSearch] = useState('');
  const [sourceShopId, setSourceShopId] = useState<number | null>(null);
  const [targetShopId, setTargetShopId] = useState<number | null>(null);
  const [debouncedSearch] = useDebouncedValue(search, 350);
  const [productColumns, setProductColumns] = useState<Record<ProductColumn, boolean>>(DEFAULT_PRODUCT_COLUMNS);
  const navigate = useNavigate();
  const shopsQuery = useShops({ per_page: 100 });
  const shops = shopsQuery.data?.data ?? EMPTY_SHOPS;
  const sourceShop = useMemo(
    () => shops.find((shop) => shop.id === sourceShopId) ?? null,
    [shops, sourceShopId]
  );
  const {
    value: storedPreference,
    isLoading: preferenceLoading,
    save: saveProductsPreference,
  } = useUserPreference<ProductsListPreference>('products.list');
  const [preferenceHydrated, setPreferenceHydrated] = useState(false);
  const preferenceSaveTimeoutRef = useRef<number | null>(null);
  const lastSavedPreferenceRef = useRef<string | null>(null);
  const hasSetInitialSource = useRef(false);
  const hasSetInitialTarget = useRef(false);

  const masterShopOptions = useMemo(
    () =>
      shops
        .filter((shop) => shop.is_master)
        .map((shop) => ({ value: shop.id.toString(), label: `${shop.name} (ID ${shop.id})` })),
    [shops]
  );

  const targetShopOptions = useMemo(
    () =>
      shops
        .filter((shop) => !shop.is_master)
        .map((shop) => ({ value: shop.id.toString(), label: `${shop.name} (ID ${shop.id})` })),
    [shops]
  );

  const visibleProductColumns = useMemo(
    () => PRODUCT_COLUMN_KEYS.filter((key) => productColumns[key]),
    [productColumns]
  );

  const buildPreferencePayload = useCallback((): ProductsListPreference => {
    return {
      page,
      search: normalizeText(search),
      translation_status: translationStatus,
      source_shop_id: sourceShopId ?? null,
      target_shop_id: targetShopId ?? null,
      sort,
    };
  }, [page, search, sort, sourceShopId, targetShopId, translationStatus]);

  const isDefaultProductsPreference = useCallback((preference: ProductsListPreference) => {
    return (
      (preference.page ?? 1) === 1 &&
      preference.search === undefined &&
      (preference.translation_status ?? null) === null &&
      (preference.source_shop_id ?? null) === null &&
      (preference.target_shop_id ?? null) === null &&
      ((preference.sort ?? DEFAULT_SORT) === DEFAULT_SORT)
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
    const nextTranslationStatus =
      typeof preference.translation_status === 'string' ? preference.translation_status : null;
    const nextSourceShop = parseNullableNumber(preference.source_shop_id);
    const nextTargetShop = parseNullableNumber(preference.target_shop_id);
    const nextSort = typeof preference.sort === 'string' ? preference.sort : DEFAULT_SORT;

    setPage(nextPage);
    setSearch(nextSearch);
    setTranslationStatus(nextTranslationStatus);
    setSourceShopId(nextSourceShop);
    setTargetShopId(nextTargetShop);
    setSort(nextSort);
    hasSetInitialSource.current = true;
    hasSetInitialTarget.current = true;

    const trackingPayload: ProductsListPreference = {
      page: nextPage,
      search: normalizeText(nextSearch),
      translation_status: nextTranslationStatus,
      source_shop_id: nextSourceShop,
      target_shop_id: nextTargetShop,
      sort: nextSort,
    };

    lastSavedPreferenceRef.current = isDefaultProductsPreference(trackingPayload)
      ? '__default__'
      : JSON.stringify(trackingPayload);

    setPreferenceHydrated(true);
  }, [
    isDefaultProductsPreference,
    preferenceHydrated,
    preferenceLoading,
    storedPreference,
  ]);

  useEffect(() => {
    if (!preferenceHydrated) {
      return;
    }

    const payload = buildPreferencePayload();
    const defaultPreference = isDefaultProductsPreference(payload);
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
        saveProductsPreference(null);
      } else {
        saveProductsPreference(payload);
      }
    }, 600);
  }, [
    buildPreferencePayload,
    isDefaultProductsPreference,
    preferenceHydrated,
    saveProductsPreference,
  ]);

  useEffect(() => {
    return () => {
      if (preferenceSaveTimeoutRef.current !== null) {
        window.clearTimeout(preferenceSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      !hasSetInitialSource.current &&
      sourceShopId === null &&
      masterShopOptions.length > 0
    ) {
      setSourceShopId(Number(masterShopOptions[0].value));
      hasSetInitialSource.current = true;
    }
  }, [masterShopOptions, sourceShopId]);

  useEffect(() => {
    if (
      !hasSetInitialTarget.current &&
      targetShopId === null &&
      targetShopOptions.length > 0
    ) {
      setTargetShopId(Number(targetShopOptions[0].value));
      hasSetInitialTarget.current = true;
    }
  }, [targetShopId, targetShopOptions]);

  const [sortByField, sortDir] = useMemo(() => {
    if (!sort) {
      return [undefined, undefined] as const;
    }
    const [field, direction] = sort.split(':');
    return [field ?? undefined, direction ?? undefined] as const;
  }, [sort]);

  const params = useMemo(
    () => ({
      page,
      per_page: perPage,
      search: debouncedSearch || undefined,
      translation_status: translationStatus || undefined,
      shop_id: sourceShopId ?? undefined,
      target_shop_id: targetShopId ?? undefined,
      sort_by: sortByField,
      sort_direction: sortDir,
    }),
    [page, perPage, debouncedSearch, sortByField, sortDir, translationStatus, sourceShopId, targetShopId]
  );

  const { data, isLoading } = useProducts(params);

  const bootstrapProductsMutation = useMutation({
    mutationFn: async () => {
      if (sourceShopId === null) {
        throw new Error('Nejprve vyber master shop.');
      }

      if (!sourceShop?.is_master) {
        throw new Error('Manuální import je dostupný pouze pro master shop.');
      }

      return bootstrapMasterProducts(sourceShopId);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      const processed = result.data?.processed ?? 0;
      const window = result.data?.window;
      const windowInfo = window
        ? ` (okno ${formatDateTime(window.from)} – ${formatDateTime(window.to)})`
        : '';

      const color = processed > 0 ? 'teal' : 'blue';
      notifications.show({
        message: `Import produktů dokončen, zpracováno ${processed} položek${windowInfo}.`,
        color,
      });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Import produktů se nezdařil';
      notifications.show({ message, color: 'red' });
    },
  });

  return (
    <SectionPageShell
      section="products"
      actions={[
        <Button
          key="bootstrap"
          variant="outline"
          color="teal"
          onClick={() => bootstrapProductsMutation.mutate()}
          loading={bootstrapProductsMutation.isPending}
          disabled={bootstrapProductsMutation.isPending || sourceShopId === null || !sourceShop?.is_master}
        >
          Stáhnout nové produkty
        </Button>,
        <Button key="mapping" variant="light" onClick={() => navigate('/categories/mapping')}>
          Mapování kategorií
        </Button>,
      ]}
    >
      <Stack gap="lg">
        <SurfaceCard>
          <Group align="flex-end" gap="md" wrap="wrap">
            <TextInput
              label="Vyhledávání"
              placeholder="Název produktu, varianta, kód nebo EAN"
              value={search}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                setPage(1);
              }}
            />
            <Select
              label="Master shop"
              placeholder={shopsQuery.isLoading ? 'Načítám...' : 'Vyber master shop'}
              data={masterShopOptions}
              value={sourceShopId !== null ? sourceShopId.toString() : null}
              onChange={(value) => {
                const parsed = value ? Number(value) : null;
                setSourceShopId(parsed);
                setPage(1);
              }}
              disabled={shopsQuery.isLoading}
              clearable
            />
            <Select
              label="Cílový shop"
              placeholder={shopsQuery.isLoading ? 'Načítám...' : 'Vyber shop'}
              data={targetShopOptions}
              value={targetShopId !== null ? targetShopId.toString() : null}
              onChange={(value) => {
                const parsed = value ? Number(value) : null;
                setTargetShopId(parsed);
                setPage(1);
              }}
              disabled={shopsQuery.isLoading || targetShopOptions.length === 0}
              clearable
            />
            <Select
              label="Stav překladu"
              placeholder="Filtrovat dle stavu"
              data={translationStatusOptions}
              value={translationStatus}
              onChange={(value) => {
                setTranslationStatus(value);
                setPage(1);
              }}
              clearable
            />
            <Select
              label="Řazení"
              placeholder="Vyber řazení"
              data={sortOptions}
              value={sort}
              onChange={(value) => {
                const nextValue = value ?? DEFAULT_SORT;
                setSort(nextValue);
                setPage(1);
              }}
            />
            <Button
              variant="light"
              onClick={() => {
                setSearch('');
                setTranslationStatus(null);
                setSort(DEFAULT_SORT);
                setSourceShopId(
                  masterShopOptions.length > 0 ? Number(masterShopOptions[0].value) : null
                );
                setTargetShopId(
                  targetShopOptions.length > 0 ? Number(targetShopOptions[0].value) : null
                );
                setPage(1);
              }}
            >
              Reset
            </Button>
          </Group>
        </SurfaceCard>

        <SurfaceCard p="0">
          <Stack gap="sm" px="md" pt="md">
            <TableToolbar
              columns={PRODUCT_COLUMN_KEYS.map((key) => ({ key, label: PRODUCT_COLUMN_LABELS[key] }))}
              columnVisibility={productColumns}
              onToggleColumn={(key, checked) =>
                setProductColumns((current) => ({ ...current, [key as ProductColumn]: checked }))
              }
            />
          </Stack>

          <ScrollArea type="auto">
            <div style={{ minWidth: 960 }}>
              {isLoading && (
                <Group justify="center" gap="xs" py="lg">
                  <Loader size="sm" />
                  <span>Načítám produkty…</span>
                </Group>
              )}
              {data && !isLoading && data.data.length === 0 && (
                <Group justify="center" py="lg">
                  <span>Žádné produkty nebyly nalezeny.</span>
                </Group>
              )}
              {data && data.data.length > 0 && (
                <ProductsTable
                  products={data.data}
                  targetShopId={targetShopId}
                  shops={shops}
                  visibleColumns={visibleProductColumns}
                  onRowClick={(product) =>
                    navigate(
                      targetShopId
                        ? `/products/${product.id}?shop=${targetShopId}`
                        : `/products/${product.id}`
                    )
                  }
                />
              )}
            </div>
          </ScrollArea>

          {data && (
            <Group justify="flex-end" p="md">
              <Pagination value={page} onChange={setPage} total={data.last_page} />
            </Group>
          )}
        </SurfaceCard>
      </Stack>
    </SectionPageShell>
  );
};
