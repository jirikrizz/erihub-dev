import { useMutation } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { login } from '../../../api/auth';
import { useAuthStore } from '../store';

export const useLogin = () =>
  useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      useAuthStore.getState().setAuth(data);
      notifications.show({
        message: 'Přihlášení proběhlo úspěšně',
        color: 'green',
      });
    },
  });
