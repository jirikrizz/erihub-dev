import { Center, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../features/auth/store';
import type { SectionKey } from './sections';
import { firstAccessibleSectionPath } from './sections';

type RequireSectionProps = {
  section: SectionKey;
  children: ReactNode;
};

export const RequireSection = ({ section, children }: RequireSectionProps) => {
  const location = useLocation();
  const sections = useAuthStore((state) => state.user?.sections);

  if (sections?.includes(section)) {
    return <>{children}</>;
  }

  const fallback = firstAccessibleSectionPath(sections ?? []);

  if (fallback) {
    return <Navigate to={fallback} replace state={{ from: location }} />;
  }

  return (
    <Center h="100%">
      <Stack align="center" gap="xs">
        <Title order={3}>Nemáš přístup do této sekce</Title>
        <Text c="gray.6" ta="center">
          Požádej správce, aby ti přidělil oprávnění alespoň do jedné sekce administrace.
        </Text>
      </Stack>
    </Center>
  );
};
