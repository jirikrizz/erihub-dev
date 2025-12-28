import { useMutation } from '@tanstack/react-query';
import {
  generateCategoryContent,
  type GenerateCategoryContentPayload,
  type GenerateCategoryContentResponse,
} from '../../../api/pim';

export const useGenerateCategoryContent = () =>
  useMutation<GenerateCategoryContentResponse, unknown, GenerateCategoryContentPayload>({
    mutationFn: generateCategoryContent,
  });
