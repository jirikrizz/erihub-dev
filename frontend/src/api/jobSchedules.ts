import api from './client';

export type JobScheduleFrequency =
  | 'every_five_minutes'
  | 'every_fifteen_minutes'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'custom';

export type JobSchedule = {
  id: string;
  name: string;
  job_type: string;
  shop_id: number | null;
  shop?: {
    id: number;
    name: string;
    domain: string | null;
  } | null;
  options: Record<string, unknown> | null;
  frequency: JobScheduleFrequency;
  frequency_label: string;
  cron_expression: string;
  timezone: string;
  enabled: boolean;
  last_run_at: string | null;
  last_run_ended_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  created_at: string;
  updated_at: string;
};

export type JobScheduleCatalogEntry = {
  job_type: string;
  label: string;
  description: string;
  default_frequency: JobScheduleFrequency;
  default_frequency_label: string;
  default_cron: string;
  default_timezone: string;
  supports_shop: boolean;
  default_options: Record<string, unknown>;
  schedule: JobSchedule | null;
};

export type JobScheduleIndexResponse = {
  jobs: JobScheduleCatalogEntry[];
};

export type JobSchedulePayload = {
  job_type: string;
  name?: string | null;
  shop_id?: number | null;
  options?: Record<string, unknown> | null;
  frequency?: JobScheduleFrequency;
  cron_expression?: string;
  timezone?: string;
  enabled?: boolean;
};

export type JobScheduleUpdatePayload = Omit<JobSchedulePayload, 'job_type'>;

export const listJobSchedules = async () => {
  const { data } = await api.get<JobScheduleIndexResponse>('/settings/job-schedules');
  return data;
};

export const createJobSchedule = async (payload: JobSchedulePayload) => {
  const { data } = await api.post<JobSchedule>('/settings/job-schedules', payload);
  return data;
};

export const updateJobSchedule = async (id: string, payload: JobScheduleUpdatePayload) => {
  const { data } = await api.put<JobSchedule>(`/settings/job-schedules/${id}`, payload);
  return data;
};

export const deleteJobSchedule = async (id: string) => {
  await api.delete(`/settings/job-schedules/${id}`);
};
