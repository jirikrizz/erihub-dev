import { Badge, Table, Text } from '@mantine/core';
import type { Product } from '../../../api/pim';
import type { Shop } from '../../../api/shops';

type Props = {
  products: Product[];
  onRowClick?: (product: Product) => void;
  targetShopId?: number | null;
  shops: Shop[];
  visibleColumns?: string[];
};

const statusColors: Record<string, string> = {
  active: 'green',
  inactive: 'gray',
};

const translationStatusColors: Record<string, string> = {
  draft: 'yellow',
  in_review: 'orange',
  approved: 'blue',
  synced: 'green',
};

const translationStatusLabels: Record<string, string> = {
  draft: 'Draft',
  in_review: 'Ke kontrole',
  approved: 'Schváleno',
  synced: 'Nasazeno',
};

export const ProductsTable = ({ products, onRowClick, targetShopId, shops, visibleColumns }: Props) => {
  const show = (key: string) => !visibleColumns || visibleColumns.includes(key);

  return (
  <Table highlightOnHover verticalSpacing="md">
    <Table.Thead>
      <Table.Tr>
        {show('name') && <Table.Th>Název</Table.Th>}
        {show('sku') && <Table.Th>SKU</Table.Th>}
        {show('master_shop') && <Table.Th>Master shop</Table.Th>}
        {show('coverage') && <Table.Th>Pokrytí cílového shopu</Table.Th>}
        {show('translation_status') && <Table.Th>Stav překladu</Table.Th>}
        {show('status') && <Table.Th>Stav produktu</Table.Th>}
      </Table.Tr>
    </Table.Thead>
    <Table.Tbody>
      {products.map((product) => {
        const targetState =
          targetShopId && Number(product.target_shop_state?.shop_id ?? 0) === targetShopId
            ? product.target_shop_state
            : null;

        const rowBackground = (() => {
          if (!targetShopId) {
            return undefined;
          }

          if (targetState) {
            return targetState.is_fully_translated
              ? 'var(--mantine-color-green-0)'
              : 'var(--mantine-color-gray-1)';
          }

          return 'var(--mantine-color-gray-1)';
        })();

        return (
          <Table.Tr
            key={product.id}
            onClick={() => onRowClick?.(product)}
            style={{
              cursor: 'pointer',
              backgroundColor: rowBackground,
              transition: 'background-color 150ms ease',
            }}
          >
            {show('name') && (
              <Table.Td>
                <Text fw={500}>{(product.base_payload?.name as string) ?? product.external_guid}</Text>
                <Text size="xs" c="dimmed">
                  {product.external_guid}
                </Text>
              </Table.Td>
            )}
            {show('sku') && <Table.Td>{product.sku ?? '-'}</Table.Td>}
            {show('master_shop') && (
              <Table.Td>
                {shops.find((shop) => shop.id === product.shop_id)?.name ?? `Shop #${product.shop_id}`}
              </Table.Td>
            )}
            {show('coverage') && (
              <Table.Td>
                {targetState ? (
                  <div>
                    <Text size="sm">
                      Varianty: {targetState.variants_matched}/{targetState.variants_total}
                    </Text>
                    <Badge
                      mt={4}
                      size="sm"
                      color={targetState.has_product_overlay ? 'green' : 'gray'}
                      variant="light"
                    >
                      {targetState.has_product_overlay ? 'Produkt existuje' : 'Chybí produkt'}
                    </Badge>
                  </div>
                ) : targetShopId ? (
                  <Text size="sm" c="dimmed">
                    Není vytvořen overlay
                  </Text>
                ) : (
                  <Text size="sm" c="dimmed">—</Text>
                )}
              </Table.Td>
            )}
            {show('translation_status') && (
              <Table.Td>
                {targetState ? (
                  targetState.translation_status ? (
                    <Badge
                      color={translationStatusColors[targetState.translation_status] ?? 'gray'}
                      variant="filled"
                      size="sm"
                    >
                      {translationStatusLabels[targetState.translation_status] ?? targetState.translation_status}
                    </Badge>
                  ) : (
                    <Text size="sm" c="dimmed">
                      Bez překladu
                    </Text>
                  )
                ) : targetShopId ? (
                  <Text size="sm" c="dimmed">
                    Produkt není v cílovém shopu
                  </Text>
                ) : (
                  <Text size="sm" c="dimmed">—</Text>
                )}
              </Table.Td>
            )}
            {show('status') && (
              <Table.Td>
                <Badge color={statusColors[product.status] ?? 'gray'}>
                  {product.status}
                </Badge>
              </Table.Td>
            )}
          </Table.Tr>
        );
      })}
    </Table.Tbody>
  </Table>
  );
};
