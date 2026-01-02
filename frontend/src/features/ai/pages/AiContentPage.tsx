import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  CopyButton,
  FileButton,
  Group,
  Image,
  Loader,
  Pagination,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconInfoCircle,
  IconPhoto,
  IconPhotoEdit,
  IconPlayerPlay,
  IconPlus,
  IconSparkles,
  IconTrash,
  IconVideo,
  IconWriting,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AiImageScenario,
  AiTextScenario,
  AiTextResult,
  AiImageResult,
  AiVideoScenario,
  AiVideoJob,
} from '../../../api/ai';
import type { InventoryVariant } from '../../../api/inventory';
import { fetchInventoryVariant } from '../../../api/inventory';
import { SectionPageShell } from '../../../components/layout/SectionPageShell';
import { ProductPickerModal } from '../../microsites/components/ProductPickerModal';
import { fetchAiVideoJob } from '../../../api/ai';
import {
  useAiHistory,
  useCreateAiCollage,
  useEditAiImage,
  useGenerateAiImage,
  useGenerateAiText,
  useGenerateAiVideo,
  useUploadAiImage,
} from '../hooks/useAiContent';
import { MaskEditorModal } from '../components/MaskEditorModal';
import { VideoCropModal } from '../components/VideoCropModal';

const textScenarios: Record<AiTextScenario, { label: string; description: string; contextLabel?: string }> = {
  product_description: {
    label: 'Popis produktu',
    description: 'Strukturovaný text s benefity, složením a doporučením použití.',
  },
  category_page: {
    label: 'Text pro category page',
    description: 'Hero claim, popis sortimentu a krátké CTA pro landing page.',
  },
  article: {
    label: 'Krátký článek',
    description: 'Krátké story se 2–3 odstavci a mezititulky.',
  },
  email_reply: {
    label: 'Odpověď na e-mail',
    description: 'Empatická odpověď zákazníkovi s jasným dalším krokem.',
    contextLabel: 'Původní e-mail / konverzace',
  },
  social_post: {
    label: 'Sociální sítě',
    description: 'Krátký příspěvek pro Instagram/FB s CTA a hashtagy.',
  },
  product_faq: {
    label: 'FAQ k produktu',
    description: '3–4 otázky a odpovědi k produktu nebo kolekci.',
  },
};

const imageScenarios: Record<AiImageScenario, { label: string; description: string }> = {
  category_banner: {
    label: 'Category page banner',
    description: 'Široký hero vizuál pro landing page s typografií.',
  },
  product_image: {
    label: 'Produktový obrázek',
    description: 'Detailní produktová fotografie s čistým pozadím.',
  },
  marketing_visual: {
    label: 'Marketingový vizuál',
    description: 'Lifestyle/branding záběr pro kampaně.',
  },
  email_banner: {
    label: 'E-mailový banner',
    description: 'Široký hero vizuál optimalizovaný pro newsletter.',
  },
};

const sizes = [
  { value: '512x512', label: '512 × 512' },
  { value: '768x768', label: '768 × 768' },
  { value: '1024x1024', label: '1024 × 1024' },
];

const editSizes = [
  { value: '512x512', label: '512 × 512' },
  { value: '768x768', label: '768 × 768' },
  { value: '1024x1024', label: '1024 × 1024' },
];

const responsesEditSizes = [
  { value: '512x512', label: '512 × 512' },
  { value: '768x768', label: '768 × 768' },
  { value: '1024x1024', label: '1024 × 1024' },
  { value: '1024x1536', label: '1024 × 1536 (vertikální)' },
  { value: '1536x1024', label: '1536 × 1024 (horizontální)' },
  { value: '1024x1792', label: '1024 × 1792 (vertikální)' },
  { value: '1792x1024', label: '1792 × 1024 (horizontální)' },
  { value: '1536x1536', label: '1536 × 1536' },
  { value: '2048x2048', label: '2048 × 2048 (HD)' },
];

const detailOptions = [
  { value: 'low', label: 'Low (rychlejší, hrubší výsledek)' },
  { value: 'standard', label: 'Standardní' },
  { value: 'hd', label: 'HD (nejvyšší kvalita, max 2048 px)' },
];

const videoScenarios: Record<AiVideoScenario, { label: string; description: string; recommended?: string }> = {
  product_loop: {
    label: 'Produktová smyčka',
    description: 'Rotující produkt s ambientním pozadím a jemnou animací.',
    recommended: 'Perfektní pro feed nebo microsite hero blok.',
  },
  lifestyle_spot: {
    label: 'Lifestyle spot',
    description: 'Spojí produkt s lifestyle scénou a textovým overlayem.',
    recommended: 'Vhodné pro stories/reels.',
  },
  storyboard: {
    label: 'Storyboard',
    description: 'Sekvence 2–3 záběrů, které vypráví mini příběh.',
  },
  mood_clip: {
    label: 'Mood clip',
    description: 'Abstraktní vizuální klip pro brand moodboardy a teaser videa.',
  },
};

const backgroundModes = [
  { value: 'preserve', label: 'Zachovat původní pozadí' },
  { value: 'remove', label: 'Odstranit pozadí' },
  { value: 'solid', label: 'Jednolité pozadí' },
];

const videoSizes = [
  { value: '720x1280', label: '9 : 16 (720 × 1280)' },
  { value: '1280x720', label: '16 : 9 (1280 × 720)' },
];

const videoDurations = [
  { value: '6', label: '6 sekund' },
  { value: '8', label: '8 sekund' },
  { value: '10', label: '10 sekund' },
];

type ImageEditFormState = {
  prompt: string;
  size: string;
  preserveLabel: boolean;
  backgroundMode: 'preserve' | 'remove' | 'solid';
  backgroundColor: string;
  negativePrompt: string;
  engine: 'classic' | 'responses';
  detail: 'low' | 'standard' | 'hd';
};

