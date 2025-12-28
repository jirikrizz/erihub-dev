import { useEffect, useMemo, useState } from 'react';
import { Button, Group, Loader, Modal, Stack, Text } from '@mantine/core';

type VideoCropModalProps = {
  opened: boolean;
  file: File | null;
  videoSize: '720x1280' | '1280x720';
  onClose: () => void;
  onConfirm: (file: File, previewUrl: string) => void;
};

export const VideoCropModal = ({ opened, file, videoSize, onClose, onConfirm }: VideoCropModalProps) => {
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [targetWidth, targetHeight] = useMemo(() => videoSize.split('x').map((value) => Number(value)), [videoSize]);

  useEffect(() => {
    if (!opened || !file) {
      setSourcePreview(null);
      setCroppedPreview(null);
      setCroppedBlob(null);
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setSourcePreview(dataUrl);
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setIsProcessing(false);
          return;
        }

        const imageRatio = image.width / image.height;
        const targetRatio = canvas.width / canvas.height;
        let sx = 0;
        let sy = 0;
        let sw = image.width;
        let sh = image.height;

        if (imageRatio > targetRatio) {
          // Image wider than target -> crop width.
          sh = image.height;
          sw = sh * targetRatio;
          sx = (image.width - sw) / 2;
        } else {
          // Image taller than target -> crop height.
          sw = image.width;
          sh = sw / targetRatio;
          sy = (image.height - sh) / 2;
        }

        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          setCroppedBlob(blob);
          setCroppedPreview(canvas.toDataURL('image/png'));
          setIsProcessing(false);
        }, 'image/png');
      };
      image.onerror = () => setIsProcessing(false);
      image.src = dataUrl;
    };
    reader.onerror = () => setIsProcessing(false);
    reader.readAsDataURL(file);
  }, [file, opened, targetHeight, targetWidth]);

  const handleSave = () => {
    if (!croppedBlob || !file || !croppedPreview) {
      return;
    }
    const croppedFile = new File([croppedBlob], `${file.name.replace(/\.[^.]+$/, '')}-video.png`, {
      type: 'image/png',
    });
    onConfirm(croppedFile, croppedPreview);
  };

  return (
    <Modal opened={opened} onClose={onClose} size="lg" title="Připrav fotku pro video" centered>
      {!file ? (
        <Text size="sm">Nejprve nahraj fotku, kterou chceš použít.</Text>
      ) : (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Poměr stran videa: {targetWidth} × {targetHeight}. Fotku automaticky ořízneme tak, aby pokryla celou plochu a
            měla správný tvar. Zkontroluj náhled a potvrď ořez.
          </Text>
          {isProcessing ? (
            <Group justify="center" py="lg">
              <Loader />
            </Group>
          ) : (
            <Group align="flex-start" grow gap="lg">
              <Stack gap={8}>
                <Text size="sm" fw={600}>
                  Původní
                </Text>
                {sourcePreview ? (
                  <img src={sourcePreview} alt="Původní fotka" style={{ width: '100%', borderRadius: 12 }} />
                ) : (
                  <Text size="xs" c="dimmed">
                    Nepodařilo se načíst náhled.
                  </Text>
                )}
              </Stack>
              <Stack gap={8}>
                <Text size="sm" fw={600}>
                  Oříznuté pro video
                </Text>
                {croppedPreview ? (
                  <img src={croppedPreview} alt="Oříznutá fotka" style={{ width: '100%', borderRadius: 12 }} />
                ) : (
                  <Text size="xs" c="dimmed">
                    Náhled zatím není připravený.
                  </Text>
                )}
              </Stack>
            </Group>
          )}
          <Group justify="flex-end">
            <Button variant="light" onClick={onClose}>
              Zavřít
            </Button>
            <Button onClick={handleSave} disabled={!croppedBlob || isProcessing}>
              Uložit ořez
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
};
