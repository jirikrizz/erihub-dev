import { useQuery } from '@tanstack/react-query';
import type { AnalyticsKpis, AnalyticsKpisParams } from '../../../api/analytics';
import { fetchAnalyticsKpis } from '../../../api/analytics';

type Options = {
  enabled?: boolean;
};

export const useAnalyticsKpis = (params?: AnalyticsKpisParams, options: Options = {}) =>
  useQuery<AnalyticsKpis>({
    queryKey: ['analytics', 'kpis', params ?? {}],
    queryFn: () => fetchAnalyticsKpis(params ?? {}),
    staleTime: 1000 * 60,
    enabled: options.enabled ?? true,
  });
