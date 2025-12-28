import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SectionKey } from '../../app/sections';
import type { NotificationPreferencesMap } from '../notifications/types';
import { useNotificationStore } from '../notifications/store';

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  roles?: string[];
  sections: SectionKey[];
  notificationPreferences?: NotificationPreferencesMap | null;
  notificationPreferencesUpdatedAt?: string | null;
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  setAuth: (payload: { token: string; user: AuthUser }) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: ({ token, user }) => {
        set({
          token,
          user: {
            ...user,
            roles: user.roles ?? [],
            sections: user.sections ?? [],
          },
        });

        useNotificationStore.getState().hydrateFromServer(user.notificationPreferences ?? null);
      },
      clear: () => {
        set({ token: null, user: null });
        useNotificationStore.getState().reset();
      },
    }),
    {
      name: 'shoptet-hub-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
);
