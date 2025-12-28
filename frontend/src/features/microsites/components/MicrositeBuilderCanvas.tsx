import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent, UniqueIdentifier } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Switch,
} from '@mantine/core';
import { IconGripVertical, IconPlus, IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BuilderValue } from '../types';
import '../styles/microsite-builder.css';
import { ImageUploadInput } from './ImageUploadInput';

const createId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

type BuilderBlockType = 'hero' | 'text' | 'cta' | 'product-grid' | 'image-banner' | 'split';

type BuilderBlock = {
  id: string;
  type: BuilderBlockType;
  data: Record<string, unknown>;
};

type BlockTemplate = {
  type: BuilderBlockType;
  label: string;
  description: string;
  defaults: Record<string, unknown>;
};

const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const asArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [];
const serializeBullets = (input: string): string[] =>
  input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
const asNumber = (value: unknown, fallback?: number): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};
const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (value: string): string =>
  escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const BLOCK_TEMPLATES: BlockTemplate[] = [
  {
    type: 'hero',
    label: 'Hero sekce',
    description: 'Velký úvod s nadpisem, podtitulem a tlačítkem.',
    defaults: {
      eyebrow: 'Limitovaná kolekce',
      title: 'Vůně, které definují tvého zákazníka',
      description:
        'Kurátorovaný výběr niche parfémů připravený ke sdílení během minut. Přidej produkty a sdílej microshop s klienty.',
      ctaLabel: 'Otevřít microshop',
      ctaUrl: '#kontakt',
      background: '#10131f',
      backgroundImage: '',
      overlay: 'linear-gradient(135deg, rgba(15, 23, 42, 0.65), rgba(15, 23, 42, 0.35))',
      alignment: 'left',
    },
  },
  {
    type: 'text',
    label: 'Textový blok',
    description: 'Nadpis a odstavec pro rychlé sdělení.',
    defaults: {
      eyebrow: 'Manifest kolekce',
      title: 'Proč microshop',
      body: 'Microshop je ideální pro VIP klientelu, rychlé kampaně nebo privátní předprodeje. Připravíš ho během minut.',
      alignment: 'left',
      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(244, 247, 255, 0.9))',
      accentColor: '#0f172a',
    },
  },
  {
    type: 'product-grid',
    label: 'Mřížka produktů',
    description: 'Automaticky naplněno produkty z výběru níže.',
    defaults: {
      heading: 'Výběr produktů',
      subheading: 'Produkty z HUBu – pořadí a obsah nastavíš v sekci Produkty.',
      eyebrow: 'Kolekce',
      limit: 6,
      columns: 3,
      cardStyle: 'elevated',
    },
  },
  {
    type: 'image-banner',
    label: 'Obrázkový banner',
    description: 'Plnobarevný banner s titulkem a výzvou k akci.',
    defaults: {
      title: 'Signature kolekce SANTAL',
      subtitle: 'Prémiová limitovaná edice dostupná jen na pozvání.',
      imageUrl: '',
      alignment: 'center',
      ctaLabel: 'Zjistit více',
      ctaUrl: '#kontakt',
      overlayColor: 'rgba(15, 23, 42, 0.5)',
      overlayOpacity: 62,
    },
  },
  {
    type: 'split',
    label: 'Sekce s obrázkem',
    description: 'Dvě sloupce s textem a vizuálem.',
    defaults: {
      eyebrow: 'Kurátorovaný výběr',
      title: 'Každý produkt vypráví příběh',
      body:
        'Kombinuj produkty, benefitní bullet body a příběh kolekce. Díky tomu působí microshop konzistentně a přehledně.',
      imageUrl: '',
      imagePosition: 'right',
      bullets: ['Prémiové marže', 'Publikace během minut', 'Napojení na Stripe Checkout'],
      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(244, 247, 255, 0.9))',
      ctaLabel: 'Zjistit více',
      ctaUrl: '#kontakt',
    },
  },
  {
    type: 'cta',
    label: 'CTA banner',
    description: 'Výzva k akci s krátkým popisem.',
    defaults: {
      eyebrow: 'Připravení udělat další krok?',
      title: 'Rezervuj si microshop pro své VIP zákazníky.',
      ctaLabel: 'Chci svůj microshop',
      ctaUrl: '#kontakt',
      alignment: 'center',
      backgroundFrom: '#6366f1',
      backgroundTo: '#22d3ee',
      textColor: '#ffffff',
    },
  },
];

