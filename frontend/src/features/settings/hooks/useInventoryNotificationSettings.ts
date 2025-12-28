import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchInventoryNotificationSettings,
  updateInventoryNotificationSettings,
  type InventoryNotificationSettings,
  type InventoryNotificationSettingsPayload,
} from '../../../api/settings';

export const useInventoryNotificationSettings = () =>
  useQuery({
    queryKey: ['settings', 'inventory-notifications'],
    queryFn: fetchInventoryNotificationSettings,
  });

export const useUpdateInventoryNotificationSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: InventoryNotificationSettingsPayload) =>
      updateInventoryNotificationSettings(payload),
    onSuccess: (data: InventoryNotificationSettings) => {
      queryClient.setQueryData(['settings', 'inventory-notifications'], data);
    },
  });
};

