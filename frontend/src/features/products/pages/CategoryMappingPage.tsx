import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  Modal,
  Pagination,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Tooltip,
  Table,
  Title,
} from '@mantine/core';
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconInfoCircle,
  IconRefresh,
  IconSparkles,
  IconDownload,
  IconSearch,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEventHandler,
  type KeyboardEventHandler,
} from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import type {
  CategoryAiPreMapResponse,
  CategoryAiPreMapSuggestion,
  CategoryTreeNode,
  ShopTreeNode,
  CategoryDefaultCategoryIssue,
  CategoryDefaultCategoryRecord,
} from '../../../api/pim';
import { fetchCategoryDefaultValidation } from '../../../api/pim';
import { useCategoryTree } from '../../pim/hooks/useCategoryTree';
import {
  useAiPreMapCategories,
  useConfirmCategoryMapping,
  useRejectCategoryMapping,
  useApplyDefaultCategory,
} from '../../pim/hooks/useCategoryMappings';
import { useCategoryDefaultValidation } from '../../pim/hooks/useCategoryDefaultValidation';
import { useShops } from '../../shoptet/hooks/useShops';
import { CanonicalTree, ShopTree } from '../components/CategoryMappingTree';
import type { Shop } from '../../../api/shops';
import { SectionPageShell } from '../../../components/layout/SectionPageShell';

const EMPTY_SHOPS: Shop[] = [];
const EMPTY_CATEGORY_TREE: CategoryTreeNode[] = [];
const EMPTY_SHOP_TREE: ShopTreeNode[] = [];
const EMPTY_VALIDATION_ISSUES: CategoryDefaultCategoryIssue[] = [];

const validationReasonMeta: Record<string, { label: string; color: string }> = {
  missing_master_default: { label: 'Master produkt bez kategorie', color: 'gray' },
  canonical_not_found: { label: 'Kategorie mimo master strom', color: 'orange' },
  missing_mapping: { label: 'Chybí mapování', color: 'yellow' },
  missing_target_snapshot: { label: 'Chybí data cílového shopu', color: 'gray' },
  missing_actual_default: { label: 'Cílový shop bez kategorie', color: 'red' },
  mismatch: { label: 'Kategorie neodpovídá mapování', color: 'pink' },
  default_not_deepest: { label: 'Není nejhlubší kategorie', color: 'violet' },
};

const statusFilterOptions = [
  { label: 'Vše', value: 'all' },
  { label: 'Potvrzené', value: 'confirmed' },
  { label: 'Navržené', value: 'suggested' },
  { label: 'Odmítnuté', value: 'rejected' },
  { label: 'Nenamapované', value: 'unmapped' },
];

type StatusFilterValue = (typeof statusFilterOptions)[number]['value'];

const matchesSearch = (term: string, value: string | null | undefined) => {
  if (!term.trim()) {
    return true;
  }

  return (value ?? '').toLowerCase().includes(term.trim().toLowerCase());
};

const filterCanonicalTree = (
  nodes: CategoryTreeNode[],
  searchTerm: string,
  statusFilter: StatusFilterValue
): CategoryTreeNode[] => {
  return nodes
    .map((node) => {
      const filteredChildren = filterCanonicalTree(node.children, searchTerm, statusFilter);

      const mappingStatus = node.mapping?.status ?? null;
      const hasMapping = Boolean(node.mapping && node.mapping.shop_category_node_id);

      const statusMatches =
        statusFilter === 'all'
          ? true
          : statusFilter === 'unmapped'
            ? !hasMapping || mappingStatus === 'rejected'
            : mappingStatus === statusFilter;

      const searchMatches =
        matchesSearch(searchTerm, node.name) || matchesSearch(searchTerm, node.path) || matchesSearch(searchTerm, node.mapping?.shop_category?.path);

      const shouldInclude = (statusMatches && searchMatches) || filteredChildren.length > 0;

      if (!shouldInclude) {
        return null;
      }

      return {
        ...node,
        children: filteredChildren,
      };
    })
    .filter(Boolean) as CategoryTreeNode[];
};

const filterShopTree = (nodes: ShopTreeNode[], searchTerm: string): ShopTreeNode[] => {
  if (!searchTerm.trim()) {
    return nodes;
  }

  return nodes
    .map((node) => {
      const filteredChildren = filterShopTree(node.children, searchTerm);
      const matches = matchesSearch(searchTerm, node.name) || matchesSearch(searchTerm, node.path);

      if (matches || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren };
      }

      return null;
    })
    .filter(Boolean) as ShopTreeNode[];
};

const countUnmapped = (nodes: CategoryTreeNode[]): number =>
  nodes.reduce((acc, node) => acc + (!node.mapping || !node.mapping.shop_category_node_id ? 1 : 0) + countUnmapped(node.children), 0);

const collapseMappedNodes = (nodes: CategoryTreeNode[]): CategoryTreeNode[] => {
  return nodes
    .map((node) => {
      const collapsedChildren = collapseMappedNodes(node.children);
      const isConfirmed = node.mapping?.status === 'confirmed';

      if (isConfirmed && collapsedChildren.length === 0) {
        return null;
      }

      return { ...node, children: collapsedChildren };
    })
    .filter(Boolean) as CategoryTreeNode[];
};

const describeError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return String((error as { message: unknown }).message);
  }

  return 'Došlo k neočekávané chybě.';
};

type ExportCanonicalItem = {
  id: string;
  name: string;
  path: string | null;
  depth: number;
  mapping_status: string | null;
  mapped_name: string | null;
  mapped_path: string | null;
};

type ExportShopItem = {
  id: string;
  name: string;
  path: string | null;
  depth: number;
};

type AggregatedValidationIssue = CategoryDefaultCategoryIssue & {
  reasons: string[];
  combinedCodes: string[];
};

const isIgnored = (name: string | null, path: string | null) => {
  const normalized = `${name ?? ''} ${path ?? ''}`.toLowerCase();
  return normalized.includes('nové produkty') || normalized.includes('nove produkty');
};

const flattenCanonicalForExport = (nodes: CategoryTreeNode[], depth = 0, skipBranch = false): ExportCanonicalItem[] =>
  nodes.flatMap((node) => {
    const shouldSkipHere = depth === 0 && isIgnored(node.name, node.path);
    const nextSkip = skipBranch || shouldSkipHere;

    if (nextSkip) {
      return flattenCanonicalForExport(node.children, depth + 1, nextSkip);
    }

    return [
      {
        id: node.id,
        name: node.name,
        path: node.path ?? null,
        depth,
        mapping_status: node.mapping?.status ?? null,
        mapped_name: node.mapping?.shop_category?.name ?? null,
        mapped_path: node.mapping?.shop_category?.path ?? null,
      },
      ...flattenCanonicalForExport(node.children, depth + 1, nextSkip),
    ];
  });

