import api from './client';
import type { InventoryForecastProfile } from './settings';

export type InventoryOverview = {
  total_products: number;
  total_variants: number;
  low_stock_variants: number;
  sold_out_variants: number;
  in_stock_variants: number;
  unknown_stock_variants: number;
};

export type Paginated<T, TMeta = Record<string, unknown> | undefined> = {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  meta?: TMeta;
};

export type InventoryProductFlag = {
  code: string;
  title: string;
  date_from: string | null;
  date_to: string | null;
};

export type InventoryVariantPricing = {
  currency_code?: string | null;
  base_price?: number | null;
  action_price?: number | null;
  action_price_from?: string | null;
  action_price_to?: string | null;
  is_action_price_active?: boolean;
  effective_price?: number | null;
  pricelist_id?: number | null;
  source?: string | null;
};

export type InventoryVariant = {
  id: string;
  product_id: string;
  code: string;
  ean: string | null;
  sku: string | null;
  name: string | null;
  brand: string | null;
  supplier: string | null;
  stock: number | null;
  min_stock_supply: number | null;
  stock_source_shop_id?: number | null;
  unit: string | null;
  price: number | null;
  purchase_price: number | null;
  currency_code: string | null;
  metrics_currency_code?: string | null;
  vat_rate: number | null;
  stock_status: 'in_stock' | 'low_stock' | 'sold_out' | 'unknown';
  data: Record<string, unknown> | null;
  lifetime_revenue?: number;
  last_30_quantity?: number;
  last_30_revenue?: number;
  last_30_orders_count?: number;
  last_90_quantity?: number;
  last_90_revenue?: number;
  last_90_orders_count?: number;
  lifetime_orders_count?: number;
  average_daily_sales?: number;
  stock_runway_days?: number | null;
  metrics_updated_at?: string | null;
  product?: {
    id: string;
    external_guid: string;
    sku: string | null;
    status: string;
    shop_id?: number | null;
    base_payload: Record<string, unknown> | null;
    base_locale?: string;
    variants?: Array<{
      id: string;
      code: string;
      name: string | null;
      sku: string | null;
      ean: string | null;
      stock: number | null;
      min_stock_supply: number | null;
      unit: string | null;
      brand: string | null;
      supplier: string | null;
      currency_code: string | null;
      price: number | null;
      purchase_price: number | null;
      stock_status: InventoryVariant['stock_status'];
      data: Record<string, unknown> | null;
    }>;
  };
  tags?: InventoryVariantTag[];
  product_flags?: InventoryProductFlag[];
  ai_order_recommendation?: 'order_now' | 'order_soon' | 'monitor' | 'do_not_order' | null;
  ai_reorder_deadline_days?: number | null;
  ai_recommended_order_quantity?: number | null;
  ai_pricing_advice?: string | null;
  ai_restock_advice?: string | null;
  ai_seasonality_summary?: string | null;
  ai_seasonality_best_period?: string | null;
  ai_product_health?: 'strong' | 'stable' | 'weak' | null;
  ai_product_health_reason?: string | null;
  ai_last_forecast_at?: string | null;
  related_descriptors?: InventoryVariantRelatedDescriptors;
  related_products?: InventoryVariantRelatedProduct[];
  filter_parameters?: InventoryVariantFilterParameter[];
  pricing?: InventoryVariantPricing;
  default_category_name?: string | null;
  seasonality_labels?: string[];
  ordered_quantity?: number | null;
  ordered_expected_arrival_at?: string | null;
};

export type InventoryVariantRelatedDescriptorItem = {
  label: string;
  value: string;
  priority?: number | null;
  description?: string | null;
};

export type InventoryVariantRelatedDescriptors = {
  inspired: InventoryVariantRelatedDescriptorItem[];
  similar: InventoryVariantRelatedDescriptorItem[];
};

export type InventoryVariantRelatedProductVariant = {
  id: string;
  code: string | null;
  name: string | null;
  sku: string | null;
  ean: string | null;
};

export type InventoryVariantRelatedProduct = {
  guid: string;
  link_type: string | null;
  visibility: string | null;
  priority?: number | null;
  product?: {
    id: string;
    name: string | null;
    sku: string | null;
    status: string | null;
    variants: InventoryVariantRelatedProductVariant[];
  } | null;
};

