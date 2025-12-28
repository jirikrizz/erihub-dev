import {
  Badge,
  Button,
  Checkbox,
  Group,
  MultiSelect,
  NumberInput,
  Radio,
  Stack,
  TextInput,
} from '@mantine/core';
import { useMemo } from 'react';

type StringFilter = {
  type: 'string';
  operator: 'contains' | 'not_contains' | 'exact';
  value: string;
};

type NumberFilter = {
  type: 'number';
  operator: 'lt' | 'gt' | 'eq' | 'between';
  value: number | null;
  valueTo?: number | null;
};

type DateFilter = {
  type: 'date';
  operator: 'from' | 'to' | 'range';
  value: string | null;
  valueTo?: string | null;
};

type BooleanFilter = {
  type: 'boolean';
  value: boolean | null;
};

type ListFilter = {
  type: 'list';
  values: string[];
  mode: 'any' | 'all';
  options?: { value: string; label: string }[];
};

export type ColumnFilterValue = StringFilter | NumberFilter | DateFilter | BooleanFilter | ListFilter;

type ColumnFilterPopoverProps = {
  mode: ColumnFilterValue['type'];
  value: ColumnFilterValue;
  onChange: (value: ColumnFilterValue) => void;
  onReset: () => void;
  onApply?: () => void;
};

export const ColumnFilterPopover = ({ mode, value, onChange, onReset, onApply }: ColumnFilterPopoverProps) => {
  const renderString = () => {
    const current = value as StringFilter;
    return (
      <Stack gap="xs">
        <Radio.Group
          value={current.operator}
          onChange={(op) => onChange({ ...current, operator: op as StringFilter['operator'], type: 'string' })}
          label="Podmínka"
        >
          <Group gap="xs">
            <Radio value="contains" label="Obsahuje" />
            <Radio value="not_contains" label="Neobsahuje" />
            <Radio value="exact" label="Přesně" />
          </Group>
        </Radio.Group>
        <TextInput
          label="Výraz"
          value={current.value}
          onChange={(event) => onChange({ ...current, value: event.currentTarget.value, type: 'string' })}
          placeholder="Zadej text"
        />
      </Stack>
    );
  };

  const renderNumber = () => {
    const current = value as NumberFilter;
    return (
      <Stack gap="xs">
        <Radio.Group
          value={current.operator}
          onChange={(op) => onChange({ ...current, operator: op as NumberFilter['operator'], type: 'number' })}
          label="Podmínka"
        >
          <Group gap="xs">
            <Radio value="lt" label="< menší než" />
            <Radio value="gt" label="> větší než" />
            <Radio value="eq" label="= rovno" />
            <Radio value="between" label="Rozmezí" />
          </Group>
        </Radio.Group>
        {current.operator === 'between' ? (
          <Group gap="xs" grow>
            <NumberInput
              label="Od"
              value={current.value ?? undefined}
              onChange={(val) =>
                onChange({
                  ...current,
                  value: typeof val === 'number' ? val : null,
                  type: 'number',
                })
              }
              min={0}
            />
            <NumberInput
              label="Do"
              value={current.valueTo ?? undefined}
              onChange={(val) =>
                onChange({
                  ...current,
                  valueTo: typeof val === 'number' ? val : null,
                  type: 'number',
                })
              }
              min={0}
            />
          </Group>
        ) : (
          <NumberInput
            label="Hodnota"
            value={current.value ?? undefined}
            onChange={(val) =>
              onChange({
                ...current,
                value: typeof val === 'number' ? val : null,
                type: 'number',
              })
            }
          />
        )}
      </Stack>
    );
  };

  const renderDate = () => {
    const current = value as DateFilter;
    return (
      <Stack gap="xs">
        <Radio.Group
          value={current.operator}
          onChange={(op) => onChange({ ...current, operator: op as DateFilter['operator'], type: 'date' })}
          label="Podmínka"
        >
          <Group gap="xs">
            <Radio value="from" label="Od" />
            <Radio value="to" label="Do" />
            <Radio value="range" label="Rozmezí" />
          </Group>
        </Radio.Group>
        {current.operator === 'range' ? (
          <Group gap="xs" grow>
            <TextInput
              label="Od"
              type="date"
              value={current.value ? current.value.slice(0, 10) : ''}
              onChange={(event) =>
                onChange({
                  ...current,
                  value: event.currentTarget.value ? `${event.currentTarget.value}T00:00:00.000Z` : null,
                  type: 'date',
                })
              }
            />
            <TextInput
              label="Do"
              type="date"
              value={current.valueTo ? current.valueTo.slice(0, 10) : ''}
              onChange={(event) =>
                onChange({
                  ...current,
                  valueTo: event.currentTarget.value ? `${event.currentTarget.value}T23:59:59.999Z` : null,
                  type: 'date',
                })
              }
            />
          </Group>
        ) : (
          <TextInput
            label={current.operator === 'from' ? 'Od' : 'Do'}
            type="date"
            value={current.value ? current.value.slice(0, 10) : ''}
            onChange={(event) =>
              onChange({
                ...current,
                value: event.currentTarget.value
                  ? current.operator === 'from'
                    ? `${event.currentTarget.value}T00:00:00.000Z`
                    : `${event.currentTarget.value}T23:59:59.999Z`
                  : null,
                type: 'date',
                valueTo: null,
              })
            }
          />
        )}
      </Stack>
    );
  };

  const renderBoolean = () => {
    const current = value as BooleanFilter;
    return (
      <Stack gap="xs">
        <Checkbox
          label="Pouze hodnoty ANO"
          checked={current.value === true}
          indeterminate={current.value === null}
          onChange={(event) => {
            const checked = event.currentTarget.checked;
            onChange({ type: 'boolean', value: checked ? true : false });
          }}
        />
        <Button
          variant="subtle"
          size="xs"
          onClick={() => onChange({ type: 'boolean', value: null })}
        >
          Zrušit filtr
        </Button>
      </Stack>
    );
  };

  const renderList = () => {
    const current = value as ListFilter;
    const options = useMemo(() => current.options ?? [], [current.options]);
    return (
      <Stack gap="xs">
        <MultiSelect
          data={options}
          value={current.values}
          onChange={(vals) => onChange({ ...current, values: vals, type: 'list' })}
          label="Hodnoty"
          searchable
          nothingFoundMessage="Nenalezeno"
        />
        <Group gap="xs">
          <Badge variant={current.mode === 'any' ? 'filled' : 'light'} onClick={() => onChange({ ...current, mode: 'any', type: 'list' })}>
            Stačí jeden
          </Badge>
          <Badge variant={current.mode === 'all' ? 'filled' : 'light'} onClick={() => onChange({ ...current, mode: 'all', type: 'list' })}>
            Všechny
          </Badge>
        </Group>
      </Stack>
    );
  };

  const content = useMemo(() => {
    switch (mode) {
      case 'string':
        return renderString();
      case 'number':
        return renderNumber();
      case 'date':
        return renderDate();
      case 'boolean':
        return renderBoolean();
      case 'list':
        return renderList();
      default:
        return null;
    }
  }, [mode, value]);

  return (
    <Stack gap="sm">
      {content}
      <Group justify="space-between">
        <Button variant="subtle" size="xs" onClick={onReset}>
          Vymazat
        </Button>
        {onApply && (
          <Button size="xs" onClick={onApply}>
            Použít
          </Button>
        )}
      </Group>
    </Stack>
  );
};
