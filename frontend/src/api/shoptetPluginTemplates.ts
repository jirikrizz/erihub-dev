import api from './client';

export type ShoptetPluginTemplate = {
  id: number;
  name: string;
  plugin_type: 'banner' | 'function';
  language: string | null;
  description: string | null;
  goal: string;
  shoptet_surface: string | null;
  data_sources: string | null;
  additional_notes: string | null;
  brand_primary_color: string | null;
  brand_secondary_color: string | null;
  brand_font_family: string | null;
  metadata: Record<string, unknown> | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

export const listPluginTemplates = async () => {
  const { data } = await api.get<{ data: ShoptetPluginTemplate[] }>('/shoptet/plugin-templates');
  return data.data;
};

export const fetchPluginTemplate = async (id: number) => {
  const { data } = await api.get<ShoptetPluginTemplate>(`/shoptet/plugin-templates/${id}`);
  return data;
};

export const createPluginTemplate = async (payload: Partial<ShoptetPluginTemplate>) => {
  const { data } = await api.post<ShoptetPluginTemplate>('/shoptet/plugin-templates', payload);
  return data;
};

export const updatePluginTemplate = async (id: number, payload: Partial<ShoptetPluginTemplate>) => {
  const { data } = await api.put<ShoptetPluginTemplate>(`/shoptet/plugin-templates/${id}`, payload);
  return data;
};

export const deletePluginTemplate = async (id: number) => {
  const { data } = await api.delete<{ message?: string }>(`/shoptet/plugin-templates/${id}`);
  return data;
};
