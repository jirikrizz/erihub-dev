import { Anchor, Card, Group, Loader, Stack, Table, Text, Title } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listRoles, listSections } from '../../../api/admin';

export const RolesSettingsPage = () => {
  const rolesQuery = useQuery({ queryKey: ['admin', 'roles'], queryFn: listRoles });
  const sectionsQuery = useQuery({ queryKey: ['admin', 'sections'], queryFn: listSections });

  const isLoading = rolesQuery.isLoading || sectionsQuery.isLoading;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={3}>Role & práva</Title>
          <Text c="gray.6" size="sm">
            Role přiřazuješ uživatelům v sekci Uživatelé. Tady najdeš přehled dostupných rolí a sekcí,
            které můžeš připnout jednotlivým účtům.
          </Text>
        </div>
        <Anchor component={Link} to="/users" c="blue" size="sm">
          Správa uživatelů
          <IconExternalLink size={14} style={{ marginLeft: 6, verticalAlign: 'text-bottom' }} />
        </Anchor>
      </Group>

      <Card withBorder>
        <Stack gap="sm">
          <Title order={4}>Dostupné role</Title>
          {isLoading ? (
            <Loader size="sm" />
          ) : (
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Název role</Table.Th>
                  <Table.Th>ID</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rolesQuery.data?.length ? (
                  rolesQuery.data.map((role) => (
                    <Table.Tr key={role.id}>
                      <Table.Td>{role.name}</Table.Td>
                      <Table.Td>{role.id}</Table.Td>
                    </Table.Tr>
                  ))
                ) : (
                  <Table.Tr>
                    <Table.Td colSpan={2}>
                      <Text size="sm" c="gray.6">
                        Zatím nejsou definovány žádné role.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          )}
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="sm">
          <Title order={4}>Sekce administrace</Title>
          {isLoading ? (
            <Loader size="sm" />
          ) : (
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Sekce</Table.Th>
                  <Table.Th>Popis</Table.Th>
                  <Table.Th>Permission</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sectionsQuery.data?.length ? (
                  sectionsQuery.data.map((section) => (
                    <Table.Tr key={section.key}>
                      <Table.Td>{section.label}</Table.Td>
                      <Table.Td>{section.description}</Table.Td>
                      <Table.Td>
                        <Text size="sm" c="gray.7">
                          {section.permission}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))
                ) : (
                  <Table.Tr>
                    <Table.Td colSpan={3}>
                      <Text size="sm" c="gray.6">
                        Nepodařilo se načíst seznam sekcí.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          )}
        </Stack>
      </Card>
    </Stack>
  );
};