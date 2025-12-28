import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconAlertCircle, IconInfoCircle, IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { notifications } from '@mantine/notifications';
import type { InventoryRecommendationSettings } from '../../../api/settings';
import { useInventoryRecommendationSettings } from '../hooks/useInventoryRecommendationSettings';

type WeightRow = {
  key: string;
  weight: number;
};

const descriptorLabels: Record<string, string> = {
  inspirovano: 'Inspirováno',
  podobne: 'Podobné',
};

const relatedLabels: Record<string, string> = {
  physical: 'Fyzická vazba',
  reciprocal: 'Obousměrná vazba',
  default: 'Ostatní vazby',
};

const toRows = (record: Record<string, number>): WeightRow[] =>
  Object.entries(record ?? {})
    .map(([key, weight]) => ({ key, weight }))
    .sort((a, b) => a.key.localeCompare(b.key));

const toRecord = (rows: WeightRow[]): Record<string, number> => {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const slug = row.key.trim();
    if (slug === '' || Number.isNaN(row.weight)) {
      return acc;
    }

    acc[slug] = row.weight;
    return acc;
  }, {});
};

const normalizeRow = (row: WeightRow): WeightRow => ({
  key: row.key,
  weight: Number.isFinite(row.weight) ? row.weight : 0,
});

