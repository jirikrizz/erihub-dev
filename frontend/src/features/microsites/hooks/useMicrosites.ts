import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createMicrosite,
  deleteMicrosite,
  exportMicrosite,
  fetchMicrosite,
  generateMicrositeAi,
  listMicrosites,
  publishMicrosite,
  previewMicrositeProduct,
  unpublishMicrosite,
  updateMicrosite,
  uploadMicrositeAsset,
} from '../../../api/microsites';

export const useMicrosites = (params: Record<string, unknown>) =>
  useQuery({
    queryKey: ['microsites', params],
    queryFn: () => listMicrosites(params),
    placeholderData: keepPreviousData,
  });

export const useMicrosite = (id: string | undefined) =>
  useQuery({
    queryKey: ['microsites', 'detail', id],
    queryFn: () => fetchMicrosite(id!),
    enabled: Boolean(id),
  });

export const useCreateMicrosite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createMicrosite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['microsites'] });
    },
  });
};

export const useUpdateMicrosite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateMicrosite>[1] }) =>
      updateMicrosite(id, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['microsites'] });
      queryClient.invalidateQueries({ queryKey: ['microsites', 'detail', variables.id] });
    },
  });
};

export const useDeleteMicrosite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteMicrosite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['microsites'] });
    },
  });
};

export const usePublishMicrosite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: publishMicrosite,
    onSuccess: (payload) => {
      queryClient.invalidateQueries({ queryKey: ['microsites'] });
      const micrositeId = payload?.microsite?.id;
      if (micrositeId) {
        queryClient.invalidateQueries({ queryKey: ['microsites', 'detail', micrositeId] });
      }
    },
  });
};

export const useUnpublishMicrosite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: unpublishMicrosite,
    onSuccess: (microsite) => {
      queryClient.invalidateQueries({ queryKey: ['microsites'] });
      queryClient.invalidateQueries({ queryKey: ['microsites', 'detail', microsite.id] });
    },
  });
};

export const useExportMicrosite = () => useMutation({ mutationFn: exportMicrosite });

export const usePreviewMicrositeProduct = () =>
  useMutation({
    mutationFn: previewMicrositeProduct,
  });

export const useUploadMicrositeAsset = () =>
  useMutation({
    mutationFn: uploadMicrositeAsset,
  });

export const useGenerateMicrositeAi = () =>
  useMutation({
    mutationFn: generateMicrositeAi,
  });
