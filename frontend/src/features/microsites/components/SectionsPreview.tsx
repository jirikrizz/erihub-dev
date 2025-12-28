import { Card, Stack, Text } from '@mantine/core';
import type { MicrositeSection } from '../types';

type SectionsPreviewProps = {
  sections: MicrositeSection[];
};

export const SectionsPreview = ({ sections }: SectionsPreviewProps) => (
  <Card withBorder>
    <Stack gap="xs">
      <Text fw={600}>Sekce v pořadí</Text>
      {sections.length === 0 ? (
        <Text size="sm" c="dimmed">
          Zatím žádná sekce. Přidej hero nebo katalog.
        </Text>
      ) : (
        sections.map((section, index) => (
          <div key={section.id} className="flex items-center justify-between text-sm">
            <div>
              <Text fw={500}>{section.title || section.type}</Text>
              <Text size="xs" c="dimmed">
                {section.type} • #{index + 1}
              </Text>
            </div>
            <Text size="xs" c="dimmed">
              {section.description?.slice(0, 48) ?? ''}
            </Text>
          </div>
        ))
      )}
    </Stack>
  </Card>
);
