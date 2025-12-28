import api from './client';

export type WooCommerceConnection = {
  id: number;
  shop_id: number;
  base_url: string;
  api_version: string;
  last_synced_at: string | null;
};

export type WooCommerceShop = {
  id: number;
  name: string;
  domain: string;
  currency_code: string | null;
  timezone: string | null;
  locale: string | null;
  customer_link_shop_id: number | null;
  customer_link_target?: { id: number; name: string | null } | null;
  woocommerce?: WooCommerceConnection | null;
};

export type PaginatedWooCommerceShops = {
  data: WooCommerceShop[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export const listWooCommerceShops = async (params: Record<string, unknown> = {}) => {
  const { data } = await api.get<PaginatedWooCommerceShops>('/woocommerce/shops', { params });
  return data;
};

export const createWooCommerceShop = async (payload: Record<string, unknown>) => {
  const { data } = await api.post<WooCommerceShop>('/woocommerce/shops', payload);
  return data;
};

export const updateWooCommerceShop = async (id: number, payload: Record<string, unknown>) => {
  const { data } = await api.put<WooCommerceShop>(`/woocommerce/shops/${id}`, payload);
  return data;
};

export const deleteWooCommerceShop = async (id: number) => {
  const { data } = await api.delete<{ message?: string }>(`/woocommerce/shops/${id}`);
  return data;
};

export const syncWooCommerceOrders = async (id: number, payload: Record<string, unknown> = {}) => {
  const { data } = await api.post<{ message: string; meta: Record<string, unknown> }>(
    `/woocommerce/shops/${id}/sync/orders`,
    payload
  );

  return data;
};
