import { Center, Stack, Text, Title } from '@mantine/core';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../features/auth/store';
import { firstAccessibleSectionPath } from './sections';

export const DefaultSectionRedirect = () => {
  const sections = useAuthStore((state) => state.user?.sections);
  const fallback = firstAccessibleSectionPath(sections ?? []);

  if (fallback) {
    return <Navigate to={fallback} replace />;
  }

  return (
    <Center h="100%">
      <Stack align="center" gap="xs">
        <Title order={3}>Nemáš aktivní přístup</Title>
        <Text c="gray.6" ta="center">
          Správce ti zatím nepřiřadil žádnou sekci administrace. Ozvi se mu, prosím, ať ti přístup povolí.
        </Text>
      </Stack>
    </Center>
  );
};
