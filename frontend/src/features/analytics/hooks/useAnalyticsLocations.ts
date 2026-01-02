import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchAnalyticsLocations, type AnalyticsLocationsParams, type AnalyticsLocationsResponse } from '../../../api/analytics';

type Options = {
  enabled?: boolean;
};

export const useAnalyticsLocations = (params?: AnalyticsLocationsParams, options: Options = {}) =>
  useQuery<AnalyticsLocationsResponse>({
    queryKey: ['analytics', 'locations', params ?? {}],
    queryFn: () => fetchAnalyticsLocations(params ?? {}),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    enabled: (options.enabled ?? true) && params !== undefined,
  });
