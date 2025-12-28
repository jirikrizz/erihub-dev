import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchCategoryDefaultValidation, type CategoryDefaultCategoryValidationResponse } from '../../../api/pim';

export const useCategoryDefaultValidation = (params: Record<string, unknown>) =>
  useQuery<CategoryDefaultCategoryValidationResponse>({
    queryKey: ['pim', 'category-default-validation', params],
    queryFn: () => fetchCategoryDefaultValidation(params),
    placeholderData: keepPreviousData,
    enabled: Boolean((params as { shop_id?: number | null }).shop_id),
  });
