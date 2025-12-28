import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createShop,
  deleteShop,
  downloadWebhookJob,
  fetchJobFinishedWebhookStatus,
  listShops,
  listSnapshotExecutions,
  listWebhookJobs,
  refreshShopToken,
  registerJobFinishedWebhook,
  requestCustomerSnapshot,
  requestOrderSnapshot,
  requestProductSnapshot,
  updateShop,
} from '../../../api/shops';

export const useShops = (params: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: ['shoptet', 'shops', params],
    queryFn: () => listShops(params),
  });

export const useCreateShop = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createShop,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'shops'] });
    },
  });
};

export const useUpdateShop = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      updateShop(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'shops'] });
    },
  });
};

export const useDeleteShop = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteShop(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'shops'] });
    },
  });
};

export const useRefreshShopToken = () => {
  return useMutation({
    mutationFn: (id: number) => refreshShopToken(id),
  });
};

export const useWebhookJobs = (shopId: number | null) =>
  useQuery({
    queryKey: ['shoptet', 'webhook-jobs', shopId],
    enabled: !!shopId,
    queryFn: () => listWebhookJobs(shopId!),
    placeholderData: (previous) => previous,
  });

export const useSnapshotExecutions = (shopId: number | null) =>
  useQuery({
    queryKey: ['shoptet', 'pipelines', shopId],
    enabled: !!shopId,
    queryFn: () => listSnapshotExecutions(shopId!),
    placeholderData: (previous) => previous,
  });

export const useDownloadWebhookJob = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shopId, jobId }: { shopId: number; jobId: string }) =>
      downloadWebhookJob(shopId, jobId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'webhook-jobs', variables.shopId] });
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'shops'] });
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'pipelines', variables.shopId] });
    },
  });
};

export const useRequestProductSnapshot = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shopId, payload }: { shopId: number; payload?: Record<string, unknown> }) =>
      requestProductSnapshot(shopId, payload ?? {}),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'webhook-jobs', variables.shopId] });
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'pipelines', variables.shopId] });
    },
  });
};

export const useRequestOrderSnapshot = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shopId, payload }: { shopId: number; payload?: Record<string, unknown> }) =>
      requestOrderSnapshot(shopId, payload ?? {}),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'webhook-jobs', variables.shopId] });
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'pipelines', variables.shopId] });
    },
  });
};

export const useRequestCustomerSnapshot = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shopId, payload }: { shopId: number; payload?: Record<string, unknown> }) =>
      requestCustomerSnapshot(shopId, payload ?? {}),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'webhook-jobs', variables.shopId] });
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'pipelines', variables.shopId] });
    },
  });
};

export const useJobFinishedWebhookStatus = (shopId: number | null) =>
  useQuery({
    queryKey: ['shoptet', 'shops', shopId, 'webhook', 'job-finished'],
    enabled: !!shopId,
    queryFn: () => fetchJobFinishedWebhookStatus(shopId!),
    placeholderData: (previous) => previous,
    staleTime: 60 * 1000,
    retry: 1,
  });

export const useRegisterJobFinishedWebhook = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shopId: number) => registerJobFinishedWebhook(shopId),
    onSuccess: (_, shopId) => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'shops', shopId, 'webhook', 'job-finished'] });
    },
  });
};
