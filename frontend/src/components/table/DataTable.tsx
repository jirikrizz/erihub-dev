import type { ColumnDef, ColumnOrderState, VisibilityState, SortingState } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ActionIcon,
  Checkbox,
  Group,
  Loader,
  Menu,
  ScrollArea,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { useMemo, useRef, useState } from 'react';
import { IconArrowsSort, IconDownload, IconEye, IconEyeOff, IconSelector } from '@tabler/icons-react';
import classes from './DataTable.module.css';

export type DataTableProps<TData> = {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  isLoading?: boolean;
  height?: number;
  virtualized?: boolean;
  enableRowSelection?: boolean;
  onRowClick?: (row: TData) => void;
  emptyContent?: React.ReactNode;
  stickyHeader?: boolean;
  title?: React.ReactNode;
  filterBar?: React.ReactNode;
  actions?: React.ReactNode;
  onExportCsv?: () => Promise<{ data: TData[]; filename?: string }> | { data: TData[]; filename?: string };
};

const ROW_HEIGHT = 48;

export function DataTable<TData>({
  data,
  columns,
  isLoading = false,
  height = 480,
  virtualized = true,
  enableRowSelection = false,
  onRowClick,
  emptyContent = <Text c="dimmed">Žádná data k zobrazení.</Text>,
  stickyHeader = true,
  title = 'Tabulka',
  filterBar,
  actions,
  onExportCsv,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [exporting, setExporting] = useState(false);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnOrder,
    },
    enableRowSelection,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  const visibleColumns = useMemo(() => table.getVisibleLeafColumns(), [table]);

  const renderHeader = () => (
    <Table.Thead>
      <Table.Tr>
        {enableRowSelection && (
          <Table.Th w={36} className={classes.headerCell}>
            <Checkbox
              aria-label="Vybrat vše"
              checked={table.getIsAllRowsSelected()}
              indeterminate={table.getIsSomeRowsSelected()}
              onChange={table.getToggleAllRowsSelectedHandler()}
            />
          </Table.Th>
        )}
      {visibleColumns.map((column) => {
        const sortable = column.getCanSort();
        const sorted = column.getIsSorted();

        return (
          <Table.Th
            key={column.id}
            className={classes.headerCell}
            style={{ width: column.getSize() }}
          >
              <button
                className={classes.headerButton}
                data-sortable={sortable || undefined}
                onClick={sortable ? column.getToggleSortingHandler() : undefined}
                type="button"
              >
                <span className={classes.headerLabel}>
                  {flexRender(column.columnDef.header, { table, column } as any)}
                </span>
                {sortable && (
                  <span className={classes.sortIndicator} data-active={Boolean(sorted) || undefined}>
                    {sorted === 'asc' && <IconArrowsSort size={14} style={{ transform: 'rotate(180deg)' }} />}
                    {sorted === 'desc' && <IconArrowsSort size={14} />}
                    {!sorted && <IconSelector size={14} />}
                  </span>
                )}
              </button>
            </Table.Th>
          );
        })}
      </Table.Tr>
    </Table.Thead>
  );

  const downloadCsv = async () => {
    if (!onExportCsv) return;
    try {
      setExporting(true);
      const result = await onExportCsv();
      const { data: exportData, filename = 'export.csv' } = result;
      const cols = table.getAllLeafColumns().filter((col) => col.getIsVisible());
      const header = cols.map((c) =>
        typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id
      );
      const rowsCsv = exportData.map((row) =>
        cols
          .map((c) => {
            const value = (row as any)[c.id];
            if (value === null || value === undefined) return '';
            if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
            return String(value);
          })
          .join(',')
      );
      const csv = [header.join(','), ...rowsCsv].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const renderRows = () => {
    if (isLoading) {
      return (
        <Table.Tbody>
          <Table.Tr>
            <Table.Td colSpan={visibleColumns.length + (enableRowSelection ? 1 : 0)}>
              <Group gap="xs">
                <Loader size="sm" />
                <Text c="dimmed">Načítám data...</Text>
              </Group>
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      );
    }

    if (rows.length === 0) {
      return (
        <Table.Tbody>
          <Table.Tr>
            <Table.Td colSpan={visibleColumns.length + (enableRowSelection ? 1 : 0)}>
              {emptyContent}
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      );
    }

    if (!virtualized) {
      return (
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr
              key={row.id}
              className={`${classes.row} ${onRowClick ? classes.rowClickable : ''}`}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            >
              {enableRowSelection && (
                <Table.Td w={36} className={classes.cell}>
                  <Checkbox
                    aria-label="Vybrat řádek"
                    checked={row.getIsSelected()}
                    onChange={row.getToggleSelectedHandler()}
                  />
                </Table.Td>
              )}
              {row.getVisibleCells().map((cell) => (
                <Table.Td key={cell.id} className={classes.cell} style={{ width: cell.column.getSize() }}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      );
    }

    return (
      <Table.Tbody
        className={classes.body}
        style={{ height: totalHeight }}
      >
        {virtualItems.map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <Table.Tr
              key={row.id}
              className={`${classes.virtualRow} ${classes.row} ${onRowClick ? classes.rowClickable : ''}`}
              style={{ top: virtualRow.start, height: virtualRow.size }}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            >
              {enableRowSelection && (
                <Table.Td w={36} className={classes.cell}>
                  <Checkbox
                    aria-label="Vybrat řádek"
                    checked={row.getIsSelected()}
                    onChange={row.getToggleSelectedHandler()}
                  />
                </Table.Td>
              )}
              {row.getVisibleCells().map((cell) => (
                <Table.Td key={cell.id} className={classes.cell} style={{ width: cell.column.getSize() }}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </Table.Td>
              ))}
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    );
  };

  return (
    <Stack gap="xs" className={classes.wrapper}>
      <Group justify="space-between" px="md" py={8}>
        <div className={classes.toolbarLeft}>
          <Text fw={600}>{title}</Text>
          {filterBar}
        </div>
        <div className={classes.toolbarRight}>
          {actions}
          {onExportCsv && (
            <Tooltip label="Export CSV">
              <ActionIcon variant="subtle" onClick={downloadCsv} disabled={exporting}>
                {exporting ? <Loader size="xs" /> : <IconDownload size={18} />}
              </ActionIcon>
            </Tooltip>
          )}
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" aria-label="Zobrazit sloupce">
                <IconEye size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {table.getAllLeafColumns().map((column) => (
                <Menu.Item
                  key={column.id}
                  leftSection={column.getIsVisible() ? <IconEye size={14} /> : <IconEyeOff size={14} />}
                  onClick={() => column.toggleVisibility()}
                >
                  {column.columnDef.header && typeof column.columnDef.header === 'string'
                    ? column.columnDef.header
                    : column.id}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </div>
      </Group>

      <ScrollArea
        h={height}
        scrollbarSize={10}
        offsetScrollbars
        viewportRef={virtualized ? viewportRef : undefined}
      >
        <Table
          withRowBorders={false}
          highlightOnHover={false}
          stickyHeader={stickyHeader}
          style={{ tableLayout: 'fixed' }}
        >
          {renderHeader()}
          {renderRows()}
        </Table>
      </ScrollArea>
    </Stack>
  );
}
