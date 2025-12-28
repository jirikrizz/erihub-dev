import api from './client';
import type { SectionKey } from '../app/sections';

export type AdminUser = {
  id: number;
  name: string;
  email: string;
  roles: Array<{ id: number; name: string }>;
  sections: SectionKey[];
};

export type PaginatedUsers = {
  data: AdminUser[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export const listUsers = async () => {
  const { data } = await api.get<PaginatedUsers>('/admin/users');
  return data;
};

export const createUser = async (payload: {
  name: string;
  email: string;
  password: string;
  roles?: string[];
  sections?: SectionKey[];
}) => {
  const { data } = await api.post<AdminUser>('/admin/users', payload);
  return data;
};

export const updateUser = async (
  userId: number,
  payload: {
    name?: string;
    email?: string;
    password?: string;
    roles?: string[];
    sections?: SectionKey[];
  }
) => {
  const { data } = await api.patch<AdminUser>(`/admin/users/${userId}`, payload);
  return data;
};

export const deleteUser = async (userId: number) => {
  await api.delete(`/admin/users/${userId}`);
};

export type AdminSectionOption = {
  key: SectionKey;
  label: string;
  description: string;
  permission: string;
};

export const listSections = async () => {
  const { data } = await api.get<AdminSectionOption[]>('/admin/sections');
  return data;
};

export type AdminRoleOption = {
  id: number;
  name: string;
};

export const listRoles = async () => {
  const { data } = await api.get<AdminRoleOption[]>('/admin/roles');
  return data;
};
