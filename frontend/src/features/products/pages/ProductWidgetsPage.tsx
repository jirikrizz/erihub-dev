import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Pagination,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPlus, IconSearch, IconExternalLink } from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionPageShell } from '../../../components/layout/SectionPageShell';
import { SurfaceCard } from '../../../components/layout/SurfaceCard';
import { useProductWidgets } from '../hooks/useProductWidgets';

const statusBadgeColor = (status: string) => {
  switch (status) {
    case 'published':
      return 'green';
    case 'draft':
    default:
      return 'gray';
  }
};

export const ProductWidgetsPage = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  // @ts-expect-error - setPerPage will be used for per_page UI control
  const [perPage, setPerPage] = useState(25);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search.trim(), 250);

  const params = useMemo(
    () => ({
      page,
      per_page: perPage,
      search: debouncedSearch !== '' ? debouncedSearch : undefined,
    }),
    [page, perPage, debouncedSearch]
  );

  const widgetsQuery = useProductWidgets(params);
  const widgets = widgetsQuery.data?.data ?? [];
  const totalPages = widgetsQuery.data?.last_page ?? 1;

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <SectionPageShell
      section="products"
      title="Widgety"
      description="Spravuj embed widgety s vybranými produkty a vkládej je na svůj web pomocí jednoduchého skriptu."
      actions={
        <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/products/widgets/new')}>
          Nový widget
        </Button>
      }
    >
      <SurfaceCard>
        <Stack gap="lg">
          <Group justify="space-between" align="flex-end">
            <TextInput
              label="Hledat"
              placeholder="Název nebo slug widgetu"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              leftSection={<IconSearch size={16} aria-hidden="true" />}
              style={{ maxWidth: 320 }}
            />
          </Group>

          {widgetsQuery.isLoading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : widgets.length === 0 ? (
            <Stack align="center" gap={6} py="xl">
              <Text fw={600}>Zatím žádné widgety</Text>
              <Text size="sm" c="dimmed" ta="center" maw={360}>
                Vytvoř první widget, vyber produkty a vlož kód na svůj web.
              </Text>
              <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/products/widgets/new')}>
                Založit widget
              </Button>
            </Stack>
          ) : (
            <>
              <Table highlightOnHover verticalSpacing="md">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Název</Table.Th>
                    <Table.Th>Slug</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Počet položek</Table.Th>
                    <Table.Th>Aktualizováno</Table.Th>
                    <Table.Th></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {widgets.map((widget) => (
                    <Table.Tr key={widget.id}>
                      <Table.Td>
                        <Text fw={600}>{widget.name}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {widget.slug}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={statusBadgeColor(widget.status)}>{widget.status === 'published' ? 'Publikováno' : 'Draft'}</Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text>{widget.items?.length ?? 0}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{new Date(widget.updated_at).toLocaleString('cs-CZ')}</Text>
                      </Table.Td>
                      <Table.Td>
                        <ActionIcon variant="subtle" color="blue" onClick={() => navigate(`/products/widgets/${widget.id}`)} aria-label="Otevřít widget">
                          <IconExternalLink size={18} />
                        </ActionIcon>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>

              {totalPages > 1 ? (
                <Group justify="flex-end">
                  <Pagination value={page} onChange={setPage} total={totalPages} />
                </Group>
              ) : null}
            </>
          )}
        </Stack>
      </SurfaceCard>
    </SectionPageShell>
  );
};
