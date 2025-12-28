import api from './client';

export type FeedField = {
  key: string;
  label: string;
};

export type FeedDefinition = {
  key: string;
  label: string;
  description: string;
  supports_time_range: boolean;
  default_fields: string[];
  fields: FeedField[];
};

export type FeedFormat = {
  key: string;
  label: string;
};

export type CacheIntervalOption = {
  value: number;
  label: string;
};

export type RelativeRangeOption = {
  value: number;
  label: string;
};

export type ExportFeedShop = {
  id: number;
  name: string;
  domain: string;
};

export type ExportFeedOptionsResponse = {
  feeds: FeedDefinition[];
  formats: FeedFormat[];
  cache_intervals: CacheIntervalOption[];
  relative_ranges: RelativeRangeOption[];
  shops: ExportFeedShop[];
};

export type ExportFeedLink = {
  id: string;
  name: string;
  type: string;
  shop_id?: number | null;
  fields: string[];
  format: string;
  cache_ttl: number;
  range_mode: 'none' | 'relative' | 'absolute';
  relative_interval?: number | null;
  date_from?: string | null;
  date_to?: string | null;
  last_used_at?: string | null;
  created_at?: string | null;
  shop?: ExportFeedShop | null;
  url: string;
};

export type ExportFeedLinksResponse = {
  links: ExportFeedLink[];
};

export type CreateExportFeedPayload = {
  name?: string;
  type: string;
  shop_id?: number | null;
  fields: string[];
  format: string;
  cache_ttl: number;
  range_mode: 'none' | 'relative' | 'absolute';
  relative_interval?: number | null;
  date_from?: string | null;
  date_to?: string | null;
};

export type CreateExportFeedResponse = {
  link: ExportFeedLink;
};

export const listExportFeedOptions = async (): Promise<ExportFeedOptionsResponse> => {
  const response = await api.get<ExportFeedOptionsResponse>('/settings/export-feeds/options');
  return response.data;
};

export const listExportFeedLinks = async (): Promise<ExportFeedLinksResponse> => {
  const response = await api.get<ExportFeedLinksResponse>('/settings/export-feeds/links');
  return response.data;
};

export const createExportFeedLink = async (
  payload: CreateExportFeedPayload
): Promise<CreateExportFeedResponse> => {
  const response = await api.post<CreateExportFeedResponse>('/settings/export-feeds/links', payload);
  return response.data;
};

export const deleteExportFeedLink = async (id: string): Promise<void> => {
  await api.delete(`/settings/export-feeds/links/${encodeURIComponent(id)}`);
};
