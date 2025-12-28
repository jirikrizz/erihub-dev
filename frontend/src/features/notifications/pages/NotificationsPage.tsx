import { Alert, Button, Stack, Tabs } from '@mantine/core';
import { IconInfoCircle, IconReload } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { NotificationPreferences } from '../components/NotificationPreferences';
import { NotificationLogTable } from '../components/NotificationLogTable';
import { useNotificationStore } from '../store';
import { PageShell } from '../../../components/layout/PageShell';

export const NotificationsPage = () => {
  const logs = useNotificationStore((state) => state.logs);
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
  const loadLogs = useNotificationStore((state) => state.loadLogs);
  const refreshLogs = useNotificationStore((state) => state.refreshLogs);
  const logsLoading = useNotificationStore((state) => state.logsLoading);
  const logsError = useNotificationStore((state) => state.logsError);
  const [tab, setTab] = useState<'preferences' | 'log'>('preferences');

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const hasUnread = logs.some((log) => log.status === 'new');

  return (
    <PageShell
      title="Notifikační centrum"
      description="Sleduj systémové události Commerce HUBu, uprav si preferované typy notifikací a kontroluj auditní logy."
      actions={
        <>
          <Button
            key="refresh"
            leftSection={<IconReload size={16} />}
            variant="light"
            onClick={() => void refreshLogs()}
            loading={logsLoading}
          >
            Obnovit log
          </Button>
          <Button
            key="mark"
            variant="subtle"
            onClick={() => void markAllAsRead()}
            disabled={!hasUnread}
          >
            Označit vše jako přečtené
          </Button>
        </>
      }
    >
      <Stack gap="lg">
        <Alert icon={<IconInfoCircle size={18} />} color="blue" variant="light">
          Notifikace se ukládají přímo do tvého profilu. UI kanál funguje hned, e-mailové a Slack doručování se
          automaticky zapne, jakmile budou dostupné na backendu.
        </Alert>

        {logsError ? (
          <Alert color="red" title="Nepodařilo se načíst log notifikací" variant="light" withCloseButton>
            {logsError}
            <Button mt="sm" size="xs" variant="light" onClick={() => void refreshLogs()}>
              Zkusit znovu
            </Button>
          </Alert>
        ) : null}

        <Tabs value={tab} onChange={(value) => value && setTab(value as 'preferences' | 'log')} keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="preferences">Typy notifikací</Tabs.Tab>
            <Tabs.Tab value="log">Log událostí</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="preferences" pt="md">
            <NotificationPreferences />
          </Tabs.Panel>

          <Tabs.Panel value="log" pt="md">
            <NotificationLogTable />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </PageShell>
  );
};