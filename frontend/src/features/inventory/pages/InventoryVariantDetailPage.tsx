import {
  Anchor,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Box,
  Grid,
  Group,
  Loader,
  Menu,
  Modal,
  MultiSelect,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { AreaChart } from '@mantine/charts';
import { IconAlertCircle, IconDots, IconPencil, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { cs } from 'date-fns/locale';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useInventoryVariant, useInventoryVariantNotes } from '../hooks/useInventoryOverview';
import type {
  InventoryVariant,
  InventoryVariantNote,
  InventoryProductRecommendation,
  InventoryVariantRelatedProduct,
  InventoryVariantFilterParameter,
  InventoryVariantRelatedProductVariant,
  InventoryVariantRecommendationsResponse,
} from '../../../api/inventory';
import {
  createInventoryVariantNote,
  deleteInventoryVariantNote,
  refreshInventoryVariantMetrics,
  refreshInventoryVariantStock,
  updateInventoryVariantNote,
  forecastInventoryVariant,
  fetchInventoryVariantRecommendations,
  type InventoryVariantForecastResponse,
  type InventoryVariantForecast,
} from '../../../api/inventory';
import type { InventoryForecastProfile } from '../../../api/settings';
import { useShops } from '../../shoptet/hooks/useShops';
import { SurfaceCard } from '../../../components/layout/SurfaceCard';
import classes from './InventoryVariantDetailPage.module.css';

const statusMeta: Record<InventoryVariant['stock_status'], { label: string; color: string }> = {
  in_stock: { label: 'Skladem', color: 'teal' },
  low_stock: { label: 'Nízká zásoba', color: 'orange' },
  sold_out: { label: 'Vyprodáno', color: 'red' },
  unknown: { label: 'Neznámé', color: 'gray' },
};

const seasonalityLabels: Record<InventoryForecastProfile['seasonality'], string> = {
  none: 'Žádná / minimální sezónnost',
  moderate: 'Střídavá sezónnost',
  peaks: 'Výrazné sezónní špičky',
};

const cashflowLabels: Record<InventoryForecastProfile['cashflow_strategy'], string> = {
  conserve: 'Šetřit zásobu',
  balanced: 'Vyvážené cashflow',
  invest: 'Investovat do růstu',
};

const growthLabels: Record<InventoryForecastProfile['growth_focus'], string> = {
  stabilize: 'Stabilizovat',
  grow: 'Růst',
  expand: 'Expandovat',
};

const orderRecommendationLabels: Record<
  'order_now' | 'order_soon' | 'monitor' | 'do_not_order',
  string
> = {
  order_now: 'Objednat ihned',
  order_soon: 'Objednat brzy',
  monitor: 'Zatím sledovat',
  do_not_order: 'Dále neobjednávat',
};

const orderRecommendationColors: Record<
  'order_now' | 'order_soon' | 'monitor' | 'do_not_order',
  string
> = {
  order_now: 'red',
  order_soon: 'orange',
  monitor: 'yellow',
  do_not_order: 'gray',
};

const productHealthLabels: Record<'strong' | 'stable' | 'weak', string> = {
  strong: 'Silná poptávka',
  stable: 'Stabilní prodeje',
  weak: 'Slabá poptávka',
};

const productHealthColors: Record<'strong' | 'stable' | 'weak', string> = {
  strong: 'teal',
  stable: 'blue',
  weak: 'red',
};

const formatDisplayValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (typeof value === 'boolean') {
    return value ? 'Ano' : 'Ne';
  }

  if (typeof value === 'number') {
    return value.toLocaleString('cs-CZ');
  }

  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => formatDisplayValue(entry))
      .filter((entry) => entry !== '—');

    return entries.length > 0 ? entries.join(', ') : '—';
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const named =
      (record.displayName as string | undefined) ??
      (record.name as string | undefined) ??
      (record.value as string | undefined) ??
      (record.valueIndex as string | undefined) ??
      (record.guid as string | undefined);

    if (named) {
      return named;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
};

const formatNumber = (value: number | null | undefined, maximumFractionDigits = 0) => {
  if (value === null || value === undefined) {
    return '—';
  }

  return value.toLocaleString('cs-CZ', { maximumFractionDigits });
};

const formatPrice = (value: number | null | undefined, currency?: string | null) => {
  if (value === null || value === undefined) {
    return '—';
  }

  const formatted = value.toLocaleString('cs-CZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return currency ? `${formatted} ${currency}` : formatted;
};

const resolveProductName = (variant: InventoryVariant) => {
  const payload = variant.product?.base_payload as { name?: string } | undefined;
  if (payload?.name) {
    return payload.name as string;
  }

  return variant.product?.external_guid ?? '—';
};

const resolveShopLabel = (
  shop: { name?: string | null; domain?: string | null } | null | undefined,
  fallbackId: number
) => shop?.name ?? shop?.domain ?? `Shop #${fallbackId}`;

type RawParameter = Record<string, unknown>;

type ParameterEntry = {
  name: string;
  value: string;
  description?: string;
  priority?: number;
};

type VariantDataSource = {
  data?: Record<string, unknown> | null;
};

const normalizeParameter = (parameter: RawParameter, fallbackName: string): ParameterEntry => {
  const name =
    (parameter.displayName as string | undefined) ??
    (parameter.name as string | undefined) ??
    (parameter.paramName as string | undefined) ??
    fallbackName;

  const priority = typeof parameter.priority === 'number' ? parameter.priority : undefined;

  const valueCandidates = Array.isArray(parameter.values)
    ? (parameter.values as RawParameter[])
        .map((entry) =>
          (entry.name as string | undefined) ??
          (entry.displayName as string | undefined) ??
          (entry.value as string | undefined) ??
          (entry.valueIndex as string | undefined) ??
          null
        )
        .filter((entry): entry is string => Boolean(entry))
    : [];

  const rawValue = parameter.value ?? parameter.paramValue ?? parameter.rawValue;

  const value = valueCandidates.length
    ? valueCandidates.join(', ')
    : rawValue !== undefined && rawValue !== null
      ? formatDisplayValue(rawValue)
      : '—';

  const descriptionParts: string[] = [];
  const description = parameter.description as string | undefined;
  if (description) {
    descriptionParts.push(description);
  }

  const googleMapping = parameter.googleMapping as RawParameter | undefined;
  if (googleMapping?.value) {
    const mappingDescription = String(googleMapping.value);
    const mappingLabel = googleMapping.description ? ` (${googleMapping.description})` : '';
    descriptionParts.push(`Google: ${mappingDescription}${mappingLabel}`);
  }

  return {
    name,
    value,
    description: descriptionParts.length > 0 ? descriptionParts.join(' • ') : undefined,
    priority,
  };
};

const getVariantParameters = (variant: VariantDataSource): ParameterEntry[] => {
  const data = (variant.data ?? {}) as RawParameter;
  const candidateSets = [
    data.variantParameters,
    data.variantParameterList,
    data.parameters,
    data.parameterValues,
  ];

  const normalized: ParameterEntry[] = [];

  candidateSets.forEach((candidate) => {
    if (!candidate) {
      return;
    }

    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) => {
        if (!item || typeof item !== 'object') {
          return;
        }

        normalized.push(normalizeParameter(item as RawParameter, `Parametr ${index + 1}`));
      });
    } else if (typeof candidate === 'object') {
      Object.entries(candidate as RawParameter).forEach(([key, value]) => {
        normalized.push({ name: key, value: formatDisplayValue(value) });
      });
    }
  });

  if (normalized.length === 0) {
    const attributeCombination = data.attributeCombination as RawParameter | undefined;
    if (attributeCombination) {
      const label = attributeCombination.label ?? attributeCombination.name ?? 'Varianta';
      const value = attributeCombination.value ?? attributeCombination.displayName ?? attributeCombination.title;
      normalized.push({
        name: formatDisplayValue(label),
        value: formatDisplayValue(value),
      });
    }
  }

  return normalized;
};

const extractProductCategories = (payload: Record<string, unknown> | null | undefined) => {
  if (!payload) {
    return [] as Array<Record<string, unknown>>;
  }

  const allCategories = payload['allCategories'];
  if (Array.isArray(allCategories)) {
    return allCategories as Array<Record<string, unknown>>;
  }

  const defaultCategory = payload['defaultCategory'];
  if (defaultCategory && typeof defaultCategory === 'object') {
    return [defaultCategory as Record<string, unknown>];
  }

  return [] as Array<Record<string, unknown>>;
};

