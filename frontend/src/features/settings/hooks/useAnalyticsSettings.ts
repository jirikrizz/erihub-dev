import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AnalyticsSettings } from '../../../api/settings';
import { fetchAnalyticsSettings, updateAnalyticsSettings } from '../../../api/settings';

export const useAnalyticsSettings = () =>
  useQuery({
    queryKey: ['settings', 'analytics'],
    queryFn: fetchAnalyticsSettings,
  });

export const useUpdateAnalyticsSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Partial<AnalyticsSettings>) => updateAnalyticsSettings(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings', 'analytics'], data);
    },
  });
};
