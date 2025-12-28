import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createPluginTemplate,
  deletePluginTemplate,
  fetchPluginTemplate,
  listPluginTemplates,
  updatePluginTemplate,
  type ShoptetPluginTemplate,
} from '../../../api/shoptetPluginTemplates';

export const usePluginTemplates = () =>
  useQuery({
    queryKey: ['shoptet', 'plugin-templates'],
    queryFn: () => listPluginTemplates(),
  });

export const usePluginTemplate = (id: number | null) =>
  useQuery({
    queryKey: ['shoptet', 'plugin-templates', id],
    enabled: id !== null,
    queryFn: () => fetchPluginTemplate(id as number),
  });

export const useCreatePluginTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Partial<ShoptetPluginTemplate>) => createPluginTemplate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'plugin-templates'] });
    },
  });
};

export const useUpdatePluginTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<ShoptetPluginTemplate> }) =>
      updatePluginTemplate(id, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'plugin-templates'] });
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'plugin-templates', variables.id] });
    },
  });
};

export const useDeletePluginTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deletePluginTemplate(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'plugin-templates'] });
      queryClient.removeQueries({ queryKey: ['shoptet', 'plugin-templates', id] });
    },
  });
};
