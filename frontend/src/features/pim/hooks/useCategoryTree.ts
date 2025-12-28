import { useQuery } from '@tanstack/react-query';
import type { CategoryTreeResponse } from '../../../api/pim';
import { fetchCategoryTree } from '../../../api/pim';

export const useCategoryTree = (params: Record<string, unknown>) =>
  useQuery<CategoryTreeResponse>({
    queryKey: ['pim', 'category-tree', params],
    enabled: Boolean(params?.shop_id),
    queryFn: () => fetchCategoryTree(params),
    placeholderData: (previous) => previous,
  });
