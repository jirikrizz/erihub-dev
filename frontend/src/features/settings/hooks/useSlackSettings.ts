import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSlackSettings, updateSlackSettings, type SlackSettingsPayload, type SlackSettings } from '../../../api/settings';

export const useSlackSettings = () =>
  useQuery({
    queryKey: ['settings', 'slack'],
    queryFn: fetchSlackSettings,
  });

export const useUpdateSlackSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SlackSettingsPayload) => updateSlackSettings(payload),
    onSuccess: (data: SlackSettings) => {
      queryClient.setQueryData(['settings', 'slack'], data);
    },
  });
};

