import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchAutomationStatus } from '../../../api/automation';

export const useAutomationStatus = () =>
  useQuery({
    queryKey: ['automation-status'],
    queryFn: fetchAutomationStatus,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
