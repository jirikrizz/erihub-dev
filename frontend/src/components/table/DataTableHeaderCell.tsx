import { ActionIcon, Box, Popover } from '@mantine/core';
import {
  IconArrowsSort,
  IconArrowUp,
  IconArrowDown,
  IconFilter,
} from '@tabler/icons-react';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import classes from './DataTable.module.css';
import type { SortDescriptor } from './sorting';

type ColumnKey = string;

type HeaderAlign = 'left' | 'center' | 'right';

export type HeaderColumn<K extends ColumnKey, S extends K = K> = {
  key: K;
  label: ReactNode;
  sortable?: boolean;
  align?: HeaderAlign;
  sortKey?: S;
  filterContent?: ReactNode;
  filterActive?: boolean;
  actions?: ReactNode;
};

type ResizeHandlers = {
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  active?: boolean;
};

type DataTableHeaderCellProps<K extends ColumnKey, S extends K = K> = {
  column: HeaderColumn<K, S>;
  sortState: SortDescriptor<S>[];
  onToggleSort?: (column: S, multi: boolean) => void;
  width?: number;
  resizeHandlers?: ResizeHandlers;
};

export const DataTableHeaderCell = <K extends ColumnKey, S extends K = K>({
  column,
  sortState,
  onToggleSort,
  width,
  resizeHandlers,
}: DataTableHeaderCellProps<K, S>) => {
  const sortable = Boolean(column.sortable && onToggleSort);
  const fallbackSortKey = column.key as unknown as S;
  const sortKey: S | null = sortable ? column.sortKey ?? fallbackSortKey : null;
  const descriptorIndex = sortKey ? sortState.findIndex((descriptor) => descriptor.column === sortKey) : -1;
  const descriptor = descriptorIndex >= 0 ? sortState[descriptorIndex] : null;

  const textAlign = column.align ?? 'left';
  const sortIcon = sortable
    ? descriptor
      ? descriptor.direction === 'asc'
        ? <IconArrowUp size={13} stroke={1.8} />
        : <IconArrowDown size={13} stroke={1.8} />
      : <IconArrowsSort size={13} stroke={1.8} />
    : null;

  const ariaSort = descriptor ? (descriptor.direction === 'asc' ? 'ascending' : 'descending') : 'none';

  const handleSort = (event: React.MouseEvent | React.KeyboardEvent) => {
    if (!sortable || !sortKey) return;
    // prevent triggering sort when clicking filter icon
    if ('stopPropagation' in event) {
      event.stopPropagation();
    }
    onToggleSort?.(sortKey, (event as React.MouseEvent).shiftKey || (event as React.MouseEvent).metaKey);
  };

  return (
    <th
      className={clsx(classes.headerCell, descriptor && classes.headerCellSorted)}
      style={width ? { width, textAlign } : { textAlign }}
      scope="col"
      aria-sort={ariaSort}
    >
      <Box
        component="div"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <div
          className={classes.headerButton}
          role={sortable ? 'button' : undefined}
          tabIndex={sortable ? 0 : undefined}
          onClick={handleSort}
          onKeyDown={(event) => {
            if (!sortable) return;
            if (event.key === 'Enter' || event.key === ' ') {
              handleSort(event);
            }
          }}
          data-sortable={sortable || undefined}
        >
          <span className={classes.headerLabel}>{column.label}</span>
          {sortable && (
            <span className={classes.sortIndicator} data-active={descriptor ? 'true' : undefined}>
              {sortIcon}
              {descriptor && <span className={classes.sortOrderBadge}>{descriptorIndex + 1}</span>}
            </span>
          )}
        </div>
        {column.filterContent && (
          <Popover width={260} position="bottom-start" withArrow shadow="md">
            <Popover.Target>
              <ActionIcon
                variant="subtle"
                size="sm"
                radius="sm"
                color={column.filterActive ? 'blue' : undefined}
                aria-label="Filtrovat sloupec"
                className={classes.filterIcon}
                onClick={(event) => event?.stopPropagation?.()}
                onMouseDown={(event) => event?.stopPropagation?.()}
              >
                <IconFilter size={14} />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown onClick={(event) => event?.stopPropagation?.()}>
              {column.filterContent}
            </Popover.Dropdown>
          </Popover>
        )}
        {column.actions && (
          <div onClick={(event) => event.stopPropagation()}>{column.actions}</div>
        )}
      </Box>
      {resizeHandlers && (
        <div
          className={classes.resizeHandle}
          onMouseDown={resizeHandlers.onMouseDown}
          onDoubleClick={resizeHandlers.onDoubleClick}
          data-resizing={resizeHandlers.active ? 'true' : undefined}
          role="separator"
          aria-orientation="vertical"
        />
      )}
    </th>
  );
};
