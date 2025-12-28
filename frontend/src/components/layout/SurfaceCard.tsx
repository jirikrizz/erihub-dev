import { Paper, type PaperProps } from '@mantine/core';
import clsx from 'clsx';
import type { PropsWithChildren } from 'react';
import classes from './SurfaceCard.module.css';

type SurfaceCardProps = PropsWithChildren<
  PaperProps & {
  contentClassName?: string;
  }
>;

export const SurfaceCard = ({
  className,
  contentClassName,
  children,
  radius = 'xl',
  p = 'lg',
  ...rest
}: SurfaceCardProps) => (
  <Paper
    radius={radius}
    p={p}
    className={clsx(classes.surfaceCard, className)}
    {...rest}
  >
    <div className={clsx(classes.surfaceCardContent, contentClassName)}>{children}</div>
  </Paper>
);
