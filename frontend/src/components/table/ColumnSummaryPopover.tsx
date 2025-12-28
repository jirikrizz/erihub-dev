import { ActionIcon, Divider, Group, Popover, Stack, Text } from '@mantine/core';
import { IconSum } from '@tabler/icons-react';

export type SummaryValues = {
  allSum?: number;
  allAverage?: number;
  filteredSum?: number;
  filteredAverage?: number;
  selectedSum?: number;
  selectedAverage?: number;
};

export type ColumnSummaryPopoverProps = {
  label: string;
  values: SummaryValues;
  formatValue?: (value: number) => string;
  disabled?: boolean;
  loading?: boolean;
  onOpen?: () => void;
};

const defaultFormat = (value: number) => value.toLocaleString('cs-CZ');

export const ColumnSummaryPopover = ({
  label,
  values,
  formatValue = defaultFormat,
  disabled = false,
  loading = false,
  onOpen,
}: ColumnSummaryPopoverProps) => {
  if (disabled) return null;

  const hasAll = typeof values.allSum === 'number' || typeof values.allAverage === 'number';
  const hasFiltered =
    typeof values.filteredSum === 'number' || typeof values.filteredAverage === 'number';
  const hasSelected =
    typeof values.selectedSum === 'number' || typeof values.selectedAverage === 'number';

  if (!hasAll && !hasFiltered && !hasSelected) return null;

  return (
    <Popover width={280} position="bottom-start" withArrow shadow="md">
      <Popover.Target>
        <ActionIcon
          variant="subtle"
          size="sm"
          radius="sm"
          aria-label={`Součty pro ${label}`}
          loading={loading}
          onClick={(event) => {
            event?.stopPropagation?.();
            onOpen?.();
          }}
          onMouseDown={(event) => event?.stopPropagation?.()}
        >
          <IconSum size={14} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown onClick={(event) => event?.stopPropagation?.()}>
        <Stack gap="sm">
          <Text size="xs" c="dimmed">
            Souhrny {label} pro aktuální dataset
          </Text>

          {hasAll && (
            <Stack gap={6}>
              {typeof values.allSum === 'number' && (
                <Group justify="space-between" gap="xs" align="flex-end">
                  <Text size="xs" c="dimmed">
                    Součet všech řádků
                  </Text>
                  <Text fw={800} size="sm">
                    {formatValue(values.allSum)}
                  </Text>
                </Group>
              )}
              {typeof values.allAverage === 'number' && (
                <Group justify="space-between" gap="xs" align="flex-end">
                  <Text size="xs" c="dimmed">
                    Průměr všech řádků
                  </Text>
                  <Text fw={700} size="sm">
                    {formatValue(values.allAverage)}
                  </Text>
                </Group>
              )}
            </Stack>
          )}

          {hasFiltered && (
            <>
              <Divider variant="dashed" />
              <Stack gap={6}>
                {typeof values.filteredSum === 'number' && (
                  <Group justify="space-between" gap="xs" align="flex-end">
                    <Text size="xs" c="dimmed">
                      Součet filtrovaných
                    </Text>
                    <Text fw={800} size="sm">
                      {formatValue(values.filteredSum)}
                    </Text>
                  </Group>
                )}
                {typeof values.filteredAverage === 'number' && (
                  <Group justify="space-between" gap="xs" align="flex-end">
                    <Text size="xs" c="dimmed">
                      Průměr filtrovaných
                    </Text>
                    <Text fw={700} size="sm">
                      {formatValue(values.filteredAverage)}
                    </Text>
                  </Group>
                )}
              </Stack>
            </>
          )}

          {hasSelected && (
            <>
              <Divider variant="dashed" />
              <Stack gap={6}>
                {typeof values.selectedSum === 'number' && (
                  <Group justify="space-between" gap="xs" align="flex-end">
                    <Text size="xs" c="dimmed">
                      Součet označených
                    </Text>
                    <Text fw={800} size="sm">
                      {formatValue(values.selectedSum)}
                    </Text>
                  </Group>
                )}
                {typeof values.selectedAverage === 'number' && (
                  <Group justify="space-between" gap="xs" align="flex-end">
                    <Text size="xs" c="dimmed">
                      Průměr označených
                    </Text>
                    <Text fw={700} size="sm">
                      {formatValue(values.selectedAverage)}
                    </Text>
                  </Group>
                )}
              </Stack>
            </>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};
