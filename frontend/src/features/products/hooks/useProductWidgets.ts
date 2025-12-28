import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProductWidget,
  deleteProductWidget,
  fetchProductWidget,
  listProductWidgets,
  updateProductWidget,
  type ProductWidgetUpsertPayload,
} from '../../../api/productWidgets';

export const useProductWidgets = (params: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: ['product-widgets', params],
    queryFn: () => listProductWidgets(params),
    placeholderData: keepPreviousData,
  });

export const useProductWidget = (id: string | undefined) =>
  useQuery({
    queryKey: ['product-widgets', 'detail', id],
    queryFn: () => fetchProductWidget(id!),
    enabled: Boolean(id),
  });

export const useCreateProductWidget = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ProductWidgetUpsertPayload) => createProductWidget(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-widgets'] });
    },
  });
};

export const useUpdateProductWidget = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProductWidgetUpsertPayload }) =>
      updateProductWidget(id, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['product-widgets'] });
      queryClient.invalidateQueries({ queryKey: ['product-widgets', 'detail', variables.id] });
    },
  });
};

export const useDeleteProductWidget = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteProductWidget(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-widgets'] });
    },
  });
};
