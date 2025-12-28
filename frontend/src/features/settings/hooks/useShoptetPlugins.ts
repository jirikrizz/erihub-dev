import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  downloadShoptetPluginVersion,
  createCountdownPlugin,
  createSnowfallPlugin,
  createAdventCalendarPlugin,
  createAutoWidgetPlugin,
  listPluginFlags,
  fetchShoptetPluginVersion,
  fetchShoptetPluginVersions,
  listShoptetPlugins,
  updateShoptetPlugin,
  deleteShoptetPlugin,
  type ShoptetPluginListResponse,
  type ShoptetPluginVersionDetail,
  type ShoptetPluginVersion,
  type CountdownPluginPayload,
  type SnowfallPluginPayload,
  type AdventCalendarPluginPayload,
  type AutoWidgetPluginPayload,
} from '../../../api/shoptetPlugins';

export const useShoptetPlugins = (params?: Record<string, unknown>) =>
  useQuery<ShoptetPluginListResponse>({
    queryKey: ['shoptet', 'plugins', params ?? null],
    queryFn: () => listShoptetPlugins(params ?? {}),
  });

export const useShoptetPluginVersions = (pluginId: number | null) =>
  useQuery<ShoptetPluginVersion[]>({
    queryKey: ['shoptet', 'plugins', pluginId, 'versions'],
    enabled: pluginId !== null,
    queryFn: () => fetchShoptetPluginVersions(pluginId as number),
  });

export const useShoptetPluginVersion = (versionId: number | null) =>
  useQuery<ShoptetPluginVersionDetail>({
    queryKey: ['shoptet', 'plugin-version', versionId],
    enabled: versionId !== null,
    queryFn: () => fetchShoptetPluginVersion(versionId as number),
  });

export const useDownloadShoptetPluginVersion = () =>
  useMutation({
    mutationFn: (versionId: number) => downloadShoptetPluginVersion(versionId),
  });

export const useUpdateShoptetPlugin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => updateShoptetPlugin(id, { name }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'plugins'] });
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'plugins', variables.id] });
    },
  });
};

export const useDeleteShoptetPlugin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteShoptetPlugin(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'plugins'] });
      queryClient.removeQueries({ queryKey: ['shoptet', 'plugins', id] });
    },
  });
};

export const useShoptetPluginFlags = (shopId: number | null) =>
  useQuery({
    queryKey: ['shoptet', 'plugins', 'flags', shopId],
    enabled: !!shopId,
    placeholderData: (previous) => previous,
    queryFn: () => listPluginFlags(shopId as number),
  });

export const useCreateCountdownPlugin = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CountdownPluginPayload) => createCountdownPlugin(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'plugins'] });
    },
  });
};

export const useCreateSnowfallPlugin = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SnowfallPluginPayload) => createSnowfallPlugin(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'plugins'] });
    },
  });
};

export const useCreateAdventCalendarPlugin = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AdventCalendarPluginPayload) => createAdventCalendarPlugin(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'plugins'] });
    },
  });
};

export const useCreateAutoWidgetPlugin = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AutoWidgetPluginPayload) => createAutoWidgetPlugin(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'plugins'] });
    },
  });
};
