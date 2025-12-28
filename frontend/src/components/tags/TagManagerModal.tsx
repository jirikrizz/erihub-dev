import {
  Badge,
  Button,
  ColorInput,
  Group,
  Modal,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

export type TagDefinition = {
  id: number;
  name: string;
  color: string | null;
  is_hidden: boolean;
};

export type TagManagerModalProps = {
  opened: boolean;
  tags: TagDefinition[];
  onClose: () => void;
  onCreate: (payload: { name: string; color: string | null; is_hidden: boolean }) => Promise<boolean>;
  onUpdate: (
    tagId: number,
    payload: { name: string; color: string | null; is_hidden: boolean }
  ) => Promise<boolean>;
  onDelete: (tagId: number) => Promise<boolean>;
  creating?: boolean;
  updatingTagId?: number | null;
  deletingTagId?: number | null;
  extraContent?: ReactNode;
};

const ColorDot = ({ color }: { color: string }) => (
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

type TagEditorProps = {
  tag: TagDefinition;
  onUpdate: (
    tagId: number,
    payload: { name: string; color: string | null; is_hidden: boolean }
  ) => Promise<boolean>;
  onDelete: (tagId: number) => Promise<boolean>;
  isUpdating: boolean;
  isDeleting: boolean;
};

const TagEditor = ({ tag, onUpdate, onDelete, isUpdating, isDeleting }: TagEditorProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color ?? '');
  const [isHidden, setIsHidden] = useState(tag.is_hidden);

  useEffect(() => {
    if (!isEditing) {
      setName(tag.name);
      setColor(tag.color ?? '');
      setIsHidden(tag.is_hidden);
    }
  }, [tag, isEditing]);

  const handleSave = async () => {
    const success = await onUpdate(tag.id, {
      name,
      color: color.trim() === '' ? null : color,
      is_hidden: isHidden,
    });

    if (success) {
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    const success = await onDelete(tag.id);
    if (success) {
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Stack gap="xs">
        <Group gap="sm" align="flex-end">
          <TextInput
            label="Název"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="Např. Priorita"
            required
            disabled={isUpdating}
          />
          <ColorInput
            label="Barva"
            value={color}
            onChange={setColor}
            disabled={isUpdating}
            withPicker
            placeholder="#228be6"
          />
          <Switch
            label="Schovat"
            checked={isHidden}
            onChange={(event) => setIsHidden(event.currentTarget.checked)}
            disabled={isUpdating}
          />
        </Group>
        <Group justify="flex-end" gap="xs">
          <Button
            variant="subtle"
            color="gray"
            size="xs"
            onClick={() => setIsEditing(false)}
            disabled={isUpdating}
          >
            Zrušit
          </Button>
          <Button size="xs" onClick={handleSave} loading={isUpdating}>
            Uložit
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Group justify="space-between" align="center">
      <Group gap="xs">
        <Badge
          variant="light"
          leftSection={tag.color ? <ColorDot color={tag.color} /> : null}
          title={tag.is_hidden ? 'Schovaný štítek' : undefined}
          style={tag.is_hidden ? { opacity: 0.6 } : undefined}
        >
          {tag.name}
        </Badge>
        {tag.color && (
          <Text size="xs" c="dimmed">
            {tag.color}
          </Text>
        )}
        {tag.is_hidden && (
          <Text size="xs" c="red">
            Schované položky
          </Text>
        )}
      </Group>
      <Group gap="xs">
        <Button variant="subtle" size="xs" onClick={() => setIsEditing(true)}>
          Upravit
        </Button>
        <Button
          variant="subtle"
          color="red"
          size="xs"
          onClick={handleDelete}
          loading={isDeleting}
        >
          Smazat
        </Button>
      </Group>
    </Group>
  );
};

export const TagManagerModal = ({
  opened,
  tags,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  creating = false,
  updatingTagId = null,
  deletingTagId = null,
  extraContent = null,
}: TagManagerModalProps) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>('');
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    if (!opened) {
      setName('');
      setColor('');
      setIsHidden(false);
    }
  }, [opened]);

  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => a.name.localeCompare(b.name, 'cs', { sensitivity: 'base' })),
    [tags]
  );

  const handleCreate = async () => {
    const success = await onCreate({
      name,
      color: color.trim() === '' ? null : color,
      is_hidden: isHidden,
    });

    if (success) {
      setName('');
      setColor('');
      setIsHidden(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Správa štítků" size="lg">
      <Stack gap="md">
        <Stack gap="xs">
          <Text fw={500}>Přidat nový štítek</Text>
          <Group gap="sm" align="flex-end">
            <TextInput
              label="Název"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder="Např. VIP"
              required
              disabled={creating}
            />
            <ColorInput
              label="Barva"
              value={color}
              onChange={setColor}
              disabled={creating}
              withPicker
              placeholder="#228be6"
            />
            <Switch
              label="Schovat"
              checked={isHidden}
              onChange={(event) => setIsHidden(event.currentTarget.checked)}
              disabled={creating}
            />
            <Button onClick={handleCreate} loading={creating}>
              Přidat
            </Button>
          </Group>
        </Stack>

        <Stack gap="sm">
          <Text fw={500}>Existující štítky</Text>
          {sortedTags.length === 0 ? (
            <Text size="sm" c="dimmed">
              Zatím nemáte žádné štítky.
            </Text>
          ) : (
            sortedTags.map((tag) => (
              <TagEditor
                key={tag.id}
                tag={tag}
                onUpdate={onUpdate}
                onDelete={onDelete}
                isUpdating={updatingTagId === tag.id}
                isDeleting={deletingTagId === tag.id}
              />
            ))
          )}
        </Stack>

        {extraContent}
      </Stack>
    </Modal>
  );
};
