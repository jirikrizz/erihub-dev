import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchProducts } from '../../../api/pim';

export const useProducts = (params: Record<string, unknown>) =>
  useQuery({
    queryKey: ['products', params],
    queryFn: () => fetchProducts(params),
    placeholderData: keepPreviousData,
  });
