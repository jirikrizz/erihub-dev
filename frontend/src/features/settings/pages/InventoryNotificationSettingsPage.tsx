import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconInfoCircle, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  type InventoryNotificationVariantSummary,
  type InventoryNotificationSettings,
} from '../../../api/settings';
import { fetchInventoryVariants, type InventoryVariant } from '../../../api/inventory';
import {
  useInventoryNotificationSettings,
  useUpdateInventoryNotificationSettings,
} from '../hooks/useInventoryNotificationSettings';
import { SurfaceCard } from '../../../components/layout/SurfaceCard';
import classes from './InventoryNotificationSettingsPage.module.css';

const statusLabel: Record<InventoryNotificationVariantSummary['stock_status'], string> = {
  in_stock: 'Skladem',
  low_stock: 'Nízká zásoba',
  sold_out: 'Vyprodáno',
  unknown: 'Neznámé',
};

const statusColor: Record<InventoryNotificationVariantSummary['stock_status'], string> = {
  in_stock: 'teal',
  low_stock: 'yellow',
  sold_out: 'red',
  unknown: 'gray',
};

const extractProductName = (variant: InventoryVariant): string | null => {
  const payload = variant.product?.base_payload;
  if (payload && typeof payload === 'object') {
    const raw = (payload as { name?: unknown }).name;
    if (typeof raw === 'string' && raw.trim() !== '') {
      return raw.trim();
    }
  }

  const productSku = variant.product?.sku;
  return productSku && productSku.trim() !== '' ? productSku.trim() : null;
};

const toSummary = (variant: InventoryVariant): InventoryNotificationVariantSummary => ({
  id: variant.id,
  code: variant.code,
  sku: variant.sku,
  name: variant.name,
  stock: variant.stock,
  min_stock_supply: variant.min_stock_supply,
  stock_status: variant.stock_status,
  unit: variant.unit,
  product: {
    id: variant.product?.id ?? null,
    sku: variant.product?.sku ?? null,
    name: extractProductName(variant),
  },
  shop: {
    id: variant.product?.shop_id ?? null,
    name: null,
  },
});

const resolveVariantLabel = (variant: InventoryNotificationVariantSummary): string => {
  const productName = variant.product?.name;
  const variantName = variant.name;

  if (productName && variantName) {
    return `${productName} – ${variantName}`;
  }

  return productName ?? variantName ?? variant.code ?? variant.sku ?? 'Varianta';
};

const formatQuantity = (value: number | null | undefined, unit?: string | null) => {
  if (value === null || value === undefined) {
    return '—';
  }

  const formatted = Number.isInteger(value) ? value.toString() : value.toFixed(2);
  return unit ? `${formatted} ${unit}` : formatted;
};

const areSameSelection = (current: InventoryNotificationVariantSummary[], original?: string[]): boolean => {
  const currentIds = current.map((variant) => variant.id);
  const originalIds = original ?? [];
  if (currentIds.length !== originalIds.length) {
    return false;
  }

  return currentIds.every((id, index) => id === originalIds[index]);
};

