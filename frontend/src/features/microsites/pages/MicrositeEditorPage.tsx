import {
  Accordion,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Image,
  Loader,
  Modal,
  NumberInput,
  Stack,
  Switch,
  Tabs,
  TagsInput,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconExternalLink,
  IconPlayerPlay,
  IconPlus,
  IconSparkles,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SectionPageShell } from '../../../components/layout/SectionPageShell';
import {
  useMicrosite,
  useUpdateMicrosite,
  usePublishMicrosite,
  useUnpublishMicrosite,
  useExportMicrosite,
  usePreviewMicrositeProduct,
  useGenerateMicrositeAi,
} from '../hooks/useMicrosites';
import type {
  Microsite,
  MicrositeAiBlueprint,
  MicrositeProductOverlay,
  MicrositeProductPayload,
} from '../../../api/microsites';
import type { InventoryVariant } from '../../../api/inventory';
import { ProductPickerModal } from '../components/ProductPickerModal';
import { MicrositeBuilderCanvas } from '../components/MicrositeBuilderCanvas';
import { ImageUploadInput } from '../components/ImageUploadInput';
import { ThemeEditor } from '../components/ThemeEditor';
import { SectionsEditor } from '../components/SectionsEditor';
import { HeaderEditor } from '../components/HeaderEditor';
import { FooterEditor } from '../components/FooterEditor';
import type { BuilderValue, FooterSettings, HeaderNavigationItem, HeaderSettings, MicrositeSection, ThemeSettings } from '../types';
import { DEFAULT_FOOTER, DEFAULT_HEADER, DEFAULT_THEME, createDefaultSection, createNavId, createSectionId } from '../types';
import { MicrositePreview } from '../components/MicrositePreview';
import {
  applyOriginalInfoToPayload,
  buildDefaultPayload,
  buildMicrositeOverlay,
  fetchOriginalInfo,
} from '../../products/utils/productEnrichment';

const createEmptyMicrosite = (id: string): Microsite => ({
  id,
  name: 'Microshop',
  slug: 'microshop',
  status: 'draft',
  theme: null,
  hero: {},
  seo: {},
  content_schema: {},
  settings: {},
  published_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  products: [],
});

const extractBuilder = (schema: Record<string, unknown> | null | undefined): BuilderValue | null => {
  if (!schema) return null;
  const builder = schema['builder'];
  if (!builder || typeof builder !== 'object') {
    return null;
  }
  const source = builder as Record<string, unknown>;
  return {
    html: String(source.html ?? ''),
    css: String(source.css ?? ''),
    components: source.components ?? undefined,
    styles: source.styles ?? undefined,
  };
};

const extractTheme = (schema: Record<string, unknown> | null | undefined): ThemeSettings => {
  const incoming = (schema?.['theme'] as ThemeSettings | undefined) ?? undefined;
  return {
    palette: { ...DEFAULT_THEME.palette, ...(incoming?.palette ?? {}) },
    typography: { ...DEFAULT_THEME.typography, ...(incoming?.typography ?? {}) },
  };
};

const extractSections = (schema: Record<string, unknown> | null | undefined): MicrositeSection[] => {
  const sections = schema?.['sections'];
  if (Array.isArray(sections) && sections.length > 0) {
    return sections.map((section) => ({
      ...section,
      id: section.id ?? createSectionId(),
    })) as MicrositeSection[];
  }
  return [createDefaultSection('hero'), createDefaultSection('product-grid'), createDefaultSection('cta')];
};

const normalizeNavigation = (navigation: unknown): HeaderSettings['navigation'] => {
  if (!Array.isArray(navigation)) {
    return DEFAULT_HEADER.navigation;
  }
  return navigation
    .map((item) => ({
      id: (item as HeaderNavigationItem)?.id ?? createNavId(),
      label: typeof item?.label === 'string' ? item.label : 'Odkaz',
      href: typeof item?.href === 'string' ? item.href : '/#kolekce',
    }))
    .filter((item) => item.label.trim() !== '');
};

const extractHeader = (schema: Record<string, unknown> | null | undefined): HeaderSettings => {
  const incoming = (schema?.['header'] as HeaderSettings | undefined) ?? undefined;
  if (!incoming) {
    return DEFAULT_HEADER;
  }
  return {
    title: incoming.title ?? DEFAULT_HEADER.title,
    subtitle: incoming.subtitle ?? DEFAULT_HEADER.subtitle,
    showPublishedBadge: incoming.showPublishedBadge ?? DEFAULT_HEADER.showPublishedBadge,
    visible: incoming.visible ?? DEFAULT_HEADER.visible ?? true,
    navigation: normalizeNavigation(incoming.navigation),
    cta: incoming.cta ?? null,
  };
};

