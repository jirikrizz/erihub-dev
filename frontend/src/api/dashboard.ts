import api from './client';

export type DashboardRangeSelection = 'last_24h' | 'today' | 'yesterday';

export type DashboardSummary = {
  range: {
    from: string;
    to: string;
    timezone: string;
    selection: DashboardRangeSelection;
  };
  base_currency: string;
  totals: {
    orders: number;
    revenue_base: number;
    average_order_value_base: number;
    items_sold: number;
    new_customers: number;
    active_customers: number;
    returning_customers: number;
    guest_orders: number;
    returning_customers_share: number;
  };
  revenue_by_currency: Array<{
    currency: string;
    orders_count: number;
    total_amount: number;
    total_amount_base: number;
  }>;
  top_shops: Array<{
    shop_id: number | null;
    shop_name: string | null;
    orders_count: number;
    revenue_base: number;
    provider?: string | null;
  }>;
  top_products: Array<{
    shop_id: number | null;
    shop_name: string | null;
    provider?: string | null;
    code: string | null;
    name: string;
    quantity: number;
  }>;
  top_locations: Array<{
    postal_code: string;
    city: string;
    region: string | null;
    orders_count: number;
    revenue_base: number;
    top_product: {
      name: string;
      code: string | null;
      quantity: number;
    } | null;
  }>;
  payment_breakdown: Array<{
    name: string;
    orders_count: number;
  }>;
  shipping_breakdown: Array<{
    name: string;
    orders_count: number;
  }>;
  coupon_usage: Array<{
    code: string;
    name: string | null;
    uses: number;
  }>;
  status_breakdown: Array<{
    status: string;
    orders_count: number;
  }>;
  sync: {
    webhooks_total: number;
    webhooks_processed: number;
    webhooks_failed: number;
    failed_jobs: number;
  };
  comparison: {
    selection: DashboardRangeSelection;
    range: {
      from: string;
      to: string;
      timezone: string;
    };
    totals: {
      orders: number;
      revenue_base: number;
      average_order_value_base: number;
      items_sold: number;
      new_customers: number;
      active_customers: number;
      returning_customers: number;
      guest_orders: number;
      returning_customers_share: number;
    };
    returning_customers_share: number;
  } | null;
};

export type DashboardSummaryParams = {
  range?: DashboardRangeSelection;
  shopIds?: number[];
  providers?: string[];
};

export const fetchDashboardSummary = async (params?: DashboardSummaryParams) => {
  const queryParams: Record<string, unknown> = {};

  if (params?.range) {
    queryParams.range = params.range;
  }

  if (params?.shopIds && params.shopIds.length > 0) {
    queryParams.shop_ids = params.shopIds;
  }

  if (params?.providers && params.providers.length > 0) {
    queryParams.providers = params.providers;
  }

  const { data } = await api.get<DashboardSummary>('/dashboard/summary', { params: queryParams });
  return data;
};

export type DashboardNoteVisibility = 'private' | 'public';

export type DashboardNote = {
  id: string;
  title: string | null;
  content: string;
  visibility: DashboardNoteVisibility;
  is_pinned: boolean;
  created_at: string | null;
  updated_at: string | null;
  author: {
    id: number;
    name: string;
    email: string;
  } | null;
  can_edit: boolean;
};

type DashboardNoteResponse = {
  data: DashboardNote;
};

type DashboardNoteCollectionResponse = {
  data: DashboardNote[];
};

export type DashboardNotePayload = {
  title?: string | null;
  content: string;
  visibility: DashboardNoteVisibility;
  is_pinned?: boolean;
};

export const fetchDashboardNotes = async (limit = 30) => {
  const { data } = await api.get<DashboardNoteCollectionResponse>('/dashboard/notes', {
    params: { limit },
  });

  return data.data;
};

export const createDashboardNote = async (payload: DashboardNotePayload) => {
  const { data } = await api.post<DashboardNoteResponse>('/dashboard/notes', payload);
  return data.data;
};

export const updateDashboardNote = async (id: string, payload: DashboardNotePayload) => {
  const { data } = await api.patch<DashboardNoteResponse>(`/dashboard/notes/${id}`, payload);
  return data.data;
};

export const deleteDashboardNote = async (id: string) => {
  await api.delete<void>(`/dashboard/notes/${id}`);
};
