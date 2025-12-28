import api from './client';

export type AiTextScenario =
  | 'product_description'
  | 'category_page'
  | 'article'
  | 'email_reply'
  | 'social_post'
  | 'product_faq';
export type AiImageScenario = 'category_banner' | 'product_image' | 'marketing_visual' | 'email_banner';
export type AiVideoScenario = 'product_loop' | 'lifestyle_spot' | 'storyboard' | 'mood_clip';

export type GenerateAiTextPayload = {
  scenario: AiTextScenario;
  brief: string;
  tone?: string;
  audience?: string;
  context?: string;
  language?: string;
};

export type AiTextResult = {
  scenario: AiTextScenario;
  content: string;
  path: string;
  url: string;
  filename: string;
  created_at: string;
};

export const generateAiText = async (payload: GenerateAiTextPayload) => {
  const { data } = await api.post<AiTextResult>('/ai/content/text', payload);
  return data;
};

export type GenerateAiImagePayload = {
  scenario: AiImageScenario;
  prompt: string;
  style?: string;
  size?: '512x512' | '768x768' | '1024x1024';
  reference_images?: string[];
  provider?: 'openai' | 'gemini';
};

export type AiImageResult = {
  scenario: AiImageScenario | 'image_edit';
  url: string;
  path: string;
  filename: string;
  size: string;
  created_at: string;
  reference_images?: string[];
  source_image_url?: string | null;
  detail?: string | null;
  engine?: 'classic' | 'responses';
  provider?: 'openai' | 'gemini';
  model?: string | null;
};

export const generateAiImage = async (payload: GenerateAiImagePayload) => {
  const { data } = await api.post<AiImageResult>('/ai/content/image', payload);
  return data;
};

export type EditAiImagePayload = {
  prompt: string;
  image_url: string;
  size?: string;
  preserve_label?: boolean;
  background_mode?: 'preserve' | 'remove' | 'solid';
  background_color?: string;
  negative_prompt?: string;
  mask_path?: string;
  engine?: 'classic' | 'responses';
  detail?: 'low' | 'standard' | 'hd';
  reference_images?: string[];
};

export const editAiImage = async (payload: EditAiImagePayload) => {
  const { data } = await api.post<AiImageResult>('/ai/content/image/edit', payload);
  return data;
};

export type GenerateAiVideoPayload = {
  scenario: AiVideoScenario;
  prompt: string;
  size?: '720x1280' | '1280x720';
  reference_images?: string[];
  seconds?: number;
};

export type AiVideoJob = {
  job_id: string;
  status: string;
  eta?: number | null;
  scenario?: AiVideoScenario;
  url?: string | null;
  path?: string | null;
  filename?: string | null;
  generation_id?: string;
  created_at?: string;
  error?: string | null;
  progress?: string | number | null;
};

export const generateAiVideo = async (payload: GenerateAiVideoPayload) => {
  const { data } = await api.post<AiVideoJob>('/ai/content/video', payload);
  return data;
};

export const fetchAiVideoJob = async (jobId: string) => {
  const { data } = await api.get<AiVideoJob>(`/ai/content/video/${jobId}`);
  return data;
};

export type UploadAiImageResponse = {
  path: string;
  url: string;
  filename: string;
};

export const uploadAiImage = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<UploadAiImageResponse>('/ai/content/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

export type AiCollagePayload = {
  images: string[];
  layout?: 'grid' | 'row' | 'column';
};

export type AiCollageResult = {
  path: string;
  url: string;
  filename: string;
  layout: string;
};

export const createAiCollage = async (payload: AiCollagePayload) => {
  const { data } = await api.post<AiCollageResult>('/ai/content/collage', payload);
  return data;
};

export type AiHistoryEntry = {
  id: string;
  type: 'text' | 'image' | 'video';
  scenario: string;
  content?: string | null;
  path?: string | null;
  url?: string | null;
  meta?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
  created_at: string;
};

export type PaginatedAiHistory = {
  data: AiHistoryEntry[];
  meta: {
    current_page: number;
    last_page: number;
    total: number;
  };
};

export const fetchAiHistory = async (params: { type?: 'text' | 'image' | 'video'; page?: number }) => {
  const { data } = await api.get<PaginatedAiHistory>('/ai/content/history', { params });
  return data;
};
