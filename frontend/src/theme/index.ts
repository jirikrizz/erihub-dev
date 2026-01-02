import {
  createTheme,
  type MantineColorsTuple,
  type MantineTheme,
  type MantineThemeOverride,
} from '@mantine/core';
import type { Interpolation, Theme as EmotionTheme } from '@emotion/react';

export type ThemeMode = 'light' | 'dark';

type ButtonVariantParams = { variant?: string };

const ocean: MantineColorsTuple = [
  '#f4f7ff',
  '#dee6ff',
  '#c2d3ff',
  '#a3bcff',
  '#89a8ff',
  '#7298ff',
  '#618cff',
  '#537fea',
  '#4a72d1',
  '#3a5ab0',
];

const aurora: MantineColorsTuple = [
  '#f3fffb',
  '#d2faed',
  '#a7f1dc',
  '#7ce6c9',
  '#55daba',
  '#3bc7a9',
  '#2fb093',
  '#27947b',
  '#207a66',
  '#16574a',
];

const neutralLight: MantineColorsTuple = [
  '#f6f7fb',
  '#edeff5',
  '#e2e4ec',
  '#d6d9e3',
  '#c9ceda',
  '#b4bac7',
  '#919ab1',
  '#6f7892',
  '#565f72',
  '#3b4151',
];

const neutralDark: MantineColorsTuple = [
  '#f3f4f7',
  '#d1d5e1',
  '#b4bacd',
  '#969eb9',
  '#7a83a5',
  '#626a8e',
  '#4b5474',
  '#3a425c',
  '#2a3145',
  '#1a2131',
];

const cssVariables: Record<ThemeMode, Record<string, string>> = {
  light: {
    '--app-surface-root': '#f4f6fb',
    '--app-surface-header': 'rgba(250, 252, 255, 0.88)',
    '--app-surface-header-glow': 'none',
    '--app-surface-nav': 'rgba(255, 255, 255, 0.94)',
    '--app-surface-panel': 'rgba(255, 255, 255, 0.985)',
    '--app-surface-card': 'rgba(255, 255, 255, 0.995)',
    '--app-surface-input': 'rgba(255, 255, 255, 0.98)',
    '--app-input-border': 'rgba(136, 152, 198, 0.35)',
    '--app-input-border-strong': 'rgba(118, 140, 190, 0.56)',
    '--app-input-shadow': 'none',
    '--app-input-shadow-focus': 'none',
    '--app-input-placeholder': 'rgba(90, 104, 134, 0.76)',
    '--app-surface-frost': 'rgba(247, 249, 255, 0.78)',
    '--app-surface-elevated': 'rgba(252, 253, 255, 0.97)',
    '--app-border-subtle': 'rgba(136, 152, 198, 0.22)',
    '--app-border-strong': 'rgba(118, 136, 190, 0.38)',
    '--app-divider': 'rgba(118, 140, 190, 0.25)',
    '--app-text-primary': '#1c2338',
    '--app-text-secondary': '#3d4c6a',
    '--app-text-tertiary': '#5a6886',
    '--app-text-inverse': '#ffffff',
    '--app-shadow-soft': 'none',
    '--app-shadow-strong': 'none',
    '--app-gradient-accent': 'rgba(110, 148, 255, 0.16)',
    '--app-surface-main-gradient': 'none',
    '--app-selection-bg': 'rgba(110, 148, 255, 0.3)',
    '--app-selection-color': '#ffffff',
    '--app-scrollbar': 'rgba(126, 144, 190, 0.45)',
    '--app-mobile-footer-bg': 'rgba(250, 252, 255, 0.9)',
    '--app-table-header-bg': 'rgba(242, 246, 255, 0.78)',
    '--app-heading-primary': '#1c253c',
    '--app-heading-secondary': '#4a5976',
  },
  dark: {
    '--app-surface-root': '#0d121d',
    '--app-surface-header': 'rgba(15, 22, 36, 0.96)',
    '--app-surface-header-glow': 'none',
    '--app-surface-nav': '#121a2c',
    '--app-surface-panel': '#141e31',
    '--app-surface-card': '#18233a',
    '--app-surface-input': '#1c2941',
    '--app-input-border': 'rgba(136, 158, 216, 0.24)',
    '--app-input-border-strong': 'rgba(168, 194, 255, 0.38)',
    '--app-input-shadow': 'none',
    '--app-input-shadow-focus': 'none',
    '--app-input-placeholder': 'rgba(180, 196, 240, 0.72)',
    '--app-surface-frost': '#1b253a',
    '--app-surface-elevated': '#1a2337',
    '--app-border-subtle': 'rgba(128, 148, 200, 0.22)',
    '--app-border-strong': 'rgba(160, 186, 242, 0.42)',
    '--app-divider': 'rgba(132, 158, 224, 0.3)',
    '--app-text-primary': '#f6f8ff',
    '--app-text-secondary': '#d6dffa',
    '--app-text-tertiary': '#b5c3ee',
    '--app-text-inverse': '#0f141e',
    '--app-shadow-soft': 'none',
    '--app-shadow-strong': 'none',
    '--app-gradient-accent': 'rgba(128, 150, 255, 0.16)',
    '--app-surface-main-gradient': 'none',
    '--app-selection-bg': 'rgba(128, 150, 255, 0.28)',
    '--app-selection-color': '#0e1524',
    '--app-scrollbar': 'rgba(140, 158, 220, 0.36)',
    '--app-mobile-footer-bg': '#111828',
    '--app-table-header-bg': '#141d30',
    '--app-heading-primary': '#f5f8ff',
    '--app-heading-secondary': 'rgba(210, 222, 255, 0.82)',
  },
};

