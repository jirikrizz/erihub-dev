export type TenantBrand = {
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
  muted: string;
  onPrimary: string;
  onSurface: string;
  gradientFrom: string;
  gradientTo: string;
  fontDisplay?: string;
  fontSans?: string;
};

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  locale: string;
  currency: string;
  primaryDomain: string | null;
  domains: string[];
  brand: TenantBrand;
};

export type StorefrontMicrosite = {
  id: string;
  name: string;
  slug: string;
  seo: {
    title?: string | null;
    description?: string | null;
    ogImage?: string | null;
  } | null;
};

export type StorefrontProduct = {
  id: string;
  slug: string;
  sku?: string | null;
  name: string;
  subtitle?: string | null;
  excerpt?: string | null;
  descriptionMd?: string | null;
  imageUrl?: string | null;
  gallery?: string[];
  priceCents: number;
  priceCurrency: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  available: boolean;
  badge?: string | null;
  cta?: { label: string; href: string } | null;
  detailUrl?: string | null;
};

export type StorefrontHighlight = {
  title: string;
  subtitle?: string;
  description: string;
  icon?: string;
};

export type StorefrontHero = {
  eyebrow?: string;
  title: string;
  description?: string;
  primaryCta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  media?: {
    image?: string;
    video?: string;
    alt?: string;
  };
};

export type StorefrontEditorial = {
  title: string;
  bodyMd: string;
};

export type StorefrontTestimonial = {
  quote: string;
  author: string;
  role?: string;
};

export type StorefrontFaq = {
  question: string;
  answer: string;
};

export type StorefrontPage = {
  path: string;
  title: string;
  bodyMd?: string | null;
  heroImage?: string | null;
  published: boolean;
};

export type StorefrontCatalog = {
  hero: StorefrontHero;
  highlights: StorefrontHighlight[];
  editorial?: StorefrontEditorial;
  testimonials?: StorefrontTestimonial[];
  faqs?: StorefrontFaq[];
};

export type ThemeSettings = {
  palette: {
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
  typography: {
    display: string;
    sans: string;
  };
};

export const DEFAULT_THEME: ThemeSettings = {
  palette: {
    primary: "#6F2CFF",
    secondary: "#0B112B",
    accent: "#14B8A6",
    background: "#020617",
    surface: "#0F172A",
    muted: "#1E293B",
    onPrimary: "#0B1120",
    onSurface: "#F8FAFC",
    gradientFrom: "rgba(124, 58, 237, 0.65)",
    gradientTo: "rgba(8, 145, 178, 0.65)",
  },
  typography: {
    display: "Clash Display",
    sans: "Inter",
  },
};

export type StorefrontHeaderNavItem = {
  label: string;
  href: string;
};

export type StorefrontHeaderConfig = {
  title?: string;
  subtitle?: string;
  showPublishedBadge?: boolean;
  visible?: boolean;
  navigation: StorefrontHeaderNavItem[];
  cta?: { label: string; href: string } | null;
};

export type StorefrontFooterContact = {
  label: string;
  value: string;
};

export type StorefrontFooterLink = {
  label: string;
  href: string;
};

export type StorefrontFooterConfig = {
  aboutTitle?: string;
  aboutText?: string;
  contactTitle?: string;
  contactItems: StorefrontFooterContact[];
  links: StorefrontFooterLink[];
  visible?: boolean;
};

export type StorefrontSection =
  | {
      id: string;
      type: "hero";
      eyebrow?: string;
      title?: string;
      description?: string;
      primaryCta?: { label: string; href: string };
      secondaryCta?: { label: string; href: string };
      mediaImage?: string;
    }
  | {
      id: string;
      type: "product-grid";
      title?: string;
      subtitle?: string;
      description?: string;
      limit?: number;
    }
  | {
      id: string;
      type: "highlights";
      title?: string;
      items: Array<{ id: string; title: string; description: string; icon?: string }>;
    }
  | {
      id: string;
      type: "testimonials";
      title?: string;
      subtitle?: string;
      items: Array<{ id: string; quote: string; author: string; role?: string }>;
    }
  | {
      id: string;
      type: "faq";
      title?: string;
      subtitle?: string;
      items: Array<{ id: string; question: string; answer: string }>;
    }
  | {
      id: string;
      type: "cta";
      title?: string;
      description?: string;
      eyebrow?: string;
      cta?: { label: string; href: string };
    };

export type StorefrontPayload = {
  tenant: Tenant;
  microsite: StorefrontMicrosite;
  products: StorefrontProduct[];
  catalog: StorefrontCatalog;
  pages: StorefrontPage[];
  builder?: {
    html: string;
    css?: string | null;
    components?: unknown;
    styles?: unknown;
  } | null;
  theme?: ThemeSettings | null;
  sections?: StorefrontSection[] | null;
  header?: StorefrontHeaderConfig | null;
  footer?: StorefrontFooterConfig | null;
  lastPublishedAt?: string | null;
};
