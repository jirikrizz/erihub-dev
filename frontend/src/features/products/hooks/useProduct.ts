import { useQuery } from '@tanstack/react-query';
import { fetchProduct } from '../../../api/pim';

export const useProduct = (id: string | undefined) =>
  useQuery({
    queryKey: ['product', id],
    queryFn: () => fetchProduct(id!),
    enabled: !!id,
  });
