import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  ColorInput,
  Grid,
  Drawer,
  Divider,
  Group,
  Image,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconChevronDown,
  IconChevronRight,
  IconCode,
  IconCloudUpload,
  IconHourglass,
  IconDiscount2,
  IconEdit,
  IconEye,
  IconLanguage,
  IconPhoto,
  IconPhotoPlus,
  IconPlugConnected,
  IconPlus,
  IconRefresh,
  IconSparkles,
  IconTrash,
} from '@tabler/icons-react';
import { RichTextEditor } from '@mantine/tiptap';
import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { JSONContent } from '@tiptap/core';
import { Node, mergeAttributes } from '@tiptap/core';
import { useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import TiptapImage from '@tiptap/extension-image';
import type {
  GenerateCategoryContentResponse,
  TranslateCategoryContentResponse,
  ShopTreeNode,
} from '../../../api/pim';
import type { Shop } from '../../../api/shops';
import { useCategoryTree } from '../../pim/hooks/useCategoryTree';
import {
  useCreateShopCategoryNode,
  useDeleteShopCategoryNode,
  usePushShopCategoryNodeDescription,
  useSyncShopCategories,
  useUpdateShopCategoryNode,
} from '../../pim/hooks/useShopCategoryTreeMutations';
import { useGenerateCategoryContent } from '../../pim/hooks/useCategoryAiContent';
import { useTranslateCategoryContent } from '../../pim/hooks/useCategoryAiTranslation';
import { useShops } from '../../shoptet/hooks/useShops';
import { useShoptetPlugins } from '../../settings/hooks/useShoptetPlugins';
import { SectionPageShell } from '../../../components/layout/SectionPageShell';

const EMPTY_SHOPS: Shop[] = [];
const EMPTY_SHOP_TREE: ShopTreeNode[] = [];

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const getErrorMessage = (error: unknown): string => {
  if (error && typeof error === 'object') {
    const maybeResponse = (error as { response?: { data?: unknown } }).response;
    if (maybeResponse && typeof maybeResponse === 'object') {
      const rawData = maybeResponse.data;
      if (rawData && typeof rawData === 'object') {
        const data = rawData as { message?: unknown; errors?: Record<string, unknown> };
        if (typeof data.message === 'string') {
          return data.message;
        }

        if (data.errors) {
          const firstEntry = Object.values(data.errors)[0];
          if (Array.isArray(firstEntry) && typeof firstEntry[0] === 'string') {
            return firstEntry[0];
          }
        }
      }
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Došlo k neočekávané chybě.';
};

const toLocalDateTimeInputValue = (value: string | null | undefined): string => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const fromLocalDateTimeInputValue = (value: string): string => {
  if (!value) {
    return '';
  }
  const [datePart, timePart] = value.split('T');
  if (!datePart || !timePart) {
    return value;
  }
  const [yearStr, monthStr, dayStr] = datePart.split('-');
  const [hourStr, minuteStr] = timePart.split(':');
  const date = new Date(
    Number(yearStr),
    Number(monthStr) - 1,
    Number(dayStr),
    Number(hourStr),
    Number(minuteStr)
  );
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString();
};

const normalizeSizeInput = (value: string): number | string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const compact = trimmed.replace(/\s+/g, '');
  if (/^[0-9]+(?:\.[0-9]+)?$/.test(compact)) {
    return Number(compact);
  }
  if (/^[0-9]+(?:\.[0-9]+)?%$/.test(compact)) {
    return compact;
  }
  if (/^(auto|none)$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return trimmed;
};

const formatSizeInputValue = (value: number | string | null | undefined): string =>
  value === null || value === undefined ? '' : String(value);

type FlatNode = {
  node: ShopTreeNode;
  depth: number;
  parentId: string | null;
  order: number;
};

const flattenNodes = (nodes: ShopTreeNode[], depth = 0, parentId: string | null = null): FlatNode[] =>
  nodes.flatMap((node, index) => [
    { node, depth, parentId, order: index },
    ...flattenNodes(node.children, depth + 1, node.id),
  ]);

const collectDescendantIds = (node: ShopTreeNode): string[] =>
  node.children.flatMap((child) => [child.id, ...collectDescendantIds(child)]);

const findNodeById = (nodes: ShopTreeNode[], id: string): ShopTreeNode | null => {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }

    const match = findNodeById(node.children, id);
    if (match) {
      return match;
    }
  }

  return null;
};

const DivBlock = Node.create({
  name: 'divBlock',
  group: 'block',
  content: 'block*',
  defining: true,
  selectable: false,
  parseHTML() {
    return [
      {
        tag: 'div',
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const { dataWidget, dataRole, dataDeadline, dataLayout, dataFormat, style, ...rest } = HTMLAttributes as {
      dataWidget?: string | null;
      dataRole?: string | null;
      dataDeadline?: string | null;
      dataLayout?: string | null;
      dataFormat?: string | null;
      style?: string | null;
    };

    const attrs: Record<string, string> = { ...rest };
    if (dataWidget) {
      attrs['data-widget'] = dataWidget;
    }
    if (dataRole) {
      attrs['data-role'] = dataRole;
    }
    if (dataDeadline) {
      attrs['data-deadline'] = dataDeadline;
    }
    if (dataLayout) {
      attrs['data-layout'] = dataLayout;
    }
    if (dataFormat) {
      attrs['data-format'] = dataFormat;
    }
    if (style) {
      attrs.style = style;
    }

    return ['div', mergeAttributes(attrs), 0];
  },
  addAttributes() {
    return {
      id: {
        default: null,
      },
      class: {
        default: null,
      },
      dataWidget: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-widget'),
        renderHTML: () => ({}),
      },
      dataRole: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-role'),
        renderHTML: () => ({}),
      },
      dataDeadline: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-deadline'),
        renderHTML: () => ({}),
      },
      dataLayout: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-layout'),
        renderHTML: () => ({}),
      },
      dataFormat: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-format'),
        renderHTML: () => ({}),
      },
      style: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('style'),
        renderHTML: () => ({}),
      },
    };
  },
});

