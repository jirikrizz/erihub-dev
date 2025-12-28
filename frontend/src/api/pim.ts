import api from './client';

export type Paginator<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export type ShopSummary = {
  id: number;
  name: string;
  locale?: string | null;
  currency_code?: string | null;
};

export type ProductShopOverlay = {
  id: string;
  product_id: string;
  shop_id: number;
  currency_code: string | null;
  status: string | null;
  data: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  shop?: ShopSummary;
};

export type ProductVariantShopOverlay = {
  id: string;
  product_variant_id: string;
  shop_id: number;
  price: number | null;
  purchase_price: number | null;
  vat_rate: number | null;
  stock: number | null;
  min_stock_supply: number | null;
  currency_code: string | null;
  unit: string | null;
  data: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  shop?: ShopSummary;
};

export type ProductVariantTranslationRecord = {
  id: string;
  product_variant_id: string;
  shop_id: number | null;
  locale: string;
  status: string;
  name: string | null;
  parameters: Record<string, unknown> | null;
  data: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  shop?: ShopSummary;
};

export type ProductVariantRemoteRef = {
  id: string;
  product_variant_id: string;
  shop_id: number;
  remote_guid: string | null;
  remote_code: string | null;
};

export type ProductTargetShopState = {
  shop_id: number;
  locale: string | null;
  variants_total: number;
  variants_matched: number;
  has_all_variants: boolean;
  has_product_overlay: boolean;
  translation_status: string | null;
  is_fully_translated: boolean;
};

export type ProductVariant = {
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
  unit: string | null;
  price: number | null;
  purchase_price: number | null;
  vat_rate: number | null;
  weight: number | null;
  currency_code: string | null;
  stock_status: 'in_stock' | 'low_stock' | 'sold_out' | 'unknown';
  data: Record<string, unknown> | null;
  overlays?: ProductVariantShopOverlay[];
  translations?: ProductVariantTranslationRecord[];
  remote_refs?: ProductVariantRemoteRef[];
};

export type Product = {
  id: string;
  shop_id: number;
  external_guid: string;
  sku: string | null;
  status: string;
  base_locale: string;
  base_payload: Record<string, unknown> | null;
  translations: Array<{
    id: string;
    locale: string;
    status: string;
    shop_id: number | null;
    name?: string | null;
    short_description?: string | null;
    description?: string | null;
    parameters?: Record<string, unknown> | Array<Record<string, unknown>> | null;
    seo?: Record<string, unknown> | null;
    created_at?: string;
    updated_at?: string;
    shop?: ShopSummary;
  }>;
  overlays?: ProductShopOverlay[];
  remote_refs?: Array<{
    id: string;
    product_id: string;
    shop_id: number;
    remote_guid: string | null;
    remote_external_id: string | null;
  }>;
  draft_translations_count?: number;
  review_translations_count?: number;
  variants?: ProductVariant[];
  target_shop_state?: ProductTargetShopState;
};

export type ProductTranslation = {
  id: string;
  product_id: string;
  shop_id: number | null;
  locale: string;
  status: string;
  name?: string | null;
  short_description?: string | null;
  description?: string | null;
  parameters?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  seo?: Record<string, unknown> | null;
  shop?: ShopSummary;
};

export type LocaleResponse = {
  locales: string[];
  default: string;
};

export type CategoryMappingRecord = {
  category: {
    id: string;
    guid: string;
    name: string;
    slug: string | null;
    path: string | null;
  };
  mapping: {
    id: string | null;
    status: string;
    confidence: number | null;
    source: string | null;
    shop_category_node_id: string | null;
    shop_category: {
      id: string | null;
      name: string | null;
      slug: string | null;
      path: string | null;
      remote_guid: string | null;
    } | null;
  } | null;
};

export type ShopCategoryNodeRecord = {
  id: string;
  shop_id: number;
  parent_id: string | null;
  remote_guid: string;
  remote_id: string | null;
  parent_guid: string | null;
  name: string;
  slug: string | null;
  position: number;
  path: string | null;
  data: Record<string, unknown> | null;
};