const INPUT_MIN_HEIGHT = '48px';
const INPUT_RADIUS = '18px';

const focusRingStyles = {
  borderColor: 'var(--app-input-border-strong)',
  boxShadow: 'none',
};

const baseInputStyles = {
  backgroundColor: 'var(--app-surface-input)',
  borderColor: 'var(--app-input-border)',
  borderStyle: 'solid',
  borderWidth: '1px',
  borderRadius: INPUT_RADIUS,
  boxShadow: 'var(--app-input-shadow)',
  color: 'var(--app-text-primary)',
  paddingInline: '18px',
  paddingBlock: '12px',
  fontSize: '0.95rem',
  transition: 'border-color 140ms ease',
};

const baseInputLabelStyles = {
  fontWeight: 600,
  textTransform: 'uppercase',
  fontSize: '0.7rem',
  letterSpacing: '0.08em',
  color: 'var(--app-text-secondary)',
  marginBottom: 6,
};

const baseInputDescriptionStyles = {
  color: 'var(--app-text-secondary)',
  fontSize: '0.72rem',
};

const baseInputErrorStyles = {
  fontWeight: 600,
  color: '#f7685b',
};

export const buildTheme = (mode: ThemeMode): MantineThemeOverride =>
  createTheme({
    primaryColor: 'ocean',
    primaryShade: { light: 5, dark: 4 },
    colors: {
      ocean,
      aurora,
      neutral: mode === 'light' ? neutralLight : neutralDark,
    },
    defaultRadius: 'lg',
    defaultGradient: { from: ocean[5], to: ocean[5], deg: 0 },
    shadows: {
      xs: 'none',
      sm: 'none',
      md: 'none',
      lg: 'none',
      xl: 'none',
    },
    fontFamily:
      "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontFamilyMonospace: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, monospace",
    headings: {
      fontFamily:
        "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
      fontWeight: '600',
      sizes: {
        h1: { fontSize: '2.625rem', fontWeight: '700', lineHeight: '1.15' },
        h2: { fontSize: '2.125rem', fontWeight: '700', lineHeight: '1.2' },
        h3: { fontSize: '1.75rem', fontWeight: '700', lineHeight: '1.25' },
        h4: { fontSize: '1.5rem', fontWeight: '700', lineHeight: '1.3' },
        h5: { fontSize: '1.25rem', fontWeight: '600', lineHeight: '1.35' },
        h6: { fontSize: '1.125rem', fontWeight: '600', lineHeight: '1.4' },
      },
    },
    breakpoints: {
      xs: '30em',
      sm: '40em',
      md: '56em',
      lg: '72em',
      xl: '90em',
    },
    components: {
      Input: {
        defaultProps: {
          radius: 'xl',
          size: 'md',
        },
        styles: () => ({
          label: {
            ...baseInputLabelStyles,
          },
          description: {
            ...baseInputDescriptionStyles,
          },
          error: {
            ...baseInputErrorStyles,
          },
          input: {
            ...baseInputStyles,
          },
        }),
      },
      TextInput: {
        defaultProps: {
          radius: 'xl',
          size: 'md',
        },
        styles: () => ({
          input: {
            ...baseInputStyles,
          },
          label: {
            ...baseInputLabelStyles,
          },
          description: {
            ...baseInputDescriptionStyles,
          },
          error: {
            ...baseInputErrorStyles,
          },
        }),
      },
      NumberInput: {
        defaultProps: {
          radius: 'xl',
          size: 'md',
        },
        styles: () => ({
          input: {
            ...baseInputStyles,
          },
          label: {
            ...baseInputLabelStyles,
          },
          description: {
            ...baseInputDescriptionStyles,
          },
          error: {
            ...baseInputErrorStyles,
          },
          control: {
            border: 'none',
            background: 'transparent',
            color: 'var(--app-text-secondary)',
          },
        }),
      },
      Select: {
        defaultProps: {
          radius: 'xl',
          size: 'md',
          rightSectionWidth: 42,
        },
        styles: () => ({
          input: {
            ...baseInputStyles,
          },
          label: {
            ...baseInputLabelStyles,
          },
          description: {
            ...baseInputDescriptionStyles,
          },
          error: {
            ...baseInputErrorStyles,
          },
          dropdown: {
            borderRadius: 18,
            border: '1px solid var(--app-border-subtle)',
            boxShadow: 'var(--app-shadow-soft)',
            background: 'var(--app-surface-card)',
          },
          option: {
            borderRadius: 12,
            fontWeight: 500,
          },
        }),
      },
      MultiSelect: {
        defaultProps: {
          radius: 'xl',
          size: 'md',
        },
        styles: () => ({
          input: {
            ...baseInputStyles,
          },
          label: {
            ...baseInputLabelStyles,
          },
          description: {
            ...baseInputDescriptionStyles,
          },
          error: {
            ...baseInputErrorStyles,
          },
          pill: {
            background: 'rgba(120, 150, 255, 0.18)',
            color: 'var(--app-text-primary)',
            fontWeight: 600,
          },
          dropdown: {
            borderRadius: 18,
            border: '1px solid var(--app-border-subtle)',
            boxShadow: 'var(--app-shadow-soft)',
            background: 'var(--app-surface-card)',
          },
        }),
      },
      Textarea: {
        defaultProps: {
          radius: 'xl',
          size: 'md',
          autosize: true,
          minRows: 3,
        },
        styles: () => ({
          input: {
            ...baseInputStyles,
            lineHeight: 1.6,
          },
          label: {
            ...baseInputLabelStyles,
          },
          description: {
            ...baseInputDescriptionStyles,
          },
          error: {
            ...baseInputErrorStyles,
          },
        }),
      },
      PasswordInput: {
        defaultProps: {
          radius: 'xl',
          size: 'md',
        },
        styles: () => ({
          input: {
            ...baseInputStyles,
          },
          label: {
            ...baseInputLabelStyles,
          },
          description: {
            ...baseInputDescriptionStyles,
          },
          error: {
            ...baseInputErrorStyles,
          },
          visibilityToggle: {
            color: 'var(--app-text-secondary)',
            '&:hover': {
              color: 'var(--app-text-primary)',
            },
          },
        }),
      },
      Button: {
        defaultProps: {
          radius: 'lg',
          size: 'md',
          fw: 600,
          variant: 'filled',
        },
        styles: (_theme: MantineTheme, params: ButtonVariantParams) => ({
          root: {
            letterSpacing: '-0.012em',
            transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease',
            '&:hover': {
              backgroundColor: ocean[6],
            },
            ...(params.variant === 'light' && {
              backgroundColor: 'var(--app-surface-panel)',
              color: 'var(--app-text-primary)',
              border: '1px solid var(--app-border-subtle)',
              '&:hover': {
                backgroundColor: 'var(--app-surface-elevated)',
                borderColor: 'var(--app-border-strong)',
              },
            }),
            ...(params.variant === 'subtle' && {
              backgroundColor: 'rgba(140, 156, 200, 0.12)',
              color: 'var(--app-text-primary)',
              border: '1px solid transparent',
              '&:hover': {
                backgroundColor: 'rgba(118, 148, 255, 0.18)',
                borderColor: 'var(--app-border-subtle)',
              },
            }),
          },
        }),
      },
      SegmentedControl: {
        defaultProps: {
          radius: 'xl',
          size: 'md',
        },
        styles: () => ({
          root: {
            padding: 4,
            background: 'var(--app-surface-nav)',
            borderRadius: 999,
            border: '1px solid var(--app-border-subtle)',
          },
          indicator: {
            borderRadius: 999,
            background: 'rgba(110, 148, 255, 0.22)',
          },
          control: {
            borderRadius: 999,
          },
          label: {
            fontWeight: 600,
            color: 'var(--app-text-secondary)',
            transition: 'color 120ms ease',
          },
        }),
      },
      Switch: {
        defaultProps: {
          size: 'md',
        },
        styles: () => ({
          label: {
            fontWeight: 600,
            color: 'var(--app-text-secondary)',
          },
          track: {
            background: 'var(--app-surface-panel)',
            border: '1px solid var(--app-border-subtle)',
          },
          thumb: {
            background: 'var(--app-text-inverse)',
          },
        }),
      },
      Tabs: {
        defaultProps: {
          radius: 'lg',
          keepMounted: false,
        },
        styles: () => ({
          list: {
            display: 'inline-flex',
            gap: 6,
            padding: 4,
            borderRadius: 999,
            background: 'var(--app-surface-nav)',
            border: '1px solid var(--app-border-subtle)',
            boxShadow: 'var(--app-shadow-soft)',
            position: 'relative',
            '--tabs-list-border-width': '0px',
            '--tabs-list-bottom-border-width': '0px',
            '--tabs-list-color': 'transparent',
            '&::before': {
              content: '""',
              position: 'absolute',
              insetInlineStart: 'var(--tabs-list-line-start, 0)',
              insetInlineEnd: 'var(--tabs-list-line-end, 0)',
              top: 'var(--tabs-list-line-top, auto)',
              bottom: 'var(--tabs-list-line-bottom, auto)',
              border: 0,
              height: 0,
              opacity: 0,
              display: 'none',
              pointerEvents: 'none',
            },
          },
          tab: {
            borderRadius: 999,
            fontWeight: 600,
            color: 'var(--app-text-secondary)',
            border: 'none',
            paddingInline: '1.1rem',
            transition: 'color 140ms ease, background 140ms ease',
          },
        }),
      },
      Table: {
        styles: () => ({
          thead: {
            background: 'transparent',
          },
          th: {
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontSize: '0.72rem',
            color: 'var(--app-text-tertiary)',
          },
        }),
      },
      ActionIcon: {
        defaultProps: {
          variant: 'subtle',
          radius: 'lg',
          size: 'lg',
        },
        styles: () => ({
          root: {
            transition: 'background 150ms ease, color 150ms ease',
            '&:hover': {
              backgroundColor: 'rgba(116, 139, 190, 0.12)',
            },
          },
        }),
      },
      Card: {
        defaultProps: {
          radius: 'xl',
          withBorder: false,
          padding: 'lg',
        },
        styles: () => ({
          root: {
            backgroundColor: 'var(--app-surface-card)',
            border: '1px solid var(--app-border-subtle)',
          },
        }),
      },
      Paper: {
        defaultProps: {
          radius: 'lg',
          withBorder: false,
        },
        styles: () => ({
          root: {
            backgroundColor: 'var(--app-surface-panel)',
            border: '1px solid var(--app-border-subtle)',
          },
        }),
      },
      Tooltip: {
        defaultProps: {
          color: 'dark',
          radius: 'md',
          withArrow: true,
          arrowSize: 8,
        },
      },
      Modal: {
        defaultProps: {
          centered: true,
          overlayProps: { opacity: 0.55, blur: 0 },
        },
        styles: () => ({
          content: {
            boxShadow: 'none',
            border: '1px solid var(--app-border-subtle)',
            background: 'var(--app-surface-card)',
          },
          header: {
            background: 'transparent',
          },
          body: {
            background: 'transparent',
          },
        }),
      },
      Drawer: {
        styles: () => ({
          content: {
            boxShadow: 'none',
            border: '1px solid var(--app-border-subtle)',
            background: 'var(--app-surface-card)',
          },
        }),
      },
      Popover: {
        styles: () => ({
          dropdown: {
            boxShadow: 'none',
            border: '1px solid var(--app-border-subtle)',
            background: 'var(--app-surface-card)',
          },
        }),
      },
      HoverCard: {
        styles: () => ({
          dropdown: {
            boxShadow: 'none',
            border: '1px solid var(--app-border-subtle)',
            background: 'var(--app-surface-card)',
          },
        }),
      },
      Menu: {
        styles: () => ({
          dropdown: {
            boxShadow: 'none',
            border: '1px solid var(--app-border-subtle)',
            background: 'var(--app-surface-card)',
          },
        }),
      },
      Notification: {
        styles: () => ({
          root: {
            boxShadow: 'none',
            border: '1px solid var(--app-border-subtle)',
            background: 'var(--app-surface-card)',
          },
        }),
      },
      NavLink: {
        styles: () => ({
          root: {
            fontWeight: 600,
            letterSpacing: '-0.01em',
          },
          label: {
            color: 'inherit',
          },
        }),
      },
    },
  });

