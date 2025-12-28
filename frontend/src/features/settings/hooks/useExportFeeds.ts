import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createExportFeedLink,
  deleteExportFeedLink,
  listExportFeedLinks,
  listExportFeedOptions,
  type CreateExportFeedPayload,
} from '../../../api/exportFeeds';

export const useExportFeedOptions = () =>
  useQuery({
    queryKey: ['settings', 'export-feeds', 'options'],
    queryFn: listExportFeedOptions,
  });

export const useExportFeedLinks = () =>
  useQuery({
    queryKey: ['settings', 'export-feeds', 'links'],
    queryFn: listExportFeedLinks,
  });

export const useCreateExportFeedLink = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateExportFeedPayload) => createExportFeedLink(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'export-feeds', 'links'] });
    },
  });
};

export const useDeleteExportFeedLink = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteExportFeedLink(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'export-feeds', 'links'] });
    },
  });
};
