import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchInventoryRecommendationSettings,
  updateInventoryRecommendationSettings,
  type InventoryRecommendationSettings,
} from '../../../api/settings';

const queryKey = ['settings', 'inventory', 'recommendations'];

export const useInventoryRecommendationSettings = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey,
    queryFn: fetchInventoryRecommendationSettings,
  });

  const mutation = useMutation({
    mutationFn: updateInventoryRecommendationSettings,
    onSuccess: (result) => {
      queryClient.setQueryData<InventoryRecommendationSettings>(queryKey, result);
    },
  });

  return {
    query,
    mutation,
  };
};
