import api from './client';

export type CustomerTagRuleCondition = {
  field: string;
  operator: string;
  value?: unknown;
  type: 'number' | 'string' | 'datetime' | 'boolean';
};

export type CustomerTagRule = {
  id: string;
  tag_key: string;
  label: string;
  color: string;
  priority: number;
  is_active: boolean;
  match_type: 'all' | 'any';
  set_vip: boolean;
  description: string | null;
  conditions: CustomerTagRuleCondition[];
  metadata?: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type CustomerTagRuleFieldDefinition = {
  value: string;
  label: string;
  type: 'number' | 'string' | 'datetime' | 'boolean';
  operators: string[];
  description?: string;
  options?: Array<{ value: string; label: string }>;
};

export type ListCustomerTagRulesResponse = {
  data: CustomerTagRule[];
  meta: {
    fields: CustomerTagRuleFieldDefinition[];
  };
};

export const listCustomerTagRules = async () => {
  const { data } = await api.get<ListCustomerTagRulesResponse>('/customers/tag-rules');
  return data;
};

export const createCustomerTagRule = async (payload: Partial<CustomerTagRule>) => {
  const { data } = await api.post<CustomerTagRule>('/customers/tag-rules', payload);
  return data;
};

export const updateCustomerTagRule = async (id: string, payload: Partial<CustomerTagRule>) => {
  const { data } = await api.put<CustomerTagRule>(`/customers/tag-rules/${id}`, payload);
  return data;
};

export const deleteCustomerTagRule = async (id: string) => {
  await api.delete(`/customers/tag-rules/${id}`);
};