const ScriptBlock = Node.create({
  name: 'scriptBlock',
  group: 'block',
  content: 'text*',
  selectable: false,
  defining: true,
  isolating: true,
  parseHTML() {
    return [
      {
        tag: 'script',
        preserveWhitespace: 'full',
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['script', mergeAttributes(HTMLAttributes), 0];
  },
  addAttributes() {
    return {
      id: {
        default: null,
      },
      type: {
        default: null,
      },
      src: {
        default: null,
      },
    };
  },
});

type TreeNodeProps = {
  node: ShopTreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onAddChild: (node: ShopTreeNode) => void;
  onEdit: (node: ShopTreeNode) => void;
  onDelete: (node: ShopTreeNode) => void;
};

const TreeNode = ({ node, depth, expanded, onToggle, onAddChild, onEdit, onDelete }: TreeNodeProps) => {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id) || depth === 0;

  return (
    <Stack gap={6} pl={depth > 0 ? 'md' : 0} style={{ borderLeft: depth > 0 ? '1px solid var(--mantine-color-gray-2)' : 'none' }}>
      <Group gap="xs" justify="space-between" style={{ padding: '4px 6px', borderRadius: 6, backgroundColor: 'var(--mantine-color-gray-0)' }}>
        <Group gap={6}>
          {hasChildren ? (
            <ActionIcon
              size="xs"
              variant="subtle"
              onClick={() => onToggle(node.id)}
              aria-label={isExpanded ? 'Sbalit kategorii' : 'Rozbalit kategorii'}
            >
              {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            </ActionIcon>
          ) : (
            <div style={{ width: 18 }} />
          )}
          <Stack gap={0}>
            <Text size="sm" fw={500}>
              {node.name}
            </Text>
            {node.path ? (
              <Text size="xs" c="dimmed">
                {node.path}
              </Text>
            ) : null}
            {node.url ? (
              <Text size="xs" c="dimmed">
                {node.url}
              </Text>
            ) : null}
          </Stack>
        </Group>
        <Group gap={4}>
          {node.visible === false ? (
            <Badge color="gray" size="xs" variant="filled">
              Skrytá
            </Badge>
          ) : null}
          <Tooltip label="Přidat podkategorii">
            <ActionIcon size="sm" variant="light" onClick={() => onAddChild(node)} aria-label="Přidat podkategorii">
              <IconPlus size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Upravit kategorii">
            <ActionIcon size="sm" variant="light" onClick={() => onEdit(node)} aria-label="Upravit kategorii">
              <IconEdit size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Smazat kategorii">
            <ActionIcon size="sm" variant="light" color="red" onClick={() => onDelete(node)} aria-label="Smazat kategorii">
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      {isExpanded && hasChildren ? (
        <Stack gap={8}>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
};

type RichContentEditorProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
  toolbar?: ReactNode;
  onEditorReady?: (editor: Editor | null) => void;
  onImageRequest?: () => void;
};

const RichContentEditor = ({
  label,
  value,
  onChange,
  placeholder,
  description,
  toolbar,
  onEditorReady,
  onImageRequest,
}: RichContentEditorProps) => {
  const [mode, setMode] = useState<'wysiwyg' | 'preview' | 'code'>('wysiwyg');
  const modeRef = useRef<'wysiwyg' | 'preview' | 'code'>(mode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
        Underline,
        Link.configure({ openOnClick: false, autolink: true }),
        Placeholder.configure({ placeholder: placeholder ?? 'Napiš obsah…' }),
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        TiptapImage.configure({ inline: false, allowBase64: true }),
        DivBlock,
        ScriptBlock,
      ],
      content: value || '',
      onUpdate: ({ editor: instance }) => {
        if (modeRef.current === 'wysiwyg') {
          onChange(instance.getHTML());
        }
      },
    },
    [onChange, placeholder]
  );

  useEffect(() => {
    if (onEditorReady) {
      onEditorReady(editor ?? null);
    }
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const current = editor.getHTML();
    const next = value || '';
    if (current !== next) {
      editor.commands.setContent(next, false);
    }
  }, [editor, value]);

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Text fw={600}>{label}</Text>
          {description ? (
            <Text size="xs" c="dimmed">
              {description}
            </Text>
          ) : null}
        </Stack>
        {toolbar}
      </Group>
      <Tabs value={mode} onChange={(next) => setMode((next as typeof mode) ?? 'wysiwyg')} variant="outline" radius="md">
        <Tabs.List>
          <Tabs.Tab value="wysiwyg" leftSection={<IconSparkles size={14} />}>Editor</Tabs.Tab>
          <Tabs.Tab value="preview" leftSection={<IconEye size={14} />}>Náhled</Tabs.Tab>
          <Tabs.Tab value="code" leftSection={<IconCode size={14} />}>HTML</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="wysiwyg" pt="xs">
          {editor ? (
            <RichTextEditor editor={editor} styles={{ content: { minHeight: 180 } }}>
              <RichTextEditor.Toolbar sticky stickyOffset={64}>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.Bold />
                  <RichTextEditor.Italic />
                  <RichTextEditor.Underline />
                  <RichTextEditor.Strikethrough />
                  <RichTextEditor.ClearFormatting />
                </RichTextEditor.ControlsGroup>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.H1 />
                  <RichTextEditor.H2 />
                  <RichTextEditor.H3 />
                </RichTextEditor.ControlsGroup>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.AlignLeft />
                  <RichTextEditor.AlignCenter />
                  <RichTextEditor.AlignJustify />
                  <RichTextEditor.AlignRight />
                </RichTextEditor.ControlsGroup>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.BulletList />
                  <RichTextEditor.OrderedList />
                  <RichTextEditor.Blockquote />
                  <RichTextEditor.Link />
                  <RichTextEditor.Unlink />
                </RichTextEditor.ControlsGroup>
                <RichTextEditor.ControlsGroup>
                  <RichTextEditor.CodeBlock />
                  <RichTextEditor.Control
                    onClick={() => onImageRequest?.()}
                    aria-label="Vložit obrázek"
                    title="Vložit obrázek"
                  >
                    <IconPhotoPlus size={16} />
                  </RichTextEditor.Control>
                </RichTextEditor.ControlsGroup>
              </RichTextEditor.Toolbar>
              <RichTextEditor.Content />
            </RichTextEditor>
          ) : (
            <Paper withBorder p="lg" radius="md">
              <Text size="sm" c="dimmed">
                Načítám editor…
              </Text>
            </Paper>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="preview" pt="xs">
          <Paper withBorder p="md" radius="md" style={{ minHeight: 180 }}>
            {value ? (
              <Box
                style={{ lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: value }}
              />
            ) : (
              <Text size="sm" c="dimmed">
                Obsah je prázdný. Doplnění se zobrazí tady.
              </Text>
            )}
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="code" pt="xs">
          <Textarea
            value={value}
            minRows={8}
            autosize
            placeholder="<p>HTML obsah…</p>"
            onChange={(event) => {
              const next = event.currentTarget.value;
              onChange(next);
              if (editor) {
                editor.commands.setContent(next || '', false);
              }
            }}
          />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
};

type CategoryContentField = 'menu_title' | 'title' | 'meta_description' | 'description' | 'second_description';

const contentFieldLabels: Record<CategoryContentField, string> = {
  menu_title: 'Titulek v menu',
  title: 'Meta title',
  meta_description: 'Meta description',
  description: 'Horní popis',
  second_description: 'Dolní popis',
};

const contentFieldOrder: CategoryContentField[] = [
  'menu_title',
  'title',
  'meta_description',
  'description',
  'second_description',
];

const supportedWidgetLocales = ['cs', 'sk', 'en', 'de', 'pl', 'hu', 'ro', 'hr'] as const;
type WidgetLocale = (typeof supportedWidgetLocales)[number];

const localeOptions = [
  { value: 'cs', label: 'Čeština' },
  { value: 'sk', label: 'Slovenština' },
  { value: 'en', label: 'Angličtina' },
  { value: 'de', label: 'Němčina' },
  { value: 'pl', label: 'Polština' },
  { value: 'hu', label: 'Maďarština' },
  { value: 'ro', label: 'Rumunština' },
  { value: 'hr', label: 'Chorvatština' },
];

const normalizeWidgetLocale = (value: string | null | undefined): WidgetLocale =>
  (supportedWidgetLocales.find((locale) => locale === value) ?? 'cs');

const countdownCopy: Record<WidgetLocale, { headline: string; message: string; cta_label: string }> = {
  cs: { headline: 'Limitovaná sleva', message: 'Akce končí za:', cta_label: 'Nakoupit nyní' },
  sk: { headline: 'Limitovaná zľava', message: 'Akcia končí o:', cta_label: 'Nakúpiť teraz' },
  en: { headline: 'Limited Offer', message: 'Offer ends in:', cta_label: 'Shop now' },
  de: { headline: 'Begrenztes Angebot', message: 'Aktion endet in:', cta_label: 'Jetzt einkaufen' },
  pl: { headline: 'Oferta ograniczona', message: 'Promocja kończy się za:', cta_label: 'Kup teraz' },
  hu: { headline: 'Limitált ajánlat', message: 'Az akció vége:', cta_label: 'Vásárolj most' },
  ro: { headline: 'Ofertă limitată', message: 'Oferta se încheie în:', cta_label: 'Cumpără acum' },
  hr: { headline: 'Ograničena ponuda', message: 'Akcija završava za:', cta_label: 'Kupi sada' },
};

const bannerCopy: Record<WidgetLocale, { title: string; subtitle: string; link_label: string }> = {
  cs: {
    title: 'Zvýhodněná nabídka',
    subtitle: 'Vyber si z nejpopulárnějších produktů této kategorie.',
    link_label: 'Zobrazit nabídku',
  },
  sk: {
    title: 'Zvýhodnená ponuka',
    subtitle: 'Vyber si z najobľúbenejších produktov v tejto kategórii.',
    link_label: 'Zobraziť ponuku',
  },
  en: {
    title: 'Featured Offer',
    subtitle: 'Discover the best-selling products in this category.',
    link_label: 'View offer',
  },
  de: {
    title: 'Top-Angebot',
    subtitle: 'Entdecke die Bestseller in dieser Kategorie.',
    link_label: 'Angebot ansehen',
  },
  pl: {
    title: 'Promocyjna oferta',
    subtitle: 'Poznaj najpopularniejsze produkty w tej kategorii.',
    link_label: 'Zobacz ofertę',
  },
  hu: {
    title: 'Kiemelt ajánlat',
    subtitle: 'Ismerd meg a kategória legnépszerűbb termékeit.',
    link_label: 'Ajánlat megtekintése',
  },
  ro: {
    title: 'Ofertă specială',
    subtitle: 'Descoperă produsele cele mai populare din această categorie.',
    link_label: 'Vezi oferta',
  },
  hr: {
    title: 'Posebna ponuda',
    subtitle: 'Otkrij najpopularnije proizvode u ovoj kategoriji.',
    link_label: 'Pogledaj ponudu',
  },
};

const discountTilesCopy: Record<WidgetLocale, { keyword: string; label: string }> = {
  cs: { keyword: 'Sleva', label: 'Sleva' },
  sk: { keyword: 'Zľava', label: 'Zľava' },
  en: { keyword: 'Sale', label: 'Sale' },
  de: { keyword: 'Rabatt', label: 'Rabatt' },
  pl: { keyword: 'Rabat', label: 'Rabat' },
  hu: { keyword: 'Akció', label: 'Akció' },
  ro: { keyword: 'Reducere', label: 'Reducere' },
  hr: { keyword: 'Popust', label: 'Popust' },
};

const promoCountdownCopy: Record<WidgetLocale, { headline: string; subheadline: string; description: string; cta: string }> = {
  cs: {
    headline: 'Podzimní výprodej',
    subheadline: 'Produkty ve slevě až 75 %',
    description: 'Nepropásni časově omezenou akci.',
    cta: 'Chci ušetřit',
  },
  sk: {
    headline: 'Jesenný výpredaj',
    subheadline: 'Produkty so zľavou až 75 %',
    description: 'Nezmeškaj časovo obmedzenú ponuku.',
    cta: 'Chcem ušetriť',
  },
  en: {
    headline: 'Autumn Sale',
    subheadline: 'Products up to 75% off',
    description: 'Don’t miss this time-limited offer.',
    cta: 'Save now',
  },
  de: {
    headline: 'Herbst-Sale',
    subheadline: 'Produkte bis zu 75 % reduziert',
    description: 'Verpasse dieses zeitlich begrenzte Angebot nicht.',
    cta: 'Jetzt sparen',
  },
  pl: {
    headline: 'Jesienna wyprzedaż',
    subheadline: 'Produkty przecenione do 75%',
    description: 'Nie przegap oferty ograniczonej czasowo.',
    cta: 'Chcę oszczędzić',
  },
  hu: {
    headline: 'Őszi kiárusítás',
    subheadline: 'Termékek akár 75% kedvezménnyel',
    description: 'Ne maradj le az időszakos ajánlatról!',
    cta: 'Spórolok',
  },
  ro: {
    headline: 'Reduceri de toamnă',
    subheadline: 'Produse cu până la 75% reducere',
    description: 'Nu rata această ofertă limitată în timp.',
    cta: 'Vreau să economisesc',
  },
  hr: {
    headline: 'Jesenska rasprodaja',
    subheadline: 'Proizvodi s popustom do 75 %',
    description: 'Ne propusti vremenski ograničenu ponudu.',
    cta: 'Želim uštedjeti',
  },
};

const countdownWords: Record<WidgetLocale, { day: [string, string]; hour: [string, string]; minute: [string, string]; second: [string, string] }> = {
  cs: { day: ['den', 'dní'], hour: ['hodina', 'hodin'], minute: ['minuta', 'minut'], second: ['sekunda', 'sekund'] },
  sk: { day: ['deň', 'dní'], hour: ['hodina', 'hodín'], minute: ['minúta', 'minút'], second: ['sekunda', 'sekúnd'] },
  en: { day: ['day', 'days'], hour: ['hour', 'hours'], minute: ['minute', 'minutes'], second: ['second', 'seconds'] },
  de: { day: ['Tag', 'Tage'], hour: ['Stunde', 'Stunden'], minute: ['Minute', 'Minuten'], second: ['Sekunde', 'Sekunden'] },
  pl: { day: ['dzień', 'dni'], hour: ['godzina', 'godzin'], minute: ['minuta', 'minut'], second: ['sekunda', 'sekund'] },
  hu: { day: ['nap', 'nap'], hour: ['óra', 'óra'], minute: ['perc', 'perc'], second: ['másodperc', 'másodperc'] },
  ro: { day: ['zi', 'zile'], hour: ['oră', 'ore'], minute: ['minut', 'minute'], second: ['secundă', 'secunde'] },
  hr: { day: ['dan', 'dana'], hour: ['sat', 'sati'], minute: ['minuta', 'minuta'], second: ['sekunda', 'sekundi'] },
};

type GeneratedWidget =
  | ({
      type: 'countdown';
      placement: string;
      headline?: string | null;
      message?: string | null;
      deadline?: string | null;
      cta_label?: string | null;
      cta_url?: string | null;
      background_color?: string | null;
      text_color?: string | null;
      layout?: 'stacked' | 'inline' | null;
      format?: 'digital' | 'extended' | null;
      locale?: string | null;
    })
  | ({
      type: 'banner';
      placement: string;
      title?: string | null;
      subtitle?: string | null;
      image?: string | null;
      link_label?: string | null;
      link_url?: string | null;
    })
  | ({
      type: 'promoCountdown';
      placement: string;
      locale?: string | null;
      headline?: string | null;
      subheadline?: string | null;
      description?: string | null;
      cta_label?: string | null;
      cta_link?: string | null;
      background_style?: string | null;
      background_image?: string | null;
      overlay_color?: string | null;
      text_color?: string | null;
      accent_color?: string | null;
      mode?: 'fixed' | 'recurring' | null;
      deadline?: string | null;
      interval_hours?: number | string | null;
      interval_minutes?: number | string | null;
      recurring_anchor?: string | null;
      layout?: 'square' | 'rectangle' | null;
      headline_size?: number | null;
      subheadline_size?: number | null;
      description_size?: number | null;
      cta_font_size?: number | null;
      headline_color?: string | null;
      subheadline_color?: string | null;
      description_color?: string | null;
      cta_background?: string | null;
      cta_text_color?: string | null;
      cta_border_color?: string | null;
      max_width?: number | string | null;
      max_height?: number | string | null;
    })
  | ({
      type: 'discountTiles';
      placement: string;
      filter_keyword?: string | null;
      tile_label?: string | null;
      tile_background?: string | null;
      active_background?: string | null;
      tile_text_color?: string | null;
      banner_image?: string | null;
      banner_alt?: string | null;
      banner_link?: string | null;
      locale?: string | null;
    });

type CountdownWidgetConfig = Extract<GeneratedWidget, { type: 'countdown' }>;
type BannerWidgetConfig = Extract<GeneratedWidget, { type: 'banner' }>;
type PromoCountdownWidgetConfig = Extract<GeneratedWidget, { type: 'promoCountdown' }>;
type DiscountTilesWidgetConfig = Extract<GeneratedWidget, { type: 'discountTiles' }>;

type WidgetSnippet = {
  markup: string;
  script?: string;
  markupNode?: JSONContent;
  scriptNode?: JSONContent;
};

const escapeHtmlAttribute = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildWidgetSnippet = (widget: GeneratedWidget): WidgetSnippet => {
  if (widget.type === 'promoCountdown') {
    const locale = normalizeWidgetLocale((widget as { locale?: string | null }).locale ?? 'cs');
    const copy = promoCountdownCopy[locale] ?? promoCountdownCopy.cs;
    const headline = widget.headline?.trim() || copy.headline;
    const subheadline = widget.subheadline?.trim() || copy.subheadline;
    const description = widget.description?.trim() || copy.description;
    const ctaLabel = widget.cta_label?.trim() || copy.cta;
    const ctaLink = widget.cta_link?.trim() || '';
    const backgroundStyle = widget.background_style?.trim() || 'linear-gradient(135deg,#d97706,#f97316)';
    const backgroundImage = widget.background_image?.trim() || '';
    const overlayColor = widget.overlay_color?.trim() || 'rgba(0,0,0,0.18)';
    const textColor = widget.text_color?.trim() || '#ffffff';
    const accentColor = widget.accent_color?.trim() || '#ffe8c7';
    const layout = widget.layout === 'rectangle' ? 'rectangle' : 'square';
    const mode = widget.mode === 'recurring' ? 'recurring' : 'fixed';
    const deadline = widget.deadline?.trim() || '';
    const intervalHours = Number(widget.interval_hours ?? 0) || 0;
    const intervalMinutes = Number(widget.interval_minutes ?? 0) || 0;
    const intervalMs = Math.max(0, Math.round((intervalHours * 60 + intervalMinutes) * 60 * 1000));
    const recurringAnchor = widget.recurring_anchor?.trim() || '';
    const words = countdownWords[locale] ?? countdownWords.cs;
    const rootId = `promo-countdown-${Math.random().toString(36).slice(2, 10)}`;

    const styleContent = `
.dynamic-placeholder-block{display:block;border-radius:12px;}
.category-countdown-banner{position:relative;overflow:hidden;border-radius:24px;padding:32px;text-align:center;min-height:var(--countdown-banner-min-height,300px);max-height:var(--countdown-banner-max-height,none);max-width:var(--countdown-banner-max-width,520px);width:100%;display:flex;align-items:center;justify-content:center;color:var(--countdown-banner-text,#ffffff);box-shadow:none;height:auto;}
.category-countdown-banner--height-auto{max-height:none;min-height:auto;height:auto;}
.category-countdown-banner--rectangle{min-height:260px;}
.category-countdown-banner--square{aspect-ratio:1/1;width:100%;}
.category-countdown-banner::before{content:'';position:absolute;inset:0;background:var(--countdown-banner-background,linear-gradient(135deg,#d97706,#f97316));z-index:0;}
.category-countdown-banner::after{content:'';position:absolute;inset:0;background:linear-gradient(var(--countdown-banner-overlay,rgba(0,0,0,0)),var(--countdown-banner-overlay,rgba(0,0,0,0))),var(--countdown-banner-image,none);background-size:cover;background-position:center;background-repeat:no-repeat;z-index:0;}
.category-countdown-banner__inner{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:24px;width:100%;max-width:var(--countdown-banner-max-width-inner,520px);margin:0 auto;padding:8px;}
.category-countdown-banner__texts{display:flex;flex-direction:column;gap:12px;align-items:center;}
.category-countdown-banner__placeholder{margin:0 0 8px;font-size:12px;letter-spacing:0.24em;text-transform:uppercase;opacity:0.55;}
.category-countdown-banner__headline{margin:0;font-size:var(--countdown-banner-headline-size,clamp(28px,6vw,44px));line-height:1.1;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--countdown-banner-headline-color,var(--countdown-banner-text,#ffffff));}
div.category-countdown-banner__inner p.category-countdown-banner__subheadline{margin:0;margin-top:0;margin-bottom:0;font-size:var(--countdown-banner-subheadline-size,clamp(16px,4vw,24px));font-weight:600;text-transform:uppercase;opacity:0.95;letter-spacing:0.04em;color:var(--countdown-banner-subheadline-color,var(--countdown-banner-text,#ffffff));}
div.category-countdown-banner__inner p.category-countdown-banner__description{margin:0;margin-top:0;margin-bottom:0;font-size:var(--countdown-banner-description-size,clamp(14px,3vw,18px));opacity:0.9;white-space:pre-line;color:var(--countdown-banner-description-color,var(--countdown-banner-text,#ffffff));}
.category-countdown-banner__timer{display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:16px;width:100%;}
.category-countdown-banner__segment{padding:16px 12px;border-radius:16px;border:1px solid rgba(255,255,255,0.24);background:rgba(255,255,255,0.12);display:flex;flex-direction:column;align-items:center;gap:8px;}
.category-countdown-banner__value{font-size:clamp(28px,6vw,40px);font-weight:700;letter-spacing:0.04em;color:var(--countdown-banner-accent,#ffe8c7);}
.category-countdown-banner__label{font-size:12px;text-transform:uppercase;letter-spacing:0.2em;opacity:0.85;}
.category-countdown-banner__cta{display:inline-flex;align-items:center;justify-content:center;padding:12px 32px;border-radius:999px;border:2px solid var(--countdown-banner-cta-border,var(--countdown-banner-text,#ffffff));font-weight:700;text-transform:uppercase;letter-spacing:0.16em;transition:transform .2s ease,background .2s ease;background:var(--countdown-banner-cta-bg,transparent);color:var(--countdown-banner-cta-text,var(--countdown-banner-text,#ffffff));font-size:var(--countdown-banner-cta-size,14px);}
.category-countdown-banner__ctaLink{text-decoration:none;color:inherit;display:inline-flex;align-items:center;justify-content:center;width:100%;font-size:inherit;}
.category-countdown-banner__cta:hover{transform:translateY(-2px);background:rgba(255,255,255,0.12);}
.category-countdown-banner--rectangle .category-countdown-banner__inner{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,0.95fr);grid-template-rows:auto auto;gap:28px;align-items:center;text-align:left;}
.category-countdown-banner--rectangle .category-countdown-banner__texts{grid-column:1;grid-row:1 / span 2;align-items:flex-start;text-align:left;}
.category-countdown-banner--rectangle .category-countdown-banner__timer{grid-column:2;grid-row:1;justify-self:stretch;}
.category-countdown-banner--rectangle .category-countdown-banner__cta{grid-column:2;grid-row:2;justify-self:center;}
.category-countdown-banner--square .category-countdown-banner__inner{height:100%;justify-content:center;}
.category-countdown-banner--finished .category-countdown-banner__segment{opacity:0.65;}
@media (max-width:900px){.category-countdown-banner{max-height:none;min-height:auto;height:auto;}.category-countdown-banner--rectangle .category-countdown-banner__inner{display:flex;flex-direction:column;align-items:center;text-align:center;}.category-countdown-banner--rectangle .category-countdown-banner__texts{align-items:center;text-align:center;}.category-countdown-banner--rectangle .category-countdown-banner__timer{justify-self:center;}.category-countdown-banner--rectangle .category-countdown-banner__cta{align-self:center;}}
@media (max-width:768px){.category-countdown-banner{padding:16px;}.category-countdown-banner__timer{grid-template-columns:repeat(auto-fit,minmax(50px,1fr));gap:6px;}.category-countdown-banner__segment{padding:12px 8px;}.category-countdown-banner__value{font-size:clamp(24px,10vw,32px);}}
`;

    const scriptConfig = {
      rootId,
      layout,
      headline,
      subheadline,
      description,
      ctaLabel,
      ctaLink,
      backgroundStyle,
      backgroundImage,
      overlayColor,
      textColor,
      accentColor,
      mode,
      deadline,
      intervalMs,
      recurringAnchor,
      words,
      headlineSize: widget.headline_size ?? null,
      subheadlineSize: widget.subheadline_size ?? null,
      descriptionSize: widget.description_size ?? null,
      ctaFontSize: widget.cta_font_size ?? null,
      headlineColor: widget.headline_color ?? null,
      subheadlineColor: widget.subheadline_color ?? null,
      descriptionColor: widget.description_color ?? null,
      ctaBackground: widget.cta_background ?? null,
      ctaTextColor: widget.cta_text_color ?? null,
      ctaBorderColor: widget.cta_border_color ?? null,
      maxWidth: widget.max_width ?? null,
      maxHeight: widget.max_height ?? null,
      debug: true,
    };

    const markup = [
      `<div class="dynamic-placeholder-block" data-widget="promo-countdown" data-widget-config='${escapeHtmlAttribute(
        JSON.stringify({ rootId, layout, mode })
      )}'>`,
      `<div id="${rootId}" class="category-countdown-banner category-countdown-banner--${layout}">`,
      '<div class="category-countdown-banner__inner">',
      '<div class="category-countdown-banner__placeholder" data-role="placeholder">Widget: Banner s odpočtem</div>',
      '<div class="category-countdown-banner__texts">',
      `<h2 class="category-countdown-banner__headline" data-role="headline">${escapeHtmlAttribute(headline)}</h2>`,
      `<p class="category-countdown-banner__subheadline" data-role="subheadline"${
        subheadline ? '' : ' style="display:none;"'
      }>${escapeHtmlAttribute(subheadline || '')}</p>`,
      `<p class="category-countdown-banner__description" data-role="description"${
        description ? '' : ' style="display:none;"'
      }>${escapeHtmlAttribute(description || '')}</p>`,
      '</div>',
      '<div class="category-countdown-banner__timer" data-role="timer"></div>',
      `<div class="category-countdown-banner__cta" data-role="cta"${
        ctaLabel ? '' : ' style="display:none;"'
      }>${ctaLabel ? `<span>${escapeHtmlAttribute(ctaLabel)}</span>` : ''}</div>`,
      '</div>',
      '</div>',
      '</div>',
    ].join('');

    const script = `(function(){
  var config = ${JSON.stringify(scriptConfig)};
  var log = function(){
    if (!config.debug || !window.console) { return; }
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[PromoCountdown]');
    console.log.apply(console, args);
  };
  var ensureStyle = function(){
    var styleId = 'category-countdown-banner-style';
    if (document.getElementById(styleId)) { return; }
    var style = document.createElement('style');
    style.id = styleId;
    style.textContent = ${JSON.stringify(styleContent)};
    document.head.appendChild(style);
    log('Injected countdown banner styles');
  };
  var pad = function(value){
    return value < 10 ? '0' + Math.max(0, value) : String(Math.max(0, value));
  };
  var words = config.words || { day: ['day', 'days'], hour: ['hour', 'hours'], minute: ['minute', 'minutes'], second: ['second', 'seconds'] };
  var startTimestamp = Date.now();
  var deadlineMs = config.mode === 'fixed' && config.deadline ? Date.parse(config.deadline) : NaN;
  if (!Number.isFinite(deadlineMs)) {
    deadlineMs = null;
  }
  var cycleMs = config.mode === 'recurring' ? Math.max(0, Number(config.intervalMs) || 0) : 0;
  var anchorMs = config.mode === 'recurring' && config.recurringAnchor ? Date.parse(config.recurringAnchor) : NaN;
  if (!Number.isFinite(anchorMs)) {
    anchorMs = null;
  }
  var computeRemaining = function(now){
    if (config.mode === 'recurring') {
      if (!cycleMs) { return 0; }
      if (anchorMs && now < anchorMs) {
        return anchorMs - now;
      }
      var base = anchorMs && now >= anchorMs ? anchorMs : startTimestamp;
      var elapsed = now - base;
      if (elapsed < 0) { elapsed = 0; }
      var remainder = elapsed % cycleMs;
      var remaining = cycleMs - remainder;
      if (remaining <= 0 || remaining === cycleMs) {
        remaining = cycleMs;
      }
      return remaining;
    }
    if (!deadlineMs) { return 0; }
    var diff = deadlineMs - now;
    return diff > 0 ? diff : 0;
  };
  var ensureSegments = function(root){
    var container = root.querySelector('[data-role="timer"]');
    if (!container) {
      container = document.createElement('div');
      container.className = 'category-countdown-banner__timer';
      container.setAttribute('data-role', 'timer');
      root.appendChild(container);
    }
    var segments = {};
    var existing = container.querySelectorAll('.category-countdown-banner__segment');
    if (!existing.length) {
      ['days','hours','minutes','seconds'].forEach(function(unit){
        var segment = document.createElement('div');
        segment.className = 'category-countdown-banner__segment';
        segment.setAttribute('data-unit', unit);
        var valueEl = document.createElement('span');
        valueEl.className = 'category-countdown-banner__value';
        valueEl.textContent = '00';
        var labelEl = document.createElement('span');
        labelEl.className = 'category-countdown-banner__label';
        labelEl.textContent = unit === 'days'
          ? (words.day ? words.day[1] : unit)
          : unit === 'hours'
            ? (words.hour ? words.hour[1] : unit)
            : unit === 'minutes'
              ? (words.minute ? words.minute[1] : unit)
              : (words.second ? words.second[1] : unit);
        segment.appendChild(valueEl);
        segment.appendChild(labelEl);
        container.appendChild(segment);
        segments[unit] = { element: segment, valueEl: valueEl, labelEl: labelEl };
      });
      scheduleHeightSync(root);
      return segments;
    }
    existing.forEach(function(segment){
      var unit = segment.getAttribute('data-unit');
      if (!unit) { return; }
      segments[unit] = {
        element: segment,
        valueEl: segment.querySelector('.category-countdown-banner__value'),
        labelEl: segment.querySelector('.category-countdown-banner__label'),
      };
    });
    scheduleHeightSync(root);
    return segments;
  };
  var applyTextContent = function(root){
    var update = function(role, value){
      var el = root.querySelector('[data-role="' + role + '"]');
      if (!el) { return; }
      if (value) {
        el.textContent = value;
        el.style.display = '';
      } else {
        el.textContent = '';
        el.style.display = 'none';
      }
    };
    update('headline', config.headline);
    update('subheadline', config.subheadline);
    update('description', config.description);
    scheduleHeightSync(root);
  };
  var applyCta = function(root){
    var container = root.querySelector('[data-role="cta"]');
    if (!container) { return; }
    container.innerHTML = '';
    if (!config.ctaLabel) {
      container.style.display = 'none';
      scheduleHeightSync(root);
      return;
    }
    container.style.display = 'inline-flex';
    if (config.ctaLink) {
      var link = document.createElement('a');
      link.className = 'category-countdown-banner__ctaLink';
      link.href = config.ctaLink;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = config.ctaLabel;
      container.appendChild(link);
    } else {
      var span = document.createElement('span');
      span.textContent = config.ctaLabel;
      container.appendChild(span);
    }
    scheduleHeightSync(root);
  };
  var normalizeStructure = function(root){
    var inner = root.querySelector('.category-countdown-banner__inner');
    if (!inner) {
      inner = document.createElement('div');
      inner.className = 'category-countdown-banner__inner';
      while (root.firstChild) {
        root.removeChild(root.firstChild);
      }
      root.appendChild(inner);
    }
    inner.innerHTML = '';
    var placeholder = document.createElement('div');
    placeholder.className = 'category-countdown-banner__placeholder';
    placeholder.setAttribute('data-role', 'placeholder');
    placeholder.textContent = 'Widget: Banner s odpočtem';
    inner.appendChild(placeholder);
    var texts = document.createElement('div');
    texts.className = 'category-countdown-banner__texts';
    var headlineEl = document.createElement('h2');
    headlineEl.className = 'category-countdown-banner__headline';
    headlineEl.setAttribute('data-role', 'headline');
    texts.appendChild(headlineEl);
    var subheadlineEl = document.createElement('p');
    subheadlineEl.className = 'category-countdown-banner__subheadline';
    subheadlineEl.setAttribute('data-role', 'subheadline');
    texts.appendChild(subheadlineEl);
    var descriptionEl = document.createElement('p');
    descriptionEl.className = 'category-countdown-banner__description';
    descriptionEl.setAttribute('data-role', 'description');
    texts.appendChild(descriptionEl);
    inner.appendChild(texts);
    var timer = document.createElement('div');
    timer.className = 'category-countdown-banner__timer';
    timer.setAttribute('data-role', 'timer');
    inner.appendChild(timer);
    var cta = document.createElement('div');
    cta.className = 'category-countdown-banner__cta';
    cta.setAttribute('data-role', 'cta');
    inner.appendChild(cta);
    scheduleHeightSync(root);
  };
  var hidePlaceholder = function(root){
    var placeholder = root.querySelector('.category-countdown-banner__placeholder');
    if (placeholder) {
      placeholder.style.display = 'none';
      placeholder.setAttribute('aria-hidden', 'true');
    }
  };
  var toSize = function(value){
    if (value === null || value === undefined) { return ''; }
    if (typeof value === 'number' && isFinite(value)) {
      return value + 'px';
    }
    var str = String(value).trim();
    if (!str) { return ''; }
    if (/^[0-9]+(?:[.][0-9]+)?$/.test(str)) {
      return str + 'px';
    }
    return str;
  };
  var toColor = function(value){
    if (value === null || value === undefined) { return ''; }
    var str = String(value).trim();
    return str;
  };
  var setVar = function(root, name, rawValue){
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      root.style.removeProperty(name);
    } else {
      root.style.setProperty(name, rawValue);
    }
  };
  var applyTheme = function(root){
    setVar(root, '--countdown-banner-background', toColor(config.backgroundStyle));
    setVar(root, '--countdown-banner-text', toColor(config.textColor));
    setVar(root, '--countdown-banner-accent', toColor(config.accentColor));
    setVar(root, '--countdown-banner-overlay', toColor(config.overlayColor));
    if (config.backgroundImage) {
      setVar(root, '--countdown-banner-image', 'url(' + JSON.stringify(String(config.backgroundImage)) + ')');
    } else {
      root.style.removeProperty('--countdown-banner-image');
    }
    setVar(root, '--countdown-banner-headline-size', toSize(config.headlineSize));
    setVar(root, '--countdown-banner-subheadline-size', toSize(config.subheadlineSize));
    setVar(root, '--countdown-banner-description-size', toSize(config.descriptionSize));
    setVar(root, '--countdown-banner-cta-size', toSize(config.ctaFontSize));
    setVar(root, '--countdown-banner-headline-color', toColor(config.headlineColor));
    setVar(root, '--countdown-banner-subheadline-color', toColor(config.subheadlineColor));
    setVar(root, '--countdown-banner-description-color', toColor(config.descriptionColor));
    setVar(root, '--countdown-banner-cta-bg', toColor(config.ctaBackground));
    setVar(root, '--countdown-banner-cta-text', toColor(config.ctaTextColor));
    setVar(root, '--countdown-banner-cta-border', toColor(config.ctaBorderColor));
    setVar(root, '--countdown-banner-max-width', toSize(config.maxWidth));
    setVar(root, '--countdown-banner-max-width-inner', toSize(config.maxWidth));
    setVar(root, '--countdown-banner-max-height', toSize(config.maxHeight));
    setVar(root, '--countdown-banner-min-height', config.maxHeight ? toSize(config.maxHeight) : '');
    scheduleHeightSync(root);
  };
  var matchesStackBreakpoint = function(){
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    try {
      return window.matchMedia('(max-width: 900px)').matches;
    } catch (error) {
      return false;
    }
  };
  var syncHeightMode = function(root){
    if (!root) { return; }
    var rawMaxHeight = config.maxHeight;
    if (rawMaxHeight === null || rawMaxHeight === undefined) {
      root.classList.remove('category-countdown-banner--height-auto');
      return;
    }
    var normalizedMax = String(rawMaxHeight).trim().toLowerCase();
    if (!normalizedMax || normalizedMax === 'none' || normalizedMax === 'auto') {
      root.classList.remove('category-countdown-banner--height-auto');
      return;
    }
    var inner = root.querySelector('.category-countdown-banner__inner');
    if (!inner) { return; }
    var shouldRelax = matchesStackBreakpoint();
    if (!shouldRelax) {
      var rootHeight = root.clientHeight;
      var innerHeight = inner.scrollHeight;
      shouldRelax = innerHeight > rootHeight + 1;
    }
    root.classList.toggle('category-countdown-banner--height-auto', !!shouldRelax);
  };
  var scheduleHeightSync = function(root){
    if (!root) { return; }
    if (root.__promoCountdownHeightSyncRequested) { return; }
    root.__promoCountdownHeightSyncRequested = true;
    var raf = window.requestAnimationFrame || function(cb){ return window.setTimeout(cb, 16); };
    raf(function(){
      root.__promoCountdownHeightSyncRequested = false;
      syncHeightMode(root);
    });
  };
  var ensureResponsiveBindings = function(root){
    if (typeof window === 'undefined') { return; }
    window.__promoCountdownResizeHandlers = window.__promoCountdownResizeHandlers || {};
    var existingResize = window.__promoCountdownResizeHandlers[config.rootId];
    if (existingResize) {
      window.removeEventListener('resize', existingResize);
    }
    var handleResize = function(){
      var currentRoot = document.getElementById(config.rootId);
      if (!currentRoot) { return; }
      scheduleHeightSync(currentRoot);
    };
    window.addEventListener('resize', handleResize);
    window.__promoCountdownResizeHandlers[config.rootId] = handleResize;
    if (typeof window.matchMedia === 'function') {
      window.__promoCountdownMediaHandlers = window.__promoCountdownMediaHandlers || {};
      var previous = window.__promoCountdownMediaHandlers[config.rootId];
      if (previous && previous.list) {
        if (previous.list.removeEventListener) {
          previous.list.removeEventListener('change', previous.handler);
        } else if (previous.list.removeListener) {
          previous.list.removeListener(previous.handler);
        }
      }
      var mediaList;
      try {
        mediaList = window.matchMedia('(max-width: 900px)');
      } catch (error) {
        mediaList = null;
      }
      if (mediaList) {
        var mediaHandler = function(){ handleResize(); };
        if (mediaList.addEventListener) {
          mediaList.addEventListener('change', mediaHandler);
        } else if (mediaList.addListener) {
          mediaList.addListener(mediaHandler);
        }
        window.__promoCountdownMediaHandlers[config.rootId] = {
          list: mediaList,
          handler: mediaHandler
        };
      }
    }
  };
  var updateTimer = function(root, segments){
    var now = Date.now();
    var remaining = computeRemaining(now);
    var finished = config.mode === 'fixed' && (!remaining || remaining <= 0);
    if (finished) {
      remaining = 0;
    }
    var totalSeconds = Math.max(0, Math.floor(remaining / 1000));
    var days = Math.floor(totalSeconds / 86400);
    var hours = Math.floor((totalSeconds % 86400) / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    var pairs = {
      days: words.day || ['den', 'dní'],
      hours: words.hour || ['hodina', 'hodin'],
      minutes: words.minute || ['minuta', 'minut'],
      seconds: words.second || ['sekunda', 'sekund'],
    };
    var values = { days: days, hours: hours, minutes: minutes, seconds: seconds };
    Object.keys(segments).forEach(function(key){
      var segment = segments[key];
      if (!segment) { return; }
      var value = values[key] ?? 0;
      if (segment.valueEl) {
        segment.valueEl.textContent = value < 100 ? pad(value) : String(value);
      }
      if (segment.labelEl) {
        var pair = pairs[key];
        if (pair) {
          segment.labelEl.textContent = value === 1 ? pair[0] : pair[1];
        }
      }
      if (key === 'days') {
        var hideDays = config.mode === 'recurring' && cycleMs > 0 && cycleMs < 86400000 && days === 0;
        segment.element.style.display = hideDays ? 'none' : '';
      }
    });
    root.classList.toggle('category-countdown-banner--finished', finished);
    scheduleHeightSync(root);
    return finished;
  };
  var attachTimer = function(root, segments){
    window.__promoCountdownTimers = window.__promoCountdownTimers || {};
    var existing = window.__promoCountdownTimers[config.rootId];
    if (existing) {
      window.clearInterval(existing);
      delete window.__promoCountdownTimers[config.rootId];
    }
    var done = updateTimer(root, segments);
    if (done && config.mode === 'fixed') {
      return;
    }
    var interval = window.setInterval(function(){
      var finished = updateTimer(root, segments);
      if (finished && config.mode === 'fixed') {
        window.clearInterval(interval);
        delete window.__promoCountdownTimers[config.rootId];
      }
    }, 1000);
    window.__promoCountdownTimers[config.rootId] = interval;
  };
  var render = function(attempt){
    attempt = attempt || 1;
    var root = document.getElementById(config.rootId);
    if (!root) {
      if (attempt < 10) {
        window.setTimeout(function(){ render(attempt + 1); }, 200 * attempt);
      }
      return;
    }
    root.classList.add('category-countdown-banner--' + config.layout);
    normalizeStructure(root);
    hidePlaceholder(root);
    applyTheme(root);
    applyTextContent(root);
    applyCta(root);
    var segments = ensureSegments(root);
    attachTimer(root, segments);
    ensureResponsiveBindings(root);
    scheduleHeightSync(root);
    log('Promo countdown initialised');
  };
  ensureStyle();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ render(1); }, { once: true });
  } else {
    render(1);
  }
  window.__promoCountdownHandlers = window.__promoCountdownHandlers || {};
  if (!window.__promoCountdownHandlers[config.rootId]) {
    var events = [
      'ShoptetDOMPageContentLoaded',
      'ShoptetDOMPartialContentLoaded',
      'ShoptetDOMAdvancedSearchLoaded',
      'ShoptetDOMProductsListingLoaded'
    ];
    events.forEach(function(eventName){
      document.addEventListener(eventName, function(){ render(1); });
    });
    window.__promoCountdownHandlers[config.rootId] = true;
  }
})();`;

    return { markup, script };
  }

  if (widget.type === 'countdown') {
    const locale = normalizeWidgetLocale((widget as { locale?: string | null }).locale ?? 'cs');
    const copy = countdownCopy[locale] ?? countdownCopy.cs;
    const headline = widget.headline?.trim() || copy.headline;
    const message = widget.message?.trim() || copy.message;
    const deadline = widget.deadline?.trim() || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const countdownId = `countdown-${Math.random().toString(36).slice(2, 10)}`;
    const ctaLabel = widget.cta_label?.trim() || '';
    const ctaUrl = widget.cta_url?.trim() || '#';
    const background = widget.background_color?.trim() || '#1f3a8a';
    const textColor = widget.text_color?.trim() || '#ffffff';
    const layout = widget.layout === 'inline' ? 'inline' : 'stacked';
    const format = widget.format === 'extended' ? 'extended' : 'digital';
    const wordsForLocale = countdownWords[locale] ?? countdownWords.cs;

    const rootStyle = `background-color:${background};color:${textColor};padding:16px;border-radius:12px;${layout === 'inline' ? 'display:flex;flex-wrap:wrap;align-items:center;gap:12px;' : 'display:block;'}`;
    const bodyStyle = layout === 'inline'
      ? 'display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:0;'
      : 'display:flex;flex-direction:column;gap:8px;margin:0;';
    const timerStyle = layout === 'inline'
      ? 'min-width:120px;font-weight:600;display:flex;align-items:center;'
      : 'font-weight:600;';
    const headingStyle = 'margin:0;';
    const paragraphStyle = 'margin:0;';
    const linkStyle = `color:${textColor};text-decoration:underline;font-weight:600;`;

    const markup = `<div id="${countdownId}" class="category-countdown${layout === 'inline' ? ' category-countdown--inline' : ''}" data-widget="countdown" data-deadline="${deadline}" data-format="${format}" data-layout="${layout}" style="${rootStyle}">
  <div class="category-countdown__body" style="${bodyStyle}">
    <h2 style="${headingStyle}">${headline}</h2>
    <p style="${paragraphStyle}">${message}</p>
    <div class="category-countdown__timer" style="${timerStyle}"><p style="${paragraphStyle}font-weight:600;">--:--:--</p></div>
    ${ctaLabel ? `<p style="${paragraphStyle}"><a class="category-countdown__cta" href="${ctaUrl}" style="${linkStyle}">${ctaLabel}</a></p>` : ''}
  </div>
</div>`;

    const script = `(function(){
  var root = document.getElementById('${countdownId}');
  if (!root || root.dataset.initialised === 'true') { return; }
  root.dataset.initialised = 'true';
  if (!root.getAttribute('data-deadline')) {
    root.setAttribute('data-deadline', '${deadline}');
  }
  var timerContainer = root.querySelector('.category-countdown__timer');
  if (!timerContainer) { return; }
  var timerTarget = timerContainer.firstElementChild || timerContainer;
  var deadlineValue = root.getAttribute('data-deadline') || '${deadline}';
  var target = new Date(deadlineValue).getTime();
  if (isNaN(target)) { return; }
  var format = root.getAttribute('data-format') || 'digital';
  var words = ${JSON.stringify(wordsForLocale)};
  var pad = function(value) {
    return String(Math.max(0, Math.floor(value))).padStart(2, '0');
  };
  var update = function() {
    var diff = target - Date.now();
    if (diff <= 0) {
      timerTarget.textContent = format === 'extended'
        ? '0 ' + words.second[1]
        : '00:00:00';
      clearInterval(interval);
      return;
    }
    var totalSeconds = Math.floor(diff / 1000);
    if (format === 'extended') {
      var days = Math.floor(totalSeconds / 86400);
      var hours = Math.floor((totalSeconds % 86400) / 3600);
      var minutes = Math.floor((totalSeconds % 3600) / 60);
      var seconds = totalSeconds % 60;
      var parts = [];
      if (days > 0) {
        parts.push(days + ' ' + (days === 1 ? words.day[0] : words.day[1]));
      }
      if (hours > 0 || days > 0) {
        parts.push(hours + ' ' + (hours === 1 ? words.hour[0] : words.hour[1]));
      }
      if (minutes > 0 || hours > 0 || days > 0) {
        parts.push(minutes + ' ' + (minutes === 1 ? words.minute[0] : words.minute[1]));
      }
      parts.push(seconds + ' ' + (seconds === 1 ? words.second[0] : words.second[1]));
      timerTarget.textContent = parts.join(' ');
      return;
    }
    var hoursAll = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    timerTarget.textContent = pad(hoursAll) + ':' + pad(minutes) + ':' + pad(seconds);
  };
  update();
  var interval = window.setInterval(update, 1000);
})();`;

    const bodyContent: JSONContent[] = [
      {
        type: 'heading',
        attrs: { level: 2, style: 'margin:0;' },
        content: [{ type: 'text', text: headline }],
      },
      {
        type: 'paragraph',
        attrs: { style: 'margin:0;' },
        content: [{ type: 'text', text: message }],
      },
      {
        type: 'divBlock',
        attrs: { class: 'category-countdown__timer', style: timerStyle },
        content: [
          {
            type: 'paragraph',
            attrs: { style: 'margin:0;font-weight:600;' },
            content: [{ type: 'text', text: '--:--:--' }],
          },
        ],
      },
    ];

    if (ctaLabel) {
      bodyContent.push({
        type: 'paragraph',
        attrs: { style: 'margin:0;' },
        content: [
          {
            type: 'text',
            text: ctaLabel,
            marks: [
              {
                type: 'link',
                attrs: {
                  href: ctaUrl,
                  target: '_blank',
                  rel: 'noopener noreferrer nofollow',
                  class: 'category-countdown__cta',
                  style: linkStyle,
                },
              },
            ],
          },
        ],
      });
    }

    const markupNode: JSONContent = {
      type: 'divBlock',
      attrs: {
        id: countdownId,
        class: `category-countdown${layout === 'inline' ? ' category-countdown--inline' : ''}`,
        dataWidget: 'countdown',
        dataDeadline: deadline,
        dataLayout: layout,
        dataFormat: format,
        style: rootStyle,
      },
      content: [
        {
          type: 'divBlock',
          attrs: { class: 'category-countdown__body', style: bodyStyle },
          content: bodyContent,
        },
      ],
    };

    const scriptNode: JSONContent = {
      type: 'scriptBlock',
      attrs: { type: 'text/javascript' },
      content: [{ type: 'text', text: script }],
    };

    return { markup, script, markupNode, scriptNode };
  }

  if (widget.type === 'discountTiles') {
    const locale = normalizeWidgetLocale((widget as { locale?: string | null }).locale ?? 'cs');
    const defaults = discountTilesCopy[locale] ?? discountTilesCopy.cs;
    const filterKeyword = widget.filter_keyword?.trim() || defaults.keyword;
    const tileLabel = widget.tile_label?.trim() || defaults.label;
    const tileBackground = widget.tile_background?.trim() || '#ff3f5f';
    const activeBackground = widget.active_background?.trim() || '#ea1539';
    const tileTextColor = widget.tile_text_color?.trim() || '#ffffff';
    const bannerImage = widget.banner_image?.trim() || '';
    const bannerAlt = widget.banner_alt?.trim() || tileLabel;
    const bannerLink = widget.banner_link?.trim() || '';
    const rootId = `discount-tiles-${Math.random().toString(36).slice(2, 10)}`;

    const escapedKeyword = filterKeyword.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    const spacePattern = '(?:\\s|\\u00a0|\\u202f|\\u2009)+';
    const optionalSpacePattern = '(?:\\s|\\u00a0|\\u202f|\\u2009)*';
    const regexSource = `${escapedKeyword}${spacePattern}(\\d+)${optionalSpacePattern}%`;
    const styleContent = `
.dynamic-placeholder-block{display:block;border-radius:12px;}
.category-discount-tiles{margin:24px 0;}
.category-discount-tiles--hidden{display:none;}
.category-discount-tiles__banner{margin-bottom:16px;}
.category-discount-tiles__banner-link{display:block;text-decoration:none;}
.category-discount-tiles__banner-image{display:block;width:100%;border-radius:12px;min-height:160px;background-size:cover;background-position:center;background-repeat:no-repeat;}
.category-discount-tiles__tiles{display:flex;flex-wrap:wrap;gap:10px;}
.category-discount-tiles__tile{background:var(--discount-tiles-bg,#ff3f5f);color:var(--discount-tiles-text,#ffffff);border:none;border-radius:12px;cursor:pointer;width:80px;height:80px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-weight:600;transition:transform .2s ease,background .2s ease;box-shadow:none;}
.category-discount-tiles__tile:focus{outline:3px solid rgba(255,255,255,0.4);outline-offset:2px;}
.category-discount-tiles__tile:hover{transform:scale(1.05);}
.category-discount-tiles__tile--active{background:var(--discount-tiles-active-bg,#ea1539);box-shadow:none;}
.category-discount-tiles__value{font-size:24px;line-height:1;}
.category-discount-tiles__text{font-size:14px;text-transform:uppercase;letter-spacing:0.04em;}
.category-discount-tiles__placeholder{display:flex;align-items:center;justify-content:center;min-height:120px;border:1px dashed rgba(255,255,255,0.4);border-radius:12px;padding:32px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:var(--discount-tiles-text,#ffffff);background:rgba(255,255,255,0.04);text-align:center;}
.category-discount-tiles--ready .category-discount-tiles__placeholder{display:none;}
@media (max-width:768px){.category-discount-tiles__tiles{gap:8px;}.category-discount-tiles__tile{width:64px;height:64px;}.category-discount-tiles__value{font-size:18px;}.category-discount-tiles__text{font-size:12px;}.category-discount-tiles__placeholder{padding:24px;min-height:96px;}}
`;

    const scriptConfig = {
      rootId,
      regexSource,
      tileLabel,
      tileColor: tileBackground,
      activeColor: activeBackground,
      textColor: tileTextColor,
      banner: bannerImage
        ? {
            image: bannerImage,
            alt: bannerAlt,
            link: bannerLink,
          }
        : null,
      debug: true,
    };

    const script = `(function(){
  var config = ${JSON.stringify(scriptConfig)};
  var log = function(){
    if (!config.debug || !window.console) { return; }
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[DiscountTiles]');
    console.log.apply(console, args);
  };
  var ensureStyle = function(){
    var styleId = 'category-discount-tiles-style';
    if (document.getElementById(styleId)) { return; }
    var style = document.createElement('style');
    style.id = styleId;
    style.textContent = ${JSON.stringify(styleContent)};
    document.head.appendChild(style);
    log('Injected styles');
  };
  var findFilterForm = function(){
    var selectors = [
      "form[action='/action/ProductsListing/setDoubledotFilter/']",
      "form[action*='ProductsListing/setDoubledotFilter']",
      '#filters form',
      '.filters form',
      "form[data-testid='category-filter-form']"
    ];
    for (var i = 0; i < selectors.length; i++) {
      var candidate = document.querySelector(selectors[i]);
      if (candidate) {
        log('Found filter form via selector', selectors[i]);
        return candidate;
      }
    }
    log('Filter form not found with known selectors');
    return null;
  };
  var scheduleRetry = function(attempt){
    if (attempt > 10) { return; }
    window.setTimeout(function(){ render(attempt + 1); }, 300 * attempt);
    log('Scheduling retry', attempt + 1);
  };
  var renderBanner = function(root){
    var bannerConfig = config.banner;
    if (!bannerConfig || !bannerConfig.image) {
      var existing = root.querySelector('.category-discount-tiles__banner');
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
      return;
    }
    var container = root.querySelector('.category-discount-tiles__banner');
    if (!container) {
      container = document.createElement('div');
      container.className = 'category-discount-tiles__banner';
      if (root.firstChild) {
        root.insertBefore(container, root.firstChild);
      } else {
        root.appendChild(container);
      }
    } else {
      container.innerHTML = '';
    }
    var target = container;
    if (bannerConfig.link) {
      var linkEl = document.createElement('a');
      linkEl.className = 'category-discount-tiles__banner-link';
      linkEl.href = bannerConfig.link;
      linkEl.target = '_blank';
      linkEl.rel = 'noopener';
      linkEl.style.display = 'block';
      linkEl.style.textDecoration = 'none';
      target = linkEl;
      container.appendChild(linkEl);
    }
    var imageEl = document.createElement('div');
    imageEl.className = 'category-discount-tiles__banner-image';
    imageEl.setAttribute('role', 'img');
    if (bannerConfig.alt) {
      imageEl.setAttribute('aria-label', bannerConfig.alt);
      imageEl.removeAttribute('aria-hidden');
    } else {
      imageEl.removeAttribute('aria-label');
      imageEl.setAttribute('aria-hidden', 'true');
    }
    imageEl.style.display = 'block';
    imageEl.style.backgroundSize = 'cover';
    imageEl.style.backgroundPosition = 'center';
    imageEl.style.backgroundRepeat = 'no-repeat';
    try {
      imageEl.style.backgroundImage = 'url(' + JSON.stringify(String(bannerConfig.image)) + ')';
    } catch (error) {
      log('Banner image assignment failed', error);
    }
    target.appendChild(imageEl);
    log('Banner rendered', bannerConfig);
  };
  var render = function(attempt){
    attempt = attempt || 1;
    var root = document.getElementById(config.rootId);
    if (!root) { return; }
    root.style.setProperty('--discount-tiles-bg', config.tileColor);
    root.style.setProperty('--discount-tiles-active-bg', config.activeColor);
    root.style.setProperty('--discount-tiles-text', config.textColor);
    renderBanner(root);
    var placeholder = root.querySelector('.category-discount-tiles__placeholder');
    if (placeholder) {
      placeholder.style.color = config.textColor;
      placeholder.style.borderColor = config.textColor;
    }
    var container = root.querySelector('.category-discount-tiles__tiles');
    if (!container) { return; }
    var form = findFilterForm();
    if (!form) {
      scheduleRetry(attempt);
      return;
    }
    log('Render attempt', attempt, 'using form', form);
    var activeFilters = new URL(window.location.href).searchParams.getAll('dd').map(String);
    var regex = new RegExp(config.regexSource, 'i');
    var tiles = [];
    form.querySelectorAll("fieldset input[type='checkbox']").forEach(function(input){
      var label = form.querySelector("label[for='" + input.id + "']");
      if (!label) { return; }
      var text = (label.textContent || '').trim();
      var match = text.match(regex);
      if (!match) { return; }
      var filterId = input.getAttribute('data-filter-id') || input.value || match[1];
      if (!filterId) { return; }
      tiles.push({
        value: Number(match[1]),
        filterId: String(filterId),
        isActive: activeFilters.includes(String(filterId)),
      });
    });
    log('Found tiles', tiles.length, tiles);
    if (!tiles.length) {
      scheduleRetry(attempt);
      root.classList.remove('category-discount-tiles--ready');
      root.classList.add('category-discount-tiles--hidden');
      return;
    }
    root.classList.remove('category-discount-tiles--hidden');
    root.classList.add('category-discount-tiles--ready');
    var placeholder = root.querySelector('.category-discount-tiles__placeholder');
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.removeChild(placeholder);
    }
    tiles.sort(function(a, b){ return a.value - b.value; });
    container.innerHTML = '';
    tiles.forEach(function(tile){
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'category-discount-tiles__tile' + (tile.isActive ? ' category-discount-tiles__tile--active' : '');
      button.setAttribute('aria-pressed', tile.isActive ? 'true' : 'false');
      button.dataset.filterId = tile.filterId;
      var valueEl = document.createElement('span');
      valueEl.className = 'category-discount-tiles__value';
      valueEl.textContent = tile.value + ' %';
      var textEl = document.createElement('span');
      textEl.className = 'category-discount-tiles__text';
      textEl.textContent = config.tileLabel;
      button.appendChild(valueEl);
      button.appendChild(textEl);
      button.addEventListener('click', function(){
        var url = new URL(window.location.href);
        url.searchParams.delete('dd');
        if (!tile.isActive) {
          url.searchParams.set('dd', tile.filterId);
        }
        window.location.href = url.toString();
      });
      container.appendChild(button);
    });
    log('Rendered discount tiles');
  };
  ensureStyle();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ render(1); }, { once: true });
  } else {
    render(1);
  }
  window.__discountTilesHandlers = window.__discountTilesHandlers || {};
  if (!window.__discountTilesHandlers[config.rootId]) {
    var events = [
      'ShoptetDOMPageContentLoaded',
      'ShoptetDOMPartialContentLoaded',
      'ShoptetDOMAdvancedSearchLoaded',
      'ShoptetDOMProductLoaded',
      'ShoptetDOMProductsListingLoaded'
    ];
    events.forEach(function(eventName){
      document.addEventListener(eventName, function(){ render(1); });
    });
    window.__discountTilesHandlers[config.rootId] = true;
  }
})();`;

    const bannerMarkup = bannerImage
      ? `<div class="category-discount-tiles__banner">${
          bannerLink
            ? `<a class="category-discount-tiles__banner-link" href="${escapeHtmlAttribute(bannerLink)}" target="_blank" rel="noopener" style="display:block;text-decoration:none;">`
            : ''
        }<div class="category-discount-tiles__banner-image" role="img" aria-label="${escapeHtmlAttribute(bannerAlt)}" style="background-image:url('${escapeHtmlAttribute(bannerImage)}');"></div>${
          bannerLink ? '</a>' : ''
        }</div>`
      : '';

    const markup = `<div class="dynamic-placeholder-block" data-widget="discount-tiles" data-widget-config='${escapeHtmlAttribute(JSON.stringify({
      rootId,
      regexSource,
      tileLabel,
      tileColor: tileBackground,
      activeColor: activeBackground,
      textColor: tileTextColor,
      banner: bannerImage ? { image: bannerImage, alt: bannerAlt, link: bannerLink } : null,
    }))}'>
  <div id="${rootId}" class="category-discount-tiles">
    ${bannerMarkup}
    <div class="category-discount-tiles__placeholder">Widget: Dlaždice s procenty</div>
    <div class="category-discount-tiles__tiles"></div>
  </div>
</div>`;

    return { markup, script };
  }

  const title = widget.title?.trim() || 'Doporučujeme';
  const subtitle = widget.subtitle?.trim() || 'Vyber si z nejprodávanějších produktů v kategorii.';
  const image = widget.image?.trim();
  const linkLabel = widget.link_label?.trim();
  const linkUrl = widget.link_url?.trim();

  const markup = `<div class="category-banner" data-widget="banner">
  <div class="category-banner__inner">
    ${image ? `<div class="category-banner__media"><img src="${image}" alt="${title}" loading="lazy" /></div>` : ''}
    <div class="category-banner__content">
      <h2>${title}</h2>
      <p>${subtitle}</p>
      ${linkLabel && linkUrl ? `<p><a class="category-banner__cta" href="${linkUrl}">${linkLabel}</a></p>` : ''}
    </div>
  </div>
</div>`;

  const contentNodes: JSONContent[] = [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: title }],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: subtitle }],
    },
  ];

  if (linkLabel && linkUrl) {
    contentNodes.push({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: linkLabel,
          marks: [
            {
              type: 'link',
              attrs: {
                href: linkUrl,
                target: '_blank',
                rel: 'noopener noreferrer nofollow',
                class: 'category-banner__cta',
              },
            },
          ],
        },
      ],
    });
  }

  const innerContent: JSONContent[] = [];

  if (image) {
    innerContent.push({
      type: 'divBlock',
      attrs: { class: 'category-banner__media' },
      content: [
        {
          type: 'image',
          attrs: {
            src: image,
            alt: title,
          },
        },
      ],
    });
  }

  innerContent.push({
    type: 'divBlock',
    attrs: { class: 'category-banner__content' },
    content: contentNodes,
  });

  const markupNode: JSONContent = {
    type: 'divBlock',
    attrs: { class: 'category-banner', dataWidget: 'banner' },
    content: [
      {
        type: 'divBlock',
        attrs: { class: 'category-banner__inner' },
        content: innerContent,
      },
    ],
  };

  return { markup, markupNode };
};

