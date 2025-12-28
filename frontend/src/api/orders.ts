import api from './client';
import type { Paginated } from './inventory';
import type { CustomerAccount } from './customers';

export type OrderItem = {
  id: string;
  product_guid: string | null;
  item_type: string | null;
  name: string;
  variant_name: string | null;
  code: string | null;
  ean: string | null;
  amount: number | null;
  amount_unit: string | null;
  price_with_vat: number | null;
  price_without_vat: number | null;
  vat: number | null;
  vat_rate: number | null;
  variant_id?: string | null;
  data?: Record<string, unknown> | null;
};

export type OrderCustomer = {
  id: string;
  guid: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  customer_group: string | null;
  price_list: string | null;
  created_at_remote: string | null;
  accounts?: CustomerAccount[];
};

export type Order = {
  id: string;
  code: string;
  guid: string;
  customer_guid: string | null;
  status: string | null;
  source: string | null;
  external_id?: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  ordered_at: string | null;
  ordered_at_local?: string | null;
  total_with_vat: number | null;
  total_without_vat: number | null;
  total_vat: number | null;
  total_with_vat_base?: number | null;
  total_without_vat_base?: number | null;
  total_vat_base?: number | null;
  currency_code: string | null;
  price: Record<string, unknown> | null;
  billing_address: Record<string, unknown> | null;
  delivery_address: Record<string, unknown> | null;
  payment: Record<string, unknown> | null;
  shipping: Record<string, unknown> | null;
  data: Record<string, unknown> | null;
  items?: OrderItem[];
  customer?: OrderCustomer | null;
  shop?: {
    id: number;
    name: string;
    is_master: boolean;
    currency_code: string | null;
    timezone?: string | null;
    provider?: string | null;
  } | null;
  shop_provider?: string | null;
};

export const fetchOrders = async (params: Record<string, unknown> = {}) => {
  const { data } = await api.get<Paginated<Order>>('/orders', { params });
  return data;
};

export const fetchOrder = async (id: string) => {
  const { data } = await api.get<Order>(`/orders/${id}`);
  return data;
};

export type SyncOrdersResult = {
  message?: string;
};

export const syncOrders = async (shopId: number, payload: Record<string, unknown> = {}) => {
  const { data } = await api.post<SyncOrdersResult>(
    `/shoptet/shops/${shopId}/sync/orders`,
    payload
  );

  return data;
};

export type OrderFilters = {
  statuses: string[];
  base_currency: string;
};

export const fetchOrderFilters = async () => {
  const { data } = await api.get<OrderFilters>('/orders/filters');
  return data;
};