const BUILDER_BASE_CSS = `
:root {
  --microshop-card-shadow: 0 30px 60px rgba(15, 23, 42, 0.12);
  --microshop-card-radius: 28px;
}
.microshop-hero {
  position: relative;
  padding: 96px 64px;
  border-radius: 36px;
  background: var(--microshop-hero-bg, linear-gradient(135deg, #0f172a, #1e293b));
  color: #fff;
  overflow: hidden;
  box-shadow: 0 32px 80px rgba(15, 23, 42, 0.45);
  isolation: isolate;
}
.microshop-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--microshop-hero-image, none) center / cover no-repeat;
  opacity: 0.28;
  transform: scale(1.02);
  z-index: 1;
}
.microshop-hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--microshop-hero-overlay, radial-gradient(circle at top right, rgba(148, 163, 184, 0.2), transparent 55%));
  pointer-events: none;
  z-index: 2;
}
.microshop-hero-eyebrow {
  display: inline-flex;
  font-size: 14px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  margin-bottom: 16px;
  padding: 8px 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
}
.microshop-hero h1 {
  font-size: clamp(42px, 4vw, 56px);
  line-height: 1.05;
  margin: 0 0 18px;
  max-width: 780px;
}
.microshop-hero p {
  font-size: 18px;
  margin: 0 0 28px;
  max-width: 560px;
  color: rgba(255, 255, 255, 0.86);
}
.microshop-hero .cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14px 28px;
  border-radius: 999px;
  background: #fff;
  color: #0f172a;
  font-weight: 600;
  text-decoration: none;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.2);
}
.microshop-hero[data-align='center'] {
  text-align: center;
  align-items: center;
}
.microshop-hero[data-align='center'] .microshop-hero-eyebrow {
  margin-inline: auto;
}
.microshop-hero[data-align='center'] h1,
.microshop-hero[data-align='center'] p {
  margin-left: auto;
  margin-right: auto;
}
.microshop-hero[data-align='right'] {
  text-align: right;
  align-items: flex-end;
}
.microshop-text {
  padding: 48px;
  border-radius: 28px;
  background: var(--microshop-text-bg, linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(244, 247, 255, 0.9)));
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
}
.microshop-text h2 {
  margin: 0 0 16px;
  font-size: 32px;
  color: var(--microshop-text-accent, #0f172a);
}
.microshop-text p {
  margin: 0;
  font-size: 18px;
  color: #334155;
  line-height: 1.6;
}
.microshop-text-eyebrow {
  display: inline-flex;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  color: var(--microshop-text-accent, #0f172a);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-size: 12px;
  margin-bottom: 12px;
}
.microshop-text[data-align='center'] {
  text-align: center;
}
.microshop-text[data-align='center'] .microshop-text-eyebrow {
  margin-left: auto;
  margin-right: auto;
}
.microshop-product-grid {
  padding: 48px 0;
}
.microshop-product-grid h2 {
  text-align: center;
  margin-bottom: 16px;
  font-size: 34px;
  color: #0f172a;
}
.microshop-product-grid p {
  color: #475569;
  font-size: 16px;
}
.microshop-product-grid .grid {
  display: grid;
  gap: 32px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}
.microshop-product-grid[data-columns='2'] .grid {
  grid-template-columns: repeat(2, minmax(280px, 1fr));
}
.microshop-product-grid[data-columns='4'] .grid {
  grid-template-columns: repeat(4, minmax(220px, 1fr));
}
.microshop-product-card {
  position: relative;
  background: #ffffff;
  border-radius: 28px;
  padding: 28px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--microshop-card-shadow);
  border: 1px solid rgba(15, 23, 42, 0.04);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.microshop-product-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 36px 70px rgba(15, 23, 42, 0.16);
}
.microshop-product-card[data-style='glass'] {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #f8fafc;
  box-shadow: 0 30px 60px rgba(15, 23, 42, 0.35);
}
.microshop-product-grid[data-card-style='glass'] .microshop-product-card {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #f8fafc;
  box-shadow: 0 30px 60px rgba(15, 23, 42, 0.35);
}
.microshop-product-card[data-style='minimal'] {
  box-shadow: none;
  border: 1px solid rgba(15, 23, 42, 0.08);
}
.microshop-product-grid[data-card-style='minimal'] .microshop-product-card {
  box-shadow: none;
  border: 1px solid rgba(15, 23, 42, 0.08);
}
.microshop-product-badge {
  position: absolute;
  top: 24px;
  left: 24px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.88);
  color: #fff;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.32);
}
.microshop-product-card img {
  width: 100%;
  border-radius: 22px;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
}
.microshop-product-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 4 / 5;
  border-radius: 22px;
  background: linear-gradient(135deg, #e2e8f0, #f8fafc);
  color: #64748b;
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.microshop-product-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 18px 0 8px;
}
.microshop-product-tags span {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  color: #475569;
}
.microshop-product-card h3 {
  margin: 12px 0 8px;
  font-size: 20px;
  color: #0f172a;
}
.microshop-product-eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.28em;
  font-size: 12px;
  color: #475569;
  margin: 12px 0 4px;
}
.microshop-product-card[data-style='glass'] .microshop-product-eyebrow,
.microshop-product-grid[data-card-style='glass'] .microshop-product-card .microshop-product-eyebrow {
  color: #cbd5e1;
}
.microshop-product-card p {
  color: #475569;
  margin: 0 0 18px;
  min-height: 52px;
  line-height: 1.6;
}
.microshop-product-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.microshop-product-card .price {
  font-weight: 700;
  font-size: 20px;
  color: #0f172a;
}
.microshop-product-card[data-style='glass'] .price {
  color: #e2e8f0;
}
.microshop-product-grid[data-card-style='glass'] .microshop-product-card .price {
  color: #e2e8f0;
}
.microshop-product-card .cta {
  display: inline-flex;
  padding: 10px 20px;
  border-radius: 999px;
  background: #0f172a;
  color: #fff;
  text-decoration: none;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.microshop-product-card[data-style='glass'] .cta {
  background: rgba(255, 255, 255, 0.9);
  color: #0f172a;
}
.microshop-product-grid[data-card-style='glass'] .microshop-product-card .cta {
  background: rgba(255, 255, 255, 0.9);
  color: #0f172a;
}
.microshop-cta {
  padding: 72px;
  border-radius: 32px;
  text-align: center;
  background: linear-gradient(
    135deg,
    var(--microshop-cta-from, #6366f1),
    var(--microshop-cta-to, #22d3ee)
  );
  color: var(--microshop-cta-text, #fff);
  box-shadow: 0 28px 64px rgba(15, 23, 42, 0.24);
}
.microshop-cta p {
  max-width: 520px;
  margin: 14px auto 26px;
  font-size: 18px;
}
.microshop-cta .cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14px 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #0f172a;
  text-decoration: none;
  font-weight: 600;
}
.microshop-cta[data-align='left'] {
  text-align: left;
}
.microshop-cta[data-align='left'] p {
  margin-left: 0;
}
.microshop-image-banner {
  position: relative;
  border-radius: 36px;
  overflow: hidden;
  min-height: 320px;
  padding: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: #0f172a;
}
.microshop-image-banner::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--microshop-banner-image) center / cover no-repeat;
  opacity: 0.85;
  transform: scale(1.02);
}
.microshop-image-banner::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--microshop-banner-overlay, linear-gradient(135deg, rgba(15, 23, 42, 0.5), rgba(15, 23, 42, 0.2)));
  opacity: var(--microshop-banner-opacity, 1);
}
.microshop-image-banner-content {
  position: relative;
  max-width: 720px;
  text-align: center;
}
.microshop-image-banner[data-align='left'] {
  justify-content: flex-start;
}
.microshop-image-banner[data-align='left'] .microshop-image-banner-content {
  text-align: left;
}
.microshop-image-banner[data-align='right'] {
  justify-content: flex-end;
}
.microshop-image-banner[data-align='right'] .microshop-image-banner-content {
  text-align: right;
}
.microshop-image-banner h2 {
  font-size: clamp(36px, 3.2vw, 52px);
  margin-bottom: 16px;
}
.microshop-image-banner p {
  font-size: 18px;
  margin-bottom: 24px;
  color: rgba(255, 255, 255, 0.86);
}
.microshop-image-banner .cta {
  display: inline-flex;
  padding: 12px 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  color: #0f172a;
  font-weight: 600;
  text-decoration: none;
}
.microshop-split {
  display: flex;
  flex-wrap: wrap;
  gap: 40px;
  align-items: center;
  border-radius: 32px;
  padding: 64px;
  background: var(--microshop-split-bg, linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(244, 247, 255, 0.9)));
  box-shadow: 0 28px 64px rgba(15, 23, 42, 0.1);
}
.microshop-split-media,
.microshop-split-content {
  flex: 1 1 320px;
  min-width: 280px;
}
.microshop-split-media img {
  width: 100%;
  border-radius: 28px;
  object-fit: cover;
  box-shadow: 0 22px 48px rgba(15, 23, 42, 0.18);
}
.microshop-split[data-position='right'] .microshop-split-media {
  order: 2;
}
.microshop-split[data-position='right'] .microshop-split-content {
  order: 1;
}
.microshop-split-eyebrow {
  display: inline-flex;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(79, 70, 229, 0.12);
  color: #4f46e5;
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-bottom: 16px;
}
.microshop-split h3 {
  font-size: 32px;
  margin: 0 0 16px;
  color: #0f172a;
}
.microshop-split p {
  font-size: 17px;
  color: #475569;
  line-height: 1.6;
  margin-bottom: 20px;
}
.microshop-split-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 22px;
  border-radius: 999px;
  background: #0f172a;
  color: #fff;
  text-decoration: none;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.microshop-split-bullets {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.microshop-split-bullets li {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: #1f2937;
}
.microshop-split-bullets li::before {
  content: '•';
  font-size: 20px;
  color: #6366f1;
}
`;

