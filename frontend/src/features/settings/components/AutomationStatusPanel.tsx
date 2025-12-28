import {
  Badge,
  Card,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { formatDistanceToNow } from 'date-fns';
import { cs } from 'date-fns/locale';
import { useAutomationStatus } from '../hooks/useAutomationStatus';

const formatRelativeTime = (value?: string | null) => {
  if (!value) {
    return '—';
  }

  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true, locale: cs });
  } catch {
    return value;
  }
};

const QueueCard = ({
  name,
  pending,
  failed,
  lastFailedAt,
}: {
  name: string;
  pending: number;
  failed: number;
  lastFailedAt: string | null;
}) => (
  <Card
    padding="lg"
    radius="xl"
    withBorder={false}
    style={{
      background: 'rgba(255, 255, 255, 0.9)',
      boxShadow: '0 20px 45px rgba(15, 23, 42, 0.08)',
      border: '1px solid rgba(255,255,255,0.6)',
      minHeight: 140,
    }}
  >
    <Stack gap={6}>
      <Group justify="space-between" align="center">
        <Text fw={600}>{name}</Text>
        {failed > 0 ? (
          <Badge color="red" variant="light">
            {failed} fail
          </Badge>
        ) : (
          <Badge color="teal" variant="light">
            OK
          </Badge>
        )}
      </Group>
      <Text size="sm" c="gray.7">
        <Text component="span" fw={700} size="lg" c="dark">
          {pending}
        </Text>{' '}
        ve frontě
      </Text>
      <Text size="xs" c="gray.6">
        Poslední chyba:{' '}
        <Text component="span" fw={500} c={lastFailedAt ? 'orange.7' : 'gray.6'}>
          {lastFailedAt ? formatRelativeTime(lastFailedAt) : 'nezaznamenána'}
        </Text>
      </Text>
    </Stack>
  </Card>
);

export const AutomationStatusPanel = () => {
  const { data, isLoading, isFetching } = useAutomationStatus();

  if (!data && isLoading) {
    return (
      <Group align="center" gap="xs">
        <Loader size="sm" />
        <Text size="sm" c="gray.6">
          Načítám stav automatizací…
        </Text>
      </Group>
    );
  }

  if (!data) {
    return (
      <Text size="sm" c="red">
        Stav automatizací se nepodařilo načíst.
      </Text>
    );
  }

  return (
    <Card
      radius="xl"
      p="xl"
      style={{
        background: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 35%, #ecfeff 100%)',
        border: '1px solid rgba(255,255,255,0.6)',
        boxShadow: '0 35px 80px rgba(99, 102, 241, 0.25)',
      }}
    >
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <div>
            <Title order={3} c="indigo.9">
              Stav front a pipeline
            </Title>
            <Text size="xs" c="gray.6">
              Aktualizováno {formatRelativeTime(data.generated_at)}
            </Text>
          </div>
          {isFetching && <Loader size="sm" />}
        </Group>

        <Group gap="md" grow>
          {data.queues.map((queue) => (
            <QueueCard
              key={queue.name}
              name={queue.name}
              pending={queue.pending}
              failed={queue.failed}
              lastFailedAt={queue.last_failed_at}
            />
          ))}
        </Group>

      <Stack gap="sm">
        <Title order={5} c="indigo.8">
          Poslední snapshot pipeline
        </Title>
        {data.pipelines.length === 0 ? (
          <Text size="sm" c="dimmed">
            Zatím žádné záznamy.
          </Text>
        ) : (
          <Table highlightOnHover withRowBorders={false} verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Endpoint</Table.Th>
                <Table.Th>Shop</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Začátek</Table.Th>
                <Table.Th>Konec</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.pipelines.map((pipeline) => (
                <Table.Tr key={pipeline.id}>
                  <Table.Td>
                    <Text size="sm">{pipeline.endpoint}</Text>
                  </Table.Td>
                  <Table.Td>{pipeline.shop?.name ?? '—'}</Table.Td>
                  <Table.Td>
                    <Badge
                      color={
                        pipeline.status === 'completed'
                          ? 'green'
                          : pipeline.status === 'error'
                            ? 'red'
                            : pipeline.status === 'downloaded'
                              ? 'blue'
                              : 'gray'
                      }
                      variant="light"
                    >
                      {pipeline.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{formatRelativeTime(pipeline.started_at)}</Table.Td>
                  <Table.Td>{formatRelativeTime(pipeline.finished_at)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>

      <Stack gap="sm">
        <Title order={5}>Job schedulery</Title>
        <Table highlightOnHover withRowBorders={false} verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Proces</Table.Th>
              <Table.Th>Shop</Table.Th>
              <Table.Th>Stav</Table.Th>
              <Table.Th>Poslední spuštění</Table.Th>
              <Table.Th>Cron</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.job_schedules.map((schedule) => (
              <Table.Tr key={schedule.id}>
                <Table.Td>
                  <Stack gap={0} align="flex-start">
                    <Text size="sm">{schedule.label}</Text>
                    <Text size="xs" c="dimmed">
                      {schedule.job_type}
                    </Text>
                  </Stack>
                </Table.Td>
                <Table.Td>{schedule.shop?.name ?? '—'}</Table.Td>
                <Table.Td>
                  <Badge
                    color={
                      schedule.last_run_status === 'completed'
                        ? 'green'
                        : schedule.last_run_status === 'running'
                          ? 'blue'
                          : schedule.last_run_status === 'failed'
                            ? 'red'
                            : schedule.enabled
                              ? 'gray'
                              : 'yellow'
                    }
                    variant="light"
                  >
                    {schedule.last_run_status ?? (schedule.enabled ? 'čeká' : 'vypnuto')}
                  </Badge>
                </Table.Td>
                <Table.Td>{formatRelativeTime(schedule.last_run_at)}</Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {schedule.cron_expression} ({schedule.timezone})
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    </Stack>
    </Card>
  );
};
