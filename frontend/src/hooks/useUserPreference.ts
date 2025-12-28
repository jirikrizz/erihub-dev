import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteUserPreference,
  fetchUserPreference,
  type UserPreferenceResponse,
  updateUserPreference,
} from '../api/settings';

export const useUserPreference = <T = unknown>(key: string) => {
  const queryClient = useQueryClient();

  const query = useQuery<UserPreferenceResponse<T>>({
    queryKey: ['user-preference', key],
    queryFn: () => fetchUserPreference<T>(key),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const saveMutation = useMutation<UserPreferenceResponse<T>, Error, T | null>({
    mutationFn: (value) => updateUserPreference<T>(key, value),
    onSuccess: (data) => {
      queryClient.setQueryData(['user-preference', key], data);
    },
  });

  const clearMutation = useMutation<UserPreferenceResponse<T>, Error>({
    mutationFn: () => deleteUserPreference<T>(key),
    onSuccess: (data) => {
      queryClient.setQueryData(['user-preference', key], data);
    },
  });

  const save = useCallback(
    (value: T | null) => {
      saveMutation.mutate(value);
    },
    [saveMutation]
  );

  const clear = useCallback(() => {
    clearMutation.mutate();
  }, [clearMutation]);

  return {
    data: query.data,
    value: query.data?.value ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ?? saveMutation.error ?? clearMutation.error ?? null,
    save,
    clear,
    isSaving: saveMutation.isPending,
    isClearing: clearMutation.isPending,
    refetch: query.refetch,
  };
};
