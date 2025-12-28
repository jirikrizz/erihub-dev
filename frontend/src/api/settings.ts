import api from './client';

export type OpenAiSettings = {
  has_key: boolean;
  last_four: string | null;
};

export const fetchOpenAiSettings = async () => {
  const { data } = await api.get<OpenAiSettings>('/settings/openai');
  return data;
};

export const updateOpenAiSettings = async (payload: { key: string | null }) => {
  const { data } = await api.post<OpenAiSettings>('/settings/openai', payload);
  return data;
};

export type SlackSettings = {
  has_token: boolean;
  last_four: string | null;
  enabled: boolean;
  default_channel: string | null;
};

export type SlackSettingsPayload = {
  token?: string | null;
  enabled?: boolean;
  default_channel?: string | null;
};

export const fetchSlackSettings = async () => {
  const { data } = await api.get<SlackSettings>('/settings/slack');
  return data;
};

export const updateSlackSettings = async (payload: SlackSettingsPayload) => {
  const { data } = await api.post<SlackSettings>('/settings/slack', payload);
  return data;
};

export type GoogleAiSettings = {
  has_key: boolean;
  last_four: string | null;
  model: string | null;
};

export const fetchGoogleAiSettings = async () => {
  const { data } = await api.get<GoogleAiSettings>('/settings/google-ai');
  return data;
};

export const updateGoogleAiSettings = async (payload: { key: string | null }) => {
  const { data } = await api.post<GoogleAiSettings>('/settings/google-ai', payload);
  return data;
};

export type ElogistSettings = {
  wsdl: string | null;
  location: string | null;
  project_id: string | null;
  login: string | null;
  has_password: boolean;
  password_last_four: string | null;
  using_env_defaults?: {
    wsdl?: boolean;
    location?: boolean;
    project_id?: boolean;
    login?: boolean;
    password?: boolean;
  };
};

export type ElogistSettingsPayload = {
  wsdl?: string | null;
  location?: string | null;
  project_id?: string | null;
  login?: string | null;
  password?: string | null;
};

export const fetchElogistSettings = async () => {
  const { data } = await api.get<ElogistSettings>('/settings/elogist');
  return data;
};

export const updateElogistSettings = async (payload: ElogistSettingsPayload) => {
  const { data } = await api.post<ElogistSettings>('/settings/elogist', payload);
  return data;
};

export type AnalyticsSettings = {
  default_range: string;
  compare_enabled: boolean;
  visible_metrics: string[];
  rfm_thresholds: {
    recency: number[];
    frequency: number[];
    monetary: number[];
  };
};

export type OrderStatusMapping = {
  completed: string[];
  returned: string[];
  complaint: string[];
  cancelled: string[];
  available_statuses: string[];
};

export type OrderStatusMappingPayload = {
  completed: string[];
  returned: string[];
  complaint: string[];
  cancelled: string[];
};

export type CustomerTagLabels = {
  registered: string;
  guest: string;
  company: string;
  vip: string;
};

export type CustomerTagAliases = {
  registered: string[];
  guest: string[];
  company: string[];
};

export type CustomerSettings = {
  auto_create_guest: boolean;
  auto_register_guest: boolean;
  group_labels: CustomerTagLabels;
  group_aliases: CustomerTagAliases;
};

export type InventoryNotificationVariantSummary = {
  id: string;
  code: string;
  sku: string | null;
  name: string | null;
  stock: number | null;
  min_stock_supply: number | null;
  stock_status: 'in_stock' | 'low_stock' | 'sold_out' | 'unknown';
  unit: string | null;
  product: {
    id: string | null;
    sku: string | null;
    name: string | null;
  };
  shop: {
    id: number | null;
    name: string | null;
  };
};

export type InventoryNotificationSettings = {
  low_stock_threshold: number;
  watch_variant_ids: string[];
  watch_variants: InventoryNotificationVariantSummary[];
};

