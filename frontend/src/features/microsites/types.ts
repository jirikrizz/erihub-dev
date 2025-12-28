export type BuilderValue = {
  html: string;
  css: string;
  components?: unknown;
  styles?: unknown;
};

export type ThemePalette = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  muted: string;
  onPrimary: string;
  onSurface: string;
  gradientFrom: string;
  gradientTo: string;
};

export type ThemeTypography = {
  display: string;
  sans: string;
};

export type ThemeSettings = {
  palette: ThemePalette;
  typography: ThemeTypography;
};

export type HeaderNavigationItem = {
  id: string;
  label: string;
  href: string;
};

export type HeaderSettings = {
  title?: string;
  subtitle?: string;
  showPublishedBadge?: boolean;
  visible?: boolean;
  navigation: HeaderNavigationItem[];
  cta?: { label: string; href: string } | null;
};

export type FooterLink = {
  id: string;
  label: string;
  href: string;
};

export type FooterContactItem = {
  id: string;
  label: string;
  value: string;
};

export type FooterSettings = {
  aboutTitle?: string;
  aboutText?: string;
  contactTitle?: string;
  contactItems: FooterContactItem[];
  links: FooterLink[];
  visible?: boolean;
};

export type SectionType =
  | 'hero'
  | 'product-grid'
  | 'highlights'
  | 'testimonials'
  | 'faq'
  | 'cta';

export type BaseSection = {
  id: string;
  type: SectionType;
  title?: string;
  subtitle?: string;
  description?: string;
};

export type MicrositeSection =
  | (BaseSection & {
      type: 'hero';
      eyebrow?: string;
      primaryCta?: { label: string; href: string };
      secondaryCta?: { label: string; href: string };
      mediaImage?: string;
    })
  | (BaseSection & {
      type: 'product-grid';
      limit?: number;
      layout?: 'grid' | 'carousel';
    })
  | (BaseSection & {
      type: 'highlights';
      items: Array<{ id: string; title: string; description: string; icon?: string }>;
    })
  | (BaseSection & {
      type: 'testimonials';
      items: Array<{ id: string; quote: string; author: string; role?: string }>;
    })
  | (BaseSection & {
      type: 'faq';
      items: Array<{ id: string; question: string; answer: string }>;
    })
  | (BaseSection & {
      type: 'cta';
      eyebrow?: string;
      cta?: { label: string; href: string };
    });

export const DEFAULT_THEME: ThemeSettings = {
  palette: {
    primary: '#6F2CFF',
    secondary: '#0B112B',
    accent: '#14B8A6',
    background: '#020617',
    surface: '#0F172A',
    muted: '#1E293B',
    onPrimary: '#0B1120',
    onSurface: '#F8FAFC',
    gradientFrom: 'rgba(124, 58, 237, 0.65)',
    gradientTo: 'rgba(8, 145, 178, 0.65)',
  },
  typography: {
    display: 'Clash Display',
    sans: 'Inter',
  },
};

const createId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2);

export const createNavId = (): string => createId();

export const createSectionId = (): string => createId();

export const DEFAULT_HEADER: HeaderSettings = {
  title: 'Krásné Vůně Atelier',
  subtitle: 'Limitovaná kolekce atelier',
  showPublishedBadge: true,
  visible: true,
  navigation: [
    { id: createNavId(), label: 'Kolekce', href: '/#kolekce' },
    { id: createNavId(), label: 'Katalog produktů', href: '/#kolekce' },
    { id: createNavId(), label: 'FAQ', href: '/#faq' },
    { id: createNavId(), label: 'Kontakt', href: '/#kontakt' },
  ],
  cta: null,
};

export const DEFAULT_FOOTER: FooterSettings = {
  aboutTitle: 'Microshop',
  aboutText: 'Kurátorované microshopy s VIP prezentací a Stripe checkoutem.',
  contactTitle: 'Kontakt',
  contactItems: [{ id: createNavId(), label: 'Podpora HUB', value: 'support@krasnevune.cz' }],
  links: [
    { id: createNavId(), label: 'Kolekce', href: '/#kolekce' },
    { id: createNavId(), label: 'Kontakt', href: '/#kontakt' },
  ],
  visible: true,
};

export const createHeaderNavigationItem = (): HeaderNavigationItem => ({
  id: createNavId(),
  label: 'Nový odkaz',
  href: '/#kolekce',
});

export const createFooterLink = (): FooterLink => ({
  id: createNavId(),
  label: 'Nový odkaz',
  href: '/#kolekce',
});

export const createFooterContactItem = (): FooterContactItem => ({
  id: createNavId(),
  label: 'Kontakt',
  value: 'support@krasnevune.cz',
});

export const createDefaultSection = (type: SectionType): MicrositeSection => {
  switch (type) {
    case 'hero':
      return {
        id: createSectionId(),
        type: 'hero',
        eyebrow: 'Limitovaná kolekce',
        title: 'Vůně, které definují tvůj podpis',
        description: 'Kurátorovaný výběr niche parfémů připravený ke sdílení během minut.',
        primaryCta: {
          label: 'Objev kolekci',
          href: '#kolekce',
        },
        secondaryCta: {
          label: 'Kontaktuj concierge',
          href: '#kontakt',
        },
        mediaImage: '',
      };
    case 'product-grid':
      return {
        id: createSectionId(),
        type: 'product-grid',
        title: 'Signature kolekce',
        subtitle: 'Kurátor',
        description: 'Vybrané produkty přímo z HUBu',
        limit: 6,
        layout: 'grid',
      };
    case 'highlights':
      return {
        id: createSectionId(),
        type: 'highlights',
        title: 'Proč microshop',
        items: [
          { id: createSectionId(), title: 'Kurátorovaný výběr', description: 'Řiď se daty z HUBu.', icon: 'Sparkles' },
          { id: createSectionId(), title: 'Prémiové marže', description: 'Nastav své ceny.', icon: 'Diamond' },
          { id: createSectionId(), title: 'Rychlá publikace', description: 'Sdílej během minut.', icon: 'Zap' },
        ],
      };
    case 'testimonials':
      return {
        id: createSectionId(),
        type: 'testimonials',
        title: 'Co říkají kurátoři',
        items: [
          {
            id: createSectionId(),
            quote: 'Microshop přenesl VIP zkušenost do online světa.',
            author: 'Lucia Hrubá',
            role: 'zakladatelka niche parfumérie',
          },
          {
            id: createSectionId(),
            quote: 'Za 15 minut jsme měli připravený katalog pro Stripe checkout.',
            author: 'Ondřej Bystroň',
            role: 'COO, KrasneVune.cz',
          },
        ],
      };
    case 'faq':
      return {
        id: createSectionId(),
        type: 'faq',
        title: 'FAQ',
        items: [
          {
            id: createSectionId(),
            question: 'Jak rychle microshop nasadím?',
            answer: 'V HUBu vybereš produkty, doladíš texty a microshop sdílíš během pár minut.',
          },
          {
            id: createSectionId(),
            question: 'Podporujete Stripe?',
            answer: 'Ano, microshop vytváří Stripe Checkout Session a objednávka se propisuje do HUBu.',
          },
        ],
      };
    case 'cta':
      return {
        id: createSectionId(),
        type: 'cta',
        eyebrow: 'Konzultace',
        title: 'Připraveni otevřít microshop?',
        description: 'Spoj se s naším týmem a vytvoř VIP katalog během minut.',
        cta: {
          label: 'Domluvit call',
          href: '#kontakt',
        },
      };
    default:
      return {
        id: createId(),
        type,
      } as MicrositeSection;
  }
};
