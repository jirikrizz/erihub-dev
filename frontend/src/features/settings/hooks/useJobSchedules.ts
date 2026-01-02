import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JobSchedulePayload, JobScheduleUpdatePayload } from '../../../api/jobSchedules';
import { createJobSchedule, deleteJobSchedule, listJobSchedules, runJobSchedule, updateJobSchedule } from '../../../api/jobSchedules';

export const useJobSchedules = () =>
  useQuery({
    queryKey: ['settings', 'job-schedules'],
    queryFn: listJobSchedules,
  });

export const useCreateJobSchedule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: JobSchedulePayload) => createJobSchedule(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'job-schedules'] });
    },
  });
};

export const useUpdateJobSchedule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: JobScheduleUpdatePayload }) =>
      updateJobSchedule(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'job-schedules'] });
    },
  });
};

export const useDeleteJobSchedule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteJobSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'job-schedules'] });
    },
  });
};

export const useRunJobSchedule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runJobSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'job-schedules'] });
    },
  });
};