export type InventoryVariantFilterParameter = {
  name: string;
  values: string[];
  priority?: number | null;
  description?: string | null;
};

export type InventoryVariantRecommendationDescriptorMatch = {
  type: string;
  values: string[];
  score: number;
};

export type InventoryVariantRecommendationFilterMatch = {
  name: string;
  values: string[];
  score: number;
};

export type InventoryVariantRecommendationRelatedMatch = {
  guid: string;
  link_type: string | null;
  priority?: number | null;
  visibility?: string | null;
  score: number;
};

export type InventoryVariantRecommendationSetMatch = {
  type: 'contains_base' | 'is_component' | 'shared_membership';
  set: {
    guid: string | null;
    name: string | null;
  } | null;
  score: number;
};

export type InventoryVariantRecommendationNameMatch = {
  score: number;
  tokens: string[];
  numbers: string[];
};

export type InventoryVariantRecommendationBreakdown = {
  descriptors: number;
  filters: number;
  related_products: number;
  sets: number;
  stock: number;
  sales: number;
  price: number;
  name: number;
};

export type InventoryVariantRecommendation = {
  variant: {
    id: string;
    code: string;
    name: string | null;
    brand: string | null;
    supplier: string | null;
    price: number | null;
    currency_code: string | null;
    stock: number | null;
    min_stock_supply: number | null;
    product: {
      id: string;
      external_guid: string | null;
      name: string | null;
      status: string | null;
    } | null;
    metrics: {
      last_30_orders_count: number;
      last_30_quantity: number;
      last_90_orders_count: number;
      last_90_quantity: number;
      lifetime_orders_count: number;
      lifetime_quantity: number;
      lifetime_revenue: number;
      average_daily_sales: number;
      stock_runway_days: number | null;
      metrics_updated_at: string | null;
    };
  };
  score: number;
  breakdown: InventoryVariantRecommendationBreakdown;
  matches: {
    descriptors: InventoryVariantRecommendationDescriptorMatch[];
    filters: InventoryVariantRecommendationFilterMatch[];
    related_products: InventoryVariantRecommendationRelatedMatch[];
    sets: InventoryVariantRecommendationSetMatch[];
    name: InventoryVariantRecommendationNameMatch | null;
  };
};

export type InventoryProductRecommendationMatch = {
  inspiration?: string[];
  brand?: string | null;
  dominant_ingredients?: string[];
  fragrance_types?: string[];
  seasons?: string[];
};

export type InventoryProductRecommendation = {
  id: string;
  position: number;
  score: number | null;
  product: {
    id: string | null;
    external_guid: string | null;
    name: string | null;
    status: string | null;
  };
  variant: {
    id: string;
    code: string | null;
    name: string | null;
    brand: string | null;
    price: number | null;
    currency_code: string | null;
    stock: number | null;
    min_stock_supply: number | null;
  } | null;
  matches: InventoryProductRecommendationMatch;
};

export type InventoryVariantRecommendationsResponse = {
  variant_id: string;
  product_id: string;
  related: InventoryProductRecommendation[];
  recommended: InventoryProductRecommendation[];
  recommendations?: InventoryVariantRecommendation[];
};

export type InventoryVariantTag = {
  id: number;
  name: string;
  color: string | null;
  is_hidden: boolean;
  created_at?: string;
  updated_at?: string;
};

export type InventoryVariantNote = {
  id: number;
  product_variant_id: string;
  user_id: number | null;
  note: string;
  created_at: string;
  updated_at: string;
  user?: {
    id: number;
    name: string | null;
    email: string | null;
  } | null;
};

export type InventoryStockGuardRecord = {
  id: string;
  product_id: string;
  variant_code: string | null;
  product_name: string;
  variant_name: string;
  product_type: string | null;
  shoptet_stock: number | null;
  elogist_stock: number | null;
  stock_difference: number | null;
  is_visible: boolean;
  shoptet_status: string | null;
  synced_at: string | null;
};

export type InventoryStockGuardMeta = {
  elogist?: {
    enabled: boolean;
    message?: string | null;
  };
  last_synced_at?: string | null;
};

export type InventoryFilters = {
  brands: string[];
  suppliers: string[];
  flags: InventoryProductFlag[];
  default_categories: string[];
  seasonality: string[];
};

