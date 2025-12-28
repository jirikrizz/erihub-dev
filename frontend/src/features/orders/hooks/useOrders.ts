import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchOrder, fetchOrderFilters, fetchOrders, syncOrders } from '../../../api/orders';

export const useOrders = (params: Record<string, unknown>) =>
  useQuery({
    queryKey: ['orders', params],
    queryFn: () => fetchOrders(params),
    placeholderData: keepPreviousData,
  });

export const useOrder = (id: string | undefined) =>
  useQuery({
    queryKey: ['orders', 'detail', id],
    queryFn: () => fetchOrder(id!),
    enabled: !!id,
  });

export const useSyncOrders = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ shopId, payload }: { shopId: number; payload?: Record<string, unknown> }) =>
      syncOrders(shopId, payload ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
};

export const useOrderFilters = () =>
  useQuery({
    queryKey: ['orders', 'filters'],
    queryFn: fetchOrderFilters,
    staleTime: 5 * 60 * 1000,
  });
