import { Stack, Text } from '@mantine/core';
import { SectionPageShell } from '../../../components/layout/SectionPageShell';
import { SurfaceCard } from '../../../components/layout/SurfaceCard';

export const TasksPage = () => (
  <SectionPageShell section="tasks">
    <Stack>
      <SurfaceCard>
      <Text size="sm" c="dimmed">
        Správa úkolů překladatelů bude doplněna v další iteraci.
      </Text>
      </SurfaceCard>
    </Stack>
  </SectionPageShell>
);