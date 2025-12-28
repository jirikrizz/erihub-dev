import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchElogistSettings,
  fetchGoogleAiSettings,
  fetchOpenAiSettings,
  updateElogistSettings,
  updateGoogleAiSettings,
  updateOpenAiSettings,
} from '../../../api/settings';

export const useOpenAiSettings = () =>
  useQuery({
    queryKey: ['settings', 'openai'],
    queryFn: fetchOpenAiSettings,
  });

export const useUpdateOpenAiSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateOpenAiSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'openai'] });
    },
  });
};

export const useGoogleAiSettings = () =>
  useQuery({
    queryKey: ['settings', 'google-ai'],
    queryFn: fetchGoogleAiSettings,
  });

export const useUpdateGoogleAiSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateGoogleAiSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'google-ai'] });
    },
  });
};

export const useElogistSettings = () =>
  useQuery({
    queryKey: ['settings', 'elogist'],
    queryFn: fetchElogistSettings,
  });

export const useUpdateElogistSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateElogistSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'elogist'] });
    },
  });
};