export type CategoryTreeNode = {
  id: string;
  guid: string;
  name: string;
  slug: string | null;
  path: string | null;
  mapping: {
    id: string | null;
    status: string;
    confidence: number | null;
    source: string | null;
    shop_category_node_id: string | null;
    shop_category: {
      id: string | null;
      name: string | null;
      slug: string | null;
      path: string | null;
      remote_guid: string | null;
    } | null;
  } | null;
  children: CategoryTreeNode[];
};

export type ShopTreeNode = {
  id: string;
  remote_guid: string;
  name: string;
  slug: string | null;
  path: string | null;
  visible: boolean | null;
  customer_visibility: string | null;
  product_ordering: string | null;
  url: string | null;
  index_name: string | null;
  image: string | null;
  menu_title: string | null;
  title: string | null;
  meta_description: string | null;
  description: string | null;
  second_description: string | null;
  similar_category_guid: string | null;
  related_category_guid: string | null;
  data: Record<string, unknown> | null;
  children: ShopTreeNode[];
};

export type CategoryTreeResponse = {
  master_shop: {
    id: number;
    name: string;
  };
  target_shop: {
    id: number;
    name: string;
  } | null;
  canonical: CategoryTreeNode[];
  shop: ShopTreeNode[];
  summary: {
    canonical_count: number;
    shop_count: number;
    mappings: {
      total: number;
      confirmed: number;
      suggested: number;
      rejected: number;
    };
  };
  shop_synced_at: string | null;
};

export const fetchProducts = async (params: Record<string, unknown> = {}) => {
  const { data } = await api.get<Paginator<Product>>('/pim/products', { params });
  return data;
};

export const fetchProduct = async (id: string) => {
  const { data } = await api.get<Product>(`/pim/products/${id}`);
  return data;
};

export const fetchLocales = async () => {
  const { data } = await api.get<LocaleResponse>('/pim/config/locales');
  return data;
};

export const fetchTranslation = async (productId: string, locale: string, shopId?: number | null) => {
  const { data } = await api.get<ProductTranslation>(`/pim/products/${productId}/translations/${locale}`, {
    params: shopId ? { shop_id: shopId } : undefined,
  });
  return data;
};

export const updateTranslation = async (
  productId: string,
  locale: string,
  payload: Partial<ProductTranslation>,
  shopId?: number | null
) => {
  const { data } = await api.patch<ProductTranslation>(`/pim/products/${productId}/translations/${locale}`, payload, {
    params: shopId ? { shop_id: shopId } : undefined,
  });
  return data;
};

export const updateProductOverlay = async (
  productId: string,
  shopId: number,
  payload: {
    status?: string | null;
    currency_code?: string | null;
    data?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  }
) => {
  const { data } = await api.patch<ProductShopOverlay>(`/pim/products/${productId}/overlays/${shopId}`, payload);
  return data;
};

export const updateProductVariantOverlay = async (
  productId: string,
  variantId: string,
  shopId: number,
  payload: {
    price?: number | null;
    purchase_price?: number | null;
    vat_rate?: number | null;
    stock?: number | null;
    min_stock_supply?: number | null;
    currency_code?: string | null;
    unit?: string | null;
    data?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  }
) => {
  const { data } = await api.patch<ProductVariantShopOverlay>(
    `/pim/products/${productId}/variants/${variantId}/overlays/${shopId}`,
    payload
  );
  return data;
};

export const submitTranslation = async (productId: string, locale: string, shopId?: number | null) => {
  await api.post(`/pim/products/${productId}/translations/${locale}/submit`, undefined, {
    params: shopId ? { shop_id: shopId } : undefined,
  });
};

export const approveTranslation = async (productId: string, locale: string, shopId?: number | null) => {
  await api.post(`/pim/products/${productId}/translations/${locale}/approve`, undefined, {
    params: shopId ? { shop_id: shopId } : undefined,
  });
};

export const rejectTranslation = async (productId: string, locale: string, shopId?: number | null) => {
  await api.post(`/pim/products/${productId}/translations/${locale}/reject`, undefined, {
    params: shopId ? { shop_id: shopId } : undefined,
  });
};

export type AttributeMappingType = 'flags' | 'filtering_parameters' | 'variants';

export type AttributeMappingValue = {
  key: string;
  label: string;
  color?: string | null;
  priority?: number | null;
  likely_master_language?: boolean;
};

