import { ActionIcon, Button, Card, FileButton, Group, Image, Loader, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPhoto, IconTrash, IconUpload } from '@tabler/icons-react';
import { useCallback, type MouseEvent, type PointerEvent } from 'react';
import type { UploadedMicrositeAsset } from '../../../api/microsites';
import { useUploadMicrositeAsset } from '../hooks/useMicrosites';

type ImageUploadInputProps = {
  label?: string;
  description?: string;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  allowRemove?: boolean;
  onChange: (value: string | undefined) => void;
  onUploadComplete?: (asset: UploadedMicrositeAsset) => void;
};

export const ImageUploadInput = ({
  label,
  description,
  value,
  placeholder,
  disabled,
  allowRemove = true,
  onChange,
  onUploadComplete,
}: ImageUploadInputProps) => {
  const uploadAsset = useUploadMicrositeAsset();

  const handleUpload = useCallback(
    async (file: File | null) => {
      if (!file || uploadAsset.isPending) {
        return;
      }

      try {
        const asset = await uploadAsset.mutateAsync(file);
        onChange(asset.url);
        onUploadComplete?.(asset);
        notifications.show({
          message: 'Obrázek byl nahrán.',
          color: 'green',
        });
      } catch (error) {
        console.error(error);
        notifications.show({
          message: 'Nahrání obrázku se nezdařilo.',
          color: 'red',
        });
      }
    },
    [onChange, onUploadComplete, uploadAsset]
  );

  const handleManualChange = useCallback(
    (next: string) => {
      const normalized = next.trim();
      onChange(normalized.length ? normalized : undefined);
    },
    [onChange]
  );

  const handleRemove = useCallback(() => {
    onChange(undefined);
  }, [onChange]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  }, []);

  const handleClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (disabled || uploadAsset.isPending) {
      event.preventDefault();
    }
  }, [disabled, uploadAsset.isPending]);

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="flex-end" gap="sm">
        <TextInput
          label={label}
          description={description}
          placeholder={placeholder ?? 'https://cdn…'}
          value={value ?? ''}
          onChange={(event) => handleManualChange(event.currentTarget.value)}
          style={{ flex: 1 }}
          disabled={disabled || uploadAsset.isPending}
        />
        {allowRemove ? (
          <ActionIcon
            variant="subtle"
            color="red"
            onClick={handleRemove}
            aria-label="Odebrat obrázek"
            disabled={disabled || (!value && !uploadAsset.isPending)}
          >
            <IconTrash size={16} />
          </ActionIcon>
        ) : null}
      </Group>
      <Group gap="sm" align="center">
        <FileButton
          onChange={(file) => void handleUpload(file)}
          accept="image/gif,image/jpeg,image/png,image/webp,image/avif,image/svg+xml"
          disabled={disabled || uploadAsset.isPending}
        >
          {(fileButtonProps) => (
            <Button
              {...fileButtonProps}
              variant="light"
              leftSection={uploadAsset.isPending ? <Loader size="xs" color="blue" /> : <IconUpload size={16} />}
              disabled={disabled || uploadAsset.isPending}
              onPointerDown={handlePointerDown}
              onClick={(event) => {
                handleClick(event);
                if (!event.defaultPrevented) {
                  fileButtonProps.onClick?.();
                }
              }}
            >
              {uploadAsset.isPending ? 'Nahrávám…' : 'Nahrát obrázek'}
            </Button>
          )}
        </FileButton>
      </Group>
      <Card withBorder padding="xs" radius="md">
        {value ? (
          <Image src={value} alt="Nahraný obrázek" radius="md" fit="cover" height={180} />
        ) : (
          <Stack align="center" gap={4} py="md" c="dimmed">
            <IconPhoto size={20} />
            <Text size="sm">Zatím žádný obrázek. Nahraj ho nebo vlož URL.</Text>
          </Stack>
        )}
      </Card>
    </Stack>
  );
};
