import { Button, Card, Group, Loader, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { useOpenAiSettings, useUpdateOpenAiSettings } from '../hooks/useOpenAiSettings';

export const TranslationSettingsPage = () => {
  const { data, isLoading } = useOpenAiSettings();
  const updateMutation = useUpdateOpenAiSettings();
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    setApiKey('');
  }, [data?.has_key]);

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ key: apiKey.trim() || null });
      notifications.show({ message: 'Nastavení OpenAI klíče uloženo.', color: 'green' });
      setApiKey('');
    } catch {
      notifications.show({ message: 'Uložení klíče se nezdařilo.', color: 'red' });
    }
  };

  const handleRemove = async () => {
    try {
      await updateMutation.mutateAsync({ key: null });
      notifications.show({ message: 'OpenAI klíč byl odstraněn.', color: 'green' });
    } catch {
      notifications.show({ message: 'Odstranění klíče se nezdařilo.', color: 'red' });
    }
  };

  return (
    <Stack gap="lg">
      <Title order={3}>Překládání</Title>
      <Card withBorder>
        <Stack gap="md">
          <div>
            <Title order={4}>OpenAI API klíč</Title>
            <Text c="gray.6" size="sm">
              Klíč se používá pro volání AI překladů. Ukládáme ho šifrovaně a zobrazujeme jen poslední čtyři znaky.
            </Text>
          </div>
          {isLoading ? (
            <Loader size="sm" />
          ) : (
            <Stack gap="sm">
              {data?.has_key ? (
                <Text size="sm">
                  Aktuálně je uložen klíč končící na{' '}
                  <Text span fw={600}>
                    {data?.last_four ?? '****'}
                  </Text>
                </Text>
              ) : (
                <Text size="sm" c="gray.6">
                  Zatím není uložen žádný klíč.
                </Text>
              )}
              <TextInput
                label="Nový API klíč"
                placeholder="sk-..."
                value={apiKey}
                onChange={(event) => setApiKey(event.currentTarget.value)}
                type="password"
                autoComplete="off"
              />
              <Group gap="sm">
                <Button onClick={handleSave} loading={updateMutation.isPending} disabled={apiKey.trim() === ''}>
                  Uložit klíč
                </Button>
                {data?.has_key ? (
                  <Button
                    variant="default"
                    color="red"
                    onClick={handleRemove}
                    loading={updateMutation.isPending}
                  >
                    Odebrat klíč
                  </Button>
                ) : null}
              </Group>
            </Stack>
          )}
        </Stack>
      </Card>
    </Stack>
  );
};