import { useQuery } from '@tanstack/react-query';
import { fetchDashboardSummary } from '../../../api/dashboard';
import type { DashboardRangeSelection } from '../../../api/dashboard';

export const useDashboardSummary = (
  range: DashboardRangeSelection,
  shopIds: number[] = [],
  providers: string[] = []
) =>
  useQuery({
    queryKey: ['dashboard', 'summary', range, shopIds, providers],
    queryFn: () =>
      fetchDashboardSummary({
        range,
        ...(shopIds.length > 0 ? { shopIds } : {}),
        ...(providers.length > 0 ? { providers } : {}),
      }),
    staleTime: 60 * 1000,
    placeholderData: (previousData) => previousData,
  });