export const getGlobalStyles = (mode: ThemeMode): Interpolation<EmotionTheme> => {
  const vars = cssVariables[mode];

  const rootVariables = Object.fromEntries(
    Object.entries(vars).map(([key, value]) => [key, value])
  );

  return {
    ':root': rootVariables,
    '::selection': {
      backgroundColor: 'var(--app-selection-bg)',
      color: 'var(--app-selection-color)',
    },
    body: {
      backgroundColor: 'var(--app-surface-root)',
      color: 'var(--app-text-primary)',
      fontFeatureSettings: "'liga' on, 'calt' on",
    },
    'body::-webkit-scrollbar': {
      width: 10,
    },
    'body::-webkit-scrollbar-thumb': {
      backgroundColor: 'var(--app-scrollbar)',
      borderRadius: 999,
    },
    '.mantine-Input-input': {
      backgroundColor: 'var(--app-surface-input)',
      borderColor: 'var(--app-input-border)',
      borderStyle: 'solid',
      borderWidth: '1px',
      borderRadius: INPUT_RADIUS,
      boxShadow: 'var(--app-input-shadow)',
      color: 'var(--app-text-primary)',
      paddingInline: '18px',
      paddingBlock: '12px',
      fontSize: '0.95rem',
      transition: 'border-color 140ms ease',
    },
    '.mantine-Input-input::placeholder': {
      color: 'var(--app-input-placeholder)',
      opacity: 1,
    },
    '.mantine-Input-input:not(textarea)': {
      minHeight: INPUT_MIN_HEIGHT,
    },
    '.mantine-Input-input:hover': {
      ...focusRingStyles,
    },
    '.mantine-Input-input:focus, .mantine-Input-input:focus-visible': {
      ...focusRingStyles,
    },
    '.mantine-Input-input[data-expanded]': {
      ...focusRingStyles,
    },
    '.mantine-Input-input[data-invalid]': {
      borderColor: '#f04d43',
      boxShadow: 'none',
    },
    '.mantine-Input-input[data-disabled]': {
      opacity: 0.6,
      boxShadow: 'none',
      pointerEvents: 'none',
    },
    '.mantine-NumberInput-control:hover': {
      color: 'var(--app-text-primary)',
    },
    '.mantine-Select-option[data-selected]': {
      background: 'rgba(120, 150, 255, 0.18)',
      color: 'var(--app-text-primary)',
    },
    '.mantine-MultiSelect-option[data-selected]': {
      background: 'rgba(120, 150, 255, 0.18)',
      color: 'var(--app-text-primary)',
    },
    '.mantine-SegmentedControl-label': {
      fontWeight: 600,
      color: 'var(--app-text-secondary)',
      transition: 'color 120ms ease',
    },
    '.mantine-SegmentedControl-label[data-active]': {
      color: 'var(--app-text-inverse)',
    },
    '.mantine-Tabs-list::before': {
      opacity: 0,
      borderColor: 'transparent',
    },
    '.mantine-Tabs-tab': {
      borderRadius: 999,
      fontWeight: 600,
      color: 'var(--app-text-secondary)',
      border: 'none',
      paddingInline: '1.1rem',
      transition: 'color 140ms ease, background 140ms ease',
    },
    '.mantine-Tabs-tab:hover': {
      color: 'var(--app-text-primary)',
    },
    '.mantine-Tabs-tab[data-active]': {
      background: 'var(--app-gradient-accent)',
      color: 'var(--app-text-inverse)',
      boxShadow: 'none',
    },
    '.mantine-Card-root, .mantine-Paper-root, .mantine-Modal-content, .mantine-Drawer-content, .mantine-Popover-dropdown, .mantine-Menu-dropdown, .mantine-HoverCard-dropdown, .mantine-Notification-root': {
      backgroundColor: 'var(--app-surface-card) !important',
      backgroundImage: 'none !important',
      boxShadow: 'none !important',
      border: '1px solid var(--app-border-subtle) !important',
    },
  };
};
