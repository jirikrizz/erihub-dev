import { useEffect, useRef, useState } from 'react';
import { Button, Group, Modal, SegmentedControl, Slider, Stack, Text } from '@mantine/core';

export type MaskEditorModalProps = {
  opened: boolean;
  imageUrl: string | null;
  onClose: () => void;
  onSave: (file: File, previewUrl: string) => void;
};

export const MaskEditorModal = ({ opened, imageUrl, onClose, onSave }: MaskEditorModalProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState<'protect' | 'erase'>('protect');
  const [brushSize, setBrushSize] = useState(60);

  useEffect(() => {
    if (!opened || !imageUrl) {
      return;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    };
    image.src = imageUrl;
  }, [opened, imageUrl]);

  const mapPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const drawPoint = (point: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.globalCompositeOperation = mode === 'protect' ? 'source-over' : 'destination-out';
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.beginPath();
    ctx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const point = mapPoint(event);
    if (!point) {
      return;
    }
    setIsDrawing(true);
    drawPoint(point);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) {
      return;
    }
    event.preventDefault();
    const point = mapPoint(event);
    if (!point) {
      return;
    }
    drawPoint(point);
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        return;
      }
      const file = new File([blob], 'mask.png', { type: 'image/png' });
      const previewUrl = canvas.toDataURL('image/png');
      onSave(file, previewUrl);
      onClose();
    }, 'image/png');
  };

  return (
    <Modal opened={opened} onClose={onClose} size="lg" title="Označ oblasti, které se mají zachovat" centered>
      {!imageUrl ? (
        <Text size="sm">Nejprve vyber fotku, kterou chceš upravit.</Text>
      ) : (
        <Stack gap="md">
          <div style={{ position: 'relative', width: '100%', maxHeight: 500 }}>
            <img src={imageUrl} alt="Zdrojová fotka" style={{ width: '100%', display: 'block' }} />
            <canvas
              ref={canvasRef}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(255,0,0,0.2)',
                pointerEvents: 'none',
                mixBlendMode: 'multiply',
              }}
            />
          </div>
          <Group wrap="wrap">
            <SegmentedControl
              value={mode}
              onChange={(value) => setMode((value as 'protect' | 'erase') ?? 'protect')}
              data={[
                { label: 'Chránit oblast', value: 'protect' },
                { label: 'Guma', value: 'erase' },
              ]}
            />
            <Button variant="light" onClick={handleClear}>
              Vymazat masku
            </Button>
          </Group>
          <Stack gap={4}>
            <Text size="sm">Velikost štětce</Text>
            <Slider min={10} max={200} value={brushSize} onChange={setBrushSize} />
          </Stack>
          <Group justify="flex-end">
            <Button variant="light" onClick={onClose}>
              Zavřít
            </Button>
            <Button onClick={handleSave}>Uložit masku</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
};
