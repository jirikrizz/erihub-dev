import { Badge, Group, Stack, Text, Tooltip } from '@mantine/core';
import type { InventoryProductFlag } from '../../../api/inventory';

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('cs-CZ');
};

const formatRangeLabel = (flag: InventoryProductFlag) => {
  const from = formatDate(flag.date_from);
  const to = formatDate(flag.date_to);

  if (!from && !to) {
    return 'Bez omezení platnosti';
  }

  if (from && to) {
    return `Platnost: ${from} – ${to}`;
  }

  if (from) {
    return `Platnost od ${from}`;
  }

  return `Platnost do ${to}`;
};

type VariantFlagsCellProps = {
  flags?: InventoryProductFlag[] | null;
};

export const VariantFlagsCell = ({ flags }: VariantFlagsCellProps) => {
  if (!flags || flags.length === 0) {
    return <Text size="sm" c="var(--app-text-tertiary)">—</Text>;
  }

  return (
    <Group gap={6} wrap="wrap">
      {flags.map((flag) => {
        const label = flag.title && flag.title.trim() !== '' ? flag.title : flag.code;
        const tooltipLabel = (
          <Stack gap={2} p={2}>
            <Text fw={600} size="xs">
              {label}
            </Text>
            <Text size="xs">Kód: {flag.code}</Text>
            <Text size="xs">{formatRangeLabel(flag)}</Text>
          </Stack>
        );

        return (
          <Tooltip key={flag.code} label={tooltipLabel} withinPortal>
            <Badge radius="xl" variant="light" color="violet">
              {label}
            </Badge>
          </Tooltip>
        );
      })}
    </Group>
  );
};
