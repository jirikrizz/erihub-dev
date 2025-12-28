import {
  Badge,
  Button,
  Group,
  MultiSelect,
  Popover,
  Stack,
  Text,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import type { InventoryVariantTag } from '../../../api/inventory';

export type VariantTagsCellProps = {
  assignedTags?: InventoryVariantTag[];
  allTags: InventoryVariantTag[];
  onAssign: (tagIds: number[]) => Promise<boolean>;
  isSaving: boolean;
};

const renderColorDot = (color: string) => (
  <span
    style={{
      display: 'inline-block',
      width: 10,
      height: 10,
      borderRadius: 9999,
      backgroundColor: color,
    }}
  />
);

export const VariantTagsCell = ({
  assignedTags = [],
  allTags,
  onAssign,
  isSaving,
}: VariantTagsCellProps) => {
  const [opened, setOpened] = useState(false);
  const [value, setValue] = useState<string[]>(() =>
    assignedTags.map((tag) => String(tag.id))
  );

  const formatLabel = (tag: InventoryVariantTag) =>
    tag.is_hidden ? `${tag.name} (schováno)` : tag.name;

  const options = useMemo(
    () => allTags.map((tag) => ({ value: String(tag.id), label: formatLabel(tag) })),
    [allTags]
  );

  useEffect(() => {
    if (!opened) {
      setValue(assignedTags.map((tag) => String(tag.id)));
    }
  }, [assignedTags, opened]);

  const assignedTagIds = useMemo(
    () => new Set(assignedTags.map((tag) => String(tag.id))),
    [assignedTags]
  );

  const handleSave = async () => {
    const tagIds = value.map((item) => Number(item));
    const success = await onAssign(tagIds);
    if (success) {
      setOpened(false);
    }
  };

  const assignedList = assignedTags.length
    ? assignedTags
    : allTags.filter((tag) => assignedTagIds.has(String(tag.id)));

  return (
    <Group
      gap={6}
      wrap="wrap"
      align="center"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {assignedList.length > 0 ? (
        assignedList.map((tag) => (
          <Badge
            key={tag.id}
            variant="light"
            leftSection={tag.color ? renderColorDot(tag.color) : null}
            title={tag.is_hidden ? 'Štítek označený jako schovat' : undefined}
            style={tag.is_hidden ? { opacity: 0.6 } : undefined}
          >
            {formatLabel(tag)}
          </Badge>
        ))
      ) : (
        <Text size="sm" c="dimmed">
          Bez štítků
        </Text>
      )}

      <Popover
        opened={opened}
        onChange={setOpened}
        position="bottom-start"
        shadow="md"
        withArrow
      >
        <Popover.Target>
          <Button
            variant="subtle"
            size="xs"
            onClick={(event) => {
              event.stopPropagation();
              setOpened((current) => !current);
            }}
            disabled={isSaving}
          >
            Upravit
          </Button>
        </Popover.Target>
        <Popover.Dropdown
          onClick={(event) => event.stopPropagation()}
          style={{ maxWidth: 260 }}
        >
          <Stack gap="sm">
            <MultiSelect
              data={options}
              value={value}
              onChange={setValue}
              searchable
              clearable
              placeholder={options.length === 0 ? 'Nemáte žádné štítky' : 'Vyberte štítky'}
              nothingFoundMessage={options.length === 0 ? 'Žádné štítky' : 'Nenalezeno'}
              disabled={isSaving || options.length === 0}
            />
            <Group justify="flex-end" gap="xs">
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                onClick={() => {
                  setOpened(false);
                  setValue(assignedTags.map((tag) => String(tag.id)));
                }}
                disabled={isSaving}
              >
                Zrušit
              </Button>
              <Button size="xs" onClick={handleSave} loading={isSaving}>
                Uložit
              </Button>
            </Group>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
};