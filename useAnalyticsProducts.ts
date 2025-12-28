import { useQuery } from '@tanstack/react-query';
import type { AnalyticsProductsParams, AnalyticsProductsResponse } from '../../../api/analytics';
import { fetchAnalyticsProducts } from '../../../api/analytics';

type Options = {
  enabled?: boolean;
};

export const useAnalyticsProducts = (params?: AnalyticsProductsParams, options: Options = {}) =>
  useQuery<AnalyticsProductsResponse>({
    queryKey: ['analytics', 'products', params ?? {}],
    queryFn: () => fetchAnalyticsProducts(params ?? {}),
    staleTime: 1000 * 60,
    enabled: options.enabled ?? true,
  });
