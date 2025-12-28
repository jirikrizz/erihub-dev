import api from './client';

export type JobLogSource = {
  key: string;
  label: string;
  path: string;
};

export type JobLogsResponse = {
  source: JobLogSource | null;
  sources: JobLogSource[];
  entries: string[];
  limit: number;
  fetched_at: string;
};

export type JobLogsParams = {
  source?: string;
  limit?: number;
};

export const listJobLogs = async (params: JobLogsParams = {}): Promise<JobLogsResponse> => {
  const searchParams = new URLSearchParams();

  if (params.source) {
    searchParams.set('source', params.source);
  }

  if (params.limit) {
    searchParams.set('limit', String(params.limit));
  }

  const query = searchParams.toString();
  const url = query ? `/settings/job-logs?${query}` : '/settings/job-logs';

  const response = await api.get<JobLogsResponse>(url);

  return response.data;
};