export type AttributeMappingItem = {
  key: string;
  label: string;
  code?: string | null;
  index?: string | null;
  id?: number | null;
  description?: string | null;
  priority?: number | null;
  system?: boolean;
  color?: string | null;
  show_in_detail?: boolean;
  show_in_category?: boolean;
  values?: AttributeMappingValue[];
  likely_master_language?: boolean;
  value_truncated?: boolean;
};

export type AttributeMappingRecord = {
  master_key: string;
  target_key: string | null;
  master_label?: string | null;
  target_label?: string | null;
  values?: AttributeValueMappingRecord[];
};

export type AttributeValueMappingRecord = {
  master_key: string;
  target_key: string | null;
  master_label?: string | null;
  target_label?: string | null;
};

export type AttributeMappingResponse = {
  master: AttributeMappingItem[];
  target: AttributeMappingItem[];
  mappings: AttributeMappingRecord[];
};

export const fetchAttributeMappings = async (params: {
  master_shop_id: number;
  target_shop_id: number;
  type: AttributeMappingType;
}) => {
  const { data } = await api.get<{ data: AttributeMappingResponse }>('/pim/attribute-mappings', {
    params,
  });

  return data.data;
};

export const saveAttributeMappings = async (payload: {
  master_shop_id: number;
  target_shop_id: number;
  type: AttributeMappingType;
  mappings: Array<{ master_key: string; target_key: string | null; values?: Array<{ master_key: string; target_key: string | null }> }>;
}) => {
  const { data } = await api.post<{ data: AttributeMappingResponse }>(
    '/pim/attribute-mappings',
    payload
  );

  return data.data;
};

export const suggestAttributeMappings = async (payload: {
  master_shop_id: number;
  target_shop_id: number;
  type: AttributeMappingType;
}) => {
  const { data } = await api.post<{ data: AttributeMappingResponse }>(
    '/pim/attribute-mappings/suggest',
    payload
  );

  return data.data;
};

export const syncAttributeOptions = async (payload: { shop_id: number; types: AttributeMappingType[] }) => {
  await api.post('/pim/attribute-mappings/sync', payload);
};

export type AiDraftResponse = {
  sections: string[];
  translation: {
    name: string | null;
    short_description: string | null;
    description: string | null;
    seo?: {
      metaTitle?: string | null;
      metaDescription?: string | null;
    } | null;
    parameters?: unknown;
    filtering_parameters?: unknown;
  };
  slug?: string | null;
  images?: Array<{ source: string | null; alt?: string | null; title?: string | null }> | null;
  variants?: Array<{
    code: string;
    name?: string | null;
    parameters?: unknown;
    price?: number | string | null;
    purchasePrice?: number | string | null;
    currencyCode?: string | null;
    stock?: number | string | null;
    vatRate?: number | string | null;
  }> | null;
  pricing?: { currencyCode?: string | null; price?: number | null } | null;
};

export type AiMappingPreviewResponse = {
  filtering_parameters: Array<{
    key: string;
    code: string;
    label?: string | null;
    values: Array<{
      key: string;
      label?: string | null;
      color?: string | null;
      priority?: number | null;
    }>;
  }> | null;
  variants: Array<{
    code: string;
    name?: string | null;
    parameters?: unknown;
    price?: number | string | null;
    currencyCode?: string | null;
    purchasePrice?: number | string | null;
    stock?: number | string | null;
    vatRate?: number | string | null;
  }>;
};

export type MappingOverrideValuePayload = {
  master_value_key: string;
  target_value_key?: string | null;
};

export type MappingOverridesPayload = {
  filtering_parameters?: Array<{
    master_key: string;
    target_key?: string | null;
    ignore?: boolean;
    values?: MappingOverrideValuePayload[];
  }>;
  variants?: Array<{
    variant_code: string;
    parameter_key: string;
    target_key?: string | null;
    ignore?: boolean;
    values?: MappingOverrideValuePayload[];
  }>;
};

export type GenerateTranslationDraftOptions = {
  shopId?: number | null;
  sections?: string[];
  mappingOverrides?: MappingOverridesPayload;
};

