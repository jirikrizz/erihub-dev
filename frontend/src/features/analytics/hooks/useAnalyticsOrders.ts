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
    placeholderData: keepPreviousData,
    enabled: (options.enabled ?? true) && params !== undefined,
  });
