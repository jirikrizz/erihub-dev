import { useQuery } from '@tanstack/react-query';
import { fetchDashboardNotes } from '../../../api/dashboard';

export const useDashboardNotes = (limit = 30) =>
  useQuery({
    queryKey: ['dashboard', 'notes', limit],
    queryFn: () => fetchDashboardNotes(limit),
    staleTime: 30 * 1000,
  });
