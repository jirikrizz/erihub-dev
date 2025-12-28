import api from './client';
import type { AuthUser } from '../features/auth/store';

type LoginPayload = {
  email: string;
  password: string;
  device_name?: string;
};

type LoginResponse = {
  token: string;
  user: AuthUser;
};

export const login = async (payload: LoginPayload): Promise<LoginResponse> => {
  const { data } = await api.post<LoginResponse>('/auth/login', payload);
  return data;
};

export const logout = async (): Promise<void> => {
  await api.post('/auth/logout');
};
