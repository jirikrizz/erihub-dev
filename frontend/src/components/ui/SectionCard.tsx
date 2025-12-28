import type { CardProps } from '@mantine/core';
import { Card, Stack, Text } from '@mantine/core';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import classes from './SectionCard.module.css';

type SectionCardProps = CardProps & {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export const SectionCard = ({
  title,
  subtitle,
  actions,
  children,
  className,
  padding = 'xl',
  ...rest
}: SectionCardProps) => (
  <Card shadow="none" radius="lg" withBorder={false} p={padding} className={clsx(classes.sectionCard, className)} {...rest}>
    {(title || subtitle || actions) && (
      <div className={classes.sectionHeader}>
        <Stack gap={4}>
          {title && (
            <Text className={classes.sectionTitle}>
              {title}
            </Text>
          )}
          {subtitle && (
            <Text className={classes.sectionSubtitle}>
              {subtitle}
            </Text>
          )}
        </Stack>
        {actions}
      </div>
    )}
    {children}
  </Card>
);