type MicrositeBuilderCanvasProps = {
  value: BuilderValue | null;
  onChange: (value: BuilderValue) => void;
};

const deserializeBlocks = (value: BuilderValue | null): BuilderBlock[] => {
  if (!value || !Array.isArray(value.components)) {
    return [];
  }

  const raw = value.components as Array<{ id?: string; type?: string; data?: Record<string, unknown> }>;
  return raw
    .filter((item) => item && typeof item.type === 'string')
    .map((item) => ({
      id: item.id ?? createId(),
      type: (item.type as BuilderBlockType) ?? 'text',
      data: { ...(item.data ?? {}) },
    }));
};

const renderBlockHtml = (block: BuilderBlock): string => {
  switch (block.type) {
    case 'hero': {
      const background = asString(block.data.background, '#10131f');
      const overlay = asString(
        block.data.overlay,
        'linear-gradient(135deg, rgba(15, 23, 42, 0.65), rgba(15, 23, 42, 0.35))'
      );
      const backgroundImage = asString(block.data.backgroundImage);
      const eyebrow = asString(block.data.eyebrow);
      const title = asString(block.data.title, 'Nadpis hero sekce');
      const description = asString(block.data.description);
      const ctaLabel = asString(block.data.ctaLabel);
      const ctaUrl = asString(block.data.ctaUrl, '#');
      const alignmentRaw = asString(block.data.alignment, 'left');
      const alignment = ['left', 'center', 'right'].includes(alignmentRaw) ? alignmentRaw : 'left';
      const styleParts = [`--microshop-hero-bg: ${escapeAttr(background)}`, `--microshop-hero-overlay: ${escapeAttr(overlay)}`];
      if (backgroundImage) {
        styleParts.push(`--microshop-hero-image: url('${escapeAttr(backgroundImage)}')`);
      }
      const styleAttr = styleParts.length ? ` style="${styleParts.join(';')}"` : '';
      return `
        <section class="microshop-hero" data-align="${alignment}"${styleAttr}>
          ${eyebrow ? `<div class="microshop-hero-eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
          <h1>${escapeHtml(title)}</h1>
          ${description ? `<p>${escapeHtml(description)}</p>` : ''}
          ${
            ctaLabel
              ? `<a class="cta" href="${escapeAttr(ctaUrl)}">${escapeHtml(ctaLabel)}</a>`
              : ''
          }
        </section>
      `;
    }
    case 'text': {
      const eyebrow = asString(block.data.eyebrow);
      const title = asString(block.data.title, 'Textový blok');
      const body = asString(block.data.body);
      const alignmentRaw = asString(block.data.alignment, 'left');
      const alignment = ['left', 'center', 'right'].includes(alignmentRaw) ? alignmentRaw : 'left';
      const background = asString(
        block.data.background,
        'linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(244, 247, 255, 0.9))'
      );
      const accentColor = asString(block.data.accentColor, '#0f172a');
      const styleParts = [`--microshop-text-bg: ${escapeAttr(background)}`, `--microshop-text-accent: ${escapeAttr(accentColor)}`];
      const styleAttr = styleParts.length ? ` style="${styleParts.join(';')}"` : '';
      return `
        <section class="microshop-text" data-align="${alignment}"${styleAttr}>
          ${eyebrow ? `<span class="microshop-text-eyebrow">${escapeHtml(eyebrow)}</span>` : ''}
          <h2>${escapeHtml(title)}</h2>
          ${body ? `<p>${escapeHtml(body)}</p>` : ''}
        </section>
      `;
    }
    case 'product-grid': {
      const heading = asString(block.data.heading, 'Vybrané produkty');
      const subheading = asString(block.data.subheading);
      const eyebrow = asString(block.data.eyebrow);
      const limit = asNumber(block.data.limit);
      const columns = asNumber(block.data.columns);
      const cardStyle = asString(block.data.cardStyle, 'elevated');
      const attrs: string[] = ['data-microshop-block="product-grid"'];
      if (limit) {
        attrs.push(`data-limit="${Number(limit)}"`);
      }
      if (columns) {
        attrs.push(`data-columns="${Number(columns)}"`);
      }
      if (cardStyle) {
        attrs.push(`data-card-style="${escapeAttr(cardStyle)}"`);
      }
      return `
        <section class="microshop-product-grid" ${attrs.join(' ')}>
          ${eyebrow ? `<p style="text-align:center; letter-spacing:0.2em; text-transform:uppercase;">${escapeHtml(eyebrow)}</p>` : ''}
          <h2>${escapeHtml(heading)}</h2>
          ${
            subheading
              ? `<p style="text-align:center;color:#475569;max-width:520px;margin:0 auto 32px;">${escapeHtml(subheading)}</p>`
              : ''
          }
          <div class="grid" data-sample="true">
            <article class="microshop-product-card" data-style="${escapeAttr(cardStyle)}" data-sample="true">
              <div class="microshop-product-image-placeholder" data-sample="true">Obrázek produktu</div>
              <div class="microshop-product-tags" data-sample="true">
                <span>Novinka</span>
                <span>Limitka</span>
              </div>
              <h3 data-sample="true">Produkt z HUBu</h3>
              <p data-sample="true">Skutečné produkty se zobrazí po publikaci microshopu.</p>
              <div class="microshop-product-footer">
                <span class="price" data-sample="true">1 290 CZK</span>
                <span class="cta" data-sample="true">Detail</span>
              </div>
            </article>
          </div>
        </section>
      `;
    }
    case 'image-banner': {
      const title = asString(block.data.title, 'Objev Signature kolekci');
      const subtitle = asString(block.data.subtitle);
      const imageUrl = asString(block.data.imageUrl);
      const ctaLabel = asString(block.data.ctaLabel);
      const ctaUrl = asString(block.data.ctaUrl, '#');
      const alignmentRaw = asString(block.data.alignment, 'center');
      const alignment = ['left', 'right', 'center'].includes(alignmentRaw) ? alignmentRaw : 'center';
      const overlayColor = asString(block.data.overlayColor, 'rgba(15, 23, 42, 0.5)');
      const overlayOpacity = asNumber(block.data.overlayOpacity);
      const styleParts: string[] = [`--microshop-banner-overlay: ${escapeAttr(overlayColor)}`];
      if (imageUrl) {
        styleParts.push(`--microshop-banner-image: url('${escapeAttr(imageUrl)}')`);
      }
      if (typeof overlayOpacity === 'number') {
        const clamped = Math.min(Math.max(overlayOpacity, 0), 100) / 100;
        styleParts.push(`--microshop-banner-opacity: ${clamped}`);
      }
      const styleAttr = styleParts.length ? ` style="${styleParts.join(';')}"` : '';
      return `
        <section class="microshop-image-banner" data-align="${alignment}"${styleAttr}>
          <div class="microshop-image-banner-content">
            <h2>${escapeHtml(title)}</h2>
            ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
            ${
              ctaLabel
                ? `<a class="cta" href="${escapeAttr(ctaUrl)}">${escapeHtml(ctaLabel)}</a>`
                : ''
            }
          </div>
        </section>
      `;
    }
    case 'split': {
      const eyebrow = asString(block.data.eyebrow);
      const title = asString(block.data.title, 'Sekce s obrázkem');
      const body = asString(block.data.body);
      const imageUrl = asString(block.data.imageUrl);
      const imageAlt = asString(block.data.imageAlt, title);
      const bullets = asArray(block.data.bullets);
      const positionRaw = asString(block.data.imagePosition, 'right');
      const position = ['left', 'right'].includes(positionRaw) ? positionRaw : 'right';
      const background = asString(
        block.data.background,
        'linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(244, 247, 255, 0.9))'
      );
      const ctaLabel = asString(block.data.ctaLabel);
      const ctaUrl = asString(block.data.ctaUrl);
      const bulletsHtml =
        bullets.length > 0
          ? `<ul class="microshop-split-bullets">${bullets
              .map((item) => `<li>${escapeHtml(item)}</li>`)
              .join('')}</ul>`
          : '';
      const media =
        imageUrl !== ''
          ? `<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(imageAlt)}" />`
          : '<div class="microshop-product-image-placeholder" style="aspect-ratio:16/10;">Nahraj vizuál</div>';
      return `
        <section class="microshop-split" data-position="${position}" style="--microshop-split-bg: ${escapeAttr(background)}">
          <div class="microshop-split-media">
            ${media}
          </div>
          <div class="microshop-split-content">
            ${eyebrow ? `<span class="microshop-split-eyebrow">${escapeHtml(eyebrow)}</span>` : ''}
            <h3>${escapeHtml(title)}</h3>
            ${body ? `<p>${escapeHtml(body)}</p>` : ''}
            ${bulletsHtml}
            ${
              ctaLabel && ctaUrl
                ? `<a class="microshop-split-cta" href="${escapeAttr(ctaUrl)}">${escapeHtml(ctaLabel)}</a>`
                : ''
            }
          </div>
        </section>
      `;
    }
    case 'cta': {
      const eyebrow = asString(block.data.eyebrow);
      const title = asString(block.data.title, 'Připravení udělat další krok?');
      const description = asString(block.data.description);
      const ctaLabel = asString(block.data.ctaLabel);
      const ctaUrl = asString(block.data.ctaUrl, '#');
      const bgFrom = asString(block.data.backgroundFrom, '#6366f1');
      const bgTo = asString(block.data.backgroundTo, '#22d3ee');
      const textColor = asString(block.data.textColor, '#ffffff');
      const alignmentRaw = asString(block.data.alignment, 'center');
      const alignment = ['left', 'center', 'right'].includes(alignmentRaw) ? alignmentRaw : 'center';
      const styleAttr = ` style="--microshop-cta-from: ${escapeAttr(bgFrom)}; --microshop-cta-to: ${escapeAttr(bgTo)}; --microshop-cta-text: ${escapeAttr(
        textColor
      )}; color: ${escapeAttr(textColor)}"`;
      return `
        <section class="microshop-cta" data-align="${alignment}"${styleAttr}>
          ${eyebrow ? `<div class="microshop-hero-eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
          <h2>${escapeHtml(title)}</h2>
          ${description ? `<p>${escapeHtml(description)}</p>` : ''}
          ${
            ctaLabel
              ? `<a class="cta" href="${escapeAttr(ctaUrl)}">${escapeHtml(ctaLabel)}</a>`
              : ''
          }
        </section>
      `;
    }
    default:
      return '';
  }
};

const serializeBlocks = (blocks: BuilderBlock[]): BuilderValue => ({
  html: blocks.map(renderBlockHtml).join('\n'),
  css: BUILDER_BASE_CSS,
  components: blocks.map(({ id, type, data }) => ({ id, type, data })),
  styles: [],
});

type SortableBlockProps = {
  block: BuilderBlock;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
};

const SortableBlock = ({ block, isSelected, onSelect, onDuplicate, onRemove }: SortableBlockProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Card
      ref={setNodeRef}
      withBorder
      padding="md"
      radius="lg"
      className={`microshop-builder-block ${isSelected ? 'microshop-builder-block--active' : ''} ${
        isDragging ? 'microshop-builder-block--dragging' : ''
      }`}
      style={style}
      onClick={() => onSelect(block.id)}
    >
      <Group justify="space-between" align="center" mb="sm">
        <Group gap="xs" align="center">
          <ActionIcon variant="subtle" {...attributes} {...listeners}>
            <IconGripVertical size={16} />
          </ActionIcon>
          <Badge color="dark" variant="light">
            {BLOCK_TEMPLATES.find((tpl) => tpl.type === block.type)?.label ?? block.type}
          </Badge>
        </Group>
        <Group gap="xs">
          <Button variant="subtle" size="xs" onClick={(event) => { event.stopPropagation(); onDuplicate(block.id); }}>
            Duplikovat
          </Button>
          <ActionIcon
            color="red"
            variant="subtle"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(block.id);
            }}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Group>
      <Text size="sm" c="dimmed">
        {BLOCK_TEMPLATES.find((tpl) => tpl.type === block.type)?.description}
      </Text>
    </Card>
  );
};

const PaletteItem = ({ template, onAdd }: { template: BlockTemplate; onAdd: (template: BlockTemplate) => void }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${template.type}`,
    data: { source: 'palette', template },
  });

  return (
    <Card
      ref={setNodeRef}
      withBorder
      padding="sm"
      radius="md"
      className={`microshop-builder-palette-item ${isDragging ? 'microshop-builder-palette-item--dragging' : ''}`}
      onClick={() => onAdd(template)}
      {...attributes}
      {...listeners}
    >
      <Text fw={600}>{template.label}</Text>
      <Text size="sm" c="dimmed">
        {template.description}
      </Text>
      <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} mt="xs">
        Přidat blok
      </Button>
    </Card>
  );
};

