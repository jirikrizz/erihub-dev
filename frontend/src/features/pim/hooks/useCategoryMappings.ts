import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoryMappingRecord, Paginator, ShopCategoryNodeRecord } from '../../../api/pim';
import {
  confirmCategoryMapping,
  fetchCategoryMappings,
  fetchShopCategoryNodes,
  preMapCategoriesWithAi,
  rejectCategoryMapping,
  applyDefaultCategory,
  type CategoryAiPreMapPayload,
  type CategoryAiPreMapResponse,
} from '../../../api/pim';

export const useCategoryMappings = (params: Record<string, unknown>) =>
  useQuery<Paginator<CategoryMappingRecord>>({
    queryKey: ['pim', 'category-mappings', params],
    enabled: Boolean(params?.shop_id),
    queryFn: () => fetchCategoryMappings(params),
    placeholderData: (previous) => previous,
  });

export const useShopCategoryNodes = (params: Record<string, unknown>) =>
  useQuery<Paginator<ShopCategoryNodeRecord>>({
    queryKey: ['pim', 'shop-category-nodes', params],
    enabled: Boolean(params?.shop_id),
    queryFn: () => fetchShopCategoryNodes(params),
    placeholderData: (previous) => previous,
  });

export const useConfirmCategoryMapping = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: { shop_id: number } & Parameters<typeof confirmCategoryMapping>[0]) => {
      const { shop_id: _shopId, ...payload } = variables;
      void _shopId;
      return confirmCategoryMapping(payload);
    },
    onSuccess: (_, { shop_id }) => {
      queryClient.invalidateQueries({ queryKey: ['pim', 'category-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['pim', 'category-tree'] });
      queryClient.invalidateQueries({
        queryKey: ['pim', 'shop-category-nodes'],
        predicate: (query) => {
          const params = Array.isArray(query.queryKey) ? query.queryKey[2] : undefined;
          if (!params || typeof params !== 'object') {
            return false;
          }

          return (params as Record<string, unknown>).shop_id === shop_id;
        },
      });
    },
  });
};

export const useRejectCategoryMapping = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: rejectCategoryMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pim', 'category-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['pim', 'category-tree'] });
    },
  });
};

export const useAiPreMapCategories = () =>
  useMutation<CategoryAiPreMapResponse, unknown, CategoryAiPreMapPayload>({
    mutationFn: preMapCategoriesWithAi,
  });

export const useApplyDefaultCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: applyDefaultCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pim', 'category-default-validation'] });
      queryClient.invalidateQueries({ queryKey: ['pim', 'category-tree'] });
    },
  });
};
