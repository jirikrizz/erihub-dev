import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  MultiSelect,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconDots, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { Controller, useForm } from 'react-hook-form';
import { notifications } from '@mantine/notifications';
import {
  useCreateUser,
  useDeleteUser,
  useRoleOptions,
  useSectionOptions,
  useUpdateUser,
  useUsers,
} from '../hooks/useUsers';
import type { SectionKey } from '../../../app/sections';
import { getSectionLabel } from '../../../app/sections';
import type { AdminUser } from '../../../api/admin';
import { SectionPageShell } from '../../../components/layout/SectionPageShell';
import { SurfaceCard } from '../../../components/layout/SurfaceCard';

type CreateFormValues = {
  name: string;
  email: string;
  password: string;
  roles: string[];
  sections: SectionKey[];
};

type EditFormValues = {
  id: number;
  name: string;
  email: string;
  password: string;
  roles: string[];
  sections: SectionKey[];
};

export const UsersPage = () => {
  const { data } = useUsers();
  const { data: sectionOptions } = useSectionOptions();
  const { data: roleOptions } = useRoleOptions();
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const createForm = useForm<CreateFormValues>({
    defaultValues: {
      name: '',
      email: '',
      password: '',
      roles: [],
      sections: [],
    },
  });

  const editForm = useForm<EditFormValues>({
    defaultValues: {
      id: 0,
      name: '',
      email: '',
      password: '',
      roles: [],
      sections: [],
    },
  });

  const sectionSelectData = (sectionOptions ?? []).map((option) => ({
    label: option.label,
    value: option.key,
  }));

  const roleSelectData = (roleOptions ?? []).map((role) => ({
    label: role.name,
    value: role.name,
  }));

  const handleCreateSubmit = async (values: CreateFormValues) => {
    try {
      await createUser.mutateAsync({
        name: values.name,
        email: values.email,
        password: values.password,
        roles: values.roles,
        sections: values.sections,
      });

      notifications.show({ message: 'Uživatel byl vytvořen', color: 'green' });
      createForm.reset();
      closeCreate();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Uživatele se nepodařilo vytvořit. Zkus to prosím znovu.';
      notifications.show({ message, color: 'red' });
    }
  };

  const handleOpenEdit = (user: AdminUser) => {
    setSelectedUser(user);
    editForm.reset({
      id: user.id,
      name: user.name,
      email: user.email,
      password: '',
      roles: user.roles.map((role) => role.name),
      sections: user.sections,
    });
    openEdit();
  };

  const handleEditSubmit = async (values: EditFormValues) => {
    const payload = {
      name: values.name,
      email: values.email,
      roles: values.roles,
      sections: values.sections,
      ...(values.password ? { password: values.password } : {}),
    };

    try {
      await updateUser.mutateAsync({ userId: values.id, payload });
      notifications.show({ message: 'Změny byly uloženy', color: 'green' });
      closeEdit();
      setSelectedUser(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Uložení změn se nepodařilo. Zkus to prosím znovu.';
      notifications.show({ message, color: 'red' });
    }
  };

  const handleCloseEdit = () => {
    closeEdit();
    setSelectedUser(null);
  };

  const handleDelete = async (user: AdminUser) => {
    const confirmed = window.confirm(`Opravdu chceš odstranit uživatele ${user.name}?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteUser.mutateAsync(user.id);
      notifications.show({ message: 'Uživatel byl odstraněn', color: 'green' });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Smazání se nepodařilo. Zkontroluj oprávnění a zkus to znovu.';
      notifications.show({ message, color: 'red' });
    }
  };

  return (
    <SectionPageShell
      section="users"
      actions={
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Nový uživatel
        </Button>
      }
    >
      <Stack gap="lg">
        <SurfaceCard>
          <Table highlightOnHover striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Jméno a e-mail</Table.Th>
              <Table.Th>Oprávnění</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th w={120}>Akce</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data?.data.length ? (
              data.data.map((user) => (
                <Table.Tr key={user.id}>
                  <Table.Td>
                    <Stack gap={2}>
                      <Text fw={600}>{user.name}</Text>
                      <Text size="sm" c="gray.6">
                        {user.email}
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    {user.sections.length ? (
                      <Group gap="xs" wrap="wrap">
                        {user.sections.map((section) => (
                          <Badge key={section} variant="light" color="brand">
                            {getSectionLabel(section)}
                          </Badge>
                        ))}
                      </Group>
                    ) : (
                      <Text size="sm" c="gray.5">
                        Bez přístupu
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {user.roles.length ? (
                      <Group gap="xs" wrap="wrap">
                        {user.roles.map((role) => (
                          <Badge key={role.id} color="gray" variant="light">
                            {role.name}
                          </Badge>
                        ))}
                      </Group>
                    ) : (
                      <Text size="sm" c="gray.5">
                        Role nepřiřazeny
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group justify="flex-end">
                      <Menu withinPortal position="bottom-end" shadow="md">
                        <Menu.Target>
                          <ActionIcon variant="subtle" aria-label="Akce">
                            <IconDots size={18} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => handleOpenEdit(user)}>
                            Upravit
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconTrash size={16} />}
                            color="red"
                            onClick={() => handleDelete(user)}
                          >
                            Smazat
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))
            ) : (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Text size="sm" c="gray.6">
                    Zatím nejsou vytvořeni žádní uživatelé.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
        </SurfaceCard>

      <Modal opened={createOpened} onClose={closeCreate} title="Nový uživatel" size="md">
        <form onSubmit={createForm.handleSubmit(handleCreateSubmit)}>
          <Stack>
            <Controller
              name="name"
              control={createForm.control}
              rules={{ required: 'Zadej jméno' }}
              render={({ field, fieldState }) => (
                <TextInput label="Jméno" error={fieldState.error?.message} {...field} />
              )}
            />
            <Controller
              name="email"
              control={createForm.control}
              rules={{ required: 'Zadej e-mail' }}
              render={({ field, fieldState }) => (
                <TextInput label="E-mail" error={fieldState.error?.message} {...field} />
              )}
            />
            <Controller
              name="password"
              control={createForm.control}
              rules={{ required: 'Zadej heslo' }}
              render={({ field, fieldState }) => (
                <TextInput label="Heslo" type="password" error={fieldState.error?.message} {...field} />
              )}
            />
            <Controller
              name="sections"
              control={createForm.control}
              render={({ field }) => (
                <MultiSelect
                  label="Sekce"
                  placeholder="Vyber sekce"
                  data={sectionSelectData}
                  {...field}
                />
              )}
            />
            <Controller
              name="roles"
              control={createForm.control}
              render={({ field }) => (
                <MultiSelect
                  label="Role"
                  placeholder="Volitelné role"
                  data={roleSelectData}
                  {...field}
                />
              )}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={closeCreate}>
                Zrušit
              </Button>
              <Button type="submit" loading={createUser.isPending}>
                Uložit
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={editOpened} onClose={handleCloseEdit} title={`Upravit uživatele ${selectedUser?.name ?? ''}`} size="md">
        <form onSubmit={editForm.handleSubmit(handleEditSubmit)}>
          <Stack>
            <Controller
              name="name"
              control={editForm.control}
              rules={{ required: 'Zadej jméno' }}
              render={({ field, fieldState }) => (
                <TextInput label="Jméno" error={fieldState.error?.message} {...field} />
              )}
            />
            <Controller
              name="email"
              control={editForm.control}
              rules={{ required: 'Zadej e-mail' }}
              render={({ field, fieldState }) => (
                <TextInput label="E-mail" error={fieldState.error?.message} {...field} />
              )}
            />
            <Controller
              name="password"
              control={editForm.control}
              render={({ field, fieldState }) => (
                <TextInput
                  label="Heslo"
                  type="password"
                  placeholder="Nech prázdné, pokud nechceš heslo měnit"
                  error={fieldState.error?.message}
                  {...field}
                />
              )}
            />
            <Controller
              name="sections"
              control={editForm.control}
              render={({ field }) => (
                <MultiSelect
                  label="Sekce"
                  placeholder="Vyber sekce"
                  data={sectionSelectData}
                  {...field}
                />
              )}
            />
            <Controller
              name="roles"
              control={editForm.control}
              render={({ field }) => (
                <MultiSelect
                  label="Role"
                  placeholder="Volitelné role"
                  data={roleSelectData}
                  {...field}
                />
              )}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={handleCloseEdit}>
                Zavřít
              </Button>
              <Button type="submit" loading={updateUser.isPending}>
                Uložit změny
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  </SectionPageShell>
  );
};