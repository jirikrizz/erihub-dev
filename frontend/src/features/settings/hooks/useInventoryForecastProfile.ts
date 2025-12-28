import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchInventoryForecastProfile,
  updateInventoryForecastProfile,
  type InventoryForecastProfile,
} from '../../../api/settings';

export const useInventoryForecastProfile = () =>
  useQuery({
    queryKey: ['settings', 'inventory-forecast-profile'],
    queryFn: fetchInventoryForecastProfile,
  });

export const useUpdateInventoryForecastProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: InventoryForecastProfile) => updateInventoryForecastProfile(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings', 'inventory-forecast-profile'], data);
    },
  });
};