export type InventoryVariantSalesSummary = {
  orders_count: number;
  quantity: number;
  revenue: number;
};

export type InventoryVariantShopSales = {
  shop_id: number;
  shop?: {
    id: number;
    name: string | null;
    domain: string | null;
  } | null;
  summaries: {
    last_30_days: InventoryVariantSalesSummary;
    last_90_days: InventoryVariantSalesSummary;
    lifetime: InventoryVariantSalesSummary;
  };
  average_daily_sales: number | null;
  stock_runway_days: number | null;
  last_sale_at: string | null;
  metrics_updated_at: string | null;
  currency_code?: string | null;
  trend: Array<{
    date: string;
    quantity: number;
    revenue: number;
  }>;
};

export type InventoryVariantSales = {
  summaries: {
    last_30_days: InventoryVariantSalesSummary;
    last_90_days: InventoryVariantSalesSummary;
    lifetime: InventoryVariantSalesSummary;
  };
  average_daily_sales: number | null;
  stock_runway_days: number | null;
  last_sale_at: string | null;
  trend: Array<{
    date: string;
    quantity: number;
    revenue: number;
  }>;
  metrics_updated_at?: string | null;
  per_shop?: InventoryVariantShopSales[];
  applied_shop_ids?: number[];
  currency_code?: string | null;
};

export type InventoryVariantDetail = {
  variant: InventoryVariant;
  sales: InventoryVariantSales;
  latest_forecast?: InventoryVariantForecast | null;
};

export type InventoryPurchaseOrder = {
  id: number;
  original_filename: string;
  ordered_at: string | null;
  expected_arrival_at: string | null;
  arrival_days: number | null;
  items_count: number;
  variant_codes_count: number;
  total_quantity: number;
  created_at: string | null;
};

export const fetchInventoryOverview = async () => {
  const { data } = await api.get<InventoryOverview>('/inventory/overview');
  return data;
};

export const fetchInventoryVariants = async (params: Record<string, unknown> = {}) => {
  const { data } = await api.get<Paginated<InventoryVariant>>('/inventory/variants', { params });
  return data;
};

export const fetchInventoryStockGuard = async (params: Record<string, unknown> = {}) => {
  const { data } = await api.get<Paginated<InventoryStockGuardRecord, InventoryStockGuardMeta>>(
    '/inventory/stock-guard',
    { params }
  );
  return data;
};

export const exportInventoryStockGuard = async (params: Record<string, unknown> = {}) => {
  const response = await api.get<Blob>('/inventory/stock-guard/export', {
    params,
    responseType: 'blob',
  });

  return response.data;
};

export type SyncInventoryStockGuardResponse = {
  updated_count: number;
  skipped_count: number;
};

export const syncInventoryStockGuard = async (variantIds: string[]) => {
  const { data } = await api.post<SyncInventoryStockGuardResponse>('/inventory/stock-guard/sync', {
    variant_ids: variantIds,
  });

  return data;
};

export const fetchInventoryPurchaseOrders = async () => {
  const { data } = await api.get<InventoryPurchaseOrder[]>('/inventory/orders');
  return data;
};

