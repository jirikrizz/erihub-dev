import { Badge, Button, Group, Stack, Text } from '@mantine/core';

export type TableSelectionBarProps = {
  totalFiltered: number;
  totalSelected: number;
  selectedOnPage?: number;
  totalAll?: number;
  onShowSelected?: () => void;
  onClearSelection?: () => void;
  showSelectedOnly?: boolean;
};

export const TableSelectionBar = ({
  totalFiltered,
  totalSelected,
  selectedOnPage = 0,
  totalAll,
  onShowSelected,
  onClearSelection,
  showSelectedOnly = false,
}: TableSelectionBarProps) => {
  return (
    <Group justify="space-between" align="center" mb="xs">
      <Stack gap={2}>
        {showSelectedOnly ? (
          <Text size="sm" c="dimmed">
            Vybráno: {totalSelected.toLocaleString('cs-CZ')}
            {selectedOnPage ? ` (z toho ${selectedOnPage} na stránce)` : ''}
            {' · '}
            Zobrazeny pouze označené
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            Výsledků po filtrech: {totalFiltered.toLocaleString('cs-CZ')}
            {typeof totalAll === 'number' ? ` / ${totalAll.toLocaleString('cs-CZ')}` : ''}
            {' · '}
            Vybráno: {totalSelected.toLocaleString('cs-CZ')}
            {selectedOnPage ? ` (z toho ${selectedOnPage} na stránce)` : ''}
          </Text>
        )}
        <Group gap="xs">
          <Badge variant="light">Vybrané: {totalSelected.toLocaleString('cs-CZ')}</Badge>
          <Badge variant="light">Na stránce: {selectedOnPage.toLocaleString('cs-CZ')}</Badge>
          {!showSelectedOnly && (
            <Badge variant="light">Filtrováno: {totalFiltered.toLocaleString('cs-CZ')}</Badge>
          )}
        </Group>
      </Stack>
      <Group gap="xs">
        <Button
          variant="light"
          onClick={onShowSelected}
          disabled={!onShowSelected || totalSelected === 0}
        >
          Zobrazit označené
        </Button>
        <Button
          variant="subtle"
          color="gray"
          onClick={onClearSelection}
          disabled={!onClearSelection || totalSelected === 0}
        >
          Odznačit vše
        </Button>
      </Group>
    </Group>
  );
};
