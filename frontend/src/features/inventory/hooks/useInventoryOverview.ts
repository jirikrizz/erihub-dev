import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchInventoryFilters,
  fetchInventoryOverview,
  fetchInventoryPurchaseOrders,
  fetchInventoryTags,
  fetchInventoryVariantNotes,
  fetchInventoryVariant,
  fetchInventoryVariants,
  fetchInventoryStockGuard,
  createInventoryPurchaseOrder,
  deleteInventoryPurchaseOrder,
} from '../../../api/inventory';

export const useInventoryOverview = () =>
  useQuery({
    queryKey: ['inventory', 'overview'],
    queryFn: fetchInventoryOverview,
    staleTime: 60_000,
  });

export const useInventoryVariants = (params: Record<string, unknown>) =>
  useQuery({
    queryKey: ['inventory', 'variants', params],
    queryFn: () => fetchInventoryVariants(params),
    placeholderData: keepPreviousData,
  });

export const useInventoryStockGuard = (params: Record<string, unknown>) =>
  useQuery({
    queryKey: ['inventory', 'stock-guard', params],
    queryFn: () => fetchInventoryStockGuard(params),
    placeholderData: keepPreviousData,
  });

export const useInventoryFilters = () =>
  useQuery({
    queryKey: ['inventory', 'filters'],
    queryFn: fetchInventoryFilters,
    staleTime: 10 * 60_000,
  });

export const useInventoryVariant = (id: string | undefined, params: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: ['inventory', 'variant', id, params],
    queryFn: () => fetchInventoryVariant(id!, params),
    enabled: !!id,
    staleTime: 60_000,
  });

export const useInventoryTags = () =>
  useQuery({
    queryKey: ['inventory', 'tags'],
    queryFn: fetchInventoryTags,
    staleTime: 120_000,
  });

export const useInventoryVariantNotes = (variantId: string | undefined) =>
  useQuery({
    queryKey: ['inventory', 'variant', variantId, 'notes'],
    queryFn: () => fetchInventoryVariantNotes(variantId!),
    enabled: !!variantId,
    staleTime: 30_000,
  });

export const useInventoryPurchaseOrders = () =>
  useQuery({
    queryKey: ['inventory', 'purchase-orders'],
    queryFn: fetchInventoryPurchaseOrders,
    staleTime: 30_000,
  });

export const useCreateInventoryPurchaseOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createInventoryPurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'variants'] });
    },
  });
};

export const useDeleteInventoryPurchaseOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteInventoryPurchaseOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'variants'] });
    },
  });
};
