import { useMutation } from '@tanstack/react-query';
import {
  translateCategoryContent,
  type TranslateCategoryContentPayload,
  type TranslateCategoryContentResponse,
} from '../../../api/pim';

export const useTranslateCategoryContent = () =>
  useMutation<TranslateCategoryContentResponse, unknown, TranslateCategoryContentPayload>({
    mutationFn: translateCategoryContent,
  });
