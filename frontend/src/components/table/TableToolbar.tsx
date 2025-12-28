import { Button, Checkbox, Group, Popover, Stack } from '@mantine/core';
import type { MantineSize } from '@mantine/core';
import { IconCloudDownload, IconEye } from '@tabler/icons-react';

type ColumnConfig = {
  key: string;
  label: string;
};

type TableToolbarProps = {
  exportLabel?: string;
  onExport?: () => void;
  exportLoading?: boolean;
  columns: ColumnConfig[];
  columnVisibility: Record<string, boolean>;
  onToggleColumn: (key: string, visible: boolean) => void;
  buttonSize?: MantineSize;
  radius?: MantineSize;
};

export const TableToolbar = ({
  exportLabel = 'Export do CSV',
  onExport,
  exportLoading,
  columns,
  columnVisibility,
  onToggleColumn,
  buttonSize = 'sm',
  radius = 'md',
}: TableToolbarProps) => {
  return (
    <Group justify="flex-end" align="center" gap="xs" wrap="nowrap">
      {onExport && (
        <Button
          variant="light"
          leftSection={<IconCloudDownload size={16} />}
          onClick={onExport}
          loading={exportLoading}
          size={buttonSize}
          radius={radius}
          styles={{
            root: {
              fontWeight: 600,
              paddingInline: buttonSize === 'xs' ? 12 : undefined,
              height: 36,
            },
          }}
        >
          {exportLabel}
        </Button>
      )}
      <Popover position="bottom-end" withArrow shadow="md">
        <Popover.Target>
          <Button
            variant="light"
            leftSection={<IconEye size={16} />}
            size={buttonSize}
            radius={radius}
            styles={{
              root: {
                fontWeight: 600,
                paddingInline: buttonSize === 'xs' ? 12 : undefined,
                height: 36,
              },
            }}
          >
            Sloupce
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            {columns.map(({ key, label }) => (
              <Checkbox
                key={key}
                label={label}
                checked={columnVisibility[key] ?? true}
                onChange={(event) => onToggleColumn(key, event.currentTarget.checked)}
              />
            ))}
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
};
