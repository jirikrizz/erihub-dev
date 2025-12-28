import api from './client';

export type OrdersValueByCurrency = {
  currency: string;
  orders_count: number;
  total_amount: number;
  total_amount_base: number;
};

export type AnalyticsKpis = {
  products_total: number;
  products_sold_total: number;
  webhooks_downloaded: number;
  webhooks_failed: number;
  orders_total: number;
  orders_total_value: number;
  orders_average_value: number;
  customers_total: number;
  customers_repeat_ratio: number;
  returning_customers_total: number;
  unique_customers_total: number;
  repeat_customers_period_total: number;
  new_customers_total: number;
  orders_without_email_total: number;
  returning_orders_total: number;
  returning_revenue_base: number;
  new_orders_total: number;
  new_revenue_base: number;
  customers_orders_average: number;
  orders_base_currency: string;
  orders_value_by_currency: OrdersValueByCurrency[];
};

export type AnalyticsKpisParams = {
  shop_ids?: number[];
  from?: string;
  to?: string;
};

export const fetchAnalyticsKpis = async (params: AnalyticsKpisParams = {}) => {
  const query: AnalyticsKpisParams = {};

  if (params.shop_ids && params.shop_ids.length > 0) {
    query.shop_ids = params.shop_ids;
  }

  if (params.from) {
    query.from = params.from;
  }

  if (params.to) {
    query.to = params.to;
  }

  const { data } = await api.get<AnalyticsKpis>('/analytics/kpis', { params: query });
  return data;
};

export type AnalyticsOrdersParams = AnalyticsKpisParams & {
  group_by?: 'day' | 'week' | 'month' | 'year';
};

export type MethodBreakdown = {
  method: string;
  count: number;
  share: number;
};

export type StatusBreakdown = {
  status: string;
  orders_count: number;
  share: number;
  revenue_base: number;
};

export type AnalyticsOrders = {
  totals: {
    orders_count: number;
    orders_value: number;
    orders_average_value: number;
    base_currency: string;
  };
  time_series: Array<{
    period: string;
    label: string;
    orders_count: number;
    revenue: number;
  }>;
  top_products: Array<{
    code: string | null;
    name: string;
    quantity: number;
    revenue: number;
  }>;
  payment_breakdown: MethodBreakdown[];
  shipping_breakdown: MethodBreakdown[];
  status_breakdown: StatusBreakdown[];
};

export const fetchAnalyticsOrders = async (params: AnalyticsOrdersParams = {}) => {
  const query: AnalyticsOrdersParams = {};

  if (params.shop_ids && params.shop_ids.length > 0) {
    query.shop_ids = params.shop_ids;
  }

  if (params.from) {
    query.from = params.from;
  }

  if (params.to) {
    query.to = params.to;
  }

  if (params.group_by) {
    query.group_by = params.group_by;
  }

  const { data } = await api.get<AnalyticsOrders>('/analytics/orders', { params: query });
  return data;
};

export type AnalyticsLocation = {
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
};

export type AnalyticsLocationsResponse = {
  data: AnalyticsLocation[];
  meta: {
    limit: number;
    metric: 'orders' | 'revenue';
    filters: {
      shop_ids: number[];
      from: string | null;
      to: string | null;
    };
  };
};

export type AnalyticsLocationsParams = AnalyticsKpisParams & {
  limit?: number;
  metric?: 'orders' | 'revenue';
};

export const fetchAnalyticsLocations = async (params: AnalyticsLocationsParams = {}) => {
  const query: Record<string, unknown> = {};

  if (params.shop_ids && params.shop_ids.length > 0) {
    query.shop_ids = params.shop_ids;
  }

  if (typeof params.limit === 'number') {
    query.limit = params.limit;
  }

  if (params.metric) {
    query.metric = params.metric;
  }

  if (params.from) {
    query.from = params.from;
  }

  if (params.to) {
    query.to = params.to;
  }

  const { data } = await api.get<AnalyticsLocationsResponse>('/analytics/locations', { params: query });
  return data;
};

export type AnalyticsProductRevenueBreakdown = {
  currency: string;
  amount: number;
};

export type AnalyticsProduct = {
  rank: number;
  product_guid: string | null;
  variant_code: string | null;
  variant_id: string | null;
  product_id: string | null;
  name: string;
  product_name: string;
  brand: string | null;
  ean: string | null;
  units_sold: number;
  orders_count: number;
  unique_customers: number;
  repeat_customers: number;
  first_time_customers: number;
  repeat_purchase_rate: number;
  revenue_base: number;
  average_unit_price_base: number | null;
  revenue_breakdown: AnalyticsProductRevenueBreakdown[];
};

export type AnalyticsProductsSummary = {
  products_total: number;
  units_sold_total: number;
  revenue_total_base: number;
  orders_total: number;
  unique_customers_total: number;
  repeat_customers_total: number;
  repeat_purchase_rate_average: number;
};

export type AnalyticsProductsResponse = {
  data: AnalyticsProduct[];
  meta: {
    limit: number;
    sort: string;
    sort_field: string;
    direction: 'asc' | 'desc';
    base_currency: string;
    summary: AnalyticsProductsSummary;
    filters: {
      shop_ids: number[];
      from: string | null;
      to: string | null;
      search: string | null;
    };
  };
};

export type AnalyticsProductsParams = AnalyticsKpisParams & {
  limit?: number;
  sort?: 'revenue' | 'units' | 'orders' | 'repeat_rate' | 'repeat_customers';
  direction?: 'asc' | 'desc';
  search?: string;
};

export const fetchAnalyticsProducts = async (params: AnalyticsProductsParams = {}) => {
  const query: Record<string, unknown> = {};

  if (params.shop_ids && params.shop_ids.length > 0) {
    query.shop_ids = params.shop_ids;
  }

  if (typeof params.limit === 'number') {
    query.limit = params.limit;
  }

  if (params.sort) {
    query.sort = params.sort;
  }

  if (params.direction) {
    query.direction = params.direction;
  }

  if (params.search && params.search.trim() !== '') {
    query.search = params.search.trim();
  }

  if (params.from) {
    query.from = params.from;
  }

  if (params.to) {
    query.to = params.to;
  }

  const { data } = await api.get<AnalyticsProductsResponse>('/analytics/products', { params: query });
  return data;
};
