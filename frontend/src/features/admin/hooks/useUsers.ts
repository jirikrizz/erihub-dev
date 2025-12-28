import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createUser,
  deleteUser,
  listRoles,
  listSections,
  listUsers,
  updateUser,
} from '../../../api/admin';

export const useUsers = () =>
  useQuery({
    queryKey: ['admin', 'users'],
    queryFn: listUsers,
  });

export const useCreateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, payload }: { userId: number; payload: Parameters<typeof updateUser>[1] }) =>
      updateUser(userId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
};

export const useSectionOptions = () =>
  useQuery({
    queryKey: ['admin', 'sections'],
    queryFn: listSections,
  });

export const useRoleOptions = () =>
  useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: listRoles,
  });