export const generateTranslationDraft = async (
  productId: string,
  locale: string,
  options: GenerateTranslationDraftOptions = {}
) => {
  const { shopId = null, sections = ['text'], mappingOverrides } = options;
  const body: Record<string, unknown> = { sections };

  if (mappingOverrides) {
    body.mapping_overrides = mappingOverrides;
  }

  const { data } = await api.post<AiDraftResponse>(
    `/pim/products/${productId}/translations/${locale}/ai-draft`,
    body,
    {
      params: shopId ? { shop_id: shopId } : undefined,
    }
  );

  return data;
};

export const prepareTranslationMapping = async (
  productId: string,
  locale: string,
  options: { shopId?: number | null; mappingOverrides?: MappingOverridesPayload } = {}
) => {
  const { shopId = null, mappingOverrides } = options;
  const body: Record<string, unknown> = {};

  if (mappingOverrides) {
    body.mapping_overrides = mappingOverrides;
  }

  const { data } = await api.post<AiMappingPreviewResponse>(
    `/pim/products/${productId}/translations/${locale}/ai-mapping`,
    body,
    {
      params: shopId ? { shop_id: shopId } : undefined,
    }
  );

  return data;
};

export const fetchCategoryMappings = async (params: Record<string, unknown>) => {
  const { data } = await api.get<Paginator<CategoryMappingRecord>>('/pim/category-mappings', {
    params,
  });
  return data;
};

export const confirmCategoryMapping = async (payload: {
  category_node_id: string;
  shop_category_node_id: string;
  notes?: string;
}) => {
  const { data } = await api.post('/pim/category-mappings/confirm', payload);
  return data as Record<string, unknown>;
};

export const rejectCategoryMapping = async (payload: {
  category_node_id: string;
  shop_id: number;
  notes?: string;
}) => {
  const { data } = await api.post('/pim/category-mappings/reject', payload);
  return data as Record<string, unknown>;
};

export const fetchShopCategoryNodes = async (params: Record<string, unknown>) => {
  const { data } = await api.get<Paginator<ShopCategoryNodeRecord>>('/pim/shop-category-nodes', {
    params,
  });
  return data;
};

export const fetchCategoryTree = async (params: Record<string, unknown>) => {
  const { data } = await api.get<CategoryTreeResponse>('/pim/category-mappings/tree', {
    params,
  });
  return data;
};

export type ShopCategoryNodeResponse = {
  id: string;
  shop_id: number;
  parent_id: string | null;
  remote_guid: string;
  remote_id: string | null;
  parent_guid: string | null;
  name: string;
  slug: string | null;
  position: number;
  path: string | null;
  data: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  visible: boolean | null;
  customer_visibility: string | null;
  product_ordering: string | null;
  url: string | null;
  index_name: string | null;
  image: string | null;
  menu_title: string | null;
  title: string | null;
  meta_description: string | null;
  description: string | null;
  second_description: string | null;
  similar_category_guid: string | null;
  related_category_guid: string | null;
};

export const syncShopCategoryNodes = async (payload: { shop_id: number }) => {
  const { data } = await api.post<{ message: string; synced_at: string | null }>(
    '/pim/shop-category-nodes/sync',
    payload
  );

  return data;
};

export const createShopCategoryNode = async (
  payload: {
    shop_id: number;
    parent_id?: string | null;
    name: string;
    slug?: string | null;
    position?: number;
    visible?: boolean;
    url?: string | null;
    index_name?: string | null;
    image?: string | null;
    description?: string | null;
    second_description?: string | null;
    menu_title?: string | null;
    title?: string | null;
    meta_description?: string | null;
    customer_visibility?: string | null;
    product_ordering?: string | null;
    similar_category_guid?: string | null;
    related_category_guid?: string | null;
    data?: Record<string, unknown> | null;
  }
) => {
  const { data } = await api.post<ShopCategoryNodeResponse>('/pim/shop-category-nodes', payload);

  return data;
};

export const updateShopCategoryNode = async (
  id: string,
  payload: {
    shop_id: number;
    parent_id?: string | null;
    name?: string;
    slug?: string | null;
    position?: number;
    visible?: boolean;
    url?: string | null;
    index_name?: string | null;
    image?: string | null;
    description?: string | null;
    second_description?: string | null;
    menu_title?: string | null;
    title?: string | null;
    meta_description?: string | null;
    customer_visibility?: string | null;
    product_ordering?: string | null;
    similar_category_guid?: string | null;
    related_category_guid?: string | null;
    data?: Record<string, unknown> | null;
  }
) => {
  const { data } = await api.patch<ShopCategoryNodeResponse>(`/pim/shop-category-nodes/${id}`, payload);

  return data;
};

