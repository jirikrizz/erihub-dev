import { Group } from '@mantine/core';
import type { ReactNode } from 'react';

type FilterBarProps = {
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
};

export const FilterBar = ({ left, right, children }: FilterBarProps) => (
  <Group justify="space-between" gap="sm" wrap="wrap">
    <Group gap="xs" wrap="wrap">
      {left ?? children}
    </Group>
    {right && (
      <Group gap="xs" wrap="wrap">
        {right}
      </Group>
    )}
  </Group>
);
