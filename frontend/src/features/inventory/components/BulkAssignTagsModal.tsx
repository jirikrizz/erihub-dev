import {
  Button,
  ColorInput,
  Group,
  Modal,
  MultiSelect,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import type { InventoryVariantTag } from '../../../api/inventory';

export type BulkAssignTagsPayload = {
  existingTagIds: number[];
  newTagName?: string;
  newTagColor?: string | null;
};

export type BulkAssignTagsModalProps = {
  opened: boolean;
  tags: InventoryVariantTag[];
  selectionCount: number;
  loading: boolean;
  onClose: () => void;
  onConfirm: (payload: BulkAssignTagsPayload) => void;
};

export const BulkAssignTagsModal = ({
  opened,
  tags,
  selectionCount,
  loading,
  onClose,
  onConfirm,
}: BulkAssignTagsModalProps) => {
  const [selectedTagValues, setSelectedTagValues] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('');

  const tagOptions = useMemo(
    () =>
      tags.map((tag) => ({
        value: String(tag.id),
        label: tag.is_hidden ? `${tag.name} (schováno)` : tag.name,
      })),
    [tags]
  );

  useEffect(() => {
    if (!opened) {
      setSelectedTagValues([]);
      setNewTagName('');
      setNewTagColor('');
    }
  }, [opened]);

  const trimmedName = newTagName.trim();
  const trimmedColor = newTagColor.trim();
  const canSubmit = selectedTagValues.length > 0 || trimmedName.length > 0;

  const handleSubmit = () => {
    if (!canSubmit || loading) {
      return;
    }

    onConfirm({
      existingTagIds: selectedTagValues.map((value) => Number(value)),
      newTagName: trimmedName || undefined,
      newTagColor: trimmedColor ? trimmedColor : undefined,
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!loading) {
          onClose();
        }
      }}
      title="Přiřadit štítky"
      size="lg"
      closeOnEscape={!loading}
      closeOnClickOutside={!loading}
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Vybráno variant: {selectionCount.toLocaleString('cs-CZ')}
        </Text>

        <Stack gap="xs">
          <MultiSelect
            data={tagOptions}
            value={selectedTagValues}
            onChange={setSelectedTagValues}
            searchable
            clearable
            placeholder={
              tagOptions.length === 0 ? 'Nemáte žádné štítky' : 'Vyberte existující štítky'
            }
            nothingFoundMessage={
              tagOptions.length === 0 ? 'Žádné štítky' : 'Nenalezeno'
            }
            disabled={loading || tagOptions.length === 0}
          />
          <Text size="xs" c="dimmed">
            Vyberte, které existující štítky chcete přidat k označeným variantám.
          </Text>
        </Stack>

        <Stack gap="xs">
          <TextInput
            label="Nový štítek"
            placeholder="Např. Akce jaro"
            value={newTagName}
            onChange={(event) => setNewTagName(event.currentTarget.value)}
            disabled={loading}
            maxLength={120}
          />
          <ColorInput
            label="Barva nového štítku (volitelné)"
            value={newTagColor}
            onChange={setNewTagColor}
            disabled={loading}
            placeholder="#2F9E44"
            format="hex"
            withPicker
          />
          <Text size="xs" c="dimmed">
            Vyplňte název, pokud chcete přiřadit nový štítek. Barva je volitelná.
          </Text>
        </Stack>

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={onClose} disabled={loading}>
            Zavřít
          </Button>
          <Button onClick={handleSubmit} loading={loading} disabled={!canSubmit}>
            Přiřadit štítky
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};