const resolveVariantCategories = (
  variant: VariantDataSource,
  fallbackCategories: Array<Record<string, unknown>> = []
) => {
  const data = (variant.data ?? {}) as Record<string, unknown>;
  const seen = new WeakSet<object>();
  const names: string[] = [];

  const pushName = (value: unknown) => {
    if (typeof value !== 'string') {
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    if (!names.includes(trimmed)) {
      names.push(trimmed);
    }
  };

  const collect = (value: unknown) => {
    if (!value) {
      return;
    }

    if (typeof value === 'string') {
      pushName(value);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => collect(entry));
      return;
    }

    if (typeof value === 'object') {
      const objectValue = value as Record<string, unknown>;

      if (seen.has(objectValue)) {
        return;
      }

      seen.add(objectValue);

      pushName(objectValue['name']);
      pushName(objectValue['title']);
      pushName(objectValue['label']);
      pushName(objectValue['displayName']);

      const nestedKeys = [
        'category',
        'categories',
        'path',
        'breadcrumb',
        'breadcrumbs',
        'parent',
        'parents',
      ];

      nestedKeys.forEach((nestedKey) => {
        if (nestedKey in objectValue) {
          collect(objectValue[nestedKey]);
        }
      });
    }
  };

  const candidateKeys = [
    'categories',
    'category',
    'categoryBreadcrumb',
    'breadcrumb',
    'breadcrumbs',
    'categoryAssignments',
    'assignedCategories',
    'categoryTree',
    'categoryPath',
    'path',
  ];

  candidateKeys.forEach((key) => {
    if (key in data) {
      collect(data[key]);
    }
  });

  if (names.length === 0) {
    fallbackCategories.forEach((category) => {
      const fallbackName =
        (typeof category['name'] === 'string' ? (category['name'] as string) : undefined) ??
        (typeof category['title'] === 'string' ? (category['title'] as string) : undefined) ??
        (typeof category['label'] === 'string' ? (category['label'] as string) : undefined);

      if (fallbackName) {
        pushName(fallbackName);
      }
    });
  }

  return names;
};

const resolveVariantAvailability = (variant: VariantDataSource): string => {
  const data = (variant.data ?? {}) as Record<string, unknown>;
  const availability = (data.availability as { name?: string } | undefined)?.name;
  const fallback = (data.availabilityWhenSoldOut as { name?: string } | undefined)?.name;

  return availability ?? fallback ?? '—';
};

type VariantNoteCardProps = {
  note: InventoryVariantNote;
  onUpdate: (noteId: number, content: string) => Promise<boolean>;
  onDelete: (noteId: number) => Promise<boolean>;
  updating: boolean;
  deleting: boolean;
};

