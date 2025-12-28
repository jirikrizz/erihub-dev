import { Card, Group, Stack, Text } from '@mantine/core';
import type { ThemeSettings } from '../types';

type ThemePreviewProps = {
  value: ThemeSettings;
};

export const ThemePreview = ({ value }: ThemePreviewProps) => (
  <Card withBorder>
    <Stack>
      <Text fw={600}>Náhled brandu</Text>
      <Group>
        {Object.entries(value.palette).map(([key, color]) => (
          <Stack key={key} gap={6} align="center">
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                border: '1px solid rgba(0,0,0,0.1)',
                background: color,
              }}
            />
            <Text size="xs" c="dimmed" ta="center">
              {key}
            </Text>
          </Stack>
        ))}
      </Group>
      <Group>
        <Stack gap={2}>
          <Text size="sm" c="dimmed">
            Display
          </Text>
          <Text style={{ fontFamily: value.typography.display, fontSize: 24 }}>Nadpis microshopu</Text>
        </Stack>
        <Stack gap={2}>
          <Text size="sm" c="dimmed">
            Text
          </Text>
          <Text style={{ fontFamily: value.typography.sans }}>Kurátorovaný popis kolekce</Text>
        </Stack>
      </Group>
    </Stack>
  </Card>
);
