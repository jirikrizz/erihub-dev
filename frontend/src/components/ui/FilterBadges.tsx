import { Badge, Button, Group } from '@mantine/core';

type FilterBadge = {
  label: string;
  onRemove: () => void;
};

type FilterBadgesProps = {
  filters: FilterBadge[];
  onClearAll?: () => void;
};

export const FilterBadges = ({ filters, onClearAll }: FilterBadgesProps) => {
  if (filters.length === 0) {
    return null;
  }

  return (
    <Group gap="xs" wrap="wrap">
      {filters.map((filter, index) => (
        <Badge
          key={`${filter.label}-${index}`}
          variant="light"
          rightSection={
            <Button
              variant="subtle"
              size="compact-xs"
              onClick={(event) => {
                event.stopPropagation();
                filter.onRemove();
              }}
            >
              ×
            </Button>
          }
        >
          {filter.label}
        </Badge>
      ))}
      {onClearAll && (
        <Button size="xs" variant="subtle" onClick={onClearAll}>
          Vymazat vše
        </Button>
      )}
    </Group>
  );
};
