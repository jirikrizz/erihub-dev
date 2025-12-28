import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createShopCategoryNode,
  deleteShopCategoryNode,
  pushShopCategoryNodeDescription,
  syncShopCategoryNodes,
  updateShopCategoryNode,
  type PushShopCategoryNodePayload,
  type PushShopCategoryNodeResponse,
  type ShopCategoryNodeResponse,
} from '../../../api/pim';

const invalidateCategoryQueries = (queryClient: ReturnType<typeof useQueryClient>, shopId: number) => {
  queryClient.invalidateQueries({ queryKey: ['pim', 'category-tree'] });
  queryClient.invalidateQueries({
    queryKey: ['pim', 'shop-category-nodes'],
    predicate: (query) => {
      const params = Array.isArray(query.queryKey) ? query.queryKey[2] : undefined;
      if (!params || typeof params !== 'object') {
        return false;
      }

      return (params as Record<string, unknown>).shop_id === shopId;
    },
  });
};

export const useSyncShopCategories = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncShopCategoryNodes,
    onSuccess: (_, variables) => {
      invalidateCategoryQueries(queryClient, variables.shop_id);
    },
  });
};

export const useCreateShopCategoryNode = () => {
  const queryClient = useQueryClient();

  return useMutation<ShopCategoryNodeResponse, unknown, Parameters<typeof createShopCategoryNode>[0]>({
    mutationFn: createShopCategoryNode,
    onSuccess: (_, variables) => {
      invalidateCategoryQueries(queryClient, variables.shop_id);
    },
  });
};

export const useUpdateShopCategoryNode = () => {
  const queryClient = useQueryClient();

  return useMutation<ShopCategoryNodeResponse, unknown, { id: string } & Parameters<typeof updateShopCategoryNode>[1]>({
    mutationFn: ({ id, ...payload }) => updateShopCategoryNode(id, payload),
    onSuccess: (_, variables) => {
      invalidateCategoryQueries(queryClient, variables.shop_id);
    },
  });
};

export const useDeleteShopCategoryNode = () => {
  const queryClient = useQueryClient();

  return useMutation<unknown, unknown, { id: string; shop_id: number }>({
    mutationFn: ({ id, shop_id }) => deleteShopCategoryNode(id, { shop_id }),
    onSuccess: (_, variables) => {
      invalidateCategoryQueries(queryClient, variables.shop_id);
    },
  });
};

export const usePushShopCategoryNodeDescription = () => {
  const queryClient = useQueryClient();

  return useMutation<
    PushShopCategoryNodeResponse,
    unknown,
    { id: string } & PushShopCategoryNodePayload
  >({
    mutationFn: ({ id, ...payload }) => pushShopCategoryNodeDescription(id, payload),
    onSuccess: (_, variables) => {
      invalidateCategoryQueries(queryClient, variables.shop_id);
    },
  });
};