export const createInventoryPurchaseOrder = async (payload: FormData) => {
  const { data } = await api.post<InventoryPurchaseOrder>('/inventory/orders', payload, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

export const deleteInventoryPurchaseOrder = async (id: number) => {
  await api.delete(`/inventory/orders/${id}`);
};

export const fetchInventoryFilters = async () => {
  const { data } = await api.get<InventoryFilters>('/inventory/variants/filters');
  return data;
};

export const fetchInventoryVariant = async (id: string, params: Record<string, unknown> = {}) => {
  const { data } = await api.get<InventoryVariantDetail>(`/inventory/variants/${id}`, {
    params,
  });
  return data;
};

export const fetchInventoryVariantRecommendations = async (
  id: string,
  params: Record<string, unknown> = {}
) => {
  const { data } = await api.get<InventoryVariantRecommendationsResponse>(
    `/inventory/variants/${id}/recommendations`,
    {
      params,
    }
  );

  return data;
};

export const exportInventoryVariants = async (params: Record<string, unknown> = {}) => {
  const response = await api.get('/inventory/variants/export', {
    params,
    responseType: 'blob',
  });

  return response.data as Blob;
};

export const refreshInventoryVariantMetrics = async (id: string) => {
  await api.post(`/inventory/variants/${id}/metrics/refresh`);
};

export const refreshInventoryVariantStock = async (
  id: string,
  params: Record<string, unknown> = {}
) => {
  const { data } = await api.post<InventoryVariantDetail>(
    `/inventory/variants/${id}/stock/refresh`,
    null,
    { params }
  );
  return data;
};

export type InventoryVariantForecastMarket = {
  market: string;
  performance_label: string;
  share?: number | null;
  comment?: string | null;
};

export type InventoryVariantForecast = {
  id: string;
  runway_days: number | null;
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  recommendations: string[];
  assumptions: string[];
  top_markets: InventoryVariantForecastMarket[];
  pricing_advice: string | null;
  restock_advice: string | null;
  created_at: string;
  business_profile: InventoryForecastProfile;
  user?: {
    id: number;
    name: string | null;
    email: string | null;
  } | null;
  reorder_deadline_days: number | null;
  recommended_order_quantity: number | null;
  order_recommendation: 'order_now' | 'order_soon' | 'monitor' | 'do_not_order';
  order_rationale: string | null;
  seasonality_summary: string | null;
  seasonality_best_period: string | null;
  product_health: 'strong' | 'stable' | 'weak';
  product_health_reason: string | null;
};

export type InventoryVariantForecastResponse = InventoryVariantForecast & {
  business_profile: InventoryForecastProfile;
  payload?: Record<string, unknown> | null;
};

export const forecastInventoryVariant = async (
  id: string,
  payload: { context?: string | null; shop_ids?: string[] | number[] }
) => {
  const { data } = await api.post<InventoryVariantForecastResponse>(`/inventory/variants/${id}/forecast`, payload);
  return data;
};

export const bulkForecastInventoryVariants = async (
  variantIds: string[],
  payload: { context?: string | null; shop_ids?: Array<string | number> } = {}
) => {
  const { data } = await api.post<{ queued: number }>(`/inventory/variants/forecast/batch`, {
    variant_ids: variantIds,
    context: payload.context ?? null,
    shop_ids: payload.shop_ids ?? [],
  });

  return data;
};

export const exportInventoryVariantsByIds = async (ids: string[]) => {
  const response = await api.post(
    '/inventory/variants/export',
    { ids },
    { responseType: 'blob' }
  );

  return response.data as Blob;
};

export const fetchInventoryVariantNotes = async (variantId: string) => {
  const { data } = await api.get<{ data: InventoryVariantNote[] }>(
    `/inventory/variants/${variantId}/notes`
  );

  return data.data;
};

export const createInventoryVariantNote = async (
  variantId: string,
  payload: { note: string }
) => {
  const { data } = await api.post<InventoryVariantNote>(
    `/inventory/variants/${variantId}/notes`,
    payload
  );

  return data;
};

export const updateInventoryVariantNote = async (
  noteId: number,
  payload: { note: string }
) => {
  const { data } = await api.put<InventoryVariantNote>(`/inventory/notes/${noteId}`, payload);

  return data;
};

export const deleteInventoryVariantNote = async (noteId: number) => {
  await api.delete(`/inventory/notes/${noteId}`);
};

export const fetchInventoryTags = async () => {
  const { data } = await api.get<{ data: InventoryVariantTag[] }>(`/inventory/tags`);

  return data.data;
};

export const createInventoryTag = async (payload: {
  name: string;
  color?: string | null;
  is_hidden?: boolean;
}) => {
  const { data } = await api.post<InventoryVariantTag>(`/inventory/tags`, payload);

  return data;
};

export const updateInventoryTag = async (
  tagId: number,
  payload: { name: string; color?: string | null; is_hidden?: boolean }
) => {
  const { data } = await api.put<InventoryVariantTag>(`/inventory/tags/${tagId}`, payload);

  return data;
};

export const deleteInventoryTag = async (tagId: number) => {
  await api.delete(`/inventory/tags/${tagId}`);
};

export const syncInventoryVariantTags = async (variantId: string, tagIds: number[]) => {
  const { data } = await api.post<{ tags: InventoryVariantTag[] }>(
    `/inventory/variants/${variantId}/tags`,
    { tag_ids: tagIds }
  );

  return data.tags;
};
