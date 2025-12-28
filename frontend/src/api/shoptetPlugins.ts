import api from './client';

export type ShoptetPluginRequest = {
  name: string;
  goal: string;
  shop_id: number;
  plugin_id?: number | null;
  shoptet_surface?: string | null;
  data_sources?: string | null;
  additional_notes?: string | null;
  language?: string | null;
  brand_primary_color?: string | null;
  brand_secondary_color?: string | null;
  brand_font_family?: string | null;
  bundle_key?: string | null;
};

export type ShoptetPluginResponse = {
  summary: string;
  plugin_id: number;
  plugin_name: string;
  shop_id: number;
  version: number;
  version_id: number;
  created_at: string | null;
  metadata?: {
    plugin_type?: string | null;
    language?: string | null;
    brand?: {
      primary_color?: string | null;
      secondary_color?: string | null;
      font_family?: string | null;
    } | null;
    advent_calendar?: AdventCalendarMetadata | null;
    auto_widget?: AutoWidgetMetadata | null;
  } | null;
  file: {
    filename: string;
    description: string;
    code: string;
  };
  installation_steps: string[];
  testing_checklist: string[];
  dependencies: string[];
  warnings: string[];
};

export const generateShoptetPlugin = async (payload: ShoptetPluginRequest) => {
  const { data } = await api.post<ShoptetPluginResponse>('/shoptet/plugins/generate', payload);
  return data;
};

type AdventCalendarMetadata = {
  days_count?: number;
  timezone?: string | null;
  start_date?: string | null;
  decor_variant?: string | null;
  enable_snowfall?: boolean;
  show_countdown?: boolean;
  card_label?: string | null;
  countdown_prefix?: string | null;
  countdown_complete?: string | null;
  overview_targets?: string[];
  shop_locale?: string | null;
  days?: Array<{
    day?: number;
    title?: string | null;
    targets?: string[];
    html?: string;
  }>;
};

export type AutoWidgetMetadata = {
  widget_id?: string;
  widget_name?: string;
  widget_token?: string;
  widget_script_url?: string;
  container_id?: string;
  container_class?: string;
  page_targets?: string[];
  selector?: string;
  placement?: 'before' | 'after' | 'prepend' | 'append';
  max_attempts?: number;
  poll_interval_ms?: number;
  bundle_key?: string | null;
  bundle_url?: string | null;
  instance_id?: string | null;
  shop_id?: number | null;
  data_source?: 'widget' | 'inventory_recommendations';
  recommendation_endpoint?: string | null;
  recommendation_limit?: number | null;
};

export type ShoptetPluginListItem = {
  id: number;
  name: string;
  shop_id: number;
  shop_name: string | null;
  created_at: string | null;
  latest_version: number | null;
  latest_version_id: number | null;
  latest_summary: string | null;
  latest_filename: string | null;
  latest_created_at: string | null;
  latest_metadata?: {
    plugin_type?: string | null;
    language?: string | null;
    advent_calendar?: AdventCalendarMetadata | null;
    auto_widget?: AutoWidgetMetadata | null;
  } | null;
  latest_bundle_key?: string | null;
};

export type ShoptetPluginListResponse = {
  data: ShoptetPluginListItem[];
  meta: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
};

export const listShoptetPlugins = async (params: Record<string, unknown> = {}) => {
  const { data } = await api.get<ShoptetPluginListResponse>('/shoptet/plugins', { params });
  return data;
};

export type ShoptetPluginVersion = {
  id: number;
  version: number;
  filename: string;
  summary: string | null;
  description: string | null;
  created_at: string | null;
  bundle_key?: string | null;
  installation_steps: string[];
  testing_checklist: string[];
  dependencies: string[];
  warnings: string[];
  metadata?: {
    plugin_type?: string | null;
    language?: string | null;
    brand?: {
      primary_color?: string | null;
      secondary_color?: string | null;
      font_family?: string | null;
    } | null;
    advent_calendar?: AdventCalendarMetadata | null;
    auto_widget?: AutoWidgetMetadata | null;
  } | null;
};

export type ShoptetPluginDetail = {
  id: number;
  name: string;
  shop_id: number;
  shop_name: string | null;
  created_at: string | null;
  versions: ShoptetPluginVersion[];
};

export const fetchShoptetPlugin = async (id: number) => {
  const { data } = await api.get<ShoptetPluginDetail>(`/shoptet/plugins/${id}`);
  return data;
};

export const fetchShoptetPluginVersions = async (id: number) => {
  const { data } = await api.get<{ data: ShoptetPluginVersion[] }>(`/shoptet/plugins/${id}/versions`);
  return data.data;
};