export const deleteShopCategoryNode = async (id: string, payload: { shop_id: number }) => {
  await api.delete(`/pim/shop-category-nodes/${id}`, { data: payload });
};

export type PushShopCategoryNodePayload = {
  shop_id: number;
  description?: string | null;
  second_description?: string | null;
};

export type PushShopCategoryNodeResponse = {
  message: string;
  category: ShopCategoryNodeResponse;
  shoptet: Record<string, unknown>;
};

export const pushShopCategoryNodeDescription = async (
  id: string,
  payload: PushShopCategoryNodePayload
) => {
  const { data } = await api.post<PushShopCategoryNodeResponse>(`/pim/shop-category-nodes/${id}/push`, payload);

  return data;
};

export type CategoryAiPreMapPayload = {
  shop_id: number;
  master_shop_id?: number | null;
  instructions?: string | null;
  include_mapped?: boolean;
};

export type CategoryAiPreMapSuggestion = {
  canonical: {
    id: string;
    guid: string;
    name: string;
    path: string | null;
  };
  suggested: {
    id: string;
    name: string;
    path: string | null;
    remote_guid: string | null;
  } | null;
  similarity: number;
  reason?: string | null;
};

export type CategoryAiPreMapResponse = {
  message: string;
  master_shop: { id: number; name: string | null };
  target_shop: { id: number; name: string | null };
  instructions: string | null;
  include_mapped: boolean;
  suggestions: CategoryAiPreMapSuggestion[];
};

export const preMapCategoriesWithAi = async (payload: CategoryAiPreMapPayload) => {
  const { data } = await api.post<CategoryAiPreMapResponse>('/pim/category-mappings/ai-pre-map', payload);

  return data;
};

export type CategoryDefaultCategoryRecord = {
  id?: string | null;
  guid?: string | null;
  remote_guid?: string | null;
  name: string | null;
  path: string | null;
};

export type CategoryDefaultCategoryIssue = {
  product_id: string;
  sku: string | null;
  name: string | null;
  codes: string[];
  reason: string;
  master_category: CategoryDefaultCategoryRecord;
  expected_category: CategoryDefaultCategoryRecord | null;
  actual_category: CategoryDefaultCategoryRecord | null;
  recommended_category?: CategoryDefaultCategoryRecord | null;
};