export const AiContentPage = () => {
  const [mode, setMode] = useState<'text' | 'image' | 'video'>('text');
  const [textScenario, setTextScenario] = useState<AiTextScenario>('product_description');
  const [imageScenario, setImageScenario] = useState<AiImageScenario>('category_banner');
  const [imageMode, setImageMode] = useState<'generate' | 'edit'>('generate');
  const [imageProvider, setImageProvider] = useState<'openai' | 'gemini'>('openai');
  const [videoScenario, setVideoScenario] = useState<AiVideoScenario>('product_loop');
  const [selectedVariant, setSelectedVariant] = useState<InventoryVariant | null>(null);
  const [selectedReferenceImageUrls, setSelectedReferenceImageUrls] = useState<string[]>([]);
  const [selectedEditImageUrl, setSelectedEditImageUrl] = useState<string | null>(null);
  const [includeFields, setIncludeFields] = useState({
    name: true,
    shortDescription: true,
    description: true,
    price: false,
    tags: false,
  });
  const [textForm, setTextForm] = useState({
    brief: '',
    tone: 'Luxusní concierge tón se zaměřením na emoce i fakta',
    audience: '',
    context: '',
    language: 'cs',
  });
  const [imageForm, setImageForm] = useState({
    prompt: '',
    style: 'cinematic lighting, ultra realistic, parfumerie vibes',
    size: '1024x1024' as '512x512' | '768x768' | '1024x1024',
  });
  const [imageEditForm, setImageEditForm] = useState<ImageEditFormState>({
    prompt: '',
    size: '1024x1024',
    preserveLabel: true,
    backgroundMode: 'preserve',
    backgroundColor: '#ffffff',
    negativePrompt: '',
    engine: 'classic',
    detail: 'standard',
  });
  const [videoForm, setVideoForm] = useState({
    prompt: '',
    size: '720x1280' as '720x1280' | '1280x720',
    seconds: 8,
  });
  const [textResult, setTextResult] = useState<AiTextResult | null>(null);
  const [imageGenerateResult, setImageGenerateResult] = useState<AiImageResult | null>(null);
  const [imageEditResult, setImageEditResult] = useState<AiImageResult | null>(null);
  const [videoJob, setVideoJob] = useState<AiVideoJob | null>(null);
  const [videoResult, setVideoResult] = useState<AiVideoJob | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  useEffect(() => {
    if (imageMode === 'edit' && imageProvider !== 'openai') {
      setImageProvider('openai');
    }
  }, [imageMode, imageProvider]);
  const [customImageEntries, setCustomImageEntries] = useState<ImageEntry[]>([]);
  const [collageLayout, setCollageLayout] = useState<'grid' | 'row' | 'column'>('grid');
  const [collageMessage, setCollageMessage] = useState<string | null>(null);
  const [maskInfo, setMaskInfo] = useState<{ path: string; url: string; preview: string } | null>(null);
  const [maskModalOpened, setMaskModalOpened] = useState(false);
  const [videoCropModalOpened, setVideoCropModalOpened] = useState(false);
  const [videoCropSourceFile, setVideoCropSourceFile] = useState<File | null>(null);
  const [isPickerOpen, pickerHandlers] = useDisclosure(false);
  const videoPollRef = useRef<number | null>(null);

  const textMutation = useGenerateAiText();
  const imageMutation = useGenerateAiImage();
  const editImageMutation = useEditAiImage();
  const videoMutation = useGenerateAiVideo();
  const uploadImageMutation = useUploadAiImage();
  const collageMutation = useCreateAiCollage();
  const uploadMaskMutation = useUploadAiImage();
  const [historyType, setHistoryType] = useState<'all' | 'text' | 'image' | 'video'>('all');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPerPage] = useState(10);
  const historyFilters = useMemo(
    () => ({ type: historyType === 'all' ? undefined : historyType, page: historyPage, per_page: historyPerPage }),
    [historyType, historyPage, historyPerPage]
  );
  const requiresReferenceImages = useMemo(
    () => imageProvider === 'openai' && ['product_image', 'marketing_visual'].includes(imageScenario),
    [imageProvider, imageScenario]
  );
  const referenceSelectionDisabled = useMemo(
    () => imageMode === 'generate' && imageProvider !== 'openai',
    [imageMode, imageProvider]
  );
  const historyQuery = useAiHistory(historyFilters);
  const historyEntries = historyQuery.data?.data ?? [];
  const historyMeta = historyQuery.data?.meta;
  const historyTypeOptions = useMemo(
    () => [
      { label: 'Vše', value: 'all' },
      { label: 'Texty', value: 'text' },
      { label: 'Obrázky', value: 'image' },
      { label: 'Videa', value: 'video' },
    ],
    []
  );

  const selectedTextScenario = textScenarios[textScenario];
  const selectedImageScenario = imageScenarios[imageScenario];
  const selectedVideoScenario = videoScenarios[videoScenario];

  const variantDetailQuery = useQuery({
    queryKey: ['inventory', 'variant', 'ai-content', selectedVariant?.id],
    queryFn: () => fetchInventoryVariant(selectedVariant!.id),
    enabled: Boolean(selectedVariant?.id),
    staleTime: 60_000,
  });

  const hydratedVariant = variantDetailQuery.data?.variant ?? selectedVariant ?? null;
  const basePayload = useMemo(
    () => (hydratedVariant?.product?.base_payload ?? {}) as Record<string, unknown>,
    [hydratedVariant]
  );
  type ImageEntry = { url: string; title?: string; alt?: string };

  const normalizeImageUrl = (value: string) => {
    if (!value) return value;
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    const trimmed = value.replace(/^\/+/, '');
    return `https://cdn.myshoptet.com/usr/www.krasnevune.cz/user/shop/orig/${trimmed}`;
  };

  const availableImages = useMemo<ImageEntry[]>(() => {
    const entries = Array.isArray(basePayload?.images) ? (basePayload.images as Array<Record<string, unknown>>) : [];
    const payloadImages = entries.reduce<ImageEntry[]>((acc, image) => {
      const rawSource =
        typeof image?.url === 'string'
          ? (image.url as string)
          : typeof image?.cdnUrl === 'string'
          ? (image.cdnUrl as string)
          : typeof image?.cdnName === 'string'
          ? (image.cdnName as string)
          : typeof image?.source === 'string'
          ? (image.source as string)
          : typeof image?.sourceUrl === 'string'
          ? (image.sourceUrl as string)
          : undefined;

      if (!rawSource) {
        return acc;
      }

      acc.push({
        url: normalizeImageUrl(rawSource),
        title: typeof image?.title === 'string' ? (image.title as string) : undefined,
        alt: typeof image?.alt === 'string' ? (image.alt as string) : undefined,
      });

      return acc;
    }, []);
    return [...payloadImages, ...customImageEntries];
  }, [basePayload, customImageEntries]);

  const customImageUrlSet = useMemo(() => new Set(customImageEntries.map((entry) => entry.url)), [customImageEntries]);

  useEffect(() => {
    setSelectedReferenceImageUrls((prev) => prev.filter((url) => availableImages.some((image) => image.url === url)));
  }, [availableImages]);

  useEffect(() => {
    if (selectedEditImageUrl && !availableImages.some((image) => image.url === selectedEditImageUrl)) {
      setSelectedEditImageUrl(null);
    }
  }, [availableImages, selectedEditImageUrl]);

  useEffect(() => {
    setMaskInfo(null);
  }, [selectedEditImageUrl]);

  const productContext = useMemo(() => {
    if (!hydratedVariant) {
      return '';
    }

    const contextParts: string[] = [];
    if (includeFields.name) {
      contextParts.push(
        `Produkt: ${hydratedVariant.name ?? (basePayload?.name as string | undefined) ?? hydratedVariant.code}`
      );
    }
    if (includeFields.shortDescription && typeof basePayload?.shortDescription === 'string') {
      contextParts.push(`Krátký popis: ${basePayload.shortDescription}`);
    }
    if (includeFields.description && typeof basePayload?.description === 'string') {
      contextParts.push(`Detailní popis: ${basePayload.description}`);
    }
    if (includeFields.price && typeof hydratedVariant.price === 'number') {
      contextParts.push(
        `Cena: ${new Intl.NumberFormat('cs-CZ', {
          style: 'currency',
          currency: hydratedVariant.currency_code ?? 'CZK',
          maximumFractionDigits: 2,
        }).format(hydratedVariant.price)}`
      );
    }
    if (includeFields.tags && Array.isArray(hydratedVariant.tags) && hydratedVariant.tags.length > 0) {
      contextParts.push(`Tagy: ${hydratedVariant.tags.map((tag) => tag.name).join(', ')}`);
    }
    if (selectedReferenceImageUrls.length > 0) {
      contextParts.push(`Fotky pro inspiraci: ${selectedReferenceImageUrls.join(', ')}`);
    }

    return contextParts.join('\n');
  }, [
    basePayload,
    hydratedVariant,
    includeFields.description,
    includeFields.name,
    includeFields.price,
    includeFields.shortDescription,
    includeFields.tags,
    selectedReferenceImageUrls,
  ]);

  const wizardSteps = useMemo(() => {
    if (mode === 'text') {
      return ['Zvol typ obsahu', 'Vyber textový scénář', 'Vyber produkt a fotky', 'Doplň brief', 'Vygeneruj a stáhni výsledek'];
    }

    if (mode === 'image') {
      return [
        'Zvol režim vizuálu',
        imageMode === 'generate' ? 'Vyber vizuální scénář' : 'Vyber fotku k úpravě',
        'Vyber produkt a fotky',
        imageMode === 'generate' ? 'Doplň brief' : 'Popiš úpravu',
        'Stáhni výsledek',
      ];
    }

    return ['Zvol typ obsahu', 'Vyber video scénář', 'Vyber produkt a fotky', 'Doplň video brief', 'Stáhni MP4'];
  }, [imageMode, mode]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyType]);

  const formatDateTime = useCallback(
    (value?: string | null) => (value ? new Date(value).toLocaleString('cs-CZ') : '—'),
    []
  );

  const resolveScenarioLabel = useCallback((type: 'text' | 'image' | 'video', scenario: string) => {
    if (type === 'text') {
      return textScenarios[scenario as AiTextScenario]?.label ?? scenario;
    }
    if (type === 'image' && scenario === 'image_edit') {
      return 'Úprava produktové fotky';
    }
    if (type === 'image') {
      return imageScenarios[scenario as AiImageScenario]?.label ?? scenario;
    }
    return videoScenarios[scenario as AiVideoScenario]?.label ?? scenario;
  }, []);

  const handleTextGenerate = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (textForm.brief.trim().length < 20) {
        notifications.show({ message: 'Popiš brief alespoň ve dvou větách.', color: 'yellow' });
        return;
      }

      try {
        const enrichedContext = [textForm.context, productContext].filter((entry) => entry && entry.trim().length > 0).join('\n\n');
        const result = await textMutation.mutateAsync({
          scenario: textScenario,
          brief: textForm.brief,
          tone: textForm.tone || undefined,
          audience: textForm.audience || undefined,
          context: enrichedContext || undefined,
          language: textForm.language || undefined,
        });
        setTextResult(result);
        notifications.show({ message: 'Text byl vygenerován a uložen do storage.', color: 'teal' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Generování selhalo.';
        notifications.show({ message, color: 'red' });
      }
    },
    [productContext, textForm, textMutation, textScenario]
  );

  const handleImageGenerate = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (imageForm.prompt.trim().length < 10) {
        notifications.show({ message: 'Popiš motiv obrázku alespoň jednou větou.', color: 'yellow' });
        return;
      }

      try {
        if (requiresReferenceImages && selectedReferenceImageUrls.length === 0) {
          notifications.show({ message: 'Vyber prosím alespoň jednu fotku produktu jako referenci.', color: 'yellow' });
          return;
        }
        const result = await imageMutation.mutateAsync({
          scenario: imageScenario,
          prompt: imageForm.prompt,
          style: imageForm.style || undefined,
          size: imageForm.size,
          reference_images:
            imageProvider === 'openai' && selectedReferenceImageUrls.length ? selectedReferenceImageUrls : undefined,
          provider: imageProvider,
        });
        setImageGenerateResult(result);
        notifications.show({ message: 'PNG bylo vytvořeno a uložené do storage.', color: 'teal' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Generování obrázku selhalo.';
        notifications.show({ message, color: 'red' });
      }
    },
    [imageForm, imageMutation, imageProvider, requiresReferenceImages, selectedReferenceImageUrls]
  );

  const handleImageEdit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (imageEditForm.prompt.trim().length < 10) {
        notifications.show({ message: 'Popiš, jak má AI fotku upravit (alespoň jedna věta).', color: 'yellow' });
        return;
      }
      if (!selectedEditImageUrl) {
        notifications.show({ message: 'Vyber prosím fotku, kterou chceš upravit.', color: 'yellow' });
        return;
      }

      try {
        const result = await editImageMutation.mutateAsync({
          image_url: selectedEditImageUrl,
          prompt: imageEditForm.prompt,
          size: imageEditForm.size,
          preserve_label: imageEditForm.preserveLabel ? true : undefined,
          background_mode: imageEditForm.backgroundMode,
          background_color: imageEditForm.backgroundMode === 'solid' ? imageEditForm.backgroundColor : undefined,
          negative_prompt: imageEditForm.negativePrompt || undefined,
          mask_path: maskInfo?.path || undefined,
          engine: imageEditForm.engine,
          detail: imageEditForm.engine === 'responses' ? imageEditForm.detail : undefined,
          reference_images: selectedReferenceImageUrls.length ? selectedReferenceImageUrls : undefined,
        });
        setImageEditResult(result);
        notifications.show({ message: 'Úprava fotky proběhla a PNG je uložené.', color: 'teal' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Úprava fotky selhala.';
        notifications.show({ message, color: 'red' });
      }
    },
    [editImageMutation, imageEditForm, selectedEditImageUrl, maskInfo]
  );

  const stopVideoPolling = useCallback(() => {
    if (videoPollRef.current) {
      window.clearInterval(videoPollRef.current);
      videoPollRef.current = null;
    }
  }, []);

  const handleCustomImageUpload = useCallback(
    async (file: File | null) => {
      if (!file) {
        return;
      }

      try {
        const upload = await uploadImageMutation.mutateAsync(file);
        setCustomImageEntries((prev) =>
          prev.some((entry) => entry.url === upload.url)
            ? prev
            : [...prev, { url: upload.url, title: file.name }]
        );
        setSelectedReferenceImageUrls((prev) => (prev.includes(upload.url) ? prev : [...prev, upload.url]));
        notifications.show({ message: 'Fotka byla nahrána a je připravená pro AI.', color: 'teal' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Nahrání fotky selhalo.';
        notifications.show({ message, color: 'red' });
      }
    },
    [uploadImageMutation]
  );

  const handleCreateCollage = useCallback(async () => {
    if (selectedReferenceImageUrls.length < 2) {
      notifications.show({ message: 'Vyber alespoň dvě fotky pro koláž.', color: 'yellow' });
      return;
    }

    try {
      setCollageMessage(null);
      const collage = await collageMutation.mutateAsync({
        images: selectedReferenceImageUrls,
        layout: collageLayout,
      });
      setCustomImageEntries((prev) => [...prev, { url: collage.url, title: `Koláž (${collage.layout})` }]);
      setSelectedReferenceImageUrls([collage.url]);
      setSelectedEditImageUrl(collage.url);
      setCollageMessage('Koláž byla vytvořena. Můžeš ji teď upravit nebo stáhnout.');
      notifications.show({ message: 'Koláž připravená. Můžeš ji rovnou upravit s AI.', color: 'teal' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Koláž se nepodařilo vytvořit.';
      notifications.show({ message, color: 'red' });
    }
  }, [collageLayout, collageMutation, selectedReferenceImageUrls]);

  const handleMaskSave = useCallback(
    async (file: File, previewUrl: string) => {
      try {
        const upload = await uploadMaskMutation.mutateAsync(file);
        setMaskInfo({ path: upload.path, url: upload.url, preview: previewUrl });
        notifications.show({ message: 'Maska byla uložená a použijeme ji pro další editaci.', color: 'teal' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Masku se nepodařilo nahrát.';
        notifications.show({ message, color: 'red' });
      }
    },
    [uploadMaskMutation]
  );

  const handleVideoGenerate = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (videoForm.prompt.trim().length < 10) {
        notifications.show({ message: 'Popiš scénu alespoň jednou větou.', color: 'yellow' });
        return;
      }

      try {
        setVideoError(null);
        setVideoResult(null);
        stopVideoPolling();
        const job = await videoMutation.mutateAsync({
          scenario: videoScenario,
          prompt: videoForm.prompt,
          size: videoForm.size,
          reference_images: selectedReferenceImageUrls.length ? selectedReferenceImageUrls : undefined,
          seconds: videoForm.seconds,
        });
        setVideoJob(job);
        notifications.show({
          message: 'Video úloha běží. Výsledek uložíme do historie i storage.',
          color: 'teal',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Generování videa selhalo.';
        notifications.show({ message, color: 'red' });
      }
    },
    [selectedReferenceImageUrls, stopVideoPolling, videoForm, videoMutation, videoScenario]
  );

  const handleVideoCropUpload = useCallback((file: File | null) => {
    if (!file) {
      return;
    }
    setVideoCropSourceFile(file);
    setVideoCropModalOpened(true);
  }, []);

  const handleVideoCropConfirm = useCallback(
    async (croppedFile: File, _previewUrl: string) => {
      try {
        const upload = await uploadImageMutation.mutateAsync(croppedFile);
        setCustomImageEntries((prev) => [...prev, { url: upload.url, title: `${croppedFile.name} (video)` }]);
        setSelectedReferenceImageUrls((prev) => [...prev, upload.url]);
        notifications.show({ message: 'Fotka byla oříznuta pro video a přidána k referencím.', color: 'teal' });
        setVideoCropModalOpened(false);
        setVideoCropSourceFile(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Příprava fotky pro video selhala.';
        notifications.show({ message, color: 'red' });
      }
    },
    [uploadImageMutation]
  );

  useEffect(() => {
    stopVideoPolling();

    if (!videoJob?.job_id) {
      return () => stopVideoPolling();
    }

    if (videoJob.status === 'completed' || videoJob.status === 'failed') {
      if (videoJob.status === 'completed') {
        setVideoResult(videoJob);
      }
      if (videoJob.status === 'failed') {
        setVideoError(videoJob.error ?? 'Generování videa selhalo.');
      }
      return () => stopVideoPolling();
    }

    const intervalId = window.setInterval(async () => {
      try {
        const updated = await fetchAiVideoJob(videoJob.job_id!);
        setVideoJob(updated);
        if (updated.status === 'completed') {
          setVideoResult(updated);
        }
        if (updated.status === 'failed') {
          setVideoError(updated.error ?? 'Generování videa selhalo.');
        }
      } catch (error) {
        console.error(error);
      }
    }, 5000);
    videoPollRef.current = intervalId;

    return () => {
      stopVideoPolling();
    };
  }, [videoJob, mode, stopVideoPolling]);

  return (
    <SectionPageShell
      section="ai.content"
      title="Tvorba AI obsahu"
      description="Generuj texty a vizuály v několika scénářích, výstupy ukládáme do public storage."
    >
      <Stack gap="lg">
        <Card withBorder>
          <Stack gap="sm">
            <Text fw={600}>Průvodce</Text>
            <Stack gap={4}>
              {wizardSteps.map((step, index) => (
                <Group key={step} gap="sm">
                  <Text fw={600}>{index + 1}.</Text>
                  <Text size="sm">{step}</Text>
                </Group>
              ))}
            </Stack>
          </Stack>
        </Card>

        <Card withBorder>
          <Stack gap="md">
            <Text fw={600}>1) Zvol typ obsahu</Text>
            <SegmentedControl
              value={mode}
              onChange={(value) => setMode((value as 'text' | 'image' | 'video') ?? 'text')}
              data={[
                { label: 'Texty', value: 'text' },
                { label: 'Obrázky', value: 'image' },
                { label: 'Videa', value: 'video' },
              ]}
            />
          </Stack>
        </Card>

        {mode === 'video' ? null : mode === 'text' ? (
          <Card withBorder>
            <Stack gap="md">
              <Text fw={600}>2) Vyber textový scénář</Text>
              <SegmentedControl
                value={textScenario}
                onChange={(value) => setTextScenario((value as AiTextScenario) ?? 'product_description')}
                fullWidth
                orientation="vertical"
                data={Object.entries(textScenarios).map(([value, meta]) => ({
                  value,
                  label: meta.label,
                }))}
              />
              <Alert color="blue" variant="light" icon={<IconWriting size={16} />}>
                <Text fw={600}>{selectedTextScenario.label}</Text>
                <Text size="sm">{selectedTextScenario.description}</Text>
              </Alert>
              <form onSubmit={handleTextGenerate}>
                <Stack gap="md">
                  <Textarea
                    label="Brief"
                    placeholder="Popiš produkty, vůně, klíčové sdělení, CTA..."
                    minRows={4}
                    required
                    value={textForm.brief}
                    onChange={(event) => setTextForm((prev) => ({ ...prev, brief: event.currentTarget.value }))}
                  />
                  <TextInput
                    label="Tón komunikace"
                    value={textForm.tone}
                    onChange={(event) => setTextForm((prev) => ({ ...prev, tone: event.currentTarget.value }))}
                  />
                  <TextInput
                    label="Cílové publikum"
                    placeholder="VIP klienti, newsletter odběratelé..."
                    value={textForm.audience}
                    onChange={(event) => setTextForm((prev) => ({ ...prev, audience: event.currentTarget.value }))}
                  />
                  <Textarea
                    label={selectedTextScenario.contextLabel ?? 'Dodatečný kontext'}
                    placeholder="Sem vlož třeba zdrojový e-mail, URL nebo odrážky."
                    minRows={3}
                    value={textForm.context}
                    onChange={(event) => setTextForm((prev) => ({ ...prev, context: event.currentTarget.value }))}
                  />
                  <Group align="flex-end" gap="md">
                    <TextInput
                      label="Jazyk"
                      description="Např. cs, en"
                      value={textForm.language}
                      onChange={(event) => setTextForm((prev) => ({ ...prev, language: event.currentTarget.value }))}
                      style={{ maxWidth: 160 }}
                    />
                    <Button
                      type="submit"
                      leftSection={<IconSparkles size={16} />}
                      loading={textMutation.isPending}
                      disabled={textForm.brief.trim().length < 20}
                    >
                      Generovat text
                    </Button>
                  </Group>
                </Stack>
              </form>
              <Alert variant="light" color="gray">
                <Stack gap="xs">
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text fw={600}>3) Přidej produkt pro kontext (volitelné)</Text>
                      <Text size="sm" c="dimmed">
                        Vyber produkt a označ, které údaje a fotky má AI vidět. Ušetříš si psaní long briefu.
                      </Text>
                    </div>
                    <Button variant="light" onClick={pickerHandlers.open}>
                      Vybrat produkt
                    </Button>
                  </Group>
                  {hydratedVariant ? (
                    <Card withBorder>
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <div>
                            <Text fw={600}>{hydratedVariant.name ?? hydratedVariant.code}</Text>
                            <Group gap="xs">
                              <Badge variant="light" color="blue">
                                {hydratedVariant.code}
                              </Badge>
                              {hydratedVariant.brand ? (
                                <Badge variant="light" color="gray">
                                  {hydratedVariant.brand}
                                </Badge>
                              ) : null}
                            </Group>
                          </div>
                          <Button
                            variant="subtle"
                            color="red"
                            size="xs"
                            leftSection={<IconTrash size={14} />}
                            onClick={() => {
                              setSelectedVariant(null);
                              setSelectedReferenceImageUrls([]);
                              setSelectedEditImageUrl(null);
                              setIncludeFields({ name: true, shortDescription: true, description: true, price: false, tags: false });
                              setMaskInfo(null);
                            }}
                          >
                            Odebrat
                          </Button>
                        </Group>
                        <Stack gap={6}>
                          <Text fw={600} size="sm">
                            Jaká data poslat AI
                          </Text>
                          <Group gap="md">
                            <Checkbox
                              label="Název"
                              checked={includeFields.name}
                              onChange={(event) => setIncludeFields((prev) => ({ ...prev, name: event.currentTarget.checked }))}
                            />
                            {typeof basePayload?.shortDescription === 'string' ? (
                              <Checkbox
                                label="Krátký popis"
                                checked={includeFields.shortDescription}
                                onChange={(event) =>
                                  setIncludeFields((prev) => ({ ...prev, shortDescription: event.currentTarget.checked }))
                                }
                              />
                            ) : null}
                            {typeof basePayload?.description === 'string' ? (
                              <Checkbox
                                label="Plný popis"
                                checked={includeFields.description}
                                onChange={(event) =>
                                  setIncludeFields((prev) => ({ ...prev, description: event.currentTarget.checked }))
                                }
                              />
                            ) : null}
                            {typeof hydratedVariant.price === 'number' ? (
                              <Checkbox
                                label="Cena"
                                checked={includeFields.price}
                                onChange={(event) => setIncludeFields((prev) => ({ ...prev, price: event.currentTarget.checked }))}
                              />
                            ) : null}
                            {Array.isArray(hydratedVariant.tags) && hydratedVariant.tags.length > 0 ? (
                              <Checkbox
                                label="Tagy"
                                checked={includeFields.tags}
                                onChange={(event) => setIncludeFields((prev) => ({ ...prev, tags: event.currentTarget.checked }))}
                              />
                            ) : null}
                          </Group>
                        </Stack>
                        {availableImages.length ? (
                          <Stack gap="xs">
                            <Text fw={600} size="sm">
                              Fotky pro inspiraci
                            </Text>
                            <Group gap="sm">
                              {availableImages.map((image) => {
                                const isSelected = selectedReferenceImageUrls.includes(image.url);
                                return (
                                  <Card
                                    key={image.url}
                                    withBorder
                                    padding="xs"
                                    style={{
                                      width: 120,
                                      borderColor: isSelected ? 'var(--mantine-color-violet-5)' : undefined,
                                      cursor: 'pointer',
                                    }}
                                    onClick={() =>
                                      setSelectedReferenceImageUrls((prev) =>
                                        prev.includes(image.url) ? prev.filter((url) => url !== image.url) : [...prev, image.url]
                                      )
                                    }
                                  >
                                    <Stack gap={4}>
                                      <Image src={image.url} alt={image.alt ?? image.title ?? 'Produkt'} radius="sm" height={80} fit="cover" />
                                    <Checkbox
                                      label={image.title ?? 'Zahrnout'}
                                      checked={isSelected}
                                      onChange={(event) => {
                                        event.stopPropagation();
                                        const checked = event.currentTarget.checked;
                                        setSelectedReferenceImageUrls((prev) =>
                                          checked ? [...prev, image.url] : prev.filter((url) => url !== image.url)
                                        );
                                      }}
                                    />
                                    </Stack>
                                  </Card>
                                );
                              })}
                            </Group>
                          </Stack>
                        ) : null}
                      </Stack>
                    </Card>
                  ) : (
                    <Text size="sm" c="dimmed">
                      Zatím nemáš vybraný produkt. Klikni na „Vybrat produkt“ a urč, jaká data má AI použít.
                    </Text>
                  )}
                </Stack>
              </Alert>
              {textResult ? (
                <Stack gap="sm">
                  <Text fw={600}>Výsledek</Text>
                  <Card withBorder>
                    <Stack gap="sm">
                      <Textarea readOnly value={textResult.content} autosize minRows={8} />
                      <Group gap="sm">
                        <CopyButton value={textResult.content} timeout={2000}>
                          {({ copied, copy }) => (
                            <Button
                              variant="light"
                              onClick={copy}
                              leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                            >
                              {copied ? 'Zkopírováno' : 'Kopírovat text'}
                            </Button>
                          )}
                        </CopyButton>
                        <Button
                          component="a"
                          href={textResult.url}
                          target="_blank"
                          rel="noopener"
                          leftSection={<IconDownload size={16} />}
                        >
                          Stáhnout .md
                        </Button>
                        <Text size="sm" c="dimmed">
                          Soubor: {textResult.filename}
                        </Text>
                      </Group>
                    </Stack>
                  </Card>
                </Stack>
              ) : null}
            </Stack>
          </Card>
        ) : (
          <Card withBorder>
            <Stack gap="md">
              <Text fw={600}>2) Jak chceš pracovat s vizuálem</Text>
              <SegmentedControl
                value={imageMode}
                onChange={(value) => setImageMode((value as 'generate' | 'edit') ?? 'generate')}
                data={[
                  { label: 'Generovat nový vizuál', value: 'generate' },
                  { label: 'Upravit fotku', value: 'edit' },
                ]}
              />
              {imageMode === 'generate' ? (
                <>
                  <Text fw={600}>Vyber vizuální scénář</Text>
                  <SegmentedControl
                    fullWidth
                    orientation="vertical"
                    value={imageScenario}
                    onChange={(value) => setImageScenario((value as AiImageScenario) ?? 'category_banner')}
                    data={Object.entries(imageScenarios).map(([value, meta]) => ({ value, label: meta.label }))}
                  />
                  <Alert color="violet" variant="light" icon={<IconPhoto size={16} />}>
                    <Text fw={600}>{selectedImageScenario.label}</Text>
                    <Text size="sm">{selectedImageScenario.description}</Text>
                  </Alert>
                </>
              ) : (
                <Alert color="violet" variant="light" icon={<IconPhotoEdit size={16} />}>
                  <Text fw={600}>Uprav vlastní produktovou fotku</Text>
                  <Text size="sm">
                    Vyber konkrétní fotku z produktu a popiš, jak ji má AI upravit. Zachováváme původní flakon a část
                    kompozice, AI jen dotváří styling podle zadání.
                  </Text>
                </Alert>
              )}
              <Alert variant="light" color="gray">
                <Stack gap="xs">
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text fw={600}>
                        {imageMode === 'edit' ? '3) Vyber produkt a fotku k úpravě' : '3) Vyber produkt a fotky'}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {imageMode === 'edit'
                          ? 'Označ konkrétní fotku, kterou má AI vzít a upravit. Můžeš ji kdykoliv změnit.'
                          : 'Pro produktové obrázky a marketingové vizuály vyber fotky, které dáme AI jako referenci.'}
                      </Text>
                    </div>
                    <Button variant="light" onClick={pickerHandlers.open}>
                      Vybrat produkt
                    </Button>
                  </Group>
                  {hydratedVariant ? (
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <div>
                          <Text fw={600}>{hydratedVariant.name ?? hydratedVariant.code}</Text>
                          <Group gap="xs">
                            <Badge variant="light" color="blue">
                              {hydratedVariant.code}
                            </Badge>
                            {hydratedVariant.brand ? (
                              <Badge variant="light" color="gray">
                                {hydratedVariant.brand}
                              </Badge>
                            ) : null}
                          </Group>
                        </div>
                        <Button
                          variant="subtle"
                          color="red"
                          size="xs"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => {
                            setSelectedVariant(null);
                            setSelectedReferenceImageUrls([]);
                            setSelectedEditImageUrl(null);
                            setMaskInfo(null);
                          }}
                        >
                          Odebrat
                        </Button>
                      </Group>
                      {availableImages.length ? (
                        <Stack gap="xs">
                          <Text fw={600} size="sm">
                            {imageMode === 'edit' ? 'Fotka pro úpravu' : 'Fotky pro AI'}
                          </Text>
                          <Group gap="sm">
                            {availableImages.map((image) => {
                              const isReferenceSelected = selectedReferenceImageUrls.includes(image.url);
                              const isEditSelected = selectedEditImageUrl === image.url;
                              const isHighlighted = imageMode === 'edit' ? isEditSelected : isReferenceSelected;
                              const isCustom = customImageUrlSet.has(image.url);
                              return (
                                <Card
                                  key={image.url}
                                  withBorder
                                  padding="xs"
                                  style={{
                                    width: 120,
                                    borderColor: isHighlighted ? 'var(--mantine-color-violet-5)' : undefined,
                                    cursor: 'pointer',
                                  }}
                                  onClick={() => {
                                    if (imageMode === 'edit') {
                                      setSelectedEditImageUrl((prev) => (prev === image.url ? null : image.url));
                                    } else {
                                      setSelectedReferenceImageUrls((prev) =>
                                        prev.includes(image.url) ? prev.filter((url) => url !== image.url) : [...prev, image.url]
                                      );
                                    }
                                  }}
                                >
                                  <Stack gap={4}>
                                    <Image src={image.url} alt={image.alt ?? image.title ?? 'Produkt'} radius="sm" height={80} fit="cover" />
                                    {isCustom ? (
                                      <Badge size="xs" color="teal" variant="light">
                                        Vlastní
                                      </Badge>
                                    ) : null}
                                    {imageMode === 'edit' ? (
                                      <Checkbox
                                        label="Upravit"
                                        checked={isEditSelected}
                                        onChange={(event) => {
                                          event.stopPropagation();
                                          setSelectedEditImageUrl(event.currentTarget.checked ? image.url : null);
                                        }}
                                      />
                                    ) : (
                                      <Checkbox
                                        label={referenceSelectionDisabled ? 'Použít (jen pro OpenAI)' : 'Použít'}
                                        checked={isReferenceSelected}
                                        onChange={(event) => {
                                          event.stopPropagation();
                                          if (referenceSelectionDisabled) {
                                            return;
                                          }
                                          const checked = event.currentTarget.checked;
                                          setSelectedReferenceImageUrls((prev) =>
                                            checked ? [...prev, image.url] : prev.filter((url) => url !== image.url)
                                          );
                                        }}
                                        disabled={referenceSelectionDisabled}
                                      />
                                    )}
                                  </Stack>
                                </Card>
                              );
                            })}
                          </Group>
                          {imageMode === 'generate' && imageProvider === 'openai' && selectedReferenceImageUrls.length === 0 ? (
                            <Text size="xs" c="dimmed">
                              Tip: vyber alespoň jednu fotku, aby AI zachovala vzhled tvého produktu.
                            </Text>
                          ) : null}
                          {imageMode === 'generate' && imageProvider !== 'openai' ? (
                            <Text size="xs" c="dimmed">
                              Gemini Imagen 3 pracuje z textu – referenční fotky jsou pro tento model volitelné.
                            </Text>
                          ) : null}
                          {imageMode === 'edit' && !selectedEditImageUrl ? (
                            <Text size="xs" c="dimmed">
                              Vyber fotku, kterou chceš předat AI k úpravě.
                            </Text>
                          ) : null}
                        </Stack>
                      ) : (
                        <Text size="sm" c="dimmed">
                          Produkt zatím nemá žádné fotky v payloadu.
                        </Text>
                      )}
                    </Stack>
                  ) : (
                    <Text size="sm" c="dimmed">
                      Zatím není vybraný produkt. Fotky však výrazně zlepší výsledek (a pro některé scénáře jsou povinné).
                    </Text>
                  )}
                  <Stack gap="xs">
                    <Group gap="sm">
                      <FileButton onChange={handleCustomImageUpload} accept="image/png,image/jpeg,image/webp">
                        {(props) => (
                          <Button
                            {...props}
                            variant="light"
                            leftSection={<IconPlus size={16} />}
                            loading={uploadImageMutation.isPending}
                          >
                            Nahrát vlastní fotku
                          </Button>
                        )}
                      </FileButton>
                      {uploadImageMutation.isPending ? <Loader size="sm" /> : null}
                    </Group>
                    <Text size="xs" c="dimmed">
                      Nahrané fotky se hned zobrazí mezi ostatními. Můžeš je použít pro úpravu i koláž.
                    </Text>
                  </Stack>
                  <Card withBorder>
                    <Stack gap="xs">
                      <Group justify="space-between" align="center">
                        <div>
                          <Text fw={600} size="sm">
                            Koláž z vybraných fotek
                          </Text>
                          <Text size="xs" c="dimmed">
                            Vyber minimálně dvě fotky. Koláž vložíme do editoru jako novou fotku.
                          </Text>
                        </div>
                        <SegmentedControl
                          value={collageLayout}
                          onChange={(value) => setCollageLayout((value as typeof collageLayout) ?? 'grid')}
                          data={[
                            { label: 'Mřížka', value: 'grid' },
                            { label: 'Řada', value: 'row' },
                            { label: 'Sloupec', value: 'column' },
                          ]}
                          size="xs"
                        />
                      </Group>
                      <Button
                        variant="light"
                        leftSection={<IconPhoto size={16} />}
                        onClick={handleCreateCollage}
                        loading={collageMutation.isPending}
                        disabled={selectedReferenceImageUrls.length < 2 || collageMutation.isPending}
                      >
                        Vytvořit koláž
                      </Button>
                      <Text size="xs" c={collageMessage ? undefined : 'dimmed'}>
                        {collageMessage ?? 'Koláž lze vytvořit až z alespoň dvou označených fotek.'}
                      </Text>
                    </Stack>
                  </Card>
                </Stack>
              </Alert>
              {imageMode === 'generate' ? (
                <>
                  <form onSubmit={handleImageGenerate}>
                    <Stack gap="md">
                      <Select
                        label="Model"
                        value={imageProvider}
                        data={[
                          { value: 'openai', label: 'OpenAI GPT-Image (zachová produkt pomocí referencí)' },
                          { value: 'gemini', label: 'Gemini Imagen 3 (rychlá změna pozadí)' },
                        ]}
                        onChange={(value) => setImageProvider((value as typeof imageProvider) ?? 'openai')}
                      />
                      {imageProvider === 'gemini' ? (
                        <Alert variant="light" color="yellow" icon={<IconInfoCircle size={16} />}>
                          Gemini pracuje čistě z textového zadání. Referenční fotky jsou pro tento model pouze volitelné
                          a slouží spíše pro koláže nebo následné úpravy.
                        </Alert>
                      ) : null}
                      <Textarea
                        label="Prompt"
                        required
                        minRows={3}
                        placeholder="Např. produktový hero shot s flakónem Kayali v mlze..."
                        value={imageForm.prompt}
                        onChange={(event) => setImageForm((prev) => ({ ...prev, prompt: event.currentTarget.value }))}
                      />
                      <TextInput
                        label="Styl"
                        value={imageForm.style}
                        onChange={(event) => setImageForm((prev) => ({ ...prev, style: event.currentTarget.value }))}
                      />
                      <Select
                        label="Rozměr"
                        value={imageForm.size}
                        data={sizes}
                        onChange={(value) =>
                          setImageForm((prev) => ({ ...prev, size: (value as typeof imageForm.size) ?? prev.size }))
                        }
                      />
                      <Group>
                        <Button
                          type="submit"
                          leftSection={<IconSparkles size={16} />}
                          loading={imageMutation.isPending}
                          disabled={
                            imageForm.prompt.trim().length < 10 ||
                            (requiresReferenceImages && selectedReferenceImageUrls.length === 0)
                          }
                        >
                          Generovat PNG
                        </Button>
                      </Group>
                    </Stack>
                  </form>
                  {imageGenerateResult ? (
                    <Stack gap="sm">
                      <Text fw={600}>Výsledek</Text>
                      <Card withBorder>
                        <Stack gap="sm">
                          <Image src={imageGenerateResult.url} alt="AI vizuál" radius="md" />
                          <Group gap="sm">
                            <Button
                              component="a"
                              href={imageGenerateResult.url}
                              target="_blank"
                              rel="noopener"
                              leftSection={<IconDownload size={16} />}
                            >
                              Stáhnout PNG
                            </Button>
                            <Text size="sm" c="dimmed">
                              Soubor: {imageGenerateResult.filename}
                            </Text>
                          </Group>
                        </Stack>
                      </Card>
                    </Stack>
                  ) : null}
                </>
              ) : (
                <>
                  <form onSubmit={handleImageEdit}>
                    <Stack gap="md">
                      <Textarea
                        label="Jak má AI fotku upravit?"
                        required
                        minRows={3}
                        placeholder="Např. vyměň pozadí za zimní scénu, přidej konfety..."
                        value={imageEditForm.prompt}
                        onChange={(event) => setImageEditForm((prev) => ({ ...prev, prompt: event.currentTarget.value }))}
                      />
                      <Stack gap="sm">
                        <SegmentedControl
                          value={imageEditForm.engine}
                          onChange={(value) =>
                            setImageEditForm((prev) => ({
                              ...prev,
                              engine: (value as ImageEditFormState['engine']) ?? prev.engine,
                            }))
                          }
                          data={[
                            { label: 'Rychlá úprava', value: 'classic' },
                            { label: 'Responses (více voleb)', value: 'responses' },
                          ]}
                        />
                        {imageEditForm.engine === 'responses' ? (
                          <Alert color="violet" icon={<IconInfoCircle size={16} />} variant="light">
                            Experimentální režim používá Responses API. Získáš lepší kvalitu, větší rozměry i masku –
                            počítej ale s delším generováním a vyšší spotřebou kreditů.
                          </Alert>
                        ) : null}
                      </Stack>
                      <Select
                        label="Rozměr výstupu"
                        description={
                          imageEditForm.engine === 'responses'
                            ? 'HD 2048 px funguje pouze s detailem „HD“.'
                            : undefined
                        }
                        value={imageEditForm.size}
                        data={imageEditForm.engine === 'responses' ? responsesEditSizes : editSizes}
                        onChange={(value) => setImageEditForm((prev) => ({ ...prev, size: value ?? prev.size }))}
                      />
                      {imageEditForm.engine === 'responses' ? (
                        <Select
                          label="Detail renderu"
                          value={imageEditForm.detail}
                          data={detailOptions}
                          onChange={(value) =>
                            setImageEditForm((prev) => ({
                              ...prev,
                              detail: (value as ImageEditFormState['detail']) ?? prev.detail,
                            }))
                          }
                        />
                      ) : null}
                      <Select
                        label="Práce s pozadím"
                        value={imageEditForm.backgroundMode}
                        data={backgroundModes}
                        onChange={(value) =>
                          setImageEditForm((prev) => ({
                            ...prev,
                            backgroundMode: (value as ImageEditFormState['backgroundMode']) ?? prev.backgroundMode,
                          }))
                        }
                      />
                      {imageEditForm.backgroundMode === 'solid' ? (
                        <TextInput
                          label="Barva pozadí"
                          type="color"
                          value={imageEditForm.backgroundColor}
                          onChange={(event) =>
                            setImageEditForm((prev) => ({ ...prev, backgroundColor: event.currentTarget.value }))
                          }
                          style={{ maxWidth: 160 }}
                        />
                      ) : null}
                      <Textarea
                        label="Negativní prompt"
                        description="Co má AI určitě vynechat (např. texty, hologramy...)"
                        minRows={2}
                        value={imageEditForm.negativePrompt}
                        onChange={(event) =>
                          setImageEditForm((prev) => ({ ...prev, negativePrompt: event.currentTarget.value }))
                        }
                      />
                  <Stack gap="xs">
                    <Group gap="sm">
                      <Button
                        variant="light"
                        onClick={() => setMaskModalOpened(true)}
                        disabled={!selectedEditImageUrl}
                      >
                        Otevřít editor masky
                      </Button>
                      {maskInfo ? (
                        <Button variant="subtle" color="red" onClick={() => setMaskInfo(null)}>
                          Odebrat masku
                        </Button>
                      ) : null}
                      {uploadMaskMutation.isPending ? <Loader size="sm" /> : null}
                    </Group>
                    {maskInfo ? (
                      <Group gap="sm">
                        <Image src={maskInfo.preview} radius="sm" width={80} height={80} />
                        <Text size="sm">
                          Maska aktivní – červeně označené oblasti zůstanou beze změny.
                        </Text>
                      </Group>
                    ) : (
                      <Text size="xs" c="dimmed">
                        Označ maskou části, do kterých nemá AI zasahovat. Lze ji kdykoli přepsat nebo odebrat.
                      </Text>
                    )}
                  </Stack>
                  <Checkbox
                    label="Striktně zachovat etiketu / texty na flakónu"
                    checked={imageEditForm.preserveLabel}
                    onChange={(event) =>
                      setImageEditForm((prev) => ({ ...prev, preserveLabel: event.currentTarget.checked }))
                    }
                  />
                  <Text size="xs" c="dimmed">
                    Když je tato volba zapnutá, AI dostane instrukce, aby neměnila texty, tvar ani logo na flakónu. Zaměří se
                    jen na pozadí a atmosféru.
                  </Text>
                  <Group>
                    <Button
                      type="submit"
                          leftSection={<IconSparkles size={16} />}
                          loading={editImageMutation.isPending}
                          disabled={imageEditForm.prompt.trim().length < 10 || !selectedEditImageUrl}
                        >
                          Upravit fotku
                        </Button>
                      </Group>
                    </Stack>
                  </form>
                  {imageEditResult ? (
                    <Stack gap="sm">
                      <Text fw={600}>Výsledek úpravy</Text>
                      <Card withBorder>
                        <Stack gap="sm">
                          <Group align="flex-start" gap="lg">
                            {imageEditResult.source_image_url ? (
                              <Stack gap={4} style={{ flex: 1 }}>
                                <Text fw={600} size="sm">
                                  Zdrojová fotka
                                </Text>
                                <Image
                                  src={imageEditResult.source_image_url}
                                  alt="Zdrojová fotka produktu"
                                  radius="md"
                                />
                              </Stack>
                            ) : null}
                            <Stack gap={4} style={{ flex: 1 }}>
                              <Text fw={600} size="sm">
                                Upravená verze
                              </Text>
                              <Image src={imageEditResult.url} alt="AI upravený vizuál" radius="md" />
                            </Stack>
                          </Group>
                          <Group gap="sm">
                            <Button
                              component="a"
                              href={imageEditResult.url}
                              target="_blank"
                              rel="noopener"
                              leftSection={<IconDownload size={16} />}
                            >
                              Stáhnout PNG
                            </Button>
                            <Text size="sm" c="dimmed">
                              Soubor: {imageEditResult.filename}
                            </Text>
                          </Group>
                        </Stack>
                      </Card>
                    </Stack>
                  ) : null}
                </>
              )}
            </Stack>
          </Card>
        )}

        {mode === 'video' && (
          <Card withBorder>
            <Stack gap="md">
              <Text fw={600}>2) Vyber video scénář</Text>
              <SegmentedControl
                value={videoScenario}
                onChange={(value) => setVideoScenario((value as AiVideoScenario) ?? 'product_loop')}
                fullWidth
                orientation="vertical"
                data={Object.entries(videoScenarios).map(([value, meta]) => ({
                  value,
                  label: meta.label,
                }))}
              />
              <Alert color="teal" variant="light" icon={<IconVideo size={18} />}>
                <Text fw={600}>{selectedVideoScenario.label}</Text>
                <Text size="sm">{selectedVideoScenario.description}</Text>
                {selectedVideoScenario.recommended ? (
                  <Text size="xs" c="dimmed">
                    {selectedVideoScenario.recommended}
                  </Text>
                ) : null}
              </Alert>
              <Alert variant="light" color="gray">
                <Stack gap="xs">
                  <Text fw={600}>3) Přidej produktové fotky (volitelné)</Text>
                  <Text size="sm" c="dimmed">
                    Ve třetím kroku průvodce vyber produkt a fotky, které mají video inspirovat. Pošleme je jako{' '}
                    <code>input_reference</code> modelu <strong>sora-2-pro</strong>, takže výsledek bude věrný originálu.
                    Bez fotek poběží rychlý režim se stejným promptem.
                  </Text>
                </Stack>
              </Alert>
              <Stack gap={4}>
                <Group gap="sm">
                  <FileButton
                    onChange={handleVideoCropUpload}
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  >
                    {(props) => (
                      <Button {...props} variant="light" leftSection={<IconPhoto size={16} />}>
                        Nahrát fotku pro video
                      </Button>
                    )}
                  </FileButton>
                </Group>
                <Text size="xs" c="dimmed">
                  Po nahrání fotku automaticky ořízneme na poměr stran videa ({videoForm.size.replace('x', ' × ')}).
                </Text>
              </Stack>
              <form onSubmit={handleVideoGenerate}>
                <Stack gap="md">
                  <Textarea
                    label="Video prompt"
                    required
                    minRows={3}
                    placeholder="Popiš scénu, pohyb kamery, náladu..."
                    value={videoForm.prompt}
                    onChange={(event) => setVideoForm((prev) => ({ ...prev, prompt: event.currentTarget.value }))}
                  />
                  <Select
                    label="Poměr stran"
                    data={videoSizes}
                    value={videoForm.size}
                    onChange={(value) =>
                      setVideoForm((prev) => ({ ...prev, size: (value as typeof videoForm.size) ?? prev.size }))
                    }
                  />
                  <Select
                    label="Délka videa"
                    data={videoDurations}
                    value={String(videoForm.seconds)}
                    onChange={(value) =>
                      setVideoForm((prev) => ({
                        ...prev,
                        seconds: value ? Number(value) : prev.seconds,
                      }))
                    }
                  />
                  <Group>
                    <Button
                      type="submit"
                      leftSection={<IconPlayerPlay size={16} />}
                      loading={videoMutation.isPending}
                      disabled={videoForm.prompt.trim().length < 10}
                    >
                      Spustit generování videa
                    </Button>
                  </Group>
                </Stack>
              </form>
              {videoError ? (
                <Alert color="red" icon={<IconInfoCircle size={16} />}>
                  {videoError}
                </Alert>
              ) : null}
              {videoJob ? (
                <Card withBorder>
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-start">
                      <div>
                        <Text fw={600}>Stav videa</Text>
                        <Text size="xs" c="dimmed">
                          {videoJob.job_id}
                        </Text>
                      </div>
                      <Badge
                        variant="light"
                        color={
                          videoJob.status === 'completed'
                            ? 'teal'
                            : videoJob.status === 'failed'
                            ? 'red'
                            : 'yellow'
                        }
                      >
                        {videoJob.status ?? 'unknown'}
                      </Badge>
                    </Group>
                    {videoJob.status !== 'completed' ? (
                      <Group gap="sm">
                        <Loader size="sm" />
                        <Text size="sm">
                          {videoJob.status === 'queued'
                            ? 'Zařazeno do fronty...'
                            : videoJob.status === 'failed'
                            ? 'Úloha selhala.'
                            : 'Generujeme video...'}
                        </Text>
                      </Group>
                    ) : null}
                    {videoJob.progress ? (
                      <Text size="xs" c="dimmed">
                        Progres: {videoJob.progress}
                      </Text>
                    ) : null}
                    {videoResult?.url ? (
                      <Stack gap="sm">
                        <Text fw={600}>Výsledek</Text>
                        <video
                          controls
                          src={videoResult.url ?? undefined}
                          style={{ width: '100%', borderRadius: 12 }}
                        />
                        <Group gap="sm">
                          <Button
                            component="a"
                            href={videoResult.url ?? undefined}
                            target={videoResult.url ? '_blank' : undefined}
                            rel={videoResult.url ? 'noopener' : undefined}
                            leftSection={<IconDownload size={16} />}
                          >
                            Stáhnout MP4
                          </Button>
                          {videoResult.filename ? (
                            <Text size="sm" c="dimmed">
                              Soubor: {videoResult.filename}
                            </Text>
                          ) : null}
                        </Group>
                      </Stack>
                    ) : null}
                  </Stack>
                </Card>
              ) : null}
            </Stack>
          </Card>
        )}
        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <Text fw={600}>Historie generování</Text>
              <SegmentedControl
                value={historyType}
                onChange={(value) => setHistoryType((value as 'all' | 'text' | 'image' | 'video') ?? 'all')}
                data={historyTypeOptions}
              />
            </Group>
            {historyQuery.isLoading ? (
              <Group justify="center" py="lg">
                <Loader />
              </Group>
            ) : historyEntries.length === 0 ? (
              <Text size="sm" c="dimmed">
                Zatím nemáš žádné generování. Jakmile něco vytvoříš, historie se zobrazí tady.
              </Text>
            ) : (
              <Stack gap="sm">
                {historyEntries.map((entry) => {
                  const imageSizeLabel =
                    entry.type === 'image' && typeof entry.meta?.size === 'string'
                      ? (entry.meta.size as string)
                      : undefined;
                  const sourceImageUrl =
                    entry.type === 'image' && typeof entry.meta?.source_image_url === 'string'
                      ? (entry.meta.source_image_url as string)
                      : undefined;

                  return (
                    <Card key={entry.id} withBorder>
                      <Stack gap="sm">
                      <Group justify="space-between" align="flex-start">
                        <div>
                          <Text fw={600}>{resolveScenarioLabel(entry.type, entry.scenario)}</Text>
                          <Group gap="xs">
                            <Badge variant="light" color={entry.type === 'text' ? 'blue' : 'violet'}>
                              {entry.type === 'text' ? 'Text' : 'Obrázek'}
                            </Badge>
                            <Badge variant="light" color="gray">
                              {entry.scenario}
                            </Badge>
                          </Group>
                        </div>
                        <Text size="sm" c="dimmed">
                          {formatDateTime(entry.created_at)}
                        </Text>
                      </Group>
                      {entry.type === 'text' ? (
                        <>
                          <Textarea readOnly autosize minRows={4} value={entry.content ?? ''} />
                          <Group gap="sm">
                            <CopyButton value={entry.content ?? ''}>
                              {({ copied, copy }) => (
                                <Button
                                  variant="light"
                                  onClick={() => {
                                    if (!entry.content) {
                                      return;
                                    }
                                    copy();
                                  }}
                                  leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                  disabled={!entry.content}
                                >
                                  {copied ? 'Zkopírováno' : 'Kopírovat text'}
                                </Button>
                              )}
                            </CopyButton>
                            <Button
                              component="a"
                              href={entry.url ?? undefined}
                              target={entry.url ? '_blank' : undefined}
                              rel={entry.url ? 'noopener' : undefined}
                              disabled={!entry.url}
                              leftSection={<IconDownload size={16} />}
                            >
                              Stáhnout .md
                            </Button>
                          </Group>
                        </>
                      ) : entry.type === 'image' ? (
                        <>
                          {entry.url ? (
                            sourceImageUrl ? (
                              <Group align="flex-start" gap="lg">
                                <Stack gap={4} style={{ flex: 1 }}>
                                  <Text size="sm" fw={600}>
                                    Zdrojová fotka
                                  </Text>
                                  <Image src={sourceImageUrl} alt="Zdrojová fotka" radius="md" />
                                </Stack>
                                <Stack gap={4} style={{ flex: 1 }}>
                                  <Text size="sm" fw={600}>
                                    Výstup
                                  </Text>
                                  <Image src={entry.url} alt="Vygenerovaný obrázek" radius="md" />
                                </Stack>
                              </Group>
                            ) : (
                              <Image src={entry.url} alt="Vygenerovaný obrázek" radius="md" />
                            )
                          ) : (
                            <Text size="sm" c="dimmed">
                              Obrázek není k dispozici.
                            </Text>
                          )}
                          <Group gap="sm">
                            <Button
                              component="a"
                              href={entry.url ?? undefined}
                              target={entry.url ? '_blank' : undefined}
                              rel={entry.url ? 'noopener' : undefined}
                              disabled={!entry.url}
                              leftSection={<IconDownload size={16} />}
                            >
                              Stáhnout PNG
                            </Button>
                            {imageSizeLabel ? (
                              <Badge variant="light" color="gray">
                                {imageSizeLabel}
                              </Badge>
                            ) : null}
                          </Group>
                        </>
                      ) : (
                        <>
                          {entry.url ? (
                            <video controls src={entry.url} style={{ width: '100%', borderRadius: 12 }} />
                          ) : (
                            <Text size="sm" c="dimmed">
                              Video není k dispozici.
                            </Text>
                          )}
                          <Group gap="sm">
                            <Button
                              component="a"
                              href={entry.url ?? undefined}
                              target={entry.url ? '_blank' : undefined}
                              rel={entry.url ? 'noopener' : undefined}
                              disabled={!entry.url}
                              leftSection={<IconDownload size={16} />}
                            >
                              Stáhnout MP4
                            </Button>
                            {typeof entry.meta?.status === 'string' ? (
                              <Badge variant="light" color={entry.meta.status === 'completed' ? 'teal' : 'gray'}>
                                {entry.meta.status}
                              </Badge>
                            ) : null}
                          </Group>
                        </>
                      )}
                    </Stack>
                  </Card>
                );
                })}
              </Stack>
            )}
            {historyMeta && historyMeta.last_page > 1 ? (
              <Pagination value={historyPage} onChange={setHistoryPage} total={historyMeta.last_page} />
            ) : null}
          </Stack>
        </Card>

        <Alert color="gray" variant="light" icon={<IconInfoCircle size={18} />}>
          Výstupy ukládáme do <code>/storage/ai/content</code>. Kdykoli potřebuješ soubor znovu, otevři URL nebo najdi
          ho ve storage.
        </Alert>
        <ProductPickerModal
          opened={isPickerOpen}
          onClose={pickerHandlers.close}
          onSelect={(variant) => {
            setSelectedVariant(variant);
            setSelectedReferenceImageUrls([]);
            setSelectedEditImageUrl(null);
            pickerHandlers.close();
          }}
        />
        <MaskEditorModal
          opened={maskModalOpened}
          imageUrl={selectedEditImageUrl}
          onClose={() => setMaskModalOpened(false)}
          onSave={handleMaskSave}
        />
        <VideoCropModal
          opened={videoCropModalOpened}
          file={videoCropSourceFile}
          videoSize={videoForm.size}
          onClose={() => {
            setVideoCropModalOpened(false);
            setVideoCropSourceFile(null);
          }}
          onConfirm={handleVideoCropConfirm}
        />
      </Stack>
    </SectionPageShell>
  );
};
