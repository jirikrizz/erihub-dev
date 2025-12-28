import { SimpleGrid, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import classes from './MetricGrid.module.css';

export type MetricItem = {
  label: ReactNode;
  value: ReactNode;
  description?: ReactNode;
};

type MetricGridProps = {
  items: MetricItem[];
};

export const MetricGrid = ({ items }: MetricGridProps) => (
  <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
    {items.map((item) => (
      <Stack key={String(item.label)} className={classes.metricCard} gap={6}>
        <Text className={classes.metricLabel}>{item.label}</Text>
        <Text className={classes.metricValue}>{item.value}</Text>
        {item.description && <Text className={classes.metricDescription}>{item.description}</Text>}
      </Stack>
    ))}
  </SimpleGrid>
);