const Inspector = ({
  block,
  onUpdate,
}: {
  block: BuilderBlock | null;
  onUpdate: (patch: Record<string, unknown>) => void;
}) => {
  if (!block) {
    return (
      <Card
        withBorder
        padding="md"
        radius="lg"
        className="microshop-builder-inspector"
      >
        <Text size="sm" c="dimmed">
          Vyber blok na plátně a uprav jeho obsah.
        </Text>
      </Card>
    );
  }

  const patch = (key: string, value: unknown) => onUpdate({ [key]: value });

  switch (block.type) {
    case 'hero':
      return (
        <Card
          withBorder
          padding="md"
          radius="lg"
          className="microshop-builder-inspector"
        >
          <Stack gap="sm">
            <Text fw={600}>Nastavení hero sekce</Text>
            <TextInput
              label="Eyebrow"
              value={(block.data.eyebrow as string) ?? ''}
              onChange={(event) => patch('eyebrow', event.currentTarget.value)}
            />
            <TextInput
              label="Titulek"
              value={(block.data.title as string) ?? ''}
              onChange={(event) => patch('title', event.currentTarget.value)}
            />
            <Textarea
              label="Popis"
              minRows={3}
              value={(block.data.description as string) ?? ''}
              onChange={(event) => patch('description', event.currentTarget.value)}
            />
            <Group gap="sm">
              <TextInput
                label="CTA text"
                value={(block.data.ctaLabel as string) ?? ''}
                onChange={(event) => patch('ctaLabel', event.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <TextInput
                label="CTA URL"
                value={(block.data.ctaUrl as string) ?? ''}
                onChange={(event) => patch('ctaUrl', event.currentTarget.value)}
                style={{ flex: 1 }}
              />
            </Group>
            <TextInput
              label="Pozadí (barva nebo gradient)"
              value={(block.data.background as string) ?? '#10131f'}
              onChange={(event) => patch('background', event.currentTarget.value)}
            />
            <ImageUploadInput
              label="Pozadí (obrázek)"
              description="Volitelné – nahraje se jako textura přes barvu."
              value={(block.data.backgroundImage as string) ?? ''}
              onChange={(value) => patch('backgroundImage', value)}
            />
            <TextInput
              label="Overlay přes pozadí"
              description="Např. rgba(12,16,32,0.5) nebo gradient."
              value={(block.data.overlay as string) ?? ''}
              onChange={(event) => patch('overlay', event.currentTarget.value)}
            />
            <Select
              label="Zarovnání obsahu"
              data={[
                { value: 'left', label: 'Vlevo' },
                { value: 'center', label: 'Na střed' },
                { value: 'right', label: 'Vpravo' },
              ]}
              value={['left', 'center', 'right'].includes(asString(block.data.alignment)) ? (block.data.alignment as string) : 'left'}
              onChange={(value) => patch('alignment', value ?? 'left')}
            />
          </Stack>
        </Card>
      );
    case 'text':
      return (
        <Card
          withBorder
          padding="md"
          radius="lg"
          className="microshop-builder-inspector"
        >
          <Stack gap="sm">
            <Text fw={600}>Textový blok</Text>
            <TextInput
              label="Eyebrow"
              value={(block.data.eyebrow as string) ?? ''}
              onChange={(event) => patch('eyebrow', event.currentTarget.value)}
            />
            <TextInput
              label="Titulek"
              value={(block.data.title as string) ?? ''}
              onChange={(event) => patch('title', event.currentTarget.value)}
            />
            <Textarea
              label="Text"
              minRows={4}
              value={(block.data.body as string) ?? ''}
              onChange={(event) => patch('body', event.currentTarget.value)}
            />
            <TextInput
              label="Pozadí (barva/gradient)"
              value={(block.data.background as string) ?? ''}
              onChange={(event) => patch('background', event.currentTarget.value)}
            />
            <TextInput
              label="Akcent barva"
              value={(block.data.accentColor as string) ?? ''}
              onChange={(event) => patch('accentColor', event.currentTarget.value)}
            />
            <Select
              label="Zarovnání"
              data={[
                { value: 'left', label: 'Vlevo' },
                { value: 'center', label: 'Na střed' },
                { value: 'right', label: 'Vpravo' },
              ]}
              value={['left', 'center', 'right'].includes(asString(block.data.alignment)) ? (block.data.alignment as string) : 'left'}
              onChange={(value) => patch('alignment', value ?? 'left')}
            />
          </Stack>
        </Card>
      );
    case 'product-grid':
      return (
        <Card
          withBorder
          padding="md"
          radius="lg"
          className="microshop-builder-inspector"
        >
          <Stack gap="sm">
            <Text fw={600}>Produktová mřížka</Text>
            <TextInput
              label="Titulek"
              value={(block.data.heading as string) ?? ''}
              onChange={(event) => patch('heading', event.currentTarget.value)}
            />
            <TextInput
              label="Eyebrow"
              value={(block.data.eyebrow as string) ?? ''}
              onChange={(event) => patch('eyebrow', event.currentTarget.value)}
            />
            <Textarea
              label="Podtitulek"
              minRows={2}
              value={(block.data.subheading as string) ?? ''}
              onChange={(event) => patch('subheading', event.currentTarget.value)}
            />
            <NumberInput
              label="Maximální počet produktů"
              value={typeof block.data.limit === 'number' ? (block.data.limit as number) : undefined}
              onChange={(value) => patch('limit', typeof value === 'number' ? value : null)}
              min={1}
            />
            <Select
              label="Počet sloupců"
              data={[
                { value: '2', label: '2 sloupce' },
                { value: '3', label: '3 sloupce (výchozí)' },
                { value: '4', label: '4 sloupce' },
              ]}
              value={String(
                typeof block.data.columns === 'number' && [2, 3, 4].includes(block.data.columns) ? block.data.columns : 3
              )}
              onChange={(value) => patch('columns', value ? Number(value) : null)}
            />
            <Select
              label="Styl karet"
              data={[
                { value: 'elevated', label: 'Vyvýšené karty' },
                { value: 'glass', label: 'Skleněný efekt' },
                { value: 'minimal', label: 'Minimal' },
              ]}
              value={asString(block.data.cardStyle, 'elevated')}
              onChange={(value) => patch('cardStyle', value ?? 'elevated')}
            />
          </Stack>
        </Card>
      );
    case 'image-banner':
      return (
        <Card
          withBorder
          padding="md"
          radius="lg"
          className="microshop-builder-inspector"
        >
          <Stack gap="sm">
            <Text fw={600}>Obrázkový banner</Text>
            <ImageUploadInput
              label="Obrázek"
              description="Nahraj hero vizuál nebo vlož URL."
              value={asString(block.data.imageUrl)}
              onChange={(value) => patch('imageUrl', value)}
            />
            <TextInput
              label="Titulek"
              value={asString(block.data.title)}
              onChange={(event) => patch('title', event.currentTarget.value)}
            />
            <Textarea
              label="Podtitulek"
              minRows={3}
              value={asString(block.data.subtitle)}
              onChange={(event) => patch('subtitle', event.currentTarget.value)}
            />
            <Group gap="sm">
              <TextInput
                label="CTA text"
                value={asString(block.data.ctaLabel)}
                onChange={(event) => patch('ctaLabel', event.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <TextInput
                label="CTA URL"
                value={asString(block.data.ctaUrl)}
                onChange={(event) => patch('ctaUrl', event.currentTarget.value)}
                style={{ flex: 1 }}
              />
            </Group>
            <TextInput
              label="Overlay přes obrázek"
              description="Např. rgba(12,16,32,0.55)"
              value={asString(block.data.overlayColor)}
              onChange={(event) => patch('overlayColor', event.currentTarget.value)}
            />
            <NumberInput
              label="Sytost overlay (%)"
              value={typeof block.data.overlayOpacity === 'number' ? (block.data.overlayOpacity as number) : 62}
              onChange={(value) => patch('overlayOpacity', typeof value === 'number' ? value : 62)}
              min={0}
              max={100}
            />
            <Select
              label="Zarovnání obsahu"
              data={[
                { value: 'left', label: 'Vlevo' },
                { value: 'center', label: 'Na střed' },
                { value: 'right', label: 'Vpravo' },
              ]}
              value={['left', 'right', 'center'].includes(asString(block.data.alignment)) ? (block.data.alignment as string) : 'center'}
              onChange={(value) => patch('alignment', value ?? 'center')}
            />
          </Stack>
        </Card>
      );
    case 'split': {
      const imagePosition = asString(block.data.imagePosition, 'right');
      return (
        <Card
          withBorder
          padding="md"
          radius="lg"
          className="microshop-builder-inspector"
        >
          <Stack gap="sm">
            <Text fw={600}>Sekce s obrázkem</Text>
            <ImageUploadInput
              label="Obrázek"
              description="Vizuál, který doplní text."
              value={asString(block.data.imageUrl)}
              onChange={(value) => patch('imageUrl', value)}
            />
            <TextInput
              label="Alternativní text obrázku"
              value={asString(block.data.imageAlt)}
              onChange={(event) => patch('imageAlt', event.currentTarget.value)}
            />
            <Switch
              label="Obrázek vlevo"
              checked={imagePosition === 'left'}
              onChange={(event) => patch('imagePosition', event.currentTarget.checked ? 'left' : 'right')}
            />
            <TextInput
              label="Eyebrow"
              value={asString(block.data.eyebrow)}
              onChange={(event) => patch('eyebrow', event.currentTarget.value)}
            />
            <TextInput
              label="Titulek"
              value={asString(block.data.title)}
              onChange={(event) => patch('title', event.currentTarget.value)}
            />
            <Textarea
              label="Popis"
              minRows={3}
              value={asString(block.data.body)}
              onChange={(event) => patch('body', event.currentTarget.value)}
            />
            <Textarea
              label="Bullet body (každý na nový řádek)"
              minRows={3}
              value={asArray(block.data.bullets).join('\n')}
              onChange={(event) => patch('bullets', serializeBullets(event.currentTarget.value))}
            />
            <Group gap="sm">
              <TextInput
                label="CTA text"
                value={asString(block.data.ctaLabel)}
                onChange={(event) => patch('ctaLabel', event.currentTarget.value)}
              />
              <TextInput
                label="CTA odkaz"
                value={asString(block.data.ctaUrl)}
                onChange={(event) => patch('ctaUrl', event.currentTarget.value)}
              />
            </Group>
            <TextInput
              label="Pozadí (barva/gradient)"
              value={asString(block.data.background)}
              onChange={(event) => patch('background', event.currentTarget.value)}
            />
          </Stack>
        </Card>
      );
    }
    case 'cta':
      return (
        <Card
          withBorder
          padding="md"
          radius="lg"
          className="microshop-builder-inspector"
        >
          <Stack gap="sm">
            <Text fw={600}>CTA banner</Text>
            <TextInput
              label="Eyebrow"
              value={(block.data.eyebrow as string) ?? ''}
              onChange={(event) => patch('eyebrow', event.currentTarget.value)}
            />
            <TextInput
              label="Titulek"
              value={(block.data.title as string) ?? ''}
              onChange={(event) => patch('title', event.currentTarget.value)}
            />
            <Textarea
              label="Popis"
              minRows={3}
              value={(block.data.description as string) ?? ''}
              onChange={(event) => patch('description', event.currentTarget.value)}
            />
            <Group gap="sm">
              <TextInput
                label="CTA text"
                value={(block.data.ctaLabel as string) ?? ''}
                onChange={(event) => patch('ctaLabel', event.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <TextInput
                label="CTA URL"
                value={(block.data.ctaUrl as string) ?? ''}
                onChange={(event) => patch('ctaUrl', event.currentTarget.value)}
                style={{ flex: 1 }}
              />
            </Group>
            <Group gap="sm">
              <TextInput
                label="Gradient od"
                value={asString(block.data.backgroundFrom)}
                onChange={(event) => patch('backgroundFrom', event.currentTarget.value)}
              />
              <TextInput
                label="Gradient do"
                value={asString(block.data.backgroundTo)}
                onChange={(event) => patch('backgroundTo', event.currentTarget.value)}
              />
            </Group>
            <TextInput
              label="Barva textu"
              value={asString(block.data.textColor)}
              onChange={(event) => patch('textColor', event.currentTarget.value)}
            />
            <Select
              label="Zarovnání"
              data={[
                { value: 'left', label: 'Vlevo' },
                { value: 'center', label: 'Na střed' },
                { value: 'right', label: 'Vpravo' },
              ]}
              value={['left', 'center', 'right'].includes(asString(block.data.alignment)) ? (block.data.alignment as string) : 'center'}
              onChange={(value) => patch('alignment', value ?? 'center')}
            />
          </Stack>
        </Card>
      );
    default:
      return null;
  }
};

export const MicrositeBuilderCanvas = ({ value, onChange }: MicrositeBuilderCanvasProps) => {
  const [blocks, setBlocks] = useState<BuilderBlock[]>(() => {
    const initial = deserializeBlocks(value);
    if (initial.length > 0) {
      return initial;
    }
    const ctaDefaults = BLOCK_TEMPLATES.find((template) => template.type === 'cta')?.defaults ?? {};
    return [
      { id: createId(), type: 'hero', data: { ...BLOCK_TEMPLATES[0].defaults } },
      { id: createId(), type: 'product-grid', data: { ...BLOCK_TEMPLATES[2].defaults } },
      { id: createId(), type: 'cta', data: { ...ctaDefaults } },
    ];
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<UniqueIdentifier | null>(null);
  const serializedRef = useRef<string>('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const { setNodeRef: setCanvasRef } = useDroppable({ id: 'builder-canvas' });

  const emitChange = useCallback(
    (nextBlocks: BuilderBlock[]) => {
      const serialized = serializeBlocks(nextBlocks);
      serializedRef.current = JSON.stringify(serialized.components ?? []);
      onChange(serialized);
    },
    [onChange]
  );

  useEffect(() => {
    const incoming = JSON.stringify((value?.components as unknown) ?? []);
    if (incoming !== serializedRef.current) {
      serializedRef.current = incoming;
      const incomingBlocks = deserializeBlocks(value);
      if (incomingBlocks.length > 0) {
        setBlocks(incomingBlocks);
        setSelectedId((prev) => (incomingBlocks.some((block) => block.id === prev) ? prev : null));
      }
    }
  }, [value]);

  useEffect(() => {
    emitChange(blocks);
  }, [blocks, emitChange]);

  const handleAddBlock = (template: BlockTemplate, index?: number) => {
    setBlocks((prev) => {
      const newBlock: BuilderBlock = {
        id: createId(),
        type: template.type,
        data: { ...template.defaults },
      };
      if (typeof index === 'number' && index >= 0 && index <= prev.length) {
        const next = [...prev.slice(0, index), newBlock, ...prev.slice(index)];
        return next;
      }
      return [...prev, newBlock];
    });
  };

  const handleDuplicate = (id: string) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((block) => block.id === id);
      if (idx === -1) return prev;
      const duplicate: BuilderBlock = {
        id: createId(),
        type: prev[idx].type,
        data: { ...prev[idx].data },
      };
      const next = [...prev.slice(0, idx + 1), duplicate, ...prev.slice(idx + 1)];
      return next;
    });
  };

  const handleRemove = (id: string) => {
    setBlocks((prev) => prev.filter((block) => block.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  };

  const handleUpdateBlock = (id: string, patch: Record<string, unknown>) => {
    setBlocks((prev) =>
      prev.map((block) => (block.id === id ? { ...block, data: { ...block.data, ...patch } } : block))
    );
  };

  const onDragStart = (event: DragStartEvent) => {
    setActiveDrag(event.active.id);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDrag(null);

    if (!over) {
      const template = (active.data.current as { template?: BlockTemplate; source?: string } | undefined)?.template;
      if (template) {
        handleAddBlock(template);
      }
      return;
    }

    const activeData = active.data.current as { template?: BlockTemplate; source?: string } | undefined;
    if (activeData?.source === 'palette' && activeData.template) {
      const overIndex = blocks.findIndex((block) => block.id === over.id);
      handleAddBlock(activeData.template, overIndex >= 0 ? overIndex : undefined);
      return;
    }

    const activeIndex = blocks.findIndex((block) => block.id === active.id);
    const overIndex = blocks.findIndex((block) => block.id === over.id);

    if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
      setBlocks((prev) => arrayMove(prev, activeIndex, overIndex));
    }
  };

  const selectedBlock = useMemo(
    () => blocks.find((block) => block.id === selectedId) ?? null,
    [blocks, selectedId]
  );

  return (
    <Card withBorder padding="lg" radius="lg" className="microshop-builder-shell">
      <div className="microshop-builder-layout">
        <DndContext
          sensors={sensors}
          modifiers={[restrictToVerticalAxis]}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="microshop-builder-palette">
            <Stack gap="sm">
              <Text fw={600} size="sm" c="dimmed">
                Bloky
              </Text>
              {BLOCK_TEMPLATES.map((template) => (
                <PaletteItem key={template.type} template={template} onAdd={handleAddBlock} />
              ))}
            </Stack>
          </div>

          <div ref={setCanvasRef} className="microshop-builder-canvas">
            <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
              <Stack gap="sm">
                {blocks.map((block) => (
                  <SortableBlock
                    key={block.id}
                    block={block}
                    isSelected={selectedId === block.id}
                    onSelect={setSelectedId}
                    onDuplicate={handleDuplicate}
                    onRemove={handleRemove}
                  />
                ))}
              </Stack>
            </SortableContext>
            {blocks.length === 0 ? (
              <Card withBorder padding="xl" radius="lg" className="microshop-builder-dropzone">
                <Text c="dimmed">Přidej blok z knihovny vlevo.</Text>
              </Card>
            ) : null}
          </div>

          <DragOverlay>
            {activeDrag
              ? (() => {
                  if (typeof activeDrag === 'string' && activeDrag.startsWith('palette-')) {
                    return (
                      <Card withBorder padding="sm" radius="md">
                        <Text>{BLOCK_TEMPLATES.find((tpl) => `palette-${tpl.type}` === activeDrag)?.label ?? 'Blok'}</Text>
                      </Card>
                    );
                  }

                  const draggingBlock = blocks.find((block) => block.id === activeDrag);
                  if (draggingBlock) {
                    return (
                      <Card withBorder padding="sm" radius="md">
                        <Text>{BLOCK_TEMPLATES.find((tpl) => tpl.type === draggingBlock.type)?.label ?? 'Blok'}</Text>
                      </Card>
                    );
                  }

                  return null;
                })()
              : null}
          </DragOverlay>
        </DndContext>

        <Inspector
          block={selectedBlock}
          onUpdate={(patch) => {
            if (selectedBlock) {
              handleUpdateBlock(selectedBlock.id, patch);
            }
          }}
        />
      </div>
    </Card>
  );
};
