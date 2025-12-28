import { Card, ColorInput, Group, Select, Stack, Text } from '@mantine/core';
import type { ThemeSettings } from '../types';

const DISPLAY_FONTS = [
  { value: 'Clash Display', label: 'Clash Display' },
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'Cormorant', label: 'Cormorant' },
  { value: 'Roslindale', label: 'Roslindale' },
];

const BODY_FONTS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Satoshi', label: 'Satoshi' },
  { value: 'Space Grotesk', label: 'Space Grotesk' },
  { value: 'DM Sans', label: 'DM Sans' },
];

type ThemeEditorProps = {
  value: ThemeSettings;
  onChange: (value: ThemeSettings) => void;
};

export const ThemeEditor = ({ value, onChange }: ThemeEditorProps) => {
  const updatePalette = (key: keyof ThemeSettings['palette'], color: string) => {
    onChange({
      ...value,
      palette: {
        ...value.palette,
        [key]: color,
      },
    });
  };

  const updateFont = (key: keyof ThemeSettings['typography'], font: string | null) => {
    onChange({
      ...value,
      typography: {
        ...value.typography,
        [key]: font ?? value.typography[key],
      },
    });
  };

  return (
    <Card withBorder>
      <Stack gap="md">
        <div>
          <Text fw={600}>Barvy</Text>
          <Text size="sm" c="dimmed">
            Nastav primární odstín značky, doplňkové barvy a gradient microshopu.
          </Text>
        </div>
        <Group grow>
          <ColorInput label="Primární" value={value.palette.primary} onChange={(color) => updatePalette('primary', color)} />
          <ColorInput label="Sekundární" value={value.palette.secondary} onChange={(color) => updatePalette('secondary', color)} />
          <ColorInput label="Accent" value={value.palette.accent} onChange={(color) => updatePalette('accent', color)} />
        </Group>
        <Group grow>
          <ColorInput label="Pozadí" value={value.palette.background} onChange={(color) => updatePalette('background', color)} />
          <ColorInput label="Povrch" value={value.palette.surface} onChange={(color) => updatePalette('surface', color)} />
          <ColorInput label="Text" value={value.palette.onSurface} onChange={(color) => updatePalette('onSurface', color)} />
        </Group>
        <Group grow>
          <ColorInput label="Gradient od" value={value.palette.gradientFrom} onChange={(color) => updatePalette('gradientFrom', color)} />
          <ColorInput label="Gradient do" value={value.palette.gradientTo} onChange={(color) => updatePalette('gradientTo', color)} />
        </Group>
        <div>
          <Text fw={600}>Typography</Text>
          <Text size="sm" c="dimmed">
            Vyber font pro titulky a body text.
          </Text>
        </div>
        <Group grow>
          <Select
            label="Display font"
            data={DISPLAY_FONTS}
            value={value.typography.display}
            onChange={(font) => updateFont('display', font)}
          />
          <Select label="Text font" data={BODY_FONTS} value={value.typography.sans} onChange={(font) => updateFont('sans', font)} />
        </Group>
      </Stack>
    </Card>
  );
};
