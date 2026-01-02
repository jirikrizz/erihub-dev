import {
  Autocomplete,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  ColorInput,
  NumberInput,
  Switch,
  Divider,
  Drawer,
  Group,
  List,
  Loader,
  Modal,
  MultiSelect,
  ScrollArea,
  Select,
  Skeleton,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  TagsInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCopy, IconDownload, IconListDetails, IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import { isAxiosError } from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useFieldArray } from 'react-hook-form';
import { RichTextEditor } from '@mantine/tiptap';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { Node, mergeAttributes } from '@tiptap/core';
import { useGenerateShoptetPlugin } from '../hooks/useShoptetPluginGenerator';
import {
  useDownloadShoptetPluginVersion,
  useShoptetPluginVersion,
  useShoptetPluginVersions,
  useShoptetPlugins,
  useUpdateShoptetPlugin,
  useDeleteShoptetPlugin,
  useShoptetPluginFlags,
  useCreateCountdownPlugin,
  useCreateSnowfallPlugin,
  useCreateAdventCalendarPlugin,
  useCreateAutoWidgetPlugin,
} from '../hooks/useShoptetPlugins';
import {
  usePluginTemplates,
  useCreatePluginTemplate,
  useUpdatePluginTemplate,
  useDeletePluginTemplate,
} from '../hooks/useShoptetPluginTemplates';
import type { ShoptetPluginTemplate } from '../../../api/shoptetPluginTemplates';
import type { ShoptetPluginListItem, AdventCalendarDayPayload } from '../../../api/shoptetPlugins';
import { useShops } from '../../shoptet/hooks/useShops';
import { useProductWidgets } from '../../products/hooks/useProductWidgets';

const EMPTY_PLUGIN_LIST: ShoptetPluginListItem[] = [];
const EMPTY_TEMPLATE_LIST: ShoptetPluginTemplate[] = [];

const defaultValues = {
  shop_id: '',
  name: '',
  goal: '',
  shoptet_surface: '',
  data_sources: '',
  additional_notes: '',
  plugin_type: 'banner',
  language: 'cs',
  brand_primary_color: '#FF6600',
  brand_secondary_color: '#1A1A1A',
  brand_font_family: 'Roboto, sans-serif',
  bundle_key: 'main',
};

type FormValues = typeof defaultValues;

type AdventLocaleDefaults = {
  cardLabel: string;
  countdownPrefix: string;
  countdownComplete: string;
};

const ADVENT_LOCALE_DEFAULTS: Record<string, AdventLocaleDefaults> = {
  cs: {
    cardLabel: 'Adventní okénko',
    countdownPrefix: 'Další překvapení za',
    countdownComplete: 'Další okénko je připraveno!',
  },
  sk: {
    cardLabel: 'Adventné okienko',
    countdownPrefix: 'Ďalšie prekvapenie o',
    countdownComplete: 'Ďalšie okienko je pripravené!',
  },
  ro: {
    cardLabel: 'Fereastra de Advent',
    countdownPrefix: 'Următoarea surpriză în',
    countdownComplete: 'Următoarea fereastră este gata!',
  },
  hu: {
    cardLabel: 'Adventi ablak',
    countdownPrefix: 'Következő meglepetés eddig',
    countdownComplete: 'A következő ablak kész!',
  },
  hr: {
    cardLabel: 'Adventski prozorčić',
    countdownPrefix: 'Sljedeće iznenađenje za',
    countdownComplete: 'Novi prozorčić je spreman!',
  },
  default: {
    cardLabel: 'Advent Window',
    countdownPrefix: 'Next surprise in',
    countdownComplete: 'Next window is ready!',
  },
};

const normalizeAdventLocaleKey = (value?: string | null) => {
  if (!value) {
    return 'cs';
  }
  const key = value.toLowerCase().split('-')[0];
  if (ADVENT_LOCALE_DEFAULTS[key]) {
    return key;
  }
  return key === 'en' ? 'default' : 'cs';
};

const countdownDefaults = {
  shop_id: '',
  name: '',
  flag_code: '',
  message_template: 'Black Friday končí za {{countdown}}',
  finished_text: 'Akce skončila.',
  deadline: '',
  timezone: '',
  accent_color: '#EA580C',
  background_color: '#FFF7ED',
  text_color: '#111827',
  bundle_key: 'main',
};

type CountdownFormValues = typeof countdownDefaults;

const snowfallDefaults = {
  shop_id: '',
  name: 'Vánoční sněžení',
  category_paths: [] as string[],
  bundle_key: 'main',
  flake_color: '#FFFFFF',
  flake_count_desktop: 90,
  flake_count_mobile: 50,
  min_size: 2,
  max_size: 6,
  fall_speed: 1.2,
  sway: 0.6,
  twinkle: true,
};

type SnowfallFormValues = typeof snowfallDefaults;

const autoWidgetDefaults = {
  shop_id: '',
  name: 'Automatický widget',
  widget_id: '',
  page_targets: ['productDetail'] as string[],
  selector: '.p-detail-info',
  placement: 'append' as 'append' | 'before' | 'after' | 'prepend',
  bundle_key: 'main',
  max_attempts: 60,
  poll_interval_ms: 500,
  data_source: 'widget' as 'widget' | 'inventory_recommendations' | 'inventory_similarity',
  recommendation_limit: 6,
  recommendation_mode: '' as '' | 'fragrance' | 'nonfragrance' | 'product',
  plugin_id: '',
  heading: '',
  container_id: '',
};

type AutoWidgetFormValues = typeof autoWidgetDefaults;

const AUTO_WIDGET_PAGE_OPTIONS = [
  { value: 'homepage', label: 'Homepage' },
  { value: 'category', label: 'Kategorie' },
  { value: 'productDetail', label: 'Detail produktu' },
  { value: 'cart', label: 'Košík' },
];

const AUTO_WIDGET_PLACEMENT_OPTIONS = [
  { value: 'before', label: 'Před prvkem' },
  { value: 'after', label: 'Za prvek' },
  { value: 'prepend', label: 'Na začátek prvku' },
  { value: 'append', label: 'Na konec prvku' },
];

type AdventCalendarDayForm = {
  day: number;
  title?: string;
  targets: string[];
  html: string;
};

type AdventCalendarFormValues = {
  shop_id: string;
  name: string;
  start_date: string;
  timezone: string;
  bundle_key: string;
  decor_variant: 'classic' | 'gingerbread' | 'frost';
  enable_snowfall: boolean;
  show_countdown: boolean;
  card_label: string;
  countdown_prefix: string;
  countdown_complete: string;
  overview_targets: string[];
  days: AdventCalendarDayForm[];
};

const buildAdventDefaults = (): AdventCalendarFormValues => {
  const localeDefaults = ADVENT_LOCALE_DEFAULTS.cs;
  const year = new Date().getFullYear();
  return {
    shop_id: '',
    name: 'Adventní kalendář',
    start_date: `${year}-12-01`,
    timezone: 'Europe/Prague',
    bundle_key: 'main',
    decor_variant: 'classic',
    enable_snowfall: false,
    show_countdown: false,
    card_label: localeDefaults.cardLabel,
    countdown_prefix: localeDefaults.countdownPrefix,
    countdown_complete: localeDefaults.countdownComplete,
    overview_targets: [],
    days: Array.from({ length: 24 }, (_, index) => ({
      day: index + 1,
      title: `Den ${index + 1}`,
      targets: [] as string[],
      html: '',
    })),
  };
};

const adventDefaults = buildAdventDefaults();

type TemplateFormValues = {
  name: string;
  plugin_type: 'banner' | 'function';
  description: string;
  goal: string;
  shoptet_surface: string;
  data_sources: string;
  additional_notes: string;
  language: string;
  brand_primary_color: string;
  brand_secondary_color: string;
  brand_font_family: string;
};

const toNullable = (value: string) => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  const successful = document.execCommand('copy');
  document.body.removeChild(textarea);

  return successful;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString();
};

const normalizeBundleKey = (value?: string | null) => {
  if (!value) {
    return 'main';
  }

  const trimmed = value.trim();
  return trimmed === '' ? 'main' : trimmed;
};

const formatBundleOptionLabel = (value: string) => (value === 'main' ? 'main (výchozí)' : value);

type AdventDayContentEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

