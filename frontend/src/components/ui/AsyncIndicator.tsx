import { Group, Loader, Text } from '@mantine/core';

type AsyncIndicatorProps = {
  text: string;
  size?: 'xs' | 'sm' | 'md';
};

export const AsyncIndicator = ({ text, size = 'xs' }: AsyncIndicatorProps) => (
  <Group gap="xs" c="dimmed" fz={size === 'xs' ? 'sm' : 'md'}>
    <Loader size={size} />
    <Text size={size === 'xs' ? 'sm' : size}>{text}</Text>
  </Group>
);
