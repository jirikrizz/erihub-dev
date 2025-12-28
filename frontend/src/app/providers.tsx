import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { MantineProvider } from '@mantine/core';
import { Global } from '@emotion/react';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { buildTheme, getGlobalStyles } from '../theme';
import { ThemeModeProvider, useThemeMode } from '../theme/ThemeModeContext';

const InnerThemeProvider = ({ children }: { children: ReactNode }) => {
  const { mode } = useThemeMode();

  const theme = useMemo(() => buildTheme(mode), [mode]);
  const globalStyles = useMemo(() => getGlobalStyles(mode), [mode]);

  return (
    <MantineProvider theme={theme} forceColorScheme={mode} defaultColorScheme={mode}>
      <div data-theme={mode}>
        <Global styles={globalStyles} />
        <Notifications position="top-right" />
        {children}
      </div>
    </MantineProvider>
  );
};

export const AppProviders = ({ children }: { children: ReactNode }) => {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider>
        <InnerThemeProvider>{children}</InnerThemeProvider>
      </ThemeModeProvider>
    </QueryClientProvider>
  );
};
