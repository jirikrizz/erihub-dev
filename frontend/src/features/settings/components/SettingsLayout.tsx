import { Grid, NavLink, Stack, Text, Title } from '@mantine/core';
import { NavLink as RouterNavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../auth/store';
import type { SectionKey } from '../../../app/sections';
import classes from './SettingsLayout.module.css';

type SettingsNavItem = {
  label: string;
  description: string;
  to: string;
  section: SectionKey;
};

const settingsNavItems: SettingsNavItem[] = [
  {
    label: 'Automatizace',
    description: 'Frekvence importů, jobů a webhooků.',
    to: '/settings/automation',
    section: 'settings.automation',
  },
  {
    label: 'Připojení e-shopů',
    description: 'Shoptet shopy, tokeny, webhooky.',
    to: '/settings/shops',
    section: 'settings.shops',
  },
  {
    label: 'API integrace',
    description: 'Klíče pro OpenAI, Slack a další služby.',
    to: '/settings/api',
    section: 'settings.api',
  },
  {
    label: 'AI pluginy',
    description: 'Generování widgetů a skriptů pro Shoptet.',
    to: '/settings/plugins',
    section: 'settings.plugins',
  },
  {
    label: 'Stavy objednávek',
    description: 'Mapování stavů a jejich vliv na metriky.',
    to: '/settings/order-statuses',
    section: 'settings.orders',
  },
  {
    label: 'Zákazníci',
    description: 'Automatické zakládání a registrace zákazníků z objednávek.',
    to: '/settings/customers',
    section: 'settings.customers',
  },
  {
    label: 'Role & práva',
    description: 'Správa rolí, oprávnění a přístupů.',
    to: '/settings/roles',
    section: 'settings.roles',
  },
  {
    label: 'Analytika',
    description: 'Základní metriky, RFM a výchozí pohledy.',
    to: '/settings/analytics',
    section: 'settings.analytics',
  },
  {
    label: 'Alerty zásob',
    description: 'Pravidla pro nízkou zásobu a hlídání variant.',
    to: '/settings/inventory-notifications',
    section: 'settings.inventory-notifications',
  },
  {
    label: 'AI zásoby',
    description: 'Obchodní profil pro AI odhady výdrže zásob.',
    to: '/settings/inventory-forecast',
    section: 'settings.inventory-ai',
  },
  {
    label: 'Doporučení produktů',
    description: 'Nastav váhy parametrů pro doporučené produkty.',
    to: '/settings/inventory-recommendations',
    section: 'settings.inventory-recommendations',
  },
  {
    label: 'Export a feedy',
    description: 'Vytvářej odkazy pro export zákazníků, objednávek a produktů.',
    to: '/settings/exports',
    section: 'settings.exports',
  },
];

const NoAccess = () => (
  <Stack gap="xs">
    <Title order={4}>Nemáš přístup do žádné sekce Nastavení</Title>
    <Text c="gray.6">Kontaktuj administrátora a požádej o přidělení práv.</Text>
  </Stack>
);

export const SettingsLayout = () => {
  const location = useLocation();
  const userSections = useAuthStore((state) => state.user?.sections ?? []);

  const accessibleItems = settingsNavItems.filter((item) => userSections.includes(item.section));

  if (accessibleItems.length === 0) {
    return <NoAccess />;
  }

  return (
    <Stack gap="xl" className={classes.layout}>
      <div className={classes.heading}>
        <Title order={2} className={classes.title}>
          Nastavení
        </Title>
        <Text size="sm" className={classes.subtitle}>
          Konfiguruj integrace, automatizace a další nástroje, které drží HUB v chodu.
        </Text>
      </div>
      <Grid gutter="xl">
        <Grid.Col span={{ base: 12, md: 4, lg: 3 }}>
          <Stack className={classes.navColumn}>
            {accessibleItems.map((item) => {
              const active = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);

              return (
                <NavLink
                  key={item.to}
                  component={RouterNavLink}
                  to={item.to}
                  label={item.label}
                  description={item.description}
                  active={active}
                  classNames={{
                    root: classes.navLink,
                    label: classes.navLabel,
                    description: classes.navDescription,
                  }}
                />
              );
            })}
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8, lg: 9 }}>
          <Outlet />
        </Grid.Col>
      </Grid>
    </Stack>
  );
};
