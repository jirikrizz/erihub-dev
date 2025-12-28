import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderStatusMappingPayload } from '../../../api/settings';
import { fetchOrderStatusMapping, updateOrderStatusMapping } from '../../../api/settings';

export const useOrderStatusMapping = () =>
  useQuery({
    queryKey: ['settings', 'order-statuses'],
    queryFn: fetchOrderStatusMapping,
  });

export const useUpdateOrderStatusMapping = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: OrderStatusMappingPayload) => updateOrderStatusMapping(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings', 'order-statuses'], data);
    },
  });
};
