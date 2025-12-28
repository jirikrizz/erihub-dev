import {
  ActionIcon,
  Alert,
  Card,
  Center,
  Group,
  Loader,
  ScrollArea,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useJobLogs } from '../hooks/useJobLogs';

const LOG_LIMIT = 200;
const DEFAULT_SOURCE = 'queue-worker';

const formatTimestamp = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
};

export const JobLogsPanel = () => {
  const [selectedSource, setSelectedSource] = useState<string>(DEFAULT_SOURCE);

  const jobLogsQuery = useJobLogs({ source: selectedSource, limit: LOG_LIMIT });

  const sources = useMemo(() => jobLogsQuery.data?.sources ?? [], [jobLogsQuery.data?.sources]);
  const currentSource = jobLogsQuery.data?.source;
  const entries = jobLogsQuery.data?.entries ?? [];
  const fetchedAt = jobLogsQuery.data?.fetched_at;

  useEffect(() => {
    if (currentSource?.key && currentSource.key !== selectedSource) {
      setSelectedSource(currentSource.key);
    }
  }, [currentSource?.key, selectedSource]);

  useEffect(() => {
    if (sources.length === 0) {
      return;
    }

    const hasSelected = sources.some((source) => source.key === selectedSource);

    if (!hasSelected) {
      setSelectedSource(sources[0].key);
    }
  }, [sources, selectedSource]);

  const selectData = useMemo(
    () =>
      sources.map((source) => ({
        value: source.key,
        label: source.label,
      })),
    [sources]
  );

  const handleRefresh = () => {
    void jobLogsQuery.refetch();
  };

  const lastUpdatedLabel = formatTimestamp(fetchedAt);

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Title order={3}>Logy běžících jobů</Title>
            <Text size="sm" c="gray.6">
              Poslední záznamy z workerů, plánovače a dalších procesů v HUBu.
            </Text>
            {lastUpdatedLabel && (
              <Text size="xs" c="gray.5">
                Aktualizováno {lastUpdatedLabel}
              </Text>
            )}
          </Stack>
          <Group gap="xs">
            <Select
              placeholder="Vyber log"
              data={selectData}
              value={selectedSource}
              onChange={(value) => value && setSelectedSource(value)}
              clearable={false}
              size="sm"
              searchable
              nothingFoundMessage="Nenalezeno"
              styles={{ dropdown: { maxHeight: 240 } }}
              disabled={selectData.length === 0}
            />
            <Tooltip label="Obnovit" withArrow>
              <ActionIcon
                variant="light"
                color="gray"
                onClick={handleRefresh}
                disabled={jobLogsQuery.isFetching}
                aria-label="Obnovit log"
              >
                {jobLogsQuery.isFetching ? <Loader size="xs" /> : <IconRefresh size={16} />}
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {jobLogsQuery.isError ? (
          <Alert color="red" icon={<IconAlertCircle size={16} />} variant="light">
            Log se nepodařilo načíst. Zkus to prosím znovu.
          </Alert>
        ) : (
          <Card withBorder radius="sm" padding="0">
            <ScrollArea h={260} type="always" scrollbarSize={6}>
              {jobLogsQuery.isLoading ? (
                <Center py="lg">
                  <Loader size="sm" />
                </Center>
              ) : entries.length === 0 ? (
                <Center py="lg">
                  <Text size="sm" c="gray.5">
                    Zatím nejsou žádné záznamy k zobrazení.
                  </Text>
                </Center>
              ) : (
                <Stack gap={4} p="md">
                  {entries.map((entry, index) => (
                    <Text key={`${entry}-${index}`} size="xs" c="gray.8" ff="monospace">
                      {entry}
                    </Text>
                  ))}
                </Stack>
              )}
            </ScrollArea>
          </Card>
        )}
      </Stack>
    </Card>
  );
};
