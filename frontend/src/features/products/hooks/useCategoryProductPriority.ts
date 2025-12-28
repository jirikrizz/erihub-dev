import { useQuery } from '@tanstack/react-query';
import { fetchCategoryProductsPriority, type CategoryProductPriorityResponse } from '../../../api/pim';

export const useCategoryProductPriority = (
  params: {
    shop_id?: number | null;
    category_guid?: string | null;
    page?: number;
    per_page?: number;
  },
  options: { enabled?: boolean } = {}
) => {
  const enabled = options.enabled ?? Boolean(params.shop_id && params.category_guid);

  return useQuery<CategoryProductPriorityResponse>({
    queryKey: ['category-priority', params],
    enabled,
    queryFn: () =>
      fetchCategoryProductsPriority({
        shop_id: params.shop_id as number,
        category_guid: params.category_guid as string,
        page: params.page,
        per_page: params.per_page,
      }),
    placeholderData: (previous) => previous,
  });
};
