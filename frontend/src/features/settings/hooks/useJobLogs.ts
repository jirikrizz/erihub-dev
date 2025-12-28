import { useQuery } from '@tanstack/react-query';
import type { JobLogsParams } from '../../../api/jobLogs';
import { listJobLogs } from '../../../api/jobLogs';

export const useJobLogs = (params: JobLogsParams, options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['settings', 'job-logs', params.source ?? 'queue-worker', params.limit ?? 200],
    queryFn: () => listJobLogs(params),
    refetchInterval: 15000,
    ...options,
  });
