import { useQuery } from '@tanstack/react-query';
import { fetchTranslation } from '../../../api/pim';

export const useTranslation = (
  productId: string | undefined,
  locale: string | undefined,
  shopId: number | null | undefined
) =>
  useQuery({
    queryKey: ['translation', productId, locale, shopId],
    queryFn: () => fetchTranslation(productId!, locale!, shopId),
    enabled: !!productId && !!locale && shopId !== undefined,
  });