export type InventoryNotificationSettingsPayload = {
  low_stock_threshold?: number | null;
  watch_variant_ids?: string[];
};

export const fetchAnalyticsSettings = async () => {
  const { data } = await api.get<AnalyticsSettings>('/settings/analytics');
  return data;
};

export const updateAnalyticsSettings = async (payload: Partial<AnalyticsSettings>) => {
  const { data } = await api.post<AnalyticsSettings>('/settings/analytics', payload);
  return data;
};

export const fetchOrderStatusMapping = async () => {
  const { data } = await api.get<OrderStatusMapping>('/settings/orders-status-mapping');
  return data;
};

export const updateOrderStatusMapping = async (payload: OrderStatusMappingPayload) => {
  const { data } = await api.post<OrderStatusMapping>('/settings/orders-status-mapping', payload);
  return data;
};

export const fetchCustomerSettings = async () => {
  const { data } = await api.get<CustomerSettings>('/settings/customers');
  return data;
};

export const updateCustomerSettings = async (payload: Partial<CustomerSettings>) => {
  const { data } = await api.post<CustomerSettings>('/settings/customers', payload);
  return data;
};

export const fetchInventoryNotificationSettings = async () => {
  const { data } = await api.get<InventoryNotificationSettings>('/settings/inventory-notifications');
  return data;
};

export const updateInventoryNotificationSettings = async (
  payload: InventoryNotificationSettingsPayload
) => {
  const { data } = await api.post<InventoryNotificationSettings>('/settings/inventory-notifications', payload);
  return data;
};

export type UserPreferenceResponse<T = unknown> = {
  key: string;
  value: T | null;
  updated_at: string | null;
};

export const fetchUserPreference = async <T = unknown>(key: string) => {
  const encoded = encodeURIComponent(key);
  const { data } = await api.get<UserPreferenceResponse<T>>(`/settings/user-preferences/${encoded}`);
  return data;
};

export const updateUserPreference = async <T = unknown>(key: string, value: T | null) => {
  const encoded = encodeURIComponent(key);
  const { data } = await api.post<UserPreferenceResponse<T>>(`/settings/user-preferences/${encoded}`, {
    value,
  });
  return data;
};

export const deleteUserPreference = async <T = unknown>(key: string) => {
  const encoded = encodeURIComponent(key);
  const { data } = await api.delete<UserPreferenceResponse<T>>(`/settings/user-preferences/${encoded}`);
  return data;
};

export type InventoryForecastProfile = {
  seasonality: 'none' | 'moderate' | 'peaks';
  cashflow_strategy: 'conserve' | 'balanced' | 'invest';
  growth_focus: 'stabilize' | 'grow' | 'expand';
  notes: string | null;
};

export const fetchInventoryForecastProfile = async () => {
  const { data } = await api.get<InventoryForecastProfile>('/settings/inventory-forecast-profile');
  return data;
};

export const updateInventoryForecastProfile = async (payload: InventoryForecastProfile) => {
  const { data } = await api.post<InventoryForecastProfile>('/settings/inventory-forecast-profile', payload);
  return data;
};

export type InventoryRecommendationSettings = {
  descriptors: Record<string, number>;
  filters: Record<string, number>;
  related_products: Record<string, number>;
  stock: {
    must_have_stock: boolean;
    weight: number;
  };
  sales: {
    last_30_quantity_weight: number;
    last_90_quantity_weight: number;
  };
  price: {
    allowed_diff_percent: number;
    match_weight: number;
    cheaper_bonus: number;
  };
  candidate_limit: number;
};

export const fetchInventoryRecommendationSettings = async () => {
  const { data } = await api.get<InventoryRecommendationSettings>('/settings/inventory-recommendations');
  return data;
};

export const updateInventoryRecommendationSettings = async (
  payload: Partial<InventoryRecommendationSettings>
) => {
  const { data } = await api.post<InventoryRecommendationSettings>('/settings/inventory-recommendations', payload);
  return data;
};