const flattenShopForExport = (nodes: ShopTreeNode[], depth = 0, skipBranch = false): ExportShopItem[] =>
  nodes.flatMap((node) => {
    const shouldSkipHere = depth === 0 && isIgnored(node.name, node.path);
    const nextSkip = skipBranch || shouldSkipHere;

    if (nextSkip) {
      return flattenShopForExport(node.children, depth + 1, nextSkip);
    }

    return [
      {
        id: node.id,
        name: node.name,
        path: node.path ?? null,
        depth,
      },
      ...flattenShopForExport(node.children, depth + 1, nextSkip),
    ];
  });

const buildAiExportPrompt = (params: {
  masterShop: string;
  targetShop: string;
  instructions: string;
  canonical: ExportCanonicalItem[];
  shop: ExportShopItem[];
}) => {
  const customInstructions = params.instructions.trim()
    ? `
Dodatečné instrukce uživatele: ${params.instructions.trim()}
`
    : '';

  const canonicalList = params.canonical.length
    ? params.canonical
        .map((item) => {
          return `- MasterID:${item.id} | hloubka:${item.depth} | ${item.name}${
            item.path ? ` (cesta: ${item.path})` : ''
          }`;
        })
        .join('\n')
    : '—';

  const shopList = params.shop.length
    ? params.shop
        .map(
          (item) => `- TargetID:${item.id} | hloubka:${item.depth} | ${item.name}${
            item.path ? ` (cesta: ${item.path})` : ''
          }`
        )
        .join('\n')
    : '—';

  return `### Úkol
Jsi seniorní merchandiser a máš přiřadit kategorie mezi master shopem "${params.masterShop}" (čeština) a cílovým shopem "${params.targetShop}" (rumunština).
Tvým cílem je namapovat co nejvíce českých kategorií na odpovídající rumunské kategorie. Preferuj semantickou shodu, respektuj hloubku stromu (rozdíl maximálně 1) a zachovej logiku rodič/ dítě. Pokud opravdu nenajdeš vhodnou shodu, nastav target_id na null, ale snaž se tyto případy minimalizovat.
Pracuj s oběma jazyky, podle potřeby využij překlad.
${customInstructions}
### Zdroje – master (česky)
${canonicalList}

### Zdroje – cílový shop (rumunsky)
${shopList}

### Očekávaný formát odpovědi
Vrať JSON ve tvaru:

{
  "mappings": [
    {
      "canonical_id": "<ID master kategorie>",
      "target_id": "<ID cílové kategorie nebo null>",
      "reason": "Stručné vysvětlení rozhodnutí (cz/ro)",
      "confidence": 0.0-1.0
    }
  ]
}

Použij pouze ID, která vidíš ve zdrojových seznamech. Tento JSON následně nahraji zpět do systému.`;
};

