import {
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { IconRefresh, IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JobScheduleCatalogEntry, JobScheduleFrequency } from '../../../api/jobSchedules';
import type { Shop } from '../../../api/shops';

const GLOBAL_SHOP_VALUE = '__all__';

const FREQUENCY_PRESETS: Array<{ value: JobScheduleFrequency; label: string; cron: string }> = [
  { value: 'every_five_minutes', label: 'Každých 5 minut', cron: '*/5 * * * *' },
  { value: 'every_fifteen_minutes', label: 'Každých 15 minut', cron: '*/15 * * * *' },
  { value: 'hourly', label: 'Každou hodinu', cron: '0 * * * *' },
  { value: 'daily', label: 'Denně (03:00)', cron: '0 3 * * *' },
  { value: 'weekly', label: 'Týdně (pondělí 04:00)', cron: '0 4 * * 1' },
  { value: 'custom', label: 'Vlastní cron výraz', cron: '' },
];

const BASE_TIMEZONE_OPTIONS = [
  { value: 'Europe/Prague', label: 'Europe/Prague' },
  { value: 'Europe/Bratislava', label: 'Europe/Bratislava' },
  { value: 'Europe/Budapest', label: 'Europe/Budapest' },
  { value: 'Europe/Bucharest', label: 'Europe/Bucharest' },
  { value: 'Europe/Zagreb', label: 'Europe/Zagreb' },
  { value: 'UTC', label: 'UTC' },
];

const EMPTY_OPTIONS: Record<string, unknown> = {};

export type AutomationJobFormState = {
  shopValue: string;
  frequency: JobScheduleFrequency;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  options: Record<string, unknown>;
};

type Props = {
  job: JobScheduleCatalogEntry;
  shops: Shop[];
  onSubmit: (payload: {
    jobType: string;
    shopId: number | null;
    frequency: JobScheduleFrequency;
    cronExpression: string;
    timezone: string;
    enabled: boolean;
    options: Record<string, unknown>;
  }) => Promise<void>;
  onDelete?: (scheduleId: string) => Promise<void>;
  disabled?: boolean;
  saving?: boolean;
  deleting?: boolean;
};

export const AutomationJobCard = ({
  job,
  shops,
  onSubmit,
  onDelete,
  disabled = false,
  saving = false,
  deleting = false,
}: Props) => {
  const supportsShop = job.supports_shop;
  const schedule = job.schedule;

  const buildState = useCallback((): AutomationJobFormState => {
    const defaultFrequency = schedule?.frequency ?? job.default_frequency;
    const defaultCron = schedule?.cron_expression ?? job.default_cron;
    const defaultTimezone = schedule?.timezone ?? job.default_timezone;
    const enabled = schedule?.enabled ?? true;
    const defaultOptions = (job.default_options ?? EMPTY_OPTIONS) as Record<string, unknown>;
    const scheduleOptions = (schedule?.options ?? undefined) as Record<string, unknown> | undefined;
    const mergedOptions = {
      ...defaultOptions,
      ...(scheduleOptions ?? {}),
    };
    const shopValue = supportsShop
      ? schedule?.shop_id !== null && schedule?.shop_id !== undefined
        ? String(schedule.shop_id)
        : GLOBAL_SHOP_VALUE
      : GLOBAL_SHOP_VALUE;

    return {
      shopValue,
      frequency: defaultFrequency,
      cronExpression: defaultCron,
      timezone: defaultTimezone,
      enabled,
      options: JSON.parse(JSON.stringify(mergedOptions ?? EMPTY_OPTIONS)) as Record<string, unknown>,
    };
  }, [
    supportsShop,
    schedule?.cron_expression,
    schedule?.enabled,
    schedule?.frequency,
    schedule?.shop_id,
    schedule?.timezone,
    schedule?.options,
    job.default_options,
    job.default_cron,
    job.default_frequency,
    job.default_timezone,
  ]);

  const [state, setState] = useState<AutomationJobFormState>(buildState);

  useEffect(() => {
    setState(buildState());
  }, [buildState]);

  const baseline = useMemo(() => {
    const next = buildState();
    return {
      ...next,
      options: JSON.parse(JSON.stringify(next.options ?? {})) as Record<string, unknown>,
    };
  }, [buildState]);

  const baselineOptions = baseline.options ?? EMPTY_OPTIONS;
  const jobDefaultOptionsRecord = (job.default_options ?? EMPTY_OPTIONS) as Record<string, unknown>;
  const stateOptions = state.options ?? EMPTY_OPTIONS;

  const isDirty = useMemo(() => JSON.stringify(state) !== JSON.stringify(baseline), [state, baseline]);

  const shopOptions = useMemo(() => {
    if (!supportsShop) {
      return [];
    }

    const map = new Map<string, string>();
    map.set(GLOBAL_SHOP_VALUE, 'Všechny shopy');

    shops.forEach((shop) => {
      map.set(String(shop.id), shop.name ?? shop.domain ?? `Shop #${shop.id}`);
    });

    if (schedule?.shop_id !== null && schedule?.shop_id !== undefined) {
      const value = String(schedule.shop_id);
      if (!map.has(value)) {
        map.set(value, schedule.shop?.name ?? schedule.shop?.domain ?? `Shop #${schedule.shop_id}`);
      }
    }

    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [supportsShop, shops, schedule?.shop_id, schedule?.shop?.name, schedule?.shop?.domain]);

  const timezoneOptions = useMemo(() => {
    const entries = new Map(BASE_TIMEZONE_OPTIONS.map((option) => [option.value, option.label] as const));
    if (state.timezone && !entries.has(state.timezone)) {
      entries.set(state.timezone, state.timezone);
    }

    return Array.from(entries.entries()).map(([value, label]) => ({ value, label }));
  }, [state.timezone]);

  const resolvedLookbackHours = useMemo(() => {
    const raw = (stateOptions['lookback_hours'] ?? jobDefaultOptionsRecord['lookback_hours'] ?? baselineOptions['lookback_hours']) as
      | number
      | string
      | undefined;

    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }

    if (typeof raw === 'string') {
      const parsed = parseInt(raw, 10);
      if (! Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return 48;
  }, [baselineOptions, jobDefaultOptionsRecord, stateOptions]);

  const resolvedFallbackLookbackHours = useMemo(() => {
    const raw = (stateOptions['fallback_lookback_hours'] ?? jobDefaultOptionsRecord['fallback_lookback_hours'] ?? baselineOptions['fallback_lookback_hours']) as
      | number
      | string
      | undefined;

    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }

    if (typeof raw === 'string') {
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return 24;
  }, [baselineOptions, jobDefaultOptionsRecord, stateOptions]);

  const resolvedChunkSize = useMemo(() => {
    const raw = (stateOptions['chunk'] ?? jobDefaultOptionsRecord['chunk'] ?? baselineOptions['chunk']) as
      | number
      | string
      | undefined;

    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }

    if (typeof raw === 'string') {
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return 1000;
  }, [baselineOptions, jobDefaultOptionsRecord, stateOptions]);

  const resolvedQueueName = useMemo(() => {
    const raw = (stateOptions['queue'] ?? jobDefaultOptionsRecord['queue'] ?? baselineOptions['queue']) as
      | string
      | undefined;

    if (typeof raw === 'string') {
      return raw;
    }

    return 'customers';
  }, [baselineOptions, jobDefaultOptionsRecord, stateOptions]);

  const lastRunLabel = useMemo(() => {
    if (!schedule?.last_run_at) {
      return 'Proces ještě neběžel';
    }

    const started = new Date(schedule.last_run_at).toLocaleString('cs-CZ');
    const status = schedule.last_run_status ?? 'probíhá';
    return `${started} — ${status}`;
  }, [schedule?.last_run_at, schedule?.last_run_status]);

  const handleFrequencyChange = useCallback((value: JobScheduleFrequency | null) => {
    if (!value) {
      return;
    }

    setState((prev) => {
      const preset = FREQUENCY_PRESETS.find((option) => option.value === value);
      const cronExpression = value === 'custom' ? prev.cronExpression : preset?.cron ?? prev.cronExpression;
      return {
        ...prev,
        frequency: value,
        cronExpression,
      };
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (disabled || saving) {
      return;
    }

    const shopId = supportsShop && state.shopValue !== GLOBAL_SHOP_VALUE ? Number(state.shopValue) : null;

    await onSubmit({
      jobType: job.job_type,
      shopId,
      frequency: state.frequency,
      cronExpression: state.cronExpression,
      timezone: state.timezone,
      enabled: state.enabled,
      options: state.options,
    });
  }, [disabled, job.job_type, onSubmit, saving, state, supportsShop]);

  const handleDelete = useCallback(async () => {
    if (!schedule?.id || !onDelete) {
      return;
    }

    const confirmed = window.confirm('Opravdu chceš zrušit tento plán?');
    if (!confirmed) {
      return;
    }

    await onDelete(schedule.id);
  }, [onDelete, schedule?.id]);

  return (
    <Card withBorder shadow="sm" radius="md" opacity={disabled ? 0.5 : 1} padding="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Group gap="xs">
              <Text fw={600}>{job.label}</Text>
              {!schedule && <Badge color="yellow" variant="light">Neuložené nastavení</Badge>}
              {!state.enabled && <Badge color="gray">Automatické spouštění vypnuto</Badge>}
            </Group>
            <Text size="sm" c="gray.7">
              {job.description}
            </Text>
          </Stack>
        </Group>

        {supportsShop && (
          <Select
            label="Shop"
            data={shopOptions}
            value={state.shopValue}
            onChange={(value) => value && setState((prev) => ({ ...prev, shopValue: value }))}
            disabled={disabled || saving}
            searchable
          />
        )}

        <Select
          label="Frekvence spuštění"
          data={FREQUENCY_PRESETS}
          value={state.frequency}
          onChange={(value) => handleFrequencyChange(value as JobScheduleFrequency | null)}
          disabled={disabled || saving}
        />

        <TextInput
          label="Cron výraz"
          description="Pro pokročilejší nastavení intervalu použij cron výraz."
          value={state.cronExpression}
          onChange={(event) => setState((prev) => ({ ...prev, cronExpression: event.currentTarget.value }))}
          disabled={disabled || saving}
        />

        {job.job_type === 'orders.refresh_statuses' && (
          <NumberInput
            label="Zpětné období pro kontrolu změn"
            description="Počet hodin, o které se vrátíme při hledání změn stavů objednávek."
            min={1}
            max={720}
            value={resolvedLookbackHours}
            onChange={(value) => {
              const numeric = typeof value === 'number' ? value : parseInt(value, 10);
              setState((prev) => ({
                ...prev,
                options: {
                  ...prev.options,
                  lookback_hours: Number.isFinite(numeric)
                    ? Math.min(720, Math.max(1, numeric))
                    : (baseline.options?.['lookback_hours'] as number | undefined) ?? resolvedLookbackHours,
                },
              }));
            }}
            disabled={disabled || saving}
            clampBehavior="strict"
          />
        )}

        {job.job_type === 'orders.fetch_new' && (
          <NumberInput
            label="Fallback pro první spuštění"
            description="Pokud ještě nemáme žádné objednávky, stáhne se toto zpětné období (hodiny)."
            min={1}
            max={720}
            value={resolvedFallbackLookbackHours}
            onChange={(value) => {
              const numeric = typeof value === 'number' ? value : parseInt(value, 10);
              setState((prev) => ({
                ...prev,
                options: {
                  ...prev.options,
                  fallback_lookback_hours: Number.isFinite(numeric)
                    ? Math.min(720, Math.max(1, numeric))
                    : (baseline.options?.['fallback_lookback_hours'] as number | undefined) ?? resolvedFallbackLookbackHours,
                },
              }));
            }}
            disabled={disabled || saving}
            clampBehavior="strict"
          />
        )}

        {job.job_type === 'customers.recalculate_metrics' && (
          <>
            <NumberInput
              label="Velikost dávky"
              description="Kolik zákazníků se má zpracovat v jednom jobu."
              min={1}
              max={5000}
              value={resolvedChunkSize}
              onChange={(value) => {
                const numeric = typeof value === 'number' ? value : parseInt(value, 10);
                setState((prev) => ({
                  ...prev,
                  options: {
                    ...prev.options,
                    chunk: Number.isFinite(numeric)
                      ? Math.min(5000, Math.max(1, numeric))
                      : (baseline.options?.['chunk'] as number | undefined) ?? resolvedChunkSize,
                    queue: prev.options?.['queue'] ?? resolvedQueueName,
                  },
                }));
              }}
              disabled={disabled || saving}
              clampBehavior="strict"
            />
            <TextInput
              label="Fronta"
              description="Název fronty, do které se mají přepočtové joby odesílat."
              value={resolvedQueueName}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setState((prev) => ({
                  ...prev,
                  options: {
                    ...prev.options,
                    queue: value,
                    chunk: prev.options?.['chunk'] ?? resolvedChunkSize,
                  },
                }));
              }}
              disabled={disabled || saving}
            />
          </>
        )}

        {job.job_type === 'customers.backfill_from_orders' && (
          <>
            <NumberInput
              label="Objednávky v jedné dávce"
              description="Kolik objednávek se má odeslat do jednoho backfill jobu."
              min={10}
              max={2000}
              value={resolvedChunkSize}
              onChange={(value) => {
                const numeric = typeof value === 'number' ? value : parseInt(value, 10);
                setState((prev) => ({
                  ...prev,
                  options: {
                    ...prev.options,
                    chunk: Number.isFinite(numeric)
                      ? Math.min(2000, Math.max(10, numeric))
                      : (baseline.options?.['chunk'] as number | undefined) ?? resolvedChunkSize,
                    queue: prev.options?.['queue'] ?? resolvedQueueName,
                  },
                }));
              }}
              disabled={disabled || saving}
              clampBehavior="strict"
            />
            <TextInput
              label="Fronta"
              description="Název fronty, do které se mají backfill joby odesílat."
              value={resolvedQueueName}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setState((prev) => ({
                  ...prev,
                  options: {
                    ...prev.options,
                    queue: value,
                    chunk: prev.options?.['chunk'] ?? resolvedChunkSize,
                  },
                }));
              }}
              disabled={disabled || saving}
            />
          </>
        )}

        <Select
          label="Časové pásmo"
          data={timezoneOptions}
          value={state.timezone}
          onChange={(value) => value && setState((prev) => ({ ...prev, timezone: value }))}
          disabled={disabled || saving}
          searchable
        />

        <Group justify="space-between" align="flex-end">
          <Stack gap={2}>
            <Switch
              label="Automaticky spouštět"
              checked={state.enabled}
              onChange={(event) => setState((prev) => ({ ...prev, enabled: event.currentTarget.checked }))}
              disabled={disabled || saving}
            />
            <Text size="xs" c="gray.6">
              Poslední běh: {lastRunLabel}
            </Text>
          </Stack>

          <Group gap="xs">
            <Button
              variant="subtle"
              leftSection={<IconRefresh size={16} />}
              onClick={() =>
                setState(() => ({
                  ...baseline,
                  options: JSON.parse(JSON.stringify(baseline.options ?? {})) as Record<string, unknown>,
                }))
              }
              disabled={!isDirty || disabled || saving}
            >
              Vrátit změny
            </Button>
            {schedule?.id && onDelete && (
              <Button
                variant="light"
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={handleDelete}
                disabled={disabled || deleting}
              >
                Zrušit plán
              </Button>
            )}
            <Button onClick={handleSubmit} loading={saving} disabled={disabled || !isDirty}>
              Uložit nastavení
            </Button>
          </Group>
        </Group>
      </Stack>
    </Card>
  );
};
