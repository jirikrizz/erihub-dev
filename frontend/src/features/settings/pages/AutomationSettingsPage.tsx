import { Alert, Center, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useCallback, useState } from 'react';
import type { JobScheduleCatalogEntry, JobScheduleFrequency } from '../../../api/jobSchedules';
import type { Shop } from '../../../api/shops';
import { AutomationJobCard } from '../components/AutomationJobCard';
import { AutomationStatusPanel } from '../components/AutomationStatusPanel';
import { JobLogsPanel } from '../components/JobLogsPanel';
import {
  useCreateJobSchedule,
  useDeleteJobSchedule,
  useJobSchedules,
  useRunJobSchedule,
  useUpdateJobSchedule,
} from '../hooks/useJobSchedules';
import { useShops } from '../../shoptet/hooks/useShops';

export const AutomationSettingsPage = () => {
  const jobSchedulesQuery = useJobSchedules();
  const { data: shopsResponse } = useShops({ per_page: 200 });
  const createSchedule = useCreateJobSchedule();
  const updateSchedule = useUpdateJobSchedule();
  const deleteSchedule = useDeleteJobSchedule();
  const runSchedule = useRunJobSchedule();

  const [savingJobType, setSavingJobType] = useState<string | null>(null);
  const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(null);
  const [runningScheduleId, setRunningScheduleId] = useState<string | null>(null);

  const shops: Shop[] = shopsResponse?.data ?? [];

  const handleSave = useCallback(
    async (
      job: JobScheduleCatalogEntry,
      payload: {
        jobType: string;
        shopId: number | null;
        frequency: JobScheduleFrequency;
        cronExpression: string;
        timezone: string;
        enabled: boolean;
        options: Record<string, unknown>;
      }
    ) => {
      const cronExpression = payload.cronExpression.trim();
      if (!cronExpression) {
        notifications.show({
          message: 'Cron výraz je povinný. Zadej prosím platnou hodnotu.',
          color: 'red',
        });
        return;
      }

      setSavingJobType(job.job_type);

      const options = payload.options ?? {};
      const basePayload = {
        shop_id: payload.shopId,
        frequency: payload.frequency,
        cron_expression: cronExpression,
        timezone: payload.timezone,
        enabled: payload.enabled,
        options,
      } satisfies Record<string, unknown>;

      try {
        if (job.schedule) {
          await updateSchedule.mutateAsync({ id: job.schedule.id, payload: basePayload });
          notifications.show({
            message: `Plán „${job.label}“ byl uložen.`,
            color: 'green',
          });
        } else {
          await createSchedule.mutateAsync({ job_type: job.job_type, ...basePayload });
          notifications.show({
            message: `Plán „${job.label}“ byl vytvořen.`,
            color: 'green',
          });
        }
      } catch (error) {
        console.error(error);
        notifications.show({
          message: `Nastavení „${job.label}“ se nepodařilo uložit.`,
          color: 'red',
        });
      } finally {
        setSavingJobType(null);
      }
    },
    [createSchedule, updateSchedule]
  );

  const handleDelete = useCallback(
    async (job: JobScheduleCatalogEntry, scheduleId: string) => {
      setDeletingScheduleId(scheduleId);
      try {
        await deleteSchedule.mutateAsync(scheduleId);
        notifications.show({
          message: `Plán „${job.label}“ byl odstraněn.`,
          color: 'green',
        });
      } catch (error) {
        console.error(error);
        notifications.show({
          message: `Plán „${job.label}“ se nepodařilo odstranit.`,
          color: 'red',
        });
      } finally {
        setDeletingScheduleId(null);
      }
    },
    [deleteSchedule]
  );

  const handleRun = useCallback(
    async (job: JobScheduleCatalogEntry, scheduleId: string) => {
      setRunningScheduleId(scheduleId);
      try {
        await runSchedule.mutateAsync(scheduleId);
        notifications.show({
          message: `Plán „${job.label}“ byl spuštěn.`,
          color: 'green',
        });
      } catch (error) {
        console.error(error);
        notifications.show({
          message: `Plán „${job.label}“ se nepodařilo spustit.`,
          color: 'red',
        });
      } finally {
        setRunningScheduleId(null);
      }
    },
    [runSchedule]
  );

  if (jobSchedulesQuery.isLoading) {
    return (
      <Center py="xl">
        <Loader size="lg" />
      </Center>
    );
  }

  if (jobSchedulesQuery.isError) {
    return (
      <Alert
        color="red"
        icon={<IconAlertCircle size={18} />}
        title="Nepodařilo se načíst nastavení"
        variant="light"
      >
        Zkus stránku obnovit nebo to zkus později.
      </Alert>
    );
  }

  const jobs = jobSchedulesQuery.data?.jobs ?? [];
  const isFetching = jobSchedulesQuery.isFetching && !jobSchedulesQuery.isLoading;
  const isSaving = createSchedule.isPending || updateSchedule.isPending;

  return (
    <Stack gap="xl">
      <AutomationStatusPanel />

      <Stack gap={4}>
        <Title order={2}>Nastavení automatizací</Title>
        <Text size="sm" c="gray.7">
          Nastav, kdy a jak se mají spouštět procesy pro objednávky a produktový katalog.
        </Text>
        {isFetching && (
          <Group gap="xs">
            <Loader size="sm" />
            <Text size="xs" c="gray.6">
              Načítám aktuální stav…
            </Text>
          </Group>
        )}
      </Stack>

      <JobLogsPanel />

      <Stack gap="lg">
        {jobs.length === 0 && (
          <Alert color="yellow" variant="light" title="Žádné procesy">
            V katalogu není definovaný žádný proces k naplánování.
          </Alert>
        )}

        {jobs.map((job) => {
          const scheduleId = job.schedule?.id ?? null;
          const savingForJob = isSaving && savingJobType === job.job_type;
          const disableForJob = isSaving && savingJobType !== null && savingJobType !== job.job_type;
          const deletingForJob = deleteSchedule.isPending && deletingScheduleId === scheduleId;
          const runningForJob = runSchedule.isPending && runningScheduleId === scheduleId;

          return (
            <AutomationJobCard
              key={job.job_type}
              job={job}
              shops={shops}
              onSubmit={(payload) => handleSave(job, payload)}
              onDelete={scheduleId ? (id) => handleDelete(job, id) : undefined}
              onRun={scheduleId ? () => handleRun(job, scheduleId) : undefined}
              saving={savingForJob}
              disabled={disableForJob}
              deleting={deletingForJob}
              running={runningForJob}
            />
          );
        })}
      </Stack>
    </Stack>
  );
};
