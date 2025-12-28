import { Button, Card, Group, Stack, TagsInput, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useOrderStatusMapping, useUpdateOrderStatusMapping } from '../hooks/useOrderStatusMapping';

const FIELD_CONFIG = [
  {
    key: 'completed' as const,
    title: 'Dokončené objednávky',
    description: 'Tyto stavy započítáme do metrik jako dokončené nákupy a vstupují do AOV.',
    placeholder: 'např. Vyřízeno, Dokončeno',
  },
  {
    key: 'returned' as const,
    title: 'Vratky',
    description: 'Stavy, které označují vrácené objednávky. Budou vždy vyloučeny z dokončených objednávek.',
    placeholder: 'např. Vráceno',
  },
  {
    key: 'complaint' as const,
    title: 'Reklamace',
    description: 'Stavy pro reklamace, které se nemají započítávat do výkonu.',
    placeholder: 'např. Reklamace',
  },
  {
    key: 'cancelled' as const,
    title: 'Storno',
    description: 'Stavy stornovaných objednávek. Nebudou započteny do obratu ani AOV.',
    placeholder: 'např. Storno, Zrušeno',
  },
];

type FormValues = {
  completed: string[];
  returned: string[];
  complaint: string[];
  cancelled: string[];
};

const DEFAULT_VALUES: FormValues = {
  completed: [],
  returned: [],
  complaint: [],
  cancelled: [],
};

export const OrderStatusSettingsPage = () => {
  const { data, isLoading } = useOrderStatusMapping();
  const updateMutation = useUpdateOrderStatusMapping();

  const form = useForm<FormValues>({
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (!data) {
      return;
    }

    form.reset({
      completed: data.completed ?? [],
      returned: data.returned ?? [],
      complaint: data.complaint ?? [],
      cancelled: data.cancelled ?? [],
    });
  }, [data, form]);

  const suggestions = useMemo(() => data?.available_statuses ?? [], [data]);
  const values = form.watch();

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await updateMutation.mutateAsync(values);
      notifications.show({ message: 'Mapování stavů objednávek uloženo.', color: 'green' });
    } catch {
      notifications.show({ message: 'Uložení mapování selhalo.', color: 'red' });
    }
  });

  return (
    <Stack gap="lg" component="form" onSubmit={onSubmit}>
      <Title order={3}>Stavy objednávek</Title>
      <Card withBorder>
        <Stack gap="md">
          <div>
            <Title order={4}>Mapování stavů</Title>
            <Text c="gray.6" size="sm">
              Nastav, jaké stavy považujeme za dokončené, vratky, reklamace nebo storna. HUB podle toho filtruje
              objednávky v analytice, na kartě zákazníka i u produktů.
            </Text>
          </div>
          {FIELD_CONFIG.map(({ key, title, description, placeholder }) => (
            <TagsInput
              key={key}
              label={title}
              description={description}
              placeholder={placeholder}
              value={values[key] ?? []}
              onChange={(value) => form.setValue(key, value, { shouldDirty: true })}
              data={suggestions}
              splitChars={[',']}
              disabled={isLoading}
              clearable
            />
          ))}
          <Text c="gray.6" size="sm">
            Stavy, které nejsou vyjmenované, zůstanou neutrální. Pokud nejsou vyplněné žádné dokončené stavy,
            HUB použije všechno kromě vratek, reklamací a storen.
          </Text>
        </Stack>
      </Card>
      <Group justify="flex-end">
        <Button type="submit" loading={updateMutation.isPending} disabled={isLoading}>
          Uložit mapování
        </Button>
      </Group>
    </Stack>
  );
};