const createCountdownPreset = (locale: WidgetLocale = 'cs'): CountdownWidgetConfig => {
  const copy = countdownCopy[locale] ?? countdownCopy.cs;
  return {
    type: 'countdown',
    placement: 'top',
    locale,
    headline: copy.headline,
    message: copy.message,
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    cta_label: copy.cta_label,
    cta_url: '#',
    background_color: '#1f3a8a',
    text_color: '#ffffff',
    layout: 'stacked',
    format: 'digital',
  };
};

const createBannerPreset = (locale: WidgetLocale = 'cs'): BannerWidgetConfig => {
  const copy = bannerCopy[locale] ?? bannerCopy.cs;
  return {
    type: 'banner',
    placement: 'top',
    title: copy.title,
    subtitle: copy.subtitle,
    image: 'https://placehold.co/800x360?text=Kategorie+banner',
    link_label: copy.link_label,
    link_url: '#',
  };
};

const createDiscountTilesPreset = (locale: WidgetLocale = 'cs'): DiscountTilesWidgetConfig => {
  const copy = discountTilesCopy[locale] ?? discountTilesCopy.cs;

  return {
    type: 'discountTiles',
    placement: 'bottom',
    locale,
    filter_keyword: copy.keyword,
    tile_label: copy.label,
    tile_background: '#ff3f5f',
    active_background: '#ea1539',
    tile_text_color: '#ffffff',
    banner_image: '',
    banner_alt: copy.label,
    banner_link: '',
  };
};

