import { Card, Stack, Text } from '@mantine/core';
import { useMemo } from 'react';
import type { MicrositeProductPayload } from '../../../api/microsites';
import { DEFAULT_TEMPLATE_CSS } from '../constants/defaultTemplate';
import type { BuilderValue, MicrositeSection, ThemeSettings } from '../types';
import { ThemePreview } from './ThemePreview';
import { SectionsPreview } from './SectionsPreview';

const PREVIEW_BASE_CSS = `
html {
  background: #f5f7fb;
}
body {
  margin: 0;
  background: transparent;
}
iframe {
  border: none;
}
`;

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (value: string): string =>
  escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/\s+/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => normalizeString(typeof item === 'object' ? (item as Record<string, unknown>)?.['url'] ?? '' : (item as string)))
        .filter((entry): entry is string => Boolean(entry))
    : [];

const formatPrice = (value: number | string | null | undefined, currency: string | null | undefined) => {
  if (value === null || value === undefined) {
    return '';
  }
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) {
    return '';
  }
  const formatter = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 0 });
  return `${formatter.format(numeric as number)} ${currency ?? ''}`.trim();
};

const resolveOverlayPrice = (overlay: Record<string, unknown>): { value: number | null; currency: string | null } => {
  const nodes = [overlay.price, overlay.pricing];
  for (const node of nodes) {
    if (node && typeof node === 'object') {
      const current = normalizeNumber(
        (node as Record<string, unknown>).current_value ??
          (node as Record<string, unknown>).current ??
          (node as Record<string, unknown>).value ??
          (node as Record<string, unknown>).price
      );
      if (current !== null) {
        const currency = normalizeString(
          (node as Record<string, unknown>).currency ??
            (node as Record<string, unknown>).currency_code ??
            (node as Record<string, unknown>).price_currency
        );
        return { value: current, currency: currency ?? null };
      }
    }
  }

  const directPrice = normalizeNumber(overlay.price);
  if (directPrice !== null) {
    return {
      value: directPrice,
      currency: normalizeString(overlay.currency),
    };
  }

  return { value: null, currency: null };
};

const resolveOverlayGallery = (overlay: Record<string, unknown>): string[] => {
  const gallerySources = [overlay.gallery, overlay.media && (overlay.media as Record<string, unknown>).gallery, overlay.images];
  for (const source of gallerySources) {
    const normalized = normalizeArray(source);
    if (normalized.length) {
      return normalized;
    }
  }
  return [];
};

const resolveSnapshotGallery = (snapshot: Record<string, unknown>): string[] => {
  const images = snapshot['images'];
  if (!Array.isArray(images)) {
    return [];
  }
  const gallery: string[] = [];
  for (const item of images) {
    if (typeof item === 'string' && item.trim() !== '') {
      gallery.push(item.trim());
      continue;
    }
    if (item && typeof item === 'object') {
      const url = normalizeString((item as Record<string, unknown>)['url']);
      if (url) {
        gallery.push(url);
      }
    }
  }
  return gallery;
};

