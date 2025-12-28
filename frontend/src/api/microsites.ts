import api from './client';
import type { FooterSettings, HeaderSettings, MicrositeSection, ThemeSettings } from '../features/microsites/types';

export type MicrositeStatus = 'draft' | 'published' | 'archived';

export type MicrositeProductOverlay = {
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  badge?: string | null;
  detail_url?: string | null;
  image_url?: string | null;
  gallery?: string[] | null;
  price?: {
    current_value?: number | null;
    currency?: string | null;
  };
  cta?: {
    label?: string | null;
    href?: string | null;
  };
  tags?: string[];
};

export type MicrositeProductPayload = {
  id?: number;
  product_variant_id?: string | null;
  product_code?: string | null;
  position?: number;
  custom_price?: number | null;
  custom_currency?: string | null;
  custom_label?: string | null;
  custom_description?: string | null;
  description_md?: string | null;
  image_url?: string | null;
  price_cents?: number | null;
  price_currency?: string | null;
  cta_text?: string | null;
  cta_url?: string | null;
  visible?: boolean;
  active?: boolean;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
  overlay?: MicrositeProductOverlay | null;
};

export type Microsite = {
  id: string;
  name: string;
  slug: string;
  status: MicrositeStatus;
  theme: string | null;
  hero: Record<string, unknown> | null;
  seo: Record<string, unknown> | null;
  content_schema: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  published_at: string | null;
  public_url?: string | null;
  created_at: string;
  updated_at: string;
  products?: MicrositeProductPayload[];
  products_count?: number;
};

export type PaginatedMicrosites = {
  data: Microsite[];
  total: number;
  last_page: number;
  current_page: number;
  per_page: number;
};

export const listMicrosites = async (params: Record<string, unknown> = {}) => {
  const { data } = await api.get<PaginatedMicrosites>('/microsites', { params });
  return data;
};

export const fetchMicrosite = async (id: string) => {
  const { data } = await api.get<Microsite>(`/microsites/${id}`);
  return data;
};

export const createMicrosite = async (payload: Partial<Microsite> & { products?: MicrositeProductPayload[] }) => {
  const { data } = await api.post<Microsite>('/microsites', payload);
  return data;
};

export const updateMicrosite = async (id: string, payload: Partial<Microsite> & { products?: MicrositeProductPayload[] | null }) => {
  const { data } = await api.put<Microsite>(`/microsites/${id}`, payload);
  return data;
};

export const deleteMicrosite = async (id: string) => {
  await api.delete(`/microsites/${id}`);
};

export const publishMicrosite = async (id: string) => {
  const { data } = await api.post(`/microsites/${id}/publish`);
  return data as { publication: Record<string, unknown>; microsite: Microsite };
};

export const unpublishMicrosite = async (id: string) => {
  const { data } = await api.post(`/microsites/${id}/unpublish`);
  return data as Microsite;
};

export const exportMicrosite = async (id: string) => {
  const { data } = await api.post(`/microsites/${id}/export`);
  return data as { publication: Record<string, unknown>; microsite: Microsite };
};

export type UploadedMicrositeAsset = {
  url: string;
  path: string;
  name: string;
  mime: string;
  size: number;
};

export const uploadMicrositeAsset = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await api.post<UploadedMicrositeAsset>('/microsites/assets', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return data;
};

export const previewMicrositeProduct = async (params: { code?: string; variant_id?: string; shop_id?: number }) => {
  const { data } = await api.get<{ snapshot: Record<string, unknown> }>('/microsites/products/preview', { params });
  return data;
};

export type GenerateMicrositeAiPayload = {
  brief: string;
  tone?: string;
  audience?: string;
  visual_keywords?: string[];
};

export type MicrositeAiBlueprint = {
  theme: ThemeSettings;
  header: HeaderSettings;
  footer: FooterSettings;
  sections: MicrositeSection[];
  image_prompts?: string[];
};

export const generateMicrositeAi = async (payload: GenerateMicrositeAiPayload) => {
  const { data } = await api.post<MicrositeAiBlueprint>('/microsites/generate', payload);
  return data;
};
