import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ShoptetPluginRequest, ShoptetPluginResponse } from '../../../api/shoptetPlugins';
import { generateShoptetPlugin } from '../../../api/shoptetPlugins';

export const useGenerateShoptetPlugin = () => {
  const queryClient = useQueryClient();

  return useMutation<ShoptetPluginResponse, unknown, ShoptetPluginRequest>({
    mutationFn: (payload) => generateShoptetPlugin(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shoptet', 'plugins'] });
    },
  });
};
