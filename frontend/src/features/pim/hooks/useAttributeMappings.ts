import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAttributeMappings,
  saveAttributeMappings,
  suggestAttributeMappings,
  syncAttributeOptions,
  type AttributeMappingType,
} from '../../../api/pim';

type UseAttributeMappingParams = {
  masterShopId: number | null;
  targetShopId: number | null;
  type: AttributeMappingType;
};

export const useAttributeMappings = ({ masterShopId, targetShopId, type }: UseAttributeMappingParams) =>
  useQuery({
    queryKey: ['attribute-mappings', masterShopId, targetShopId, type],
    enabled: !!masterShopId && !!targetShopId,
    queryFn: () =>
      fetchAttributeMappings({
        master_shop_id: masterShopId!,
        target_shop_id: targetShopId!,
        type,
      }),
    placeholderData: (previous) => previous,
  });

export const useSaveAttributeMappings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveAttributeMappings,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['attribute-mappings', variables.master_shop_id, variables.target_shop_id, variables.type],
      });
    },
  });
};

export const useAttributeMappingAiSuggest = () =>
  useMutation({
    mutationFn: suggestAttributeMappings,
  });

export const useSyncAttributeOptions = () =>
  useMutation({
    mutationFn: syncAttributeOptions,
  });
