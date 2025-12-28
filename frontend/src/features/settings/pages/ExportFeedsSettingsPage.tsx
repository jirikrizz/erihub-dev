import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Center,
  CopyButton,
  Divider,
  Group,
  Loader,
  MultiSelect,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconCopy, IconExternalLink, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useEffect, useMemo, useState } from 'react';
import {
  useCreateExportFeedLink,
  useDeleteExportFeedLink,
  useExportFeedLinks,
  useExportFeedOptions,
} from '../hooks/useExportFeeds';
import type { ExportFeedLink, FeedDefinition } from '../../../api/exportFeeds';

const rangeModeOptions = [
  { value: 'none', label: 'Bez omezení' },
  { value: 'relative', label: 'Relativní období' },
  { value: 'absolute', label: 'Konkrétní datumy' },
];

const toIsoString = (value: string): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

export const ExportFeedsSettingsPage = () => {
  const optionsQuery = useExportFeedOptions();
  const linksQuery = useExportFeedLinks();
  const createLink = useCreateExportFeedLink();
  const deleteLink = useDeleteExportFeedLink();

  const feeds = optionsQuery.data?.feeds ?? [];
  const formats = optionsQuery.data?.formats ?? [];
  const cacheIntervals = optionsQuery.data?.cache_intervals ?? [];
  const relativeRanges = optionsQuery.data?.relative_ranges ?? [];
  const shops = optionsQuery.data?.shops ?? [];

  const feedMap = useMemo(
    () =>
      feeds.reduce<Record<string, FeedDefinition>>((acc, feed) => {
        acc[feed.key] = feed;
        return acc;
      }, {}),
    [feeds]
  );

  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedShopId, setSelectedShopId] = useState<string>('all');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [selectedCacheInterval, setSelectedCacheInterval] = useState<number | null>(null);
  const [rangeMode, setRangeMode] = useState<'none' | 'relative' | 'absolute'>('none');
  const [relativeInterval, setRelativeInterval] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const currentFeed = selectedType ? feedMap[selectedType] : undefined;
  const supportsTimeRange = currentFeed?.supports_time_range ?? false;

  useEffect(() => {
    if (!optionsQuery.isSuccess) {
      return;
    }

    if (!selectedType) {
      const firstFeed = feeds[0];
      if (firstFeed) {
        setSelectedType(firstFeed.key);
        setSelectedFields(firstFeed.default_fields ?? []);
      }
    }

    if (!selectedFormat) {
      const firstFormat = formats[0];
      if (firstFormat) {
        setSelectedFormat(firstFormat.key);
      }
    }

    if (!selectedCacheInterval) {
      const firstInterval = cacheIntervals[0];
      if (firstInterval) {
        setSelectedCacheInterval(firstInterval.value);
      }
    }
  }, [optionsQuery.isSuccess, feeds, formats, cacheIntervals, selectedType, selectedFormat, selectedCacheInterval]);

  useEffect(() => {
    if (!currentFeed) {
      return;
    }

    setSelectedFields((current) => {
      if (current.length === 0) {
        return currentFeed.default_fields ?? [];
      }

      const allowed = new Set(currentFeed.fields.map((field) => field.key));
      const filtered = current.filter((field) => allowed.has(field));
      return filtered.length > 0 ? filtered : currentFeed.default_fields ?? [];
    });

    if (!currentFeed.supports_time_range) {
      setRangeMode('none');
      setRelativeInterval(null);
      setDateFrom('');
      setDateTo('');
    } else if (rangeMode === 'none') {
      setRangeMode('relative');
    }
  }, [currentFeed, rangeMode]);

  useEffect(() => {
    if (rangeMode === 'relative') {
      if (!relativeInterval) {
        const first = relativeRanges[0];
        if (first) {
          setRelativeInterval(first.value);
        }
      }
      setDateFrom('');
      setDateTo('');
    }

    if (rangeMode === 'absolute') {
      setRelativeInterval(null);
    }

    if (rangeMode === 'none') {
      setRelativeInterval(null);
      setDateFrom('');
      setDateTo('');
    }
  }, [rangeMode, relativeInterval, relativeRanges]);

  const feedSelectData = feeds.map((feed) => ({
    value: feed.key,
    label: feed.label,
    description: feed.description,
  }));
  const shopSelectData = [
    { value: 'all', label: 'Všechny shopy' },
    ...shops.map((shop) => ({
      value: String(shop.id),
      label: shop.domain ? `${shop.name} (${shop.domain})` : shop.name,
    })),
  ];
  const fieldSelectData = currentFeed?.fields.map((field) => ({ value: field.key, label: field.label })) ?? [];
  const formatSelectData = formats.map((format) => ({ value: format.key, label: format.label }));
  const cacheSelectData = cacheIntervals.map((interval) => ({
    value: String(interval.value),
    label: interval.label,
  }));
  const relativeSelectData = relativeRanges.map((range) => ({ value: String(range.value), label: range.label }));

  const handleCreateLink = async () => {
    if (!selectedType || !selectedFormat || !selectedCacheInterval) {
      notifications.show({
        message: 'Vyplň prosím typ feedu, formát i frekvenci cache.',
        color: 'red',
      });
      return;
    }

    if (selectedFields.length === 0) {
      notifications.show({
        message: 'Vyber alespoň jedno pole, které chceš exportovat.',
        color: 'red',
      });
      return;
    }

    let payloadRangeMode: 'none' | 'relative' | 'absolute' = rangeMode;

    if (!supportsTimeRange) {
      payloadRangeMode = 'none';
    }

    let relativeSeconds: number | null = null;
    let absoluteFrom: string | null = null;
    let absoluteTo: string | null = null;

    if (payloadRangeMode === 'relative') {
      if (!relativeInterval) {
        notifications.show({ message: 'Vyber délku relativního období.', color: 'red' });
        return;
      }
      relativeSeconds = relativeInterval;
    }

    if (payloadRangeMode === 'absolute') {
      const fromIso = toIsoString(dateFrom);
      const toIso = toIsoString(dateTo);

      if (!fromIso || !toIso) {
        notifications.show({ message: 'Zadej platné datumy pro období.', color: 'red' });
        return;
      }

      if (new Date(fromIso) > new Date(toIso)) {
        notifications.show({ message: 'Datum OD nesmí být později než datum DO.', color: 'red' });
        return;
      }

      absoluteFrom = fromIso;
      absoluteTo = toIso;
    }

    let normalizedShopId: number | null = null;
    if (selectedShopId && selectedShopId !== 'all') {
      const numericShopId = Number(selectedShopId);
      normalizedShopId = Number.isNaN(numericShopId) ? null : numericShopId;
    }

    try {
      await createLink.mutateAsync({
        name: name.trim() !== '' ? name.trim() : undefined,
        type: selectedType,
        shop_id: normalizedShopId ?? undefined,
        fields: selectedFields,
        format: selectedFormat,
        cache_ttl: selectedCacheInterval,
        range_mode: payloadRangeMode,
        relative_interval: relativeSeconds,
        date_from: absoluteFrom,
        date_to: absoluteTo,
      });

      notifications.show({
        message: 'Feed byl uložen. Odkaz najdeš v seznamu níže.',
        color: 'green',
      });

      setName('');
    } catch (error) {
      console.error(error);
      notifications.show({
        message: 'Uložení feedu selhalo. Zkus to prosím znovu.',
        color: 'red',
      });
    }
  };

  const handleOpenLink = (link: ExportFeedLink) => {
    window.open(link.url, '_blank', 'noopener,noreferrer');
  };

  const isOptionsLoading = optionsQuery.isLoading;
  const isOptionsError = optionsQuery.isError;

  const isLinksLoading = linksQuery.isLoading;
  const isLinksError = linksQuery.isError;
  const links = linksQuery.data?.links ?? [];

  if (isOptionsLoading) {
    return (
      <Center py="xl">
        <Loader size="lg" />
      </Center>
    );
  }

  if (isOptionsError) {
    return (
      <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
        Nepodařilo se načíst dostupné feedy. Zkus stránku obnovit nebo to zkus později.
      </Alert>
    );
  }

  if (feeds.length === 0) {
    return (
      <Alert color="yellow" variant="light" title="Žádné feedy">
        V systému zatím nejsou nakonfigurovány žádné exporty.
      </Alert>
    );
  }

  return (
    <Stack gap="xl">
      <Stack gap="xs">
        <Title order={2}>Export a feedy</Title>
        <Text c="gray.6">
          Navrhni export zákazníků, objednávek nebo produktů a ulož si trvalý odkaz. Každé stažení vrátí aktuální data
          podle nastaveného období, dokud odkaz nesmažeš.
        </Text>
      </Stack>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="lg">
          <TextInput
            label="Popisek feedu"
            placeholder="Např. Zákazníci - posledních 7 dní"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />

          <Select
            label="Typ feedu"
            placeholder="Vyber zdroj"
            data={feedSelectData}
            value={selectedType}
            onChange={(value) => {
              setSelectedType(value);
            }}
            withAsterisk
          />

          <Select
            label="Shop"
            placeholder="Všechny shopy"
            data={shopSelectData}
            value={selectedShopId}
            onChange={(value) => setSelectedShopId(value ?? 'all')}
          />

          <MultiSelect
            label="Pole k exportu"
            placeholder={fieldSelectData.length === 0 ? 'Nejsou k dispozici žádná pole' : 'Vyber pole'}
            data={fieldSelectData}
            value={selectedFields}
            onChange={(values) => setSelectedFields(values)}
            searchable
            nothingFoundMessage="Nic nenalezeno"
            disabled={fieldSelectData.length === 0}
            withAsterisk
          />

          {supportsTimeRange && (
            <Stack gap="sm">
              <Select
                label="Typ období"
                data={rangeModeOptions}
                value={rangeMode}
                onChange={(value) =>
                  setRangeMode((value as 'none' | 'relative' | 'absolute' | null) ?? 'none')
                }
              />

              {rangeMode === 'relative' && (
                <Select
                  label="Relativní období"
                  placeholder="Vyber rozsah"
                  data={relativeSelectData}
                  value={relativeInterval ? String(relativeInterval) : null}
                  onChange={(value) => setRelativeInterval(value ? Number(value) : null)}
                  withAsterisk
                />
              )}

              {rangeMode === 'absolute' && (
                <Group grow>
                  <TextInput
                    type="datetime-local"
                    label="Období od"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.currentTarget.value)}
                    withAsterisk
                  />
                  <TextInput
                    type="datetime-local"
                    label="Období do"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.currentTarget.value)}
                    withAsterisk
                  />
                </Group>
              )}
            </Stack>
          )}

          <Group grow>
            <Select
              label="Formát"
              data={formatSelectData}
              value={selectedFormat}
              onChange={(value) => setSelectedFormat(value)}
              withAsterisk
            />
            <Select
              label="Cache feedu"
              data={cacheSelectData}
              value={selectedCacheInterval ? String(selectedCacheInterval) : null}
              onChange={(value) => setSelectedCacheInterval(value ? Number(value) : null)}
              withAsterisk
            />
          </Group>

          <Group justify="space-between">
            <Text size="sm" c="gray.6">
              Feed se během platnosti cache uloží – další stažení během tohoto intervalu vrátí stejná data.
            </Text>
            <Button onClick={handleCreateLink} loading={createLink.isPending}>
              Uložit odkaz
            </Button>
          </Group>
        </Stack>
      </Card>

      <Divider label="Uložené odkazy" labelPosition="left" />

      {isLinksLoading ? (
        <Center py="xl">
          <Loader size="lg" />
        </Center>
      ) : isLinksError ? (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
          Nepodařilo se načíst uložené odkazy. Zkus to prosím znovu.
        </Alert>
      ) : links.length === 0 ? (
        <Alert color="yellow" variant="light" title="Žádné odkazy">
          Zatím nemáš uložený žádný export. Vyplň formulář výše a ulož první feed.
        </Alert>
      ) : (
        <Stack gap="sm">
          {links.map((link) => (
            <Card key={link.id} withBorder padding="md" radius="sm">
              <Stack gap="xs">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={2} maw="70%">
                    <Title order={4}>{link.name}</Title>
                    <Text size="sm" c="gray.6">
                      {link.type} • {link.format.toUpperCase()} • cache {Math.round(link.cache_ttl / 60)} min •{' '}
                      {formatLinkShop(link)}
                    </Text>
                    <Text size="xs" c="gray.5">
                      {renderRangeDescription(link)}
                    </Text>
                  </Stack>
                  <Group gap="xs">
                    <CopyButton value={link.url} timeout={2000}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? 'Zkopírováno!' : 'Kopírovat odkaz'} withArrow>
                          <ActionIcon color={copied ? 'teal' : 'gray'} variant="light" onClick={copy}>
                            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                    <Tooltip label="Otevřít" withArrow>
                      <ActionIcon variant="light" color="blue" onClick={() => handleOpenLink(link)}>
                        <IconExternalLink size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Smazat" withArrow>
                      <ActionIcon
                        variant="light"
                        color="red"
                        onClick={() =>
                          deleteLink.mutate(link.id, {
                            onSuccess: () =>
                              notifications.show({ message: 'Odkaz byl odstraněn.', color: 'green' }),
                            onError: () =>
                              notifications.show({
                                message: 'Smazání odkazu selhalo. Zkus to prosím znovu.',
                                color: 'red',
                              }),
                          })
                        }
                        loading={deleteLink.isPending && deleteLink.variables === link.id}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>

                <Text size="xs" c="gray.5">
                  URL: {link.url}
                </Text>
              </Stack>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
};

const formatLinkShop = (link: ExportFeedLink): string => {
  if (!link.shop) {
    return 'Všechny shopy';
  }

  return link.shop.domain ? `${link.shop.name} (${link.shop.domain})` : link.shop.name;
};

const renderRangeDescription = (link: ExportFeedLink): string => {
  switch (link.range_mode) {
    case 'relative':
      {
        if (!link.relative_interval) {
          return 'Relativní období';
        }
        const days = link.relative_interval / 86400;
        if (Number.isInteger(days)) {
          return `Posledních ${days} dní (při stažení vždy od aktuálního času)`;
        }
        return `Relativní období ${Math.round(link.relative_interval / 3600)} hodin`;
      }
    case 'absolute':
      return `Období od ${formatReadableDateTime(link.date_from)} do ${
        formatReadableDateTime(link.date_to)
      }`;
    default:
      return 'Bez časového omezení';
  }
};

const formatReadableDateTime = (value?: string | null): string => {
  if (!value) {
    return '?';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '?';
  }

  return new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
};
