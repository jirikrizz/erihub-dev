import api from './client';

export type ShopToken = {
  id: number;
  shop_id: number;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
};

export type WebhookJob = {
  id: string;
  job_id: string;
  event: string | null;
  status: string;
  endpoint: string | null;
  result_url?: string | null;
  snapshot_path: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  processed_at: string | null;
};

export type SnapshotExecution = {
  id: string;
  shop_id: number;
  endpoint: string;
  status: string;
  requested_at: string | null;
  downloaded_at: string | null;
  processed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type Shop = {
  id: number;
  name: string;
  domain: string;
  default_locale: string;
  timezone: string;
  locale: string | null;
  api_mode: 'premium' | 'private' | 'partner';
  is_master: boolean;
  currency_code: string | null;
  settings: Record<string, unknown> | null;
  provider?: string;
  customer_link_shop_id?: number | null;
  token?: ShopToken;
  webhookJobs?: WebhookJob[];
};

export type PaginatedShops = {
  data: Shop[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export const listShops = async (params: Record<string, unknown> = {}) => {
  const { data } = await api.get<PaginatedShops>('/shoptet/shops', { params });
  return data;
};

export const fetchShop = async (id: number) => {
  const { data } = await api.get<Shop>(`/shoptet/shops/${id}`);
  return data;
};

export const createShop = async (payload: Record<string, unknown>) => {
  const { data } = await api.post<Shop>('/shoptet/shops', payload);
  return data;
};

export const updateShop = async (id: number, payload: Record<string, unknown>) => {
  const { data } = await api.put<Shop>(`/shoptet/shops/${id}`, payload);
  return data;
};

export const deleteShop = async (id: number) => {
  const { data } = await api.delete<{ message?: string }>(`/shoptet/shops/${id}`);
  return data;
};

export const refreshShopToken = async (id: number) => {
  const { data } = await api.post<{ data: Record<string, unknown> }>(`/shoptet/shops/${id}/refresh-token`);
  return data;
};

export const listWebhookJobs = async (id: number, params: Record<string, unknown> = {}) => {
  const { data } = await api.get(`/shoptet/shops/${id}/webhook-jobs`, { params });
  return data as {
    data: WebhookJob[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
};

export const listSnapshotExecutions = async (id: number, params: Record<string, unknown> = {}) => {
  const { data } = await api.get(`/shoptet/shops/${id}/pipelines`, { params });
  return data as {
    data: SnapshotExecution[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
};

export const requestProductSnapshot = async (id: number, payload: Record<string, unknown> = {}) => {
  const { data } = await api.post(`/shoptet/shops/${id}/snapshots/products`, payload);
  return data as { job_id: string; status: string; endpoint: string };
};

export const requestOrderSnapshot = async (id: number, payload: Record<string, unknown> = {}) => {
  const { data } = await api.post(`/shoptet/shops/${id}/snapshots/orders`, payload);
  return data as { job_id: string; status: string; endpoint: string };
};

export const requestCustomerSnapshot = async (id: number, payload: Record<string, unknown> = {}) => {
  const { data } = await api.post(`/shoptet/shops/${id}/snapshots/customers`, payload);
  return data as { job_id: string; status: string; endpoint: string };
};

export const downloadWebhookJob = async (shopId: number, jobId: string) => {
  const { data } = await api.post(`/shoptet/shops/${shopId}/webhook-jobs/${jobId}/download`);
  return data as { message: string };
};

export const fetchJobFinishedWebhookStatus = async (shopId: number) => {
  const { data } = await api.get<{ registered: boolean }>(`/shoptet/shops/${shopId}/webhooks/job-finished`);
  return data;
};

export const registerJobFinishedWebhook = async (shopId: number) => {
  const { data } = await api.post<{ registered: boolean }>(`/shoptet/shops/${shopId}/webhooks/job-finished`);
  return data;
};

export type ProductBootstrapResponse = {
  data: {
    processed: number;
    last_change_time: string | null;
    window: {
      from: string;
      to: string;
    };
  };
};

export const bootstrapMasterProducts = async (
  shopId: number,
  payload: { days?: number; items_per_page?: number } = {}
) => {
  const { data } = await api.post<ProductBootstrapResponse>(
    `/shoptet/shops/${shopId}/sync/products/bootstrap`,
    payload
  );
  return data;
};

export type PushProductTranslationResponse = {
  data: {
    status?: string | null;
  };
};

export const pushProductTranslation = async (shopId: number, translationId: string) => {
  const { data } = await api.post<PushProductTranslationResponse>(
    `/shoptet/shops/${shopId}/sync/products/${translationId}/push`
  );
  return data;
};
