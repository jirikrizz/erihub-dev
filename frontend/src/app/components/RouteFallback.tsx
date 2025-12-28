import { Center, Loader, Stack, Text } from '@mantine/core';

export const RouteFallback = () => (
  <Center mih={240}>
    <Stack gap={6} align="center">
      <Loader size="sm" />
      <Text size="sm" c="dimmed">
        Načítám…
      </Text>
    </Stack>
  </Center>
);