const createPromoCountdownPreset = (locale: WidgetLocale = 'cs'): PromoCountdownWidgetConfig => {
  const copy = promoCountdownCopy[locale] ?? promoCountdownCopy.cs;
  return {
    type: 'promoCountdown',
    placement: 'top',
    locale,
    headline: copy.headline,
    subheadline: copy.subheadline,
    description: copy.description,
    cta_label: copy.cta,
    cta_link: '#',
    background_style: 'linear-gradient(135deg,#d97706,#f97316)',
    background_image: '',
    overlay_color: 'rgba(0,0,0,0.18)',
    text_color: '#ffffff',
    accent_color: '#ffe8c7',
    mode: 'fixed',
    deadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    interval_hours: 24,
    interval_minutes: 0,
    recurring_anchor: '',
    layout: 'square',
    headline_size: 44,
    subheadline_size: 24,
    description_size: 18,
    cta_font_size: 16,
    headline_color: null,
    subheadline_color: null,
    description_color: null,
    cta_background: '',
    cta_text_color: '',
    cta_border_color: '',
    max_width: 520,
    max_height: null,
  };
};

export const CategoryTreePage = () => {
  const shopsQuery = useShops({ per_page: 200 });
  const shops = shopsQuery.data?.data ?? EMPTY_SHOPS;

  const shopOptions = useMemo(
    () =>
      shops.map((shop) => ({
        value: shop.id.toString(),
        label: shop.name ? `${shop.name} (ID ${shop.id})` : `Shop #${shop.id}`,
      })),
    [shops]
  );

  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedShopId && shopOptions.length > 0) {
      setSelectedShopId(shopOptions[0].value);
    }
  }, [selectedShopId, shopOptions]);

  const numericShopId = selectedShopId ? Number(selectedShopId) : null;

  const activeShop = useMemo(() => {
    if (numericShopId !== null) {
      return shops.find((shop) => shop.id === numericShopId) ?? null;
    }
    if (selectedShopId) {
      return shops.find((shop) => shop.id.toString() === selectedShopId) ?? null;
    }
    return null;
  }, [numericShopId, selectedShopId, shops]);

  const shopDisplayLabel = useMemo(() => {
    const label = activeShop?.name?.trim();
    if (label) {
      return label;
    }
    if (numericShopId) {
      return `Shop #${numericShopId}`;
    }

    return 'Shoptet';
  }, [activeShop, numericShopId]);

  const defaultWidgetLocale = useMemo(
    () => normalizeWidgetLocale(activeShop?.locale ?? activeShop?.default_locale ?? 'cs'),
    [activeShop]
  );

  const treeParams = useMemo(
    () => ({
      shop_id: numericShopId ?? undefined,
    }),
    [numericShopId]
  );

  const treeQuery = useCategoryTree(treeParams);
  const syncCategories = useSyncShopCategories();
  const createNode = useCreateShopCategoryNode();
  const updateNode = useUpdateShopCategoryNode();
  const deleteNode = useDeleteShopCategoryNode();
  const pushCategoryDescription = usePushShopCategoryNodeDescription();
  const generateCategoryContentMutation = useGenerateCategoryContent();
  const translateCategoryContentMutation = useTranslateCategoryContent();
  const pluginsQuery = useShoptetPlugins(
    numericShopId
      ? { shop_id: numericShopId, per_page: 100 }
      : { per_page: 100 }
  );
  const availablePlugins = pluginsQuery.data?.data ?? [];

  const shopTree = treeQuery.data?.shop ?? EMPTY_SHOP_TREE;
  const syncedAt = treeQuery.data?.shop_synced_at ?? null;

  const flattened = useMemo(() => flattenNodes(shopTree), [shopTree]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (shopTree.length > 0) {
      const rootIds = shopTree.map((node) => node.id);
      setExpanded((prev) => new Set([...prev, ...rootIds]));
    }
  }, [shopTree]);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [modalNodeId, setModalNodeId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [slugInput, setSlugInput] = useState('');
  const [parentSelect, setParentSelect] = useState<string>('root');
  const [positionInput, setPositionInput] = useState<number | ''>('');
  const [visibleInput, setVisibleInput] = useState(true);
  const [urlInput, setUrlInput] = useState('');
  const [indexNameInput, setIndexNameInput] = useState('');
  const [imageInput, setImageInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [secondDescriptionInput, setSecondDescriptionInput] = useState('');
  const [menuTitleInput, setMenuTitleInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [metaDescriptionInput, setMetaDescriptionInput] = useState('');
  const [customerVisibilityInput, setCustomerVisibilityInput] = useState<string>('all');
  const [productOrderingInput, setProductOrderingInput] = useState<string>('');
  const [similarCategoryGuidInput, setSimilarCategoryGuidInput] = useState('');
  const [relatedCategoryGuidInput, setRelatedCategoryGuidInput] = useState('');
  const [modalTab, setModalTab] = useState<'general' | 'content' | 'seo'>('general');
  const topEditorRef = useRef<Editor | null>(null);
  const bottomEditorRef = useRef<Editor | null>(null);
  const [pluginDrawerOpen, setPluginDrawerOpen] = useState(false);
  const [pluginTarget, setPluginTarget] = useState<'description' | 'second_description'>('description');
  const [widgetLocale, setWidgetLocale] = useState<WidgetLocale>(defaultWidgetLocale);
  const [countdownWidget, setCountdownWidget] = useState<CountdownWidgetConfig>(() => createCountdownPreset(defaultWidgetLocale));
  const [bannerWidget, setBannerWidget] = useState<BannerWidgetConfig>(() => createBannerPreset(defaultWidgetLocale));
  const [promoCountdownWidget, setPromoCountdownWidget] = useState<PromoCountdownWidgetConfig>(
    () => createPromoCountdownPreset(defaultWidgetLocale)
  );
  const [discountTilesWidget, setDiscountTilesWidget] = useState<DiscountTilesWidgetConfig>(
    () => createDiscountTilesPreset(defaultWidgetLocale)
  );
  const [aiContentDrawerOpen, setAiContentDrawerOpen] = useState(false);
  const [aiContentNotes, setAiContentNotes] = useState('');
  const [aiContentResult, setAiContentResult] = useState<GenerateCategoryContentResponse | null>(null);
  const [aiContentSelectedFields, setAiContentSelectedFields] = useState<Set<CategoryContentField>>(
    () => new Set<CategoryContentField>(['menu_title', 'title', 'meta_description', 'description', 'second_description'])
  );
  const [aiTranslateDrawerOpen, setAiTranslateDrawerOpen] = useState(false);
  const [aiTranslateSourceLocale, setAiTranslateSourceLocale] = useState<string>('cs');
  const [aiTranslateTargetLocale, setAiTranslateTargetLocale] = useState<string>('en');
  const [aiTranslateNotes, setAiTranslateNotes] = useState('');
  const [aiTranslateResult, setAiTranslateResult] = useState<TranslateCategoryContentResponse | null>(null);
  const [aiTranslateSelectedFields, setAiTranslateSelectedFields] = useState<Set<CategoryContentField>>(
    () => new Set<CategoryContentField>(['description', 'second_description', 'meta_description', 'title'])
  );
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageTarget, setImageTarget] = useState<'description' | 'second_description'>('description');
  const [imageTab, setImageTab] = useState<'link' | 'ai'>('link');
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imageAltInput, setImageAltInput] = useState('');
  const [imageWidthInput, setImageWidthInput] = useState('');
  const [imagePromptInput, setImagePromptInput] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  useEffect(() => {
    setWidgetLocale(defaultWidgetLocale);
    setCountdownWidget((prev) => {
      const base = createCountdownPreset(defaultWidgetLocale);
      return {
        ...base,
        deadline: prev.deadline ?? base.deadline,
        background_color: prev.background_color ?? base.background_color,
        text_color: prev.text_color ?? base.text_color,
        layout: prev.layout ?? base.layout,
        format: prev.format ?? base.format,
      };
    });
    setBannerWidget((prev) => {
      const base = createBannerPreset(defaultWidgetLocale);
      return {
        ...base,
        image: prev.image ?? base.image,
        link_label: base.link_label,
        link_url: prev.link_url ?? base.link_url,
      };
    });
      setPromoCountdownWidget((prev) => {
        const base = createPromoCountdownPreset(defaultWidgetLocale);
        return {
          ...base,
          placement: prev.placement ?? base.placement,
          headline: prev.headline ?? base.headline,
          subheadline: prev.subheadline ?? base.subheadline,
          description: prev.description ?? base.description,
          cta_label: prev.cta_label ?? base.cta_label,
          cta_link: prev.cta_link ?? base.cta_link,
          background_style: prev.background_style ?? base.background_style,
          background_image: prev.background_image ?? base.background_image,
          overlay_color: prev.overlay_color ?? base.overlay_color,
          text_color: prev.text_color ?? base.text_color,
          accent_color: prev.accent_color ?? base.accent_color,
          mode: prev.mode ?? base.mode,
          deadline: prev.deadline ?? base.deadline,
          interval_hours: prev.interval_hours ?? base.interval_hours,
          interval_minutes: prev.interval_minutes ?? base.interval_minutes,
          recurring_anchor: prev.recurring_anchor ?? base.recurring_anchor,
          layout: prev.layout ?? base.layout,
          headline_size: prev.headline_size ?? base.headline_size,
          subheadline_size: prev.subheadline_size ?? base.subheadline_size,
          description_size: prev.description_size ?? base.description_size,
          cta_font_size: prev.cta_font_size ?? base.cta_font_size,
          headline_color: prev.headline_color ?? base.headline_color,
          subheadline_color: prev.subheadline_color ?? base.subheadline_color,
          description_color: prev.description_color ?? base.description_color,
          cta_background: prev.cta_background ?? base.cta_background,
          cta_text_color: prev.cta_text_color ?? base.cta_text_color,
          cta_border_color: prev.cta_border_color ?? base.cta_border_color,
          max_width: prev.max_width ?? base.max_width,
          max_height: prev.max_height ?? base.max_height,
        };
      });
    setDiscountTilesWidget((prev) => {
      const base = createDiscountTilesPreset(defaultWidgetLocale);
      return {
        ...base,
        placement: prev.placement ?? base.placement,
        filter_keyword: prev.filter_keyword ?? base.filter_keyword,
        tile_label: prev.tile_label ?? base.tile_label,
        tile_background: prev.tile_background ?? base.tile_background,
        active_background: prev.active_background ?? base.active_background,
        tile_text_color: prev.tile_text_color ?? base.tile_text_color,
        banner_image: prev.banner_image ?? base.banner_image,
        banner_alt: prev.banner_alt ?? base.banner_alt,
        banner_link: prev.banner_link ?? base.banner_link,
      };
    });
  }, [defaultWidgetLocale]);

  useEffect(() => {
    if (!pluginDrawerOpen) {
      return;
    }
    setCountdownWidget((prev) => {
      const base = createCountdownPreset(widgetLocale);
      return {
        ...base,
        deadline: prev.deadline ?? base.deadline,
        background_color: prev.background_color ?? base.background_color,
        text_color: prev.text_color ?? base.text_color,
        layout: prev.layout ?? base.layout,
        format: prev.format ?? base.format,
      };
    });
    setBannerWidget((prev) => {
      const base = createBannerPreset(widgetLocale);
      return {
        ...base,
        image: prev.image ?? base.image,
        link_label: base.link_label,
        link_url: prev.link_url ?? base.link_url,
      };
    });
    setDiscountTilesWidget((prev) => {
      const base = createDiscountTilesPreset(widgetLocale);
      return {
        ...base,
        placement: prev.placement ?? base.placement,
        filter_keyword: prev.filter_keyword ?? base.filter_keyword,
        tile_label: prev.tile_label ?? base.tile_label,
        tile_background: prev.tile_background ?? base.tile_background,
        active_background: prev.active_background ?? base.active_background,
        tile_text_color: prev.tile_text_color ?? base.tile_text_color,
        banner_image: prev.banner_image ?? base.banner_image,
        banner_alt: prev.banner_alt ?? base.banner_alt,
        banner_link: prev.banner_link ?? base.banner_link,
      };
    });
  }, [pluginDrawerOpen, widgetLocale]);

  const resetModalState = () => {
    setNameInput('');
    setSlugInput('');
    setParentSelect('root');
    setPositionInput('');
    setVisibleInput(true);
    setUrlInput('');
    setIndexNameInput('');
    setImageInput('');
    setDescriptionInput('');
    setSecondDescriptionInput('');
    setMenuTitleInput('');
    setTitleInput('');
    setMetaDescriptionInput('');
    setCustomerVisibilityInput('all');
    setProductOrderingInput('');
    setSimilarCategoryGuidInput('');
    setRelatedCategoryGuidInput('');
    setModalNodeId(null);
    setModalTab('general');
    setAiContentNotes('');
    setAiContentResult(null);
    setAiContentSelectedFields(
      new Set<CategoryContentField>(['menu_title', 'title', 'meta_description', 'description', 'second_description'])
    );
    setAiTranslateNotes('');
    setAiTranslateResult(null);
    setAiTranslateSelectedFields(
      new Set<CategoryContentField>(['description', 'second_description', 'meta_description', 'title'])
    );
  };

  const parentOptions = useMemo(() => {
    const options = flattened.map(({ node, depth }) => ({
      value: node.id,
      label: `${' '.repeat(depth * 2)}${node.name}`,
    }));

    return [{ value: 'root', label: 'Kořenová kategorie' }, ...options];
  }, [flattened]);

  const openCreateModal = (parent: ShopTreeNode | null) => {
    setCreateModalOpen(true);
    setEditModalOpen(false);
    setModalTab('general');
    setAiContentResult(null);
    setAiContentNotes('');
    setAiContentSelectedFields(
      new Set<CategoryContentField>(['menu_title', 'title', 'meta_description', 'description', 'second_description'])
    );
    setAiTranslateResult(null);
    setAiTranslateNotes('');
    setAiTranslateSelectedFields(
      new Set<CategoryContentField>(['description', 'second_description', 'meta_description', 'title'])
    );
    setParentSelect(parent ? parent.id : 'root');
    setNameInput('');
    setSlugInput('');
    const defaultPosition = parent ? parent.children.length : shopTree.length;
    setPositionInput(defaultPosition);
    setVisibleInput(true);
    setUrlInput('');
    setIndexNameInput('');
    setImageInput('');
    setDescriptionInput('');
    setSecondDescriptionInput('');
    setMenuTitleInput('');
    setTitleInput('');
    setMetaDescriptionInput('');
    setCustomerVisibilityInput('all');
    setProductOrderingInput('');
    setSimilarCategoryGuidInput('');
    setRelatedCategoryGuidInput('');
    if (parent) {
      setExpanded((prev) => new Set(prev).add(parent.id));
    }
  };

  const openEditModal = (node: ShopTreeNode) => {
    setEditModalOpen(true);
    setCreateModalOpen(false);
    setModalTab('general');
    setAiContentResult(null);
    setAiContentNotes('');
    setAiContentSelectedFields(
      new Set<CategoryContentField>(['menu_title', 'title', 'meta_description', 'description', 'second_description'])
    );
    setAiTranslateResult(null);
    setAiTranslateNotes('');
    setAiTranslateSelectedFields(
      new Set<CategoryContentField>(['description', 'second_description', 'meta_description', 'title'])
    );
    setModalNodeId(node.id);
    setNameInput(node.name);
    setSlugInput(node.slug ?? '');
    const entry = flattened.find((item) => item.node.id === node.id);
    setParentSelect(entry?.parentId ?? 'root');
    setPositionInput(entry?.order ?? 0);
    setVisibleInput(node.visible ?? true);
    setUrlInput(node.url ?? '');
    setIndexNameInput(node.index_name ?? '');
    setImageInput(node.image ?? '');
    setDescriptionInput(node.description ?? '');
    setSecondDescriptionInput(node.second_description ?? '');
    setMenuTitleInput(node.menu_title ?? '');
    setTitleInput(node.title ?? '');
    setMetaDescriptionInput(node.meta_description ?? '');
    setCustomerVisibilityInput(node.customer_visibility ?? '');
    setProductOrderingInput(node.product_ordering ?? '');
    setSimilarCategoryGuidInput(node.similar_category_guid ?? '');
    setRelatedCategoryGuidInput(node.related_category_guid ?? '');
  };

  const handleCloseModals = () => {
    setCreateModalOpen(false);
    setEditModalOpen(false);
    resetModalState();
  };

  const handleSync = async () => {
    if (!numericShopId) {
      notifications.show({ message: 'Vyber prosím e-shop.', color: 'yellow' });
      return;
    }

    try {
      await syncCategories.mutateAsync({ shop_id: numericShopId });
      notifications.show({ message: 'Kategorie byly staženy ze Shoptetu.', color: 'green' });
      await treeQuery.refetch();
    } catch (error) {
      notifications.show({
        message: getErrorMessage(error),
        color: 'red',
      });
    }
  };

  const handleCreate = async () => {
    if (!numericShopId) {
      notifications.show({ message: 'Vyber prosím e-shop.', color: 'yellow' });
      return;
    }

    if (nameInput.trim() === '') {
      notifications.show({ message: 'Název kategorie je povinný.', color: 'red' });
      return;
    }

    try {
      await createNode.mutateAsync({
        shop_id: numericShopId,
        parent_id: parentSelect === 'root' ? null : parentSelect,
        name: nameInput.trim(),
        slug: slugInput.trim() || undefined,
        position: positionInput === '' ? undefined : Number(positionInput),
        visible: visibleInput,
        url: urlInput.trim() || undefined,
        index_name: indexNameInput.trim() || undefined,
        image: imageInput.trim() || undefined,
        description: descriptionInput.trim() || undefined,
        second_description: secondDescriptionInput.trim() || undefined,
        menu_title: menuTitleInput.trim() || undefined,
        title: titleInput.trim() || undefined,
        meta_description: metaDescriptionInput.trim() || undefined,
        customer_visibility: customerVisibilityInput || undefined,
        product_ordering: productOrderingInput || undefined,
        similar_category_guid: similarCategoryGuidInput.trim() || undefined,
        related_category_guid: relatedCategoryGuidInput.trim() || undefined,
      });
      notifications.show({ message: 'Kategorie byla vytvořena.', color: 'green' });
      handleCloseModals();
      await treeQuery.refetch();
    } catch (error) {
      notifications.show({ message: getErrorMessage(error), color: 'red' });
    }
  };

  const handleUpdate = async () => {
    if (!numericShopId || !modalNodeId) {
      notifications.show({ message: 'Vyber prosím e-shop i kategorii.', color: 'yellow' });
      return;
    }

    if (nameInput.trim() === '') {
      notifications.show({ message: 'Název kategorie je povinný.', color: 'red' });
      return;
    }

    try {
      await updateNode.mutateAsync({
        id: modalNodeId,
        shop_id: numericShopId,
        parent_id: parentSelect === 'root' ? null : parentSelect,
        name: nameInput.trim(),
        slug: slugInput.trim() || undefined,
        position: positionInput === '' ? undefined : Number(positionInput),
        visible: visibleInput,
        url: urlInput.trim() || undefined,
        index_name: indexNameInput.trim() || undefined,
        image: imageInput.trim() || undefined,
        description: descriptionInput.trim() || undefined,
        second_description: secondDescriptionInput.trim() || undefined,
        menu_title: menuTitleInput.trim() || undefined,
        title: titleInput.trim() || undefined,
        meta_description: metaDescriptionInput.trim() || undefined,
        customer_visibility: customerVisibilityInput || undefined,
        product_ordering: productOrderingInput || undefined,
        similar_category_guid: similarCategoryGuidInput.trim() || undefined,
        related_category_guid: relatedCategoryGuidInput.trim() || undefined,
      });
      notifications.show({ message: 'Kategorie byla upravena.', color: 'green' });
      handleCloseModals();
      await treeQuery.refetch();
    } catch (error) {
      notifications.show({ message: getErrorMessage(error), color: 'red' });
    }
  };

  const handlePushDescription = async () => {
    if (!numericShopId || !modalNodeId) {
      notifications.show({ message: 'Vyber prosím e-shop i kategorii.', color: 'yellow' });
      return;
    }

    try {
      const result = await pushCategoryDescription.mutateAsync({
        id: modalNodeId,
        shop_id: numericShopId,
        description: descriptionInput.trim() || null,
        second_description: secondDescriptionInput.trim() || null,
      });

      setDescriptionInput(result.category.description ?? '');
      setSecondDescriptionInput(result.category.second_description ?? '');
      notifications.show({
        message: `Kategorie byla odeslána do Shoptetu ${shopDisplayLabel}.`,
        color: 'green',
      });
      await treeQuery.refetch();
    } catch (error) {
      notifications.show({ message: getErrorMessage(error), color: 'red' });
    }
  };

  const handleDelete = async (node: ShopTreeNode) => {
    if (!numericShopId) {
      notifications.show({ message: 'Vyber prosím e-shop.', color: 'yellow' });
      return;
    }

    const confirmed = window.confirm(`Opravdu chceš smazat kategorii “${node.name}” včetně podkategorií?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteNode.mutateAsync({ id: node.id, shop_id: numericShopId });
      notifications.show({ message: 'Kategorie byla odstraněna.', color: 'green' });
      await treeQuery.refetch();
    } catch (error) {
      notifications.show({ message: getErrorMessage(error), color: 'red' });
    }
  };

  const buildParentOptionsForEdit = useCallback(
    (nodeId: string | null) => {
      if (!nodeId) {
        return parentOptions;
      }

      const currentNode = findNodeById(shopTree, nodeId);
      if (!currentNode) {
        return parentOptions;
      }

      const invalidIds = new Set([nodeId, ...collectDescendantIds(currentNode)]);

      return parentOptions.filter((option) => !invalidIds.has(option.value));
    },
    [parentOptions, shopTree]
  );

  const parentOptionsForEdit = useMemo(
    () => buildParentOptionsForEdit(modalNodeId),
    [buildParentOptionsForEdit, modalNodeId]
  );

  const customerVisibilityOptions = [
    { value: 'all', label: 'Všichni zákazníci' },
    { value: 'registered', label: 'Pouze registrovaní' },
    { value: 'unregistered', label: 'Pouze neregistrovaní' },
  ];

  const productOrderingOptions = [
    { value: 'default', label: 'Výchozí' },
    { value: 'most-selling', label: 'Nejprodávanější' },
    { value: 'cheapest', label: 'Nejlevnější' },
    { value: 'most-expensive', label: 'Nejdražší' },
    { value: 'oldest', label: 'Nejstarší' },
    { value: 'newest', label: 'Nejnovější' },
    { value: 'alphabetically', label: 'Abecedně A→Z' },
    { value: 'alphabetically-desc', label: 'Abecedně Z→A' },
    { value: 'product-code', label: 'Kód produktu ↑' },
    { value: 'product-code-desc', label: 'Kód produktu ↓' },
    { value: 'category-priority', label: 'Priorita kategorie ↑' },
    { value: 'category-priority-desc', label: 'Priorita kategorie ↓' },
  ];

  const isLoading = treeQuery.isLoading || treeQuery.isFetching;
  const isSyncing = syncCategories.isPending;
  const aiContentLoading = generateCategoryContentMutation.isPending;
  const aiTranslateLoading = translateCategoryContentMutation.isPending;

  const toggleAiContentField = useCallback((field: CategoryContentField) => {
    setAiContentSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next as Set<CategoryContentField>;
    });
  }, []);

  const toggleAiTranslateField = useCallback((field: CategoryContentField) => {
    setAiTranslateSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next as Set<CategoryContentField>;
    });
  }, []);

  const insertSnippet = useCallback(
    (target: 'description' | 'second_description', snippet: string | WidgetSnippet) => {
      const normalized: WidgetSnippet =
        typeof snippet === 'string'
          ? { markup: snippet.trim() }
          : {
              markup: snippet.markup?.trim() ?? '',
              script: snippet.script?.trim(),
            };

      if (!normalized.markup) {
        return;
      }

      if (target === 'description') {
        const editor = topEditorRef.current;
        if (editor) {
          const chain = editor.chain().focus();
          if (normalized.markupNode) {
            chain.insertContent(normalized.markupNode);
          } else {
            chain.insertContent(normalized.markup);
          }
          if (normalized.scriptNode) {
            chain.insertContent(normalized.scriptNode);
          } else if (normalized.script) {
            chain.insertContent({
              type: 'scriptBlock',
              attrs: { type: 'text/javascript' },
              content: [{ type: 'text', text: normalized.script }],
            });
          }
          chain.run();
          setDescriptionInput(editor.getHTML());
        } else {
          setDescriptionInput((prev) => {
            const scriptTag = normalized.script
              ? `<script type="text/javascript">\n${normalized.script}\n</script>`
              : '';
            const payload = `${normalized.markup}${scriptTag ? `\n${scriptTag}` : ''}`;
            return prev ? `${prev}\n${payload}` : payload;
          });
        }
      } else {
        const editor = bottomEditorRef.current;
        if (editor) {
          const chain = editor.chain().focus();
          if (normalized.markupNode) {
            chain.insertContent(normalized.markupNode);
          } else {
            chain.insertContent(normalized.markup);
          }
          if (normalized.scriptNode) {
            chain.insertContent(normalized.scriptNode);
          } else if (normalized.script) {
            chain.insertContent({
              type: 'scriptBlock',
              attrs: { type: 'text/javascript' },
              content: [{ type: 'text', text: normalized.script }],
            });
          }
          chain.run();
          setSecondDescriptionInput(editor.getHTML());
        } else {
          setSecondDescriptionInput((prev) => {
            const scriptTag = normalized.script
              ? `<script type="text/javascript">\n${normalized.script}\n</script>`
              : '';
            const payload = `${normalized.markup}${scriptTag ? `\n${scriptTag}` : ''}`;
            return prev ? `${prev}\n${payload}` : payload;
          });
        }
      }
    },
    [setDescriptionInput, setSecondDescriptionInput]
  );

  const openPluginDrawer = useCallback(
    (target: 'description' | 'second_description') => {
      setPluginTarget(target);
      const placement = target === 'description' ? 'top' : 'bottom';
      setCountdownWidget((prev) => ({ ...prev, placement }));
      setBannerWidget((prev) => ({ ...prev, placement }));
      setDiscountTilesWidget((prev) => ({ ...prev, placement }));
      setPluginDrawerOpen(true);
    },
    []
  );

  const openImageModal = useCallback((target: 'description' | 'second_description') => {
    setImageTarget(target);
    setImageModalOpen(true);
    setImageTab('link');
    setImageUrlInput('');
    setImageAltInput('');
    setImageWidthInput('');
    setImagePromptInput('');
  }, []);

  const handleGenerateAiContent = useCallback(async () => {
    if (!numericShopId) {
      notifications.show({ message: 'Vyber prosím e-shop.', color: 'yellow' });
      return;
    }

    const payload = {
      shop_id: numericShopId,
      category_id: modalNodeId,
      parent_id: parentSelect === 'root' ? null : parentSelect,
      name: nameInput.trim() || undefined,
      description: descriptionInput || undefined,
      second_description: secondDescriptionInput || undefined,
      meta_description: metaDescriptionInput || undefined,
      menu_title: menuTitleInput || undefined,
      title: titleInput || undefined,
      context_notes: aiContentNotes.trim() || undefined,
    } as const;

    try {
      const result = await generateCategoryContentMutation.mutateAsync(payload);
      setAiContentResult(result);
      notifications.show({ message: 'AI připravil návrh obsahu.', color: 'teal' });
    } catch (error) {
      notifications.show({ message: getErrorMessage(error), color: 'red' });
    }
  }, [
    aiContentNotes,
    descriptionInput,
    generateCategoryContentMutation,
    metaDescriptionInput,
    modalNodeId,
    nameInput,
    menuTitleInput,
    numericShopId,
    parentSelect,
    secondDescriptionInput,
    titleInput,
  ]);

  const handleApplyAiContent = useCallback(() => {
    if (!aiContentResult) {
      return;
    }

    const fields = aiContentSelectedFields;

    if (fields.has('menu_title')) {
      setMenuTitleInput(aiContentResult.menu_title ?? '');
    }

    if (fields.has('title')) {
      setTitleInput(aiContentResult.title ?? '');
    }

    if (fields.has('meta_description')) {
      setMetaDescriptionInput(aiContentResult.meta_description ?? '');
    }

    if (fields.has('description')) {
      const content = aiContentResult.description ?? '';
      setDescriptionInput(content);
      if (topEditorRef.current) {
        topEditorRef.current.commands.setContent(content || '', false);
      }
    }

    if (fields.has('second_description')) {
      const content = aiContentResult.second_description ?? '';
      setSecondDescriptionInput(content);
      if (bottomEditorRef.current) {
        bottomEditorRef.current.commands.setContent(content || '', false);
      }
    }

    setAiContentDrawerOpen(false);
    notifications.show({ message: 'AI obsah byl vložen do formuláře.', color: 'green' });
  }, [
    aiContentResult,
    aiContentSelectedFields,
    bottomEditorRef,
    setDescriptionInput,
    setMenuTitleInput,
    setMetaDescriptionInput,
    setSecondDescriptionInput,
    setTitleInput,
    topEditorRef,
  ]);

  const handleInsertCountdownWidget = useCallback(() => {
    const target = countdownWidget.placement === 'top' ? 'description' : 'second_description';
    const payload: CountdownWidgetConfig = { ...countdownWidget, locale: widgetLocale };
    insertSnippet(target, buildWidgetSnippet(payload));
    setPluginDrawerOpen(false);
    notifications.show({ message: 'Odpočet byl vložen do obsahu.', color: 'teal' });
  }, [countdownWidget, insertSnippet, widgetLocale]);

  const handleInsertBannerWidget = useCallback(() => {
    const target = bannerWidget.placement === 'top' ? 'description' : 'second_description';
    insertSnippet(target, buildWidgetSnippet(bannerWidget));
    setPluginDrawerOpen(false);
    notifications.show({ message: 'Banner byl vložen do obsahu.', color: 'teal' });
  }, [bannerWidget, insertSnippet]);

  const handleInsertPromoCountdownWidget = useCallback(() => {
    const target = promoCountdownWidget.placement === 'top' ? 'description' : 'second_description';
    const payload: PromoCountdownWidgetConfig = { ...promoCountdownWidget, locale: widgetLocale };
    insertSnippet(target, buildWidgetSnippet(payload));
    setPluginDrawerOpen(false);
    notifications.show({ message: 'Banner s odpočtem byl vložen do obsahu.', color: 'teal' });
  }, [promoCountdownWidget, insertSnippet, widgetLocale]);

  const handleInsertDiscountTilesWidget = useCallback(() => {
    const target = discountTilesWidget.placement === 'top' ? 'description' : 'second_description';
    const payload: DiscountTilesWidgetConfig = { ...discountTilesWidget, locale: widgetLocale };
    insertSnippet(target, buildWidgetSnippet(payload));
    setPluginDrawerOpen(false);
    notifications.show({ message: 'Dlaždice byly vloženy do obsahu.', color: 'teal' });
  }, [discountTilesWidget, insertSnippet, widgetLocale]);

  const handleWidgetLocaleChange = useCallback(
    (value: string | null) => {
      const next = normalizeWidgetLocale(value ?? defaultWidgetLocale);
      setWidgetLocale(next);
      setCountdownWidget((prev) => {
        const base = createCountdownPreset(next);
        return {
          ...base,
          deadline: prev.deadline ?? base.deadline,
          background_color: prev.background_color ?? base.background_color,
          text_color: prev.text_color ?? base.text_color,
          layout: prev.layout ?? base.layout,
          format: prev.format ?? base.format,
        };
      });
      setBannerWidget((prev) => {
        const base = createBannerPreset(next);
        return {
          ...base,
          image: prev.image ?? base.image,
          link_label: base.link_label,
          link_url: prev.link_url ?? base.link_url,
        };
      });
      setPromoCountdownWidget((prev) => {
        const base = createPromoCountdownPreset(next);
        return {
          ...base,
          placement: prev.placement ?? base.placement,
          headline: prev.headline ?? base.headline,
          subheadline: prev.subheadline ?? base.subheadline,
          description: prev.description ?? base.description,
          cta_label: prev.cta_label ?? base.cta_label,
          cta_link: prev.cta_link ?? base.cta_link,
          background_style: prev.background_style ?? base.background_style,
          background_image: prev.background_image ?? base.background_image,
          overlay_color: prev.overlay_color ?? base.overlay_color,
          text_color: prev.text_color ?? base.text_color,
          accent_color: prev.accent_color ?? base.accent_color,
          mode: prev.mode ?? base.mode,
          deadline: prev.deadline ?? base.deadline,
          interval_hours: prev.interval_hours ?? base.interval_hours,
          interval_minutes: prev.interval_minutes ?? base.interval_minutes,
          recurring_anchor: prev.recurring_anchor ?? base.recurring_anchor,
          layout: prev.layout ?? base.layout,
          headline_size: prev.headline_size ?? base.headline_size,
          subheadline_size: prev.subheadline_size ?? base.subheadline_size,
          description_size: prev.description_size ?? base.description_size,
          cta_font_size: prev.cta_font_size ?? base.cta_font_size,
          headline_color: prev.headline_color ?? base.headline_color,
          subheadline_color: prev.subheadline_color ?? base.subheadline_color,
          description_color: prev.description_color ?? base.description_color,
          cta_background: prev.cta_background ?? base.cta_background,
          cta_text_color: prev.cta_text_color ?? base.cta_text_color,
          cta_border_color: prev.cta_border_color ?? base.cta_border_color,
          max_width: prev.max_width ?? base.max_width,
          max_height: prev.max_height ?? base.max_height,
        };
      });
      setDiscountTilesWidget((prev) => {
        const base = createDiscountTilesPreset(next);
        return {
          ...base,
          placement: prev.placement ?? base.placement,
          filter_keyword: prev.filter_keyword ?? base.filter_keyword,
          tile_label: prev.tile_label ?? base.tile_label,
          tile_background: prev.tile_background ?? base.tile_background,
          active_background: prev.active_background ?? base.active_background,
          tile_text_color: prev.tile_text_color ?? base.tile_text_color,
          banner_image: prev.banner_image ?? base.banner_image,
          banner_alt: prev.banner_alt ?? base.banner_alt,
          banner_link: prev.banner_link ?? base.banner_link,
        };
      });
    },
    [defaultWidgetLocale]
  );

  const handleConfirmImageInsert = useCallback(() => {
    const editor = imageTarget === 'description' ? topEditorRef.current : bottomEditorRef.current;
    if (!editor) {
      notifications.show({ message: 'Editor není připravený. Zkus to prosím znovu.', color: 'red' });
      return;
    }

    const src = imageUrlInput.trim();
    if (!src) {
      notifications.show({ message: 'Zadej prosím URL obrázku.', color: 'yellow' });
      return;
    }

    const options: {
      src: string;
      alt?: string;
      title?: string;
      width?: number;
    } = { src };
    const alt = imageAltInput.trim();
    if (alt) {
      options.alt = alt;
      options.title = alt;
    }

    const width = imageWidthInput.trim();
    if (width) {
      const parsed = Number(width);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.width = parsed;
      }
    }

    editor.chain().focus().setImage(options).run();
    const html = editor.getHTML();
    if (imageTarget === 'description') {
      setDescriptionInput(html);
    } else {
      setSecondDescriptionInput(html);
    }

    setImageModalOpen(false);
    notifications.show({ message: 'Obrázek byl vložen do obsahu.', color: 'teal' });
  }, [imageAltInput, imageTarget, imageUrlInput, imageWidthInput]);

  const handleGenerateAiImage = useCallback(async () => {
    if (!imagePromptInput.trim()) {
      notifications.show({ message: 'Zadej prosím popis pro AI.', color: 'yellow' });
      return;
    }

    setIsGeneratingImage(true);
    try {
      notifications.show({
        message:
          'Pro generování obrázků propojených s Cloudinary je potřeba nakonfigurovat backend integraci. Domluvme se na dalším postupu.',
        color: 'blue',
      });
    } finally {
      setIsGeneratingImage(false);
    }
  }, [imagePromptInput]);

  const handleInsertAiPlugin = useCallback(
    (plugin: { id: number; name: string; latest_version_id: number | null }) => {
      if (!plugin.latest_version_id) {
        notifications.show({ message: 'Plugin zatím nemá žádnou verzi ke vložení.', color: 'yellow' });
        return;
      }

      const placeholder = `<div class="ai-plugin" data-plugin-id="${plugin.id}" data-plugin-version="${plugin.latest_version_id}">
  <!-- AI plugin: ${plugin.name} -->
</div>`;
      insertSnippet(pluginTarget, placeholder);
      setPluginDrawerOpen(false);
      notifications.show({ message: `Plugin ${plugin.name} byl přidán do obsahu.`, color: 'teal' });
    },
    [insertSnippet, pluginTarget]
  );

  const handleGenerateAiTranslation = useCallback(async () => {
    if (!numericShopId) {
      notifications.show({ message: 'Vyber prosím e-shop.', color: 'yellow' });
      return;
    }

    if (!aiTranslateTargetLocale) {
      notifications.show({ message: 'Vyber cílový jazyk.', color: 'yellow' });
      return;
    }

    if (aiTranslateSelectedFields.size === 0) {
      notifications.show({ message: 'Vyber alespoň jedno pole k překladu.', color: 'yellow' });
      return;
    }

    if (aiTranslateTargetLocale === aiTranslateSourceLocale) {
      notifications.show({ message: 'Cílový jazyk musí být odlišný od zdrojového.', color: 'yellow' });
      return;
    }

    const payloadFields: Record<string, string | null> = {};
    if (aiTranslateSelectedFields.has('menu_title')) {
      payloadFields.menu_title = menuTitleInput || null;
    }
    if (aiTranslateSelectedFields.has('title')) {
      payloadFields.title = titleInput || null;
    }
    if (aiTranslateSelectedFields.has('meta_description')) {
      payloadFields.meta_description = metaDescriptionInput || null;
    }
    if (aiTranslateSelectedFields.has('description')) {
      payloadFields.description = descriptionInput || null;
    }
    if (aiTranslateSelectedFields.has('second_description')) {
      payloadFields.second_description = secondDescriptionInput || null;
    }

    try {
      const result = await translateCategoryContentMutation.mutateAsync({
        shop_id: numericShopId,
        category_id: modalNodeId,
        source_locale: aiTranslateSourceLocale || undefined,
        target_locale: aiTranslateTargetLocale,
        fields: payloadFields,
        context_notes: aiTranslateNotes.trim() || undefined,
      });
      setAiTranslateResult(result);
      notifications.show({ message: 'AI připravil návrh překladu.', color: 'teal' });
    } catch (error) {
      notifications.show({ message: getErrorMessage(error), color: 'red' });
    }
  }, [
    aiTranslateNotes,
    aiTranslateSelectedFields,
    aiTranslateSourceLocale,
    aiTranslateTargetLocale,
    descriptionInput,
    menuTitleInput,
    metaDescriptionInput,
    modalNodeId,
    numericShopId,
    secondDescriptionInput,
    titleInput,
    translateCategoryContentMutation,
  ]);

  const handleApplyAiTranslation = useCallback(() => {
    if (!aiTranslateResult) {
      return;
    }

    if (aiTranslateSelectedFields.has('menu_title')) {
      setMenuTitleInput(aiTranslateResult.menu_title ?? '');
    }

    if (aiTranslateSelectedFields.has('title')) {
      setTitleInput(aiTranslateResult.title ?? '');
    }

    if (aiTranslateSelectedFields.has('meta_description')) {
      setMetaDescriptionInput(aiTranslateResult.meta_description ?? '');
    }

    if (aiTranslateSelectedFields.has('description')) {
      const translated = aiTranslateResult.description ?? '';
      setDescriptionInput(translated);
      if (topEditorRef.current) {
        topEditorRef.current.commands.setContent(translated || '', false);
      }
    }

    if (aiTranslateSelectedFields.has('second_description')) {
      const translated = aiTranslateResult.second_description ?? '';
      setSecondDescriptionInput(translated);
      if (bottomEditorRef.current) {
        bottomEditorRef.current.commands.setContent(translated || '', false);
      }
    }

    setAiTranslateDrawerOpen(false);
    notifications.show({ message: 'Překlad byl vložen do formuláře.', color: 'green' });
  }, [
    aiTranslateResult,
    aiTranslateSelectedFields,
    bottomEditorRef,
    setDescriptionInput,
    setMenuTitleInput,
    setMetaDescriptionInput,
    setSecondDescriptionInput,
    setTitleInput,
    topEditorRef,
  ]);

  const treeContent = () => {
    if (!numericShopId) {
      return (
        <Alert color="gray" title="Vyber e-shop" icon={<IconAlertCircle size={16} />}>
          Pro zobrazení stromu kategorií prosím nejprve zvol konkrétní e-shop.
        </Alert>
      );
    }

    if (treeQuery.error) {
      return (
        <Alert color="red" title="Nepodařilo se načíst strom" icon={<IconAlertCircle size={16} />}>
          {(treeQuery.error as Error).message || 'Načtení kategorií selhalo.'}
        </Alert>
      );
    }

    if (isLoading) {
      return (
        <Group justify="center" py="xl">
          <Text fw={500}>Načítám strom kategorií…</Text>
        </Group>
      );
    }

    if (!shopTree.length) {
      return (
        <Alert color="yellow" title="Žádné kategorie" icon={<IconAlertCircle size={16} />}>
          Tento e-shop zatím nemá žádné kategorie. Stáhni je ze Shoptetu nebo vytvoř novou kořenovou kategorii.
        </Alert>
      );
    }

    return (
      <ScrollArea.Autosize
        mah="70vh"
        offsetScrollbars
        type="scroll"
        scrollbarSize={10}
        styles={{ viewport: { paddingRight: 'var(--mantine-spacing-xs)' } }}
      >
        <Stack gap={10} pr="sm" pb="sm">
          {shopTree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              expanded={expanded}
              onToggle={(id) =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) {
                    next.delete(id);
                  } else {
                    next.add(id);
                  }
                  return next;
                })
              }
              onAddChild={(target) => openCreateModal(target)}
              onEdit={(target) => openEditModal(target)}
              onDelete={(target) => handleDelete(target)}
            />
          ))}
        </Stack>
      </ScrollArea.Autosize>
    );
  };

  const renderCategoryModal = (mode: 'create' | 'edit') => {
    const isEdit = mode === 'edit';
    const opened = isEdit ? editModalOpen : createModalOpen;
    const parentSelectOptions = isEdit ? parentOptionsForEdit : parentOptions;
    const submitHandler = isEdit ? handleUpdate : handleCreate;
    const submitLabel = isEdit ? 'Uložit změny' : 'Vytvořit kategorii';
    const submitting = isEdit ? updateNode.isPending : createNode.isPending;
    const aiDisabled = !numericShopId;
    const imageUrl = imageInput.trim();

  const renderEditorToolbar = (target: 'description' | 'second_description') => (
    <Group gap="xs">
      <Tooltip label="Vlož předpřipravené widgety nebo AI pluginy" withArrow>
        <Button
          variant="light"
          size="xs"
            leftSection={<IconPlugConnected size={14} />}
            onClick={() => openPluginDrawer(target)}
          >
            Pluginy
          </Button>
        </Tooltip>
        <Tooltip label="Nech AI připravit text" withArrow>
          <Button
            variant="light"
            size="xs"
            leftSection={<IconSparkles size={14} />}
            onClick={() => setAiContentDrawerOpen(true)}
            disabled={aiDisabled}
          >
            AI obsah
          </Button>
        </Tooltip>
        <Tooltip label="Přelož obsah pomocí AI" withArrow>
          <Button
            variant="light"
            size="xs"
            leftSection={<IconLanguage size={14} />}
            onClick={() => setAiTranslateDrawerOpen(true)}
            disabled={aiDisabled}
          >
            AI překladač
          </Button>
        </Tooltip>
      <Tooltip label="Vložit nebo vygenerovat obrázek" withArrow>
        <Button
          variant="light"
          size="xs"
          leftSection={<IconPhotoPlus size={14} />}
          onClick={() => openImageModal(target)}
        >
          Obrázek
        </Button>
      </Tooltip>
    </Group>
  );

    return (
      <Modal
        key={mode}
        opened={opened}
        onClose={handleCloseModals}
        title={isEdit ? 'Upravit kategorii' : 'Nová kategorie'}
        size="80%"
        radius="lg"
        centered
        scrollAreaComponent={ScrollArea.Autosize}
        overlayProps={{ blur: 4 }}
      >
        <Stack gap="lg">
          <Tabs
            value={modalTab}
            onChange={(value) => setModalTab((value as typeof modalTab) ?? 'general')}
            keepMounted={false}
            radius="md"
            variant="pills"
          >
            <Tabs.List>
              <Tabs.Tab value="general">Základní údaje</Tabs.Tab>
              <Tabs.Tab value="content">Obsah</Tabs.Tab>
              <Tabs.Tab value="seo">SEO & navazující obsah</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="general" pt="md">
              <Stack gap="md">
                <Switch
                  label="Kategorie je viditelná"
                  checked={visibleInput}
                  onChange={(event) => setVisibleInput(event.currentTarget.checked)}
                />

                <Grid gutter="md">
                  <Grid.Col span={12}>
                    <TextInput
                      label="Název"
                      value={nameInput}
                      onChange={(event) => setNameInput(event.currentTarget.value)}
                      required
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <TextInput
                      label="Slug"
                      value={slugInput}
                      onChange={(event) => setSlugInput(event.currentTarget.value)}
                      placeholder="Volitelné"
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <NumberInput
                      label="Pozice"
                      value={positionInput}
                      onChange={(value) => {
                        if (value === '') {
                          setPositionInput('');
                        } else if (typeof value === 'number') {
                          setPositionInput(value);
                        } else {
                          const parsed = Number(value);
                          setPositionInput(Number.isNaN(parsed) ? '' : parsed);
                        }
                      }}
                      min={0}
                      description="Pořadí v rámci sourozenců"
                    />
                  </Grid.Col>
                  <Grid.Col span={12}>
                    <Select
                      label="Nadřazená kategorie"
                      data={parentSelectOptions}
                      value={parentSelect}
                      onChange={(value) => setParentSelect(value ?? 'root')}
                      comboboxProps={{ withinPortal: true }}
                      description="Kam se má kategorie zařadit"
                    />
                  </Grid.Col>
                  <Grid.Col span={12}>
                    <TextInput
                      label="URL kategorie"
                      value={urlInput}
                      onChange={(event) => setUrlInput(event.currentTarget.value)}
                      placeholder="https://..."
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <TextInput
                      label="Index name"
                      value={indexNameInput}
                      onChange={(event) => setIndexNameInput(event.currentTarget.value)}
                      placeholder="Interní název pro vyhledávání"
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <TextInput
                      label="URL obrázku"
                      value={imageInput}
                      onChange={(event) => setImageInput(event.currentTarget.value)}
                      placeholder="https://..."
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    {imageUrl ? (
                      <Paper withBorder radius="md" p="xs">
                        <Image src={imageUrl} alt={nameInput || 'Náhled kategorie'} radius="md" fit="contain" h={220} />
                      </Paper>
                    ) : (
                      <Paper withBorder radius="md" p="lg" c="dimmed">
                        <Stack gap={4} align="center">
                          <IconPhoto size={28} />
                          <Text size="sm">Přidej URL obrázku pro zobrazení náhledu.</Text>
                        </Stack>
                      </Paper>
                    )}
                  </Grid.Col>
                </Grid>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="content" pt="md">
              <Stack gap="lg">
                <Grid gutter="md">
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <TextInput
                      label="Titulek v menu"
                      value={menuTitleInput}
                      onChange={(event) => setMenuTitleInput(event.currentTarget.value)}
                      placeholder="Zobrazí se v navigaci"
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <TextInput
                      label="Meta title"
                      value={titleInput}
                      onChange={(event) => setTitleInput(event.currentTarget.value)}
                      placeholder="Název pro vyhledávače"
                    />
                  </Grid.Col>
                </Grid>

                <RichContentEditor
                  label="Horní popis"
                  description="Zobrazí se nad seznamem produktů"
                  value={descriptionInput}
                  onChange={setDescriptionInput}
                  placeholder="Obsah, benefity a USP kategorie"
                  onEditorReady={(editor) => {
                    topEditorRef.current = editor;
                  }}
                  toolbar={renderEditorToolbar('description')}
                  onImageRequest={() => openImageModal('description')}
                />

                <RichContentEditor
                  label="Dolní popis"
                  description="Doplňující informace nebo SEO text pod produkty"
                  value={secondDescriptionInput}
                  onChange={setSecondDescriptionInput}
                  placeholder="Doplňující obsah, odkazy nebo widgety"
                  onEditorReady={(editor) => {
                    bottomEditorRef.current = editor;
                  }}
                  toolbar={renderEditorToolbar('second_description')}
                  onImageRequest={() => openImageModal('second_description')}
                />
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="seo" pt="md">
              <Stack gap="md">
                <Textarea
                  label="Meta description"
                  value={metaDescriptionInput}
                  onChange={(event) => setMetaDescriptionInput(event.currentTarget.value)}
                  minRows={3}
                  autosize
                  placeholder="Krátký popis pro vyhledávače"
                />
                <Grid gutter="md">
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Select
                      label="Viditelnost pro zákazníky"
                      data={customerVisibilityOptions}
                      value={customerVisibilityInput || null}
                      allowDeselect
                      placeholder="Výchozí"
                      onChange={(value) => setCustomerVisibilityInput(value ?? '')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Select
                      label="Řazení produktů"
                      data={productOrderingOptions}
                      value={productOrderingInput || null}
                      allowDeselect
                      placeholder="Výchozí"
                      onChange={(value) => setProductOrderingInput(value ?? '')}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <TextInput
                      label="GUID podobných kategorií"
                      value={similarCategoryGuidInput}
                      onChange={(event) => setSimilarCategoryGuidInput(event.currentTarget.value)}
                      placeholder="Pro interní doporučení"
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <TextInput
                      label="GUID souvisejících kategorií"
                      value={relatedCategoryGuidInput}
                      onChange={(event) => setRelatedCategoryGuidInput(event.currentTarget.value)}
                      placeholder="Pro interní prolinkování"
                    />
                  </Grid.Col>
                </Grid>
              </Stack>
            </Tabs.Panel>
          </Tabs>

          <Divider />

          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={handleCloseModals}>
              Zrušit
            </Button>
            {isEdit && (
              <Button
                variant="light"
                leftSection={<IconCloudUpload size={16} />}
                onClick={handlePushDescription}
                loading={pushCategoryDescription.isPending}
                disabled={!numericShopId}
              >
                Odeslat do Shoptetu - {shopDisplayLabel}
              </Button>
            )}
            <Button onClick={submitHandler} loading={submitting}>
              {submitLabel}
            </Button>
          </Group>
        </Stack>
      </Modal>
    );
  };

  const pluginTargetLabel = pluginTarget === 'description' ? 'Horní popis' : 'Dolní popis';
  const getLocaleLabel = (value: string | null) =>
    value ? localeOptions.find((option) => option.value === value)?.label ?? value : '—';

  const widgetTypeLabels: Record<string, string> = {
    countdown: 'Odpočítávání',
    banner: 'Banner',
    promoCountdown: 'Banner s odpočtem',
    promo_countdown: 'Banner s odpočtem',
    discountTiles: 'Dlaždice s procenty',
    discount_tiles: 'Dlaždice s procenty',
  };

  return (
    <SectionPageShell
      section="categories.tree"
      description="Prohlížej a upravuj strom kategorií jednotlivých e-shopů."
      actions={
        <Group gap="sm">
          <Select
            label="E-shop"
            placeholder="Vyber e-shop"
            data={shopOptions}
            value={selectedShopId}
            onChange={setSelectedShopId}
            comboboxProps={{ withinPortal: true }}
            searchable
            nothingFoundMessage="E-shop nenalezen"
            w={240}
          />
          <Button
            variant="light"
            leftSection={<IconRefresh size={16} />}
            onClick={handleSync}
            loading={isSyncing}
            disabled={!numericShopId}
          >
            Stáhnout aktuální kategorie
          </Button>
        </Group>
      }
    >
      <Stack gap="lg">

      <Card
        withBorder
        padding="lg"
        radius="md"
        styles={{ root: { overflow: 'visible' } }}
      >
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Stack gap={0}>
              <Text size="sm" c="dimmed">
                Naposledy synchronizováno: {formatDateTime(syncedAt)}
              </Text>
              <Text size="sm" c="dimmed">
                Celkem kategorií: {flattened.length}
              </Text>
            </Stack>
            <Button
              variant="subtle"
              leftSection={<IconPlus size={16} />}
              onClick={() => openCreateModal(null)}
              disabled={!numericShopId}
            >
              Přidat kořenovou kategorii
            </Button>
          </Group>

          {treeContent()}
        </Stack>
      </Card>

      <Modal
        opened={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
        title="Vložit obrázek"
        centered
        size="lg"
      >
        <Stack gap="md">
          <Tabs value={imageTab} onChange={(value) => setImageTab((value as typeof imageTab) ?? 'link')}>
            <Tabs.List>
              <Tabs.Tab value="link">Vložit z URL</Tabs.Tab>
              <Tabs.Tab value="ai">AI generátor</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="link" pt="md">
              <Stack gap="md">
                <TextInput
                  label="URL obrázku"
                  placeholder="https://..."
                  value={imageUrlInput}
                  onChange={(event) => setImageUrlInput(event.currentTarget.value)}
                  required
                />
                <Group grow>
                  <TextInput
                    label="Alternativní text"
                    placeholder="Krátký popis obrázku"
                    value={imageAltInput}
                    onChange={(event) => setImageAltInput(event.currentTarget.value)}
                  />
                  <TextInput
                    label="Šířka (px)"
                    placeholder="Např. 800"
                    value={imageWidthInput}
                    onChange={(event) => setImageWidthInput(event.currentTarget.value.replace(/[^0-9]/g, ''))}
                  />
                </Group>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="ai" pt="md">
              <Stack gap="md">
                <Textarea
                  label="Prompt pro AI"
                  placeholder="Popiš jaký obrázek má Cloudinary vygenerovat..."
                  value={imagePromptInput}
                  onChange={(event) => setImagePromptInput(event.currentTarget.value)}
                  autosize
                  minRows={3}
                />
                <Alert color="blue" title="Cloudinary integrace" icon={<IconSparkles size={16} />}>
                  Pro bezpečné volání Cloudinary API doporučujeme nakonfigurovat backend, který uchová přihlašovací údaje.
                  Jakmile bude integrace připravená, tlačítko níže může spouštět generování a obrázek se automaticky vloží do editoru.
                </Alert>
              </Stack>
            </Tabs.Panel>
          </Tabs>

          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setImageModalOpen(false)}>
              Zrušit
            </Button>
            {imageTab === 'link' ? (
              <Button onClick={handleConfirmImageInsert}>Vložit obrázek</Button>
            ) : (
              <Button onClick={handleGenerateAiImage} loading={isGeneratingImage}>
                Připravit AI obrázek
              </Button>
            )}
          </Group>
        </Stack>
      </Modal>

      {renderCategoryModal('create')}
      {renderCategoryModal('edit')}

      <Drawer
        opened={pluginDrawerOpen}
        onClose={() => setPluginDrawerOpen(false)}
        title="Widgety a pluginy"
        position="right"
        size="lg"
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <Stack gap="lg">
          <Select
            label="Jazyk widgetů"
            description="Předvyplněný text a CTA pro vložené widgety"
            data={localeOptions}
            value={widgetLocale}
            onChange={handleWidgetLocaleChange}
            comboboxProps={{ withinPortal: true }}
            w={{ base: '100%', md: 260 }}
          />

          <Alert color="blue" icon={<IconSparkles size={16} />}>
            Vložený obsah se přidá do sekce <strong>{pluginTargetLabel}</strong>.
          </Alert>

          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <Stack gap={2}>
                  <Text fw={600}>Odpočítávání akce</Text>
                  <Text size="xs" c="dimmed">
                    Zvýrazni limitovanou nabídku s dynamickým odpočtem.
                  </Text>
                </Stack>
                <Badge color="pink">Widget</Badge>
              </Group>
              <Select
                label="Umístění"
                data={[
                  { value: 'top', label: 'Horní popis' },
                  { value: 'bottom', label: 'Dolní popis' },
                ]}
                value={countdownWidget.placement}
                onChange={(value) =>
                  setCountdownWidget((prev) => ({
                    ...prev,
                    placement: value ?? prev.placement,
                  }))
                }
              />
              <TextInput
                label="Nadpis"
                value={countdownWidget.headline ?? ''}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setCountdownWidget((prev) => ({ ...prev, headline: next }));
                }}
              />
              <Textarea
                label="Text pod nadpisem"
                value={countdownWidget.message ?? ''}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setCountdownWidget((prev) => ({ ...prev, message: next }));
                }}
                autosize
                minRows={2}
              />
              <Group grow>
                <ColorInput
                  label="Barva pozadí"
                  format="hex"
                  value={countdownWidget.background_color ?? '#1f3a8a'}
                  onChange={(value) =>
                    setCountdownWidget((prev) => ({ ...prev, background_color: value || '#1f3a8a' }))
                  }
                />
                <ColorInput
                  label="Barva textu"
                  format="hex"
                  value={countdownWidget.text_color ?? '#ffffff'}
                  onChange={(value) =>
                    setCountdownWidget((prev) => ({ ...prev, text_color: value || '#ffffff' }))
                  }
                />
              </Group>
              <Group grow>
                <Select
                  label="Rozložení"
                  data={[
                    { value: 'stacked', label: 'Pod sebou' },
                    { value: 'inline', label: 'Vedle sebe' },
                  ]}
                  value={countdownWidget.layout ?? 'stacked'}
                  onChange={(value) =>
                    setCountdownWidget((prev) => ({
                      ...prev,
                      layout: (value === 'inline' ? 'inline' : 'stacked'),
                    }))
                  }
                />
                <Select
                  label="Zobrazení času"
                  data={[
                    { value: 'digital', label: 'HH:MM:SS' },
                    { value: 'extended', label: '10 dní 8 hodin…' },
                  ]}
                  value={countdownWidget.format ?? 'digital'}
                  onChange={(value) =>
                    setCountdownWidget((prev) => ({
                      ...prev,
                      format: (value === 'extended' ? 'extended' : 'digital'),
                    }))
                  }
                />
              </Group>
              <TextInput
                label="Termín ukončení"
                description="ISO formát, např. 2024-12-31T23:59:59+01:00"
                value={countdownWidget.deadline ?? ''}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setCountdownWidget((prev) => ({ ...prev, deadline: next }));
                }}
              />
              <Group grow>
                <TextInput
                  label="CTA text"
                  value={countdownWidget.cta_label ?? ''}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setCountdownWidget((prev) => ({ ...prev, cta_label: next }));
                  }}
                />
                <TextInput
                  label="CTA URL"
                  value={countdownWidget.cta_url ?? ''}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setCountdownWidget((prev) => ({ ...prev, cta_url: next }));
                  }}
                />
              </Group>
              <Button leftSection={<IconPlus size={14} />} onClick={handleInsertCountdownWidget}>
                Vložit odpočet
              </Button>
            </Stack>
          </Paper>

          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <Stack gap={2}>
                  <Text fw={600}>Promo banner s odpočtem</Text>
                  <Text size="xs" c="dimmed">
                    Kombinuj poutavý banner s vlastním textem, pozadím a odpočtem, který může být jednorázový nebo opakovaný.
                  </Text>
                </Stack>
                <Badge color="grape">Widget</Badge>
              </Group>
              <Select
                label="Umístění"
                data={[
                  { value: 'top', label: 'Horní popis' },
                  { value: 'bottom', label: 'Dolní popis' },
                ]}
                value={promoCountdownWidget.placement}
                onChange={(value) =>
                  setPromoCountdownWidget((prev) => ({
                    ...prev,
                    placement: value ?? prev.placement,
                  }))
                }
              />
              <Group grow>
                <Select
                  label="Tvar"
                  data={[
                    { value: 'square', label: 'Čtverec' },
                    { value: 'rectangle', label: 'Obdélník' },
                  ]}
                  value={promoCountdownWidget.layout ?? 'square'}
                  onChange={(value) =>
                    setPromoCountdownWidget((prev) => ({
                      ...prev,
                      layout: (value as 'square' | 'rectangle') ?? prev.layout ?? 'square',
                    }))
                  }
                />
                <Select
                  label="Režim odpočtu"
                  data={[
                    { value: 'fixed', label: 'Jednorázový termín' },
                    { value: 'recurring', label: 'Opakovaný cyklus' },
                  ]}
                  value={promoCountdownWidget.mode ?? 'fixed'}
                  onChange={(value) =>
                    setPromoCountdownWidget((prev) => ({
                      ...prev,
                      mode: (value as 'fixed' | 'recurring') ?? prev.mode ?? 'fixed',
                    }))
                  }
                />
              </Group>
              <TextInput
                label="Nadpis"
                value={promoCountdownWidget.headline ?? ''}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setPromoCountdownWidget((prev) => ({ ...prev, headline: next }));
                }}
              />
              <TextInput
                label="Podnadpis"
                value={promoCountdownWidget.subheadline ?? ''}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setPromoCountdownWidget((prev) => ({ ...prev, subheadline: next }));
                }}
              />
              <Textarea
                label="Doplňkový text"
                minRows={2}
                autosize
                value={promoCountdownWidget.description ?? ''}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setPromoCountdownWidget((prev) => ({ ...prev, description: next }));
                }}
              />
              <Group grow>
                <TextInput
                  label="CTA text"
                  value={promoCountdownWidget.cta_label ?? ''}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setPromoCountdownWidget((prev) => ({ ...prev, cta_label: next }));
                  }}
                />
                <TextInput
                  label="CTA URL"
                  placeholder="https://..."
                  value={promoCountdownWidget.cta_link ?? ''}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setPromoCountdownWidget((prev) => ({ ...prev, cta_link: next }));
                  }}
                />
              </Group>
              <Group grow>
                <NumberInput
                  label="Velikost nadpisu (px)"
                  min={16}
                  max={96}
                  step={2}
                  value={promoCountdownWidget.headline_size ?? undefined}
                  onChange={(value) =>
                    setPromoCountdownWidget((prev) => ({
                      ...prev,
                      headline_size: typeof value === 'number' ? value : null,
                    }))
                  }
                />
                <NumberInput
                  label="Velikost podnadpisu (px)"
                  min={12}
                  max={72}
                  step={2}
                  value={promoCountdownWidget.subheadline_size ?? undefined}
                  onChange={(value) =>
                    setPromoCountdownWidget((prev) => ({
                      ...prev,
                      subheadline_size: typeof value === 'number' ? value : null,
                    }))
                  }
                />
                <NumberInput
                  label="Velikost popisu (px)"
                  min={10}
                  max={48}
                  step={1}
                  value={promoCountdownWidget.description_size ?? undefined}
                  onChange={(value) =>
                    setPromoCountdownWidget((prev) => ({
                      ...prev,
                      description_size: typeof value === 'number' ? value : null,
                    }))
                  }
                />
              </Group>
              <Group grow>
                <ColorInput
                  label="Barva nadpisu"
                  format="hex"
                  value={promoCountdownWidget.headline_color ?? ''}
                  onChange={(value) =>
                    setPromoCountdownWidget((prev) => ({ ...prev, headline_color: value ?? '' }))
                  }
                  placeholder="Výchozí"
                />
                <ColorInput
                  label="Barva podnadpisu"
                  format="hex"
                  value={promoCountdownWidget.subheadline_color ?? ''}
                  onChange={(value) =>
                    setPromoCountdownWidget((prev) => ({ ...prev, subheadline_color: value ?? '' }))
                  }
                  placeholder="Výchozí"
                />
                <ColorInput
                  label="Barva textu popisu"
                  format="hex"
                  value={promoCountdownWidget.description_color ?? ''}
                  onChange={(value) =>
                    setPromoCountdownWidget((prev) => ({ ...prev, description_color: value ?? '' }))
                  }
                  placeholder="Výchozí"
                />
              </Group>
              <Group grow align="flex-end">
                <TextInput
                  label="Pozadí (CSS)"
                  description="Barva nebo gradient, např. linear-gradient(135deg,#d97706,#f97316)"
                  value={promoCountdownWidget.background_style ?? ''}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setPromoCountdownWidget((prev) => ({ ...prev, background_style: next }));
                  }}
                />
                <NumberInput
                  label="Velikost CTA (px)"
                  min={10}
                  max={40}
                  step={1}
                  value={promoCountdownWidget.cta_font_size ?? undefined}
                  onChange={(value) =>
                    setPromoCountdownWidget((prev) => ({
                      ...prev,
                      cta_font_size: typeof value === 'number' ? value : null,
                    }))
                  }
                />
                <ColorInput
                  label="Barva CTA pozadí"
                  format="hex"
                  value={promoCountdownWidget.cta_background ?? ''}
                  onChange={(value) =>
                    setPromoCountdownWidget((prev) => ({ ...prev, cta_background: value ?? '' }))
                  }
                  placeholder="Transparentní"
                />
                <ColorInput
                  label="Barva CTA textu"
                  format="hex"
                  value={promoCountdownWidget.cta_text_color ?? ''}
                  onChange={(value) =>
                    setPromoCountdownWidget((prev) => ({ ...prev, cta_text_color: value ?? '' }))
                  }
                  placeholder="Výchozí"
                />
                <ColorInput
                  label="Barva CTA rámečku"
                  format="hex"
                  value={promoCountdownWidget.cta_border_color ?? ''}
                  onChange={(value) =>
                    setPromoCountdownWidget((prev) => ({ ...prev, cta_border_color: value ?? '' }))
                  }
                  placeholder="Výchozí"
                />
              </Group>
              <Group grow>
                <ColorInput
                  label="Barva textu"
                  format="hex"
                  value={promoCountdownWidget.text_color ?? '#ffffff'}
                  onChange={(value) =>
                    setPromoCountdownWidget((prev) => ({ ...prev, text_color: value || '#ffffff' }))
                  }
                />
                <ColorInput
                  label="Barva číslic"
                  format="hex"
                  value={promoCountdownWidget.accent_color ?? '#ffe8c7'}
                  onChange={(value) =>
                    setPromoCountdownWidget((prev) => ({ ...prev, accent_color: value || '#ffe8c7' }))
                  }
                />
                <TextInput
                  label="Max šířka"
                  description="Např. 520, 80% nebo auto."
                  placeholder="Výchozí"
                  value={formatSizeInputValue(promoCountdownWidget.max_width)}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setPromoCountdownWidget((prev) => ({
                      ...prev,
                      max_width: normalizeSizeInput(next ?? ''),
                    }));
                  }}
                />
                <NumberInput
                  label="Max výška (px)"
                  min={200}
                  max={800}
                  step={10}
                  value={promoCountdownWidget.max_height ?? ''}
                  onChange={(value) =>
                    setPromoCountdownWidget((prev) => ({
                      ...prev,
                      max_height: value === '' ? null : value,
                    }))
                  }
                />
              </Group>
              <Group grow>
                <TextInput
                  label="Obrázek na pozadí (volitelné)"
                  placeholder="https://..."
                  value={promoCountdownWidget.background_image ?? ''}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setPromoCountdownWidget((prev) => ({ ...prev, background_image: next }));
                  }}
                />
                <TextInput
                  label="Overlay (volitelné)"
                  description="Např. rgba(0,0,0,0.25) pro snížení kontrastu"
                  value={promoCountdownWidget.overlay_color ?? ''}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setPromoCountdownWidget((prev) => ({ ...prev, overlay_color: next }));
                  }}
                />
              </Group>
              {promoCountdownWidget.mode === 'recurring' ? (
                <Stack gap="sm">
                  <Group grow>
                    <NumberInput
                      label="Délka cyklu (hodiny)"
                      min={0}
                      step={1}
                      value={Number(promoCountdownWidget.interval_hours ?? 0)}
                      onChange={(value) => {
                        const nextValue = typeof value === 'number' ? value : Number(value ?? 0);
                        setPromoCountdownWidget((prev) => ({
                          ...prev,
                          interval_hours: Number.isFinite(nextValue) ? Math.max(0, Math.floor(nextValue)) : 0,
                        }));
                      }}
                    />
                    <NumberInput
                      label="Délka cyklu (minuty)"
                      min={0}
                      max={59}
                      step={5}
                      value={Number(promoCountdownWidget.interval_minutes ?? 0)}
                      onChange={(value) => {
                        const nextValue = typeof value === 'number' ? value : Number(value ?? 0);
                        const safeValue = Number.isFinite(nextValue) ? Math.min(59, Math.max(0, Math.floor(nextValue))) : 0;
                        setPromoCountdownWidget((prev) => ({
                          ...prev,
                          interval_minutes: safeValue,
                        }));
                      }}
                    />
                  </Group>
                  <TextInput
                    type="datetime-local"
                    label="Začátek cyklu (volitelné)"
                    description="Pokud vyplníš, cyklus poběží synchronně od zadaného času. Jinak začíná při načtení stránky."
                    value={toLocalDateTimeInputValue(promoCountdownWidget.recurring_anchor)}
                    onChange={(event) => {
                      const raw = event.currentTarget.value;
                      setPromoCountdownWidget((prev) => ({
                        ...prev,
                        recurring_anchor: raw ? fromLocalDateTimeInputValue(raw) : '',
                      }));
                    }}
                  />
                </Stack>
              ) : (
                <TextInput
                  type="datetime-local"
                  label="Datum ukončení"
                  description="Lokalní čas, uloží se jako ISO."
                  value={toLocalDateTimeInputValue(promoCountdownWidget.deadline)}
                  onChange={(event) => {
                    const raw = event.currentTarget.value;
                    setPromoCountdownWidget((prev) => ({
                      ...prev,
                      deadline: raw ? fromLocalDateTimeInputValue(raw) : '',
                    }));
                  }}
                />
              )}
              <Button leftSection={<IconHourglass size={14} />} onClick={handleInsertPromoCountdownWidget}>
                Vložit banner s odpočtem
              </Button>
            </Stack>
          </Paper>

          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <Stack gap={2}>
                  <Text fw={600}>Dlaždice s procenty</Text>
                  <Text size="xs" c="dimmed">
                    Vytvoř slevové dlaždice napojené na filtrování Shoptetu a přidej volitelný banner.
                  </Text>
                </Stack>
                <Badge color="orange">Widget</Badge>
              </Group>
              <Select
                label="Umístění"
                data={[
                  { value: 'top', label: 'Horní popis' },
                  { value: 'bottom', label: 'Dolní popis' },
                ]}
                value={discountTilesWidget.placement}
                onChange={(value) =>
                  setDiscountTilesWidget((prev) => ({
                    ...prev,
                    placement: value ?? prev.placement,
                  }))
                }
              />
              <Group grow>
                <TextInput
                  label="Klíčové slovo ve filtrech"
                  description="Text, který Shoptet používá pro slevové filtry (např. ‘Sleva’)."
                  value={discountTilesWidget.filter_keyword ?? ''}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setDiscountTilesWidget((prev) => ({ ...prev, filter_keyword: next }));
                  }}
                />
                <TextInput
                  label="Text na dlaždici"
                  value={discountTilesWidget.tile_label ?? ''}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setDiscountTilesWidget((prev) => ({ ...prev, tile_label: next }));
                  }}
                />
              </Group>
              <Group grow>
                <ColorInput
                  label="Barva dlaždic"
                  format="hex"
                  value={discountTilesWidget.tile_background ?? '#ff3f5f'}
                  onChange={(value) =>
                    setDiscountTilesWidget((prev) => ({ ...prev, tile_background: value || '#ff3f5f' }))
                  }
                />
                <ColorInput
                  label="Barva aktivní dlaždice"
                  format="hex"
                  value={discountTilesWidget.active_background ?? '#ea1539'}
                  onChange={(value) =>
                    setDiscountTilesWidget((prev) => ({ ...prev, active_background: value || '#ea1539' }))
                  }
                />
                <ColorInput
                  label="Barva textu"
                  format="hex"
                  value={discountTilesWidget.tile_text_color ?? '#ffffff'}
                  onChange={(value) =>
                    setDiscountTilesWidget((prev) => ({ ...prev, tile_text_color: value || '#ffffff' }))
                  }
                />
              </Group>
              <TextInput
                label="URL banneru (volitelné)"
                placeholder="https://..."
                value={discountTilesWidget.banner_image ?? ''}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setDiscountTilesWidget((prev) => ({ ...prev, banner_image: next }));
                }}
              />
              <Group grow>
                <TextInput
                  label="Alternativní text banneru"
                  value={discountTilesWidget.banner_alt ?? ''}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setDiscountTilesWidget((prev) => ({ ...prev, banner_alt: next }));
                  }}
                />
                <TextInput
                  label="Odkaz banneru"
                  placeholder="https://..."
                  value={discountTilesWidget.banner_link ?? ''}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setDiscountTilesWidget((prev) => ({ ...prev, banner_link: next }));
                  }}
                />
              </Group>
              <Button leftSection={<IconDiscount2 size={14} />} onClick={handleInsertDiscountTilesWidget}>
                Vložit dlaždice
              </Button>
            </Stack>
          </Paper>

          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <Stack gap={2}>
                  <Text fw={600}>Kategorie banner</Text>
                  <Text size="xs" c="dimmed">
                    Přidej vizuální blok s CTA, obrázkem nebo AI vizuálem.
                  </Text>
                </Stack>
                <Badge color="violet">Widget</Badge>
              </Group>
              <Select
                label="Umístění"
                data={[
                  { value: 'top', label: 'Horní popis' },
                  { value: 'bottom', label: 'Dolní popis' },
                ]}
                value={bannerWidget.placement}
                onChange={(value) =>
                  setBannerWidget((prev) => ({
                    ...prev,
                    placement: value ?? prev.placement,
                  }))
                }
              />
              <TextInput
                label="Titulek"
                value={bannerWidget.title ?? ''}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setBannerWidget((prev) => ({ ...prev, title: next }));
                }}
              />
              <Textarea
                label="Podtitulek"
                value={bannerWidget.subtitle ?? ''}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setBannerWidget((prev) => ({ ...prev, subtitle: next }));
                }}
                autosize
                minRows={2}
              />
              <TextInput
                label="Obrázek"
                placeholder="URL obrázku (volitelné)"
                value={bannerWidget.image ?? ''}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setBannerWidget((prev) => ({ ...prev, image: next }));
                }}
              />
              <Group grow>
                <TextInput
                  label="CTA text"
                  value={bannerWidget.link_label ?? ''}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setBannerWidget((prev) => ({ ...prev, link_label: next }));
                  }}
                />
                <TextInput
                  label="CTA URL"
                  value={bannerWidget.link_url ?? ''}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setBannerWidget((prev) => ({ ...prev, link_url: next }));
                  }}
                />
              </Group>
              <Button leftSection={<IconPlus size={14} />} onClick={handleInsertBannerWidget}>
                Vložit banner
              </Button>
            </Stack>
          </Paper>

          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <Stack gap={2}>
                  <Text fw={600}>AI pluginy z administrace</Text>
                  <Text size="xs" c="dimmed">
                    Vlož vlastní generované pluginy do obsahu kategorie.
                  </Text>
                </Stack>
                <Badge color="grape">{availablePlugins.length}</Badge>
              </Group>
              {pluginsQuery.isLoading ? (
                <Text size="sm" c="dimmed">
                  Načítám pluginy…
                </Text>
              ) : pluginsQuery.isError ? (
                <Alert color="red" icon={<IconAlertCircle size={16} />}>
                  Pluginy se nepodařilo načíst. Zkus to prosím znovu.
                </Alert>
              ) : availablePlugins.length ? (
                <Stack gap="xs">
                  {availablePlugins.map((plugin) => (
                    <Paper key={plugin.id} withBorder radius="sm" p="sm">
                      <Group justify="space-between" align="flex-start">
                        <Stack gap={2}>
                          <Text fw={500}>{plugin.name}</Text>
                          <Text size="xs" c="dimmed">
                            ID {plugin.id}
                            {plugin.latest_version ? ` · verze ${plugin.latest_version}` : ''}
                          </Text>
                        </Stack>
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => handleInsertAiPlugin(plugin)}
                          disabled={!plugin.latest_version_id}
                        >
                          Vložit plugin
                        </Button>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">
                  Zatím nemáš vytvořený žádný AI plugin. Vygeneruj ho v sekci Nastavení → AI pluginy.
                </Text>
              )}
            </Stack>
          </Paper>
        </Stack>
      </Drawer>

      <Drawer
        opened={aiContentDrawerOpen}
        onClose={() => setAiContentDrawerOpen(false)}
        title="AI návrh obsahu"
        position="right"
        size="lg"
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <Stack gap="lg">
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              AI využije informace o kategorii, produktech i obchodu a navrhne texty včetně widgetů a vnitřního
              prolinkování.
            </Text>
          </Stack>

          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Text fw={600}>Jaká pole má AI připravit?</Text>
              <Stack gap={6}>
                {contentFieldOrder.map((field) => (
                  <Checkbox
                    key={field}
                    label={contentFieldLabels[field]}
                    checked={aiContentSelectedFields.has(field)}
                    onChange={() => toggleAiContentField(field)}
                  />
                ))}
              </Stack>
            </Stack>
          </Paper>

          <Textarea
            label="Doplňující informace pro AI"
            placeholder="Zadej specifika kategorie, cílovou skupinu, prodejní argumenty..."
            value={aiContentNotes}
            onChange={(event) => setAiContentNotes(event.currentTarget.value)}
            autosize
            minRows={3}
          />

          <Group gap="sm">
            <Button
              leftSection={<IconSparkles size={16} />}
              onClick={handleGenerateAiContent}
              loading={aiContentLoading}
              disabled={aiContentSelectedFields.size === 0}
            >
              Vygenerovat obsah
            </Button>
            <Button
              variant="default"
              onClick={() => setAiContentDrawerOpen(false)}
            >
              Zavřít
            </Button>
          </Group>

          {aiContentResult ? (
            <Paper withBorder radius="md" p="md">
              <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={2}>
                    <Text fw={600}>Návrh obsahu připraven</Text>
                    <Text size="xs" c="dimmed">
                      Vyber, co chceš vložit do formuláře nebo rovnou přidej doporučené widgety.
                    </Text>
                  </Stack>
                  <Button
                    size="sm"
                    leftSection={<IconPlus size={14} />}
                    onClick={handleApplyAiContent}
                  >
                    Vložit do formuláře
                  </Button>
                </Group>

                {contentFieldOrder.map((field) => {
                  const value = aiContentResult[field];
                  const label = contentFieldLabels[field];
                  if (!value) {
                    return null;
                  }

                  if (field === 'description' || field === 'second_description') {
                    return (
                      <Stack key={field} gap={6}>
                        <Text fw={500}>{label}</Text>
                        <Paper withBorder radius="sm" p="sm">
                          <Box style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: value }} />
                        </Paper>
                      </Stack>
                    );
                  }

                  return (
                    <Stack key={field} gap={6}>
                      <Text fw={500}>{label}</Text>
                      <Paper withBorder radius="sm" p="sm">
                        <Text size="sm">{value}</Text>
                      </Paper>
                    </Stack>
                  );
                })}

                {aiContentResult.link_suggestions?.length ? (
                  <Stack gap={6}>
                    <Text fw={500}>Doporučené interní odkazy</Text>
                    <Stack gap={4}>
                      {aiContentResult.link_suggestions.map((link) => (
                        <Anchor key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noreferrer">
                          {link.label ?? link.url}
                        </Anchor>
                      ))}
                    </Stack>
                  </Stack>
                ) : null}

                {aiContentResult.widgets?.length ? (
                  <Stack gap={6}>
                    <Text fw={500}>Navržené widgety</Text>
                    <Stack gap={8}>
                      {aiContentResult.widgets.map((widget, index) => {
                        const placementLabel = widget.placement === 'bottom' ? 'Dolní popis' : 'Horní popis';
                        const target = widget.placement === 'bottom' ? 'second_description' : 'description';
                        const typeLabel = widgetTypeLabels[widget.type] ?? 'Widget';
                        const normalizedWidget = widget.type === 'discount_tiles'
                          ? ({ ...widget, type: 'discountTiles' } as unknown as GeneratedWidget)
                          : widget.type === 'promo_countdown'
                            ? ({ ...widget, type: 'promoCountdown' } as unknown as GeneratedWidget)
                            : (widget as unknown as GeneratedWidget);
                        return (
                          <Paper key={`${widget.type}-${index}`} withBorder radius="sm" p="sm">
                            <Group justify="space-between" align="flex-start">
                              <Stack gap={2}>
                                <Text fw={500}>{typeLabel}</Text>
                                <Text size="xs" c="dimmed">
                                  Umístění: {placementLabel}
                                </Text>
                              </Stack>
                              <Button
                                size="xs"
                                variant="light"
                                onClick={() => insertSnippet(target, buildWidgetSnippet(normalizedWidget))}
                              >
                                Vložit widget
                              </Button>
                            </Group>
                          </Paper>
                        );
                      })}
                    </Stack>
                  </Stack>
                ) : null}
              </Stack>
            </Paper>
          ) : (
            <Text size="sm" c="dimmed">
              Po vygenerování se tady zobrazí návrh obsahu i doporučené widgety.
            </Text>
          )}
        </Stack>
      </Drawer>

      <Drawer
        opened={aiTranslateDrawerOpen}
        onClose={() => setAiTranslateDrawerOpen(false)}
        title="AI překlad obsahu"
        position="right"
        size="lg"
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <Stack gap="lg">
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Select
                label="Zdrojový jazyk"
                placeholder="Automaticky"
                data={localeOptions}
                value={aiTranslateSourceLocale || null}
                allowDeselect
                onChange={(value) => setAiTranslateSourceLocale(value ?? '')}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Select
                label="Cílový jazyk"
                data={localeOptions}
                value={aiTranslateTargetLocale}
                onChange={(value) => setAiTranslateTargetLocale(value ?? 'cs')}
                required
              />
            </Grid.Col>
          </Grid>

          <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
              <Text fw={600}>Jaké části přeložit?</Text>
              <Stack gap={6}>
                {contentFieldOrder.map((field) => (
                  <Checkbox
                    key={field}
                    label={contentFieldLabels[field]}
                    checked={aiTranslateSelectedFields.has(field)}
                    onChange={() => toggleAiTranslateField(field)}
                  />
                ))}
              </Stack>
            </Stack>
          </Paper>

          <Textarea
            label="Poznámky pro překlad"
            placeholder="Zadej tón komunikace, speciální výrazy, brand guidelines..."
            value={aiTranslateNotes}
            onChange={(event) => setAiTranslateNotes(event.currentTarget.value)}
            autosize
            minRows={3}
          />

          <Group gap="sm">
            <Button
              leftSection={<IconLanguage size={16} />}
              onClick={handleGenerateAiTranslation}
              loading={aiTranslateLoading}
              disabled={aiTranslateSelectedFields.size === 0}
            >
              Připravit překlad
            </Button>
            <Button variant="default" onClick={() => setAiTranslateDrawerOpen(false)}>
              Zavřít
            </Button>
          </Group>

          {aiTranslateResult ? (
            <Paper withBorder radius="md" p="md">
              <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={2}>
                    <Text fw={600}>
                      Návrh překladu ({getLocaleLabel(aiTranslateSourceLocale || null)} → {getLocaleLabel(aiTranslateTargetLocale)})
                    </Text>
                    <Text size="xs" c="dimmed">
                      Vyber co vložit do formuláře a případně uprav ručně před uložením.
                    </Text>
                  </Stack>
                  <Button size="sm" leftSection={<IconPlus size={14} />} onClick={handleApplyAiTranslation}>
                    Vložit překlad
                  </Button>
                </Group>

                {contentFieldOrder.map((field) => {
                  const value = (aiTranslateResult?.[field] as string | null) ?? null;
                  const label = contentFieldLabels[field];
                  if (!value) {
                    return null;
                  }

                  if (field === 'description' || field === 'second_description') {
                    return (
                      <Stack key={field} gap={6}>
                        <Text fw={500}>{label}</Text>
                        <Paper withBorder radius="sm" p="sm">
                          <Box style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: value }} />
                        </Paper>
                      </Stack>
                    );
                  }

                  return (
                    <Stack key={field} gap={6}>
                      <Text fw={500}>{label}</Text>
                      <Paper withBorder radius="sm" p="sm">
                        <Text size="sm">{value}</Text>
                      </Paper>
                    </Stack>
                  );
                })}
              </Stack>
            </Paper>
          ) : (
            <Text size="sm" c="dimmed">
              Po vygenerování se zobrazí výsledný překlad jednotlivých polí.
            </Text>
          )}
        </Stack>
      </Drawer>
    </Stack>
  </SectionPageShell>
  );
};