const CopyButtonNode = Node.create({
  name: 'copyButton',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: false,
  content: 'inline*',
  addAttributes() {
    return {
      copyValue: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-kv-copy') || '',
        renderHTML: () => undefined,
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'button[data-kv-copy]',
        getAttrs: (element) => ({
          copyValue: element.getAttribute('data-kv-copy') || '',
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const { copyValue, ...rest } = HTMLAttributes;
    return [
      'button',
      mergeAttributes(
        { class: 'kv-copy-button', type: 'button', 'data-kv-copy': copyValue || '' },
        rest
      ),
      0,
    ];
  },
});

const escapeHtml = (input: string) =>
  input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sanitizeCopyValue = (rawValue: string) => {
  const trimmed = rawValue.trim();
  if (trimmed === '') {
    return '';
  }
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return trimmed.replace(/<[^>]*>/g, '').trim();
  }
  const doc = new DOMParser().parseFromString(trimmed, 'text/html');
  return doc.body.textContent?.trim() ?? trimmed;
};

const normalizeEditorHtml = (rawValue?: string | null) => {
  const candidate = rawValue ?? '';
  if (candidate === '') {
    return '';
  }
  if (typeof window === 'undefined') {
    return candidate;
  }
  if (!/[&]lt;|[&]gt;|[&]amp;|&#39;|&quot;/.test(candidate)) {
    return candidate;
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(candidate, 'text/html');
  return doc.body.innerHTML;
};

const AdventDayContentEditor = ({ value, onChange }: AdventDayContentEditorProps) => {
  const [isCopying, setIsCopying] = useState(false);
  const [copyButtonLabel, setCopyButtonLabel] = useState('Kopírovat kód');
  const [copyButtonValue, setCopyButtonValue] = useState('');
  const [copyModalOpened, { open: openCopyModal, close: closeCopyModal }] = useDisclosure(false);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      CopyButtonNode,
    ],
    content: normalizeEditorHtml(value),
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getHTML());
    },
  });

  useEffect(() => {
    const normalized = normalizeEditorHtml(value);
    if (editor && editor.getHTML() !== normalized) {
      editor.commands.setContent(normalized, false);
    }
  }, [value, editor]);

  const handleCopyHtml = useCallback(async () => {
    try {
      setIsCopying(true);
      const payload = editor ? editor.getHTML() : value || '';
      const success = await copyText(payload);
      notifications.show({
        message: success ? 'HTML bylo zkopírováno do schránky.' : 'HTML se nepodařilo zkopírovat.',
        color: success ? 'green' : 'red',
      });
    } catch (error) {
      notifications.show({ message: 'HTML se nepodařilo zkopírovat.', color: 'red' });
    } finally {
      setIsCopying(false);
    }
  }, [editor, value]);

  const handleInsertCopyButton = useCallback(() => {
    const copyValue = sanitizeCopyValue(copyButtonValue);
    if (copyValue === '') {
      notifications.show({ message: 'Zadej obsah, který se má zkopírovat.', color: 'yellow' });
      return;
    }

    const buttonLabel = copyButtonLabel.trim() || 'Kopírovat kód';
    if (editor) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'copyButton',
          attrs: { copyValue },
          content: [
            {
              type: 'text',
              text: buttonLabel,
            },
          ],
        })
        .run();
    } else {
      const buttonHtml = `<button class="kv-copy-button" type="button" data-kv-copy="${escapeHtml(copyValue)}">${escapeHtml(buttonLabel)}</button>`;
      const addition = value ? `${value}\n${buttonHtml}` : buttonHtml;
      onChange(addition);
    }

    notifications.show({ message: 'Tlačítko bylo přidáno.', color: 'green' });
    setCopyButtonValue('');
    closeCopyModal();
  }, [copyButtonLabel, copyButtonValue, editor, onChange, value, closeCopyModal]);

  const actionButtons = (
    <Group justify="flex-end" gap="xs" wrap="wrap">
      <Tooltip label="Vložit tlačítko pro kopírování voucheru" withArrow>
        <Button
          variant="light"
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={openCopyModal}
        >
          Přidat kopírovací tlačítko
        </Button>
      </Tooltip>
      <Tooltip label="Zkopírovat HTML kód" withArrow>
        <Button
          variant="default"
          size="xs"
          leftSection={<IconCopy size={14} />}
          onClick={handleCopyHtml}
          loading={isCopying}
        >
          Kopírovat HTML
        </Button>
      </Tooltip>
    </Group>
  );

  const copyModal = (
    <Modal opened={copyModalOpened} onClose={closeCopyModal} title="Přidat kopírovací tlačítko">
      <Stack gap="sm">
        <TextInput
          label="Text tlačítka"
          placeholder="Kopírovat kód"
          value={copyButtonLabel}
          onChange={(event) => setCopyButtonLabel(event.currentTarget.value)}
        />
        <Textarea
          label="Co se má zkopírovat"
          placeholder="Slevový kód nebo voucher"
          minRows={2}
          value={copyButtonValue}
          onChange={(event) => setCopyButtonValue(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button onClick={handleInsertCopyButton}>Vložit tlačítko</Button>
        </Group>
      </Stack>
    </Modal>
  );

  if (!editor) {
    return (
      <Stack gap="xs">
        {actionButtons}
        {copyModal}
        <Textarea
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          minRows={3}
          autosize
        />
      </Stack>
    );
  }

  return (
    <Stack gap="xs">
      {actionButtons}
      {copyModal}
      <RichTextEditor editor={editor}>
        <RichTextEditor.Toolbar sticky stickyOffset={0}>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Bold />
            <RichTextEditor.Italic />
            <RichTextEditor.Underline />
            <RichTextEditor.ClearFormatting />
          </RichTextEditor.ControlsGroup>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.Link />
            <RichTextEditor.Unlink />
          </RichTextEditor.ControlsGroup>
          <RichTextEditor.ControlsGroup>
            <RichTextEditor.BulletList />
            <RichTextEditor.OrderedList />
          </RichTextEditor.ControlsGroup>
        </RichTextEditor.Toolbar>
        <RichTextEditor.Content />
      </RichTextEditor>
    </Stack>
  );
};

export const ShoptetPluginGeneratorPage = () => {
  const [activeTab, setActiveTab] = useState<'generate' | 'manage' | 'countdown'>('generate');
  const form = useForm<FormValues>({
    defaultValues,
  });
  const mutation = useGenerateShoptetPlugin();
  const result = mutation.data;
  const downloadMutation = useDownloadShoptetPluginVersion();
  const { data: shopsData, isLoading: shopsLoading } = useShops({ per_page: 200 });
  const shopOptions = useMemo(
    () =>
      shopsData?.data?.map((shop) => ({
        value: String(shop.id),
        label: shop.name ?? shop.domain,
      })) ?? [],
    [shopsData]
  );
  const languageOptions = useMemo(
    () => [
      { value: 'cs', label: 'Čeština' },
      { value: 'sk', label: 'Slovenčina' },
      { value: 'en', label: 'Angličtina' },
      { value: 'de', label: 'Němčina' },
      { value: 'hu', label: 'Maďarština' },
      { value: 'pl', label: 'Polština' },
    ],
    []
  );

  const [drawerOpened, { open: openDrawer, close: closeDrawer }] = useDisclosure(false);
  const [selectedPluginId, setSelectedPluginId] = useState<number | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const previewRef = useRef<HTMLIFrameElement | null>(null);
  const pluginType = form.watch('plugin_type');
  const generatorShopId = form.watch('shop_id');
  const pluginEditForm = useForm<{ name: string }>({ defaultValues: { name: '' } });
  const [pluginEditModalOpened, { open: openPluginModal, close: closePluginModal }] = useDisclosure(false);
  const [pluginBeingEdited, setPluginBeingEdited] = useState<ShoptetPluginListItem | null>(null);
  const templateForm = useForm<TemplateFormValues>({
    defaultValues: {
      name: '',
      plugin_type: 'banner',
      description: '',
      goal: '',
      shoptet_surface: '',
      data_sources: '',
      additional_notes: '',
      language: 'cs',
      brand_primary_color: '#FF6600',
      brand_secondary_color: '#1A1A1A',
      brand_font_family: 'Roboto, sans-serif',
    },
  });
  const countdownForm = useForm<CountdownFormValues>({
    defaultValues: countdownDefaults,
  });
  const countdownMutation = useCreateCountdownPlugin();
  const countdownShopId = countdownForm.watch('shop_id');
  const countdownBundleKey = countdownForm.watch('bundle_key');
  const snowfallForm = useForm<SnowfallFormValues>({
    defaultValues: snowfallDefaults,
  });
  const snowfallMutation = useCreateSnowfallPlugin();
  const snowfallShopId = snowfallForm.watch('shop_id');
  const snowfallBundleKey = snowfallForm.watch('bundle_key');
  const autoWidgetForm = useForm<AutoWidgetFormValues>({
    defaultValues: autoWidgetDefaults,
  });
  const autoWidgetMutation = useCreateAutoWidgetPlugin();
  const autoWidgetShopId = autoWidgetForm.watch('shop_id');
  const autoWidgetBundleKey = autoWidgetForm.watch('bundle_key');
  const autoWidgetDataSource = autoWidgetForm.watch('data_source');
  useEffect(() => {
    autoWidgetForm.setValue('plugin_id', '');
  }, [autoWidgetForm, autoWidgetShopId]);
  const adventForm = useForm<AdventCalendarFormValues>({
    defaultValues: adventDefaults,
  });
  const { fields: adventDayFields } = useFieldArray({
    control: adventForm.control,
    name: 'days',
  });
  const adventMutation = useCreateAdventCalendarPlugin();
  const adventShopId = adventForm.watch('shop_id');
  const adventBundleKey = adventForm.watch('bundle_key');
  const adventDecorVariant = adventForm.watch('decor_variant');
  const adventSnowToggle = adventForm.watch('enable_snowfall');
  const adventCountdownToggle = adventForm.watch('show_countdown');
  const adventCardLabel = adventForm.watch('card_label');
  const adventCountdownPrefix = adventForm.watch('countdown_prefix');
  const adventCountdownComplete = adventForm.watch('countdown_complete');
  const adventLocaleRef = useRef<string>('cs');
  const { data: countdownFlags, isLoading: countdownFlagsLoading } = useShoptetPluginFlags(
    countdownShopId ? Number(countdownShopId) : null
  );
  const countdownFlagOptions = useMemo(
    () =>
      (countdownFlags ?? []).map((flag) => ({
        value: flag.code ?? flag.title,
        label: flag.title,
        code: flag.code,
      })),
    [countdownFlags]
  );

  const { data: pluginsResponse, isLoading: pluginsLoading } = useShoptetPlugins();
  const plugins = pluginsResponse?.data ?? EMPTY_PLUGIN_LIST;
  const adventPlugins = useMemo(
    () => plugins.filter((plugin) => plugin.latest_metadata?.plugin_type === 'advent_calendar_admin'),
    [plugins]
  );
  const selectedPlugin = useMemo(
    () => plugins.find((plugin) => plugin.id === selectedPluginId) ?? null,
    [plugins, selectedPluginId]
  );

  const { data: pluginVersions, isLoading: versionsLoading } = useShoptetPluginVersions(selectedPluginId);
  const { data: versionDetail, isLoading: versionLoading } = useShoptetPluginVersion(selectedVersionId);
  const { data: templatesData, isLoading: templatesLoading } = usePluginTemplates();
  const templates = templatesData ?? EMPTY_TEMPLATE_LIST;
  const templateOptions = useMemo(() => {
    const system = templates
      .filter((template) => template.is_system)
      .map((template) => ({ value: String(template.id), label: template.name }));

    const custom = templates
      .filter((template) => !template.is_system)
      .map((template) => ({ value: String(template.id), label: template.name }));

    const groups = [] as { group: string; items: { value: string; label: string }[] }[];

    if (system.length > 0) {
      groups.push({ group: 'Systémové', items: system });
    }

    if (custom.length > 0) {
      groups.push({ group: 'Vlastní', items: custom });
    }

    return groups.length > 0 ? groups : ([] as { value: string; label: string }[]);
  }, [templates]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateModalOpened, { open: openTemplateModal, close: closeTemplateModal }] = useDisclosure(false);
  const [editingTemplate, setEditingTemplate] = useState<ShoptetPluginTemplate | null>(null);
  const createTemplate = useCreatePluginTemplate();
  const updateTemplate = useUpdatePluginTemplate();
  const deleteTemplate = useDeletePluginTemplate();
  const { data: autoWidgetWidgetsData, isLoading: autoWidgetWidgetsLoading } = useProductWidgets({
    status: 'published',
    per_page: 200,
  });
  const autoWidgetOptions = useMemo(() => {
    const widgets = autoWidgetWidgetsData?.data ?? [];
    return widgets
      .filter((widget) => widget.status === 'published')
      .map((widget) => ({
        value: widget.id,
        label: widget.name,
        description: widget.slug,
      }));
  }, [autoWidgetWidgetsData]);
  const autoWidgetPluginOptions = useMemo(() => {
    const shopId = autoWidgetShopId ? Number(autoWidgetShopId) : null;
    return plugins
      .filter((plugin) => plugin.latest_metadata?.plugin_type === 'auto_widget_admin')
      .filter((plugin) => (shopId ? plugin.shop_id === shopId : true))
      .map((plugin) => ({
        value: String(plugin.id),
        label: `${plugin.name}${shopId ? '' : ` · ${plugin.shop_name ?? `Shop #${plugin.shop_id}`}`}`,
      }));
  }, [autoWidgetShopId, plugins]);
  const updatePlugin = useUpdateShoptetPlugin();
  const deletePlugin = useDeleteShoptetPlugin();
  const [publicShopId, setPublicShopId] = useState<string>('');
  const [publicBundleKey, setPublicBundleKey] = useState<string>('main');
  const [activeAdminPlugin, setActiveAdminPlugin] = useState<'countdown' | 'snowfall' | 'advent' | 'autoWidget' | null>(null);
  const [selectedAdventPresetId, setSelectedAdventPresetId] = useState<string | null>(null);

  const bundleOptionsByShop = useMemo(() => {
    const map: Record<number, string[]> = {};
    (shopsData?.data ?? []).forEach((shop) => {
      map[shop.id] = ['main'];
    });

    plugins.forEach((plugin) => {
      const shopBundles = map[plugin.shop_id] ?? ['main'];
      const bundleKey = normalizeBundleKey(plugin.latest_bundle_key);
      if (!shopBundles.includes(bundleKey)) {
        shopBundles.push(bundleKey);
      }

      map[plugin.shop_id] = shopBundles;
    });

    Object.keys(map).forEach((shopId) => {
      const numericId = Number(shopId);
      const unique = Array.from(new Set(map[numericId].map((value) => normalizeBundleKey(value))));
      const withoutMain = unique.filter((value) => value !== 'main').sort((a, b) => a.localeCompare(b));
      map[numericId] = ['main', ...withoutMain];
    });

    return map;
  }, [plugins, shopsData?.data]);

  const globalBundleList = useMemo(() => {
    const set = new Set<string>(['main']);
    Object.values(bundleOptionsByShop).forEach((bundles) => {
      bundles.forEach((bundle) => set.add(normalizeBundleKey(bundle)));
    });
    const values = Array.from(set.values()).filter(Boolean);
    const withoutMain = values.filter((value) => value !== 'main').sort((a, b) => a.localeCompare(b));
    return ['main', ...withoutMain];
  }, [bundleOptionsByShop]);

  const adminPluginDefinitions: Array<{
    type: 'countdown' | 'snowfall' | 'advent' | 'autoWidget';
    title: string;
    description: string;
    badge: string;
  }> = useMemo(
    () => [
      {
        type: 'countdown',
        title: 'Akční odpočet podle štítku',
        description: 'Zvýrazní zvolený produktový štítek a vloží nad název produktu animovaný odpočet s vlastním textem.',
        badge: 'Pro detail produktu',
      },
  {
    type: 'snowfall',
    title: 'Sněžení na vybraných kategoriích',
    description: 'Přidá jemný sněhový efekt na zvolené kategorie nebo landing page během sezónních kampaní.',
    badge: 'Pro kategorie',
  },
  {
    type: 'autoWidget',
    title: 'Automatický widget z HUBu',
    description: 'Zvol publikovaný widget a vložíme ho jen na vybrané typy stran (homepage, kategorie, detail, košík).',
    badge: 'Použije produkty → Widgety',
  },
  {
    type: 'advent',
    title: 'Adventní kalendář',
    description: 'Umožní nastavit 24 denních odměn s vlastním HTML, vánoční grafikou a volitelným sněžením na určených URL.',
    badge: 'Specifické URL',
  },
    ],
    []
  );

  const generatorBundleOptions = useMemo(() => {
    const numericShopId = generatorShopId ? Number(generatorShopId) : null;
    const list = (numericShopId && bundleOptionsByShop[numericShopId]?.length
      ? bundleOptionsByShop[numericShopId]
      : globalBundleList) as string[];
    return list.map((bundle) => ({ value: bundle, label: formatBundleOptionLabel(bundle) }));
  }, [bundleOptionsByShop, generatorShopId, globalBundleList]);

  const countdownBundleOptions = useMemo(() => {
    const numericShopId = countdownShopId ? Number(countdownShopId) : null;
    const list = (numericShopId && bundleOptionsByShop[numericShopId]?.length
      ? bundleOptionsByShop[numericShopId]
      : globalBundleList) as string[];
    return list.map((bundle) => ({ value: bundle, label: formatBundleOptionLabel(bundle) }));
  }, [bundleOptionsByShop, countdownShopId, globalBundleList]);

  const snowfallBundleOptions = useMemo(() => {
    const numericShopId = snowfallShopId ? Number(snowfallShopId) : null;
    const list = (numericShopId && bundleOptionsByShop[numericShopId]?.length
      ? bundleOptionsByShop[numericShopId]
      : globalBundleList) as string[];
    return list.map((bundle) => ({ value: bundle, label: formatBundleOptionLabel(bundle) }));
  }, [bundleOptionsByShop, snowfallShopId, globalBundleList]);

  const autoWidgetBundleOptions = useMemo(() => {
    const numericShopId = autoWidgetShopId ? Number(autoWidgetShopId) : null;
    const list = (numericShopId && bundleOptionsByShop[numericShopId]?.length
      ? bundleOptionsByShop[numericShopId]
      : globalBundleList) as string[];
    return list.map((bundle) => ({ value: bundle, label: formatBundleOptionLabel(bundle) }));
  }, [bundleOptionsByShop, autoWidgetShopId, globalBundleList]);

  const adventBundleOptions = useMemo(() => {
    const numericShopId = adventShopId ? Number(adventShopId) : null;
    const list = (numericShopId && bundleOptionsByShop[numericShopId]?.length
      ? bundleOptionsByShop[numericShopId]
      : globalBundleList) as string[];
    return list.map((bundle) => ({ value: bundle, label: formatBundleOptionLabel(bundle) }));
  }, [bundleOptionsByShop, adventShopId, globalBundleList]);

  const publicBundleOptions = useMemo(() => {
    const numericShopId = publicShopId ? Number(publicShopId) : null;
    const list = (numericShopId && bundleOptionsByShop[numericShopId]?.length
      ? bundleOptionsByShop[numericShopId]
      : globalBundleList) as string[];
    return list.map((bundle) => ({ value: bundle, label: formatBundleOptionLabel(bundle) }));
  }, [bundleOptionsByShop, globalBundleList, publicShopId]);

  const adventPresetOptions = useMemo(
    () =>
      adventPlugins.map((plugin) => ({
        value: String(plugin.id),
        label: `${plugin.name} · ${plugin.shop_name ?? `Shop #${plugin.shop_id}`}`,
      })),
    [adventPlugins]
  );

  const apiBaseUrl = useMemo(() => {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl && typeof envUrl === 'string') {
      return envUrl.replace(/\/+$/, '');
    }

    if (typeof window !== 'undefined') {
      return `${window.location.origin}/api`.replace(/\/+$/, '');
    }

    return '/api';
  }, []);

  const publicScriptUrl = useMemo(() => {
    if (!publicShopId) {
      return '';
    }

    const base = `${apiBaseUrl}/shoptet/plugins/public/${publicShopId}.js`;
    const normalizedBundle = normalizeBundleKey(publicBundleKey);

    if (!publicBundleKey || normalizedBundle === 'main') {
      return base;
    }

    const params = new URLSearchParams({ bundle: normalizedBundle });
    return `${base}?${params.toString()}`;
  }, [apiBaseUrl, publicBundleKey, publicShopId]);

  const publicScriptTag = useMemo(() => {
    if (!publicScriptUrl) {
      return '';
    }

    return `<script src="${publicScriptUrl}"></script>`;
  }, [publicScriptUrl]);

  useEffect(() => {
    if (!drawerOpened || !pluginVersions || pluginVersions.length === 0) {
      return;
    }

    if (!selectedVersionId) {
      setSelectedVersionId(pluginVersions[0].id);
    }
  }, [drawerOpened, pluginVersions, selectedVersionId]);

  useEffect(() => {
    if (!countdownShopId || !shopsData?.data) {
      return;
    }

    const numericId = Number(countdownShopId);
    const shop = shopsData.data.find((item) => item.id === numericId);
    if (shop?.timezone) {
      countdownForm.setValue('timezone', shop.timezone, { shouldDirty: false });
    }
  }, [countdownForm, countdownShopId, shopsData?.data]);

  useEffect(() => {
    if (!adventShopId || !shopsData?.data) {
      return;
    }

    const numericId = Number(adventShopId);
    const shop = shopsData.data.find((item) => item.id === numericId);
    if (!shop) {
      return;
    }

    if (!adventForm.getValues('timezone') && shop.timezone) {
      adventForm.setValue('timezone', shop.timezone, { shouldDirty: false });
    }

    const localeKey = normalizeAdventLocaleKey(shop.locale || shop.default_locale);
    const newDefaults = ADVENT_LOCALE_DEFAULTS[localeKey] ?? ADVENT_LOCALE_DEFAULTS.cs;
    const previousDefaults = ADVENT_LOCALE_DEFAULTS[adventLocaleRef.current] ?? ADVENT_LOCALE_DEFAULTS.cs;

    const baseDefaults = ADVENT_LOCALE_DEFAULTS.cs;
    const fallbackDefaults = ADVENT_LOCALE_DEFAULTS.default;

    const maybeApplyLocaleValue = (
      field: 'card_label' | 'countdown_prefix' | 'countdown_complete',
      newValue: string,
      oldValue: string
    ) => {
      const currentValue = adventForm.getValues(field);
      const isUsingDefault =
        currentValue === oldValue ||
        currentValue === baseDefaults.cardLabel ||
        currentValue === baseDefaults.countdownPrefix ||
        currentValue === baseDefaults.countdownComplete ||
        currentValue === fallbackDefaults.cardLabel ||
        currentValue === fallbackDefaults.countdownPrefix ||
        currentValue === fallbackDefaults.countdownComplete;

      if (isUsingDefault) {
        adventForm.setValue(field, newValue, { shouldDirty: false });
      }
    };

    maybeApplyLocaleValue('card_label', newDefaults.cardLabel, previousDefaults.cardLabel);
    maybeApplyLocaleValue('countdown_prefix', newDefaults.countdownPrefix, previousDefaults.countdownPrefix);
    maybeApplyLocaleValue('countdown_complete', newDefaults.countdownComplete, previousDefaults.countdownComplete);

    adventLocaleRef.current = localeKey;
  }, [adventForm, adventShopId, shopsData?.data]);

  useEffect(() => {
    if (!selectedAdventPresetId) {
      return;
    }

    const plugin = adventPlugins.find((item) => String(item.id) === selectedAdventPresetId);
    const meta = plugin?.latest_metadata?.advent_calendar;
    if (!plugin || !meta) {
      return;
    }

    const defaults = buildAdventDefaults();
    const mappedDays = (meta.days ?? defaults.days).map((day, index) => ({
      day: day?.day ?? index + 1,
      title: day?.title ?? `Den ${day?.day ?? index + 1}`,
      targets: Array.isArray(day?.targets) ? day.targets : [],
      html: day?.html ?? '',
    }));

    adventForm.reset({
      shop_id: String(plugin.shop_id),
      name: plugin.name,
      start_date: meta.start_date ? meta.start_date.slice(0, 10) : defaults.start_date,
      timezone: meta.timezone ?? defaults.timezone,
      bundle_key: plugin.latest_bundle_key ?? 'main',
      decor_variant: (meta.decor_variant ?? 'classic') as AdventCalendarFormValues['decor_variant'],
      enable_snowfall: Boolean(meta.enable_snowfall),
      show_countdown: Boolean(meta.show_countdown),
      card_label: meta.card_label ?? defaults.card_label,
      countdown_prefix: meta.countdown_prefix ?? defaults.countdown_prefix,
      countdown_complete: meta.countdown_complete ?? defaults.countdown_complete,
      overview_targets: Array.isArray(meta.overview_targets) ? meta.overview_targets : [],
      days: mappedDays,
    });
  }, [selectedAdventPresetId, adventPlugins, adventForm]);

  useEffect(() => {
    if (!publicShopId && shopOptions.length > 0) {
      setPublicShopId(shopOptions[0].value);
    }
  }, [publicShopId, shopOptions]);

  useEffect(() => {
    if (!publicShopId) {
      return;
    }
    setPublicBundleKey('main');
  }, [publicShopId]);

  const handleSelectPlugin = useCallback(
    (pluginId: number, latestVersionId: number | null) => {
      setActiveTab('manage');
      setSelectedPluginId(pluginId);
      setSelectedVersionId(latestVersionId);
      openDrawer();
    },
    [openDrawer]
  );

  const handleCloseDrawer = useCallback(() => {
    closeDrawer();
    setSelectedPluginId(null);
    setSelectedVersionId(null);
  }, [closeDrawer]);

  const onSubmit = form.handleSubmit(async (values) => {
    const shopId = Number(values.shop_id);

    if (!shopId) {
      form.setError('shop_id', { type: 'manual', message: 'Vyber e-shop.' });
      return;
    }

    const payload = {
      name: values.name.trim(),
      goal: values.goal.trim(),
      shop_id: shopId,
      plugin_type: pluginType ?? 'banner',
      template_id: selectedTemplateId,
      shoptet_surface: toNullable(values.shoptet_surface),
      data_sources: toNullable(values.data_sources),
      additional_notes: toNullable(values.additional_notes),
      language: toNullable(values.language) ?? 'cs',
      brand_primary_color: pluginType === 'banner' ? toNullable(values.brand_primary_color) : null,
      brand_secondary_color: pluginType === 'banner' ? toNullable(values.brand_secondary_color) : null,
      brand_font_family: pluginType === 'banner' ? toNullable(values.brand_font_family) : null,
      bundle_key: normalizeBundleKey(values.bundle_key),
    };

    try {
      const response = await mutation.mutateAsync(payload);
      notifications.show({ message: `Plugin ${response.file.filename} je připraven ke stažení.`, color: 'green' });
      handleSelectPlugin(response.plugin_id, response.version_id);
    } catch (error) {
      if (isAxiosError<{ message?: string }>(error)) {
        const message = error.response?.data?.message ?? 'Generování pluginu selhalo.';
        notifications.show({ message, color: 'red' });
      } else {
        notifications.show({ message: 'Generování pluginu selhalo.', color: 'red' });
      }
    }
  });

  const handleCopyCode = useCallback(async () => {
    if (!versionDetail?.code) {
      return;
    }

    try {
      const success = await copyText(versionDetail.code);
      notifications.show({ message: success ? 'Kód byl zkopírován do schránky.' : 'Kód se nepodařilo zkopírovat.', color: success ? 'green' : 'red' });
    } catch {
      notifications.show({ message: 'Kód se nepodařilo zkopírovat.', color: 'red' });
    }
  }, [versionDetail?.code]);

  const handleCopyPublicUrl = useCallback(async () => {
    if (!publicScriptUrl) {
      notifications.show({ message: 'Vyber e-shop a bundle.', color: 'yellow' });
      return;
    }

    try {
      const success = await copyText(publicScriptUrl);
      notifications.show({ message: success ? 'URL byla zkopírována do schránky.' : 'URL se nepodařilo zkopírovat.', color: success ? 'green' : 'red' });
    } catch {
      notifications.show({ message: 'URL se nepodařilo zkopírovat.', color: 'red' });
    }
  }, [publicScriptUrl]);

  const handleCopyPublicTag = useCallback(async () => {
    if (!publicScriptTag) {
      notifications.show({ message: 'Nejprve vyber e-shop a bundle.', color: 'yellow' });
      return;
    }

    try {
      const success = await copyText(publicScriptTag);
      notifications.show({ message: success ? 'HTML snippet byl zkopírován.' : 'Snippet se nepodařilo zkopírovat.', color: success ? 'green' : 'red' });
    } catch {
      notifications.show({ message: 'Snippet se nepodařilo zkopírovat.', color: 'red' });
    }
  }, [publicScriptTag]);

  const handleDownloadVersion = useCallback(async () => {
    if (!selectedVersionId) {
      return;
    }

    try {
      const blob = await downloadMutation.mutateAsync(selectedVersionId);
      const filename = versionDetail?.filename || 'plugin.js';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      notifications.show({ message: 'Soubor byl stažen.', color: 'green' });
    } catch {
      notifications.show({ message: 'Stažení se nepodařilo.', color: 'red' });
    }
  }, [downloadMutation, selectedVersionId, versionDetail?.filename]);

  const handleSelectVersion = useCallback((versionId: number) => {
    setSelectedVersionId(versionId);
  }, []);

  useEffect(() => {
    if (!selectedTemplateId) {
      return;
    }

    const template = templates.find((item) => item.id === selectedTemplateId);

    if (!template) {
      return;
    }

    form.setValue('plugin_type', template.plugin_type);
    form.setValue('name', template.name);
    form.setValue('goal', template.goal);
    form.setValue('language', template.language ?? 'cs');
    form.setValue('shoptet_surface', template.shoptet_surface ?? '');
    form.setValue('data_sources', template.data_sources ?? '');
    form.setValue('additional_notes', template.additional_notes ?? '');
    if (template.plugin_type === 'banner') {
      form.setValue('brand_primary_color', template.brand_primary_color ?? '#FF6600');
      form.setValue('brand_secondary_color', template.brand_secondary_color ?? '#1A1A1A');
      form.setValue('brand_font_family', template.brand_font_family ?? 'Roboto, sans-serif');
    } else {
      form.setValue('brand_primary_color', '#FF6600');
      form.setValue('brand_secondary_color', '#1A1A1A');
      form.setValue('brand_font_family', 'Roboto, sans-serif');
    }
  }, [selectedTemplateId, templates, form]);

  const handleCopyResultCode = useCallback(async () => {
    if (!result?.file.code) {
      return;
    }

    try {
      const success = await copyText(result.file.code);
      notifications.show({ message: success ? 'Kód byl zkopírován do schránky.' : 'Kód se nepodařilo zkopírovat.', color: success ? 'green' : 'red' });
    } catch {
      notifications.show({ message: 'Kód se nepodařilo zkopírovat.', color: 'red' });
    }
  }, [result?.file.code]);

  const handleDownloadResult = useCallback(() => {
    if (!result?.file.code) {
      return;
    }

    const blob = new Blob([result.file.code], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.file.filename || 'plugin.js';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    notifications.show({ message: 'Soubor byl stažen.', color: 'green' });
  }, [result?.file.code, result?.file.filename]);

  const handleCreateCountdownPlugin = countdownForm.handleSubmit(async (values) => {
    const shopId = Number(values.shop_id);

    if (!shopId) {
      notifications.show({ message: 'Vyber e-shop, pro který má plugin platit.', color: 'yellow' });
      return;
    }

    if (!values.flag_code) {
      notifications.show({ message: 'Vyber produktový štítek.', color: 'yellow' });
      return;
    }

    if (!values.deadline) {
      notifications.show({ message: 'Zadej datum a čas konce kampaně.', color: 'yellow' });
      return;
    }

    try {
      const selectedFlag = countdownFlagOptions.find((option) => option.value === values.flag_code);
      await countdownMutation.mutateAsync({
        shop_id: shopId,
        name: values.name.trim(),
        flag_code: selectedFlag?.code ?? values.flag_code,
        flag_label: selectedFlag?.label ?? values.flag_code,
        message_template: values.message_template.trim(),
        finished_text: values.finished_text?.trim() || undefined,
        deadline: values.deadline,
        timezone: values.timezone?.trim() || undefined,
        accent_color: values.accent_color?.trim() || undefined,
        background_color: values.background_color?.trim() || undefined,
        text_color: values.text_color?.trim() || undefined,
        bundle_key: normalizeBundleKey(values.bundle_key),
      });

      notifications.show({ message: 'Plugin s odpočtem byl vytvořen.', color: 'teal' });
      countdownForm.reset(countdownDefaults);
      setActiveTab('manage');
      setActiveAdminPlugin(null);
    } catch (error) {
      if (isAxiosError(error) && error.response?.data?.message) {
        notifications.show({ message: error.response.data.message, color: 'red' });
        return;
      }
      notifications.show({ message: 'Uložení pluginu selhalo. Zkus to prosím znovu.', color: 'red' });
    }
  });

  const handleCreateSnowfallPlugin = snowfallForm.handleSubmit(async (values) => {
    const shopId = Number(values.shop_id);

    if (!shopId) {
      notifications.show({ message: 'Vyber e-shop, pro který má sněžení platit.', color: 'yellow' });
      return;
    }

    const paths = (values.category_paths ?? []).map((path) => path.trim()).filter((path) => path !== '');

    if (paths.length === 0) {
      notifications.show({ message: 'Zadej alespoň jednu kategorii.', color: 'yellow' });
      return;
    }

    const desktopFlakeCount = Number(values.flake_count_desktop) || snowfallDefaults.flake_count_desktop;
    const mobileFlakeCount = Number(values.flake_count_mobile) || snowfallDefaults.flake_count_mobile;

    try {
      await snowfallMutation.mutateAsync({
        shop_id: shopId,
        name: values.name.trim() || 'Sezónní sněžení',
        category_paths: paths,
        bundle_key: normalizeBundleKey(values.bundle_key),
        flake_color: values.flake_color?.trim() || undefined,
        flake_count: desktopFlakeCount,
        flake_count_desktop: desktopFlakeCount,
        flake_count_mobile: mobileFlakeCount,
        min_size: values.min_size ?? undefined,
        max_size: values.max_size ?? undefined,
        fall_speed: values.fall_speed ?? undefined,
        sway: values.sway ?? undefined,
        twinkle: values.twinkle,
      });

      notifications.show({ message: 'Sněhový efekt byl vytvořen.', color: 'teal' });
      snowfallForm.reset(snowfallDefaults);
      setActiveTab('manage');
      setActiveAdminPlugin(null);
    } catch (error) {
      if (isAxiosError(error) && error.response?.data?.message) {
        notifications.show({ message: error.response.data.message, color: 'red' });
        return;
      }
      notifications.show({ message: 'Uložení sněžení selhalo. Zkus to prosím znovu.', color: 'red' });
    }
  });

  const handleCreateAutoWidgetPlugin = autoWidgetForm.handleSubmit(async (values) => {
    const shopId = Number(values.shop_id);
    if (!shopId) {
      notifications.show({ message: 'Vyber e-shop, kde se má widget zobrazit.', color: 'yellow' });
      return;
    }

    const widgetId = values.widget_id.trim();
    if (!widgetId) {
      notifications.show({ message: 'Vyber publikovaný widget.', color: 'yellow' });
      return;
    }

    const pluginId = values.plugin_id ? Number(values.plugin_id) : null;

    const targets = (values.page_targets ?? []).filter((target) => target && target.trim() !== '');
    if (targets.length === 0) {
      notifications.show({ message: 'Vyber alespoň jeden typ stránky.', color: 'yellow' });
      return;
    }

    const selector = values.selector.trim();
    if (!selector) {
      notifications.show({ message: 'Zadej CSS selektor, kam widget vložit.', color: 'yellow' });
      return;
    }

    try {
      await autoWidgetMutation.mutateAsync({
        shop_id: shopId,
        name: values.name.trim() || 'Automatický widget',
        widget_id: widgetId,
        page_targets: targets,
        selector,
        placement: values.placement ?? 'append',
        bundle_key: normalizeBundleKey(values.bundle_key),
        max_attempts: Number(values.max_attempts) || undefined,
        poll_interval_ms: Number(values.poll_interval_ms) || undefined,
        data_source: (values.data_source as AutoWidgetFormValues['data_source']) ?? 'widget',
        recommendation_limit: Number(values.recommendation_limit) || autoWidgetDefaults.recommendation_limit,
        recommendation_mode:
          autoWidgetDataSource === 'inventory_recommendations' && values.recommendation_mode
            ? (values.recommendation_mode as 'fragrance' | 'nonfragrance' | 'product')
            : null,
        plugin_id: pluginId ?? undefined,
        heading: values.heading?.trim() || undefined,
        container_id: values.container_id?.trim() || undefined,
      });

      notifications.show({ message: 'Automatický widget byl uložen do bundle souboru.', color: 'teal' });
      autoWidgetForm.reset(autoWidgetDefaults);
      setActiveTab('manage');
      setActiveAdminPlugin(null);
    } catch (error) {
      if (isAxiosError(error) && error.response?.data?.message) {
        notifications.show({ message: error.response.data.message, color: 'red' });
        return;
      }
      notifications.show({ message: 'Uložení widgetu selhalo. Zkus to znovu.', color: 'red' });
    }
  });

  const handleCreateAdventCalendarPlugin = adventForm.handleSubmit(async (values) => {
    const shopId = Number(values.shop_id);

    if (!shopId) {
      notifications.show({ message: 'Vyber e-shop, pro který se má kalendář vytvořit.', color: 'yellow' });
      return;
    }

    if (!values.start_date) {
      notifications.show({ message: 'Zadej datum začátku kalendáře.', color: 'yellow' });
      return;
    }

    const daysPayload = values.days.reduce<AdventCalendarDayPayload[]>((acc, day) => {
      const targets = (day.targets ?? []).map((target) => target.trim()).filter((target) => target !== '');
      const html = day.html?.trim() ?? '';

      if (!targets.length || !html) {
        return acc;
      }

      acc.push({
        day: day.day,
        title: day.title?.trim() || undefined,
        targets,
        html,
      });

      return acc;
    }, []);

    if (daysPayload.length === 0) {
      notifications.show({ message: 'Přidej alespoň jeden den s cílovou URL a obsahem.', color: 'yellow' });
      return;
    }

    const overviewTargets = (values.overview_targets ?? [])
      .map((target) => target.trim())
      .filter((target) => target !== '');

    try {
      await adventMutation.mutateAsync({
        shop_id: shopId,
        name: values.name.trim(),
        bundle_key: normalizeBundleKey(values.bundle_key),
        start_date: values.start_date,
        timezone: values.timezone?.trim() || undefined,
        decor_variant: values.decor_variant,
        enable_snowfall: values.enable_snowfall,
        show_countdown: values.show_countdown,
        card_label: values.card_label?.trim() || undefined,
        countdown_prefix: values.countdown_prefix?.trim() || undefined,
        countdown_complete: values.countdown_complete?.trim() || undefined,
        overview_targets: overviewTargets.length ? overviewTargets : undefined,
        days: daysPayload,
      });

      notifications.show({ message: 'Adventní kalendář byl vytvořen.', color: 'teal' });
      adventForm.reset(buildAdventDefaults());
      setSelectedAdventPresetId(null);
      setActiveTab('manage');
      setActiveAdminPlugin(null);
    } catch (error) {
      if (isAxiosError(error) && error.response?.data?.message) {
        notifications.show({ message: error.response.data.message, color: 'red' });
        return;
      }
      notifications.show({ message: 'Uložení kalendáře selhalo. Zkus to prosím znovu.', color: 'red' });
    }
  });

  const openCreateTemplateModal = useCallback(() => {
    setEditingTemplate(null);
    templateForm.reset({
      name: '',
      plugin_type: 'banner',
      description: '',
      goal: '',
      shoptet_surface: '',
      data_sources: '',
      additional_notes: '',
      language: 'cs',
      brand_primary_color: '#FF6600',
      brand_secondary_color: '#1A1A1A',
      brand_font_family: 'Roboto, sans-serif',
    });
    openTemplateModal();
  }, [openTemplateModal, templateForm]);

  const handleEditTemplate = useCallback(
    (template: ShoptetPluginTemplate) => {
      setEditingTemplate(template);
      templateForm.reset({
        name: template.name,
        plugin_type: template.plugin_type,
        description: template.description ?? '',
        goal: template.goal,
        shoptet_surface: template.shoptet_surface ?? '',
        data_sources: template.data_sources ?? '',
        additional_notes: template.additional_notes ?? '',
        language: template.language ?? 'cs',
        brand_primary_color: template.brand_primary_color ?? '#FF6600',
        brand_secondary_color: template.brand_secondary_color ?? '#1A1A1A',
        brand_font_family: template.brand_font_family ?? 'Roboto, sans-serif',
      });
      openTemplateModal();
    },
    [openTemplateModal, templateForm]
  );

  const handleDeleteTemplateConfirm = useCallback(
    async (template: ShoptetPluginTemplate) => {
      const confirmed = window.confirm(`Opravdu chceš odstranit šablonu "${template.name}"?`);
      if (!confirmed) {
        return;
      }

      try {
        await deleteTemplate.mutateAsync(template.id);
        notifications.show({ message: 'Šablona byla odstraněna.', color: 'green' });
        if (selectedTemplateId === template.id) {
          setSelectedTemplateId(null);
        }
      } catch (error) {
        console.error(error);
        notifications.show({ message: 'Odstranění šablony selhalo.', color: 'red' });
      }
    },
    [deleteTemplate, selectedTemplateId]
  );

  const handleSubmitTemplate = templateForm.handleSubmit(async (values) => {
    const payload = {
      ...values,
      description: values.description || null,
      shoptet_surface: values.shoptet_surface || null,
      data_sources: values.data_sources || null,
      additional_notes: values.additional_notes || null,
      language: values.language || null,
      brand_primary_color: values.plugin_type === 'banner' ? values.brand_primary_color || null : null,
      brand_secondary_color: values.plugin_type === 'banner' ? values.brand_secondary_color || null : null,
      brand_font_family: values.plugin_type === 'banner' ? values.brand_font_family || null : null,
    };

    try {
      if (editingTemplate) {
        await updateTemplate.mutateAsync({ id: editingTemplate.id, payload });
        notifications.show({ message: 'Šablona byla upravena.', color: 'green' });
      } else {
        await createTemplate.mutateAsync(payload);
        notifications.show({ message: 'Šablona vytvořena.', color: 'green' });
      }

      closeTemplateModal();
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Uložení šablony selhalo.', color: 'red' });
    }
  });

  const handleEditPlugin = useCallback(
    (plugin: ShoptetPluginListItem) => {
      setPluginBeingEdited(plugin);
      pluginEditForm.reset({ name: plugin.name });
      openPluginModal();
    },
    [openPluginModal, pluginEditForm]
  );

  const handleClosePluginModal = useCallback(() => {
    closePluginModal();
    setPluginBeingEdited(null);
    pluginEditForm.reset({ name: '' });
  }, [closePluginModal, pluginEditForm]);

  const handleDeletePluginConfirm = useCallback(
    async (plugin: ShoptetPluginListItem) => {
      const confirmed = window.confirm(`Opravdu chceš odstranit plugin "${plugin.name}"?`);
      if (!confirmed) {
        return;
      }

      try {
        await deletePlugin.mutateAsync(plugin.id);
        notifications.show({ message: 'Plugin byl odstraněn.', color: 'green' });
        if (selectedPluginId === plugin.id) {
          setSelectedPluginId(null);
          setSelectedVersionId(null);
          closeDrawer();
        }
      } catch (error) {
        console.error(error);
        notifications.show({ message: 'Odstranění pluginu selhalo.', color: 'red' });
      }
    },
    [deletePlugin, selectedPluginId, closeDrawer]
  );

  const handleSubmitPluginEdit = pluginEditForm.handleSubmit(async (values) => {
    if (!pluginBeingEdited) {
      return;
    }

    try {
      await updatePlugin.mutateAsync({ id: pluginBeingEdited.id, name: values.name.trim() });
      notifications.show({ message: 'Plugin byl upraven.', color: 'green' });
      handleClosePluginModal();
    } catch (error) {
      console.error(error);
      notifications.show({ message: 'Úprava pluginu selhala.', color: 'red' });
    }
  });

  useEffect(() => {
    const iframe = previewRef.current;
    const code = result?.file.code;

    if (!iframe) {
      return;
    }

    const doc = iframe.contentDocument;

    if (!doc) {
      return;
    }

    if (!code) {
      doc.open();
      doc.write(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Inter, sans-serif;margin:0;padding:24px;background:#f8f9fa;color:#1a1a1a;} .placeholder{border:1px dashed #ccc;padding:24px;border-radius:12px;text-align:center;} h1{font-size:18px;margin-bottom:8px;}</style></head><body><div class="placeholder"><h1>Náhled pluginu</h1><p>Vygeneruj plugin, aby bylo co zobrazit.</p></div></body></html>'
      );
      doc.close();
      return;
    }

    const metadata = result?.metadata ?? {};
    const resultType = metadata?.plugin_type ?? pluginType ?? 'banner';

    if (resultType !== 'banner') {
      doc.open();
      doc.write(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Inter, sans-serif;margin:0;padding:24px;background:#f8f9fa;color:#1a1a1a;} .placeholder{border:1px dashed #ccc;padding:24px;border-radius:12px;text-align:center;} h1{font-size:18px;margin-bottom:8px;}</style></head><body><div class="placeholder"><h1>Náhled není k dispozici</h1><p>Typ "funkce" nepřidává vizuální prvky, zkontroluj kód a popis níže.</p></div></body></html>'
      );
      doc.close();
      return;
    }

    const brand = metadata?.brand ?? {};
    const primary = brand?.primary_color ?? '#FF6600';
    const secondary = brand?.secondary_color ?? '#1A1A1A';
    const font = brand?.font_family ?? 'Roboto, sans-serif';
    const language = metadata?.language ?? 'cs';
    const previewHtml = `<!DOCTYPE html>
<html lang="${language}">
  <head>
    <meta charset="utf-8" />
    <title>Shoptet Plugin Preview</title>
    <style>
      :root {
        --brand-primary: ${primary};
        --brand-secondary: ${secondary};
        --brand-font: ${font};
      }
      body {
        font-family: var(--brand-font);
        background: #f6f7f9;
        color: #1a1a1a;
        margin: 0;
        padding: 32px;
      }
      .page {
        background: #ffffff;
        border-radius: 16px;
        box-shadow: none;
        padding: 32px;
        max-width: 960px;
        margin: 0 auto;
      }
      .product-header {
        display: grid;
        grid-template-columns: minmax(0, 280px) 1fr;
        gap: 32px;
        align-items: start;
      }
      .product-image {
        width: 100%;
        aspect-ratio: 1;
        border-radius: 16px;
        background: linear-gradient(135deg, var(--brand-primary), #ffffff 60%);
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .price {
        font-size: 32px;
        font-weight: 700;
        color: var(--brand-primary);
        margin: 16px 0;
      }
      .cta {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        border-radius: 999px;
        padding: 12px 24px;
        background: var(--brand-primary);
        color: #ffffff;
        text-decoration: none;
        font-weight: 600;
        box-shadow: none;
      }
      .details {
        margin-top: 32px;
        line-height: 1.6;
        color: #3a3a3a;
      }
      h2 {
        margin-bottom: 12px;
      }
      .shoptet-product-detail {
        display: flex;
        gap: 24px;
        margin-top: 32px;
      }
      .shoptet-product-detail__gallery {
        width: 260px;
        height: 260px;
        border-radius: 12px;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(0,0,0,0.2));
      }
      .shoptet-product-detail__info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .product-detail__price {
        font-size: 28px;
        font-weight: 600;
        color: var(--brand-primary);
      }
      .product-detail__stock {
        color: var(--brand-secondary);
        font-size: 14px;
      }
      .product-detail__buy {
        display: flex;
        gap: 12px;
        align-items: center;
      }
      .product-detail__buy button {
        padding: 10px 22px;
        border-radius: 999px;
        border: none;
        background: var(--brand-primary);
        color: #fff;
        font-weight: 600;
        cursor: pointer;
      }
      .preview-log {
        margin-top: 24px;
        background: rgba(255, 102, 0, 0.08);
        border-left: 4px solid var(--brand-primary);
        padding: 16px;
        border-radius: 10px;
        display: none;
      }
      .preview-log__title {
        font-weight: 600;
        margin-bottom: 8px;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="product-header">
        <div class="product-image">PREVIEW</div>
        <div>
          <h1>Ukázkový Shoptet produkt</h1>
          <p class="price">1 590 Kč</p>
          <p>Ukázkové prostředí pro ladění pluginu mimo produkci.</p>
          <a class="cta" href="#">Přidat do košíku</a>
        </div>
      </div>
      <div class="details">
        <h2>Popis</h2>
        <p>
          Stránka simuluje klíčové části detailu produktu v Shoptetu, aby bylo možné snadno zkontrolovat, jak se script
          bude chovat po nasazení.
        </p>
      </div>
      <div class="shoptet-product-detail">
        <div class="shoptet-product-detail__gallery"></div>
        <div class="shoptet-product-detail__info">
          <h2 class="product-detail__name">Shoptet produkt</h2>
          <div class="product-detail__price">1 590 Kč</div>
          <div class="product-detail__stock">Skladem > 10 ks</div>
          <div class="product-detail__buy">
            <button type="button" class="product-detail__button--buy">Přidat do košíku</button>
            <span class="product-detail__shipping">Doprava zdarma od 1500 Kč</span>
          </div>
          <div class="product-detail__description">
            Prémiový produkt pro ukázkové prostředí. Plugin může tento blok rozšířit, zvýraznit benefit nebo doplnit call-to-action.
          </div>
        </div>
      </div>
      <div class="preview-log" id="preview-log">
        <div class="preview-log__title">Zachycené logy pluginu</div>
        <pre id="preview-log-output" style="white-space: pre-wrap; margin: 0;"></pre>
      </div>
      <footer id="footer" style="margin-top: 64px; padding: 32px 0; text-align: center; color: #6c757d; border-top: 1px solid #e9ecef;">
        <strong>Simulovaný Shoptet footer</strong>
        <div>Vložený plugin by se měl zobrazit nad tímto blokem.</div>
      </footer>
    </div>
  </body>
</html>`;

    doc.open();
    doc.write(previewHtml);
    doc.close();

    const envScript = doc.createElement('script');
    envScript.type = 'text/javascript';
    envScript.text = `
      window.shoptet = window.shoptet || {
        modal: { open: () => console.log('[Preview] shoptet.modal.open() called') },
        events: { run: () => console.log('[Preview] shoptet.events.run() called') },
        notifications: { add: (msg) => console.log('[Preview] shoptet.notifications.add()', msg) }
      };
      window.dataLayer = window.dataLayer || [];
      console.log('[Preview] Prostředí Shoptet inicializováno');
    `;
    doc.head.appendChild(envScript);

    const wrapperScript = doc.createElement('script');
    wrapperScript.type = 'text/javascript';
    wrapperScript.text = `
      (function(){
        const logContainer = document.getElementById('preview-log');
        const logOutput = document.getElementById('preview-log-output');
        const originalLog = console.log;
        console.log = function(...args) {
          if (logContainer && logOutput) {
            logContainer.style.display = 'block';
            logOutput.textContent += args.map((arg) => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ') + '\\n';
          }
          originalLog.apply(console, args);
        };
        try {
          ${code}
        } catch (error) {
          console.error('[Preview] Plugin execution failed', error);
          if (logContainer && logOutput) {
            logContainer.style.display = 'block';
            logOutput.textContent += '\\n[Chyba] ' + (error?.message || error);
          }
        }
        document.dispatchEvent(new Event('DOMContentLoaded'));
      })();
    `;
    doc.body.appendChild(wrapperScript);
  }, [result?.file.code, result?.metadata, pluginType]);

  const renderPluginsTable = () => {
    if (pluginsLoading) {
      return (
        <Stack gap="sm">
          <Skeleton height={50} radius="md" />
          <Skeleton height={50} radius="md" />
          <Skeleton height={50} radius="md" />
        </Stack>
      );
    }

    if (!plugins.length) {
      return <Text c="gray.6">Zatím nemáš uložené žádné AI pluginy. Vygeneruj první v záložce Generátor.</Text>;
    }

    return (
      <ScrollArea offsetScrollbars h={360}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Název</Table.Th>
              <Table.Th>E-shop</Table.Th>
              <Table.Th>Poslední verze</Table.Th>
              <Table.Th>Soubor</Table.Th>
              <Table.Th>Bundle</Table.Th>
              <Table.Th>Uloženo</Table.Th>
              <Table.Th>Akce</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {plugins.map((plugin) => (
              <Table.Tr key={plugin.id}>
                <Table.Td>
                  <Stack gap={2}>
                    <Text fw={600}>{plugin.name}</Text>
                    {plugin.latest_summary ? (
                      <Text size="xs" c="gray.6">
                        {plugin.latest_summary}
                      </Text>
                    ) : null}
                    {plugin.latest_metadata?.plugin_type ? (
                      <Badge color={plugin.latest_metadata.plugin_type === 'banner' ? 'violet' : 'gray'} variant="light" size="xs">
                        {plugin.latest_metadata.plugin_type === 'banner' ? 'Banner' : 'Funkce'}
                      </Badge>
                    ) : null}
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Badge color="teal" variant="light">
                    {plugin.shop_name ?? `Shop #${plugin.shop_id}`}
                  </Badge>
                </Table.Td>
                <Table.Td>{plugin.latest_version ? `#${plugin.latest_version}` : '—'}</Table.Td>
                <Table.Td>{plugin.latest_filename ?? '—'}</Table.Td>
                <Table.Td>
                  <Badge color="dark" variant="light">
                    {formatBundleOptionLabel(normalizeBundleKey(plugin.latest_bundle_key))}
                  </Badge>
                </Table.Td>
                <Table.Td>{formatDateTime(plugin.latest_created_at)}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Tooltip label="Detaily" withinPortal>
                      <ActionIcon
                        variant="subtle"
                        onClick={() => handleSelectPlugin(plugin.id, plugin.latest_version_id)}
                      >
                        <IconListDetails size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Upravit" withinPortal>
                      <ActionIcon variant="subtle" onClick={() => handleEditPlugin(plugin)}>
                        <IconEdit size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Odstranit" withinPortal>
                      <ActionIcon variant="subtle" color="red" onClick={() => handleDeletePluginConfirm(plugin)}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    );
  };

  const renderVersionsList = () => {
    if (versionsLoading) {
      return (
        <Stack gap="sm">
          <Skeleton height={38} radius="md" />
          <Skeleton height={38} radius="md" />
          <Skeleton height={38} radius="md" />
        </Stack>
      );
    }

    if (!pluginVersions || pluginVersions.length === 0) {
      return <Text c="gray.6">Tento plugin zatím nemá žádné verze.</Text>;
    }

    return (
      <Stack gap="sm">
        {pluginVersions.map((version) => (
          <Button
            key={version.id}
            variant={version.id === selectedVersionId ? 'filled' : 'light'}
            onClick={() => handleSelectVersion(version.id)}
          >
            <Group justify="space-between" w="100%">
              <Stack gap={2}>
                <Text fw={500}>Verze #{version.version}</Text>
                <Text size="xs" c="gray.6">
                  Bundle: {formatBundleOptionLabel(normalizeBundleKey(version.bundle_key))}
                </Text>
              </Stack>
              <Text size="xs" c="gray.6">
                {formatDateTime(version.created_at)}
              </Text>
            </Group>
          </Button>
        ))}
      </Stack>
    );
  };

  const renderVersionDetail = () => {
    if (versionLoading) {
      return (
        <Stack gap="sm">
          <Skeleton height={20} radius="md" />
          <Skeleton height={180} radius="md" />
        </Stack>
      );
    }

    if (!versionDetail) {
      return <Text c="gray.6">Vyber verzi pro zobrazení detailů.</Text>;
    }

    return (
      <Stack gap="md">
        <div>
          <Title order={4}>{versionDetail.filename}</Title>
          <Stack gap={4} mt="xs">
            <Group gap="xs">
              <Badge color="blue" variant="light">
                Verze #{versionDetail.version}
              </Badge>
              <Badge color="teal" variant="light">
                {versionDetail.plugin.shop_name ?? `Shop #${versionDetail.plugin.shop_id}`}
              </Badge>
              <Badge color={versionDetail.metadata?.plugin_type === 'banner' ? 'violet' : 'gray'} variant="light">
                {versionDetail.metadata?.plugin_type === 'banner' ? 'Banner' : 'Funkce'}
              </Badge>
              <Badge color="dark" variant="light">
                Bundle: {formatBundleOptionLabel(normalizeBundleKey(versionDetail.bundle_key))}
              </Badge>
            </Group>
            <Text size="xs" c="gray.6">
              Uloženo {formatDateTime(versionDetail.created_at)}
            </Text>
            {versionDetail.metadata?.language ? (
              <Text size="xs" c="gray.6">
                Jazyk: {versionDetail.metadata.language?.toUpperCase()}
              </Text>
            ) : null}
            {versionDetail.metadata?.brand ? (
              <Group gap="xs">
                {versionDetail.metadata.brand.primary_color ? (
                  <Badge color="gray" variant="light">
                    Primární: {versionDetail.metadata.brand.primary_color}
                  </Badge>
                ) : null}
                {versionDetail.metadata.brand.secondary_color ? (
                  <Badge color="gray" variant="light">
                    Sekundární: {versionDetail.metadata.brand.secondary_color}
                  </Badge>
                ) : null}
                {versionDetail.metadata.brand.font_family ? (
                  <Badge color="gray" variant="light">
                    Font: {versionDetail.metadata.brand.font_family}
                  </Badge>
                ) : null}
              </Group>
            ) : null}
            {versionDetail.summary ? <Text size="sm">{versionDetail.summary}</Text> : null}
            {versionDetail.description ? (
              <Text size="sm" c="gray.6">
                {versionDetail.description}
              </Text>
            ) : null}
          </Stack>
        </div>

        {versionDetail.dependencies.length > 0 ? (
          <div>
            <Title order={5}>Závislosti</Title>
            <Group gap="xs" mt="xs">
              {versionDetail.dependencies.map((dependency) => (
                <Badge key={dependency} color="violet" variant="light">
                  {dependency}
                </Badge>
              ))}
            </Group>
          </div>
        ) : null}

        {versionDetail.warnings.length > 0 ? (
          <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
            <Stack gap={4}>
              {versionDetail.warnings.map((warning) => (
                <Text key={warning} size="sm">
                  {warning}
                </Text>
              ))}
            </Stack>
          </Alert>
        ) : null}

        <Group justify="flex-end" gap="xs">
          <Button variant="default" leftSection={<IconCopy size={16} />} onClick={handleCopyCode}>
            Zkopírovat kód
          </Button>
          <Button leftSection={<IconDownload size={16} />} onClick={handleDownloadVersion} loading={downloadMutation.isPending}>
            Stáhnout .js
          </Button>
        </Group>

        <div>
          <Group justify="space-between" mb="xs">
            <Title order={5}>Kód pluginu</Title>
            <Text size="xs" c="gray.6">
              JavaScript · {versionDetail.code.split('\n').length} řádků
            </Text>
          </Group>
          <Textarea
            value={versionDetail.code}
            readOnly
            autosize
            minRows={18}
            styles={{ input: { fontFamily: 'Menlo, Consolas, Monaco, monospace', fontSize: 13 } }}
          />
        </div>

        {versionDetail.installation_steps.length > 0 ? (
          <div>
            <Title order={5}>Instalace</Title>
            <List spacing="xs" size="sm" mt="xs">
              {versionDetail.installation_steps.map((step) => (
                <List.Item key={step}>{step}</List.Item>
              ))}
            </List>
          </div>
        ) : null}

        {versionDetail.testing_checklist.length > 0 ? (
          <div>
            <Title order={5}>Kontrola funkčnosti</Title>
            <List spacing="xs" size="sm" mt="xs">
              {versionDetail.testing_checklist.map((item) => (
                <List.Item key={item}>{item}</List.Item>
              ))}
            </List>
          </div>
        ) : null}
      </Stack>
    );
  };

  const renderCountdownAdminForm = () => (
    <Card withBorder>
      <Stack gap="md" component="form" onSubmit={handleCreateCountdownPlugin}>
        <Group grow>
          <Select
            label="E-shop"
            placeholder="Vyber e-shop"
            data={shopOptions}
            value={countdownForm.watch('shop_id')}
            onChange={(value) => countdownForm.setValue('shop_id', value ?? '')}
            required
          />
          <TextInput
            label="Název pluginu"
            placeholder="Např. Black Friday countdown"
            value={countdownForm.watch('name')}
            onChange={(event) => countdownForm.setValue('name', event.currentTarget.value)}
            required
          />
        </Group>
        <Autocomplete
          label="Bundle / soubor"
          description="Plugin se uloží do veřejného souboru pro daný e-shop."
          placeholder="např. main"
          data={countdownBundleOptions}
          value={countdownBundleKey}
          onChange={(value) => countdownForm.setValue('bundle_key', value)}
        />
        <Select
          label="Produktový štítek"
          placeholder={countdownShopId ? 'Vyber štítek' : 'Nejdřív vyber e-shop'}
          data={countdownFlagOptions}
          searchable
          disabled={!countdownShopId}
          nothingFoundMessage={countdownShopId && !countdownFlagsLoading ? 'Žádné štítky' : 'Načítám štítky...'}
          rightSection={countdownFlagsLoading ? <Loader size="xs" /> : undefined}
          value={countdownForm.watch('flag_code')}
          onChange={(value) => countdownForm.setValue('flag_code', value ?? '')}
          required
        />
        <Textarea
          label="Text s odpočtem"
          description={
            <>
              Použij proměnnou <code>{'{{countdown}}'}</code>, která se nahradí zbývajícím časem (např.{' '}
              <em>Black Friday končí za {'{{countdown}}'}</em>).
            </>
          }
          minRows={2}
          value={countdownForm.watch('message_template')}
          onChange={(event) => countdownForm.setValue('message_template', event.currentTarget.value)}
          required
        />
        <TextInput
          type="datetime-local"
          label="Konec kampaně"
          value={countdownForm.watch('deadline')}
          onChange={(event) => countdownForm.setValue('deadline', event.currentTarget.value)}
          required
        />
        <TextInput
          label="Časové pásmo"
          placeholder="např. Europe/Prague"
          value={countdownForm.watch('timezone')}
          onChange={(event) => countdownForm.setValue('timezone', event.currentTarget.value)}
        />
        <TextInput
          label="Text po vypršení"
          placeholder="Volitelné upozornění po skončení"
          value={countdownForm.watch('finished_text')}
          onChange={(event) => countdownForm.setValue('finished_text', event.currentTarget.value)}
        />
        <Group grow>
          <ColorInput
            label="Barva pozadí"
            value={countdownForm.watch('background_color')}
            onChange={(value) => countdownForm.setValue('background_color', value ?? '')}
          />
          <ColorInput
            label="Barva textu"
            value={countdownForm.watch('text_color')}
            onChange={(value) => countdownForm.setValue('text_color', value ?? '')}
          />
          <ColorInput
            label="Barva akcentu"
            value={countdownForm.watch('accent_color')}
            onChange={(value) => countdownForm.setValue('accent_color', value ?? '')}
          />
        </Group>
        <Group justify="flex-end">
          <Button type="submit" loading={countdownMutation.isPending}>
            Uložit plugin
          </Button>
        </Group>
      </Stack>
    </Card>
  );

  const renderSnowfallAdminForm = () => (
    <Card withBorder>
      <Stack gap="md" component="form" onSubmit={handleCreateSnowfallPlugin}>
        <Group grow>
          <Select
            label="E-shop"
            placeholder="Vyber e-shop"
            data={shopOptions}
            value={snowfallForm.watch('shop_id')}
            onChange={(value) => snowfallForm.setValue('shop_id', value ?? '')}
            required
          />
          <TextInput
            label="Název pluginu"
            placeholder="Např. Christmas snowfall"
            value={snowfallForm.watch('name')}
            onChange={(event) => snowfallForm.setValue('name', event.currentTarget.value)}
            required
          />
        </Group>
        <Autocomplete
          label="Bundle / soubor"
          description="Vyber, do kterého veřejného souboru se má efekt uložit."
          placeholder="např. main"
          data={snowfallBundleOptions}
          value={snowfallBundleKey}
          onChange={(value) => snowfallForm.setValue('bundle_key', value)}
        />
        <TagsInput
          label="Cesty kategorií"
          description="Zadej URL část za doménou, např. /parfemy/parfemovane-vody"
          placeholder="Přidej kategorii a potvrď Enterem"
          value={snowfallForm.watch('category_paths')}
          onChange={(value) => snowfallForm.setValue('category_paths', value)}
          withAsterisk
        />
        <Group grow>
          <ColorInput
            label="Barva vloček"
            value={snowfallForm.watch('flake_color')}
            onChange={(value) => snowfallForm.setValue('flake_color', value ?? '')}
          />
          <NumberInput
            label="Počet vloček (desktop)"
            min={20}
            max={400}
            value={snowfallForm.watch('flake_count_desktop')}
            onChange={(value) =>
              snowfallForm.setValue('flake_count_desktop', Number(value) || snowfallDefaults.flake_count_desktop)
            }
          />
          <NumberInput
            label="Počet vloček (mobil)"
            min={20}
            max={400}
            value={snowfallForm.watch('flake_count_mobile')}
            onChange={(value) =>
              snowfallForm.setValue('flake_count_mobile', Number(value) || snowfallDefaults.flake_count_mobile)
            }
          />
        </Group>
        <Group grow>
          <NumberInput
            label="Min. velikost"
            min={1}
            max={10}
            step={0.5}
            value={snowfallForm.watch('min_size')}
            onChange={(value) => snowfallForm.setValue('min_size', Number(value) || snowfallDefaults.min_size)}
          />
          <NumberInput
            label="Max. velikost"
            min={2}
            max={20}
            step={0.5}
            value={snowfallForm.watch('max_size')}
            onChange={(value) => snowfallForm.setValue('max_size', Number(value) || snowfallDefaults.max_size)}
          />
          <NumberInput
            label="Rychlost pádu"
            min={0.5}
            max={3}
            step={0.1}
            value={snowfallForm.watch('fall_speed')}
            onChange={(value) => snowfallForm.setValue('fall_speed', Number(value) || snowfallDefaults.fall_speed)}
          />
          <NumberInput
            label="Houpání"
            min={0.1}
            max={2}
            step={0.1}
            value={snowfallForm.watch('sway')}
            onChange={(value) => snowfallForm.setValue('sway', Number(value) || snowfallDefaults.sway)}
          />
        </Group>
        <Select
          label="Efekt třpytu"
          data={[
            { value: 'true', label: 'Zapnuto' },
            { value: 'false', label: 'Vypnuto' },
          ]}
          value={snowfallForm.watch('twinkle') ? 'true' : 'false'}
          onChange={(value) => snowfallForm.setValue('twinkle', value !== 'false')}
        />
        <Group justify="flex-end">
          <Button type="submit" loading={snowfallMutation.isPending}>
            Uložit plugin
          </Button>
        </Group>
      </Stack>
    </Card>
  );

  const renderAutoWidgetAdminForm = () => (
    <Card withBorder>
      <Stack gap="md" component="form" onSubmit={handleCreateAutoWidgetPlugin}>
        <Alert color="blue" variant="light">
          {autoWidgetDataSource === 'inventory_recommendations' ? (
            <>
              Na produktovém detailu přečteme <code>getShoptetDataLayer</code>, vybereme největší variantu a přes HUB
              načteme inventory recommendations, které se vloží do zvoleného selektoru.
            </>
          ) : (
            <>
              Skript sleduje <code>getShoptetDataLayer</code>, zjistí typ stránky a vloží vybraný widget z HUBu na
              označený selektor. Ideální pro widgety vytvořené v sekci Produkty → Widgety.
            </>
          )}
        </Alert>
        <Group grow>
          <Select
            label="E-shop"
            placeholder="Vyber e-shop"
            data={shopOptions}
            value={autoWidgetForm.watch('shop_id')}
            onChange={(value) => autoWidgetForm.setValue('shop_id', value ?? '')}
            required
          />
          <TextInput
            label="Název pluginu"
            placeholder="Např. „Doporučené na detailu“"
            value={autoWidgetForm.watch('name')}
            onChange={(event) => autoWidgetForm.setValue('name', event.currentTarget.value)}
            required
          />
        </Group>
        <Select
          label="Cíl uložení"
          description="Nech prázdné pro nový plugin, nebo vyber existující a vytvoří se nová verze."
          placeholder="Nový plugin"
          data={autoWidgetPluginOptions}
          searchable
          clearable
          value={autoWidgetForm.watch('plugin_id')}
          onChange={(value) => autoWidgetForm.setValue('plugin_id', value ?? '')}
        />
        <Autocomplete
          label="Bundle / soubor"
          description="Plugin se přidá do veřejného souboru, který nahraješ do Shoptetu."
          placeholder="např. main"
          data={autoWidgetBundleOptions}
          value={autoWidgetBundleKey}
          onChange={(value) => autoWidgetForm.setValue('bundle_key', value)}
        />
        <Select
          label="Widget"
          placeholder={autoWidgetWidgetsLoading ? 'Načítám widgety…' : 'Vyber publikovaný widget'}
          data={autoWidgetOptions}
          searchable
          allowDeselect
          disabled={autoWidgetWidgetsLoading}
          value={autoWidgetForm.watch('widget_id')}
          nothingFoundMessage={autoWidgetWidgetsLoading ? 'Načítám…' : 'Žádné publikované widgety'}
          onChange={(value) => autoWidgetForm.setValue('widget_id', value ?? '')}
          required
        />
        <Select
          label="Zdroj dat"
          data={[
            { value: 'widget', label: 'Statický widget (ruční obsah)' },
            { value: 'inventory_recommendations', label: 'Inventory recommendations' },
            { value: 'inventory_similarity', label: 'Podobné produkty (vlastnosti)' },
          ]}
          value={autoWidgetDataSource}
          onChange={(value) =>
            autoWidgetForm.setValue('data_source', (value as AutoWidgetFormValues['data_source']) ?? 'widget')
          }
        />
        <TextInput
          label="Nadpis widgetu (volitelné)"
          placeholder="Např. Podobné produkty"
          value={autoWidgetForm.watch('heading')}
          onChange={(event) => autoWidgetForm.setValue('heading', event.currentTarget.value)}
        />
        <TextInput
          label="ID kontejneru (volitelné)"
          description="Pokud necháš prázdné, doplníme výchozí. Pro podobný widget použij třeba reco-product-similar-erihub."
          placeholder="např. reco-product-similar-erihub"
          value={autoWidgetForm.watch('container_id')}
          onChange={(event) => autoWidgetForm.setValue('container_id', event.currentTarget.value)}
        />
        <MultiSelect
          label="Typy stránek"
          description="Stránky Shoptetu, na kterých se widget aktivuje (dle dataLayeru)."
          data={AUTO_WIDGET_PAGE_OPTIONS}
          value={autoWidgetForm.watch('page_targets')}
          onChange={(value) => autoWidgetForm.setValue('page_targets', value)}
          searchable
          withAsterisk
        />
        <TextInput
          label="CSS selektor"
          description="ID nebo třída prvku v šabloně (např. .p-detail-info nebo #homepage-widgets)."
          placeholder=".p-detail-info"
          value={autoWidgetForm.watch('selector')}
          onChange={(event) => autoWidgetForm.setValue('selector', event.currentTarget.value)}
          required
        />
        <Select
          label="Umístění vůči selektoru"
          data={AUTO_WIDGET_PLACEMENT_OPTIONS}
          value={autoWidgetForm.watch('placement')}
          onChange={(value) =>
            autoWidgetForm.setValue('placement', (value as AutoWidgetFormValues['placement']) ?? 'append')
          }
        />
        {autoWidgetDataSource === 'inventory_recommendations' ? (
          <NumberInput
            label="Počet doporučených produktů"
            description="Kolik položek se má načíst z inventory recommendations."
            min={1}
            max={12}
            value={autoWidgetForm.watch('recommendation_limit')}
            onChange={(value) =>
              autoWidgetForm.setValue('recommendation_limit', Number(value) || autoWidgetDefaults.recommendation_limit)
            }
          />
        ) : null}
        {autoWidgetDataSource === 'inventory_recommendations' ? (
          <Select
            label="Režim doporučovače"
            description="Zvol, zda má načíst jen vůně se stejnou inspirací/podobné, jiné (nevůně) se stejnou inspirací, nebo uložené doporučené produkty."
            data={[
              { value: 'fragrance', label: 'Stejná inspirace – vůně/parfémy' },
              { value: 'nonfragrance', label: 'Stejná inspirace – jiné produkty' },
              { value: 'product', label: 'Doporučené produkty (uložená tabulka)' },
            ]}
            value={autoWidgetForm.watch('recommendation_mode') || null}
            onChange={(value) =>
              autoWidgetForm.setValue('recommendation_mode', (value as AutoWidgetFormValues['recommendation_mode']) ?? '')
            }
          />
        ) : null}
        <Group grow>
          <NumberInput
            label="Max. pokusů o vložení"
            description="Počet pokusů, než skript zkusí znovu najít selektor (výchozí 60)."
            min={1}
            max={200}
            value={autoWidgetForm.watch('max_attempts')}
            onChange={(value) => autoWidgetForm.setValue('max_attempts', Number(value) || autoWidgetDefaults.max_attempts)}
          />
          <NumberInput
            label="Interval kontroly (ms)"
            description="Jak často hledat selektor při načítání (výchozí 500 ms)."
            min={100}
            max={5000}
            value={autoWidgetForm.watch('poll_interval_ms')}
            onChange={(value) =>
              autoWidgetForm.setValue('poll_interval_ms', Number(value) || autoWidgetDefaults.poll_interval_ms)
            }
          />
        </Group>
        <Group justify="flex-end">
          <Button type="submit" loading={autoWidgetMutation.isPending}>
            Uložit widget
          </Button>
        </Group>
      </Stack>
    </Card>
  );

  const renderAdventAdminForm = () => {
    const themeOptions: { value: AdventCalendarFormValues['decor_variant']; label: string }[] = [
      { value: 'classic', label: 'Klasická zimní noc' },
      { value: 'gingerbread', label: 'Perníková atmosféra' },
      { value: 'frost', label: 'Ledové království' },
    ];

    return (
      <Card withBorder>
        <Stack gap="lg" component="form" onSubmit={handleCreateAdventCalendarPlugin}>
          <Stack gap="md">
            <Group align="flex-end" grow>
              <Select
                label="Načíst uložený kalendář"
                placeholder={adventPresetOptions.length ? 'Vyber kalendář k úpravě' : 'Zatím žádné kalendáře'}
                data={adventPresetOptions}
                value={selectedAdventPresetId}
                onChange={(value) => {
                  setSelectedAdventPresetId(value);
                  if (!value) {
                    adventForm.reset(buildAdventDefaults());
                  }
                }}
                clearable
                searchable
              />
              <Button
                variant="subtle"
                onClick={() => {
                  setSelectedAdventPresetId(null);
                  adventForm.reset(buildAdventDefaults());
                }}
                type="button"
              >
                Nový kalendář
              </Button>
            </Group>
            <Group grow>
              <Select
                label="E-shop"
                placeholder="Vyber e-shop"
                data={shopOptions}
                value={adventForm.watch('shop_id')}
                onChange={(value) => adventForm.setValue('shop_id', value ?? '')}
                required
              />
              <TextInput
                label="Název pluginu"
                placeholder="Adventní kalendář 2025"
                value={adventForm.watch('name')}
                onChange={(event) => adventForm.setValue('name', event.currentTarget.value)}
                required
              />
            </Group>
            <Group grow>
              <TextInput
                type="date"
                label="Začátek kalendáře"
                value={adventForm.watch('start_date')}
                onChange={(event) => adventForm.setValue('start_date', event.currentTarget.value)}
                required
              />
              <TextInput
                label="Časové pásmo"
                placeholder="Europe/Prague"
                value={adventForm.watch('timezone')}
                onChange={(event) => adventForm.setValue('timezone', event.currentTarget.value)}
                required
              />
            </Group>
            <Autocomplete
              label="Bundle / soubor"
              placeholder="např. main"
              data={adventBundleOptions}
              value={adventBundleKey}
              onChange={(value) => adventForm.setValue('bundle_key', value ?? 'main')}
            />
            <Group grow>
              <Select
                label="Vizuální styl"
                data={themeOptions}
                value={adventDecorVariant}
                onChange={(value) => adventForm.setValue('decor_variant', (value as AdventCalendarFormValues['decor_variant']) ?? 'classic')}
              />
              <Switch
                label="Přidat jemné sněžení do karty"
                checked={adventSnowToggle}
                onChange={(event) => adventForm.setValue('enable_snowfall', event.currentTarget.checked)}
              />
              <Switch
                label="Zobrazit odpočet do dalšího dne"
                checked={adventCountdownToggle}
                onChange={(event) => adventForm.setValue('show_countdown', event.currentTarget.checked)}
              />
            </Group>
            <Group grow>
              <TextInput
                label="Text štítku u dekoru"
                placeholder="Adventní okénko"
                value={adventCardLabel}
                onChange={(event) => adventForm.setValue('card_label', event.currentTarget.value)}
              />
              <TextInput
                label="Text před odpočtem"
                placeholder="Další překvapení za"
                value={adventCountdownPrefix}
                onChange={(event) => adventForm.setValue('countdown_prefix', event.currentTarget.value)}
                disabled={!adventCountdownToggle}
              />
              <TextInput
                label="Text po skončení odpočtu"
                placeholder="Další okénko je připraveno!"
                value={adventCountdownComplete}
                onChange={(event) => adventForm.setValue('countdown_complete', event.currentTarget.value)}
                disabled={!adventCountdownToggle}
              />
            </Group>
            <TagsInput
              label="URL pro přehled všech okének"
              description="Na těchto adresách se zobrazí i mřížka s kompletním kalendářem."
              placeholder="např. /advent"
              value={adventForm.watch('overview_targets')}
              onChange={(value) => adventForm.setValue('overview_targets', value)}
              clearable
            />
          </Stack>
          <Divider label="Dny kalendáře" labelPosition="left" />
          <Stack gap="lg">
            {adventDayFields.map((field, index) => (
              <Card key={field.id} withBorder shadow="xs">
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-start">
                    <Title order={5}>Den {field.day}</Title>
                    <TextInput
                      label="Nadpis (volitelné)"
                      placeholder={`Např. Okénko ${field.day}`}
                      value={adventForm.watch(`days.${index}.title`)}
                      onChange={(event) => adventForm.setValue(`days.${index}.title`, event.currentTarget.value)}
                    />
                  </Group>
                  <Controller
                    control={adventForm.control}
                    name={`days.${index}.targets`}
                    render={({ field: controllerField }) => (
                      <TagsInput
                        label="URL cesty (kategorie nebo produkt)"
                        description="Např. /parfemy/damske nebo /produkt/saphir-oui. Přidej více záznamů."
                        placeholder="Zadej adresu a potvrď Enterem"
                        value={controllerField.value}
                        onChange={controllerField.onChange}
                        clearable
                      />
                    )}
                  />
                  <Controller
                    control={adventForm.control}
                    name={`days.${index}.html`}
                    render={({ field }) => (
                      <div>
                        <Text fw={500} size="sm">
                          HTML obsah
                        </Text>
                        <AdventDayContentEditor value={field.value} onChange={field.onChange} />
                      </div>
                    )}
                  />
                </Stack>
              </Card>
            ))}
          </Stack>
          <Group justify="flex-end">
            <Button type="submit" loading={adventMutation.isPending}>
              Uložit kalendář
            </Button>
          </Group>
        </Stack>
      </Card>
    );
  };

  const renderActiveAdminForm = () => {
    if (activeAdminPlugin === 'countdown') {
      return renderCountdownAdminForm();
    }

    if (activeAdminPlugin === 'snowfall') {
      return renderSnowfallAdminForm();
    }

    if (activeAdminPlugin === 'autoWidget') {
      return renderAutoWidgetAdminForm();
    }

    if (activeAdminPlugin === 'advent') {
      return renderAdventAdminForm();
    }

    return (
      <Card withBorder>
        <Stack gap="xs">
          <Title order={5}>Vyber plugin</Title>
          <Text c="gray.6">Klikni na „Vytvořit“ u jednoho z předpřipravených pluginů výše a zobrazí se jeho konfigurace.</Text>
        </Stack>
      </Card>
    );
  };

  return (
    <Stack gap="xl">
      <Title order={3}>AI pluginy</Title>
      <Tabs value={activeTab} onChange={(value) => setActiveTab(value as 'generate' | 'manage' | 'countdown')}>
        <Tabs.List>
          <Tabs.Tab value="generate">Generátor</Tabs.Tab>
          <Tabs.Tab value="manage">Správa pluginů</Tabs.Tab>
          <Tabs.Tab value="countdown">Administrace</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="generate" pt="md">
          <Card withBorder>
            <Stack gap="md" component="form" onSubmit={onSubmit}>
              <div>
                <Title order={4}>Zadání pro asistenta</Title>
                <Text c="gray.6" size="sm">
                  Popiš, jaký widget nebo skript chceš vytvořit. AI vrátí kompletní JavaScriptový soubor připravený pro
                  vložení do Shoptetu (Nastavení → Editor → Vlastní JavaScript).
                </Text>
              </div>
              <Group align="flex-end" gap="md">
                <Select
                  label="Šablona"
                  placeholder="Vyber šablonu"
                  data={templateOptions}
                  value={selectedTemplateId ? String(selectedTemplateId) : null}
                  onChange={(value) => setSelectedTemplateId(value ? Number(value) : null)}
                  searchable
                  clearable
                  style={{ flex: 1 }}
                />
                <Tooltip label="Vytvořit novou šablonu" withinPortal>
                  <ActionIcon variant="filled" color="blue" size="lg" onClick={() => {
                    openCreateTemplateModal();
                  }}>
                    <IconPlus size={18} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <Controller
                name="plugin_type"
                control={form.control}
                render={({ field }) => (
                  <Select
                    label="Typ pluginu"
                    data={[
                      { value: 'banner', label: 'Vizuální banner / widget' },
                      { value: 'function', label: 'Funkční logika / integrace' },
                    ]}
                    value={field.value}
                    onChange={(value) => field.onChange(value ?? 'banner')}
                    disabled={mutation.isPending}
                    description="Banner vytvoří UI náhled, funkce jen doplní chování stávajících prvků."
                  />
                )}
              />
              <Controller
                name="shop_id"
                control={form.control}
                rules={{ required: 'Vyber e-shop.' }}
                render={({ field }) => (
                  <Select
                    label="E-shop"
                    placeholder="Vyber e-shop"
                    data={shopOptions}
                    value={field.value}
                    onChange={(value) => field.onChange(value ?? '')}
                    searchable
                    clearable={false}
                    disabled={mutation.isPending || shopsLoading}
                    error={form.formState.errors.shop_id?.message}
                  />
                )}
              />
              <Controller
                name="bundle_key"
                control={form.control}
                render={({ field }) => (
                  <Autocomplete
                    label="Bundle / soubor"
                    placeholder="např. main"
                    description="Plugin se vloží do této veřejné URL adresy pro zvolený e-shop."
                    data={generatorBundleOptions}
                    value={field.value}
                    onChange={(value) => field.onChange(value)}
                    disabled={mutation.isPending}
                  />
                )}
              />
              <Controller
                name="language"
                control={form.control}
                render={({ field }) => (
                  <Select
                    label="Výstupní jazyk"
                    data={languageOptions}
                    value={field.value}
                    onChange={(value) => field.onChange(value ?? 'cs')}
                    disabled={mutation.isPending}
                    description="V tomto jazyce budou generované texty včetně shrnutí či instrukcí."
                  />
                )}
              />
              <TextInput
                label="Název pluginu"
                placeholder="Např. Plovoucí banner dopravy zdarma"
                withAsterisk
                autoComplete="off"
                disabled={mutation.isPending}
                {...form.register('name', { required: 'Název je povinný.' })}
                error={form.formState.errors.name?.message}
              />
              <Textarea
                label="Co má plugin dělat"
                placeholder="Detailně popiš funkcionalitu, interakce a očekávaný výstup."
                autosize
                minRows={4}
                withAsterisk
                disabled={mutation.isPending}
                {...form.register('goal', { required: 'Zadání je povinné.' })}
                error={form.formState.errors.goal?.message}
              />
              <TextInput
                label="Umístění v Shoptetu"
                placeholder="Např. Produktový detail, košík, hlavička stránky"
                disabled={mutation.isPending}
                {...form.register('shoptet_surface')}
              />
              <Textarea
                label="Data nebo prvky, které má skript využít"
                placeholder="Např. čti cenu z .product-detail__price, pracuj s dataLayer objednávky."
                autosize
                minRows={2}
                disabled={mutation.isPending}
                {...form.register('data_sources')}
              />
              <Textarea
                label="Další poznámky"
                placeholder="Např. dodrž barvy značky, nesmí překrývat košík, podporuj mobil."
                autosize
                minRows={2}
                disabled={mutation.isPending}
                {...form.register('additional_notes')}
              />
              {pluginType === 'banner' ? (
                <>
                  <Group grow>
                    <Controller
                      name="brand_primary_color"
                      control={form.control}
                      render={({ field }) => (
                        <ColorInput
                          label="Primární barva"
                          description="Použije se pro CTA, zvýraznění a akcenty."
                          value={field.value ?? ''}
                          onChange={field.onChange}
                          disabled={mutation.isPending}
                        />
                      )}
                    />
                    <Controller
                      name="brand_secondary_color"
                      control={form.control}
                      render={({ field }) => (
                        <ColorInput
                          label="Sekundární barva"
                          description="Pro doprovodné prvky a texty."
                          value={field.value ?? ''}
                          onChange={field.onChange}
                          disabled={mutation.isPending}
                        />
                      )}
                    />
                  </Group>
                  <TextInput
                    label="Font rodina"
                    description="Např. 'Roboto, sans-serif'"
                    disabled={mutation.isPending}
                    {...form.register('brand_font_family')}
                  />
                </>
              ) : (
                <Alert color="blue" variant="light">
                  <Text size="sm">
                    Pro typ „funkce“ nepotřebujeme vizuální brand parametry. Skript jen rozšíří chování stávajících prvků.
                  </Text>
                </Alert>
              )}
              <Group justify="flex-end">
                <Button type="submit" loading={mutation.isPending}>
                  Vygenerovat plugin
                </Button>
              </Group>
            </Stack>
          </Card>

          {result ? (
            <Card withBorder mt="md">
              <Stack gap="md">
                <div>
                  <Group justify="space-between" align="flex-start">
                    <Stack gap={4}>
                      <Title order={4}>{result.file.filename}</Title>
                      <Text size="sm" c="gray.6">
                        {result.summary || 'Plugin vygenerovaný na základě zadání.'}
                      </Text>
                    <Group gap="xs">
                      <Badge color="blue" variant="light">
                        Verze #{result.version}
                      </Badge>
                      <Badge color="teal" variant="light">
                        {plugins.find((plugin) => plugin.id === result.plugin_id)?.shop_name ?? `Shop #${result.shop_id}`}
                      </Badge>
                      <Badge color={result.metadata?.plugin_type === 'banner' ? 'violet' : 'gray'} variant="light">
                        {result.metadata?.plugin_type === 'banner' ? 'Banner' : 'Funkce'}
                      </Badge>
                      {result.metadata?.language ? (
                        <Badge color="gray" variant="light">
                          Jazyk: {result.metadata.language?.toUpperCase()}
                        </Badge>
                      ) : null}
                      </Group>
                      {result.metadata?.brand ? (
                        <Group gap="xs">
                          {result.metadata.brand.primary_color ? (
                            <Badge color="gray" variant="light">
                              Primární: {result.metadata.brand.primary_color}
                            </Badge>
                          ) : null}
                          {result.metadata.brand.secondary_color ? (
                            <Badge color="gray" variant="light">
                              Sekundární: {result.metadata.brand.secondary_color}
                            </Badge>
                          ) : null}
                          {result.metadata.brand.font_family ? (
                            <Badge color="gray" variant="light">
                              Font: {result.metadata.brand.font_family}
                            </Badge>
                          ) : null}
                        </Group>
                      ) : null}
                      {result.created_at ? (
                        <Text size="xs" c="gray.6">
                          Uloženo {formatDateTime(result.created_at)}
                        </Text>
                      ) : null}
                    </Stack>
                    <Group gap="xs">
                      <Button variant="default" leftSection={<IconCopy size={16} />} onClick={handleCopyResultCode}>
                        Zkopírovat kód
                      </Button>
                      <Button leftSection={<IconDownload size={16} />} onClick={handleDownloadResult}>
                        Stáhnout .js
                      </Button>
                    </Group>
                  </Group>
                </div>

                {result.metadata?.plugin_type === 'banner' ? (
                  <div>
                    <Title order={5}>Náhled pluginu</Title>
                    <iframe
                      ref={previewRef}
                      title="plugin-preview"
                      style={{ width: '100%', height: 480, border: '1px solid #dee2e6', borderRadius: 12 }}
                    />
                  </div>
                ) : (
                  <Alert color="blue" variant="light">
                    <Text size="sm">
                      Tento plugin je typu „funkce“. Zaměř se na popis a kód – vizuální náhled není k dispozici.
                    </Text>
                  </Alert>
                )}

                {result.installation_steps.length > 0 ? (
                  <div>
                    <Title order={5}>Instalace</Title>
                    <List spacing="xs" size="sm" mt="xs">
                      {result.installation_steps.map((step) => (
                        <List.Item key={step}>{step}</List.Item>
                      ))}
                    </List>
                  </div>
                ) : null}

                {result.testing_checklist.length > 0 ? (
                  <div>
                    <Title order={5}>Kontrola funkčnosti</Title>
                    <List spacing="xs" size="sm" mt="xs">
                      {result.testing_checklist.map((item) => (
                        <List.Item key={item}>{item}</List.Item>
                      ))}
                    </List>
                  </div>
                ) : null}

                {result.warnings.length > 0 ? (
                  <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
                    <Stack gap={4}>
                      {result.warnings.map((warning) => (
                        <Text key={warning} size="sm">
                          {warning}
                        </Text>
                      ))}
                    </Stack>
                  </Alert>
                ) : null}

                <div>
                  <Group justify="space-between" mb="xs">
                    <Title order={5}>Generovaný kód</Title>
                    <Text size="xs" c="gray.6">
                      JavaScript · {result.file.code.split('\n').length} řádků
                    </Text>
                  </Group>
                  <Textarea
                    value={result.file.code}
                    readOnly
                    autosize
                    minRows={18}
                    styles={{ input: { fontFamily: 'Menlo, Consolas, Monaco, monospace', fontSize: 13 } }}
                  />
                </div>
              </Stack>
            </Card>
          ) : null}
        </Tabs.Panel>

        <Tabs.Panel value="manage" pt="md">
          <Card withBorder mb="md">
            <Stack gap="md">
              <div>
                <Title order={4}>Veřejné soubory pro Shoptet</Title>
                <Text c="gray.6" size="sm">
                  Každý e-shop má vlastní URL, kterou vložíš do Shoptetu (Nastavení → Editor → Vlastní JavaScript). Všechna
                  přiřazená rozšíření se sloučí a za označením najdeš komentáře se začátkem a koncem pluginu.
                </Text>
              </div>
              <Group grow align="flex-end">
                <Select
                  label="E-shop"
                  placeholder="Vyber e-shop"
                  data={shopOptions}
                  value={publicShopId || null}
                  onChange={(value) => setPublicShopId(value ?? '')}
                  searchable
                  disabled={shopOptions.length === 0}
                />
                <Autocomplete
                  label="Bundle / soubor"
                  placeholder="např. main"
                  data={publicBundleOptions}
                  value={publicBundleKey}
                  onChange={(value) => setPublicBundleKey(value)}
                  disabled={!publicShopId}
                />
              </Group>
              <TextInput
                label="Veřejná URL souboru"
                placeholder="Vyber e-shop"
                value={publicScriptUrl}
                readOnly
                rightSection={
                  publicScriptUrl ? (
                    <Tooltip label="Zkopírovat URL" withinPortal>
                      <ActionIcon variant="subtle" onClick={handleCopyPublicUrl}>
                        <IconCopy size={16} />
                      </ActionIcon>
                    </Tooltip>
                  ) : undefined
                }
              />
              <TextInput
                label="HTML snippet"
                description={
                  <>
                    Zkopíruj a vlož ho těsně před <code>{'</body>'}</code> do Shoptetu nebo do Správce kódů.
                  </>
                }
                placeholder={'<script src="..."></script>'}
                value={publicScriptTag}
                readOnly
                rightSection={
                  publicScriptTag ? (
                    <Tooltip label="Zkopírovat snippet" withinPortal>
                      <ActionIcon variant="subtle" onClick={handleCopyPublicTag}>
                        <IconCopy size={16} />
                      </ActionIcon>
                    </Tooltip>
                  ) : undefined
                }
              />
              <Text c="gray.6" size="xs">
                Pokud zvolíš jiný bundle než <em>main</em>, URL se doplní o parametr <code>?bundle=…</code>, takže můžeš
                snadno provozovat více widgetů paralelně.
              </Text>
            </Stack>
          </Card>
          <Card withBorder>
            <Stack gap="md">
              <div>
                <Title order={4}>Uložené pluginy</Title>
                <Text c="gray.6" size="sm">
                  Každé vygenerování vytvoří novou verzi. Odtud můžeš pluginy stáhnout nebo zkopírovat kód bez nutnosti
                  zasahovat do Shoptetu.
                </Text>
              </div>
              {renderPluginsTable()}
            </Stack>
          </Card>

          <Card withBorder mt="md">
            <Stack gap="md">
              <Group justify="space-between" align="flex-start">
                <div>
                  <Title order={4}>Šablony pluginů</Title>
                  <Text c="gray.6" size="sm">
                    Spravuj přednastavené scénáře. Systémové šablony nejde odstranit, ale můžeš z nich vycházet.
                  </Text>
                </div>
                <Button leftSection={<IconPlus size={16} />} onClick={openCreateTemplateModal}>
                  Nová šablona
                </Button>
              </Group>
              {templatesLoading ? (
                <Stack gap="sm">
                  <Skeleton height={50} radius="md" />
                  <Skeleton height={50} radius="md" />
                </Stack>
              ) : templates.length === 0 ? (
                <Text c="gray.6">Zatím nejsou definované žádné šablony.</Text>
              ) : (
                <ScrollArea offsetScrollbars h={280}>
                  <Table withTableBorder highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Název</Table.Th>
                        <Table.Th>Typ</Table.Th>
                        <Table.Th>Jazyk</Table.Th>
                        <Table.Th>Popis</Table.Th>
                        <Table.Th>Akce</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {templates.map((template) => (
                        <Table.Tr key={template.id}>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text fw={600}>{template.name}</Text>
                              {template.description ? (
                                <Text size="xs" c="gray.6">
                                  {template.description}
                                </Text>
                              ) : null}
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Badge color={template.plugin_type === 'banner' ? 'violet' : 'gray'} variant="light">
                              {template.plugin_type === 'banner' ? 'Banner' : 'Funkce'}
                            </Badge>
                          </Table.Td>
                          <Table.Td>{template.language?.toUpperCase() ?? '—'}</Table.Td>
                          <Table.Td>{template.goal.slice(0, 80)}{template.goal.length > 80 ? '…' : ''}</Table.Td>
                          <Table.Td>
                            <Group gap="xs">
                              <Tooltip label="Upravit" withinPortal>
                                <ActionIcon
                                  variant="subtle"
                                  onClick={() => handleEditTemplate(template)}
                                  disabled={template.is_system}
                                >
                                  <IconEdit size={16} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label={template.is_system ? 'Systémovou šablonu nelze odstranit' : 'Odstranit'} withinPortal>
                                <ActionIcon
                                  variant="subtle"
                                  color="red"
                                  onClick={() => handleDeleteTemplateConfirm(template)}
                                  disabled={template.is_system}
                                >
                                  <IconTrash size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              )}
            </Stack>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="countdown" pt="md">
          <Stack gap="lg">
            <Alert icon={<IconAlertTriangle size={16} />} color="blue" variant="light">
              Všechny pluginy se servírují přes veřejné bundle soubory. Vyber předpřipravený typ a vyplň pouze nezbytné
              údaje – zbytek zajistíme za tebe.
            </Alert>
            <Card withBorder>
              <Stack gap="md">
                <div>
                  <Title order={4}>Předpřipravené pluginy</Title>
                  <Text c="gray.6" size="sm">
                    Plugin se uloží do zvoleného e-shopu a bundlu. Nasazení dokončíš vložením veřejné URL do Shoptetu.
                  </Text>
                </div>
                <Stack gap="sm">
                  {adminPluginDefinitions.map((plugin) => (
                    <Card withBorder key={plugin.type} radius="md">
                      <Group justify="space-between" align="flex-start">
                        <Stack gap={4}>
                          <Group gap="xs">
                            <Title order={5}>{plugin.title}</Title>
                            <Badge color="gray" variant="light">
                              {plugin.badge}
                            </Badge>
                          </Group>
                          <Text c="gray.6" size="sm">
                            {plugin.description}
                          </Text>
                        </Stack>
                        <Button
                          variant={activeAdminPlugin === plugin.type ? 'filled' : 'light'}
                          onClick={() => setActiveAdminPlugin(plugin.type)}
                        >
                          Vytvořit
                        </Button>
                      </Group>
                    </Card>
                  ))}
                </Stack>
              </Stack>
            </Card>
            {renderActiveAdminForm()}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <Drawer opened={drawerOpened} onClose={handleCloseDrawer} position="right" size="lg" title={selectedPlugin?.name ?? 'Plugin'}>
        <Stack gap="lg">
          <div>
            <Text size="sm" c="gray.6">
              {selectedPlugin ? `Plugin pro ${selectedPlugin.shop_name ?? `shop #${selectedPlugin.shop_id}`}` : 'Načítám data…'}
            </Text>
          </div>
          <Divider label="Verze" labelPosition="left" />
          {renderVersionsList()}
          <Divider label="Detail verze" labelPosition="left" />
          {renderVersionDetail()}
        </Stack>
      </Drawer>

      <Modal
        opened={templateModalOpened}
        onClose={closeTemplateModal}
        title={editingTemplate ? 'Upravit šablonu' : 'Nová šablona'}
        size="lg"
        centered
      >
        <Stack gap="md" component="form" onSubmit={handleSubmitTemplate}>
          <TextInput
            label="Název"
            withAsterisk
            {...templateForm.register('name', { required: 'Název je povinný.' })}
            error={templateForm.formState.errors.name?.message}
          />
          <Select
            label="Typ plug-inu"
            data={[
              { value: 'banner', label: 'Banner / widget' },
              { value: 'function', label: 'Funkční logika' },
            ]}
            value={templateForm.watch('plugin_type')}
            onChange={(value) => templateForm.setValue('plugin_type', (value as 'banner' | 'function') ?? 'banner')}
          />
          <TextInput label="Krátký popis" {...templateForm.register('description')} />
          <Textarea label="Zadání" withAsterisk minRows={3} {...templateForm.register('goal', { required: 'Zadání je povinné.' })} />
          <TextInput label="Umístění v Shoptetu" {...templateForm.register('shoptet_surface')} />
          <Textarea label="Dostupná data / selektory" minRows={2} {...templateForm.register('data_sources')} />
          <Textarea label="Další poznámky" minRows={2} {...templateForm.register('additional_notes')} />
          <Select
            label="Výstupní jazyk"
            data={languageOptions}
            value={templateForm.watch('language')}
            onChange={(value) => templateForm.setValue('language', value ?? 'cs')}
          />
          {templateForm.watch('plugin_type') === 'banner' ? (
            <>
              <Group grow>
                <Controller
                  name="brand_primary_color"
                  control={templateForm.control}
                  render={({ field }) => (
                    <ColorInput label="Primární barva" value={field.value ?? ''} onChange={field.onChange} />
                  )}
                />
                <Controller
                  name="brand_secondary_color"
                  control={templateForm.control}
                  render={({ field }) => (
                    <ColorInput label="Sekundární barva" value={field.value ?? ''} onChange={field.onChange} />
                  )}
                />
              </Group>
              <TextInput label="Font rodina" {...templateForm.register('brand_font_family')} />
            </>
          ) : null}
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={closeTemplateModal}>
              Zrušit
            </Button>
            <Button type="submit" loading={createTemplate.isPending || updateTemplate.isPending}>
              {editingTemplate ? 'Uložit změny' : 'Vytvořit šablonu'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={pluginEditModalOpened} onClose={handleClosePluginModal} title="Upravit plugin" centered>
        <Stack gap="md" component="form" onSubmit={handleSubmitPluginEdit}>
          <TextInput
            label="Název pluginu"
            withAsterisk
            {...pluginEditForm.register('name', { required: 'Název je povinný.' })}
            error={pluginEditForm.formState.errors.name?.message}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={handleClosePluginModal}>
              Zrušit
            </Button>
            <Button type="submit" loading={updatePlugin.isPending}>
              Uložit změny
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};