const resolveProductPreview = (product: MicrositeProductPayload) => {
  const snapshot = (product.snapshot ?? {}) as Record<string, unknown>;
  const overlay = (product.overlay ?? {}) as Record<string, unknown>;
  const overlayPrice = resolveOverlayPrice(overlay);
  const overlayGallery = resolveOverlayGallery(overlay);
  const snapshotGallery = resolveSnapshotGallery(snapshot);

  const price =
    overlayPrice.value ??
    product.custom_price ??
    normalizeNumber(snapshot['price']) ??
    (typeof product.price_cents === 'number' ? product.price_cents / 100 : null);
  const currency =
    overlayPrice.currency ??
    product.custom_currency ??
    normalizeString(snapshot['currency']) ??
    normalizeString(product.price_currency) ??
    'CZK';

  const overlayImage =
    normalizeString((overlay['image_url'] as string) ?? (overlay['image'] as string) ?? (overlay['media'] as Record<string, unknown>)?.['image']) ??
    null;
  const imageUrl = overlayImage ?? product.image_url ?? overlayGallery[0] ?? snapshotGallery[0] ?? null;

  const name =
    normalizeString(overlay['title'] as string) ??
    normalizeString((overlay['title_html'] as string) ?? '') ??
    product.custom_label ??
    (snapshot['name'] as string) ??
    product.product_code ??
    'Produkt';

  const subtitle = normalizeString(overlay['subtitle'] as string);
  const description = normalizeString(overlay['description'] as string) ?? product.custom_description ?? (snapshot['description'] as string) ?? '';

  const overlayTags = normalizeArray(overlay['tags']);
  const tags =
    overlayTags.length > 0
      ? overlayTags
      : Array.isArray(product.tags)
      ? product.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '')
      : [];

  const badge =
    normalizeString(overlay['badge'] as string) ??
    normalizeString((overlay['badge'] as Record<string, unknown>)?.['label']) ??
    normalizeString((overlay['flags'] as Array<Record<string, unknown>> | undefined)?.[0]?.['label']) ??
    normalizeString((product as Record<string, unknown>)['badge']);

  const overlayCta = overlay['cta'] as Record<string, unknown> | undefined;
  const detailButton = overlay['detail_button'] as Record<string, unknown> | undefined;
  const ctaLabel =
    normalizeString(overlayCta?.['label']) ??
    normalizeString(detailButton?.['label']) ??
    normalizeString(product.cta_text) ??
    normalizeString((snapshot['cta_label'] as string) ?? '');
  const ctaHref =
    normalizeString(overlayCta?.['href']) ??
    normalizeString(detailButton?.['url'] ?? detailButton?.['href']) ??
    normalizeString(product.cta_url) ??
    normalizeString(snapshot['cta_url'] as string) ??
    normalizeString((overlay['detail_url'] as string) ?? (overlay['url'] as string));

  const detailUrl =
    normalizeString(overlay['detail_url'] as string) ??
    normalizeString((overlay['detail_button'] as Record<string, unknown> | undefined)?.['url'] as string | undefined) ??
    null;

  return {
    name,
    subtitle,
    description,
    price,
    currency,
    tags,
    badge,
    ctaLabel: ctaLabel ?? 'Detail',
    ctaUrl: ctaHref ?? detailUrl ?? '',
    imageUrl,
  };
};

const createProductCardMarkup = (product: MicrositeProductPayload, cardStyle?: string) => {
  const preview = resolveProductPreview(product);
  const priceMarkup = formatPrice(preview.price, preview.currency);
  const subtitleMarkup = preview.subtitle ? `<p class="microshop-product-eyebrow">${escapeHtml(preview.subtitle)}</p>` : '';
  const descriptionMarkup = preview.description ? `<p>${escapeHtml(preview.description)}</p>` : '<p></p>';
  const tagsMarkup =
    preview.tags.length > 0
      ? `<div class="microshop-product-tags">${preview.tags
          .slice(0, 4)
          .map((tag) => `<span>${escapeHtml(tag)}</span>`)
          .join('')}</div>`
      : '';
  const badgeMarkup = preview.badge ? `<span class="microshop-product-badge">${escapeHtml(preview.badge)}</span>` : '';
  const imageMarkup = preview.imageUrl
    ? `<img src="${escapeAttr(preview.imageUrl)}" alt="${escapeAttr(preview.name)}" loading="lazy" />`
    : '<div class="microshop-product-image-placeholder">Obrázek produktu</div>';

  return `
    <article class="microshop-product-card"${cardStyle ? ` data-style="${escapeAttr(cardStyle)}"` : ''}>
      ${badgeMarkup}
      ${imageMarkup}
      ${tagsMarkup}
      ${subtitleMarkup}
      <h3>${escapeHtml(preview.name)}</h3>
      ${descriptionMarkup}
      <div class="microshop-product-footer">
        ${priceMarkup ? `<span class="price">${escapeHtml(priceMarkup)}</span>` : ''}
        ${
          preview.ctaUrl
            ? `<a class="cta" href="${escapeAttr(preview.ctaUrl)}" target="_blank" rel="noopener">${escapeHtml(preview.ctaLabel ?? 'Detail')}</a>`
            : ''
        }
      </div>
    </article>
  `;
};