export type CategoryDefaultCategoryValidationResponse = {
  data: CategoryDefaultCategoryIssue[];
  meta: {
    page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
  stats: Record<string, number>;
};

export const fetchCategoryDefaultValidation = async (params: Record<string, unknown>) => {
  const { data } = await api.get<CategoryDefaultCategoryValidationResponse>(
    '/pim/category-mappings/default-category-validation',
    { params }
  );

  return data;
};

export type CategoryProductPriorityVariant = {
  variant_id: string | null;
  code: string | null;
  name: string | null;
  stock: number | null;
  visibility?: string | null;
  purchases_30d: number;
};

export type CategoryProductPriorityItem = {
  position: number;
  product_guid: string;
  product_id: string | null;
  sku: string | null;
  name: string | null;
  priority: number | null;
  stock: number | null;
  visibility?: string | null;
  purchases_30d: number;
  variants?: CategoryProductPriorityVariant[];
};

export type CategoryProductPriorityResponse = {
  data: {
    items: CategoryProductPriorityItem[];
    paginator: {
      total: number;
      page: number;
      page_count: number;
      per_page: number;
      items_on_page: number;
    };
  };
  errors: Array<{
    errorCode?: string;
    message?: string;
    instance?: string;
  }>;
};

export const fetchCategoryProductsPriority = async (
  params: {
    shop_id: number;
    category_guid: string;
    page?: number;
    per_page?: number;
  }
) => {
  const { data } = await api.get<CategoryProductPriorityResponse>('/pim/products/category-priority', {
    params,
  });

  return data;
};

export const updateCategoryProductsPriority = async (
  payload: {
    shop_id: number;
    category_guid: string;
    updates: Array<{
      product_guid: string;
      priority: number | null;
    }>;
  }
) => {
  const { data } = await api.post('/pim/products/category-priority', payload);

  return data as { errors?: Array<{ message?: string }> };
};

export type CategoryProductPriorityAiSuggestion = {
  product_guid: string;
  suggested_priority: number;
  rationale: string;
};

export type CategoryProductPriorityAiResponse = {
  data: {
    evaluated_at: string;
    model: string;
    criteria: string | null;
    product_count: number;
    suggestions: CategoryProductPriorityAiSuggestion[];
  };
};

export const generateCategoryProductsPriorityAi = async (
  payload: {
    shop_id: number;
    category_guid: string;
    pages?: number;
    per_page?: number;
  }
) => {
  const { data } = await api.post<CategoryProductPriorityAiResponse>(
    '/pim/products/category-priority/ai-evaluate',
    payload
  );

  return data;
};

export const applyDefaultCategory = async (
  payload: {
    product_id: string;
    target: 'master' | 'shop';
    category_id?: string | null;
    shop_id?: number;
    sync_to_shoptet?: boolean;
  }
) => {
  const { data } = await api.post<{ message?: string }>(
    '/pim/category-mappings/default-category',
    payload
  );

  return data;
};

export type GenerateCategoryContentPayload = {
  shop_id: number;
  category_id?: string | null;
  parent_id?: string | null;
  name?: string;
  path?: string | null;
  description?: string | null;
  second_description?: string | null;
  meta_description?: string | null;
  menu_title?: string | null;
  title?: string | null;
  context_notes?: string | null;
};

export type GenerateCategoryContentResponse = {
  menu_title: string | null;
  title: string | null;
  meta_description: string | null;
  description: string | null;
  second_description: string | null;
  link_suggestions: Array<{ label: string; url: string }>;
  widgets: Array<{
    type: 'banner' | 'countdown' | 'discount_tiles' | 'promo_countdown';
    placement: string;
    headline?: string | null;
    message?: string | null;
    deadline?: string | null;
    cta_label?: string | null;
    cta_url?: string | null;
    title?: string | null;
    subtitle?: string | null;
    image?: string | null;
    link_label?: string | null;
    link_url?: string | null;
    filter_keyword?: string | null;
    tile_label?: string | null;
    tile_background?: string | null;
    active_background?: string | null;
    tile_text_color?: string | null;
    banner_image?: string | null;
    banner_alt?: string | null;
    banner_link?: string | null;
    locale?: string | null;
    subheadline?: string | null;
    description?: string | null;
    background_style?: string | null;
    background_image?: string | null;
    overlay_color?: string | null;
    text_color?: string | null;
    accent_color?: string | null;
    mode?: 'fixed' | 'recurring' | null;
    interval_hours?: number | string | null;
    interval_minutes?: number | string | null;
    recurring_anchor?: string | null;
    layout?: 'square' | 'rectangle' | null;
    headline_size?: number | null;
    subheadline_size?: number | null;
    description_size?: number | null;
    cta_font_size?: number | null;
    headline_color?: string | null;
    subheadline_color?: string | null;
    description_color?: string | null;
    cta_background?: string | null;
    cta_text_color?: string | null;
    cta_border_color?: string | null;
    max_width?: number | string | null;
    max_height?: number | string | null;
  }>;
};

export const generateCategoryContent = async (payload: GenerateCategoryContentPayload) => {
  const { data } = await api.post<GenerateCategoryContentResponse>('/pim/shop-category-nodes/ai-content', payload);

  return data;
};

export type TranslateCategoryContentPayload = {
  shop_id: number;
  category_id?: string | null;
  source_locale?: string | null;
  target_locale: string;
  fields: Record<string, string | null>;
  context_notes?: string | null;
};

export type TranslateCategoryContentResponse = Record<string, string | null>;

export const translateCategoryContent = async (payload: TranslateCategoryContentPayload) => {
  const { data } = await api.post<TranslateCategoryContentResponse>(
    '/pim/shop-category-nodes/ai-translate',
    payload
  );

  return data;
};