const triggerFileDownload = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const aggregateValidationIssues = (
  issues: CategoryDefaultCategoryIssue[]
): AggregatedValidationIssue[] => {
  if (issues.length === 0) {
    return [];
  }

  const map = new Map<string, AggregatedValidationIssue>();

  for (const issue of issues) {
    const key = `${issue.master_category.guid ?? 'unknown'}|${issue.product_id}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        ...issue,
        reasons: [issue.reason],
        combinedCodes: issue.codes ?? [],
      });
      continue;
    }

    existing.reasons = Array.from(new Set([...existing.reasons, issue.reason]));
    existing.combinedCodes = Array.from(
      new Set([...(existing.combinedCodes ?? []), ...(issue.codes ?? [])])
    );

    if (!existing.actual_category && issue.actual_category) {
      existing.actual_category = issue.actual_category;
    }

    if (!existing.expected_category && issue.expected_category) {
      existing.expected_category = issue.expected_category;
    }

    if (!existing.master_category && issue.master_category) {
      existing.master_category = issue.master_category;
    }

    if (!existing.recommended_category && issue.recommended_category) {
      existing.recommended_category = issue.recommended_category;
    }

    if (!existing.name && issue.name) {
      existing.name = issue.name;
    }

    if (!existing.sku && issue.sku) {
      existing.sku = issue.sku;
    }
  }

  return Array.from(map.values());
};

export const CategoryMappingPage = () => {
  const shopsQuery = useShops({ per_page: 100 });
  const shops = shopsQuery.data?.data ?? EMPTY_SHOPS;

  const targetShopOptions = useMemo(
    () =>
      shops
        .filter((shop) => !shop.is_master)
        .map((shop) => ({ value: shop.id.toString(), label: `${shop.name} (ID ${shop.id})` })),
    [shops]
  );

  const masterShopOptions = useMemo(
    () =>
      shops
        .filter((shop) => shop.is_master)
        .map((shop) => ({ value: shop.id.toString(), label: `${shop.name} (ID ${shop.id})` })),
    [shops]
  );

  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
  const [selectedMasterShopId, setSelectedMasterShopId] = useState<number | null>(null);

  const [canonicalSearch, setCanonicalSearch] = useState('');
  const [shopSearch, setShopSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');
  const [autoCollapseUnmapped, setAutoCollapseUnmapped] = useState(true);
  const [expandSignal, setExpandSignal] = useState(0);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiInstructions, setAiInstructions] = useState('');
  const [aiIncludeMapped, setAiIncludeMapped] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<CategoryAiPreMapResponse | null>(null);
  const [bulkApplying, setBulkApplying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [validationSearchInput, setValidationSearchInput] = useState('');
  const [validationSearch, setValidationSearch] = useState('');
  const [validationPage, setValidationPage] = useState(1);
  const validationPerPage = 50;
  const [editIssue, setEditIssue] = useState<AggregatedValidationIssue | null>(null);
  const [selectedMasterCategoryId, setSelectedMasterCategoryId] = useState<string | null>(null);
  const [selectedShopCategoryId, setSelectedShopCategoryId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<'master' | 'shop'>('shop');

  useEffect(() => {
    if (selectedShopId === null && targetShopOptions.length > 0) {
      setSelectedShopId(Number(targetShopOptions[0].value));
    }
  }, [selectedShopId, targetShopOptions]);

  useEffect(() => {
    if (selectedMasterShopId === null && masterShopOptions.length > 0) {
      setSelectedMasterShopId(Number(masterShopOptions[0].value));
    }
  }, [selectedMasterShopId, masterShopOptions]);

  useEffect(() => {
    setValidationPage(1);
    setValidationSearch('');
    setValidationSearchInput('');
  }, [selectedShopId, selectedMasterShopId]);

  const treeParams = useMemo(
    () => ({
      shop_id: selectedShopId ?? undefined,
      master_shop_id: selectedMasterShopId ?? undefined,
    }),
    [selectedShopId, selectedMasterShopId]
  );

  const treeQuery = useCategoryTree(treeParams);
  const confirmMapping = useConfirmCategoryMapping();
  const aiPreMap = useAiPreMapCategories();
  const rejectMapping = useRejectCategoryMapping();
  const applyDefaultCategoryMutation = useApplyDefaultCategory();
  const validationParams = useMemo(
    () => ({
      shop_id: selectedShopId ?? undefined,
      master_shop_id: selectedMasterShopId ?? undefined,
      page: validationPage,
      per_page: validationPerPage,
      search: validationSearch.trim() ? validationSearch.trim() : undefined,
    }),
    [selectedShopId, selectedMasterShopId, validationPage, validationPerPage, validationSearch]
  );
  const validationQuery = useCategoryDefaultValidation(validationParams);

  const isLoading = treeQuery.isLoading || treeQuery.isFetching;
  const treeError = treeQuery.error as Error | null;

  const summary = treeQuery.data?.summary;
  const canonicalNodesRaw = treeQuery.data?.canonical ?? EMPTY_CATEGORY_TREE;
  const shopNodesRaw = treeQuery.data?.shop ?? EMPTY_SHOP_TREE;

  const filteredCanonicalNodes = useMemo(() => {
    const filtered = filterCanonicalTree(canonicalNodesRaw, canonicalSearch, statusFilter);

    if (autoCollapseUnmapped && statusFilter === 'all' && !canonicalSearch.trim()) {
      return collapseMappedNodes(filtered);
    }

    return filtered;
  }, [autoCollapseUnmapped, canonicalNodesRaw, canonicalSearch, statusFilter]);

  const filteredShopNodes = useMemo(() => filterShopTree(shopNodesRaw, shopSearch), [shopNodesRaw, shopSearch]);

  const unmappedCount = useMemo(() => countUnmapped(canonicalNodesRaw), [canonicalNodesRaw]);

  const canonicalIndex = useMemo(() => {
    const map = new Map<string, CategoryTreeNode>();

    const traverse = (nodes: CategoryTreeNode[]) => {
      for (const node of nodes) {
        map.set(node.id, node);
        traverse(node.children);
      }
    };

    traverse(canonicalNodesRaw);

    return map;
  }, [canonicalNodesRaw]);

  const canonicalGuidIndex = useMemo(() => {
    const map = new Map<string, string>();
    canonicalIndex.forEach((node, id) => {
      if (node.guid) {
        map.set(node.guid, id);
      }
    });
    return map;
  }, [canonicalIndex]);

  const canonicalOptions = useMemo(
    () =>
      flattenCanonicalForExport(canonicalNodesRaw).map((item) => ({
        value: item.id,
        label: item.path ? `${item.name} (${item.path})` : item.name,
      })),
    [canonicalNodesRaw]
  );

  const shopIndex = useMemo(() => {
    const map = new Map<string, ShopTreeNode>();

    const traverse = (nodes: ShopTreeNode[]) => {
      for (const node of nodes) {
        map.set(node.id, node);
        traverse(node.children);
      }
    };

    traverse(shopNodesRaw);

    return map;
  }, [shopNodesRaw]);

  const shopGuidIndex = useMemo(() => {
    const map = new Map<string, string>();
    shopIndex.forEach((node, id) => {
      if (node.remote_guid) {
        map.set(node.remote_guid, id);
      }
    });
    return map;
  }, [shopIndex]);

  const shopOptions = useMemo(
    () =>
      flattenShopForExport(shopNodesRaw).map((item) => ({
        value: item.id,
        label: item.path ? `${item.name} (${item.path})` : item.name,
      })),
    [shopNodesRaw]
  );

  const resolveCanonicalCategoryId = (category: CategoryDefaultCategoryRecord | null | undefined) => {
    if (!category) {
      return null;
    }

    if (category.id && canonicalIndex.has(category.id)) {
      return category.id;
    }

    if (category.guid && canonicalGuidIndex.has(category.guid)) {
      return canonicalGuidIndex.get(category.guid) ?? null;
    }

    return null;
  };

  const resolveShopCategoryId = (category: CategoryDefaultCategoryRecord | null | undefined) => {
    if (!category) {
      return null;
    }

    if (category.id && shopIndex.has(category.id)) {
      return category.id;
    }

    if (category.remote_guid && shopGuidIndex.has(category.remote_guid)) {
      return shopGuidIndex.get(category.remote_guid) ?? null;
    }

    return null;
  };

  const masterShop = useMemo(() => {
    if (selectedMasterShopId === null) {
      return null;
    }

    return shops.find((shop) => shop.id === selectedMasterShopId) ?? null;
  }, [selectedMasterShopId, shops]);

  const targetShop = useMemo(() => {
    if (selectedShopId === null) {
      return null;
    }

    return shops.find((shop) => shop.id === selectedShopId) ?? null;
  }, [selectedShopId, shops]);

  const handleOpenAiModal = () => {
    if (!selectedShopId) {
      notifications.show({ message: 'Vyber prosím cílový shop.', color: 'yellow' });
      return;
    }

    setAiModalOpen(true);
  };

  const handleImportAiJsonClick = () => {
    if (!selectedShopId) {
      notifications.show({ message: 'Vyber prosím cílový shop.', color: 'yellow' });
      return;
    }

    fileInputRef.current?.click();
  };

  const handleAiJsonFileChange: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { mappings?: Array<Record<string, unknown>> } | null;

      if (!parsed || !Array.isArray(parsed.mappings)) {
        throw new Error('Soubor neobsahuje platné pole "mappings".');
      }

      const warnings: string[] = [];
      const suggestions = parsed.mappings.flatMap((entry, index) => {
        const canonicalId = typeof entry.canonical_id === 'string' ? entry.canonical_id : null;
        const targetId = typeof entry.target_id === 'string' || entry.target_id === null ? (entry.target_id as string | null) : null;

        if (!canonicalId) {
          warnings.push(`Řádek ${index + 1}: chybí platné canonical_id.`);
          return [];
        }

        const canonicalNode = canonicalIndex.get(canonicalId);

        if (!canonicalNode) {
          warnings.push(`Řádek ${index + 1}: master kategorie s ID ${canonicalId} nebyla nalezena.`);
          return [];
        }

        const shopNode = targetId ? shopIndex.get(targetId) : null;

        if (targetId && !shopNode) {
          warnings.push(`Řádek ${index + 1}: cílová kategorie s ID ${targetId} nebyla nalezena. Mapa bude přeskočena.`);
          return [];
        }

        const confidenceValue = typeof entry.confidence === 'number' ? Math.max(0, Math.min(1, entry.confidence)) : 0.5;
        const reasonValue = typeof entry.reason === 'string' ? entry.reason : null;

        return [
          {
            canonical: {
              id: canonicalNode.id,
              guid: canonicalNode.guid,
              name: canonicalNode.name,
              path: canonicalNode.path ?? null,
            },
            suggested: shopNode
              ? {
                  id: shopNode.id,
                  name: shopNode.name,
                  path: shopNode.path ?? null,
                  remote_guid: shopNode.remote_guid ?? null,
                }
              : null,
            similarity: confidenceValue,
            reason: reasonValue,
          },
        ];
      });

      if (suggestions.length === 0) {
        notifications.show({ message: 'Importovaný soubor neobsahuje použitelné záznamy.', color: 'yellow' });
        return;
      }

      setAiSuggestions({
        message: 'Importované návrhy k ručnímu potvrzení.',
        master_shop: { id: masterShop?.id ?? 0, name: masterShop?.name ?? null },
        target_shop: { id: targetShop?.id ?? selectedShopId!, name: targetShop?.name ?? null },
        instructions: aiInstructions,
        include_mapped: true,
        suggestions,
      });

      notifications.show({
        message: `Načteno ${suggestions.length} návrhů z JSON souboru.${warnings.length ? ' Některé položky byly přeskočeny.' : ''}`,
        color: 'teal',
      });

      if (warnings.length > 0) {
        console.warn('Import AI JSON - warnings', warnings);
      }
    } catch (error) {
      console.error('Import AI JSON error', error);
      notifications.show({ message: `Nepodařilo se načíst JSON: ${describeError(error)}`, color: 'red' });
    } finally {
      event.target.value = '';
    }
  };

  const handleAiPreMapSubmit = async () => {
    if (!selectedShopId) {
      notifications.show({ message: 'Vyber prosím cílový shop.', color: 'yellow' });
      return;
    }

    try {
      const result = await aiPreMap.mutateAsync({
        shop_id: selectedShopId,
        master_shop_id: selectedMasterShopId ?? undefined,
        instructions: aiInstructions.trim() ? aiInstructions.trim() : undefined,
        include_mapped: aiIncludeMapped,
      });

      setAiSuggestions(result);
      setAiModalOpen(false);
      setAiInstructions('');
      notifications.show({
        message:
          result.suggestions.length > 0
            ? `AI připravila ${result.suggestions.length} návrhů na mapování.`
            : 'AI nenašla žádné nové návrhy. Zkus upravit instrukce.',
        color: result.suggestions.length > 0 ? 'teal' : 'gray',
      });
    } catch (error) {
      notifications.show({ message: describeError(error), color: 'red' });
    }
  };

  const handleDismissSuggestion = (canonicalId: string) => {
    setAiSuggestions((prev) => {
      if (!prev) {
        return prev;
      }

      return {
        ...prev,
        suggestions: prev.suggestions.filter((item) => item.canonical.id !== canonicalId),
      };
    });
  };

  const handleApplyAiSuggestion = async (suggestion: CategoryAiPreMapSuggestion) => {
    try {
      if (suggestion.suggested) {
        await handleDrop(suggestion.canonical.id, suggestion.suggested.id);
      } else {
        await handleClear(suggestion.canonical.id);
      }
      handleDismissSuggestion(suggestion.canonical.id);
      notifications.show({
        message: suggestion.suggested
          ? `Kategorie “${suggestion.canonical.name}” byla namapována na “${suggestion.suggested.name}”.`
          : `Kategorie “${suggestion.canonical.name}” byla ponechána bez mapování (null).`,
        color: 'green',
      });
    } catch (error) {
      notifications.show({ message: describeError(error), color: 'red' });
    }
  };

  const handleApplyHighConfidence = async () => {
    if (!aiSuggestions) {
      return;
    }

    const highConfidence = aiSuggestions.suggestions.filter((suggestion) => suggestion.similarity >= 0.9);

    if (highConfidence.length === 0) {
      notifications.show({
        message: 'Žádné návrhy s jistotou 90 % a více.',
        color: 'yellow',
      });
      return;
    }

    setBulkApplying(true);

    try {
      for (const suggestion of highConfidence) {
        await handleApplyAiSuggestion(suggestion);
      }

      notifications.show({
        message: `Automaticky potvrzeno ${highConfidence.length} návrhů s vysokou jistotou.`,
        color: 'teal',
      });
    } catch (error) {
      notifications.show({ message: describeError(error), color: 'red' });
    } finally {
      setBulkApplying(false);
    }
  };

  const handleDrop = async (canonicalId: string, shopCategoryNodeId: string) => {
    if (!selectedShopId) {
      return;
    }

    await confirmMapping.mutateAsync({
      shop_id: selectedShopId,
      category_node_id: canonicalId,
      shop_category_node_id: shopCategoryNodeId,
    });

    treeQuery.refetch();
  };

  const handleClear = async (canonicalId: string) => {
    if (!selectedShopId) {
      return;
    }

    await rejectMapping.mutateAsync({ category_node_id: canonicalId, shop_id: selectedShopId });
    treeQuery.refetch();
  };

  const controlDisabled = !treeQuery.data || isLoading;
  const isEditModalOpen = Boolean(editIssue);
  const isApplyLoading = applyDefaultCategoryMutation.isPending;

  const validationData = validationQuery.data;
  const validationIssues = validationData?.data ?? EMPTY_VALIDATION_ISSUES;
  const validationStats = validationData?.stats ?? {};
  const validationTotal = validationData?.meta.total ?? 0;
  const validationLastPage = validationData?.meta.last_page ?? 1;
  const isValidationLoading = validationQuery.isLoading || validationQuery.isFetching;
  const groupedValidationIssues = useMemo(
    () => aggregateValidationIssues(validationIssues),
    [validationIssues]
  );

  useEffect(() => {
    if (!validationData) {
      return;
    }

    const last = validationData.meta.last_page || 1;
    if (validationPage > last) {
      setValidationPage(last);
    }
  }, [validationData, validationPage]);

  const handleValidationSearchSubmit = () => {
    setValidationPage(1);
    setValidationSearch(validationSearchInput.trim());
  };

  const handleValidationSearchReset = () => {
    setValidationSearchInput('');
    setValidationSearch('');
    setValidationPage(1);
  };

  const handleValidationSearchKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleValidationSearchSubmit();
    }
  };

  const handleExportValidationCsv = async () => {
    if (validationTotal === 0) {
      notifications.show({ message: 'Není co exportovat - žádné nesrovnalosti.', color: 'yellow' });
      return;
    }

    try {
      const exportPerPage = 200;
      let currentPage = 1;
      let lastPage = 1;
      const exportRows: CategoryDefaultCategoryIssue[] = [];

      do {
        const batch = await fetchCategoryDefaultValidation({
          ...validationParams,
          page: currentPage,
          per_page: exportPerPage,
        });

        if (!batch.data || batch.data.length === 0) {
          break;
        }

        exportRows.push(...batch.data);
        lastPage = batch.meta.last_page ?? currentPage;
        currentPage += 1;
      } while (currentPage <= lastPage);

      if (exportRows.length === 0) {
        notifications.show({ message: 'Není co exportovat - žádné nesrovnalosti.', color: 'yellow' });
        return;
      }

      const header = ['SKU', 'Název', 'Kódy', 'Master kategorie', 'Očekávaná kategorie', 'Aktuální kategorie', 'Důvody'];

      const aggregatedRows = aggregateValidationIssues(exportRows);

      const rows = aggregatedRows.map((issue) => {
        const master = `${issue.master_category.name ?? ''}${issue.master_category.path ? ` | ${issue.master_category.path}` : ''}`.trim();
        const expected = issue.expected_category
          ? `${issue.expected_category.name ?? ''}${issue.expected_category.path ? ` | ${issue.expected_category.path}` : ''}`.trim()
          : '';
        const actual = issue.actual_category
          ? `${issue.actual_category.name ?? ''}${issue.actual_category.path ? ` | ${issue.actual_category.path}` : ''}`.trim()
          : '';

        return [
          issue.sku ?? '',
          issue.name ?? '',
          issue.combinedCodes.join(', '),
          master,
          expected,
          actual,
          issue.reasons
            .map((reason) => validationReasonMeta[reason]?.label ?? reason)
            .join(', '),
        ];
      });

    const csvContent = [header, ...rows]
      .map((row) => row.map((cell) => `"${(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const filename = `default-category-validation_${targetShop?.name?.replace(/\s+/g, '-') ?? 'shop'}_${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.csv`;

      triggerFileDownload(csvContent, filename);
      notifications.show({ message: 'Export CSV byl připraven.', color: 'teal' });
    } catch (error) {
      notifications.show({ message: `Export CSV selhal: ${describeError(error)}`, color: 'red' });
    }
  };

  const handleOpenEditIssue = (issue: AggregatedValidationIssue) => {
    const defaultTarget = issue.reasons.includes('missing_master_default') ? 'master' : 'shop';
    const resolvedTarget = defaultTarget === 'shop' && selectedShopId === null ? 'master' : defaultTarget;
    const masterId = resolveCanonicalCategoryId(issue.master_category) ?? resolveCanonicalCategoryId(issue.expected_category);
    const shopId = resolveShopCategoryId(issue.expected_category) ?? resolveShopCategoryId(issue.actual_category);

    setEditIssue(issue);
    setEditTarget(resolvedTarget);
    setSelectedMasterCategoryId(masterId ?? null);
    setSelectedShopCategoryId(shopId ?? null);
  };

  const handleCloseEditModal = () => {
    if (applyDefaultCategoryMutation.isPending) {
      return;
    }

    setEditIssue(null);
    setSelectedMasterCategoryId(null);
    setSelectedShopCategoryId(null);
    setEditTarget('shop');
  };

  const handleSubmitDefaultCategory = async () => {
    if (!editIssue) {
      return;
    }

    if (editTarget === 'shop' && !selectedShopId) {
      notifications.show({ message: 'Vyber prosím cílový shop.', color: 'yellow' });
      return;
    }

    try {
      const payload =
        editTarget === 'master'
          ? {
              product_id: editIssue.product_id,
              target: 'master' as const,
              category_id: selectedMasterCategoryId ?? null,
              sync_to_shoptet: true,
            }
          : {
              product_id: editIssue.product_id,
              target: 'shop' as const,
              category_id: selectedShopCategoryId ?? null,
              shop_id: selectedShopId!,
              sync_to_shoptet: true,
            };

      const response = await applyDefaultCategoryMutation.mutateAsync(payload);
      const message =
        response && typeof response === 'object' && 'message' in response && typeof (response as { message?: unknown }).message === 'string'
          ? (response as { message?: string }).message!
          : 'Výchozí kategorie byla aktualizována.';
      const debugInfo =
        response && typeof response === 'object' && 'debug' in response
          ? (response as { debug?: unknown }).debug
          : undefined;

      notifications.show({
        message,
        color: 'teal',
      });
      if (debugInfo) {
        console.debug('Default category sync debug', debugInfo);
      }
      handleCloseEditModal();
      validationQuery.refetch();
    } catch (error) {
      notifications.show({ message: describeError(error), color: 'red' });
    }
  };

  const handleExportForAi = () => {
    if (!selectedShopId) {
      notifications.show({ message: 'Vyber prosím cílový shop.', color: 'yellow' });
      return;
    }

    if (!treeQuery.data) {
      notifications.show({ message: 'Strom kategorií není načtený. Obnov prosím data.', color: 'yellow' });
      return;
    }

    const canonicalFlat = flattenCanonicalForExport(canonicalNodesRaw);
    const shopFlat = flattenShopForExport(shopNodesRaw);

    const prompt = buildAiExportPrompt({
      masterShop: masterShop?.name ?? `Shop #${selectedMasterShopId ?? 'master'}`,
      targetShop: targetShop?.name ?? `Shop #${selectedShopId}`,
      instructions: aiInstructions,
      canonical: canonicalFlat,
      shop: shopFlat,
    });

    triggerFileDownload(prompt, `ai-category-mapping-${selectedShopId}.txt`);
    notifications.show({ message: 'Exportní prompt byl připraven a stažen.', color: 'teal' });
  };

  return (
    <SectionPageShell
      section="categories.mapping"
      description="Udržuj vazby mezi master kategoriemi a jednotlivými Shoptet shopy a připrav si kontrolu, že produkty používají správné výchozí kategorie."
    >
      <Stack gap="lg">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={handleAiJsonFileChange}
      />
      <Group gap="md" align="flex-end" wrap="wrap">
          <Select
            label="Master shop"
            placeholder={masterShopOptions.length === 0 ? 'Žádný master shop' : 'Vyber master'}
            data={masterShopOptions}
            value={selectedMasterShopId ? selectedMasterShopId.toString() : null}
            onChange={(value) => setSelectedMasterShopId(value ? Number(value) : null)}
            w={220}
            searchable
            clearable
          />
          <Select
            label="Cílový shop"
            placeholder={targetShopOptions.length === 0 ? 'Žádný cílový shop' : 'Vyber shop'}
            data={targetShopOptions}
            value={selectedShopId ? selectedShopId.toString() : null}
            onChange={(value) => setSelectedShopId(value ? Number(value) : null)}
            w={220}
            searchable
            clearable
          />
          <Button variant="subtle" leftSection={<IconDownload size={16} />} onClick={handleExportForAi} disabled={isLoading}>
            Export pro AI
          </Button>
          <Button
            variant="subtle"
            leftSection={<IconDownload size={16} />}
            onClick={handleImportAiJsonClick}
            disabled={isLoading}
          >
            Import AI JSON
          </Button>
          <Button
            variant="light"
            leftSection={<IconSparkles size={16} />}
            onClick={handleOpenAiModal}
            loading={aiPreMap.isPending}
            disabled={isLoading}
          >
            Předmapování pomocí AI
          </Button>
          <Tooltip label="Aktualizovat strom">
            <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={() => treeQuery.refetch()} loading={isLoading}>
              Obnovit
            </Button>
          </Tooltip>
      </Group>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Stack gap={4} maw={360}>
              <Text size="sm" c="dimmed">
                Přetáhni kategorii z pravého stromu do kanonické kategorie vlevo pro potvrzení mapování. Stav se uloží okamžitě a lze jej kdykoliv změnit.
              </Text>
              <Group gap={8}>
                <Badge color="blue" variant="light">
                  Kanonické: {summary?.canonical_count ?? 0}
                </Badge>
                <Badge color="indigo" variant="light">
                  Shop kategorie: {summary?.shop_count ?? 0}
                </Badge>
                <Badge color="green" variant="light">
                  Potvrzeno: {summary?.mappings.confirmed ?? 0}
                </Badge>
                <Badge color="yellow" variant="light">
                  Navrženo: {summary?.mappings.suggested ?? 0}
                </Badge>
                <Badge color="red" variant="light">
                  Odmítnuto: {summary?.mappings.rejected ?? 0}
                </Badge>
                <Badge color="gray" variant="outline">
                  Nenamapované: {unmappedCount}
                </Badge>
              </Group>
            </Stack>
            <Group gap="xs">
              <Tooltip label="Rozbalit všechny uzly">
                <ActionIcon
                  variant="light"
                  radius="md"
                  size="lg"
                  onClick={() => setExpandSignal((value) => value + 1)}
                  disabled={controlDisabled}
                >
                  <IconArrowsMaximize size={18} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Sbalit všechny uzly">
                <ActionIcon
                  variant="light"
                  radius="md"
                  size="lg"
                  onClick={() => setCollapseSignal((value) => value + 1)}
                  disabled={controlDisabled}
                >
                  <IconArrowsMinimize size={18} />
                </ActionIcon>
              </Tooltip>
              <Switch
                size="sm"
                label="Automaticky skrýt mapované"
                checked={autoCollapseUnmapped}
                onChange={(event) => setAutoCollapseUnmapped(event.currentTarget.checked)}
              />
            </Group>
          </Group>

          <Group gap="md" align="flex-end" wrap="wrap">
            <TextInput
              label="Hledat v kanonickém stromu"
              placeholder="Název, cesta nebo mapovaná kategorie"
              leftSection={<IconSearch size={16} />}
              value={canonicalSearch}
              onChange={(event) => setCanonicalSearch(event.currentTarget.value)}
              w={320}
            />
            <TextInput
              label="Hledat v cílovém shopu"
              placeholder="Název nebo breadcrumb"
              leftSection={<IconSearch size={16} />}
              value={shopSearch}
              onChange={(event) => setShopSearch(event.currentTarget.value)}
              w={280}
            />
            <Stack gap={4}>
              <Text size="xs" fw={500}>
                Filtr mapování
              </Text>
              <SegmentedControl
                value={statusFilter}
                onChange={(value: StatusFilterValue) => setStatusFilter(value)}
                data={statusFilterOptions}
              />
            </Stack>
          </Group>
        </Stack>
      </Card>

      {aiSuggestions ? (
        <Card withBorder padding="lg" radius="md">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <Stack gap={4} maw={520}>
                <Title order={3}>Návrhy z AI předmapování</Title>
                <Text size="sm" c="dimmed">
                  AI porovnala master shop {aiSuggestions.master_shop.name ?? `#${aiSuggestions.master_shop.id}`} a shop {aiSuggestions.target_shop.name ?? `#${aiSuggestions.target_shop.id}`}. Projdi návrhy a potvrď jen ty, které dávají smysl.
                </Text>
                {aiSuggestions.instructions ? (
                  <Alert color="blue" variant="light" title="Instrukce">
                    {aiSuggestions.instructions}
                  </Alert>
                ) : null}
              </Stack>
              <Button variant="subtle" color="gray" onClick={() => setAiSuggestions(null)}>
                Vyčistit návrhy
              </Button>
              <Button
                variant="light"
                color="teal"
                onClick={handleApplyHighConfidence}
                disabled={bulkApplying || confirmMapping.isPending}
              >
                Potvrdit vše ≥ 90 %
              </Button>
            </Group>

            {aiSuggestions.suggestions.length === 0 ? (
              <Alert color="gray" icon={<IconInfoCircle size={18} />} variant="light">
                AI tentokrát nenašla žádné nové shody. Zkus upravit instrukce nebo zahrnout existující mapování.
              </Alert>
            ) : (
              <Stack gap="sm">
                {aiSuggestions.suggestions.map((suggestion) => (
                  <Card
                    key={`${suggestion.canonical.id}-${suggestion.suggested ? suggestion.suggested.id : 'null'}`}
                    withBorder
                    padding="md"
                    radius="md"
                  >
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start">
                        <Stack gap={4}>
                          <Text fw={600}>Master: {suggestion.canonical.name}</Text>
                          <Text size="sm" c="dimmed">
                            {suggestion.canonical.path ?? '—'}
                          </Text>
                        </Stack>
                        <Stack gap={4} align="flex-end">
                          <Badge color="teal" variant="light">Podobnost {Math.round(suggestion.similarity * 100)}%</Badge>
                          <Text size="sm" fw={500}>
                            {suggestion.suggested
                              ? `Navrženo: ${suggestion.suggested.name}`
                              : 'Navrženo: (bez mapování)'}
                          </Text>
                          <Text size="sm" c="dimmed" ta="right">
                            {suggestion.suggested ? suggestion.suggested.path ?? '—' : '—'}
                          </Text>
                          {suggestion.reason ? (
                            <Text size="xs" c="dimmed" ta="right">
                              {suggestion.reason}
                            </Text>
                          ) : null}
                        </Stack>
                      </Group>
                      <Group justify="flex-end" gap="sm">
                        <Button variant="default" onClick={() => handleDismissSuggestion(suggestion.canonical.id)}>
                          Odebrat
                        </Button>
                        <Button
                          onClick={() => handleApplyAiSuggestion(suggestion)}
                          loading={confirmMapping.isPending}
                        >
                          Potvrdit mapování
                        </Button>
                      </Group>
                    </Stack>
                  </Card>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>
      ) : null}

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Stack gap={4} maw={520}>
              <Title order={3}>Validace výchozích kategorií produktů</Title>
              <Text size="sm" c="dimmed">
                Ověř, že produkty v navázaných shopech používají výchozí kategorii odpovídající master katalogu. Výsledky ukazují rozdíly podle SKU (kódů variant).
              </Text>
              <Text size="sm" c="dimmed">
                Nalezeno nesrovnalostí: {validationTotal}
              </Text>
            </Stack>
            <Group gap="sm" align="flex-end">
              <TextInput
                label="Filtrovat podle SKU/kódu"
                placeholder="Např. 0134"
                value={validationSearchInput}
                onChange={(event) => setValidationSearchInput(event.currentTarget.value)}
                onKeyDown={handleValidationSearchKeyDown}
                w={220}
              />
              <Button variant="default" onClick={handleValidationSearchSubmit}>
                Hledat
              </Button>
              {validationSearch ? (
                <Button variant="subtle" onClick={handleValidationSearchReset}>
                  Vymazat filtr
                </Button>
              ) : null}
              <Button
                variant="light"
                leftSection={<IconRefresh size={16} />}
                onClick={() => validationQuery.refetch()}
                loading={isValidationLoading}
              >
                Obnovit
              </Button>
              <Button
                variant="light"
                color="teal"
                leftSection={<IconDownload size={16} />}
                onClick={handleExportValidationCsv}
                disabled={groupedValidationIssues.length === 0}
              >
                Export CSV
              </Button>
            </Group>
          </Group>

          {Object.keys(validationStats).length > 0 ? (
            <Group gap="sm">
              {Object.entries(validationStats)
                .sort((a, b) => b[1] - a[1])
                .map(([reason, count]) => (
                  <Badge key={reason} color={validationReasonMeta[reason]?.color ?? 'gray'} variant="light">
                    {(validationReasonMeta[reason]?.label ?? reason) + ': ' + count}
                  </Badge>
                ))}
            </Group>
          ) : null}

          {isValidationLoading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : validationTotal === 0 ? (
            <Alert icon={<IconInfoCircle size={18} />} color="green" variant="light">
              Výchozí kategorie produktů v cílovém shopu odpovídají mapování.
            </Alert>
          ) : (
            <ScrollArea h={360} type="auto">
              <Table striped highlightOnHover withColumnBorders verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Produkt (SKU / kódy)</Table.Th>
                    <Table.Th>Master kategorie</Table.Th>
                    <Table.Th>Očekávaná kategorie</Table.Th>
                    <Table.Th>Aktuální kategorie</Table.Th>
                    <Table.Th>Důvod</Table.Th>
                    <Table.Th>Akce</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {groupedValidationIssues.map((issue) => (
                    <Table.Tr key={issue.product_id}>
                      <Table.Td>
                        <Stack gap={4}>
                          <Text fw={600}>{issue.sku ?? '—'}</Text>
                          {issue.name ? <Text size="xs">{issue.name}</Text> : null}
                          {issue.combinedCodes && issue.combinedCodes.length > 0 ? (
                            <Text size="xs" c="dimmed">
                              Kódy: {issue.combinedCodes.join(', ')}
                            </Text>
                          ) : null}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text size="sm" fw={500}>{issue.master_category.name ?? '—'}</Text>
                          <Text size="xs" c="dimmed">{issue.master_category.path ?? '—'}</Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        {issue.expected_category ? (
                          <Stack gap={2}>
                            <Text size="sm" fw={500}>{issue.expected_category.name ?? '—'}</Text>
                            <Text size="xs" c="dimmed">{issue.expected_category.path ?? '—'}</Text>
                          </Stack>
                        ) : (
                          <Text size="sm" c="dimmed">Chybí mapování</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {issue.actual_category ? (
                          <Stack gap={2}>
                            <Text size="sm" fw={500}>{issue.actual_category.name ?? '—'}</Text>
                            <Text size="xs" c="dimmed">{issue.actual_category.path ?? '—'}</Text>
                          </Stack>
                        ) : (
                          <Text size="sm" c="dimmed">Bez kategorie</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={4}>
                          {issue.reasons.map((reason) => (
                            <Badge key={reason} color={validationReasonMeta[reason]?.color ?? 'gray'}>
                              {validationReasonMeta[reason]?.label ?? reason}
                            </Badge>
                          ))}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Button
                          variant="light"
                          size="xs"
                          onClick={() => handleOpenEditIssue(issue)}
                        >
                          Upravit výchozí kategorii
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}

          {groupedValidationIssues.length > 0 && validationLastPage > 1 ? (
            <Group justify="space-between" align="center">
              <Text size="sm" c="dimmed">
                Stránka {validationData?.meta.page ?? validationPage} z {validationLastPage}
              </Text>
              <Pagination
                total={validationLastPage}
                value={validationData?.meta.page ?? validationPage}
                onChange={setValidationPage}
              />
            </Group>
          ) : null}
        </Stack>
      </Card>

      {treeError ? (
        <Alert color="red" icon={<IconInfoCircle size={18} />} title="Chyba načtení">
          {treeError.message}
        </Alert>
      ) : selectedShopId === null ? (
        <Alert icon={<IconInfoCircle size={18} />} title="Vyber shop" color="blue">
          Vyber cílový shop, se kterým chceš pracovat.
        </Alert>
      ) : (
        <DndProvider backend={HTML5Backend}>
          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
            <Card withBorder padding="md" radius="md">
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Text fw={600}>Kanonický strom</Text>
                  {isLoading ? <Loader size="sm" /> : null}
                </Group>
                <ScrollArea h={560} scrollbarSize={6} type="always">
                  {isLoading ? (
                    <Group justify="center" align="center" h={520}>
                      <Loader />
                    </Group>
                  ) : (
                    <CanonicalTree
                      nodes={filteredCanonicalNodes}
                      onDrop={handleDrop}
                      onClear={handleClear}
                      highlightTerm={canonicalSearch}
                      expandSignal={expandSignal}
                      collapseSignal={collapseSignal}
                    />
                  )}
                </ScrollArea>
              </Stack>
            </Card>
            <Card withBorder padding="md" radius="md">
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Text fw={600}>Kategorie cílového shopu</Text>
                  {isLoading ? <Loader size="sm" /> : null}
                </Group>
                <ScrollArea h={560} scrollbarSize={6} type="always">
                  {isLoading ? (
                    <Group justify="center" align="center" h={520}>
                      <Loader />
                    </Group>
                  ) : (
                    <ShopTree
                      nodes={filteredShopNodes}
                      highlightTerm={shopSearch}
                      expandSignal={expandSignal}
                      collapseSignal={collapseSignal}
                    />
                  )}
                </ScrollArea>
              </Stack>
            </Card>
          </SimpleGrid>
        </DndProvider>
      )}

      <Modal
        opened={isEditModalOpen}
        onClose={handleCloseEditModal}
        title="Upravit výchozí kategorii"
        centered
        radius="lg"
        size="lg"
      >
        <Stack gap="md">
          {editIssue ? (
            <Stack gap="sm">
              <Stack gap={4}>
                <Text size="sm" fw={600}>{editIssue.sku ?? '—'}</Text>
                {editIssue.name ? <Text size="sm" c="dimmed">{editIssue.name}</Text> : null}
                {editIssue.combinedCodes.length > 0 ? (
                  <Text size="xs" c="dimmed">Kódy: {editIssue.combinedCodes.join(', ')}</Text>
                ) : null}
              </Stack>
              {editIssue.reasons.length > 0 ? (
                <Group gap="xs">
                  {editIssue.reasons.map((reason) => (
                    <Badge key={reason} color={validationReasonMeta[reason]?.color ?? 'gray'} variant="light">
                      {validationReasonMeta[reason]?.label ?? reason}
                    </Badge>
                  ))}
                </Group>
              ) : null}
              <Group gap="xl" align="flex-start">
                <Stack gap={2}>
                  <Text size="xs" c="dimmed">Očekávaná kategorie</Text>
                  <Text size="sm" fw={500}>{editIssue.expected_category?.name ?? '—'}</Text>
                  <Text size="xs" c="dimmed">{editIssue.expected_category?.path ?? '—'}</Text>
                </Stack>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed">Aktuální kategorie</Text>
                  <Text size="sm" fw={500}>
                    {editIssue.actual_category ? editIssue.actual_category.name ?? '—' : 'Bez kategorie'}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {editIssue.actual_category ? editIssue.actual_category.path ?? '—' : '—'}
                  </Text>
                </Stack>
              </Group>
            </Stack>
          ) : null}

          <Stack gap={4}>
            <Text size="xs" fw={500}>Co chceš upravit?</Text>
            <SegmentedControl
              value={editTarget}
              onChange={(value) => setEditTarget(value as 'master' | 'shop')}
              data={[
                { label: 'Master produkt', value: 'master' },
                {
                  label: targetShop ? `Shop ${targetShop.name}` : 'Shop',
                  value: 'shop',
                  disabled: selectedShopId === null,
                },
              ]}
            />
          </Stack>

          {editTarget === 'master' ? (
            <Select
              label="Master kategorie"
              placeholder="Vyber master kategorii nebo nech prázdné"
              searchable
              data={canonicalOptions}
              value={selectedMasterCategoryId}
              onChange={setSelectedMasterCategoryId}
              nothingFoundMessage={canonicalOptions.length === 0 ? 'Žádné kategorie' : 'Nenalezeno'}
              clearable
            />
          ) : (
            <Select
              label={targetShop ? `Kategorie pro ${targetShop.name}` : 'Kategorie shopu'}
              placeholder="Vyber kategorii shopu nebo nech prázdné"
              searchable
              data={shopOptions}
              value={selectedShopCategoryId}
              onChange={setSelectedShopCategoryId}
              nothingFoundMessage={shopOptions.length === 0 ? 'Žádné kategorie' : 'Nenalezeno'}
              clearable
            />
          )}

          <Text size="xs" c="dimmed">Prázdná hodnota odebere výchozí kategorii pro zvolený cíl.</Text>

          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={handleCloseEditModal} disabled={isApplyLoading}>
              Zrušit
            </Button>
            <Button onClick={handleSubmitDefaultCategory} loading={isApplyLoading}>
              Uložit změny
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={aiModalOpen}
        onClose={() => {
          if (!aiPreMap.isPending) {
            setAiModalOpen(false);
          }
        }}
        title="Předmapování pomocí AI"
        centered
        radius="lg"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Zadej případné instrukce pro AI (například kategorie, kterých se má vyhnout). Návrhy se pouze zobrazí – nic se automaticky neuloží.
          </Text>
          <Textarea
            label="Instrukce pro AI"
            placeholder="Např. ignoruj výprodejové kategorie, soustřeď se na strukturu parfémů..."
            value={aiInstructions}
            onChange={(event) => setAiInstructions(event.currentTarget.value)}
            autosize
            minRows={3}
          />
          <Checkbox
            label="Zahrnout i kategorie, které už mají ruční mapování"
            checked={aiIncludeMapped}
            onChange={(event) => setAiIncludeMapped(event.currentTarget.checked)}
          />
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setAiModalOpen(false)} disabled={aiPreMap.isPending}>
              Zrušit
            </Button>
            <Button onClick={handleAiPreMapSubmit} loading={aiPreMap.isPending}>
              Spustit AI
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  </SectionPageShell>
  );
};