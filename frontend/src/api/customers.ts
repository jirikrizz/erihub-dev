import api from './client';
import type { Paginated } from './inventory';

export type CustomerAccount = {
  id: string;
  account_guid: string | null;
  email: string | null;
  phone: string | null;
  main_account: boolean;
  authorized: boolean;
  email_verified: boolean;
};

export type CustomerOrderItem = {
  id: string;
  name: string;
  code: string | null;
  amount: number | null;
  price_with_vat: number | null;
  currency_code?: string | null;
};

export type CustomerOrder = {
  id: string;
  code: string;
  status: string | null;
  ordered_at: string | null;
  ordered_at_local?: string | null;
  total_with_vat: number | null;
  total_with_vat_base?: number | null;
  currency_code: string | null;
  items?: CustomerOrderItem[];
};

export type CustomerNote = {
  id: string;
  note: string;
  created_at: string;
  user: {
    id: string | null;
    name: string | null;
  } | null;
};

export type CustomerBadge = {
  key: string;
  label: string;
  type: 'standard' | 'custom' | 'automatic';
  color?: string | null;
  source?: {
    rule_id: string | null;
    rule_name: string | null;
  } | null;
};

export type CustomerProductInsights = {
  base_currency: string;
  categories: Array<{
    name: string;
    orders: number;
    quantity: number;
    revenue: number;
  }>;
  parameters: Array<{
    name: string;
    values: Array<{
      value: string;
      orders: number;
      quantity: number;
      revenue: number;
    }>;
  }>;
};

export type Customer = {
  id: string;
  guid: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  customer_group: string | null;
  price_list: string | null;
  created_at_remote: string | null;
  updated_at_remote: string | null;
  billing_address: Record<string, unknown> | null;
  delivery_addresses: Record<string, unknown>[] | null;
  accounts?: CustomerAccount[];
  orders?: CustomerOrder[];
  notes?: string | null;
  notes_history?: CustomerNote[];
  orders_count?: number;
  total_spent?: number;
  total_spent_base?: number;
  average_order_value?: number;
  average_order_value_base?: number;
  completed_orders?: number;
  problem_orders?: number;
  first_order_at?: string | null;
  last_order_at?: string | null;
  shop?: {
    id: number;
    name: string;
    domain: string;
    locale: string | null;
    is_master: boolean;
    currency_code?: string | null;
    provider?: string | null;
  } | null;
  shop_name?: string | null;
  shop_provider?: string | null;
  group_key?: string | null;
  group_label?: string | null;
  tag_badges?: CustomerBadge[];
  order_providers?: string[] | null;
  base_currency?: string;
  is_vip?: boolean;
  product_insights?: CustomerProductInsights;
  tags?: string[];
};

export type CustomerTag = {
  id: number;
  name: string;
  color: string | null;
  is_hidden: boolean;
  value: string;
  label: string;
  type?: string;
};

export type PaginatedCustomers = Paginated<Customer> & {
  base_currency: string;
  filters?: {
    countries?: string[];
    tags?: CustomerTag[];
  };
};

export const fetchCustomers = async (params: Record<string, unknown> = {}) => {
  const { data } = await api.get<PaginatedCustomers>('/customers', { params });
  return data;
};

export const fetchVipCustomers = async (params: Record<string, unknown> = {}) => {
  const { data } = await api.get<PaginatedCustomers>('/customers/vip', {
    params,
  });
  return data;
};

export const fetchCustomer = async (id: string) => {
  const { data } = await api.get<Customer>(`/customers/${id}`);
  return data;
};

export const fetchCustomerByGuid = async (guid: string) => {
  const { data } = await api.get<Customer>(`/customers/by-guid/${guid}`);
  return data;
};

export const fetchCustomerByEmail = async (email: string) => {
  const { data } = await api.get<Customer>('/customers/by-email', {
    params: { email },
  });
  return data;
};

export const updateCustomer = async (
  id: string,
  payload: { notes?: string | null; is_vip?: boolean; tags?: string[] }
) => {
  const { data } = await api.patch<Customer>(`/customers/${id}`, payload);
  return data;
};

export const createCustomerNote = async (id: string, note: string) => {
  const { data } = await api.post<CustomerNote>(`/customers/${id}/notes`, { note });
  return data;
};

export const exportCustomersCsv = async (params: Record<string, unknown>) => {
  const response = await api.get<Blob>('/customers/export', {
    params,
    responseType: 'blob',
  });

  return response.data;
};

export const fetchCustomerTags = async (): Promise<CustomerTag[]> => {
  const { data } = await api.get<{ data: CustomerTag[] }>('/customers/tags');
  return data.data ?? [];
};

export type CustomerManualTagOption = {
  value: string;
  label: string;
  type?: string;
};

export const fetchCustomerManualTags = async (): Promise<CustomerManualTagOption[]> => {
  const { data } = await api.get<{ data: CustomerManualTagOption[] }>('/customers/tags/manual');
  return data.data ?? [];
};

export const createCustomerTag = async (payload: {
  name: string;
  color: string | null;
  is_hidden: boolean;
}) => {
  const { data } = await api.post<CustomerTag>('/customers/tags', payload);
  return data;
};

export const updateCustomerTag = async (
  tagId: number,
  payload: { name: string; color: string | null; is_hidden: boolean }
) => {
  const { data } = await api.put<CustomerTag>(`/customers/tags/${tagId}`, payload);
  return data;
};

export const deleteCustomerTag = async (tagId: number) => {
  await api.delete(`/customers/tags/${tagId}`);
};

export type CustomerStats = {
  total_count: number;
  orders_sum: number;
  orders_avg: number;
  clv_sum: number;
  clv_avg: number;
  aov_sum: number;
  aov_avg: number;
};

export const fetchCustomerStats = async (params: Record<string, unknown> = {}) => {
  const { data } = await api.get<CustomerStats>('/customers/stats', { params });
  return data;
};