const extractFooter = (schema: Record<string, unknown> | null | undefined): FooterSettings => {
  const incoming = (schema?.['footer'] as FooterSettings | undefined) ?? undefined;
  if (!incoming) {
    return DEFAULT_FOOTER;
  }
  return {
    aboutTitle: incoming.aboutTitle ?? DEFAULT_FOOTER.aboutTitle,
    aboutText: incoming.aboutText ?? DEFAULT_FOOTER.aboutText,
    contactTitle: incoming.contactTitle ?? DEFAULT_FOOTER.contactTitle,
    visible: incoming.visible ?? DEFAULT_FOOTER.visible ?? true,
    contactItems:
      incoming.contactItems?.map((item) => ({
        id: item.id ?? createNavId(),
        label: item.label ?? 'Kontakt',
        value: item.value ?? '',
      })) ?? DEFAULT_FOOTER.contactItems,
    links:
      incoming.links?.map((link) => ({
        id: link.id ?? createNavId(),
        label: link.label ?? 'Odkaz',
        href: link.href ?? '/#kolekce',
      })) ?? DEFAULT_FOOTER.links,
  };
};

const extractProductImage = (product: MicrositeProductPayload): string | undefined => {
  const overlay = (product.overlay ?? undefined) as MicrositeProductOverlay | undefined;
  const overlayGallery: string[] = Array.isArray(overlay?.gallery) ? (overlay.gallery ?? []) : [];
  const overlayImage = typeof overlay?.image_url === 'string' ? overlay.image_url.trim() : '';

  if (overlayImage) {
    return overlayImage;
  }

  const galleryCandidate = overlayGallery.find((entry) => typeof entry === 'string' && entry.trim() !== '');
  if (galleryCandidate) {
    return galleryCandidate.trim();
  }

  if (typeof product.image_url === 'string' && product.image_url.trim() !== '') {
    return product.image_url.trim();
  }

  const snapshot = (product.snapshot ?? {}) as Record<string, unknown>;
  const images = (snapshot['images'] as Array<Record<string, unknown>>) ?? [];
  const firstImage = images.find((image) => typeof image?.['url'] === 'string');
  return typeof firstImage?.['url'] === 'string' ? (firstImage['url'] as string) : undefined;
};

const pruneOverlayObject = (input: Record<string, unknown> | null | undefined): Record<string, unknown> | undefined => {
  if (!input) {
    return undefined;
  }

  const result: Record<string, unknown> = {};

  Object.entries(input).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') {
        return;
      }
      result[key] = trimmed;
      return;
    }

    if (Array.isArray(value)) {
      const normalized = value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : entry))
        .filter((entry) => {
          if (typeof entry === 'string') {
            return entry !== '';
          }
          return entry !== undefined && entry !== null;
        });

      if (normalized.length === 0) {
        return;
      }

      result[key] = normalized;
      return;
    }

    if (typeof value === 'object') {
      const nested = pruneOverlayObject(value as Record<string, unknown>);
      if (nested && Object.keys(nested).length > 0) {
        result[key] = nested;
      }
      return;
    }

    result[key] = value;
  });

  return Object.keys(result).length ? result : undefined;
};

const normalizeGalleryInput = (value: string): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
};

