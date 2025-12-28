import { useState } from 'react';
import { Button } from '@mantine/core';
import { IconCloudDownload } from '@tabler/icons-react';
import { TableExportModal, type TableExportModalProps } from './TableExportModal';

type ExportOptions = Parameters<TableExportModalProps['onConfirm']>[0];

export type TableExportActionProps = {
  totalCount: number;
  selectedCount: number;
  onExport: (options: ExportOptions) => Promise<void> | void;
  label?: string;
  defaultScope?: ExportOptions['scope'];
  defaultColumns?: ExportOptions['columns'];
  size?: 'xs' | 'sm' | 'md';
  variant?: 'light' | 'subtle' | 'filled';
  radius?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
};

export const TableExportAction = ({
  totalCount,
  selectedCount,
  onExport,
  label = 'Export do CSV',
  defaultScope = 'all',
  defaultColumns = 'visible',
  size = 'sm',
  variant = 'light',
  radius = 'md',
}: TableExportActionProps) => {
  const [opened, setOpened] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async (options: ExportOptions) => {
    setLoading(true);
    try {
      await onExport(options);
    } finally {
      setLoading(false);
      setOpened(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        leftSection={<IconCloudDownload size={16} />}
        onClick={() => setOpened(true)}
        loading={loading}
        size={size}
        radius={radius}
        styles={{
          root: {
            fontWeight: 600,
            paddingInline: size === 'xs' ? 12 : undefined,
            height: 36,
          },
        }}
      >
        {label}
      </Button>
      <TableExportModal
        opened={opened}
        onClose={() => setOpened(false)}
        onConfirm={handleConfirm}
        totalCount={totalCount}
        selectedCount={selectedCount}
        loading={loading}
        defaultScope={selectedCount > 0 ? 'selected' : defaultScope}
        defaultColumns={defaultColumns}
      />
    </>
  );
};
