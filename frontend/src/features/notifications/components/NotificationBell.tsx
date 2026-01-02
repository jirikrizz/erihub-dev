import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Indicator,
  Paper,
  Popover,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconBellRinging, IconCircleCheck, IconCircleDashed } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { formatDateTime, formatRelativeTime, moduleLabel, severityColor } from '../utils';
import { useNotificationStore } from '../store';
import classes from './NotificationBell.module.css';

const MAX_PREVIEW = 4;

export const NotificationBell = () => {
  const navigate = useNavigate();
  const [opened, { toggle, close }] = useDisclosure(false);
  const logs = useNotificationStore((state) => state.logs);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const markAsRead = useNotificationStore((state) => state.markAsRead);
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
  const loadPreferences = useNotificationStore((state) => state.loadPreferences);
  const loadLogs = useNotificationStore((state) => state.loadLogs);
  const refreshLogs = useNotificationStore((state) => state.refreshLogs);
  const logsLoaded = useNotificationStore((state) => state.logsLoaded);
  const logsLoading = useNotificationStore((state) => state.logsLoading);
  const lastFetchedAt = useNotificationStore((state) => state.lastFetchedAt);
  const preferencesLoaded = useNotificationStore((state) => state.preferencesLoaded);
  const preferencesLoading = useNotificationStore((state) => state.preferencesLoading);
  const disabledEvents = useNotificationStore((state) => state.disabledEvents);
  const previewLogs = logs.filter((log) => !disabledEvents.has(log.eventId)).slice(0, MAX_PREVIEW);

  useEffect(() => {
    if (!preferencesLoaded && !preferencesLoading) {
      void loadPreferences();
    }
  }, [loadPreferences, preferencesLoaded, preferencesLoading]);

  useEffect(() => {
    if (!logsLoaded && !logsLoading) {
      void loadLogs();
    }
  }, [loadLogs, logsLoaded, logsLoading]);

  useEffect(() => {
    if (opened) {
      void refreshLogs();
    }
  }, [opened, refreshLogs]);

  const handleViewAll = () => {
    close();
    navigate('/notifications');
  };

  return (
    <Popover
      opened={opened}
      onClose={close}
      position="bottom-end"
      shadow="md"
      withArrow
      classNames={{ dropdown: classes.notificationDropdown }}
    >
      <Popover.Target>
        <Indicator
          label={unreadCount}
          size={18}
          color="red"
          disabled={unreadCount === 0}
        >
          <ActionIcon
            variant="filled"
            color="blue"
            onClick={toggle}
            size="lg"
            radius="xl"
            aria-label="Zobrazit notifikace"
            className={classes.notificationButton}
          >
            <IconBellRinging size={20} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown maw={360} p="xs">
        <Stack gap="xs">
          <Group justify="space-between" align="center" px="xs">
            <Text fw={600}>Notifikace</Text>
            {unreadCount > 0 ? (
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconCircleCheck size={14} />}
                onClick={() => void markAllAsRead(previewLogs.map((log) => log.id))}
              >
                Označit jako přečtené
              </Button>
            ) : null}
          </Group>
          {logsLoading && !previewLogs.length ? (
            <Box px="xs" py="md">
              <Text size="sm" c="dimmed" ta="center">
                Načítám notifikace...
              </Text>
            </Box>
          ) : previewLogs.length ? (
            <ScrollArea.Autosize mah={280} offsetScrollbars className={classes.notificationList}>
              <Stack gap="xs" px="xs" pb="xs">
                {previewLogs.map((log) => {
                  const isNew = log.status === 'new';
                  return (
                    <Paper
                      key={log.id}
                      p="xs"
                      radius="md"
                      withBorder
                      className={`${classes.notificationItem} ${
                        isNew ? classes.notificationItemNew : classes.notificationItemRead
                      }`}
                      onClick={() => {
                        if (isNew) {
                          void markAsRead(log.id);
                        }
                      }}
                      style={{ cursor: isNew ? 'pointer' : 'default' }}
                    >
                      <Group justify="space-between" align="flex-start" gap="xs">
                        <Stack gap={2} style={{ flex: 1 }}>
                          <Group gap={6} align="center">
                            <Badge color={severityColor[log.severity]} variant="light" size="sm">
                              {moduleLabel[log.module]}
                            </Badge>
                            <Text size="xs" c="dimmed">
                              {formatRelativeTime(log.createdAt)}
                            </Text>
                          </Group>
                          <Text fw={600} size="sm">
                            {log.title}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {log.message}
                          </Text>
                        </Stack>
                        {isNew ? (
                          <IconCircleDashed size={16} color="var(--mantine-color-brand-6)" />
                        ) : null}
                      </Group>
                    </Paper>
                  );
                })}
              </Stack>
            </ScrollArea.Autosize>
          ) : (
            <Box px="xs" py="md">
              <Text size="sm" c="dimmed" ta="center">
                Zatím nemáš žádné notifikace.
              </Text>
            </Box>
          )}
          <Box px="xs" pt="xs" pb="sm">
            <Group justify="space-between" align="center">
              <Text size="xs" c="dimmed">
                Poslední kontrola:{' '}
                {logsLoading && !lastFetchedAt
                  ? 'načítám…'
                  : lastFetchedAt
                  ? formatDateTime(lastFetchedAt)
                  : '—'}
              </Text>
              <Button size="xs" variant="light" onClick={handleViewAll}>
                Zobrazit vše
              </Button>
            </Group>
          </Box>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};
