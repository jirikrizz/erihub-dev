import { Button, Group, Text } from '@mantine/core';

type SelectionSummaryProps = {
  totalFiltered: number;
  totalRecords?: number | null;
  totalSelected: number;
  selectedOnPage: number;
  showSelectedOnly: boolean;
  onToggleSelectedOnly: () => void;
  onClearAll: () => void;
};

export const SelectionSummary = ({
  totalFiltered,
  totalRecords,
  totalSelected,
  selectedOnPage,
  showSelectedOnly,
  onToggleSelectedOnly,
  onClearAll,
}: SelectionSummaryProps) => (
  <Group justify="space-between" align="center" gap="sm">
    <Text size="sm" c="dimmed">
      Výsledků po filtrech: {totalFiltered}
      {typeof totalRecords === 'number' ? ` / ${totalRecords}` : ''}
      {' · '}
      Vybráno: {totalSelected} (z toho {selectedOnPage} na stránce)
      {showSelectedOnly ? ' · Zobrazeny pouze označené' : ''}
    </Text>
    <Group gap="xs">
      <Button
        variant={showSelectedOnly ? 'filled' : 'subtle'}
        size="xs"
        onClick={onToggleSelectedOnly}
        disabled={totalSelected === 0}
      >
        {showSelectedOnly ? 'Zobrazit všechny' : 'Zobrazit označené'}
      </Button>
      <Button variant="subtle" size="xs" onClick={onClearAll} disabled={totalSelected === 0}>
        Odznačit vše
      </Button>
    </Group>
  </Group>
);