export const InventoryRecommendationSettingsPage = () => {
  const {
    query: { data, isLoading, isError },
    mutation,
  } = useInventoryRecommendationSettings();

  const defaults = useMemo<InventoryRecommendationSettings>(
    () => ({
      descriptors: { inspirovano: 500, podobne: 500 },
      filters: { znacka: 300, 'znacka-2': 300, pohlavi: 200, gender: 200, default: 10 },
      related_products: { physical: 3, reciprocal: 2, default: 1 },
      stock: { must_have_stock: true, weight: 1 },
      sales: { last_30_quantity_weight: 0.8, last_90_quantity_weight: 0.4 },
      price: { allowed_diff_percent: 25, match_weight: 0, cheaper_bonus: 0 },
      candidate_limit: 120,
    }),
    []
  );

  const [descriptorRows, setDescriptorRows] = useState<WeightRow[]>(toRows(defaults.descriptors));
  const [filterRows, setFilterRows] = useState<WeightRow[]>(toRows(defaults.filters));
  const [relatedRows, setRelatedRows] = useState<WeightRow[]>(toRows(defaults.related_products));
  const [mustHaveStock, setMustHaveStock] = useState(defaults.stock.must_have_stock);
  const [stockWeight, setStockWeight] = useState(defaults.stock.weight);
  const [last30Weight, setLast30Weight] = useState(defaults.sales.last_30_quantity_weight);
  const [last90Weight, setLast90Weight] = useState(defaults.sales.last_90_quantity_weight);
  const [priceDiff, setPriceDiff] = useState(defaults.price.allowed_diff_percent);
  const [priceMatch, setPriceMatch] = useState(defaults.price.match_weight);
  const [priceBonus, setPriceBonus] = useState(defaults.price.cheaper_bonus);
  const [candidateLimit, setCandidateLimit] = useState(defaults.candidate_limit);

  useEffect(() => {
    if (!data) {
      return;
    }

    setDescriptorRows(toRows(data.descriptors).map(normalizeRow));
    setFilterRows(toRows(data.filters).map(normalizeRow));
    setRelatedRows(toRows(data.related_products).map(normalizeRow));
    setMustHaveStock(Boolean(data.stock?.must_have_stock));
    setStockWeight(data.stock?.weight ?? defaults.stock.weight);
    setLast30Weight(data.sales?.last_30_quantity_weight ?? defaults.sales.last_30_quantity_weight);
    setLast90Weight(data.sales?.last_90_quantity_weight ?? defaults.sales.last_90_quantity_weight);
    setPriceDiff(data.price?.allowed_diff_percent ?? defaults.price.allowed_diff_percent);
    setPriceMatch(data.price?.match_weight ?? defaults.price.match_weight);
    setPriceBonus(data.price?.cheaper_bonus ?? defaults.price.cheaper_bonus);
    setCandidateLimit(data.candidate_limit ?? defaults.candidate_limit);
  }, [data, defaults]);

  const handleDescriptorWeightChange = (index: number, weight: number) => {
    setDescriptorRows((current) => {
      const next = [...current];
      next[index] = { ...next[index], weight };
      return next;
    });
  };

  const handleFilterChange = (index: number, patch: Partial<WeightRow>) => {
    setFilterRows((current) => {
      const next = [...current];
      next[index] = normalizeRow({ ...next[index], ...patch });
      return next;
    });
  };

  const handleRemoveFilter = (index: number) => {
    setFilterRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  };

  const handleAddFilter = () => {
    setFilterRows((current) => [...current, { key: '', weight: 0 }]);
  };

  const handleRelatedChange = (index: number, weight: number) => {
    setRelatedRows((current) => {
      const next = [...current];
      next[index] = { ...next[index], weight };
      return next;
    });
  };

  const handleSave = () => {
    const payload: Partial<InventoryRecommendationSettings> = {
      descriptors: toRecord(descriptorRows),
      filters: toRecord(filterRows),
      related_products: toRecord(relatedRows),
      stock: {
        must_have_stock: mustHaveStock,
        weight: stockWeight,
      },
      sales: {
        last_30_quantity_weight: last30Weight,
        last_90_quantity_weight: last90Weight,
      },
      price: {
        allowed_diff_percent: priceDiff,
        match_weight: priceMatch,
        cheaper_bonus: priceBonus,
      },
      candidate_limit: candidateLimit,
    };

    mutation.mutate(payload, {
      onSuccess: () => {
        notifications.show({
          title: 'Nastavení uložené',
          message: 'Váhy pro doporučování produktů byly aktualizovány.',
          color: 'green',
        });
      },
      onError: () => {
        notifications.show({
          title: 'Chyba při ukládání',
          message: 'Změny se nepodařilo uložit. Zkus to prosím znovu.',
          color: 'red',
        });
      },
    });
  };

  if (isLoading) {
    return (
      <Group justify="center">
        <Loader />
      </Group>
    );
  }

  if (isError || !data) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />} title="Nastavení se nepodařilo načíst">
        Zkus stránku obnovit nebo to zkus později.
      </Alert>
    );
  }

  return (
    <Stack gap="xl">
      <Stack gap="xs">
        <Title order={3}>Doporučování produktů</Title>
        <Text c="dimmed" size="sm">
          Úpravy vah ovlivní výběr doporučených variant na detailu produktu i v připravovaných upsell / cross-sell
          panelech. Změny se projeví u nových výpočtů během několika minut.
        </Text>
      </Stack>

      <Stack gap="lg">
        <Card withBorder radius="md" shadow="none">
          <Stack gap="md">
            <Group gap="sm" align="flex-start">
              <Title order={4}>Shoptet popisy</Title>
              <Text size="sm" c="dimmed">
                Váhy pro pole „Inspirováno“ a „Podobné“.
              </Text>
            </Group>

            <Table withRowBorders={false} verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Parametr</Table.Th>
                  <Table.Th w={160}>Váha</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {descriptorRows.map((row, index) => (
                  <Table.Tr key={row.key}>
                    <Table.Td>
                      <Text fw={500}>{descriptorLabels[row.key] ?? row.key}</Text>
                      <Text size="xs" c="dimmed">
                        Vyšší váha = větší důraz při shodě hodnot.
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <NumberInput
                        value={row.weight}
                        min={0}
                        step={0.5}
                        decimalSeparator="," 
                        thousandSeparator=" "
                        onChange={(value) => {
                          const numeric = typeof value === 'number' ? value : parseFloat(value ?? '0');
                          handleDescriptorWeightChange(index, Number.isFinite(numeric) ? numeric : 0);
                        }}
                      />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>

        <Card withBorder radius="md" shadow="none">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Title order={4}>Filtrační parametry</Title>
                <Text size="sm" c="dimmed">
                  Uprav váhu jednotlivých filtrů ze Shoptetu. Nové parametry přidej podle jejich slug hodnoty.
                </Text>
              </div>
              <Button leftSection={<IconPlus size={16} />} variant="light" onClick={handleAddFilter}>
                Přidat parametr
              </Button>
            </Group>

            <Table withRowBorders={false} verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Slug parametru</Table.Th>
                  <Table.Th w={160}>Váha</Table.Th>
                  <Table.Th w={60}></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filterRows.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={3}>
                      <Text size="sm" c="dimmed">
                        Zatím zde nejsou žádné váhy. Přidej parametry podle slugu z detailu produktu.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {filterRows.map((row, index) => (
                  <Table.Tr key={`${row.key}-${index}`}>
                    <Table.Td>
                      <TextInput
                        value={row.key}
                        placeholder="např. dominantni-ingredience"
                        onChange={(event) => handleFilterChange(index, { key: event.currentTarget.value })}
                      />
                    </Table.Td>
                    <Table.Td>
                      <NumberInput
                        value={row.weight}
                        min={0}
                        step={0.5}
                        decimalSeparator="," 
                        thousandSeparator=" "
                        onChange={(value) => {
                          const numeric = typeof value === 'number' ? value : parseFloat(value ?? '0');
                          handleFilterChange(index, { weight: Number.isFinite(numeric) ? numeric : 0 });
                        }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => handleRemoveFilter(index)}
                        aria-label="Odstranit parametr"
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>

        <Card withBorder radius="md" shadow="none">
          <Stack gap="md">
            <Group gap="sm" align="flex-start">
              <Title order={4}>Propojené produkty</Title>
              <Text size="sm" c="dimmed">
                Váhy pro vazby mezi produkty převzaté ze Shoptetu.
              </Text>
            </Group>

            <Table withRowBorders={false} verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Typ vazby</Table.Th>
                  <Table.Th w={160}>Váha</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {relatedRows.map((row, index) => (
                  <Table.Tr key={row.key}>
                    <Table.Td>
                      <Text fw={500}>{relatedLabels[row.key] ?? row.key}</Text>
                    </Table.Td>
                    <Table.Td>
                      <NumberInput
                        value={row.weight}
                        min={0}
                        step={0.5}
                        decimalSeparator="," 
                        thousandSeparator=" "
                        onChange={(value) => {
                          const numeric = typeof value === 'number' ? value : parseFloat(value ?? '0');
                          handleRelatedChange(index, Number.isFinite(numeric) ? numeric : 0);
                        }}
                      />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>

        <Card withBorder radius="md" shadow="none">
          <Stack gap="md">
            <Group gap="xs" align="flex-start">
              <Title order={4}>Další pravidla</Title>
              <Text size="sm" c="dimmed">
                Ovlivňují postih za vyprodané varianty, prodejnost i cenovou blízkost.
              </Text>
            </Group>

            <Stack gap="sm">
              <Group align="flex-end" gap="md">
                <Checkbox
                  label="Zobrazovat pouze varianty skladem"
                  checked={mustHaveStock}
                  onChange={(event) => setMustHaveStock(event.currentTarget.checked)}
                />
                <NumberInput
                  label="Bonus za skladovou dostupnost"
                  value={stockWeight}
                  min={0}
                  step={0.5}
                  decimalSeparator="," 
                  thousandSeparator=" "
                  onChange={(value) => {
                    const numeric = typeof value === 'number' ? value : parseFloat(value ?? '0');
                    setStockWeight(Number.isFinite(numeric) ? numeric : 0);
                  }}
                />
              </Group>

              <Group align="flex-end" gap="md">
                <NumberInput
                  label="Váha prodeje za posledních 30 dní"
                  value={last30Weight}
                  step={0.1}
                  decimalSeparator="," 
                  thousandSeparator=" "
                  onChange={(value) => {
                    const numeric = typeof value === 'number' ? value : parseFloat(value ?? '0');
                    setLast30Weight(Number.isFinite(numeric) ? numeric : 0);
                  }}
                />
                <NumberInput
                  label="Váha prodeje za posledních 90 dní"
                  value={last90Weight}
                  step={0.1}
                  decimalSeparator="," 
                  thousandSeparator=" "
                  onChange={(value) => {
                    const numeric = typeof value === 'number' ? value : parseFloat(value ?? '0');
                    setLast90Weight(Number.isFinite(numeric) ? numeric : 0);
                  }}
                />
              </Group>

              <Group align="flex-end" gap="md">
                <NumberInput
                  label="Max. rozdíl ceny (%)"
                  value={priceDiff}
                  min={0}
                  max={100}
                  step={1}
                  decimalSeparator="," 
                  thousandSeparator=" "
                  onChange={(value) => {
                    const numeric = typeof value === 'number' ? value : parseFloat(value ?? '0');
                    setPriceDiff(Number.isFinite(numeric) ? numeric : 0);
                  }}
                />
                <NumberInput
                  label="Bonus za podobnou cenu"
                  value={priceMatch}
                  step={0.5}
                  decimalSeparator="," 
                  thousandSeparator=" "
                  onChange={(value) => {
                    const numeric = typeof value === 'number' ? value : parseFloat(value ?? '0');
                    setPriceMatch(Number.isFinite(numeric) ? numeric : 0);
                  }}
                />
                <NumberInput
                  label="Extra bonus za levnější variantu"
                  value={priceBonus}
                  step={0.5}
                  decimalSeparator="," 
                  thousandSeparator=" "
                  onChange={(value) => {
                    const numeric = typeof value === 'number' ? value : parseFloat(value ?? '0');
                    setPriceBonus(Number.isFinite(numeric) ? numeric : 0);
                  }}
                />
              </Group>

              <Group align="flex-end" gap="md">
                <NumberInput
                  label="Maximální počet kandidátů"
                  description="Vyšší číslo = více variant ke srovnání, ale náročnější výpočet."
                  value={candidateLimit}
                  min={10}
                  max={500}
                  step={10}
                  onChange={(value) => {
                    const numeric = typeof value === 'number' ? value : parseFloat(value ?? '0');
                    setCandidateLimit(
                      Number.isFinite(numeric) ? Math.min(Math.max(Math.round(numeric), 10), 500) : 120
                    );
                  }}
                />
              </Group>

              <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light" radius="sm">
                Změny vazeb a vah se projeví u nových doporučení během několika minut.
              </Alert>
            </Stack>
          </Stack>
        </Card>
      </Stack>

      <Group justify="flex-end">
        <Button onClick={handleSave} loading={mutation.isPending}>
          Uložit změny
        </Button>
      </Group>
    </Stack>
  );
};
