import { useMutation } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import api from '../../../api/client';
import { useAuthStore } from '../store';

export const useLogout = () =>
  useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout');
    },
    onSuccess: () => {
      useAuthStore.getState().clear();
      notifications.show({ message: 'Odhlášení úspěšné', color: 'green' });
    },
    onError: () => {
      useAuthStore.getState().clear();
    },
  });
