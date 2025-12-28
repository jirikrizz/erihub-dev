import api from './client';

export type ProductWidgetStatus = 'draft' | 'published';

export type ProductWidgetItemVariantOption = {
  label: string;
  variant_id?: string | null;
  code?: string | null;
  url?: string | null;
  detail_url?: string | null;
  variant_url?: string | null;
  variant_detail_url?: string | null;
  price?: string | null;
  price_value?: number | null;
  variant_price?: string | null;
  variant_price_display?: string | null;
  original_price?: string | null;
  original_price_value?: number | null;
  variant_original_price?: string | null;
  variant_original_price_display?: string | null;
  image_url?: string | null;
  mini_image_url?: string | null;
  variant_image?: string | null;
  variant_mini_image?: string | null;
  discount?: string | null;
  variant_discount_value?: string | null;
  variant_discount_percentage?: number | null;
  volume?: string | null;
  volume_value?: number | null;
  volume_display?: string | null;
  volume_attribute?: string | null;
  variant_size?: string | null;
  inspired_by_brand?: string | null;
  inspired_by_title?: string | null;
  variant_stock_level?: number | null;
};

export type ProductWidgetItemFlag = {
  label: string;
  class?: string | null;
};

export type ProductWidgetItemPayload = {
  title?: string | null;
  title_html?: string | null;
  subtitle?: string | null;
  url?: string | null;
  detail_url?: string | null;
  image_url?: string | null;
  gender_icon_url?: string | null;
  gender?: string | null;
  title_color?: string | null;
  appendix_background_url?: string | null;
  mini_image_url?: string | null;
  original_name?: string | null;
  inspired_by_brand?: string | null;
  inspired_by_title?: string | null;
  flags?: ProductWidgetItemFlag[];
  tags?: string[];
  price?: {
    current?: string | null;
    current_value?: number | null;
    original?: string | null;
    original_value?: number | null;
    volume?: string | null;
    volume_value?: number | null;
    discount?: string | null;
  };
  buy_button?: {
    label?: string | null;
    variant_id?: string | null;
    variant_code?: string | null;
    attributes?: Record<string, unknown>;
  };
  detail_button?: {
    label?: string | null;
    url?: string | null;
    attributes?: Record<string, unknown>;
  };
  variant_options?: ProductWidgetItemVariantOption[];
  raw_html?: string | null;
  [key: string]: unknown;
};

export type ProductWidgetItem = {
  id: string;
  product_widget_id: string;
  product_id: string | null;
  product_variant_id: string | null;
  position: number;
  payload: ProductWidgetItemPayload | null;
  created_at: string;
  updated_at: string;
};

export type ProductWidgetRender = {
  html: string;
  styles: string;
  settings: Record<string, unknown>;
};

export type ProductWidget = {
  id: string;
  name: string;
  slug: string;
  status: ProductWidgetStatus;
  public_token: string;
  shop_id: number | null;
  locale: string | null;
  settings: Record<string, unknown> | null;
  html_markup?: string | null;
  script_url: string;
  embed_snippet: string;
  items: ProductWidgetItem[];
  render: ProductWidgetRender;
  created_at: string;
  updated_at: string;
};

export type PaginatedProductWidgets = {
  data: ProductWidget[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export type ProductWidgetUpsertPayload = {
  name: string;
  slug?: string | null;
  status?: ProductWidgetStatus;
  shop_id?: number | null;
  locale?: string | null;
  settings?: Record<string, unknown> | null;
  items?: Array<{
    product_id?: string | null;
    product_variant_id?: string | null;
    position?: number;
    payload?: ProductWidgetItemPayload | null;
  }>;
  regenerate_token?: boolean;
};

export const listProductWidgets = async (params: Record<string, unknown> = {}) => {
  const { data } = await api.get<PaginatedProductWidgets>('/pim/product-widgets', { params });
  return data;
};

export const fetchProductWidget = async (id: string) => {
  const { data } = await api.get<ProductWidget>(`/pim/product-widgets/${id}`);
  return data;
};

export const createProductWidget = async (payload: ProductWidgetUpsertPayload) => {
  const { data } = await api.post<ProductWidget>('/pim/product-widgets', payload);
  return data;
};

export const updateProductWidget = async (id: string, payload: ProductWidgetUpsertPayload) => {
  const { data } = await api.put<ProductWidget>(`/pim/product-widgets/${id}`, payload);
  return data;
};

export const deleteProductWidget = async (id: string) => {
  await api.delete(`/pim/product-widgets/${id}`);
};