const transformBuilderHtml = (builder: BuilderValue, products: MicrositeProductPayload[]) => {
  if (!builder.html) {
    return { html: '', css: builder.css ?? '' };
  }

  if (typeof window === 'undefined') {
    return { html: builder.html, css: builder.css ?? '' };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(builder.html, 'text/html');

    const gridNodes = Array.from(doc.querySelectorAll('[data-microshop-block="product-grid"]'));
    const sortedProducts = products
      .map((product, index) => ({ product, index }))
      .sort((a, b) => {
        const positionA = typeof a.product.position === 'number' ? a.product.position : a.index;
        const positionB = typeof b.product.position === 'number' ? b.product.position : b.index;
        return positionA - positionB;
      })
      .map((entry) => entry.product)
      .filter((product) => (product.visible ?? true) && (product.active ?? true));

    gridNodes.forEach((node) => {
      node.querySelectorAll('[data-sample]').forEach((sample) => {
        if (sample === node) {
          sample.removeAttribute('data-sample');
          return;
        }
        if ((sample as HTMLElement).classList.contains('grid')) {
          sample.removeAttribute('data-sample');
          sample.innerHTML = '';
          return;
        }
        sample.remove();
      });
      const limitAttr = node.getAttribute('data-limit');
      const limit = limitAttr ? Number.parseInt(limitAttr, 10) : undefined;
      const cardStyle = node.getAttribute('data-card-style') ?? undefined;
      node.querySelectorAll('.grid').forEach((existing) => existing.remove());
      const gridContainer = doc.createElement('div');
      gridContainer.className = 'grid';
      node.appendChild(gridContainer);
      const target = gridContainer;
      const selected = Number.isFinite(limit) && limit ? sortedProducts.slice(0, limit) : sortedProducts;
      selected.forEach((product) => {
        const fragment = doc.createRange().createContextualFragment(createProductCardMarkup(product, cardStyle));
        target.appendChild(fragment);
      });
    });

    const body = doc.body;
    const html = body ? body.innerHTML : builder.html;

    return {
      html,
      css: builder.css ?? '',
    };
  } catch (error) {
    console.error('Microsite preview transform failed', error);
    return { html: builder.html, css: builder.css ?? '' };
  }
};

type MicrositePreviewProps = {
  builder: BuilderValue | null;
  products: MicrositeProductPayload[];
  theme?: ThemeSettings;
  sections?: MicrositeSection[];
};

export const MicrositePreview = ({ builder, products, theme, sections }: MicrositePreviewProps) => {
  const processed = useMemo(() => {
    if (!builder || !builder.html) {
      return null;
    }

    return transformBuilderHtml(builder, products);
  }, [builder, products]);

  const iframe =
    processed && processed.html ? (
      <Card withBorder padding={0} radius="lg" style={{ overflow: 'hidden' }}>
        <iframe
          title="Microsite preview"
          srcDoc={`<style>${PREVIEW_BASE_CSS}${DEFAULT_TEMPLATE_CSS}${processed.css ?? ''}</style>${processed.html}`}
          style={{ border: 'none', width: '100%', minHeight: 720 }}
          sandbox="allow-same-origin"
        />
      </Card>
    ) : (
      <Card withBorder padding="xl" radius="lg">
        <Text c="dimmed">Přidej bloky do builderu, aby bylo možné zobrazit náhled microshopu.</Text>
      </Card>
    );

  return (
    <Stack gap="md">
      {iframe}
      {theme ? <ThemePreview value={theme} /> : null}
      {sections ? <SectionsPreview sections={sections} /> : null}
    </Stack>
  );
};
