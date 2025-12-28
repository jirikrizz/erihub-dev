import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { IconFilter, IconSearch } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useEffect, useMemo, useState } from 'react';
import { notificationEvents } from '../eventCatalog';
import { moduleLabel, severityColor, severityLabel } from '../utils';
import { useNotificationStore } from '../store';
import type { NotificationChannel, NotificationEventId, NotificationModule } from '../types';

const moduleOptions: { label: string; value: 'all' | NotificationModule }[] = [
  { label: 'Vše', value: 'all' },
  { label: 'Inventář', value: 'inventory' },
  { label: 'Objednávky', value: 'orders' },
  { label: 'Zákazníci', value: 'customers' },
  { label: 'PIM', value: 'pim' },
  { label: 'Shoptet', value: 'shoptet' },
  { label: 'Analytika', value: 'analytics' },
  { label: 'Systém', value: 'system' },
];

export const NotificationPreferences = () => {
  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState<'all' | NotificationModule>('all');
  const setChannelEnabled = useNotificationStore((state) => state.setChannelEnabled);
  const isChannelEnabled = useNotificationStore((state) => state.isChannelEnabled);
  const loadPreferences = useNotificationStore((state) => state.loadPreferences);
  const preferencesLoaded = useNotificationStore((state) => state.preferencesLoaded);
  const preferencesLoading = useNotificationStore((state) => state.preferencesLoading);
  const preferencesError = useNotificationStore((state) => state.preferencesError);
  const [pendingChannels, setPendingChannels] = useState<Set<string>>(new Set());

  const channelOrder: NotificationChannel[] = ['ui', 'email', 'slack'];

  const channelLabel: Record<NotificationChannel, string> = {
    ui: 'Posílat v UI',
    email: 'Posílat e-mailem',
    slack: 'Posílat na Slack',
  };

  const getPendingKey = (eventId: NotificationEventId, channel: NotificationChannel) =>
    `${eventId}:${channel}`;

  useEffect(() => {
    if (!preferencesLoaded && !preferencesLoading) {
      void loadPreferences().catch(() => {
        notifications.show({
          color: 'red',
          title: 'Načtení preferencí selhalo',
          message: 'Zkontroluj připojení a zkus to prosím znovu.',
        });
      });
    }
  }, [loadPreferences, preferencesLoaded, preferencesLoading]);

  const handleToggle = (eventId: NotificationEventId, channel: NotificationChannel, enabled: boolean) => {
    const pendingKey = getPendingKey(eventId, channel);

    setPendingChannels((prev) => {
      const next = new Set(prev);
      next.add(pendingKey);
      return next;
    });

    setChannelEnabled(eventId, channel, enabled)
      .catch(() => {
        // Chybu už ošetřuje store pomocí notifikace.
      })
      .finally(() => {
        setPendingChannels((prev) => {
          const next = new Set(prev);
          next.delete(pendingKey);
          return next;
        });
      });
  };

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return notificationEvents.filter((event) => {
      const matchesModule = moduleFilter === 'all' || event.module === moduleFilter;
      const matchesQuery =
        !normalizedQuery ||
        event.label.toLowerCase().includes(normalizedQuery) ||
        event.description.toLowerCase().includes(normalizedQuery) ||
        event.tags?.some((tag) => tag.toLowerCase().includes(normalizedQuery));

      return matchesModule && matchesQuery;
    });
  }, [moduleFilter, query]);

  if (!preferencesLoaded && preferencesLoading) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  return (
    <Stack gap="md">
      {preferencesError ? (
        <Alert color="red" title="Nepodařilo se načíst nastavení" withCloseButton>
          {preferencesError}
          <Button
            mt="sm"
            size="xs"
            variant="light"
            onClick={() => {
              void loadPreferences().catch(() => {
                notifications.show({
                  color: 'red',
                  title: 'Načtení preferencí selhalo',
                  message: 'Zkus akci prosím později.',
                });
              });
            }}
          >
            Zkusit znovu
          </Button>
        </Alert>
      ) : null}
      <Group align="flex-end" justify="space-between">
        <TextInput
          label="Vyhledávání"
          placeholder="Hledat podle názvu, popisu nebo tagů"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          leftSection={<IconSearch size={16} />}
          w={{ base: '100%', md: 320 }}
        />
        <Box w={{ base: '100%', md: 'auto' }}>
          <Text component="div" size="xs" c="dimmed" fw={600} mb={4}>
            <Group gap={4} align="center" wrap="nowrap">
              <IconFilter size={14} />
              <span>Modul</span>
            </Group>
          </Text>
          <SegmentedControl
            value={moduleFilter}
            onChange={(value) => setModuleFilter(value as typeof moduleFilter)}
            data={moduleOptions}
            size="xs"
          />
        </Box>
      </Group>

      <Stack gap="sm">
        {filteredEvents.map((event) => (
          <Paper key={event.id} withBorder p="md" radius="md">
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={4} style={{ flex: 1 }}>
                    <Group gap={6} align="center">
                      <Badge color={severityColor[event.severity]} variant="light" size="sm">
                        {severityLabel[event.severity]}
                      </Badge>
                      <Badge color="gray" variant="light" size="sm">
                        {moduleLabel[event.module]}
                      </Badge>
                    </Group>
                    <Text fw={600}>{event.label}</Text>
                    <Text size="sm" c="dimmed">
                      {event.description}
                    </Text>
                    {event.tags?.length ? (
                      <Group gap={6}>
                        {event.tags.map((tag) => (
                          <Badge key={tag} color="gray" variant="outline" size="xs">
                            #{tag}
                          </Badge>
                        ))}
                      </Group>
                    ) : null}
                    <Group gap={6} align="center">
                      <Text size="sm" fw={500}>
                        Doporučené kanály:
                      </Text>
                      <Group gap={4}>
                        {event.recommendedChannels.map((channel) => (
                          <Badge key={channel} color="brand" variant="light" size="sm">
                            {channel.toUpperCase()}
                          </Badge>
                        ))}
                      </Group>
                    </Group>
                  </Stack>
                  <Stack gap={8} align="stretch" justify="space-between" style={{ minWidth: 240 }}>
                    <Stack gap={6}>
                      {channelOrder.map((channel) => {
                        const enabled = isChannelEnabled(event.id, channel);
                        const pendingKey = getPendingKey(event.id, channel);
                        const pending = pendingChannels.has(pendingKey);
                        const disabled = pending || !preferencesLoaded;

                        return (
                          <Switch
                            key={channel}
                            size="sm"
                            checked={enabled}
                            onChange={(changeEvent) =>
                              handleToggle(event.id, channel, changeEvent.currentTarget.checked)
                            }
                            label={channelLabel[channel]}
                            disabled={disabled}
                          />
                        );
                      })}
                    </Stack>
                  </Stack>
                </Group>
                <Divider />
                <Text size="xs" c="dimmed">
                  Ukázkový log: {event.sampleLog}
                </Text>
              </Stack>
          </Paper>
        ))}
        {!filteredEvents.length ? (
          <Paper withBorder p="lg" radius="md">
            <Text size="sm" c="dimmed" ta="center">
              Nenašli jsme žádnou událost, která by odpovídala filtru.
            </Text>
          </Paper>
        ) : null}
      </Stack>
    </Stack>
  );
};