import { ActionIcon, Tooltip } from '@mantine/core';
import { IconMoonStars, IconSun } from '@tabler/icons-react';
import { useThemeMode } from '../../theme/ThemeModeContext';

export const ThemeToggle = () => {
  const { mode, toggleMode } = useThemeMode();

  const icon = mode === 'light' ? <IconMoonStars size={18} /> : <IconSun size={18} />;
  const label =
    mode === 'light' ? 'Přepnout na tmavý režim' : 'Přepnout na světlý režim';

  return (
    <Tooltip label={label} withArrow position="bottom">
      <ActionIcon
        radius="xl"
        variant="subtle"
        aria-label={label}
        onClick={toggleMode}
        size="lg"
      >
        {icon}
      </ActionIcon>
    </Tooltip>
  );
};
