import {
  IconAdjustments,
  IconBellRinging,
  IconArrowsShuffle,
  IconChartBar,
  IconChecklist,
  IconHome,
  IconApi,
  IconListCheck,
  IconPackage,
  IconSettings,
  IconUsers,
  IconUsersGroup,
  IconTarget,
  IconFolders,
  IconHierarchy,
  IconAlertTriangle,
  IconStar,
  IconCloudDownload,
  IconSparkles,
  IconShieldLock,
} from '@tabler/icons-react';
import type { ComponentType } from 'react';

export type SectionKey =
  | 'dashboard'
  | 'notifications'
  | 'inventory'
  | 'inventory.guard'
  | 'orders'
  | 'products'
  | 'categories.mapping'
  | 'categories.attributes'
  | 'categories.tree'
  | 'tasks'
  | 'analytics'
  | 'customers'
  | 'customers.vip'
  | 'microsites'
  | 'users'
  | 'settings.automation'
  | 'settings.shops'
  | 'settings.api'
  | 'settings.plugins'
  | 'settings.orders'
  | 'settings.customers'
  | 'settings.roles'
  | 'settings.analytics'
  | 'settings.inventory-notifications'
  | 'settings.inventory-ai'
  | 'settings.inventory-recommendations'
  | 'settings.exports'
  | 'ai.content';

export type SectionDefinition = {
  key: SectionKey;
  label: string;
  description: string;
  path: string;
  permission: string;
  icon: ComponentType<{ size?: number | string }>;
};

