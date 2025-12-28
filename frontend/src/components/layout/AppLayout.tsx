import {
  AppShell,
  Avatar,
  Box,
  Burger,
  ActionIcon,
  Button,
  Drawer,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Title,
  UnstyledButton,
  useMantineTheme,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import {
  IconArrowsSort,
  IconChevronDown,
  IconChevronUp,
  IconLanguage,
  IconLogout,
  IconMoonStars,
  IconSettings,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarRightExpand,
  IconLayoutGrid,
} from '@tabler/icons-react';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLogout } from '../../features/auth/hooks/useLogout';
import { useAuthStore } from '../../features/auth/store';
import { sectionCatalog, getSectionLabel } from '../../app/sections';
import classes from './AppLayout.module.css';
import { NotificationBell } from '../../features/notifications/components/NotificationBell';
import { ThemeToggle } from './ThemeToggle';
import { useThemeMode } from '../../theme/ThemeModeContext';

type NavigationRenderer = (onNavigate?: () => void) => ReactNode;

export const AppLayout = ({ children }: { children: ReactNode }) => {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.md})`);
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure(false);
  const { mutateAsync: logout } = useLogout();
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const navigate = useNavigate();
  const { mode, toggleMode } = useThemeMode();
  const [navCollapsed, setNavCollapsed] = useState(() => {
    const stored = window.localStorage.getItem('nav-collapsed');
    return stored ? stored === 'true' : false;
  });
  const [sectionVisibility, setSectionVisibility] = useState(() => {
    const stored = window.localStorage.getItem('nav-section-visibility');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<Record<'main' | 'categories' | 'mapping' | 'settings', boolean>>;
        return {
          main: parsed.main ?? true,
          mapping: (parsed as Partial<Record<string, boolean>>).mapping ?? parsed.categories ?? true,
          settings: parsed.settings ?? true,
        };
      } catch {
        return { main: true, mapping: true, settings: true };
      }
    }

    return { main: true, mapping: true, settings: true };
  });

  useEffect(() => {
    window.localStorage.setItem('nav-collapsed', String(navCollapsed));
  }, [navCollapsed]);

  useEffect(() => {
    window.localStorage.setItem('nav-section-visibility', JSON.stringify(sectionVisibility));
  }, [sectionVisibility]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const userInitials = useMemo(() => {
    if (!user?.name) {
      return 'U';
    }

    return (
      user.name
        .split(' ')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('') || 'U'
    );
  }, [user?.name]);

  const accessibleSections = useMemo(() => {
    const allowed = new Set(user?.sections ?? []);
    if (allowed.has('customers')) {
      allowed.add('customers.vip');
    }
    if (allowed.has('categories.mapping')) {
      allowed.add('categories.attributes');
    }
    if (allowed.has('inventory')) {
      allowed.add('inventory.guard');
    }

    return sectionCatalog.filter((section) => allowed.has(section.key));
  }, [user?.sections]);

  const mappingSections = useMemo(
    () => accessibleSections.filter((section) => section.key.startsWith('categories.')),
    [accessibleSections]
  );

  const mainSections = useMemo(
    () =>
      accessibleSections.filter(
        (section) =>
          !section.key.startsWith('settings.') &&
          !section.key.startsWith('categories.') &&
          section.key !== 'customers.vip'
      ),
    [accessibleSections]
  );

  const vipSection = useMemo(
    () => accessibleSections.find((section) => section.key === 'customers.vip') ?? null,
    [accessibleSections]
  );

  const settingsSections = useMemo(
    () => accessibleSections.filter((section) => section.key.startsWith('settings.')),
    [accessibleSections]
  );

  const toggleSectionVisibility = (key: 'main' | 'mapping' | 'settings') => {
    setSectionVisibility((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const sectionSummary = useMemo(() => {
    if (!user?.sections?.length) {
      return 'Bez přiřazených sekcí';
    }

    const labels = user.sections.map(getSectionLabel);

    if (labels.length <= 3) {
      return labels.join(', ');
    }

    const visible = labels.slice(0, 3).join(', ');
    const remaining = labels.length - 3;
    return `${visible} +${remaining}`;
  }, [user?.sections]);

  const accountMenuTarget = isMobile ? (
    <ActionIcon
      variant="gradient"
      gradient={{ from: 'ocean', to: 'aurora', deg: 135 }}
      radius="xl"
      size="lg"
      aria-label="Uživatelské menu"
      className={classes.userIconButton}
    >
      <Avatar size={24} radius="xl" className={classes.userAvatar}>
        {userInitials}
      </Avatar>
    </ActionIcon>
  ) : (
    <UnstyledButton type="button" className={classes.userMenuTrigger} aria-label="Uživatelské menu">
      <Avatar size={30} radius="xl" className={classes.userMenuAvatar}>
        {userInitials}
      </Avatar>
      <div className={classes.userMenuMeta}>
        <Text className={classes.userMenuName}>{user?.name ?? 'Nepřihlášený uživatel'}</Text>
        <Text className={classes.userMenuSummary}>{sectionSummary}</Text>
      </div>
      <IconChevronDown size={14} className={classes.userMenuCaret} />
    </UnstyledButton>
  );

  const renderSectionLink = (
    section: (typeof sectionCatalog)[number],
    onNavigate?: () => void,
    variant: 'default' | 'nested' = 'default'
  ) => {
    const isActive =
      location.pathname === section.path || location.pathname.startsWith(`${section.path}/`);

    if (section.key === 'products') {
      const productsPathActive = location.pathname.startsWith('/products');

      return (
        <NavLink
          key={section.key}
          label={section.label}
          leftSection={<section.icon size={18} />}
          defaultOpened={productsPathActive}
          className={clsx(classes.navLink, variant === 'nested' && classes.navLinkNested)}
          active={productsPathActive}
          classNames={{ label: classes.navLinkLabel }}
        >
          <NavLink
            component={Link}
            to="/products/translations"
            label="Překlady"
            leftSection={<IconLanguage size={16} />}
            active={
              location.pathname === '/products' ||
              location.pathname === '/products/translations' ||
              location.pathname.startsWith('/products/translations/')
            }
            onClick={onNavigate}
            className={classes.navLinkNested}
            classNames={{ label: classes.navLinkLabel }}
          />
          <NavLink
            component={Link}
            to="/products/sorting"
            label="Kategorické řazení"
            leftSection={<IconArrowsSort size={16} />}
            active={location.pathname.startsWith('/products/sorting')}
            onClick={onNavigate}
            className={classes.navLinkNested}
            classNames={{ label: classes.navLinkLabel }}
          />
          <NavLink
            component={Link}
            to="/products/widgets"
            label="Widgety"
            leftSection={<IconLayoutGrid size={16} />}
            active={location.pathname.startsWith('/products/widgets')}
            onClick={onNavigate}
            className={classes.navLinkNested}
            classNames={{ label: classes.navLinkLabel }}
          />
        </NavLink>
      );
    }

    if (section.key === 'customers' && vipSection) {
      const baseActive =
        location.pathname === section.path || location.pathname.startsWith(`${section.path}/`);
      const vipActive =
        location.pathname === vipSection.path || location.pathname.startsWith(`${vipSection.path}/`);

      return (
        <NavLink
          key={section.key}
          label={section.label}
          leftSection={<section.icon size={18} />}
          defaultOpened={baseActive || vipActive}
          className={classes.navLink}
          classNames={{ label: classes.navLinkLabel }}
        >
          <NavLink
            component={Link}
            to={section.path}
            label="Všichni zákazníci"
            leftSection={<section.icon size={16} />}
            active={baseActive}
            onClick={onNavigate}
            className={classes.navLinkNested}
            classNames={{ label: classes.navLinkLabel }}
          />
          <NavLink
            component={Link}
            to={vipSection.path}
            label={vipSection.label}
            leftSection={<vipSection.icon size={16} />}
            active={vipActive}
            onClick={onNavigate}
            className={classes.navLinkNested}
            classNames={{ label: classes.navLinkLabel }}
          />
        </NavLink>
      );
    }

    return (
      <NavLink
        key={section.key}
        component={Link}
        to={section.path}
        label={section.label}
        leftSection={<section.icon size={variant === 'nested' ? 16 : 18} />}
        active={isActive}
        onClick={onNavigate}
        className={clsx(classes.navLink, variant === 'nested' && classes.navLinkNested)}
        classNames={{ label: classes.navLinkLabel }}
      />
    );
  };

  const renderNavigationGroups: NavigationRenderer = (onNavigate) => (
    <Stack gap="lg">
      {mainSections.length > 0 && (
        <Box className={clsx(classes.navGroup, !sectionVisibility.main && classes.navGroupClosed)}>
          <div className={classes.navGroupHeader}>
            <div className={classes.navGroupHeaderText}>
              <Text className={classes.navGroupTitle}>Přehledy</Text>
              <span className={classes.navGroupBadge}>Core</span>
            </div>
            <ActionIcon
              variant="subtle"
              size="sm"
              radius="xl"
              aria-label={sectionVisibility.main ? 'Skrýt sekci Přehledy' : 'Zobrazit sekci Přehledy'}
              onClick={() => toggleSectionVisibility('main')}
              className={classes.navGroupToggle}
            >
              {sectionVisibility.main ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            </ActionIcon>
          </div>
          {sectionVisibility.main && (
            <Stack gap={6}>
              {mainSections.map((section) => (
                <Fragment key={section.key}>{renderSectionLink(section, onNavigate)}</Fragment>
              ))}
            </Stack>
          )}
        </Box>
      )}

      {mappingSections.length > 0 && (
        <Box className={clsx(classes.navGroup, !sectionVisibility.mapping && classes.navGroupClosed)}>
          <div className={classes.navGroupHeader}>
            <div className={classes.navGroupHeaderText}>
              <Text className={classes.navGroupTitle}>Mapování</Text>
              <span className={classes.navGroupBadge}>PIM</span>
            </div>
            <ActionIcon
              variant="subtle"
              size="sm"
              radius="xl"
              aria-label={sectionVisibility.mapping ? 'Skrýt sekci Mapování' : 'Zobrazit sekci Mapování'}
              onClick={() => toggleSectionVisibility('mapping')}
              className={classes.navGroupToggle}
            >
              {sectionVisibility.mapping ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            </ActionIcon>
          </div>
          {sectionVisibility.mapping && (
            <Stack gap={6} className={classes.navSubLinks}>
              {mappingSections.map((section) => (
                <Fragment key={section.key}>{renderSectionLink(section, onNavigate, 'nested')}</Fragment>
              ))}
            </Stack>
          )}
        </Box>
      )}

      {settingsSections.length > 0 && (
        <Box className={clsx(classes.navGroup, !sectionVisibility.settings && classes.navGroupClosed)}>
          <div className={classes.navGroupHeader}>
            <div className={classes.navGroupHeaderText}>
              <Text className={classes.navGroupTitle}>Nastavení</Text>
              <span className={classes.navGroupBadge}>ADMIN</span>
            </div>
            <ActionIcon
              variant="subtle"
              size="sm"
              radius="xl"
              aria-label={sectionVisibility.settings ? 'Skrýt sekci Nastavení' : 'Zobrazit sekci Nastavení'}
              onClick={() => toggleSectionVisibility('settings')}
              className={classes.navGroupToggle}
            >
              {sectionVisibility.settings ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            </ActionIcon>
          </div>
          {sectionVisibility.settings && (
            <Stack gap={6} className={classes.navSubLinks}>
              {settingsSections.map((section) => (
                <Fragment key={section.key}>{renderSectionLink(section, onNavigate, 'nested')}</Fragment>
              ))}
            </Stack>
          )}
        </Box>
      )}
    </Stack>
  );

  const renderHelpCard = () => (
    <Box className={classes.helpCard}>
      <Text className={classes.helpCardTitle}>Potřebuješ podporu?</Text>
      <Text className={classes.helpCardCopy}>
        Napiš kdykoliv na Slack, WhatsApp nebo e-mail{' '}
        <Text span fw={600}>
          jiri@krasnevune.cz
        </Text>
        . Odpovím během několika hodin.
      </Text>
      <Button
        component="a"
        href="mailto:jiri@krasnevune.cz"
        variant="gradient"
        size="sm"
        mt="md"
        gradient={{ from: 'ocean', to: 'aurora', deg: 135 }}
      >
        Napsat Jiřímu
      </Button>
    </Box>
  );

  const primaryMobileSections = useMemo(() => {
    if (mainSections.length >= 4) {
      return mainSections.slice(0, 4);
    }

    const combined = [...mainSections];
    settingsSections.forEach((section) => {
      if (combined.length < 4) {
        combined.push(section);
      }
    });

    return combined.slice(0, 4);
  }, [mainSections, settingsSections]);

  const handleMobileNavigate = (path: string) => {
    navigate(path);
    closeDrawer();
  };

  const navbarWidth = navCollapsed ? 92 : 300;

  return (
    <AppShell
      header={{ height: isMobile ? 60 : 72 }}
      navbar={{
        width: navbarWidth,
        breakpoint: 'md',
        collapsed: { mobile: true, desktop: navCollapsed },
      }}
      padding={isMobile ? 'md' : 'xl'}
    >
      <AppShell.Header className={clsx(classes.header, isMobile && classes.headerMobile)}>
        <div className={classes.headerContent}>
          <Group h="100%" px={isMobile ? 'md' : 'xl'} justify="space-between" wrap="nowrap" w="100%">
            <Group
              gap={isMobile ? 'xs' : 'sm'}
              wrap="nowrap"
              align={isMobile ? 'center' : 'flex-start'}
              className={classes.headerCompactGroup}
            >
              <Burger
                opened={drawerOpened}
                onClick={() => (drawerOpened ? closeDrawer() : openDrawer())}
                size="sm"
                hiddenFrom="md"
                color={mode === 'dark' ? theme.white : theme.colors.neutral[7]}
                aria-label={drawerOpened ? 'Zavřít navigaci' : 'Otevřít navigaci'}
              />
              <ActionIcon
                variant="subtle"
                radius="xl"
                size="md"
                visibleFrom="md"
                aria-label={navCollapsed ? 'Rozbalit navigaci' : 'Skrýt navigaci'}
                onClick={() => setNavCollapsed((value) => !value)}
                className={classes.sidebarToggle}
              >
                {navCollapsed ? (
                  <IconLayoutSidebarRightExpand size={18} />
                ) : (
                  <IconLayoutSidebarLeftCollapse size={18} />
                )}
              </ActionIcon>
              <Stack gap={isMobile ? 0 : 4} style={{ color: 'inherit' }} className={classes.brandStack}>
                <Group gap={isMobile ? 4 : 'xs'} align={isMobile ? 'center' : 'flex-end'}>
                  <Title order={isMobile ? 5 : 3} fw={700} className={classes.brandTitle}>
                    ERIHUB
                  </Title>
                </Group>
                {!isMobile && (
                  <Text size="sm" className={classes.brandSubline}>
                    Profesionální centrum pro Shoptet Commerce integrace
                  </Text>
                )}
              </Stack>
            </Group>

            <Group
              gap={isMobile ? 'xs' : 'sm'}
              align="center"
              className={classes.headerActions}
              justify="flex-end"
            >
              <ThemeToggle />
              <NotificationBell />
              <Menu withinPortal shadow="md" position="bottom-end" offset={12} radius="lg">
                <Menu.Target>{accountMenuTarget}</Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Účet</Menu.Label>
                  <Menu.Item
                    leftSection={<IconMoonStars size={16} />}
                    onClick={toggleMode}
                  >
                    {mode === 'light' ? 'Tmavý režim' : 'Světlý režim'}
                  </Menu.Item>
                  <Menu.Item leftSection={<IconLogout size={16} />} color="red" onClick={handleLogout}>
                    Odhlásit se
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
        </div>
      </AppShell.Header>

      <AppShell.Navbar
        p={isMobile ? 'md' : 'lg'}
        withBorder={false}
        visibleFrom="md"
        className={clsx(classes.navbar, navCollapsed && classes.navbarCollapsed)}
      >
        <AppShell.Section className={classes.navHeader}>
          <Text className={classes.navHeaderTitle}>Navigace</Text>
          <Text className={classes.navHeaderHint}>Všechny moduly na jednom místě</Text>
        </AppShell.Section>
        <AppShell.Section
          grow
          component={ScrollArea}
          type="scroll"
          offsetScrollbars
          mt="md"
          pb="sm"
        >
          {accessibleSections.length ? (
            <Stack gap="md" pr="sm">
              {renderNavigationGroups()}
              {renderHelpCard()}
            </Stack>
          ) : (
            <Stack gap={8} py="lg" px="sm" align="center" c="gray.6">
              <IconSettings size={28} />
              <Text size="sm" ta="center">
                Nemáš přiřazené žádné sekce. Požádej administrátora o přístup.
              </Text>
            </Stack>
          )}
        </AppShell.Section>
      </AppShell.Navbar>

      <Drawer
        title="Navigace"
        opened={drawerOpened}
        onClose={closeDrawer}
        padding="md"
        hiddenFrom="md"
        withCloseButton
        size={isMobile ? '100%' : 'md'}
        radius={0}
        position="right"
        overlayProps={{ opacity: 0.55, blur: 2 }}
        styles={{
          content: {
            borderRadius: 0,
          },
          header: {
            paddingBottom: theme.spacing.sm,
          },
          body: {
            paddingTop: theme.spacing.sm,
          },
        }}
      >
        <Stack gap="md">
          <div className={classes.navHeader}>
            <Text className={classes.navHeaderTitle}>Navigace</Text>
            <Text className={classes.navHeaderHint}>Spravuj celý HUB z jedné navigace</Text>
          </div>
          <ScrollArea.Autosize mah="calc(100vh - 144px)" offsetScrollbars type="scroll">
            <Stack gap="md" pb="md">
              {renderNavigationGroups(closeDrawer)}
              {renderHelpCard()}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      </Drawer>

      {isMobile && primaryMobileSections.length > 0 && (
        <AppShell.Footer
          withBorder={false}
          className={classes.mobileFooter}
          style={{ minHeight: 58 }}
        >
          <div className={classes.mobileFooterScroll}>
            {primaryMobileSections.map((section) => {
              const Icon = section.icon;
              const active =
                location.pathname === section.path || location.pathname.startsWith(`${section.path}/`);

              return (
                <UnstyledButton
                  key={section.key}
                  className={classes.mobileNavButton}
                  data-active={active || undefined}
                  onClick={() => handleMobileNavigate(section.path)}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={20} />
                  <Text component="span" size="xs" fw={600}>
                    {section.label}
                  </Text>
                </UnstyledButton>
              );
            })}
          </div>
        </AppShell.Footer>
      )}

      <AppShell.Main className={classes.mainArea}>
        <div className={classes.mainScroller}>
          <Box className={classes.mainContent}>{children}</Box>
        </div>
      </AppShell.Main>
    </AppShell>
  );
};
