import { Badge, Button, Group, Loader, Modal, Stack, Table, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch, IconShoppingBag } from '@tabler/icons-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { InventoryVariant } from '../../../api/inventory';
import { fetchInventoryVariants } from '../../../api/inventory';

type ProductPickerModalProps = {
  opened: boolean;
  onClose: () => void;
  onSelect: (variant: InventoryVariant) => void;
};

const currencyFormatter = (currency?: string | null) =>
  new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: currency ?? 'CZK',
    maximumFractionDigits: 2,
  });

export const ProductPickerModal = ({ opened, onClose, onSelect }: ProductPickerModalProps) => {
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search.trim(), 250);

  const variantsQuery = useQuery({
    queryKey: ['inventory', 'variants', 'microsite-picker', debounced],
    queryFn: () => fetchInventoryVariants({ search: debounced, per_page: 12 }),
    enabled: opened && debounced.length >= 2,
    staleTime: 60_000,
  });

  const variants = variantsQuery.data?.data ?? [];

  const handleSelect = (variant: InventoryVariant) => {
    onSelect(variant);
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {
        onClose();
        setSearch('');
      }}
      size="xl"
      title="Vyber produkt do microshopu"
    >
      <Stack gap="md">
        <TextInput
          label="Hledat produkt"
          description="Hledej podle kódu, názvu nebo SKU. Zobrazí se pouze dostupné varianty."
          placeholder="Např. KV-AROMA-50 nebo Parfémová sada"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          leftSection={<IconSearch size={16} aria-hidden="true" />}
          autoFocus
        />

        {debounced.length < 2 ? (
          <Text c="dimmed">Zadej alespoň dva znaky, abychom mohli vyhledat produkty.</Text>
        ) : variantsQuery.isLoading ? (
          <Group justify="center" py="lg">
            <Loader />
          </Group>
        ) : variants.length === 0 ? (
          <Stack gap={2} align="center" py="md">
            <IconShoppingBag size={32} />
            <Text fw={500}>Nic jsme nenašli.</Text>
            <Text size="sm" c="dimmed">
              Zkus upravit hledaný výraz nebo vyhledávej podle jiného kódu.
            </Text>
          </Stack>
        ) : (
          <Table highlightOnHover withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: '35%' }}>Produkt</Table.Th>
                <Table.Th>Kód</Table.Th>
                <Table.Th style={{ width: '15%' }}>Cena</Table.Th>
                <Table.Th style={{ width: '15%' }}>Sklad</Table.Th>
                <Table.Th style={{ width: '12%' }}></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {variants.map((variant) => {
                const productName =
                  (variant.product?.base_payload as { name?: string } | undefined)?.name ??
                  variant.product?.external_guid ??
                  null;

                return (
                <Table.Tr key={variant.id}>
                  <Table.Td>
                    <Stack gap={2}>
                      <Text fw={600}>{variant.name ?? 'Bez názvu'}</Text>
                      {productName ? (
                        <Text size="sm" c="dimmed">
                          {productName}
                        </Text>
                      ) : null}
                      {variant.brand ? (
                        <Group gap={6}>
                          <Badge variant="light" color="gray" size="sm">
                            {variant.brand}
                          </Badge>
                        </Group>
                      ) : null}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={2} align="flex-start">
                      <Badge variant="light" color="blue">
                        {variant.code}
                      </Badge>
                      {variant.ean ? <Text size="xs">EAN: {variant.ean}</Text> : null}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Text fw={600}>
                      {variant.price != null
                        ? currencyFormatter(variant.currency_code).format(variant.price)
                        : '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text>{variant.stock ?? '—'}</Text>
                    <Text size="xs" c="dimmed">
                      {variant.stock_status === 'in_stock'
                        ? 'Skladem'
                        : variant.stock_status === 'low_stock'
                        ? 'Nízký stav'
                        : variant.stock_status === 'sold_out'
                        ? 'Vyprodáno'
                        : 'Neznámé'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Button variant="light" size="xs" onClick={() => handleSelect(variant)}>
                      Vybrat
                    </Button>
                  </Table.Td>
                </Table.Tr>
              );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Modal>
  );
};