export type ShoptetPluginVersionDetail = {
  id: number;
  version: number;
  filename: string;
  summary: string | null;
  description: string | null;
  code: string;
  bundle_key?: string | null;
  installation_steps: string[];
  testing_checklist: string[];
  dependencies: string[];
  warnings: string[];
  created_at: string | null;
  metadata?: {
    plugin_type?: string | null;
    language?: string | null;
    brand?: {
      primary_color?: string | null;
      secondary_color?: string | null;
      font_family?: string | null;
    } | null;
    auto_widget?: AutoWidgetMetadata | null;
  } | null;
  plugin: {
    id: number;
    name: string;
    shop_id: number;
    shop_name: string | null;
  };
};

export const fetchShoptetPluginVersion = async (id: number) => {
  const { data } = await api.get<ShoptetPluginVersionDetail>(`/shoptet/plugin-versions/${id}`);
  return data;
};

export const downloadShoptetPluginVersion = async (id: number) => {
  const response = await api.get<Blob>(`/shoptet/plugin-versions/${id}/download`, {
    responseType: 'blob',
  });

  return response.data;
};

export const updateShoptetPlugin = async (id: number, payload: { name: string }) => {
  const { data } = await api.put(`/shoptet/plugins/${id}`, payload);
  return data;
};

export const deleteShoptetPlugin = async (id: number) => {
  const { data } = await api.delete<{ message?: string }>(`/shoptet/plugins/${id}`);
  return data;
};

export type AutoWidgetPluginPayload = {
  shop_id: number;
  name: string;
  widget_id: string;
  page_targets: string[];
  selector: string;
  placement: 'before' | 'after' | 'prepend' | 'append';
  bundle_key?: string | null;
  max_attempts?: number | null;
  poll_interval_ms?: number | null;
  data_source?: 'widget' | 'inventory_recommendations' | 'inventory_similarity';
  recommendation_limit?: number | null;
  recommendation_mode?: 'fragrance' | 'nonfragrance' | 'product' | null;
  plugin_id?: number | null;
  heading?: string | null;
  container_id?: string | null;
};

export const createAutoWidgetPlugin = async (payload: AutoWidgetPluginPayload) => {
  const { data } = await api.post<ShoptetPluginResponse>('/shoptet/plugins/auto-widgets', payload);
  return data;
};

export type ShoptetPluginFlag = {
  code: string | null;
  title: string;
  shop_id?: number | null;
};

export const listPluginFlags = async (shopId: number) => {
  const { data } = await api.get<{ flags: ShoptetPluginFlag[] }>('/shoptet/plugins/tools/flags', {
    params: { shop_id: shopId },
  });
  return data.flags;
};

export type CountdownPluginPayload = {
  shop_id: number;
  name: string;
  flag_code?: string | null;
  flag_label?: string | null;
  message_template: string;
  finished_text?: string | null;
  deadline: string;
  timezone?: string | null;
  accent_color?: string | null;
  background_color?: string | null;
  text_color?: string | null;
  bundle_key?: string | null;
  plugin_id?: number | null;
};

export const createCountdownPlugin = async (payload: CountdownPluginPayload) => {
  const { data } = await api.post('/shoptet/plugins/countdown', payload);
  return data;
};

export type SnowfallPluginPayload = {
  shop_id: number;
  name: string;
  category_paths: string[];
  bundle_key?: string | null;
  flake_color?: string | null;
  flake_count?: number | null;
  flake_count_desktop?: number | null;
  flake_count_mobile?: number | null;
  min_size?: number | null;
  max_size?: number | null;
  fall_speed?: number | null;
  sway?: number | null;
  twinkle?: boolean;
  plugin_id?: number | null;
};

export const createSnowfallPlugin = async (payload: SnowfallPluginPayload) => {
  const { data } = await api.post('/shoptet/plugins/snowfall', payload);
  return data;
};

export type AdventCalendarDayPayload = {
  day: number;
  title?: string | null;
  targets: string[];
  html: string;
};

export type AdventCalendarPluginPayload = {
  shop_id: number;
  name: string;
  bundle_key?: string | null;
  start_date: string;
  timezone?: string | null;
  decor_variant?: 'classic' | 'gingerbread' | 'frost' | string | null;
  enable_snowfall?: boolean;
  show_countdown?: boolean;
  card_label?: string | null;
  countdown_prefix?: string | null;
  countdown_complete?: string | null;
  overview_targets?: string[];
  days: AdventCalendarDayPayload[];
  plugin_id?: number | null;
};

export const createAdventCalendarPlugin = async (payload: AdventCalendarPluginPayload) => {
  const { data } = await api.post('/shoptet/plugins/advent-calendar', payload);
  return data;
};
