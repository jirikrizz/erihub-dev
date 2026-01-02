import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AnalyticsOrders, AnalyticsOrdersParams } from '../../../api/analytics';
import { fetchAnalyticsOrders } from '../../../api/analytics';

type Options = {
  enabled?: boolean;
};

export const useAnalyticsOrders = (params?: AnalyticsOrdersParams, options: Options = {}) =>
  useQuery<AnalyticsOrders>({
    queryKey: ['analytics', 'orders', params ?? {}],
    queryFn: () => fetchAnalyticsOrders(params ?? {}),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    enabled: (options.enabled ?? true) && params !== undefined,
  });