export const MicrositeEditorPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useMicrosite(id);
  const fallbackMicrosite = useMemo(() => (id ? createEmptyMicrosite(id) : null), [id]);
  const microsite = data ?? fallbackMicrosite;
  const updateMutation = useUpdateMicrosite();
  const publishMutation = usePublishMicrosite();
  const unpublishMutation = useUnpublishMicrosite();
  const exportMutation = useExportMicrosite();
  const previewProduct = usePreviewMicrositeProduct();
  const generateAiBlueprint = useGenerateMicrositeAi();
  const [isPickerOpen, pickerHandlers] = useDisclosure(false);
  const [isAiModalOpen, aiModalHandlers] = useDisclosure(false);
  const [local, setLocal] = useState<Partial<Microsite>>({});
  const [products, setProducts] = useState<MicrositeProductPayload[]>(microsite?.products ?? []);
  const [builderValue, setBuilderValue] = useState<BuilderValue | null>(
    extractBuilder((microsite?.content_schema as Record<string, unknown> | null))
  );
  const [themeValue, setThemeValue] = useState<ThemeSettings>(
    extractTheme((microsite?.content_schema as Record<string, unknown> | null))
  );
  const [sectionsValue, setSectionsValue] = useState<MicrositeSection[]>(
    extractSections((microsite?.content_schema as Record<string, unknown> | null))
  );
  const [headerValue, setHeaderValue] = useState<HeaderSettings>(
    extractHeader((microsite?.content_schema as Record<string, unknown> | null))
  );
  const [footerValue, setFooterValue] = useState<FooterSettings>(
    extractFooter((microsite?.content_schema as Record<string, unknown> | null))
  );
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [aiBrief, setAiBrief] = useState('');
  const [aiTone, setAiTone] = useState('Luxusní concierge tón s důrazem na řemeslo a VIP servis');
  const [aiAudience, setAiAudience] = useState('');
  const [aiVisualKeywords, setAiVisualKeywords] = useState<string[]>([]);
  const [aiImagePrompts, setAiImagePrompts] = useState<string[]>([]);

  const handleTabChange = useCallback((value: string | null) => {
    if (value) {
      setActiveTab(value);
    }
  }, []);


  const merged = useMemo(() => ({ ...microsite, ...local, products }), [microsite, local, products]);
  const settingsRecord = useMemo(() => (merged.settings ?? {}) as Record<string, unknown>, [merged.settings]);
  const checkoutSettings = useMemo(
    () => (settingsRecord['checkout'] as Record<string, unknown> | undefined) ?? undefined,
    [settingsRecord]
  );
  const defaultCurrency = useMemo(
    () => (settingsRecord['default_currency'] as string | undefined) ?? 'CZK',
    [settingsRecord]
  );
  const defaultCtaLink = useMemo(
    () => (checkoutSettings?.['default_link'] as string | undefined) ?? undefined,
    [checkoutSettings]
  );
  const sourceShopId = useMemo(
    () => settingsRecord['source_shop_id'] as number | undefined,
    [settingsRecord]
  );
  const publicationMeta = useMemo(
    () => (settingsRecord['publication'] as Record<string, unknown> | undefined) ?? undefined,
    [settingsRecord]
  );

  useEffect(() => {
    const sourceSchema = (data?.content_schema as Record<string, unknown> | null) ?? null;
    if (data) {
      setBuilderValue(extractBuilder(sourceSchema));
      setThemeValue(extractTheme(sourceSchema));
      setSectionsValue(extractSections(sourceSchema));
      setProducts(data.products ?? []);
      setHeaderValue(extractHeader(sourceSchema));
      setFooterValue(extractFooter(sourceSchema));
      return;
    }

    if (fallbackMicrosite) {
      setBuilderValue(extractBuilder((fallbackMicrosite.content_schema as Record<string, unknown> | null)));
      setThemeValue(extractTheme((fallbackMicrosite.content_schema as Record<string, unknown> | null)));
      setSectionsValue(extractSections((fallbackMicrosite.content_schema as Record<string, unknown> | null)));
      setProducts(fallbackMicrosite.products ?? []);
      setHeaderValue(extractHeader((fallbackMicrosite.content_schema as Record<string, unknown> | null)));
      setFooterValue(extractFooter((fallbackMicrosite.content_schema as Record<string, unknown> | null)));
    }
  }, [data, fallbackMicrosite]);
  const publicUrl = useMemo(
    () => (merged.public_url as string | undefined) ?? (publicationMeta?.['url'] as string | undefined) ?? null,
    [merged.public_url, publicationMeta]
  );
  const publicationGeneratedAt = useMemo(
    () => publicationMeta?.['generated_at'] as string | undefined,
    [publicationMeta]
  );
  const handleFieldChange = useCallback((key: keyof Microsite, value: unknown) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    setLocal({});
  }, [microsite?.id]);

  const updateProduct = useCallback((index: number, patch: Partial<MicrositeProductPayload>) => {
    setProducts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }, []);

  const updateProductOverlay = useCallback((index: number, patch: Partial<MicrositeProductOverlay>) => {
    setProducts((prev) => {
      const next = [...prev];
      const current = (next[index]?.overlay ?? {}) as MicrositeProductOverlay;
      const merged = pruneOverlayObject({ ...current, ...patch } as Record<string, unknown>);
      next[index] = {
        ...next[index],
        overlay: (merged as MicrositeProductOverlay | undefined) ?? null,
      };
      return next;
    });
  }, []);

  const applyAiBlueprint = useCallback(
    (blueprint: MicrositeAiBlueprint) => {
      const schema: Record<string, unknown> = {
        theme: blueprint.theme,
        sections: blueprint.sections,
        header: blueprint.header,
        footer: blueprint.footer,
      };

      setThemeValue(extractTheme(schema));
      setSectionsValue(extractSections(schema));
      setHeaderValue(extractHeader(schema));
      setFooterValue(extractFooter(schema));

      const prompts = (blueprint.image_prompts ?? []).filter(
        (prompt): prompt is string => typeof prompt === 'string' && prompt.trim() !== ''
      );
      setAiImagePrompts(prompts);
    },
    []
  );

  const removeProduct = useCallback((index: number) => {
    setProducts((prev) =>
      prev
        .filter((_, position) => position !== index)
        .map((product, position) => ({
          ...product,
          position,
        }))
    );
  }, []);

  const handleBuilderChange = useCallback((value: BuilderValue) => {
    setBuilderValue(value);
  }, []);

  const handleAddVariant = useCallback(
    async (variant: InventoryVariant) => {
      if (products.some((product) => product.product_variant_id === variant.id || product.product_code === variant.code)) {
        notifications.show({
          message: 'Tento produkt už ve výběru máš.',
          color: 'yellow',
        });
        return;
      }

      try {
        const { snapshot } = await previewProduct.mutateAsync({
          variant_id: variant.id,
          shop_id: sourceShopId,
        });

        const basePayload = buildDefaultPayload(variant, snapshot ?? undefined);
        const originalInfo = await fetchOriginalInfo(basePayload.buy_button?.variant_code ?? variant.code ?? null);
        const enrichedPayload = applyOriginalInfoToPayload(basePayload, originalInfo);
        const overlayDetails = buildMicrositeOverlay(variant, snapshot ?? undefined, {
          defaultCtaUrl: defaultCtaLink ?? undefined,
          defaultCtaLabel: 'Koupit',
          widgetPayload: enrichedPayload,
        });

        setProducts((prev) => [
          ...prev,
          {
            product_variant_id: variant.id,
            product_code: variant.code,
            position: prev.length,
            custom_label:
              overlayDetails.overlay.title ??
              variant.name ??
              (snapshot?.name as string | undefined) ??
              variant.code ??
              `Produkt ${prev.length + 1}`,
            custom_description:
              overlayDetails.overlay.description ?? (snapshot?.description as string | undefined) ?? undefined,
            custom_price:
              overlayDetails.overlay.price?.current_value ??
              (typeof variant.price === 'number'
                ? Number(variant.price)
                : typeof snapshot?.price === 'number'
                ? Number(snapshot.price)
                : null),
            custom_currency:
              overlayDetails.overlay.price?.currency ??
              (variant.currency_code as string | undefined) ??
              (snapshot?.currency as string | undefined) ??
              defaultCurrency,
            cta_text: overlayDetails.overlay.cta?.label ?? 'Koupit',
            cta_url: overlayDetails.overlay.cta?.href ?? defaultCtaLink,
            image_url:
              overlayDetails.overlay.image_url ??
              (overlayDetails.overlay.gallery && overlayDetails.overlay.gallery[0]) ??
              undefined,
            tags: overlayDetails.tags.length ? overlayDetails.tags : [],
            metadata: overlayDetails.metadata,
            overlay: overlayDetails.overlay,
            visible: true,
            snapshot: snapshot ?? undefined,
          },
        ]);

        notifications.show({
          message: `${variant.name ?? variant.code} přidán do microshopu.`,
          color: 'green',
        });
      } catch (error) {
        console.error(error);
        notifications.show({
          message: 'Nepodařilo se načíst detail produktu.',
          color: 'red',
        });
      }
    },
    [defaultCurrency, defaultCtaLink, previewProduct, products, sourceShopId]
  );

  const handleSave = async () => {
    if (!microsite) return;

    try {
      const existingSchema = ((microsite.content_schema ?? {}) as Record<string, unknown>) ?? {};
      const localSchema = (local.content_schema as Record<string, unknown> | undefined) ?? {};
      const schema: Record<string, unknown> = { ...existingSchema, ...localSchema };

      const hasBuilderContent = Boolean(builderValue && builderValue.html && builderValue.html.trim().length > 0);

      if (hasBuilderContent && builderValue) {
        schema.builder = builderValue;
      } else {
        delete schema.builder;
      }

      if (themeValue) {
        schema.theme = themeValue;
      }

      if (sectionsValue && sectionsValue.length > 0) {
        schema.sections = sectionsValue;
      } else {
        delete schema.sections;
      }

      if (headerValue) {
        schema.header = headerValue;
      }

      if (footerValue) {
        schema.footer = footerValue;
      }

      Object.keys(schema).forEach((key) => {
        if (schema[key] === undefined) {
          delete schema[key];
        }
      });

      const normalizedSchema = Object.keys(schema).length > 0 ? schema : null;

      const payload = {
        name: merged.name ?? microsite.name ?? 'Microshop',
        slug: merged.slug ?? microsite.slug ?? '',
        status: merged.status ?? microsite.status ?? 'draft',
        seo: merged.seo ?? null,
        settings: merged.settings ?? null,
        content_schema: normalizedSchema,
        products,
      } satisfies Partial<Microsite> & { products: MicrositeProductPayload[] };

      await updateMutation.mutateAsync({ id: microsite.id, payload });
      notifications.show({ message: 'Microshop byl uložen.', color: 'green' });
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Uložení microshopu selhalo.', color: 'red' });
    }
  };

  const handlePublish = async () => {
    if (!microsite) return;

    try {
      await publishMutation.mutateAsync(microsite.id);
      notifications.show({ message: 'Publikace byla naplánována.', color: 'green' });
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Publikace selhala.', color: 'red' });
    }
  };

  const handleUnpublish = async () => {
    if (!microsite) return;

    try {
      await unpublishMutation.mutateAsync(microsite.id);
      notifications.show({ message: 'Microshop byl odpublikován.', color: 'green' });
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Akce selhala.', color: 'red' });
    }
  };

  const handleExport = async () => {
    if (!microsite) return;

    try {
      await exportMutation.mutateAsync(microsite.id);
      notifications.show({ message: 'Export byl naplánován.', color: 'green' });
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Export selhal.', color: 'red' });
    }
  };

  const handleAiGenerate = async () => {
    const brief = aiBrief.trim();

    if (brief.length < 20) {
      notifications.show({ message: 'Popiš prosím zadání alespoň ve dvou větách.', color: 'yellow' });
      return;
    }

    const keywords = aiVisualKeywords.map((keyword) => keyword.trim()).filter((keyword) => keyword !== '');

    try {
      const blueprint = await generateAiBlueprint.mutateAsync({
        brief,
        tone: aiTone.trim() || undefined,
        audience: aiAudience.trim() || undefined,
        visual_keywords: keywords.length ? keywords : undefined,
      });

      applyAiBlueprint(blueprint);
      notifications.show({ message: 'AI návrh byl vložen do editoru.', color: 'teal' });
      aiModalHandlers.close();
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'AI generování se nezdařilo.';
      notifications.show({ message, color: 'red' });
    }
  };

  if (!id) {
    return (
      <SectionPageShell section="microsites" title="Microshopy">
        <Text>Nepodařilo se načíst microshop.</Text>
      </SectionPageShell>
    );
  }

  if (isLoading && !microsite) {
    return (
      <SectionPageShell section="microsites" title="Microshop">
        <Loader />
      </SectionPageShell>
    );
  }

  if (!microsite) {
    return (
      <SectionPageShell section="microsites" title="Microshop">
        <Text c="red">Microshop se nepodařilo načíst.</Text>
      </SectionPageShell>
    );
  }

  return (
    <SectionPageShell
      section="microsites"
      title={merged.name ?? 'Microshop'}
      description="Uprav obsah, produkty a publikaci microshopu."
      actions={
        <Group gap="xs">
          <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate(-1)}>
            Zpět
          </Button>
          {publicUrl ? (
            <Button
              variant="default"
              leftSection={<IconExternalLink size={16} />}
              component="a"
              href={publicUrl}
              target="_blank"
              rel="noopener"
            >
              Otevřít microshop
            </Button>
          ) : null}
          {microsite.status === 'published' ? (
            <Button
              variant="light"
              color="yellow"
              leftSection={<IconX size={16} />}
              onClick={handleUnpublish}
              loading={unpublishMutation.isPending}
            >
              Odpublikovat
            </Button>
          ) : (
            <Button
              variant="light"
              color="teal"
              leftSection={<IconPlayerPlay size={16} />}
              onClick={handlePublish}
              loading={publishMutation.isPending}
            >
              Publikovat
            </Button>
          )}
          <Button variant="light" onClick={handleExport} loading={exportMutation.isPending}>
            Export
          </Button>
          <Button leftSection={<IconDeviceFloppy size={16} />} onClick={handleSave} loading={updateMutation.isPending}>
            Uložit
          </Button>
        </Group>
      }
    >
      <Tabs value={activeTab} onChange={handleTabChange} keepMounted={false}>
        <Tabs.List mb="xl">
          <Tabs.Tab value="overview">Přehled</Tabs.Tab>
          <Tabs.Tab value="appearance">Obsah &amp; vzhled</Tabs.Tab>
          <Tabs.Tab value="products">Produkty</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview">
          <Stack gap="xl">
            <Card withBorder>
              <Stack gap="md">
                <Group gap="md" align="flex-end">
                  <TextInput
                    label="Název"
                    value={merged.name ?? ''}
                    onChange={(event) => handleFieldChange('name', event.currentTarget.value)}
                    style={{ flex: 1 }}
                  />
                  <TextInput
                    label="Slug"
                    value={merged.slug ?? ''}
                    onChange={(event) => handleFieldChange('slug', event.currentTarget.value)}
                    style={{ width: 280 }}
                  />
                </Group>
                <Textarea
                  label="Meta popis"
                  minRows={2}
                  value={(merged.seo?.description as string) ?? ''}
                  onChange={(event) => {
                    const seo = { ...(merged.seo ?? {}), description: event.currentTarget.value };
                    handleFieldChange('seo', seo);
                  }}
                />
                <Stack gap={4}>
                  <Group gap="sm" align="center">
                    <Text size="sm" c="dimmed">
                      Stav:
                    </Text>
                    <Badge
                      color={microsite.status === 'published' ? 'teal' : microsite.status === 'archived' ? 'gray' : 'blue'}
                    >
                      {microsite.status === 'published'
                        ? 'Publikováno'
                        : microsite.status === 'archived'
                        ? 'Archivováno'
                        : 'Draft'}
                    </Badge>
                  </Group>
                  {publicUrl ? (
                    <Group gap="xs" wrap="wrap">
                      <Text size="sm" c="dimmed">
                        Veřejný odkaz:
                      </Text>
                      <Anchor size="sm" href={publicUrl} target="_blank" rel="noopener">
                        {publicUrl}
                      </Anchor>
                      {publicationGeneratedAt ? (
                        <Text size="sm" c="dimmed">
                          Publikováno {new Date(publicationGeneratedAt).toLocaleString('cs-CZ')}
                        </Text>
                      ) : null}
                    </Group>
                  ) : (
                    <Text size="sm" c="dimmed">
                      Microshop zatím není zveřejněný.
                    </Text>
                  )}
                </Stack>
              </Stack>
            </Card>

            <Stack gap="md">
              <Text fw={600}>Náhled microshopu</Text>
              <MicrositePreview builder={builderValue} products={products} theme={themeValue} sections={sectionsValue} />
            </Stack>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="appearance">
          <Stack gap="xl">
            <Card withBorder>
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                  <div style={{ flex: 1 }}>
                    <Text fw={600}>Generovat pomocí AI</Text>
                    <Text size="sm" c="dimmed">
                      Napiš zadání, které popisuje vůně, vizuální směr i cílové publikum. AI navrhne barvy, texty i
                      sekce microsite – výsledek můžeš dál upravit ručně.
                    </Text>
                  </div>
                  <Button
                    leftSection={<IconSparkles size={16} />}
                    variant="light"
                    onClick={aiModalHandlers.open}
                    loading={generateAiBlueprint.isPending}
                  >
                    Generovat s AI
                  </Button>
                </Group>
                {aiImagePrompts.length ? (
                  <Alert variant="light" color="violet" title="Tipy na vizuály">
                    <Stack gap={4}>
                      {aiImagePrompts.map((prompt, index) => (
                        <Text key={`${prompt}-${index}`} size="sm">
                          {prompt}
                        </Text>
                      ))}
                    </Stack>
                  </Alert>
                ) : null}
              </Stack>
            </Card>
            <Accordion
              multiple
              defaultValue={['builder', 'theme', 'header', 'sections', 'footer']}
              variant="separated"
              radius="md"
            >
              <Accordion.Item value="builder">
                <Accordion.Control>Editor bloků</Accordion.Control>
                <Accordion.Panel>
                  <Card withBorder>
                    <Stack gap="md">
                      <Text fw={600}>Builder vzhledu</Text>
                      <MicrositeBuilderCanvas value={builderValue} onChange={handleBuilderChange} />
                    </Stack>
                  </Card>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="theme">
                <Accordion.Control>Barvy &amp; typografie</Accordion.Control>
                <Accordion.Panel>
                  <ThemeEditor value={themeValue} onChange={setThemeValue} />
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="header">
                <Accordion.Control>Hlavička microsite</Accordion.Control>
                <Accordion.Panel>
                  <HeaderEditor value={headerValue} onChange={setHeaderValue} />
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="sections">
                <Accordion.Control>Sekce obsahu</Accordion.Control>
                <Accordion.Panel>
                  <Card withBorder>
                    <SectionsEditor sections={sectionsValue} onChange={setSectionsValue} />
                  </Card>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="footer">
                <Accordion.Control>Patička</Accordion.Control>
                <Accordion.Panel>
                  <FooterEditor value={footerValue} onChange={setFooterValue} />
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="products">
          <Card withBorder>
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Text fw={600}>Produkty</Text>
                <Group gap="xs">
                  {previewProduct.isPending ? (
                    <Group gap={6} align="center">
                      <Loader size="sm" />
                      <Text size="sm" c="dimmed">
                        Načítám produkt…
                      </Text>
                    </Group>
                  ) : null}
                  <Button variant="light" leftSection={<IconPlus size={16} />} onClick={pickerHandlers.open}>
                    Přidat produkt
                  </Button>
                </Group>
              </Group>
              {products.length === 0 ? (
                <Text c="dimmed">Zatím žádné produkty. Přidej první přes tlačítko nahoře.</Text>
              ) : (
                <Stack gap="sm">
                  {products.map((product, index) => {
                    const positionValue = typeof product.position === 'number' ? product.position : index;
                    const snapshot = (product.snapshot as Record<string, unknown> | undefined) ?? undefined;
                    const fallbackPrice =
                      typeof snapshot?.['price'] === 'number' ? (snapshot['price'] as number) : null;
                    const fallbackCurrency = (snapshot?.['currency'] as string | undefined) ?? defaultCurrency;
                    const productImage = extractProductImage(product);

                    return (
                      <Card key={`${product.product_variant_id ?? product.product_code ?? index}`} withBorder padding="md">
                        <Stack gap="md">
                          <Group align="flex-start" gap="md" wrap="nowrap">
                            {productImage ? (
                              <Image
                                src={productImage}
                                alt={product.custom_label ?? 'Produkt'}
                                width={120}
                                height={120}
                                radius="md"
                                fit="cover"
                              />
                            ) : (
                              <Card
                                withBorder
                                padding="md"
                                radius="md"
                                style={{
                                  width: 120,
                                  height: 120,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Text size="sm" c="dimmed" ta="center">
                                  Bez obrázku
                                </Text>
                              </Card>
                            )}

                            <Stack gap="md" style={{ flex: 1 }}>
                              <Stack gap="xs">
                                <TextInput
                                  label="Zobrazený název"
                                  placeholder={(snapshot?.['name'] as string | undefined) ?? 'Název produktu na kartě'}
                                  value={product.custom_label ?? ''}
                                  onChange={(event) => {
                                    const value = event.currentTarget.value;
                                    updateProduct(index, { custom_label: value || undefined });
                                    updateProductOverlay(index, { title: value || undefined });
                                  }}
                                />
                                <Group gap={8}>
                                  <Badge color="blue" variant="light">
                                    {product.product_code ?? 'manuální položka'}
                                  </Badge>
                                  {typeof product.product_variant_id === 'string' ? (
                                    <Badge color="violet" variant="light">
                                      {product.product_variant_id}
                                    </Badge>
                                  ) : null}
                                  <Badge color="gray" variant="light">
                                    Pozice {positionValue + 1}
                                  </Badge>
                                </Group>
                              </Stack>
                              <Group gap="xs" align="center">
                                <Switch
                                  label="Zobrazit v microshopu"
                                  checked={product.visible ?? true}
                                  onChange={(event) => updateProduct(index, { visible: event.currentTarget.checked })}
                                />
                                <Switch
                                  label="Aktivní"
                                  checked={product.active ?? true}
                                  onChange={(event) => updateProduct(index, { active: event.currentTarget.checked })}
                                />
                              </Group>
                              <Group gap="xs" wrap="wrap">
                                <Button
                                  variant="subtle"
                                  size="xs"
                                  onClick={() => {
                                    if (index === 0) {
                                      return;
                                    }
                                    setProducts((prev) => {
                                      const next = [...prev];
                                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                      return next.map((item, pos) => ({ ...item, position: pos }));
                                    });
                                  }}
                                >
                                  Nahoru
                                </Button>
                                <Button
                                  variant="subtle"
                                  size="xs"
                                  onClick={() => {
                                    if (index === products.length - 1) {
                                      return;
                                    }
                                    setProducts((prev) => {
                                      const next = [...prev];
                                      [next[index + 1], next[index]] = [next[index], next[index + 1]];
                                      return next.map((item, pos) => ({ ...item, position: pos }));
                                    });
                                  }}
                                >
                                  Dolů
                                </Button>
                                <Button
                                  variant="subtle"
                                  color="red"
                                  leftSection={<IconTrash size={14} />}
                                  onClick={() => removeProduct(index)}
                                >
                                  Odebrat
                                </Button>
                              </Group>
                            </Stack>
                          </Group>

                          <Textarea
                            label="Popisek"
                            minRows={2}
                            placeholder={(snapshot?.['description'] as string | undefined) ?? 'Krátký popis produktu'}
                            value={product.custom_description ?? ''}
                            onChange={(event) => {
                              const value = event.currentTarget.value;
                              updateProduct(index, { custom_description: value || undefined });
                              updateProductOverlay(index, { description: value || undefined });
                            }}
                          />
                          <Group gap="md" align="flex-end">
                            <NumberInput
                              label="Cena"
                              value={product.custom_price ?? ''}
                              placeholder={fallbackPrice != null ? fallbackPrice.toString() : undefined}
                              onChange={(value) => {
                                if (value === '' || value === null) {
                                  updateProduct(index, { custom_price: null });
                                  updateProductOverlay(index, {
                                    price: {
                                      ...(product.overlay?.price ?? {}),
                                      current_value: undefined,
                                    },
                                  });
                                  return;
                                }

                                if (typeof value === 'number' && Number.isFinite(value)) {
                                  updateProduct(index, { custom_price: value });
                                  updateProductOverlay(index, {
                                    price: {
                                      ...(product.overlay?.price ?? {}),
                                      current_value: value,
                                      currency:
                                        product.overlay?.price?.currency ?? product.custom_currency ?? fallbackCurrency ?? 'CZK',
                                    },
                                  });
                                }
                              }}
                              min={0}
                              thousandSeparator=" "
                            />
                            <TextInput
                              label="Měna"
                              value={product.custom_currency ?? fallbackCurrency ?? 'CZK'}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                updateProduct(index, { custom_currency: value || undefined });
                                updateProductOverlay(index, {
                                  price: {
                                    ...(product.overlay?.price ?? {}),
                                    currency: value || undefined,
                                  },
                                });
                              }}
                              style={{ width: 100 }}
                            />
                            <TextInput
                              label="CTA text"
                              placeholder="Např. Koupit hned"
                              value={product.overlay?.cta?.label ?? product.cta_text ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                updateProduct(index, { cta_text: value || undefined });
                                updateProductOverlay(index, {
                                  cta: {
                                    ...(product.overlay?.cta ?? {}),
                                    label: value || undefined,
                                  },
                                });
                              }}
                            />
                            <TextInput
                              label="CTA URL"
                              placeholder={defaultCtaLink ?? 'https://…'}
                              value={product.overlay?.cta?.href ?? product.cta_url ?? ''}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                updateProduct(index, { cta_url: value || undefined });
                                updateProductOverlay(index, {
                                  cta: {
                                    ...(product.overlay?.cta ?? {}),
                                    href: value || undefined,
                                  },
                                });
                              }}
                              style={{ flex: 1 }}
                            />
                          </Group>
                          <Group gap="md" align="flex-end">
                            <TextInput
                              label="Podtitulek / eyebrow"
                              placeholder="Např. Signature kolekce"
                              value={product.overlay?.subtitle ?? ''}
                              onChange={(event) =>
                                updateProductOverlay(index, { subtitle: event.currentTarget.value || undefined })
                              }
                            />
                            <TextInput
                              label="Custom badge"
                              placeholder="Např. Limitovaná edice"
                              value={product.overlay?.badge ?? ''}
                              onChange={(event) =>
                                updateProductOverlay(index, { badge: event.currentTarget.value || undefined })
                              }
                            />
                          </Group>
                          <Group gap="md" align="flex-end">
                            <TextInput
                              label="Externí detail URL"
                              placeholder="https://shop.cz/produkt"
                              value={product.overlay?.detail_url ?? ''}
                              onChange={(event) =>
                                updateProductOverlay(index, { detail_url: event.currentTarget.value || undefined })
                              }
                              style={{ flex: 1 }}
                            />
                          </Group>
                          <ImageUploadInput
                            label="Obrázek produktu"
                            description="Nahraj vlastní obrázek nebo vlož URL z CDN."
                            value={product.overlay?.image_url ?? product.image_url ?? ''}
                            onChange={(next) => {
                              updateProduct(index, { image_url: next || undefined });
                              updateProductOverlay(index, { image_url: next || undefined });
                            }}
                          />
                          <Textarea
                            label="Galerie (URL oddělené řádky)"
                            minRows={2}
                            placeholder="https://cdn…"
                            value={(product.overlay?.gallery ?? []).join('\n')}
                            onChange={(event) => {
                              const entries = normalizeGalleryInput(event.currentTarget.value);
                              updateProductOverlay(index, { gallery: entries.length ? entries : undefined });
                            }}
                          />
                        </Stack>
                      </Card>
                    );
                  })}
                </Stack>
              )}
            </Stack>
          </Card>
        </Tabs.Panel>
      </Tabs>
      <Modal
        opened={isAiModalOpen}
        onClose={generateAiBlueprint.isPending ? () => {} : aiModalHandlers.close}
        title="Generovat microsite pomocí AI"
        size="lg"
        closeOnClickOutside={!generateAiBlueprint.isPending}
        closeOnEscape={!generateAiBlueprint.isPending}
        withCloseButton={!generateAiBlueprint.isPending}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleAiGenerate();
          }}
        >
          <Stack gap="md">
            <Textarea
              label="Zadání"
              description="Shrň tonality, vůně, kolekce, klíčová sdělení i případné produkty."
              minRows={4}
              required
              value={aiBrief}
              onChange={(event) => setAiBrief(event.currentTarget.value)}
            />
            <TextInput
              label="Tón komunikace"
              placeholder="Luxusní concierge, poetické podání, futuristická elegance…"
              value={aiTone}
              onChange={(event) => setAiTone(event.currentTarget.value)}
            />
            <TextInput
              label="Cílové publikum"
              placeholder="VIP klienti, beauty blogerky, zákazníci flagship butiku…"
              value={aiAudience}
              onChange={(event) => setAiAudience(event.currentTarget.value)}
            />
            <TagsInput
              label="Vizuální klíčová slova"
              description="Např. satén, jantar, zlatá mlha, neon, květ plumérie…"
              value={aiVisualKeywords}
              onChange={(next) => setAiVisualKeywords(next.slice(0, 6))}
              placeholder="Přidej klíčové slovo a potvrď Enterem"
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={aiModalHandlers.close} disabled={generateAiBlueprint.isPending}>
                Zrušit
              </Button>
              <Button
                type="submit"
                leftSection={<IconSparkles size={16} />}
                loading={generateAiBlueprint.isPending}
                disabled={aiBrief.trim().length < 20}
              >
                Generovat
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
      <ProductPickerModal opened={isPickerOpen} onClose={pickerHandlers.close} onSelect={handleAddVariant} />
    </SectionPageShell>
  );
};