const VariantNoteCard = ({ note, onUpdate, onDelete, updating, deleting }: VariantNoteCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(note.note);

  useEffect(() => {
    if (!isEditing) {
      setValue(note.note);
    }
  }, [note.note, isEditing]);

  const userLabel = note.user?.name ?? note.user?.email ?? 'Neznámý uživatel';

  const createdRelative = useMemo(() => {
    try {
      return formatDistanceToNow(parseISO(note.created_at), { locale: cs, addSuffix: true });
    } catch {
      return null;
    }
  }, [note.created_at]);

  const updatedRelative = useMemo(() => {
    if (!note.updated_at || note.updated_at === note.created_at) {
      return null;
    }

    try {
      return formatDistanceToNow(parseISO(note.updated_at), { locale: cs, addSuffix: true });
    } catch {
      return null;
    }
  }, [note.updated_at, note.created_at]);

  const menuDisabled = updating || deleting || isEditing;

  const handleEditClick = () => {
    setIsEditing(true);
    setValue(note.note);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setValue(note.note);
  };

  const handleSave = async () => {
    const success = await onUpdate(note.id, value);
    if (success) {
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    const success = await onDelete(note.id);
    if (success) {
      setIsEditing(false);
    }
  };

  return (
    <SurfaceCard>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Text fw={600}>{userLabel ?? '—'}</Text>
            <Text size="xs" c="dimmed">
              Přidáno: {createdRelative ?? 'neznámý čas'}
              {updatedRelative ? ` • Upraveno: ${updatedRelative}` : ''}
            </Text>
          </Stack>
          <Menu position="bottom-end" shadow="md" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" disabled={menuDisabled} aria-label="Akce s poznámkou">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconPencil size={14} />} onClick={handleEditClick} disabled={isEditing}>
                Upravit
              </Menu.Item>
              <Menu.Item leftSection={<IconTrash size={14} />} color="red" onClick={handleDelete} disabled={deleting}>
                Smazat
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>

        {isEditing ? (
          <Stack gap="sm">
            <Textarea
              value={value}
              onChange={(event) => setValue(event.currentTarget.value)}
              autosize
              minRows={3}
              maxLength={4000}
              disabled={updating}
            />
            <Group justify="flex-end" gap="sm">
              <Button variant="subtle" color="gray" onClick={handleCancelEdit} disabled={updating}>
                Zrušit
              </Button>
              <Button onClick={handleSave} loading={updating}>
                Uložit
              </Button>
            </Group>
          </Stack>
        ) : (
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {note.note}
          </Text>
        )}
      </Stack>
    </SurfaceCard>
  );
};

export const InventoryVariantDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [forecastModalOpened, setForecastModalOpened] = useState(false);
  const [forecastContext, setForecastContext] = useState('');
  const [forecastResult, setForecastResult] = useState<
    InventoryVariantForecast | InventoryVariantForecastResponse | null
  >(null);

  const normalizedShopIds = useMemo(() => [...selectedShopIds].sort(), [selectedShopIds]);

  const variantParams = useMemo(() => {
    const payload: Record<string, unknown> = {};

    if (normalizedShopIds.length > 0) {
      payload.shop_id = normalizedShopIds;
    }

    if (compareMode) {
      payload.compare = true;
    }

    return payload;
  }, [normalizedShopIds, compareMode]);

  const { data: shopsResponse } = useShops({ per_page: 200 });

  const shopOptions = useMemo(() => {
    const list = shopsResponse?.data ?? [];
    return list.map((shop) => ({
      value: String(shop.id),
      label: shop.name ?? shop.domain ?? `Shop #${shop.id}`,
    }));
  }, [shopsResponse?.data]);

  const shopLabelMap = useMemo(() => {
    const map = new Map<number, string>();
    (shopsResponse?.data ?? []).forEach((shop) => {
      map.set(shop.id, shop.name ?? shop.domain ?? `Shop #${shop.id}`);
    });
    return map;
  }, [shopsResponse?.data]);

  const { data, isLoading, isError } = useInventoryVariant(id, variantParams);
  const {
    data: notesData,
    isLoading: areNotesLoading,
    isError: notesError,
  } = useInventoryVariantNotes(id);
  const notes = notesData ?? [];
  const [newNote, setNewNote] = useState('');
  const [expandedDescriptorGroups, setExpandedDescriptorGroups] = useState<Record<'inspired' | 'similar', boolean>>({
    inspired: false,
    similar: false,
  });
  const [expandedFilterValues, setExpandedFilterValues] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notesQueryKey = ['inventory', 'variant', id, 'notes'] as const;
  const recommendationQueryKey = ['inventory', 'variant', id, 'recommendations'] as const;

  const {
    data: recommendationResponse,
    isLoading: recommendationsLoading,
    isError: recommendationsError,
    refetch: refetchRecommendations,
  } = useQuery<InventoryVariantRecommendationsResponse>({
    queryKey: recommendationQueryKey,
    queryFn: () => fetchInventoryVariantRecommendations(id!, { limit: 10 }),
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    setForecastResult(null);
    setForecastContext('');
  }, [id]);

  useEffect(() => {
    setExpandedDescriptorGroups({ inspired: false, similar: false });
    setExpandedFilterValues({});
  }, [id]);

  const createNoteMutation = useMutation({
    mutationFn: (payload: { note: string }) => createInventoryVariantNote(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesQueryKey });
      setNewNote('');
      notifications.show({ message: 'Poznámka byla přidána', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Uložení poznámky selhalo', color: 'red' });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ noteId, note }: { noteId: number; note: string }) =>
      updateInventoryVariantNote(noteId, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesQueryKey });
      notifications.show({ message: 'Poznámka byla upravena', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Úprava poznámky selhala', color: 'red' });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: number) => deleteInventoryVariantNote(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesQueryKey });
      notifications.show({ message: 'Poznámka byla odstraněna', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Smazání poznámky selhalo', color: 'red' });
    },
  });

  const refreshStockMutation = useMutation({
    mutationFn: async () => {
      await queryClient.cancelQueries({ queryKey: ['inventory', 'variant', id, variantParams] });
      return refreshInventoryVariantStock(id!, variantParams);
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(['inventory', 'variant', id, variantParams], detail);
      queryClient.invalidateQueries({ queryKey: ['inventory', 'variants'] });
    },
    onError: () => {
      hasRefreshedStock.current = false;
      notifications.show({
        message: 'Načtení aktuální skladové zásoby selhalo',
        color: 'red',
      });
    },
  });

  const hasRefreshedStock = useRef(false);

  useEffect(() => {
    hasRefreshedStock.current = false;
  }, [id, variantParams]);

  useEffect(() => {
    if (!id || isLoading || hasRefreshedStock.current) {
      return;
    }

    hasRefreshedStock.current = true;
    refreshStockMutation.mutate();
  }, [id, isLoading, variantParams, refreshStockMutation]);

  const refreshMetricsMutation = useMutation({
    mutationFn: () => refreshInventoryVariantMetrics(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'variant', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'variants'] });
      notifications.show({ message: 'Statistiky byly aktualizovány', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Aktualizace statistik selhala', color: 'red' });
    },
  });

  const forecastMutation = useMutation({
    mutationFn: ({ context }: { context: string | null }) =>
      forecastInventoryVariant(id!, {
        context: context ?? undefined,
        shop_ids: normalizedShopIds,
      }),
    onSuccess: (data) => {
      setForecastResult(data);
      setForecastModalOpened(false);
      setForecastContext('');
      notifications.show({
        title: 'AI odhad hotový',
        message: 'Odhad výdrže zásob byl spočítán.',
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'variant', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'variants'] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'AI odhad se nepodařilo získat. Zkus to prosím znovu.';
      notifications.show({
        title: 'Chyba při odhadu',
        message,
        color: 'red',
      });
    },
  });

  const latestForecast = data?.latest_forecast ?? null;

  useEffect(() => {
    if (latestForecast) {
      setForecastResult(latestForecast);
    } else if (!forecastMutation.isPending) {
      setForecastResult(null);
    }
  }, [latestForecast, forecastMutation.isPending]);

  const handleCreateNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!id) {
      return;
    }

    const trimmed = newNote.trim();

    if (trimmed.length === 0) {
      notifications.show({ message: 'Poznámka nesmí být prázdná', color: 'red' });
      return;
    }

    if (trimmed.length > 4000) {
      notifications.show({ message: 'Poznámka je příliš dlouhá (max. 4000 znaků)', color: 'red' });
      return;
    }

    try {
      await createNoteMutation.mutateAsync({ note: trimmed });
    } catch {
      // Notification is handled in onError
    }
  };

  const handleUpdateNote = async (noteId: number, content: string) => {
    const trimmed = content.trim();

    if (trimmed.length === 0) {
      notifications.show({ message: 'Poznámka nesmí být prázdná', color: 'red' });
      return false;
    }

    if (trimmed.length > 4000) {
      notifications.show({ message: 'Poznámka je příliš dlouhá (max. 4000 znaků)', color: 'red' });
      return false;
    }

    try {
      await updateNoteMutation.mutateAsync({ noteId, note: trimmed });
      return true;
    } catch {
      return false;
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    const confirmed = window.confirm('Opravdu chcete smazat tuto poznámku?');

    if (!confirmed) {
      return false;
    }

    try {
      await deleteNoteMutation.mutateAsync(noteId);
      return true;
    } catch {
      return false;
    }
  };

  if (isLoading) {
    return <Loader />;
  }

  if (isError || !data) {
    return (
      <Alert
        color="red"
        title="Variant nebyla nalezena"
        icon={<IconAlertCircle size={16} />}
      >
        Zkuste se vrátit na přehled inventáře.
      </Alert>
    );
  }

  const { variant, sales } = data;
  const status = statusMeta[variant.stock_status];

  const salesSummaries = sales.summaries;
  const appliedShopIds = (sales.applied_shop_ids ?? []).map((id) => Number(id));
  const appliedShopsLabel =
    appliedShopIds.length === 0
      ? 'Všechny shopy'
      : appliedShopIds
          .map((shopId) => shopLabelMap.get(shopId) ?? `Shop #${shopId}`)
          .join(', ');
  const perShopSales = sales.per_shop ?? [];
  const metricsCurrency = sales.currency_code ?? variant.metrics_currency_code ?? variant.currency_code;
  const priceCurrency = variant.pricing?.currency_code ?? metricsCurrency ?? variant.currency_code;
  const basePrice = variant.pricing?.base_price ?? variant.price;
  const effectivePrice = variant.pricing?.effective_price ?? basePrice;
  const actionPriceActive =
    Boolean(variant.pricing?.is_action_price_active) && variant.pricing?.action_price !== null;
  const actionPriceValue = actionPriceActive ? variant.pricing?.action_price ?? null : null;
  const displayPrice =
    actionPriceActive && actionPriceValue !== null ? actionPriceValue : effectivePrice ?? basePrice;

  const runwayLabel = sales.stock_runway_days
    ? `${Math.max(sales.stock_runway_days, 0).toFixed(1)} dnů`
    : '—';

  const lastSaleRelative = sales.last_sale_at
    ? formatDistanceToNow(parseISO(sales.last_sale_at), { locale: cs, addSuffix: true })
    : null;

  const metricsUpdatedRelative = variant.metrics_updated_at
    ? formatDistanceToNow(parseISO(variant.metrics_updated_at), { locale: cs, addSuffix: true })
    : null;

  const siblings = variant.product?.variants ?? [];
  const productCategories = extractProductCategories(
    (variant.product?.base_payload as Record<string, unknown> | null | undefined) ?? null
  );
  const inspiredDescriptors = variant.related_descriptors?.inspired ?? [];
  const similarDescriptors = variant.related_descriptors?.similar ?? [];
  const relatedProducts = (variant.related_products ?? []) as InventoryVariantRelatedProduct[];
  const filterParameters = (variant.filter_parameters ?? []) as Array<
    InventoryVariantFilterParameter & { slug?: string }
  >;
  const relatedRecommendations = recommendationResponse?.related ?? [];
  const recommendedProducts = recommendationResponse?.recommended ?? [];
  const legacyRecommendations = recommendationResponse?.recommendations ?? [];
  const hasShoptetContext =
    inspiredDescriptors.length > 0 ||
    similarDescriptors.length > 0 ||
    relatedProducts.length > 0 ||
    filterParameters.length > 0;

  const toggleDescriptorGroup = (group: 'inspired' | 'similar') => {
    setExpandedDescriptorGroups((current) => ({ ...current, [group]: !current[group] }));
  };

  const toggleFilterValues = (slug: string) => {
    setExpandedFilterValues((current) => ({ ...current, [slug]: !current[slug] }));
  };

  const updatingNoteId =
    updateNoteMutation.isPending && updateNoteMutation.variables
      ? updateNoteMutation.variables.noteId
      : null;

  const deletingNoteId =
    deleteNoteMutation.isPending && deleteNoteMutation.variables !== undefined
      ? deleteNoteMutation.variables
      : null;

  const forecastProfile = forecastResult?.business_profile;
  const forecastCreatedRelative = forecastResult?.created_at
    ? formatDistanceToNow(parseISO(forecastResult.created_at), { locale: cs, addSuffix: true })
    : null;
  const topMarkets = forecastResult?.top_markets ?? [];
  const forecastRecommendations = forecastResult?.recommendations ?? [];
  const forecastAssumptions = forecastResult?.assumptions ?? [];
  const forecastPricingAdvice = forecastResult?.pricing_advice ?? null;
  const forecastRestockAdvice = forecastResult?.restock_advice ?? null;
  const reorderDeadlineDays = forecastResult?.reorder_deadline_days ?? null;
  const recommendedOrderQuantity = forecastResult?.recommended_order_quantity ?? null;
  const orderRecommendation = forecastResult?.order_recommendation ?? 'monitor';
  const orderRecommendationLabel = orderRecommendationLabels[orderRecommendation];
  const orderRecommendationColor = orderRecommendationColors[orderRecommendation];
  const orderRationale = forecastResult?.order_rationale ?? null;
  const seasonalitySummary = forecastResult?.seasonality_summary ?? null;
  const seasonalityBestPeriod = forecastResult?.seasonality_best_period ?? null;
  const productHealth = forecastResult?.product_health ?? null;
  const productHealthLabel = productHealth ? productHealthLabels[productHealth] : null;
  const productHealthColor = productHealth ? productHealthColors[productHealth] : 'gray';
  const productHealthReason = forecastResult?.product_health_reason ?? null;

  const reorderDeadlineLabel = reorderDeadlineDays !== null
    ? reorderDeadlineDays <= 0
      ? 'Objednávku je vhodné zadat okamžitě.'
      : `Objednávku naplánuj do ${reorderDeadlineDays.toFixed(1)} dne.`
    : 'AI neodhadla konkrétní termín objednávky.';

  const recommendedOrderQuantityLabel = recommendedOrderQuantity !== null
    ? `${formatNumber(recommendedOrderQuantity, 0)} ks`
    : '—';
  const formatMarketShare = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '—';
    }

    if (value <= 1) {
      return `${(value * 100).toFixed(1)} %`;
    }

    return `${value.toFixed(1)} %`;
  };

  return (
    <>
      <Modal
        opened={forecastModalOpened}
        onClose={() => {
          if (!forecastMutation.isPending) {
            setForecastModalOpened(false);
          }
        }}
        title="AI odhad výdrže zásob"
        centered
        size="lg"
      >
        <Stack gap="sm">
          <Text size="sm">
            Přidej kontext, který má AI při odhadu zohlednit (volitelné). Může jít o kampaně, problémy v dodavatelském
            řetězci nebo jiné výkyvy poptávky.
          </Text>
          <Textarea
            minRows={4}
            maxLength={1000}
            value={forecastContext}
            onChange={(event) => setForecastContext(event.currentTarget.value)}
            placeholder="Např. plánujeme listopadovou slevovou akci, dodavatel hlásí delší výrobu, nově vstupujeme na marketplace..."
          />
          <Text size="xs" c="dimmed">
            Zpráva se odešle spolu se statistikami varianty a obchodním profilem. Citlivé údaje případně anonymizuj.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button
              variant="subtle"
              color="gray"
              onClick={() => setForecastModalOpened(false)}
              disabled={forecastMutation.isPending}
            >
              Zavřít
            </Button>
            <Button
              onClick={() =>
                forecastMutation.mutate({
                  context: forecastContext.trim() === '' ? null : forecastContext.trim(),
                })
              }
              loading={forecastMutation.isPending}
            >
              Získat odhad
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Stack className={classes.page} gap="xl">
        <SurfaceCard className={classes.heroCard}>
          <div className={classes.heroContent}>
            <div className={classes.heroPrimary}>
              <Title order={1} className={classes.heroTitle}>
                {variant.name ?? 'Varianta'}
              </Title>
              <Group gap="xs" className={classes.badgeRow}>
                <Badge color={status.color} radius="xl" size="md">
                  {status.label}
                </Badge>
                <Badge variant="outline" radius="xl" size="md">
                  Kód: {variant.code}
                </Badge>
                {variant.brand && (
                  <Badge variant="outline" radius="xl" size="md">
                    Značka: {variant.brand}
                  </Badge>
                )}
                {variant.supplier && (
                  <Badge variant="outline" radius="xl" size="md">
                    Dodavatel: {variant.supplier}
                  </Badge>
                )}
              </Group>
              <div className={classes.meta}>
                <span>Produkt: {resolveProductName(variant)}</span>
                {variant.product?.sku && <span>SKU produktu: {variant.product.sku}</span>}
                <span>Poslední prodej: {lastSaleRelative ?? '—'}</span>
              </div>
            </div>
            <div className={classes.heroSecondary}>
              <Group gap="sm" className={classes.heroActions}>
                <Button
                  variant="light"
                  size="sm"
                  loading={refreshMetricsMutation.isPending}
                  onClick={() => refreshMetricsMutation.mutate()}
                >
                  Aktualizovat statistiky
                </Button>
                <Button size="sm" onClick={() => setForecastModalOpened(true)} loading={forecastMutation.isPending}>
                  AI odhad výdrže
                </Button>
              </Group>
              <Text className={classes.heroNote}>
                Statistiky aktualizovány: {metricsUpdatedRelative ?? '—'}
              </Text>
              {lastSaleRelative && (
                <Text className={classes.heroNote}>Poslední prodej: {lastSaleRelative}</Text>
              )}
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Title order={4}>Doporučené produkty</Title>
                <Text size="sm" c="dimmed">
                  Seznam je předpočítaný pro celý produkt (společný pro všechny varianty) a aktualizuje se každý den
                  ve 2:00.
                </Text>
              </Stack>
              <Button
                variant="light"
                size="xs"
                leftSection={<IconRefresh size={14} />}
                onClick={() => refetchRecommendations()}
                loading={recommendationsLoading}
              >
                Načíst znovu
              </Button>
            </Group>

            {recommendationsLoading ? (
              <Group justify="center">
                <Loader size="sm" />
              </Group>
            ) : recommendationsError ? (
              <Alert color="red" icon={<IconAlertCircle size={16} />} title="Doporučení nedostupná">
                Zkus to prosím znovu později.
              </Alert>
            ) : relatedRecommendations.length === 0 && recommendedProducts.length === 0 && legacyRecommendations.length === 0 ? (
              <Text size="sm" c="dimmed">
                Pro tento produkt zatím nemáme dostatek dat k doporučení dalších položek.
              </Text>
            ) : relatedRecommendations.length === 0 && recommendedProducts.length === 0 && legacyRecommendations.length > 0 ? (
              <Table withRowBorders={false} striped verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={80}>Skóre</Table.Th>
                    <Table.Th>Varianta</Table.Th>
                    <Table.Th w={110}>Sklad</Table.Th>
                    <Table.Th w={120}>Cena</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {legacyRecommendations.map((item: any, index: number) => {
                    const candidate = item.variant;
                    const candidateCurrency = candidate?.currency_code ?? variant.currency_code;
                    const name = candidate?.name ?? candidate?.code ?? 'Varianta';

                    return (
                      <Table.Tr key={`${candidate?.id ?? index}`}>
                        <Table.Td>
                          <Text fw={600}>{item.score !== null && item.score !== undefined ? formatNumber(item.score, 1) : '—'}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Stack gap={2}>
                            {candidate?.id ? (
                              <Anchor component={Link} to={`/inventory/variants/${candidate.id}`} fw={600}>
                                {name}
                              </Anchor>
                            ) : (
                              <Text fw={600}>{name}</Text>
                            )}
                            {(candidate?.code || candidate?.brand) && (
                              <Group gap="xs">
                                {candidate?.code && (
                                  <Badge variant="outline" size="xs">
                                    {candidate.code}
                                  </Badge>
                                )}
                                {candidate?.brand && (
                                  <Badge variant="outline" size="xs">
                                    {candidate.brand}
                                  </Badge>
                                )}
                              </Group>
                            )}
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Stack gap={2}>
                            <Text>{candidate?.stock ?? '—'}</Text>
                            {candidate?.min_stock_supply !== null && candidate?.min_stock_supply !== undefined && (
                              <Text size="xs" c="dimmed">
                                Min. {candidate.min_stock_supply}
                              </Text>
                            )}
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Text>{formatPrice(candidate?.price ?? null, candidateCurrency)}</Text>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            ) : (
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                {[
                  {
                    title: 'Související produkty (inspirováno)',
                    items: relatedRecommendations,
                    empty: 'Zatím jsme nenašli jiné produkty se stejnou inspirací.',
                  },
                  {
                    title: 'Doporučené produkty',
                    items: recommendedProducts,
                    empty: 'Pro tuto značku a parametry zatím nemáme doporučení.',
                  },
                ].map(({ title, items, empty }) => (
                  <Stack key={title} gap="sm">
                    <Group justify="space-between">
                      <Text fw={600}>{title}</Text>
                      <Badge variant="light" color="gray" size="sm">
                        {items.length ? `${items.length} položek` : 'Žádná data'}
                      </Badge>
                    </Group>
                    {items.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        {empty}
                      </Text>
                    ) : (
                      <Table withRowBorders={false} striped verticalSpacing="sm">
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th w={80}>Skóre</Table.Th>
                            <Table.Th>Produkt</Table.Th>
                            <Table.Th w={110}>Sklad</Table.Th>
                            <Table.Th w={120}>Cena</Table.Th>
                            <Table.Th>Shody</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {items.map((item: InventoryProductRecommendation, index) => {
                            const candidate = item.variant;
                            const productLabel =
                              candidate?.name ??
                              candidate?.code ??
                              item.product.name ??
                              item.product.external_guid ??
                              'Produkt';
                            const candidateCurrency = candidate?.currency_code ?? variant.currency_code;
                            const inspirationMatches = item.matches?.inspiration ?? [];
                            const dominantMatches = item.matches?.dominant_ingredients ?? [];
                            const fragranceMatches = item.matches?.fragrance_types ?? [];
                            const seasonMatches = item.matches?.seasons ?? [];
                            const brandMatch = item.matches?.brand ?? candidate?.brand ?? null;

                            const matchBadges: ReactElement[] = [];

                            if (inspirationMatches.length > 0) {
                              const label = inspirationMatches.slice(0, 2).join(', ');
                              const extra = inspirationMatches.length > 2 ? ` +${inspirationMatches.length - 2}` : '';
                              matchBadges.push(
                                <Badge key={`insp-${index}`} variant="light" color="grape" size="sm">
                                  Inspirováno: {label}
                                  {extra}
                                </Badge>
                              );
                            }

                            if (brandMatch) {
                              matchBadges.push(
                                <Badge key={`brand-${index}`} variant="light" color="gray" size="sm">
                                  Značka: {brandMatch}
                                </Badge>
                              );
                            }

                            if (dominantMatches.length > 0) {
                              matchBadges.push(
                                <Badge key={`dom-${index}`} variant="light" color="teal" size="sm">
                                  Dominantní: {dominantMatches.join(', ')}
                                </Badge>
                              );
                            }

                            if (fragranceMatches.length > 0) {
                              matchBadges.push(
                                <Badge key={`frag-${index}`} variant="light" color="blue" size="sm">
                                  Druh vůně: {fragranceMatches.join(', ')}
                                </Badge>
                              );
                            }

                            if (seasonMatches.length > 0) {
                              matchBadges.push(
                                <Badge key={`season-${index}`} variant="light" color="orange" size="sm">
                                  Sezóna: {seasonMatches.join(', ')}
                                </Badge>
                              );
                            }

                            return (
                              <Table.Tr key={`${item.id}-${index}`}>
                                <Table.Td>
                                  <Text fw={600}>{item.score !== null ? formatNumber(item.score, 1) : '—'}</Text>
                                  <Text size="xs" c="dimmed">
                                    Pozice {item.position + 1}
                                  </Text>
                                </Table.Td>
                                <Table.Td>
                                  <Stack gap={2}>
                                    {candidate?.id ? (
                                      <Anchor component={Link} to={`/inventory/variants/${candidate.id}`} fw={600}>
                                        {productLabel}
                                      </Anchor>
                                    ) : (
                                      <Text fw={600}>{productLabel}</Text>
                                    )}
                                    {(candidate?.code || candidate?.brand) && (
                                      <Group gap="xs">
                                        {candidate?.code && (
                                          <Badge variant="outline" size="xs">
                                            {candidate.code}
                                          </Badge>
                                        )}
                                        {candidate?.brand && (
                                          <Badge variant="outline" size="xs">
                                            {candidate.brand}
                                          </Badge>
                                        )}
                                      </Group>
                                    )}
                                  </Stack>
                                </Table.Td>
                                <Table.Td>
                                  <Stack gap={2}>
                                    <Text>{candidate?.stock ?? '—'}</Text>
                                    {candidate?.min_stock_supply !== null &&
                                      candidate?.min_stock_supply !== undefined && (
                                        <Text size="xs" c="dimmed">
                                          Min. {candidate.min_stock_supply}
                                        </Text>
                                      )}
                                  </Stack>
                                </Table.Td>
                                <Table.Td>
                                  <Text>{formatPrice(candidate?.price ?? null, candidateCurrency)}</Text>
                                </Table.Td>
                                <Table.Td>
                                  <Group gap="xs" wrap="wrap" align="flex-start">
                                    {matchBadges.length > 0 ? (
                                      matchBadges
                                    ) : (
                                      <Text size="sm" c="dimmed">
                                        Žádné shody
                                      </Text>
                                    )}
                                  </Group>
                                </Table.Td>
                              </Table.Tr>
                            );
                          })}
                        </Table.Tbody>
                      </Table>
                    )}
                  </Stack>
                ))}
              </SimpleGrid>
            )}
          </Stack>
        </SurfaceCard>

        {hasShoptetContext && (
          <SurfaceCard>
            <Stack gap="lg">
              <Group justify="space-between" align="flex-start">
                <Stack gap={4}>
                  <Title order={4}>Provázané produkty ze Shoptetu</Title>
                  <Text size="sm" c="dimmed">
                    Přehled polí „Inspirováno“, „Podobné“ a filtračních parametrů, které využíváme pro doporučení.
                  </Text>
                </Stack>
                <Button variant="light" size="xs" component={Link} to="/settings/inventory-recommendations">
                  Upravit váhy
                </Button>
              </Group>

              <Grid gutter="lg">
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Stack gap="sm">
                    <Text fw={600} size="sm">
                      Popisné parametry
                    </Text>
                    {inspiredDescriptors.length === 0 && similarDescriptors.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        Tento produkt zatím nemá vyplněná pole „Inspirováno“ ani „Podobné“.
                      </Text>
                    ) : (
                      (['inspired', 'similar'] as const).map((groupKey) => {
                        const label = groupKey === 'inspired' ? 'Inspirováno' : 'Podobné';
                        const items = groupKey === 'inspired' ? inspiredDescriptors : similarDescriptors;

                        if (items.length === 0) {
                          return null;
                        }

                        const isExpanded = expandedDescriptorGroups[groupKey] ?? false;
                        const limit = 6;
                        const visibleItems = isExpanded ? items : items.slice(0, limit);
                        const hiddenCount = Math.max(items.length - visibleItems.length, 0);

                        return (
                          <Stack key={groupKey} gap={6}>
                            <Group justify="space-between">
                              <Text fw={600}>{label}</Text>
                              {hiddenCount > 0 && (
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={() => toggleDescriptorGroup(groupKey)}
                                >
                                  {isExpanded ? 'Skrýt' : `Zobrazit dalších ${hiddenCount}`}
                                </Button>
                              )}
                            </Group>
                            <Group gap="xs">
                              {visibleItems.map((item, index) => (
                                <Tooltip
                                  key={`${item.value}-${index}`}
                                  withinPortal
                                  label={
                                    <Stack gap={4}>
                                      <Text fw={600} size="sm">
                                        {item.value}
                                      </Text>
                                      {item.priority !== null && <Text size="xs">Priorita {item.priority}</Text>}
                                      {item.description && <Text size="xs">{item.description}</Text>}
                                    </Stack>
                                  }
                                >
                                  <Badge variant="light" size="sm">
                                    {item.value}
                                    {item.priority !== null ? ` · P${item.priority}` : ''}
                                  </Badge>
                                </Tooltip>
                              ))}
                            </Group>
                          </Stack>
                        );
                      })
                    )}
                  </Stack>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 6 }}>
                  <Stack gap="sm">
                    <Text fw={600} size="sm">
                      Filtrační parametry
                    </Text>
                    {filterParameters.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        Z Shoptetu zatím nemáme načtené žádné filtrační parametry.
                      </Text>
                    ) : (
                      filterParameters.map((param) => {
                        const slug = param.slug ?? param.name;
                        const isExpanded = expandedFilterValues[slug] ?? false;
                        const limit = 6;
                        const visibleValues = isExpanded ? param.values : param.values.slice(0, limit);
                        const hiddenCount = Math.max(param.values.length - visibleValues.length, 0);

                        return (
                          <Stack key={slug} gap={4} className={classes.filterParameterCard}>
                            <Group justify="space-between" align="flex-start">
                              <Stack gap={2}>
                                <Text fw={600}>{param.name}</Text>
                                <Text size="xs" c="dimmed">
                                  Slug: {slug}
                                </Text>
                              </Stack>
                              {param.priority !== null && (
                                <Badge size="sm" variant="light">
                                  Priorita {param.priority}
                                </Badge>
                              )}
                            </Group>
                            {param.description && (
                              <Text size="sm" c="dimmed">
                                {param.description}
                              </Text>
                            )}
                            <Group gap="xs" wrap="wrap">
                              {visibleValues.map((value, valueIndex) => (
                                <Badge key={`${slug}-${valueIndex}`} variant="outline" size="sm">
                                  {value}
                                </Badge>
                              ))}
                              {hiddenCount > 0 && (
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={() => toggleFilterValues(slug)}
                                >
                                  {isExpanded ? 'Skrýt' : `+${hiddenCount}`}
                                </Button>
                              )}
                            </Group>
                          </Stack>
                        );
                      })
                    )}
                  </Stack>
                </Grid.Col>
              </Grid>

              {relatedProducts.length > 0 && (
                <Stack gap="sm">
                  <Text fw={600} size="sm">
                    Propojené produkty
                  </Text>
                  <Table highlightOnHover withRowBorders={false} verticalSpacing="sm">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Produkt</Table.Th>
                        <Table.Th w={130}>Typ vazby</Table.Th>
                        <Table.Th w={130}>Viditelnost</Table.Th>
                        <Table.Th w={90}>Priorita</Table.Th>
                        <Table.Th w={220}>Varianty</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {relatedProducts.map((link, index) => {
                        const relatedProduct = link.product;
                        const variants = (relatedProduct?.variants ?? []) as InventoryVariantRelatedProductVariant[];
                        const variantsToShow = variants.slice(0, 3);

                        return (
                          <Table.Tr key={`${link.guid}-${index}`}>
                            <Table.Td>
                              <Stack gap={2}>
                                <Text fw={500}>{relatedProduct?.name ?? 'Neznámý produkt'}</Text>
                                <Group gap="xs">
                                  {relatedProduct?.sku && (
                                    <Badge size="xs" variant="outline" radius="xl">
                                      SKU: {relatedProduct.sku}
                                    </Badge>
                                  )}
                                  <Badge size="xs" variant="outline" radius="xl" color="gray">
                                    GUID: {link.guid}
                                  </Badge>
                                </Group>
                                {relatedProduct?.status && (
                                  <Text size="xs" c="dimmed">
                                    Stav produktu: {relatedProduct.status}
                                  </Text>
                                )}
                              </Stack>
                            </Table.Td>
                            <Table.Td>
                              <Badge size="sm" variant="light">
                                {link.link_type ?? '—'}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Badge
                                size="sm"
                                variant="light"
                                color={link.visibility === 'blocked' ? 'red' : 'teal'}
                              >
                                {link.visibility ?? '—'}
                              </Badge>
                            </Table.Td>
                            <Table.Td>{link.priority ?? '—'}</Table.Td>
                            <Table.Td>
                              {variantsToShow.length > 0 ? (
                                <Stack gap={2} align="flex-start">
                                  {variantsToShow.map((variantItem: InventoryVariantRelatedProductVariant) => {
                                    const variantLabel =
                                      variantItem.code && variantItem.name && variantItem.name !== variantItem.code
                                        ? `${variantItem.code} (${variantItem.name})`
                                        : variantItem.code ?? variantItem.name ?? 'Varianta';

                                    return (
                                      <Anchor
                                        key={variantItem.id}
                                        component={Link}
                                        to={`/inventory/variants/${variantItem.id}`}
                                        size="sm"
                                      >
                                        {variantLabel}
                                      </Anchor>
                                    );
                                  })}
                                  {variants.length > variantsToShow.length && (
                                    <Text size="xs" c="dimmed">
                                      +{variants.length - variantsToShow.length} dalších variant
                                    </Text>
                                  )}
                                </Stack>
                              ) : (
                                <Text size="sm" c="dimmed">
                                  Varianty nejsou k dispozici
                                </Text>
                              )}
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </Stack>
              )}
            </Stack>
          </SurfaceCard>
        )}

        <SurfaceCard>
          <Stack gap="sm">
            <Group align="flex-end" justify="space-between" wrap="wrap">
              <Stack gap={4} w="100%" maw={500}>
                <MultiSelect
                  label="Shopy"
                  data={shopOptions}
                  value={selectedShopIds}
                  onChange={(value) => setSelectedShopIds(value)}
                  placeholder="Všechny shopy"
                  searchable
                  clearable
                  nothingFoundMessage="Žádné shopy"
                />
              </Stack>
              <Stack gap={4} align="flex-end">
                <Switch
                  label="Porovnat podle shopů"
                  checked={compareMode}
                  onChange={(event) => setCompareMode(event.currentTarget.checked)}
                  disabled={shopOptions.length === 0}
                />
                <Text size="xs" c="dimmed">
                  Zapnutím zobrazíte grafy a statistiky za jednotlivé shopy.
                </Text>
              </Stack>
            </Group>
            <Text size="sm" c="dimmed">
              Filtrované shopy: {appliedShopsLabel}
            </Text>
          </Stack>
        </SurfaceCard>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md" className={classes.metricGrid}>
          <SurfaceCard className={classes.metricCard}>
            <Text className={classes.metricLabel}>Prodáno (30 dní)</Text>
            <Text className={classes.metricValue} component="div">
              {formatNumber(salesSummaries.last_30_days.quantity, 2)} ks
            </Text>
            <Text size="xs" c="dimmed">
              Objednávek: {salesSummaries.last_30_days.orders_count.toLocaleString('cs-CZ')}
            </Text>
          </SurfaceCard>
          <SurfaceCard className={classes.metricCard}>
            <Text className={classes.metricLabel}>Prodáno (90 dní)</Text>
            <Text className={classes.metricValue} component="div">
              {formatNumber(salesSummaries.last_90_days.quantity, 2)} ks
            </Text>
            <Text size="xs" c="dimmed">
              Objednávek: {salesSummaries.last_90_days.orders_count.toLocaleString('cs-CZ')}
            </Text>
          </SurfaceCard>
          <SurfaceCard className={classes.metricCard}>
            <Text className={classes.metricLabel}>Obrat (lifetime)</Text>
            <Text className={classes.metricValue} component="div">
              {formatPrice(salesSummaries.lifetime.revenue, metricsCurrency)}
            </Text>
          </SurfaceCard>
          <SurfaceCard className={classes.metricCard}>
            <Text className={classes.metricLabel}>Běžná denní poptávka</Text>
            <Text className={classes.metricValue} component="div">
              {sales.average_daily_sales ? `${sales.average_daily_sales.toFixed(2)} ks/den` : '—'}
            </Text>
            <Text size="xs" c="dimmed">
              Výdrž zásoby: {runwayLabel}
            </Text>
          </SurfaceCard>
        </SimpleGrid>

      {forecastResult && (
        <SurfaceCard>
          <Stack gap="sm" className={classes.forecastList}>
            <Group justify="space-between" align="center">
              <Title order={4}>AI odhad výdrže zásoby</Title>
              <Group gap={8} align="center">
                {forecastResult.runway_days !== null && (
                  <Badge variant="outline" radius="xl" size="sm">
                    Odhad: {forecastResult.runway_days.toFixed(1)} dnů
                  </Badge>
                )}
                <Badge
                  color={
                    forecastResult.confidence === 'high'
                      ? 'teal'
                      : forecastResult.confidence === 'medium'
                        ? 'yellow'
                        : 'red'
                  }
                  radius="xl"
                  size="sm"
                >
                  Důvěra: {forecastResult.confidence === 'high'
                    ? 'Vysoká'
                    : forecastResult.confidence === 'medium'
                      ? 'Střední'
                    : 'Nízká'}
                </Badge>
                <Badge color={orderRecommendationColor} radius="xl" size="sm">
                  {orderRecommendationLabel}
                </Badge>
                {productHealthLabel && (
                  <Badge color={productHealthColor} radius="xl" size="sm">
                    {productHealthLabel}
                  </Badge>
                )}
              </Group>
            </Group>
            {forecastCreatedRelative && (
              <Text size="xs" c="dimmed">
                Odhad vytvořen: {forecastCreatedRelative}
              </Text>
            )}
            <Text size="sm">{forecastResult.summary}</Text>
            <Stack gap={4}>
              <Text fw={600} size="sm">
                Doporučení k objednávce
              </Text>
              <Text size="sm">{reorderDeadlineLabel}</Text>
              <Text size="sm" c="dimmed">
                Doporučené množství: {recommendedOrderQuantityLabel}
              </Text>
              {orderRationale && <Text size="sm">{orderRationale}</Text>}
            </Stack>
            {forecastRecommendations.length > 0 && (
              <Stack gap={4}>
                <Text fw={600} size="sm">
                  Doporučené kroky
                </Text>
                <Stack gap={2}>
                  {forecastRecommendations.map((item, index) => (
                    <Text key={index} size="sm">
                      • {item}
                    </Text>
                  ))}
                </Stack>
              </Stack>
            )}
            {forecastAssumptions.length > 0 && (
              <Stack gap={4}>
                <Text fw={600} size="sm">
                  Předpoklady
                </Text>
                <Stack gap={2}>
                  {forecastAssumptions.map((item, index) => (
                    <Text key={index} size="sm" c="dimmed">
                      • {item}
                    </Text>
                  ))}
                </Stack>
              </Stack>
            )}
            {topMarkets.length > 0 && (
              <Stack gap={4}>
                <Text fw={600} size="sm">
                  Nejsilnější trhy
                </Text>
                <Table
                  verticalSpacing={4}
                  striped
                  withRowBorders={false}
                  style={{ fontSize: 'var(--mantine-font-size-sm)' }}
                >
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Země</Table.Th>
                      <Table.Th>Výkon</Table.Th>
                      <Table.Th>Podíl</Table.Th>
                      <Table.Th>Poznámka</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {topMarkets.map((market, index) => (
                      <Table.Tr key={`${market.market}-${index}`}>
                        <Table.Td>{market.market}</Table.Td>
                        <Table.Td>{market.performance_label}</Table.Td>
                        <Table.Td>{formatMarketShare(market.share)}</Table.Td>
                        <Table.Td>{market.comment ?? '—'}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Stack>
            )}
            {forecastPricingAdvice && (
              <Stack gap={4}>
                <Text fw={600} size="sm">
                  Doporučení k ceně
                </Text>
                <Text size="sm">{forecastPricingAdvice}</Text>
              </Stack>
            )}
            {forecastRestockAdvice && (
              <Stack gap={4}>
                <Text fw={600} size="sm">
                  Doporučení k zásobování
                </Text>
                <Text size="sm">{forecastRestockAdvice}</Text>
              </Stack>
            )}
            {(seasonalitySummary || seasonalityBestPeriod) && (
              <Stack gap={4}>
                <Text fw={600} size="sm">
                  Sezónnost
                </Text>
                {seasonalitySummary && <Text size="sm">{seasonalitySummary}</Text>}
                {seasonalityBestPeriod && (
                  <Text size="sm" c="dimmed">
                    Nejlepší období: {seasonalityBestPeriod}
                  </Text>
                )}
              </Stack>
            )}
            {productHealthLabel && (
              <Stack gap={4}>
                <Text fw={600} size="sm">
                  Zdraví produktu
                </Text>
                <Text size="sm">{productHealthLabel}</Text>
                {productHealthReason && <Text size="sm">{productHealthReason}</Text>}
              </Stack>
            )}
            {forecastProfile && (
              <Text size="xs" c="dimmed">
                Profil: {seasonalityLabels[forecastProfile.seasonality]} •{' '}
                {cashflowLabels[forecastProfile.cashflow_strategy]} •{' '}
                Růst: {growthLabels[forecastProfile.growth_focus]}
                {forecastProfile.notes ? ` • Poznámka: ${forecastProfile.notes}` : ''}
              </Text>
            )}
          </Stack>
        </SurfaceCard>
      )}

      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <SurfaceCard h="100%">
            <Title order={4} mb="sm">
              Detaily varianty
            </Title>
            <Stack gap={6}>
              <Text size="sm">SKU: {variant.sku ?? '—'}</Text>
              <Text size="sm">EAN: {variant.ean ?? '—'}</Text>
              <Text size="sm">Jednotka: {variant.unit ?? '—'}</Text>
              <Text size="sm">Zásoba: {formatNumber(variant.stock, 2)}</Text>
              <Text size="sm">Minimální zásoba: {formatNumber(variant.min_stock_supply, 2)}</Text>
              <Group gap="xs">
                <Text size="sm">Prodejní cena:</Text>
                <Group gap="xs">
                  {actionPriceActive && basePrice !== null ? (
                    <Text size="sm" c="dimmed" td="line-through">
                      {formatPrice(basePrice, priceCurrency)}
                    </Text>
                  ) : null}
                  <Text size="sm" fw={actionPriceActive ? 600 : undefined}>
                    {formatPrice(displayPrice, priceCurrency)}
                  </Text>
                </Group>
              </Group>
              {actionPriceActive && variant.pricing?.action_price_from && variant.pricing?.action_price_to ? (
                <Text size="xs" c="dimmed">
                  Akce: {variant.pricing.action_price_from.slice(0, 10)} –{' '}
                  {variant.pricing.action_price_to.slice(0, 10)}
                </Text>
              ) : null}
              <Text size="sm">Nákupní cena: {formatPrice(variant.purchase_price, priceCurrency)}</Text>
              <Text size="sm">
                Poslední prodej:{' '}
                {lastSaleRelative ?? '—'}
              </Text>
            </Stack>
          </SurfaceCard>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <SurfaceCard h="100%">
            <Title order={4} mb="sm">
              Informace o produktu
            </Title>
            <Stack gap={6}>
              <Text size="sm">GUID: {variant.product?.external_guid ?? '—'}</Text>
              <Text size="sm">Stav: {variant.product?.status ?? '—'}</Text>
              <Text size="sm">SKU produktu: {variant.product?.sku ?? '—'}</Text>
              <Text size="sm">
                Přihlášený shop: {variant.product?.shop_id ? `#${variant.product.shop_id}` : '—'}
              </Text>
            </Stack>
          </SurfaceCard>
        </Grid.Col>
      </Grid>

      <SurfaceCard>
        <Stack gap="md">
          <Stack gap={2}>
            <Title order={4}>Poznámky</Title>
            <Text size="sm" c="dimmed">
              Interní poznámky jsou viditelné pouze v rámci administrace.
            </Text>
          </Stack>
          <form onSubmit={handleCreateNote}>
            <Stack gap="sm">
              <Textarea
                label="Nová poznámka"
                placeholder="Např. dodatečné informace o variantě, plánované akce…"
                autosize
                minRows={3}
                maxLength={4000}
                value={newNote}
                onChange={(event) => setNewNote(event.currentTarget.value)}
                disabled={createNoteMutation.isPending}
              />
              <Group justify="flex-end">
                <Button
                  type="submit"
                  size="sm"
                  loading={createNoteMutation.isPending}
                  disabled={newNote.trim().length === 0}
                >
                  Přidat poznámku
                </Button>
              </Group>
            </Stack>
          </form>
          {notesError ? (
            <Alert color="red" title="Chyba"><Text size="sm">Nepodařilo se načíst poznámky.</Text></Alert>
          ) : areNotesLoading ? (
            <Loader size="sm" />
          ) : notes.length > 0 ? (
            <Stack gap="sm">
              {notes.map((note) => (
                <VariantNoteCard
                  key={note.id}
                  note={note}
                  onUpdate={handleUpdateNote}
                  onDelete={handleDeleteNote}
                  updating={updatingNoteId === note.id && updateNoteMutation.isPending}
                  deleting={deletingNoteId === note.id && deleteNoteMutation.isPending}
                />
              ))}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              Zatím nemáte žádné poznámky.
            </Text>
          )}
        </Stack>
      </SurfaceCard>

      <SurfaceCard>
        <Title order={4} mb="sm">
          Trend prodaných kusů (posledních 120 dní)
        </Title>
        <Box style={{ minHeight: 260, minWidth: 0 }}>
          <AreaChart
            h={260}
            data={sales.trend.map((item) => ({ ...item, quantity: Number(item.quantity) }))}
            dataKey="date"
            series={[{ name: 'quantity', label: 'Prodáno ks', color: 'teal.5' }]}
            curveType="monotone"
            withLegend
            withDots={false}
          />
        </Box>
      </SurfaceCard>

      <SurfaceCard>
        <Title order={4} mb="sm">
          Trend obratu (posledních 120 dní)
        </Title>
        <Box style={{ minHeight: 260, minWidth: 0 }}>
          <AreaChart
            h={260}
            data={sales.trend.map((item) => ({ ...item, revenue: Number(item.revenue) }))}
            dataKey="date"
            series={[{ name: 'revenue', label: 'Obrat (s DPH)', color: 'indigo.5' }]}
            curveType="monotone"
            withLegend
            withDots={false}
          />
        </Box>
      </SurfaceCard>

      {compareMode && perShopSales.length > 0 && (
        <Stack gap="md">
          <Title order={4}>Porovnání podle shopu</Title>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            {perShopSales.map((entry) => {
              const shopName = resolveShopLabel(entry.shop ?? null, entry.shop_id);
              const lastSale = entry.last_sale_at
                ? formatDistanceToNow(parseISO(entry.last_sale_at), { locale: cs, addSuffix: true })
                : null;
              const metricsUpdated = entry.metrics_updated_at
                ? formatDistanceToNow(parseISO(entry.metrics_updated_at), { locale: cs, addSuffix: true })
                : null;
              const stockRunwayText =
                entry.stock_runway_days !== null && entry.stock_runway_days !== undefined
                  ? `${Math.max(entry.stock_runway_days, 0).toFixed(1)} dnů`
                  : '—';

              const shopCurrency = entry.currency_code ?? metricsCurrency ?? variant.currency_code;

              return (
                <SurfaceCard key={entry.shop_id}>
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-start">
                      <Stack gap={2}>
                        <Title order={5}>{shopName}</Title>
                        <Text size="xs" c="dimmed">
                          Shop ID: {entry.shop_id}
                        </Text>
                      </Stack>
                      <Stack gap={2} align="flex-end">
                        <Text size="xs" c="dimmed">
                          Poslední prodej: {lastSale ?? '—'}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Statistiky aktualizovány: {metricsUpdated ?? '—'}
                        </Text>
                      </Stack>
                    </Group>

                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                      <Stack gap={2}>
                        <Text size="xs" c="dimmed">
                          30 dní
                        </Text>
                        <Text fw={600}>
                          {formatNumber(entry.summaries.last_30_days.quantity, 2)} ks
                        </Text>
                        <Text size="xs" c="dimmed">
                          Objednávky: {entry.summaries.last_30_days.orders_count.toLocaleString('cs-CZ')}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Obrat: {formatPrice(entry.summaries.last_30_days.revenue, shopCurrency)}
                        </Text>
                      </Stack>
                      <Stack gap={2}>
                        <Text size="xs" c="dimmed">
                          90 dní
                        </Text>
                        <Text fw={600}>
                          {formatNumber(entry.summaries.last_90_days.quantity, 2)} ks
                        </Text>
                        <Text size="xs" c="dimmed">
                          Objednávky: {entry.summaries.last_90_days.orders_count.toLocaleString('cs-CZ')}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Obrat: {formatPrice(entry.summaries.last_90_days.revenue, shopCurrency)}
                        </Text>
                      </Stack>
                    </SimpleGrid>

                    <Group justify="space-between" gap="sm" align="center">
                      <Text size="sm" c="dimmed">
                        Denní poptávka: {formatNumber(entry.average_daily_sales, 2)} ks
                      </Text>
                      <Text size="sm" c="dimmed">
                        Výdrž zásoby: {stockRunwayText}
                      </Text>
                    </Group>

                    <Box style={{ minHeight: 200, minWidth: 0 }}>
                      <AreaChart
                        h={200}
                        data={entry.trend.map((item) => ({
                          ...item,
                          quantity: Number(item.quantity),
                        }))}
                        dataKey="date"
                        series={[{ name: 'quantity', label: 'Prodáno ks', color: 'teal.6' }]}
                        curveType="monotone"
                        withLegend
                        withDots={false}
                      />
                    </Box>
                  </Stack>
                </SurfaceCard>
              );
            })}
          </SimpleGrid>
        </Stack>
      )}

      <SurfaceCard className={classes.tableCard}>
        <Title order={4} mb="sm">
          Další varianty produktu
        </Title>
        {siblings.length > 1 ? (
          <Table verticalSpacing="sm" highlightOnHover striped withRowBorders={false}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={150}>Kód</Table.Th>
                <Table.Th w={220}>Název</Table.Th>
                <Table.Th w={140}>SKU</Table.Th>
                <Table.Th w={150}>EAN</Table.Th>
                <Table.Th w={160}>Značka</Table.Th>
                <Table.Th w={160}>Dodavatel</Table.Th>
                <Table.Th w={220}>Kategorie</Table.Th>
                <Table.Th w={140}>Stav</Table.Th>
                <Table.Th w={140}>Zásoba</Table.Th>
                <Table.Th w={140}>Min. zásoba</Table.Th>
                <Table.Th w={140}>Cena</Table.Th>
                <Table.Th w={160}>Nákupní cena</Table.Th>
                <Table.Th w={240}>Parametry varianty</Table.Th>
                <Table.Th>Dostupnost</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {siblings.map((sibling) => {
                const siblingStatus = statusMeta[sibling.stock_status];
                const isCurrent = sibling.id === variant.id;
                const variantCategories = resolveVariantCategories(sibling, productCategories);
                const variantParameters = getVariantParameters(sibling);
                const availability = resolveVariantAvailability(sibling);

                return (
                  <Table.Tr
                    key={sibling.id}
                    onClick={
                      isCurrent
                        ? undefined
                        : () => navigate(`/inventory/variants/${sibling.id}`)
                    }
                    style={{ cursor: isCurrent ? 'default' : 'pointer' }}
                  >
                    <Table.Td>
                      <Text fw={isCurrent ? 600 : 500}>{sibling.code}</Text>
                    </Table.Td>
                    <Table.Td>{sibling.name ?? '—'}</Table.Td>
                    <Table.Td>{sibling.sku ?? '—'}</Table.Td>
                    <Table.Td>{sibling.ean ?? '—'}</Table.Td>
                    <Table.Td>{sibling.brand ?? '—'}</Table.Td>
                    <Table.Td>{sibling.supplier ?? '—'}</Table.Td>
                    <Table.Td>
                      {variantCategories.length > 0 ? (
                        <Stack gap={2} align="flex-start">
                          {variantCategories.map((categoryName, index) => (
                            <Text size="sm" key={`${sibling.id}-category-${index}`}>
                              {categoryName}
                            </Text>
                          ))}
                        </Stack>
                      ) : (
                        <Text size="sm">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={siblingStatus.color}>{siblingStatus.label}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text>{formatNumber(sibling.stock, 2)}</Text>
                      {sibling.unit && (
                        <Text size="xs" c="dimmed">
                          {sibling.unit}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>{formatNumber(sibling.min_stock_supply, 2)}</Table.Td>
                    <Table.Td>{formatPrice(sibling.price, sibling.currency_code)}</Table.Td>
                    <Table.Td>{formatPrice(sibling.purchase_price, sibling.currency_code)}</Table.Td>
                    <Table.Td>
                      {variantParameters.length > 0 ? (
                        <Stack gap={4} align="flex-start">
                          {variantParameters.map((parameter, idx) => (
                            <div key={`${sibling.id}-parameter-${idx}`}>
                              <Text size="sm" fw={600}>
                                {parameter.name}
                              </Text>
                              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                                {parameter.value}
                              </Text>
                              {parameter.description && (
                                <Text size="xs" c="dimmed">
                                  {parameter.description}
                                </Text>
                              )}
                            </div>
                          ))}
                        </Stack>
                      ) : (
                        <Text size="sm">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>{availability}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm" c="dimmed">
            Tento produkt nemá další varianty.
          </Text>
        )}
      </SurfaceCard>
    </Stack>
  </>
);
};