export const sectionCatalog: readonly SectionDefinition[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Přehled výsledků a nejdůležitější metriky HUBu.',
    path: '/dashboard',
    permission: 'section.dashboard',
    icon: IconHome,
  },
  {
    key: 'notifications',
    label: 'Notifikace',
    description: 'Centrum systémových upozornění a auditních logů.',
    path: '/notifications',
    permission: 'section.notifications',
    icon: IconBellRinging,
  },
  {
    key: 'inventory',
    label: 'Inventář',
    description: 'Skladové zásoby, synchronizace a optimalizace dostupnosti.',
    path: '/inventory',
    permission: 'section.inventory',
    icon: IconPackage,
  },
  {
    key: 'inventory.guard',
    label: 'Hlídač skladu',
    description: 'Porovnání skladů Shoptetu s údaji z Elogistu.',
    path: '/inventory/stock-guard',
    permission: 'section.inventory',
    icon: IconShieldLock,
  },
  {
    key: 'orders',
    label: 'Objednávky',
    description: 'Objednávky z e-shopů a jejich stavové workflow.',
    path: '/orders',
    permission: 'section.orders',
    icon: IconListCheck,
  },
  {
    key: 'products',
    label: 'Produkty',
    description: 'Správa překladů, řazení a embed widgetů pro produkty.',
    path: '/products',
    permission: 'section.products',
    icon: IconPackage,
  },
  {
    key: 'categories.mapping',
    label: 'Kategorie',
    description: 'Mapování master kategorií na kategorie jednotlivých shopů.',
    path: '/categories/mapping',
    permission: 'section.categories.mapping',
    icon: IconHierarchy,
  },
  {
    key: 'categories.attributes',
    label: 'Filtry, varianty, parametry',
    description: 'Mapování filtrů, variantních parametrů a produktových flagů mezi shopy.',
    path: '/categories/attributes',
    permission: 'section.categories.mapping',
    icon: IconAdjustments,
  },
  {
    key: 'categories.tree',
    label: 'Kategorický strom',
    description: 'Strom kategorií jednotlivých e-shopů.',
    path: '/categories/tree',
    permission: 'section.categories',
    icon: IconFolders,
  },
  {
    key: 'tasks',
    label: 'Úkoly',
    description: 'Procesní checklisty a úkoly pro tým.',
    path: '/tasks',
    permission: 'section.tasks',
    icon: IconChecklist,
  },
  {
    key: 'analytics',
    label: 'Analytika',
    description: 'Reporty a KPI metriky Commerce HUBu.',
    path: '/analytics',
    permission: 'section.analytics',
    icon: IconChartBar,
  },
  {
    key: 'customers',
    label: 'Zákazníci',
    description: 'Zákaznická báze, segmentace a historie objednávek.',
    path: '/customers',
    permission: 'section.customers',
    icon: IconUsers,
  },
  {
    key: 'microsites',
    label: 'Microshopy',
    description: 'Tvoř a publikuj kurátorované microshopy z produktů HUBu.',
    path: '/microsites',
    permission: 'section.microsites',
    icon: IconTarget,
  },
  {
    key: 'ai.content',
    label: 'Tvorba AI obsahu',
    description: 'Generuj texty a vizuály pro kampaně a microsites.',
    path: '/ai/content',
    permission: 'section.ai.content',
    icon: IconSparkles,
  },
  {
    key: 'customers.vip',
    label: 'VIP zákazníci',
    description: 'Segment VIP zákazníků s rychlým přístupem k filtrování.',
    path: '/customers/vip',
    permission: 'section.customers',
    icon: IconStar,
  },
  {
    key: 'users',
    label: 'Uživatelé',
    description: 'Správa interních účtů a jejich práv.',
    path: '/users',
    permission: 'section.users',
    icon: IconUsersGroup,
  },
  {
    key: 'settings.automation',
    label: 'Automatizace',
    description: 'Plánování procesů, frekvencí a automatizací.',
    path: '/settings/automation',
    permission: 'section.settings.automation',
    icon: IconAdjustments,
  },
  {
    key: 'settings.shops',
    label: 'Shoptet',
    description: 'Správa shopů, tokenů a webhooků pro Shoptet.',
    path: '/settings/shops',
    permission: 'section.settings.shops',
    icon: IconSettings,
  },
  {
    key: 'settings.api',
    label: 'API',
    description: 'Integrace pro OpenAI, Slack a další služby.',
    path: '/settings/api',
    permission: 'section.settings.api',
    icon: IconApi,
  },
  {
    key: 'settings.plugins',
    label: 'AI pluginy',
    description: 'Tvorba Shoptet widgetů pomocí asistenta.',
    path: '/settings/plugins',
    permission: 'section.settings.plugins',
    icon: IconSettings,
  },
  {
    key: 'settings.orders',
    label: 'Stavy objednávek',
    description: 'Mapování stavů objednávek pro výpočty metrik.',
    path: '/settings/order-statuses',
    permission: 'section.settings.orders',
    icon: IconArrowsShuffle,
  },
  {
    key: 'settings.customers',
    label: 'Zákazníci',
    description: 'Automatické zakládání a registrace zákazníků z objednávek.',
    path: '/settings/customers',
    permission: 'section.settings.customers',
    icon: IconUsers,
  },
  {
    key: 'settings.roles',
    label: 'Role & práva',
    description: 'Konfigurace rolí a oprávnění uživatelů.',
    path: '/settings/roles',
    permission: 'section.settings.roles',
    icon: IconUsersGroup,
  },
  {
    key: 'settings.analytics',
    label: 'Analytika',
    description: 'Výběr metrik a RFM nastavení pro přehledy.',
    path: '/settings/analytics',
    permission: 'section.settings.analytics',
    icon: IconChartBar,
  },
  {
    key: 'settings.inventory-notifications',
    label: 'Alerty zásob',
    description: 'Pravidla pro nízké zásoby a hlídané varianty.',
    path: '/settings/inventory-notifications',
    permission: 'section.settings.inventory-notifications',
    icon: IconAlertTriangle,
  },
  {
    key: 'settings.inventory-ai',
    label: 'AI zásoby',
    description: 'Nastavení obchodní strategie pro AI odhady zásob.',
    path: '/settings/inventory-forecast',
    permission: 'section.settings.inventory-ai',
    icon: IconTarget,
  },
  {
    key: 'settings.inventory-recommendations',
    label: 'Doporučení produktů',
    description: 'Správa vah a pravidel pro doporučování variant.',
    path: '/settings/inventory-recommendations',
    permission: 'section.settings.inventory-recommendations',
    icon: IconChecklist,
  },
  {
    key: 'settings.exports',
    label: 'Export a feedy',
    description: 'Konfigurace exportů zákazníků, objednávek a produktů.',
    path: '/settings/exports',
    permission: 'section.settings.exports',
    icon: IconCloudDownload,
  },
] as const;

export const sectionKeys = sectionCatalog.map((section) => section.key);

export const sectionMap: Record<SectionKey, SectionDefinition> = sectionCatalog.reduce(
  (acc, section) => ({ ...acc, [section.key]: section }),
  {} as Record<SectionKey, SectionDefinition>
);

export const findSectionByPath = (pathname: string): SectionDefinition | undefined =>
  sectionCatalog.find((section) => pathname === section.path || pathname.startsWith(`${section.path}/`));

export const getSectionLabel = (key: SectionKey): string => sectionMap[key]?.label ?? key;

export const firstAccessibleSectionPath = (userSections: SectionKey[]): string | null => {
  const allowed = new Set(userSections);
  const match = sectionCatalog.find((section) => allowed.has(section.key));
  return match?.path ?? null;
};

export const isSectionAllowed = (userSections: SectionKey[] | undefined, section: SectionKey): boolean =>
  !!userSections?.includes(section);
