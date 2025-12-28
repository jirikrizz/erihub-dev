import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createAiCollage,
  editAiImage,
  fetchAiHistory,
  generateAiImage,
  generateAiText,
  generateAiVideo,
  uploadAiImage,
  type PaginatedAiHistory,
} from '../../../api/ai';

export const useGenerateAiText = () =>
  useMutation({
    mutationFn: generateAiText,
  });

export const useGenerateAiImage = () =>
  useMutation({
    mutationFn: generateAiImage,
  });

export const useEditAiImage = () =>
  useMutation({
    mutationFn: editAiImage,
  });

export const useGenerateAiVideo = () =>
  useMutation({
    mutationFn: generateAiVideo,
  });

export const useUploadAiImage = () =>
  useMutation({
    mutationFn: uploadAiImage,
  });

export const useCreateAiCollage = () =>
  useMutation({
    mutationFn: createAiCollage,
  });

export const useAiHistory = (filters: { type?: 'text' | 'image' | 'video'; page?: number }) =>
  useQuery<PaginatedAiHistory>({
    queryKey: ['ai-history', filters],
    queryFn: () => fetchAiHistory(filters),
    placeholderData: (previousData) => previousData,
  });
