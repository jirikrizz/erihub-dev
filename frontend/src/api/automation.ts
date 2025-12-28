import api from './client';

export type AutomationQueueStat = {
  name: string;
  pending: number;
  failed: number;
  last_failed_at: string | null;
};

export type AutomationPipeline = {
  id: string;
  endpoint: string;
  status: string;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  meta: Record<string, unknown>;
  shop: {
    id: number;
    name: string;
  } | null;
};

export type AutomationJobSchedule = {
  id: string;
  job_type: string;
  label: string;
  enabled: boolean;
  cron_expression: string;
  timezone: string;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  last_run_ended_at: string | null;
  shop: {
    id: number;
    name: string;
  } | null;
};

export type AutomationLogStat = {
  path: string;
  updated_at: string | null;
  size: number;
} | null;

export type AutomationStatusResponse = {
  generated_at: string;
  queues: AutomationQueueStat[];
  pipelines: AutomationPipeline[];
  job_schedules: AutomationJobSchedule[];
  logs: Record<string, AutomationLogStat>;
};

export const fetchAutomationStatus = async () => {
  const { data } = await api.get<AutomationStatusResponse>('/settings/automation/status');
  return data;
};