export const InventoryNotificationSettingsPage = () => {
  const settingsQuery = useInventoryNotificationSettings();
  const updateMutation = useUpdateInventoryNotificationSettings();

  const [lowStockThreshold, setLowStockThreshold] = useState<number>(5);
  const [watchVariants, setWatchVariants] = useState<InventoryNotificationVariantSummary[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);

  useEffect(() => {
    if (settingsQuery.data) {
      const settings = settingsQuery.data;
      setLowStockThreshold(settings.low_stock_threshold ?? 0);
      setWatchVariants(settings.watch_variants ?? []);
    }
  }, [settingsQuery.data]);

  const searchQuery = useQuery({
    queryKey: ['inventory', 'variant-search', debouncedSearch],
    queryFn: async () => {
      const response = await fetchInventoryVariants({
        search: debouncedSearch,
        per_page: 10,
        sort_by: 'stock',
        sort_dir: 'asc',
      });
      return response.data;
    },
    enabled: debouncedSearch.trim().length >= 2,
  });

  const searchResults = useMemo(() => {
    if (!searchQuery.data) {
      return [];
    }

    const selectedIds = new Set(watchVariants.map((variant) => variant.id));

    return searchQuery.data
      .filter((variant) => !selectedIds.has(variant.id))
      .map((variant) => toSummary(variant));
  }, [searchQuery.data, watchVariants]);

  const handleAddVariant = (variant: InventoryNotificationVariantSummary) => {
    setWatchVariants((current) => {
      if (current.some((item) => item.id === variant.id)) {
        notifications.show({
          color: 'yellow',
          title: 'Varianta už je přidaná',
          message: 'Vybraná varianta je už na seznamu hlídaných položek.',
        });
        return current;
      }

      return [...current, variant];
    });
  };

  const handleRemoveVariant = (variantId: string) => {
    setWatchVariants((current) => current.filter((variant) => variant.id !== variantId));
  };

  const handleSave = () => {
    const payload = {
      low_stock_threshold: Number.isFinite(lowStockThreshold) ? lowStockThreshold : 0,
      watch_variant_ids: watchVariants.map((variant) => variant.id),
    };

    updateMutation.mutate(payload, {
      onSuccess: (data: InventoryNotificationSettings) => {
        setLowStockThreshold(data.low_stock_threshold ?? 0);
        setWatchVariants(data.watch_variants ?? []);
        notifications.show({
          color: 'green',
          title: 'Uloženo',
          message: 'Nastavení alertů zásob bylo aktualizováno.',
        });
      },
      onError: () => {
        notifications.show({
          color: 'red',
          title: 'Uložení selhalo',
          message: 'Nastavení alertů se nepodařilo uložit. Zkus to prosím znovu.',
        });
      },
    });
  };

  const hasChanges = useMemo(() => {
    if (!settingsQuery.data) {
      return false;
    }

    const original = settingsQuery.data;
    const thresholdChanged = (original.low_stock_threshold ?? 0) !== (lowStockThreshold ?? 0);

    return thresholdChanged || !areSameSelection(watchVariants, original.watch_variant_ids);
  }, [settingsQuery.data, watchVariants, lowStockThreshold]);

  if (settingsQuery.isLoading) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  if (settingsQuery.isError) {
    return (
      <Alert color="red" title="Nepodařilo se načíst nastavení alertů zásob" variant="light">
        Zkontroluj prosím připojení a zkus akci znovu.
      </Alert>
    );
  }

  return (
    <Stack gap="lg" className={classes.page}>
      <Stack gap={4} className={classes.heading}>
        <Title order={3} className={classes.title}>
          Alerty zásob
        </Title>
        <Text size="sm" className={classes.description}>
          Urči hranici pro nízkou zásobu a vyber varianty, které chceš sledovat, když se vyprodají. Tyto
          volby se promítnou do notifikačního centra i přehledu ve zvonku.
        </Text>
      </Stack>

      <SurfaceCard className={classes.sectionCard}>
        <Stack gap="lg">
          <Stack gap={4}>
            <Text fw={600}>Hranice nízké zásoby</Text>
            <Text size="sm" c="dimmed">
              Pokud varianta nemá vlastní minimum, použije se tato hodnota pro vyhodnocení alertu
              „Varianta má nízkou zásobu“.
            </Text>
            <NumberInput
              value={lowStockThreshold}
              min={0}
              max={100000}
              step={1}
              onChange={(value) => {
                setLowStockThreshold(typeof value === 'number' ? value : 0);
              }}
              maw={160}
            />
          </Stack>

          <Stack gap="sm">
            <Group justify="space-between" align="flex-start">
              <Stack gap={2}>
                <Text fw={600}>Hlídané varianty (vyprodání)</Text>
                <Text size="sm" c="dimmed">
                  Pro vybrané varianty se odešle notifikace „Varianta je vyprodaná“, jakmile zásoba klesne na
                  nulu.
                </Text>
              </Stack>
              <Button
                variant="light"
                onClick={handleSave}
                disabled={!hasChanges}
                loading={updateMutation.isPending}
              >
                Uložit změny
              </Button>
            </Group>

            <TextInput
              placeholder="Hledat variantu podle SKU, názvu nebo kódu"
              leftSection={<IconSearch size={16} />}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              description="Začni psát alespoň 2 znaky. Výsledky můžeš přidat mezi hlídané varianty."
              w={{ base: '100%', md: 420 }}
            />

            {debouncedSearch.trim().length >= 2 ? (
              <SurfaceCard p="sm" className={classes.subCard}>
                <Stack gap="xs">
                  <Group gap="xs" align="center">
                    <IconInfoCircle size={16} />
                    <Text size="sm" fw={600}>
                      Výsledky vyhledávání
                    </Text>
                  </Group>

                  {searchQuery.isLoading ? (
                    <Group gap="xs" align="center">
                      <Loader size="sm" />
                      <Text size="sm" c="dimmed">
                        Načítám varianty...
                      </Text>
                    </Group>
                  ) : searchResults.length ? (
                    searchResults.map((variant) => (
                      <Group
                        key={variant.id}
                        justify="space-between"
                        align="center"
                        wrap="wrap"
                        gap="xs"
                      >
                        <Stack gap={0} style={{ flex: 1 }}>
                          <Text size="sm" fw={600}>
                            {resolveVariantLabel(variant)}
                          </Text>
                          <Text size="xs" c="dimmed">
                            SKU (varianta): {variant.code ?? '—'} · Produkt SKU: {variant.product?.sku ?? '—'}
                          </Text>
                        </Stack>
                        <Badge color={statusColor[variant.stock_status]} variant="light">
                          {statusLabel[variant.stock_status]}
                        </Badge>
                        <Button
                          size="xs"
                          leftSection={<IconPlus size={14} />}
                          onClick={() => handleAddVariant(variant)}
                        >
                          Přidat
                        </Button>
                      </Group>
                    ))
                  ) : (
                    <Text size="sm" c="dimmed">
                      Nic jsme nenašli. Zkus upřesnit hledaný výraz.
                    </Text>
                  )}
                </Stack>
              </SurfaceCard>
            ) : null}

            <Table withTableBorder stickyHeader className={classes.table}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Varianta</Table.Th>
                  <Table.Th style={{ width: 120 }}>Zásoba</Table.Th>
                  <Table.Th style={{ width: 160 }}>Minimální zásoba</Table.Th>
                  <Table.Th style={{ width: 130 }}>Stav</Table.Th>
                  <Table.Th style={{ width: 80 }}>Akce</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {watchVariants.length ? (
                  watchVariants.map((variant) => (
                    <Table.Tr key={variant.id}>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text fw={600}>{resolveVariantLabel(variant)}</Text>
                          <Text size="xs" c="dimmed">
                            SKU (varianta): {variant.code ?? '—'} · Produkt SKU: {variant.product?.sku ?? '—'}
                          </Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        {formatQuantity(variant.stock, variant.unit)}
                      </Table.Td>
                      <Table.Td>
                        {variant.min_stock_supply !== null && variant.min_stock_supply !== undefined
                          ? formatQuantity(variant.min_stock_supply, variant.unit)
                          : '—'}
                      </Table.Td>
                      <Table.Td>
                        <Badge color={statusColor[variant.stock_status]} variant="light">
                          {statusLabel[variant.stock_status]}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => handleRemoveVariant(variant.id)}
                        >
                          Odebrat
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))
                ) : (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Box py="md">
                        <Text size="sm" c="dimmed" ta="center">
                          Zatím nejsou vybrané žádné varianty. Vyhledej variantu výše a přidej ji mezi hlídané.
                        </Text>
                      </Box>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Stack>
        </Stack>
      </SurfaceCard>
    </Stack>
  );
};
