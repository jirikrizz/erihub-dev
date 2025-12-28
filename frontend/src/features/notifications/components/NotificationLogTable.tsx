import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconCheck, IconDownload, IconReload, IconSearch, IconX } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { formatDateTime, formatRelativeTime, moduleLabel, severityColor, severityLabel } from '../utils';
import { useNotificationStore } from '../store';
import type { NotificationModule, NotificationSeverity } from '../types';
import { TableToolbar } from '../../../components/table/TableToolbar';

const severityOptions: { value: 'all' | NotificationSeverity; label: string }[] = [
  { value: 'all', label: 'Všechny' },
  { value: 'info', label: severityLabel.info },
  { value: 'success', label: severityLabel.success },
  { value: 'warning', label: severityLabel.warning },
  { value: 'error', label: severityLabel.error },
];

const moduleOptions: { value: 'all' | NotificationModule; label: string }[] = [
  { value: 'all', label: 'Všechny' },
  { value: 'inventory', label: moduleLabel.inventory },
  { value: 'orders', label: moduleLabel.orders },
  { value: 'customers', label: moduleLabel.customers },
  { value: 'pim', label: moduleLabel.pim },
  { value: 'shoptet', label: moduleLabel.shoptet },
  { value: 'analytics', label: moduleLabel.analytics },
  { value: 'system', label: moduleLabel.system },
];

const statusOptions = [
  { value: 'all', label: 'Vše' },
  { value: 'new', label: 'Nepřečtené' },
  { value: 'read', label: 'Přečtené' },
];

type LogColumn = 'time' | 'event' | 'severity' | 'module' | 'status' | 'actions';

const LOG_COLUMN_LABELS: Record<LogColumn, string> = {
  time: 'Čas',
  event: 'Událost',
  severity: 'Závažnost',
  module: 'Modul',
  status: 'Stav',
  actions: 'Akce',
};

