import {
  Anchor,
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Pagination,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconDots, IconExternalLink, IconPlus, IconRefresh, IconRocket, IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { SectionPageShell } from '../../../components/layout/SectionPageShell';
import {
  useMicrosites,
  useCreateMicrosite,
  useDeleteMicrosite,
  usePublishMicrosite,
  useUnpublishMicrosite,
} from '../hooks/useMicrosites';
import type { Microsite } from '../../../api/microsites';

export const MicrositesListPage = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const params = useMemo(() => ({ page, search: search || undefined, per_page: 15 }), [page, search]);
  const { data, isLoading, refetch } = useMicrosites(params);
  const createMutation = useCreateMicrosite();
  const deleteMutation = useDeleteMicrosite();
  const publishMutation = usePublishMicrosite();
  const unpublishMutation = useUnpublishMicrosite();
  const [isCreating, handler] = useDisclosure(false);

  const items = data?.data ?? [];

  const handleCreateDraft = async () => {
    if (isCreating) return;
    handler.open();
    try {
      const result = await createMutation.mutateAsync({ name: 'Nový microshop', status: 'draft' });
      notifications.show({ message: 'Microshop byl vytvořen.', color: 'green' });
      window.location.href = `/microsites/${result.id}/edit`;
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Vytvoření microshopu selhalo.', color: 'red' });
    } finally {
      handler.close();
    }
  };

  const handleDelete = async (microsite: Microsite) => {
    if (!window.confirm(`Opravdu chceš odstranit microshop "${microsite.name}"?`)) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(microsite.id);
      notifications.show({ message: 'Microshop byl odstraněn.', color: 'green' });
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Odstranění microshopu selhalo.', color: 'red' });
    }
  };

  const handlePublishToggle = async (microsite: Microsite) => {
    try {
      if (microsite.status === 'published') {
        await unpublishMutation.mutateAsync(microsite.id);
        notifications.show({ message: 'Microshop byl odpublikován.', color: 'green' });
      } else {
        await publishMutation.mutateAsync(microsite.id);
        notifications.show({ message: 'Publikace byla naplánována.', color: 'green' });
      }
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Akce selhala, zkus to prosím znovu.', color: 'red' });
    }
  };

  return (
    <SectionPageShell
      section="microsites"
      title="Microshopy"
      description="Spravuj kurátorované mini e-shopy postavené na datech z HUBu a sdílej je s klienty."
      actions={
        <Group gap="xs">
          <ActionIcon variant="subtle" onClick={() => refetch()} aria-label="Obnovit">
            <IconRefresh size={16} />
          </ActionIcon>
          <Button leftSection={<IconPlus size={16} />} onClick={handleCreateDraft} loading={isCreating}>
            Nový microshop
          </Button>
        </Group>
      }
    >
      <Card withBorder>
        <Stack gap="md">
          <TextInput
            label="Hledat"
            placeholder="Název nebo slug"
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              setPage(1);
            }}
            rightSection={search ? <IconDots size={16} /> : undefined}
          />

          {isLoading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : (
            <Table highlightOnHover withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Název</Table.Th>
                  <Table.Th>Slug</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Veřejný odkaz</Table.Th>
                  <Table.Th>Produkty</Table.Th>
                  <Table.Th>Publikováno</Table.Th>
                  <Table.Th style={{ width: 180 }}></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((microsite) => (
                  <Table.Tr key={microsite.id}>
                    <Table.Td>
                      <Text fw={600}>{microsite.name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {microsite.slug}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={microsite.status === 'published' ? 'teal' : microsite.status === 'archived' ? 'gray' : 'blue'}>
                        {microsite.status === 'published' ? 'Publikováno' : microsite.status === 'archived' ? 'Archivováno' : 'Draft'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {microsite.public_url ? (
                        <Anchor href={microsite.public_url} target="_blank" rel="noopener" c="blue">
                          <Group gap={4}>
                            <IconExternalLink size={14} />
                            <Text size="sm">microshop/{microsite.slug}</Text>
                          </Group>
                        </Anchor>
                      ) : (
                        <Text size="sm" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>{microsite.products_count ?? microsite.products?.length ?? 0}</Table.Td>
                    <Table.Td>{microsite.published_at ? new Date(microsite.published_at).toLocaleString('cs-CZ') : '—'}</Table.Td>
                    <Table.Td>
                      <Group gap="xs" justify="flex-end">
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={<IconDots size={14} />}
                          component="a"
                          href={`/microsites/${microsite.id}/edit`}
                        >
                          Upravit
                        </Button>
                        <ActionIcon
                          variant="subtle"
                          color={microsite.status === 'published' ? 'yellow' : 'teal'}
                          onClick={() => handlePublishToggle(microsite)}
                          aria-label="Publikovat"
                          loading={publishMutation.isPending || unpublishMutation.isPending}
                        >
                          <IconRocket size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => handleDelete(microsite)}
                          aria-label="Smazat"
                          loading={deleteMutation.isPending}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {items.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={7}>
                      <Text c="dimmed" ta="center">
                        Zatím tu nejsou žádné microshopy.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          )}

          {data && data.last_page > 1 && (
            <Group justify="flex-end">
              <Pagination value={page} onChange={setPage} total={data.last_page} />
            </Group>
          )}
        </Stack>
      </Card>
    </SectionPageShell>
  );
};
