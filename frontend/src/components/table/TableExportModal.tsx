import { useEffect, useState } from 'react';
import { Button, Group, Modal, Radio, Stack, Text } from '@mantine/core';

type ExportScope = 'all' | 'selected';
type ExportColumns = 'all' | 'visible';

export type TableExportModalProps = {
  opened: boolean;
  loading?: boolean;
  totalCount: number;
  selectedCount: number;
  onClose: () => void;
  onConfirm: (options: { scope: ExportScope; columns: ExportColumns }) => void;
  defaultScope?: ExportScope;
  defaultColumns?: ExportColumns;
};

export const TableExportModal = ({
  opened,
  loading = false,
  totalCount,
  selectedCount,
  onClose,
  onConfirm,
  defaultScope = 'all',
  defaultColumns = 'visible',
}: TableExportModalProps) => {
  const hasSelection = selectedCount > 0;
  const [scope, setScope] = useState<ExportScope>(defaultScope);
  const [columns, setColumns] = useState<ExportColumns>(defaultColumns);

  useEffect(() => {
    if (!opened) {
      setScope(hasSelection ? 'selected' : defaultScope);
      setColumns(defaultColumns);
    }
  }, [opened, hasSelection, defaultColumns, defaultScope]);

  return (
    <Modal opened={opened} onClose={onClose} title="Export do CSV" centered>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Zvol, co se má exportovat. Exportuje se aktuální seznam (respektuje filtry a řazení).
        </Text>

        <Radio.Group label="Řádky" value={scope} onChange={(value) => setScope((value as ExportScope) ?? 'all')}>
          <Stack gap={6} mt="xs">
            <Radio value="all" label={`Všechny (${totalCount.toLocaleString('cs-CZ')})`} />
            <Radio
              value="selected"
              label={`Jen označené (${selectedCount.toLocaleString('cs-CZ')})`}
              disabled={!hasSelection}
            />
          </Stack>
        </Radio.Group>

        <Radio.Group
          label="Sloupce"
          value={columns}
          onChange={(value) => setColumns((value as ExportColumns) ?? 'visible')}
        >
          <Stack gap={6} mt="xs">
            <Radio value="all" label="Všechny sloupce" />
            <Radio value="visible" label="Pouze viditelné sloupce" />
          </Stack>
        </Radio.Group>

        <Group justify="flex-end" gap="sm" mt="sm">
          <Button variant="subtle" onClick={onClose} disabled={loading}>
            Zavřít
          </Button>
          <Button
            onClick={() => onConfirm({ scope, columns })}
            loading={loading}
            disabled={loading || (scope === 'selected' && !hasSelection)}
          >
            Exportovat
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
