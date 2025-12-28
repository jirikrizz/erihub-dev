import { Group, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import classes from './PageShell.module.css';

type PageShellProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  maxWidth?: number | string;
};

export const PageShell = ({
  title,
  description,
  actions,
  children,
  className,
  maxWidth,
}: PageShellProps) => (
  <Stack
    gap="xl"
    className={clsx(classes.shell, className)}
    style={maxWidth ? { maxWidth } : undefined}
  >
    <div className={classes.header}>
      <Stack gap={6} className={classes.heading}>
        <Title order={2} className={classes.title}>
          {title}
        </Title>
        {description && (
          <Text className={classes.description}>{description}</Text>
        )}
      </Stack>
      {actions && (
        <div className={classes.actions}>
          <Group gap="sm" wrap="wrap" justify="flex-end">
            {actions}
          </Group>
        </div>
      )}
    </div>

    <Stack gap="xl" className={classes.body}>
      {children}
    </Stack>
  </Stack>
);
