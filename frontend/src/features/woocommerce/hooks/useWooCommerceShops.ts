import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWooCommerceShop,
  deleteWooCommerceShop,
  listWooCommerceShops,
  syncWooCommerceOrders,
  updateWooCommerceShop,
} from '../../../api/woocommerce';

export const useWooCommerceShops = (params: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: ['woocommerce', 'shops', params],
    queryFn: () => listWooCommerceShops(params),
  });

export const useCreateWooCommerceShop = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => createWooCommerceShop(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['woocommerce', 'shops'] });
    },
  });
};

export const useUpdateWooCommerceShop = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      updateWooCommerceShop(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['woocommerce', 'shops'] });
    },
  });
};

export const useDeleteWooCommerceShop = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteWooCommerceShop(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['woocommerce', 'shops'] });
    },
  });
};

export const useSyncWooCommerceOrders = () =>
  useMutation({
    mutationFn: ({ id, payload }: { id: number; payload?: Record<string, unknown> }) =>
      syncWooCommerceOrders(id, payload ?? {}),
  });