export const NotificationLogTable = () => {
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | NotificationSeverity>('all');
  const [moduleFilter, setModuleFilter] = useState<'all' | NotificationModule>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'read'>('all');
  const [columnVisibility, setColumnVisibility] = useState<Record<LogColumn, boolean>>({
    time: true,
    event: true,
    severity: true,
    module: true,
    status: true,
    actions: true,
  });

  const logs = useNotificationStore((state) => state.logs);
  const markAsRead = useNotificationStore((state) => state.markAsRead);
  const refreshLogs = useNotificationStore((state) => state.refreshLogs);
  const logsLoading = useNotificationStore((state) => state.logsLoading);

  const filteredLogs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return logs.filter((log) => {
      const matchesSeverity = severityFilter === 'all' || log.severity === severityFilter;
      const matchesModule = moduleFilter === 'all' || log.module === moduleFilter;
      const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
      const matchesSearch =
        !normalizedSearch ||
        log.title.toLowerCase().includes(normalizedSearch) ||
        log.message.toLowerCase().includes(normalizedSearch);

      return matchesSeverity && matchesModule && matchesStatus && matchesSearch;
    });
  }, [logs, moduleFilter, search, severityFilter, statusFilter]);

  const visibleColumns = useMemo(
    () => (Object.keys(LOG_COLUMN_LABELS) as LogColumn[]).filter((key) => columnVisibility[key]),
    [columnVisibility]
  );

  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
          <TextInput
            label="Hledat v logu"
            placeholder="Název nebo popis notifikace"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
            w={{ base: '100%', md: 260 }}
          />
          <Group gap="sm" wrap="wrap">
            <Select
              label="Závažnost"
              data={severityOptions}
              value={severityFilter}
              onChange={(value) => setSeverityFilter((value as typeof severityFilter) ?? 'all')}
              w={160}
            />
            <Select
              label="Modul"
              data={moduleOptions}
              value={moduleFilter}
              onChange={(value) => setModuleFilter((value as typeof moduleFilter) ?? 'all')}
              w={160}
            />
            <Select
              label="Stav"
              data={statusOptions}
              value={statusFilter}
              onChange={(value) => setStatusFilter((value as typeof statusFilter) ?? 'all')}
              w={160}
            />
          </Group>
          <Group gap="xs">
            <Button
              variant="light"
              leftSection={<IconReload size={16} />}
              onClick={() => void refreshLogs()}
              loading={logsLoading}
            >
              Obnovit
            </Button>
            <Tooltip label="Export do CSV (připravujeme)">
              <Button variant="default" leftSection={<IconDownload size={16} />} disabled>
                Export
              </Button>
            </Tooltip>
          </Group>
        </Group>

        <TableToolbar
          columns={(Object.keys(LOG_COLUMN_LABELS) as LogColumn[]).map((key) => ({
            key,
            label: LOG_COLUMN_LABELS[key],
          }))}
          columnVisibility={columnVisibility}
          onToggleColumn={(key, checked) =>
            setColumnVisibility((current) => ({ ...current, [key as LogColumn]: checked }))
          }
          // Export zůstává disabled, proto nepředáváme onExport
        />

        <ScrollArea.Autosize mah={480} offsetScrollbars>
          <Table highlightOnHover stickyHeader withTableBorder>
            <Table.Thead>
              <Table.Tr>
                {columnVisibility.time && <Table.Th style={{ width: 140 }}>Čas</Table.Th>}
                {columnVisibility.event && <Table.Th>Událost</Table.Th>}
                {columnVisibility.severity && <Table.Th style={{ width: 110 }}>Závažnost</Table.Th>}
                {columnVisibility.module && <Table.Th style={{ width: 110 }}>Modul</Table.Th>}
                {columnVisibility.status && <Table.Th style={{ width: 110 }}>Stav</Table.Th>}
                {columnVisibility.actions && (
                  <Table.Th style={{ width: 60 }}>
                    <Text size="xs" c="dimmed" ta="right">
                      Akce
                    </Text>
                  </Table.Th>
                )}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {logsLoading && !logs.length ? (
                <Table.Tr>
                  <Table.Td colSpan={visibleColumns.length || 1}>
                    <Box py="lg">
                      <Text size="sm" c="dimmed" ta="center">
                        Načítám notifikace...
                      </Text>
                    </Box>
                  </Table.Td>
                </Table.Tr>
              ) : filteredLogs.length ? (
                filteredLogs.map((log) => (
                  <Table.Tr key={log.id}>
                    {columnVisibility.time && (
                      <Table.Td>
                        <Stack gap={2}>
                          <Text size="sm" fw={500}>
                            {formatDateTime(log.createdAt)}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {formatRelativeTime(log.createdAt)}
                          </Text>
                        </Stack>
                      </Table.Td>
                    )}
                    {columnVisibility.event && (
                      <Table.Td>
                        <Stack gap={4}>
                          <Text fw={600}>{log.title}</Text>
                          <Text size="sm" c="dimmed">
                            {log.message}
                          </Text>
                        </Stack>
                      </Table.Td>
                    )}
                    {columnVisibility.severity && (
                      <Table.Td>
                        <Badge color={severityColor[log.severity]} variant="light">
                          {severityLabel[log.severity]}
                        </Badge>
                      </Table.Td>
                    )}
                    {columnVisibility.module && (
                      <Table.Td>
                        <Badge color="gray" variant="outline">
                          {moduleLabel[log.module]}
                        </Badge>
                      </Table.Td>
                    )}
                    {columnVisibility.status && (
                      <Table.Td>
                        <Badge color={log.status === 'new' ? 'red' : 'gray'} variant="light">
                          {log.status === 'new' ? 'Nepřečtené' : 'Přečtené'}
                        </Badge>
                      </Table.Td>
                    )}
                    {columnVisibility.actions && (
                      <Table.Td>
                        <Group gap={4} justify="flex-end">
                          {log.status === 'new' ? (
                            <Tooltip label="Označit jako přečtené" withArrow>
                              <ActionIcon
                                size="sm"
                                color="teal"
                                variant="light"
                                onClick={() => void markAsRead(log.id)}
                              >
                                <IconCheck size={16} />
                              </ActionIcon>
                            </Tooltip>
                          ) : (
                            <Tooltip label="Odstranit z náhledu (označí jako přečtené)" withArrow>
                              <ActionIcon
                                size="sm"
                                color="gray"
                                variant="subtle"
                                onClick={() => void markAsRead(log.id)}
                              >
                                <IconX size={16} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))
              ) : (
                <Table.Tr>
                  <Table.Td colSpan={visibleColumns.length || 1}>
                    <Box py="lg">
                      <Text size="sm" c="dimmed" ta="center">
                        Žádné záznamy nesplňují vybraný filtr.
                      </Text>
                    </Box>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
      </Stack>
    </Paper>
  );
};
