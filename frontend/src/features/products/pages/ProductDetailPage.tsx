import {
  Accordion,
  Anchor,
  Autocomplete,
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
  Divider,
  Grid,
  Group,
  Image,
  JsonInput,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  ScrollArea,
  Select,
  SimpleGrid,
  Spoiler,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  ThemeIcon,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDisclosure } from '@mantine/hooks';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import {
  generateTranslationDraft,
  prepareTranslationMapping,
  rejectTranslation,
  submitTranslation,
  updateTranslation,
  type ProductVariant,
  type ProductVariantTranslationRecord,
  type ProductTranslation,
  updateProductOverlay,
  updateProductVariantOverlay,
  type AiDraftResponse,
  type MappingOverridesPayload,
} from '../../../api/pim';
import { useLocales } from '../hooks/useLocales';
import { useProduct } from '../hooks/useProduct';
import { useTranslation } from '../hooks/useTranslation';
import { useShops } from '../../shoptet/hooks/useShops';
import { bootstrapMasterProducts, fetchShop, pushProductTranslation, type Shop } from '../../../api/shops';
import { useAttributeMappings } from '../../pim/hooks/useAttributeMappings';

const EMPTY_SHOPS: Shop[] = [];
const EMPTY_VARIANTS: ProductVariant[] = [];
const PUSHABLE_TRANSLATION_STATUSES = ['in_review', 'approved', 'synced'];

const variantStatusMeta: Record<
  ProductVariant['stock_status'],
  { label: string; color: string }
> = {
  in_stock: { label: 'Skladem', color: 'teal' },
  low_stock: { label: 'Nízká zásoba', color: 'orange' },
  sold_out: { label: 'Vyprodáno', color: 'red' },
  unknown: { label: 'Neznámé', color: 'gray' },
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
    if (value.length === 0) {
      return '—';
    }

    const items = value
      .map((item) => {
        if (item === null || item === undefined) {
          return null;
        }

        if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
          return formatDisplayValue(item);
        }

        if (typeof item === 'object') {
          const record = item as Record<string, unknown>;
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
            return JSON.stringify(record);
          } catch {
            return String(record);
          }
        }

        return String(item);
      })
      .filter((item): item is string => Boolean(item));

    return items.length > 0 ? items.join(', ') : '—';
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
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  return String(value);
};

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('cs-CZ');
};

const resolveVariantAvailability = (
  variant: ProductVariant,
  source?: Record<string, unknown> | null
): string => {
  const data = (source ?? variant.data ?? {}) as Record<string, unknown>;
  const availability = (data.availability as { name?: string } | undefined)?.name;
  const fallback = (data.availabilityWhenSoldOut as { name?: string } | undefined)?.name;

  return availability ?? fallback ?? '—';
};

const resolveVariantCategories = (
  variant: ProductVariant,
  fallbackCategories: Array<Record<string, unknown>> = [],
  source?: Record<string, unknown> | null
) => {
  const data = (source ?? variant.data ?? {}) as Record<string, unknown>;
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

      const mapping = asRecord(objectValue['mapping']);
      if (mapping) {
        collect(mapping['shop_category'] ?? mapping['shopCategory']);
        collect(mapping['target']);
      }

      const shopCategory = asRecord(objectValue['shop_category'] ?? objectValue['shopCategory']);
      if (shopCategory) {
        pushName(shopCategory['path']);
        pushName(shopCategory['fullName']);
        pushName(shopCategory['name']);
        collect(shopCategory);
      }

      const hubData = asRecord(objectValue['_hub']);
      if (hubData) {
        collect(hubData['mappedCategories']);
        collect(hubData['suggestedCategories']);
      }

      const nestedKeys = [
        'category',
        'categories',
        'path',
        'breadcrumb',
        'breadcrumbs',
        'parent',
        'parents',
        'mappedCategories',
        'suggestedCategories',
      ];

      nestedKeys.forEach((nestedKey) => {
        if (nestedKey in objectValue) {
          collect(objectValue[nestedKey]);
        }
      });

      return;
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
    'mappedCategories',
    'suggestedCategories',
    '_hub',
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

const createRowId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `row-${Math.random().toString(36).slice(2, 10)}`;
};
type RawParameter = Record<string, unknown>;

type ParameterEntry = {
  name: string;
  value: string;
  description?: string;
  priority?: number;
};

type DescriptiveParameterFormValue = {
  id?: string;
  name: string;
  value: string;
  description: string;
  priority: string;
};

type FilteringParameterFormValue = {
  id?: string;
  code: string;
  values: string;
};

type VariantParameterFormValue = {
  id?: string;
  name: string;
  value: string;
  nameIndex?: string | null;
  valueIndex?: string | null;
};

type AiFilteringDraftEntry = {
  id: string;
  code: string;
  values: string[];
  valueLabels: Record<string, string>;
};

type AiVariantDraft = {
  code: string;
  name: string;
  price: string;
  purchasePrice: string;
  currencyCode: string;
  vatRate: string;
  stock: string;
  parameters: VariantParameterFormValue[];
};

type AiPricingDraft = {
  price: string;
  currencyCode: string;
};

type MissingFilteringMapping = {
  master_key: string;
  label: string;
  target_key: string | null;
  values: Array<{ master_value_key: string; label: string }>;
};

type MissingVariantMapping = {
  variant_code: string;
  variant_name?: string | null;
  parameter_key: string;
  label?: string | null;
  target_key: string | null;
  values: Array<{ master_value_key: string; label: string }>;
};

type MappingValueOverrideState = {
  targetValueKey: string | null;
  mode: 'map' | 'ignore';
};

type FilteringOverrideState = {
  targetKey: string | null;
  ignore: boolean;
  values: Record<string, MappingValueOverrideState>;
};

type VariantParameterOverrideState = {
  targetKey: string | null;
  ignore: boolean;
  values: Record<string, MappingValueOverrideState>;
};

type AiMappingOverridesState = {
  filtering: Record<string, FilteringOverrideState>;
  variants: Record<string, Record<string, VariantParameterOverrideState>>;
};

type AiMappingIssues = {
  filtering_parameters: MissingFilteringMapping[];
  variants: MissingVariantMapping[];
};

type MappingStatus = {
  complete: boolean;
  issues: string[];
  resolvedValues: number;
  totalValues: number;
  targetLabel: string | null;
  ignore: boolean;
};

const createEmptyMappingOverrides = (): AiMappingOverridesState => ({
  filtering: {},
  variants: {},
});

type TranslationFormValues = {
  name: string;
  short_description: string;
  description: string;
  seo_meta_title: string;
  seo_meta_description: string;
  descriptive_parameters: DescriptiveParameterFormValue[];
  filtering_parameters: FilteringParameterFormValue[];
};

type ProductOverlayImageFormState = {
  id: string;
  source: string;
  title: string;
  description: string;
  original: Record<string, unknown>;
};

type VariantOverlayFormState = {
  name: string;
  parameters: VariantParameterFormValue[];
  additional_data: string;
  price: string;
  purchase_price: string;
  vat_rate: string;
  stock: string;
  min_stock_supply: string;
  currency_code: string;
  unit: string;
};

const createVariantOverlayFormState = (): VariantOverlayFormState => ({
  name: '',
  parameters: [],
  additional_data: '',
  price: '',
  purchase_price: '',
  vat_rate: '',
  stock: '',
  min_stock_supply: '',
  currency_code: '',
  unit: '',
});

type OverlayMutationContext = {
  silent?: boolean;
};

const toDraftNumericString = (value: unknown): string => {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value.toString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed;
  }

  return '';
};

const normalizeNumericSetting = (value: unknown): number | null => {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '' || Number.isNaN(Number(trimmed))) {
      return null;
    }

    return Number(trimmed);
  }

  return null;
};

const normalizeParameter = (parameter: RawParameter, fallbackName: string): ParameterEntry => {
  const name =
    (parameter.displayName as string | undefined) ??
    (parameter.name as string | undefined) ??
    (parameter.paramName as string | undefined) ??
    fallbackName;

  const priority = typeof parameter.priority === 'number' ? parameter.priority : undefined;

  const valuesArray = Array.isArray(parameter.values)
    ? (parameter.values as RawParameter[])
        .map((value) =>
          (value.name as string | undefined) ??
          (value.displayName as string | undefined) ??
          (value.value as string | undefined) ??
          (value.valueIndex as string | undefined) ??
          null
        )
        .filter((item): item is string => Boolean(item))
    : [];

  const rawValue = parameter.value ?? parameter.paramValue ?? parameter.rawValue;

  const value = valuesArray.length
    ? valuesArray.join(', ')
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

const renderParameterEntries = (entries: ParameterEntry[]) => (
  <Table withRowBorders={false} verticalSpacing="xs">
    <Table.Tbody>
      {entries.map((entry, index) => {
        const multiline = entry.value.includes('\n');

        return (
          <Table.Tr key={`${entry.name}-${index}`}>
            <Table.Td w="35%">
              <Stack gap={2} align="flex-start">
                <Group gap={8} wrap="nowrap">
                  <Text fw={600}>{entry.name}</Text>
                  {typeof entry.priority === 'number' && (
                    <Badge color="gray" variant="light" size="sm">
                      #{entry.priority}
                    </Badge>
                  )}
                </Group>
                {entry.description && (
                  <Text size="xs" c="dimmed">
                    {entry.description}
                  </Text>
                )}
              </Stack>
            </Table.Td>
            <Table.Td>
              <Text
                size="sm"
                component={multiline ? 'pre' : 'span'}
                style={{ whiteSpace: multiline ? 'pre-wrap' : undefined, margin: 0 }}
              >
                {entry.value}
              </Text>
            </Table.Td>
          </Table.Tr>
        );
      })}
    </Table.Tbody>
  </Table>
);

const toDescriptiveParameterFormValues = (input: unknown): DescriptiveParameterFormValue[] => {
  if (!input) {
    return [];
  }

  const rows: DescriptiveParameterFormValue[] = [];

  const appendRow = (
    name: string,
    value: string,
    description: string = '',
    priority: string = ''
  ) => {
    rows.push({
      id: createRowId(),
      name,
      value,
      description,
      priority,
    });
  };

  if (Array.isArray(input)) {
    input.forEach((item, index) => {
      if (!item) {
        return;
      }

      if (typeof item === 'object') {
        const record = item as RawParameter;
        const nameCandidates = [
          record.name,
          record.displayName,
          record.title,
          record.paramName,
        ];
        const name =
          nameCandidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim() !== '') ??
          `Parametr ${index + 1}`;

        const valueCandidates: Array<unknown> = [
          record.value,
          record.text,
          record.paramValue,
        ];

        let value = '';
        for (const candidate of valueCandidates) {
          if (candidate === null || candidate === undefined) {
            continue;
          }

          if (typeof candidate === 'string' && candidate.trim() !== '') {
            value = candidate;
            break;
          }

          if (typeof candidate === 'number' || typeof candidate === 'boolean') {
            value = String(candidate);
            break;
          }
        }

        if (value === '' && Array.isArray(record.values)) {
          const labels = (record.values as Array<RawParameter | string | number | boolean>)
            .map((entry) => {
              if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
                return String(entry);
              }

              if (entry && typeof entry === 'object') {
                return (
                  (entry.name as string | undefined) ??
                  (entry.displayName as string | undefined) ??
                  (entry.value as string | undefined) ??
                  (entry.valueIndex as string | undefined) ??
                  null
                );
              }

              return null;
            })
            .filter((entry): entry is string => Boolean(entry));

          if (labels.length > 0) {
            value = labels.join(', ');
          }
        }

        const description =
          (typeof record.description === 'string' && record.description.trim() !== '')
            ? record.description
            : '';
        const priority =
          typeof record.priority === 'number'
            ? String(record.priority)
            : typeof record.priority === 'string'
              ? record.priority
              : '';

        appendRow(name, value, description, priority);
        return;
      }

      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        appendRow(`Parametr ${index + 1}`, String(item));
      }
    });

    return rows;
  }

  if (typeof input === 'object') {
    const record = input as Record<string, unknown>;

    if (Array.isArray(record.descriptiveParameters)) {
      return toDescriptiveParameterFormValues(record.descriptiveParameters);
    }

    const keys = Object.keys(record);
    keys.forEach((key) => {
      if (key === 'filteringParameters') {
        return;
      }

      const value = record[key];
      const stringValue = formatDisplayValue(value);
      appendRow(
        key,
        stringValue === '—' ? '' : stringValue
      );
    });

    return rows;
  }

  return rows;
};

const toFilteringParameterFormValues = (input: unknown): FilteringParameterFormValue[] => {
  if (!input) {
    return [];
  }

  const rows: FilteringParameterFormValue[] = [];

  const normalizeValuesToText = (value: unknown): string => {
    if (!value) {
      return '';
    }

    if (Array.isArray(value)) {
      const values = value
        .map((entry) => {
          if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
            return String(entry);
          }

          if (entry && typeof entry === 'object') {
            const record = entry as RawParameter;
            return (
              (record.value as string | undefined) ??
              (record.name as string | undefined) ??
              (record.displayName as string | undefined) ??
              (record.valueIndex as string | undefined) ??
              null
            );
          }

          return null;
        })
        .filter((entry): entry is string => Boolean(entry));

      return values.join('\n');
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return '';
  };

  if (Array.isArray(input)) {
    input.forEach((item) => {
      if (!item || typeof item !== 'object') {
        return;
      }

      const record = item as RawParameter;
      const codeCandidates = [
        record.code,
        record.name,
        record.paramIndex,
      ];
      const code =
        codeCandidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim() !== '') ?? '';

      rows.push({
        id: createRowId(),
        code,
        values: normalizeValuesToText(record.values ?? record.value ?? record.paramValue),
      });
    });

    return rows;
  }

  if (typeof input === 'object') {
    const record = input as Record<string, unknown>;
    if (Array.isArray(record.filteringParameters)) {
      return toFilteringParameterFormValues(record.filteringParameters);
    }
  }

  return rows;
};

const aiFilteringDraftToFormValues = (draft: AiFilteringDraftEntry[]): FilteringParameterFormValue[] => {
  if (!draft || draft.length === 0) {
    return [];
  }

  return draft
    .map((entry) => {
      const code = typeof entry.code === 'string' ? entry.code.trim() : '';
      const values = (entry.values ?? [])
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value !== '');

      return {
        id: createRowId(),
        code,
        values: values.join('\n'),
      };
    })
    .filter((entry) => entry.code !== '' || entry.values.trim() !== '');
};

const extractParameterArray = (input: unknown): RawParameter[] | null => {
  if (!input) {
    return null;
  }

  if (Array.isArray(input)) {
    return input as RawParameter[];
  }

  if (typeof input === 'object') {
    const record = input as Record<string, unknown>;
    if (Array.isArray(record.parameters)) {
      return record.parameters as RawParameter[];
    }
  }

  return null;
};

const toVariantParameterFormValues = (input: unknown): VariantParameterFormValue[] => {
  if (!input || !Array.isArray(input)) {
    return [];
  }

  const rows: VariantParameterFormValue[] = [];

  input.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const record = item as RawParameter;
    const nameCandidates = [record.name, record.displayName, record.title];
    const resolvedName = nameCandidates.find(
      (candidate): candidate is string => typeof candidate === 'string' && candidate.trim() !== ''
    );
    const name =
      resolvedName ?? `Varianta ${index + 1}`;

    let value = '';
    const valueCandidates: Array<unknown> = [record.value, record.text, record.paramValue];

    for (const candidate of valueCandidates) {
      if (candidate === null || candidate === undefined) {
        continue;
      }

      if (typeof candidate === 'string' && candidate.trim() !== '') {
        value = candidate;
        break;
      }

      if (typeof candidate === 'number' || typeof candidate === 'boolean') {
        value = String(candidate);
        break;
      }
    }

    if (value === '' && Array.isArray(record.values)) {
      const values = (record.values as Array<unknown>)
        .map((entry) => {
          if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
            return String(entry);
          }

          if (entry && typeof entry === 'object') {
            const option = entry as RawParameter;
            return (
              (option.value as string | undefined) ??
              (option.name as string | undefined) ??
              (option.displayName as string | undefined) ??
              (option.valueIndex as string | undefined) ??
              null
            );
          }

          return null;
        })
        .filter((entry): entry is string => Boolean(entry));

      if (values.length > 0) {
        value = values.join(', ');
      }
    }

    const nameIndex =
      (typeof record.nameIndex === 'string' && record.nameIndex.trim() !== '' && record.nameIndex) ||
      (typeof record.paramIndex === 'string' && record.paramIndex.trim() !== '' && record.paramIndex) ||
      (typeof record.index === 'string' && record.index.trim() !== '' && record.index) ||
      (typeof record.code === 'string' && record.code.trim() !== '' && record.code) ||
      null;

    const valueIndex =
      (typeof record.valueIndex === 'string' && record.valueIndex.trim() !== '' && record.valueIndex) ||
      (typeof record.rawValue === 'string' && record.rawValue.trim() !== '' && record.rawValue) ||
      (typeof record.paramValue === 'string' && record.paramValue.trim() !== '' && record.paramValue) ||
      (value.trim() !== '' ? value.trim() : null);

    const rowId = record.id ? String(record.id) : createRowId();

    rows.push({
      id: rowId,
      name,
      value,
      nameIndex,
      valueIndex,
    });
  });

  return rows;
};

const pickArray = <T,>(overlayValue: unknown, fallbackValue: unknown): T[] =>
  Array.isArray(overlayValue) && overlayValue.length > 0
    ? (overlayValue as T[])
    : (Array.isArray(fallbackValue) ? (fallbackValue as T[]) : []);

const pickPreferredArray = <T,>(primarySources: unknown[], fallbackSources: unknown[]): T[] => {
  for (const source of primarySources) {
    if (Array.isArray(source) && source.length > 0) {
      return source as T[];
    }
  }

  for (const source of fallbackSources) {
    if (Array.isArray(source) && source.length > 0) {
      return source as T[];
    }
  }

  return [];
};

const asRecord = (input: unknown): Record<string, unknown> | undefined =>
  input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : undefined;

const pickFirstNonEmptyString = (...values: Array<unknown>): string => {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return '';
};

const getVariantParameters = (
  variant: ProductVariant,
  translation?: ProductVariantTranslationRecord
): ParameterEntry[] => {
  const translationParameters = translation?.parameters;

  if (Array.isArray(translationParameters)) {
    return translationParameters.map((parameter, index) =>
      normalizeParameter(parameter as RawParameter, (parameter as RawParameter).name as string | undefined ?? `Parametr ${index + 1}`)
    );
  }

  if (translationParameters && typeof translationParameters === 'object') {
    return Object.entries(translationParameters as Record<string, unknown>).map(([key, value]) =>
      normalizeParameter({ name: key, value } as RawParameter, key)
    );
  }

  const sourceData = (translation?.data ?? variant.data ?? {}) as RawParameter;
  const rawParameters = (sourceData.parameters as RawParameter[] | undefined)
    ?? (sourceData.variantParameters as RawParameter[] | undefined)
    ?? (sourceData.parameterValues as RawParameter[] | undefined)
    ?? [];

  return rawParameters.map((parameter, index) =>
    normalizeParameter(parameter, parameter.paramName as string | undefined ?? `Parametr ${index + 1}`)
  );
};

const hasEntries = (record?: Record<string, unknown> | null): boolean =>
  !!record && Object.keys(record).length > 0;

export const ProductDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { data: product, isLoading: isLoadingProduct } = useProduct(id);
  const { data: locales } = useLocales();
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
  const [selectedLocale, setSelectedLocale] = useState<string | null>(null);
  const { data: translation, isLoading: isLoadingTranslation } = useTranslation(
    id,
    selectedLocale ?? undefined,
    selectedShopId
  );
  const overlays = useMemo(() => product?.overlays ?? [], [product]);
  const shopsQuery = useShops({ per_page: 100 });
  const shops = shopsQuery.data?.data ?? EMPTY_SHOPS;
  const selectedShopFromList = shops.find((shop) => shop.id === selectedShopId) ?? null;
  const { data: selectedShopFallback } = useQuery({
    queryKey: ['shoptet', 'shops', 'single', selectedShopId],
    enabled: selectedShopId !== null && !selectedShopFromList,
    queryFn: () => fetchShop(selectedShopId!),
  });
  const selectedShop = selectedShopFromList ?? selectedShopFallback ?? null;
  const selectedShopLabel =
    selectedShop?.name ?? (selectedShopId !== null ? `Shop #${selectedShopId}` : 'vybraný shop');
  const selectedShopSettings = useMemo(() => {
    if (!selectedShop || !selectedShop.settings || typeof selectedShop.settings !== 'object') {
      return null;
    }

    return selectedShop.settings as Record<string, unknown>;
  }, [selectedShop]);
  const selectedShopDefaultVatRate = useMemo(() => {
    if (!selectedShopSettings) {
      return null;
    }

    const raw =
      selectedShopSettings['default_vat_rate'] ??
      selectedShopSettings['vat_rate'] ??
      selectedShopSettings['defaultVatRate'];

    return normalizeNumericSetting(raw);
  }, [selectedShopSettings]);
  const filteringAttributesQuery = useAttributeMappings({
    masterShopId: product?.shop_id ?? null,
    targetShopId: selectedShopId,
    type: 'filtering_parameters',
  });
  const variantAttributesQuery = useAttributeMappings({
    masterShopId: product?.shop_id ?? null,
    targetShopId: selectedShopId,
    type: 'variants',
  });
  const filteringTargetAttributes = filteringAttributesQuery.data?.target ?? [];
  const variantTargetAttributes = variantAttributesQuery.data?.target ?? [];
  const filteringAttributeOptions = useMemo(
    () =>
      filteringTargetAttributes.map((item) => ({
        value: item.key,
        label: item.label ?? item.code ?? item.key,
      })),
    [filteringTargetAttributes]
  );
  const variantAttributeOptions = useMemo(
    () =>
      variantTargetAttributes.map((item) => ({
        value: item.key,
        label: item.label ?? item.code ?? item.key,
      })),
    [variantTargetAttributes]
  );
  const canBootstrapProducts = Boolean(selectedShop?.is_master);
  const activeOverlay = overlays.find((overlay) => overlay.shop_id === selectedShopId) ?? null;
  const [variantOverlayForms, setVariantOverlayForms] = useState<Record<string, VariantOverlayFormState>>({});
  const createEmptyVariantOverlayFormState = useCallback(
    (): VariantOverlayFormState => createVariantOverlayFormState(),
    []
  );
  const overlayShop = activeOverlay?.shop;
  const variants = product?.variants ?? EMPTY_VARIANTS;
  const totalVariants = variants.length;
  const seoData = (translation?.seo ?? {}) as Record<string, unknown>;
  const translationTextsComplete = Boolean(
    translation?.name && translation?.short_description && translation?.description
  );
  const canonicalPayloadRecord = (product?.base_payload ?? {}) as Record<string, unknown>;
  const isProductSet = (canonicalPayloadRecord['type'] as string | undefined) === 'product-set';
  const seoComplete = Boolean(
    typeof seoData.metaTitle === 'string' && seoData.metaTitle.trim() !== '' &&
      typeof seoData.metaDescription === 'string' && seoData.metaDescription.trim() !== ''
  );
  const parametersComplete = (() => {
    if (isProductSet) {
      return true;
    }
    if (!translation?.parameters) {
      return false;
    }
    if (Array.isArray(translation.parameters)) {
      return translation.parameters.length > 0;
    }
    return Object.keys(translation.parameters).length > 0;
  })();
  const translatedVariantCount = useMemo(() => {
    if (!selectedLocale) {
      return 0;
    }

    return variants.filter((variant) => {
      const hasPersistedTranslation = variant.translations?.some(
        (record) =>
          record.locale === selectedLocale &&
          (record.shop_id === null || record.shop_id === selectedShopId) &&
          !!record.name
      );

      if (hasPersistedTranslation) {
        return true;
      }

      const draft = variantOverlayForms[variant.id];
      return Boolean(draft && draft.name.trim() !== '');
    }).length;
  }, [selectedLocale, selectedShopId, variants, variantOverlayForms]);
  const mappedVariantCount = useMemo(() => {
    if (selectedShopId === null) {
      return 0;
    }
    return variants.filter((variant) =>
      variant.remote_refs?.some(
        (ref) => ref.shop_id === selectedShopId && (!!ref.remote_guid || !!ref.remote_code)
      )
    ).length;
  }, [selectedLocale, selectedShopId, variants]);
  const productHasRemoteRef = useMemo(() => {
    if (selectedShopId === null) {
      return false;
    }
    return product?.remote_refs?.some((ref) => ref.shop_id === selectedShopId && !!ref.remote_guid) ?? false;
  }, [product?.remote_refs, selectedShopId]);
  const shouldShowInitialLoader =
    isLoadingProduct || !product || !selectedLocale || selectedShopId === null;
  const variantTranslationsComplete = totalVariants === 0 || translatedVariantCount === totalVariants;
  const variantMappingsComplete = totalVariants === 0 || mappedVariantCount === totalVariants;
  const translationChecklist = useMemo(
    () =>
      translation
        ? [
            {
              key: 'texts',
              label: 'Texty překladu vyplněné',
              completed: translationTextsComplete,
              hint: 'Vyplň název, krátký i dlouhý popis.',
            },
            {
              key: 'seo',
              label: 'SEO titul a popis',
              completed: seoComplete,
              hint: 'Doplň Meta Title i Meta Description v sekci SEO.',
            },
            {
              key: 'parameters',
              label: 'Parametry překladu',
              completed: parametersComplete,
              hint: 'Přidej alespoň jeden parametr nebo filtr.',
            },
            {
              key: 'variantTranslations',
              label: 'Varianty přeložené',
              completed: variantTranslationsComplete,
              hint:
                totalVariants > 0
                  ? `Zbývá přeložit ${totalVariants - translatedVariantCount} variant.`
                  : undefined,
            },
            {
              key: 'variantMappings',
              label: 'Varianty napárované na Shoptet',
              completed: variantMappingsComplete,
              hint:
                selectedShopId !== null && totalVariants > 0
                  ? `Napárováno ${mappedVariantCount} z ${totalVariants} variant. Zkontroluj GUID ve skladu.`
                  : undefined,
            },
            {
              key: 'productRemote',
              label: 'Produkt založen v cílovém shopu',
              completed: productHasRemoteRef,
              hint: 'Po prvním úspěšném pushnutí se zde objeví remote GUID.',
            },
          ]
        : [],
    [
      translation,
      translationTextsComplete,
      seoComplete,
      parametersComplete,
      variantTranslationsComplete,
      totalVariants,
      translatedVariantCount,
      variantMappingsComplete,
      selectedShopId,
      mappedVariantCount,
      productHasRemoteRef,
    ]
  );
  const variantIdByCode = useMemo(() => {
    const map = new Map<string, { id: string; name?: string | null }>();
    variants.forEach((variant) => {
      if (variant.code) {
        map.set(variant.code, { id: variant.id, name: variant.name });
      }
    });
    return map;
  }, [variants]);

  const [productOverlayStatus, setProductOverlayStatus] = useState('');
  const [productOverlayCurrency, setProductOverlayCurrency] = useState('');
  const [productOverlayJson, setProductOverlayJson] = useState('');
  const [productOverlayIndexName, setProductOverlayIndexName] = useState('');
  const [productOverlayImages, setProductOverlayImages] = useState<ProductOverlayImageFormState[]>([]);

  const [productJsonModalOpened, { open: openProductJsonModal, close: closeProductJsonModal }] = useDisclosure(false);
  const [productJsonDraft, setProductJsonDraft] = useState('');

  const form = useForm<TranslationFormValues>({
    defaultValues: {
      name: '',
      short_description: '',
      description: '',
      seo_meta_title: '',
      seo_meta_description: '',
      descriptive_parameters: [],
      filtering_parameters: [],
    },
  });
  const descriptiveParametersFieldArray = useFieldArray({
    control: form.control,
    name: 'descriptive_parameters',
  });
  const filteringParametersFieldArray = useFieldArray({
    control: form.control,
    name: 'filtering_parameters',
  });
  const {
    fields: descriptiveParameterFields,
    append: appendDescriptiveParameter,
    remove: removeDescriptiveParameter,
  } = descriptiveParametersFieldArray;
  const {
    fields: filteringParameterFields,
    append: appendFilteringParameter,
    remove: removeFilteringParameter,
  } = filteringParametersFieldArray;
  const createEmptyDescriptiveParameter = useCallback(
    (): DescriptiveParameterFormValue => ({
      name: '',
      value: '',
      description: '',
      priority: '',
    }),
    []
  );
  const createEmptyFilteringParameter = useCallback(
    (): FilteringParameterFormValue => ({
      code: '',
      values: '',
    }),
    []
  );

  const aiSectionOptions = useMemo(
    () => [
      { value: 'text', label: 'Texty (název, popisy)' },
      { value: 'seo', label: 'SEO (title, description)' },
      { value: 'slug', label: 'URL slug' },
      { value: 'parameters', label: 'Parametry produktu' },
      { value: 'filtering_parameters', label: 'Filtrační parametry' },
      { value: 'images', label: 'Obrázky (alt, titulek)' },
      { value: 'variants', label: 'Varianty (názvy, parametry)' },
      { value: 'pricing', label: 'Ceny a měna' },
    ],
    []
  );

  const aiSectionLabels = useMemo(
    () =>
      aiSectionOptions.reduce<Record<string, string>>((acc, item) => {
        acc[item.value] = item.label;
        return acc;
      }, {}),
    [aiSectionOptions]
  );
  const defaultAiSections = useMemo(() => aiSectionOptions.map((option) => option.value), [aiSectionOptions]);

  const [aiModalOpened, { open: openAiModal, close: closeAiModal }] = useDisclosure(false);
  const [aiStep, setAiStep] = useState<'mapping' | 'review'>('mapping');
  const [aiSelectedSections, setAiSelectedSections] = useState<string[]>(defaultAiSections);
  const [aiResult, setAiResult] = useState<AiDraftResponse | null>(null);
  const [aiAppliedSections, setAiAppliedSections] = useState<Record<string, boolean>>({});
  const [aiVariantDrafts, setAiVariantDrafts] = useState<Record<string, AiVariantDraft>>({});
  const [aiFilteringDraft, setAiFilteringDraft] = useState<AiFilteringDraftEntry[]>([]);
  const [aiPricingDraft, setAiPricingDraft] = useState<AiPricingDraft>({ price: '', currencyCode: '' });
  const [aiMappingMissing, setAiMappingMissing] = useState<AiMappingIssues | null>(null);
  const [aiMappingOverrides, setAiMappingOverrides] = useState<AiMappingOverridesState>(() =>
    createEmptyMappingOverrides()
  );
  const [aiConfirmedOverrides, setAiConfirmedOverrides] = useState<MappingOverridesPayload | undefined>(undefined);
  const [aiMappingError, setAiMappingError] = useState<string | null>(null);
  const [aiMappingReady, setAiMappingReady] = useState(false);
  const [filteringValueLibrary, setFilteringValueLibrary] = useState<string[]>([]);
  const [filteringValueLabels, setFilteringValueLabels] = useState<Record<string, string>>({});
  const [aiFilteringValueInputs, setAiFilteringValueInputs] = useState<Record<string, string>>({});

  const getFilteringStatus = useCallback(
    (item: MissingFilteringMapping): MappingStatus => {
      const override = aiMappingOverrides.filtering[item.master_key];
      const totalValues = item.values?.length ?? 0;

      if (!override) {
        return {
          complete: false,
          issues: [`Vyber cílový parametr pro ${item.label ?? item.master_key}`],
          resolvedValues: 0,
          totalValues,
          targetLabel: null,
          ignore: false,
        };
      }

      if (override.ignore) {
        return {
          complete: true,
          issues: [],
          resolvedValues: totalValues,
          totalValues,
          targetLabel: 'Ignorováno',
          ignore: true,
        };
      }

      const targetAttribute = override.targetKey
        ? filteringTargetAttributes.find((attribute) => attribute.key === override.targetKey)
        : null;
      const issues: string[] = [];
      if (!override.targetKey) {
        issues.push(`Vyber cílový parametr pro ${item.label ?? item.master_key}`);
      }

      let resolvedValues = 0;
      (item.values ?? []).forEach((value) => {
        const valueOverride = override.values[value.master_value_key];
        if (!valueOverride) {
          issues.push(`Vyber hodnotu pro ${value.label ?? value.master_value_key}`);
          return;
        }

        if (valueOverride.mode === 'ignore') {
          resolvedValues += 1;
          return;
        }

        if (!valueOverride.targetValueKey) {
          issues.push(`Vyber hodnotu pro ${value.label ?? value.master_value_key}`);
          return;
        }

        resolvedValues += 1;
      });

      return {
        complete: issues.length === 0,
        issues,
        resolvedValues,
        totalValues,
        targetLabel: targetAttribute?.label ?? targetAttribute?.code ?? override.targetKey ?? null,
        ignore: false,
      };
    },
    [aiMappingOverrides, filteringTargetAttributes]
  );

  const getVariantStatus = useCallback(
    (item: MissingVariantMapping): MappingStatus => {
      const variantOverrides = aiMappingOverrides.variants[item.variant_code] ?? {};
      const override = variantOverrides[item.parameter_key];
      const totalValues = item.values?.length ?? 0;
      const variantLabel = `${item.variant_code}${item.variant_name ? ` (${item.variant_name})` : ''}`;

      if (!override) {
        return {
          complete: false,
          issues: [`Doplň mapování pro variantu ${variantLabel} – ${item.label ?? item.parameter_key}`],
          resolvedValues: 0,
          totalValues,
          targetLabel: null,
          ignore: false,
        };
      }

      if (override.ignore) {
        return {
          complete: true,
          issues: [],
          resolvedValues: totalValues,
          totalValues,
          targetLabel: 'Ignorováno',
          ignore: true,
        };
      }

      const targetAttribute = override.targetKey
        ? variantTargetAttributes.find((attribute) => attribute.key === override.targetKey)
        : null;
      const issues: string[] = [];
      if (!override.targetKey) {
        issues.push(`Vyber cílový parametr pro variantu ${variantLabel} – ${item.label ?? item.parameter_key}`);
      }

      let resolvedValues = 0;
      (item.values ?? []).forEach((value) => {
        const valueOverride = override.values[value.master_value_key];
        if (!valueOverride) {
          issues.push(`Vyber hodnotu pro variantu ${variantLabel} – ${value.label ?? value.master_value_key}`);
          return;
        }

        if (valueOverride.mode === 'ignore') {
          resolvedValues += 1;
          return;
        }

        if (!valueOverride.targetValueKey) {
          issues.push(`Vyber hodnotu pro variantu ${variantLabel} – ${value.label ?? value.master_value_key}`);
          return;
        }

        resolvedValues += 1;
      });

      return {
        complete: issues.length === 0,
        issues,
        resolvedValues,
        totalValues,
        targetLabel: targetAttribute?.label ?? targetAttribute?.code ?? override.targetKey ?? null,
        ignore: false,
      };
    },
    [aiMappingOverrides, variantTargetAttributes]
  );

  const filteringProgress = useMemo(() => {
    const items = aiMappingMissing?.filtering_parameters ?? [];
    let resolved = 0;
    const statusMap = new Map<string, MappingStatus>();

    items.forEach((item) => {
      const status = getFilteringStatus(item);
      if (status.complete) {
        resolved += 1;
      }
      statusMap.set(item.master_key, status);
    });

    return {
      total: items.length,
      resolved,
      statusMap,
    };
  }, [aiMappingMissing, getFilteringStatus]);

  const variantProgress = useMemo(() => {
    const items = aiMappingMissing?.variants ?? [];
    let resolved = 0;
    const statusMap = new Map<string, MappingStatus>();

    items.forEach((item) => {
      const key = `${item.variant_code}-${item.parameter_key}`;
      const status = getVariantStatus(item);
      if (status.complete) {
        resolved += 1;
      }
      statusMap.set(key, status);
    });

    return {
      total: items.length,
      resolved,
      statusMap,
    };
  }, [aiMappingMissing, getVariantStatus]);

  const parseOverlayJsonObject = useCallback((): Record<string, unknown> => {
    if (productOverlayJson.trim() === '') {
      return {};
    }

    try {
      const parsed = JSON.parse(productOverlayJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      // ignore parsing errors here – validation happens on save
    }

    return {};
  }, [productOverlayJson]);

  const buildOverlayImagesPayload = useCallback(
    (imagesState: ProductOverlayImageFormState[] = productOverlayImages) =>
      imagesState.map((item) => {
        const base = { ...(item.original ?? {}) };
        if (item.title !== '') {
          base['title'] = item.title;
        }

        if (item.description !== '') {
          base['description'] = item.description;
        }

        if (! base['sourceUrl'] && item.source) {
          base['sourceUrl'] = item.source;
        }

        return base;
      }),
    [productOverlayImages]
  );

  const handleOverlayImageChange = useCallback(
    (id: string, changes: Partial<ProductOverlayImageFormState>) => {
      setProductOverlayImages((prev) =>
        prev.map((image) => (image.id === id ? { ...image, ...changes } : image))
      );
    },
    []
  );

  const handleAiVariantDraftChange = useCallback((code: string, changes: Partial<AiVariantDraft>) => {
    setAiVariantDrafts((current) => {
      const draft = current[code];
      if (!draft) {
        return current;
      }

      return {
        ...current,
        [code]: {
          ...draft,
          ...changes,
        },
      };
    });
  }, []);

  const handleAiVariantParameterChange = useCallback(
    (code: string, index: number, changes: Partial<VariantParameterFormValue>) => {
      setAiVariantDrafts((current) => {
        const draft = current[code];
        if (!draft) {
          return current;
        }

        const parameters = draft.parameters.map((parameter, parameterIndex) =>
          parameterIndex === index ? { ...parameter, ...changes } : parameter
        );

        return {
          ...current,
          [code]: {
            ...draft,
            parameters,
          },
        };
      });
    },
    []
  );

  const handleAiFilteringChange = useCallback((id: string, changes: Partial<AiFilteringDraftEntry>) => {
    setAiFilteringDraft((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry))
    );
  }, []);

  const handleAiFilteringValueChange = useCallback((id: string, values: string[]) => {
    setAiFilteringDraft((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, values } : entry))
    );
  }, []);

  const handleAiFilteringValueInputChange = useCallback((id: string, value: string) => {
    setAiFilteringValueInputs((current) => ({
      ...current,
      [id]: value,
    }));
  }, []);

  const handleAiFilteringValueInputSubmit = useCallback(
    (id: string) => {
      const draftValue = (aiFilteringValueInputs[id] ?? '').trim();
      if (draftValue === '') {
        return;
      }

      setAiFilteringDraft((current) =>
        current.map((entry) => {
          if (entry.id !== id || entry.values.includes(draftValue)) {
            return entry;
          }

          return {
            ...entry,
            values: [...entry.values, draftValue],
          };
        })
      );

      setAiFilteringValueInputs((current) => ({ ...current, [id]: '' }));
    },
    [aiFilteringValueInputs]
  );

  const handleAiFilteringAdd = useCallback(() => {
    setAiFilteringDraft((current) => [
      ...current,
      { id: createRowId(), code: '', values: [], valueLabels: {} },
    ]);
  }, []);

  const handleAiFilteringRemove = useCallback((id: string) => {
    setAiFilteringDraft((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const handleFilteringOverrideFieldChange = useCallback(
    (masterKey: string, changes: Partial<{ targetKey: string | null; ignore: boolean }>) => {
      setAiMappingOverrides((current) => {
        const existing = current.filtering[masterKey] ?? {
          targetKey: null,
          ignore: false,
          values: {},
        };

        return {
          filtering: {
            ...current.filtering,
            [masterKey]: {
              ...existing,
              ...changes,
            },
          },
          variants: current.variants,
        };
      });
    },
    []
  );

  const handleFilteringValueOverrideChange = useCallback(
    (masterKey: string, valueKey: string, changes: Partial<MappingValueOverrideState>) => {
      setAiMappingOverrides((current) => {
        const existing = current.filtering[masterKey] ?? {
          targetKey: null,
          ignore: false,
          values: {},
        };
        const valueState = existing.values[valueKey] ?? { targetValueKey: null, mode: 'map' };

        return {
          filtering: {
            ...current.filtering,
            [masterKey]: {
              ...existing,
              values: {
                ...existing.values,
                [valueKey]: {
                  ...valueState,
                  ...changes,
                },
              },
            },
          },
          variants: current.variants,
        };
      });
    },
    []
  );

  const handleVariantOverrideFieldChange = useCallback(
    (variantCode: string, parameterKey: string, changes: Partial<{ targetKey: string | null; ignore: boolean }>) => {
      setAiMappingOverrides((current) => {
        const variantEntries = { ...(current.variants[variantCode] ?? {}) };
        const existing = variantEntries[parameterKey] ?? {
          targetKey: null,
          ignore: false,
          values: {},
        };

        return {
          filtering: current.filtering,
          variants: {
            ...current.variants,
            [variantCode]: {
              ...variantEntries,
              [parameterKey]: {
                ...existing,
                ...changes,
              },
            },
          },
        };
      });
    },
    []
  );

  const handleVariantValueOverrideChange = useCallback(
    (variantCode: string, parameterKey: string, valueKey: string, changes: Partial<MappingValueOverrideState>) => {
      setAiMappingOverrides((current) => {
        const variantEntries = { ...(current.variants[variantCode] ?? {}) };
        const existing = variantEntries[parameterKey] ?? {
          targetKey: null,
          ignore: false,
          values: {},
        };
        const valueState = existing.values[valueKey] ?? { targetValueKey: null, mode: 'map' };

        variantEntries[parameterKey] = {
          ...existing,
          values: {
            ...existing.values,
            [valueKey]: {
              ...valueState,
              ...changes,
            },
          },
        };

        return {
          filtering: current.filtering,
          variants: {
            ...current.variants,
            [variantCode]: variantEntries,
          },
        };
      });
    },
    []
  );

  const buildMappingOverridesPayload = useCallback((): MappingOverridesPayload | undefined => {
    const filteringPayload = Object.entries(aiMappingOverrides.filtering)
      .map(([masterKey, entry]) => {
        const valuesPayload = Object.entries(entry.values)
          .map(([valueKey, valueEntry]) => {
            if (valueEntry.mode === 'ignore') {
              return { master_value_key: valueKey, target_value_key: null };
            }

            if (!valueEntry.targetValueKey) {
              return null;
            }

            return {
              master_value_key: valueKey,
              target_value_key: valueEntry.targetValueKey,
            };
          })
          .filter((item): item is { master_value_key: string; target_value_key: string | null } => Boolean(item));

        const shouldInclude =
          entry.ignore || (entry.targetKey !== null && entry.targetKey !== '') || valuesPayload.length > 0;

        if (!shouldInclude) {
          return null;
        }

        return {
          master_key: masterKey,
          target_key: entry.ignore ? null : entry.targetKey,
          ignore: entry.ignore,
          values: valuesPayload.length > 0 ? valuesPayload : undefined,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const variantPayload = Object.entries(aiMappingOverrides.variants)
      .flatMap(([variantCode, parameters]) =>
        Object.entries(parameters).map(([parameterKey, entry]) => {
          const valuesPayload = Object.entries(entry.values)
            .map(([valueKey, valueEntry]) => {
              if (valueEntry.mode === 'ignore') {
                return { master_value_key: valueKey, target_value_key: null };
              }

              if (!valueEntry.targetValueKey) {
                return null;
              }

              return {
                master_value_key: valueKey,
                target_value_key: valueEntry.targetValueKey,
              };
            })
            .filter((item): item is { master_value_key: string; target_value_key: string | null } => Boolean(item));

          const shouldInclude =
            entry.ignore || (entry.targetKey !== null && entry.targetKey !== '') || valuesPayload.length > 0;

          if (!shouldInclude) {
            return null;
          }

          return {
            variant_code: variantCode,
            parameter_key: parameterKey,
            target_key: entry.ignore ? null : entry.targetKey,
            ignore: entry.ignore,
            values: valuesPayload.length > 0 ? valuesPayload : undefined,
          };
        })
      )
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const payload: MappingOverridesPayload = {};
    if (filteringPayload.length > 0) {
      payload.filtering_parameters = filteringPayload;
    }
    if (variantPayload.length > 0) {
      payload.variants = variantPayload;
    }

    return Object.keys(payload).length > 0 ? payload : undefined;
  }, [aiMappingOverrides]);

  const getEffectiveMappingOverrides = useCallback((): MappingOverridesPayload | undefined => {
    const payload = buildMappingOverridesPayload();
    if (payload) {
      return payload;
    }

    return aiConfirmedOverrides;
  }, [aiConfirmedOverrides, buildMappingOverridesPayload]);

  const validateMappingOverrides = useCallback(() => {
    if (!aiMappingMissing) {
      return true;
    }

    const errors: string[] = [];

    (aiMappingMissing.filtering_parameters ?? []).forEach((item) => {
      const status = getFilteringStatus(item);
      if (!status.complete) {
        errors.push(status.issues[0] ?? `Doplň mapování pro parametr ${item.label ?? item.master_key}`);
      }
    });

    (aiMappingMissing.variants ?? []).forEach((item) => {
      const status = getVariantStatus(item);
      if (!status.complete) {
        errors.push(
          status.issues[0] ??
            `Doplň mapování pro variantu ${item.variant_code}${item.variant_name ? ` (${item.variant_name})` : ''}`
        );
      }
    });

    if (errors.length > 0) {
      notifications.show({ message: errors[0], color: 'yellow' });
      return false;
    }

    return true;
  }, [aiMappingMissing, getFilteringStatus, getVariantStatus, notifications]);


  const handleAiAppliedSectionChange = useCallback((section: string, checked: boolean) => {
    setAiAppliedSections((prev) => ({
      ...prev,
      [section]: checked,
    }));
  }, []);

  const applyAiSuggestion = useCallback(() => {
    if (!aiResult) {
      closeAiModal();
      return;
    }

    const sectionsToApply = aiResult.sections.filter((section) => aiAppliedSections[section]);

    if (sectionsToApply.length === 0) {
      notifications.show({ message: 'Vyber alespoň jednu sekci, kterou chceš použít.', color: 'yellow' });
      return;
    }

    const translationPayload = aiResult.translation ?? {};

    if (sectionsToApply.includes('text')) {
      form.setValue('name', translationPayload.name ?? '', { shouldDirty: true });
      form.setValue('short_description', translationPayload.short_description ?? '', { shouldDirty: true });
      form.setValue('description', translationPayload.description ?? '', { shouldDirty: true });
    }

    if (sectionsToApply.includes('seo') && translationPayload.seo) {
      form.setValue('seo_meta_title', translationPayload.seo?.metaTitle ?? '', { shouldDirty: true });
      form.setValue('seo_meta_description', translationPayload.seo?.metaDescription ?? '', {
        shouldDirty: true,
      });
    }

    if (sectionsToApply.includes('parameters')) {
      const descriptiveFormValues = toDescriptiveParameterFormValues(translationPayload.parameters);
      if (descriptiveFormValues.length > 0) {
        form.setValue('descriptive_parameters', descriptiveFormValues, { shouldDirty: true });
      }
    }

    if (sectionsToApply.includes('filtering_parameters')) {
      const filteringFormValues =
        aiFilteringDraft.length > 0
          ? aiFilteringDraftToFormValues(aiFilteringDraft)
          : toFilteringParameterFormValues(translationPayload.filtering_parameters);

      if (filteringFormValues.length > 0) {
        form.setValue('filtering_parameters', filteringFormValues, { shouldDirty: true });
      }
    }

    if (sectionsToApply.includes('slug') && aiResult.slug) {
      setProductOverlayIndexName(aiResult.slug);
    }

    if (sectionsToApply.includes('images') && Array.isArray(aiResult.images)) {
      setProductOverlayImages((prev) => {
        const existingBySource = new Map<string, ProductOverlayImageFormState>();
        prev.forEach((image) => {
          existingBySource.set(image.source, image);
        });

        const merged: ProductOverlayImageFormState[] = prev.map((image) => ({ ...image }));

        aiResult.images?.forEach((image, index) => {
          if (!image) {
            return;
          }

          const source = image.source ?? `image-${index + 1}`;
          const existingIndex = merged.findIndex((item) => item.source === source || item.id === source);

          if (existingIndex >= 0) {
            merged[existingIndex] = {
              ...merged[existingIndex],
              title: typeof image.title === 'string' ? image.title ?? '' : merged[existingIndex].title,
              description:
                typeof image.alt === 'string' ? image.alt ?? '' : merged[existingIndex].description,
            };
          } else {
            merged.push({
              id: source,
              source,
              title: typeof image.title === 'string' ? image.title ?? '' : '',
              description: typeof image.alt === 'string' ? image.alt ?? '' : '',
              original: { sourceUrl: source },
            });
          }
        });

        return merged;
      });
    }

    if (sectionsToApply.includes('variants')) {
      if (Object.keys(aiVariantDrafts).length === 0) {
        notifications.show({
          message: 'Varianty z AI nejsou k dispozici.',
          color: 'yellow',
        });
      } else {
        setVariantOverlayForms((prev) => {
          const next = { ...prev };

          Object.values(aiVariantDrafts).forEach((draft) => {
            if (!draft.code) {
              return;
            }

            const variantInfo = variantIdByCode.get(draft.code);
            if (!variantInfo) {
              return;
            }

            const existing = next[variantInfo.id] ?? createEmptyVariantOverlayFormState();

            next[variantInfo.id] = {
              ...existing,
              name: draft.name || existing.name,
              parameters: draft.parameters,
              price: draft.price !== '' ? draft.price : existing.price,
              purchase_price: draft.purchasePrice !== '' ? draft.purchasePrice : existing.purchase_price,
              vat_rate: draft.vatRate !== '' ? draft.vatRate : existing.vat_rate,
              stock: draft.stock !== '' ? draft.stock : existing.stock,
              currency_code: draft.currencyCode || existing.currency_code,
            };
          });

          return next;
        });
      }
    }

    if (sectionsToApply.includes('pricing')) {
      if (aiPricingDraft.currencyCode) {
        setProductOverlayCurrency(aiPricingDraft.currencyCode);
      }

      if (aiPricingDraft.price !== '' && !Number.isNaN(Number(aiPricingDraft.price))) {
        const normalizedPrice = Number(aiPricingDraft.price);
        setVariantOverlayForms((prev) => {
          const next = { ...prev };
          variants.forEach((variant) => {
            const existing = next[variant.id] ?? createEmptyVariantOverlayFormState();
            next[variant.id] = {
              ...existing,
              price: String(normalizedPrice),
            };
          });

          return next;
        });
      }
    }

    notifications.show({ message: 'AI návrh byl vložen do formuláře.', color: 'teal' });
    setAiResult(null);
    setAiAppliedSections({});
    setAiSelectedSections(defaultAiSections);
    setAiVariantDrafts({});
    setAiFilteringDraft([]);
    setAiPricingDraft({
      price: '',
      currencyCode: selectedShop?.currency_code ?? '',
    });
    setAiMappingMissing(null);
    setAiMappingOverrides(createEmptyMappingOverrides());
    setAiMappingError(null);
    setAiConfirmedOverrides(undefined);
    setAiStep('mapping');
    closeAiModal();
  }, [
    aiAppliedSections,
    aiFilteringDraft,
    aiPricingDraft,
    aiVariantDrafts,
    closeAiModal,
    createEmptyVariantOverlayFormState,
    defaultAiSections,
    form,
    notifications,
    selectedShop,
    setProductOverlayCurrency,
    setVariantOverlayForms,
    variantIdByCode,
    variants,
  ]);

  const renderAiSectionPreview = (section: string) => {
    const requiresAiResult = ['text', 'seo', 'slug', 'parameters', 'images'];
    if (!aiResult && requiresAiResult.includes(section)) {
      return <Text size="sm">Žádná data.</Text>;
    }

    switch (section) {
      case 'text': {
        if (!aiResult) {
          return <Text size="sm">Žádná data.</Text>;
        }

        return (
          <Stack gap="xs">
            <Text fw={600}>Název</Text>
            <Text>{aiResult.translation.name ?? '—'}</Text>
            <Text fw={600}>Krátký popis</Text>
            <ScrollArea h={120} type="always" offsetScrollbars>
              <Text>{aiResult.translation.short_description ?? '—'}</Text>
            </ScrollArea>
            <Text fw={600}>Popis</Text>
            <ScrollArea h={160} type="always" offsetScrollbars>
              <Text>{aiResult.translation.description ?? '—'}</Text>
            </ScrollArea>
          </Stack>
        );
      }
      case 'seo': {
        if (!aiResult) {
          return <Text size="sm">Žádná data.</Text>;
        }

        return (
          <Stack gap="xs">
            <Text fw={600}>Meta title</Text>
            <Text>{aiResult.translation.seo?.metaTitle ?? '—'}</Text>
            <Text fw={600}>Meta description</Text>
            <Text>{aiResult.translation.seo?.metaDescription ?? '—'}</Text>
          </Stack>
        );
      }
      case 'slug': {
        if (!aiResult) {
          return <Text size="sm">Žádná data.</Text>;
        }

        return <Text>{aiResult.slug ?? '—'}</Text>;
      }
      case 'parameters': {
        if (!aiResult) {
          return <Text size="sm">Žádná data.</Text>;
        }

        if (!aiResult.translation.parameters) {
          return <Text size="sm">Bez parametrů.</Text>;
        }

        return (
          <JsonInput
            readOnly
            autosize
            minRows={6}
            value={JSON.stringify(aiResult.translation.parameters, null, 2)}
          />
        );
      }
      case 'filtering_parameters': {
        if (aiFilteringDraft.length === 0) {
          return <Text size="sm">Žádné filtrační parametry.</Text>;
        }

        return (
          <Stack gap="sm">
            {aiFilteringDraft.map((entry) => {
              const codeOptions = Array.from(
                new Set([entry.code, ...aiFilteringDraft.map((item) => item.code).filter(Boolean)])
              )
                .filter((code): code is string => typeof code === 'string' && code.trim() !== '')
                .map((code) => ({ value: code, label: code }));

              const valueOptions = Array.from(
                new Set([...filteringValueLibrary, ...entry.values].filter((value) => value.trim() !== ''))
              )
                .filter((value): value is string => value.trim() !== '')
                .map((value) => ({
                  value,
                  label: entry.valueLabels[value] ?? filteringValueLabels[value] ?? value,
                }));

              const customValue = aiFilteringValueInputs[entry.id] ?? '';

              return (
                <Card key={entry.id} withBorder radius="md" p="sm">
                  <Stack gap="xs">
                    <Autocomplete
                      label="Kód filtru"
                      data={codeOptions}
                      value={entry.code}
                      placeholder="Vyber nebo zadej kód"
                      onChange={(value) => handleAiFilteringChange(entry.id, { code: value ?? '' })}
                    />
                    <MultiSelect
                      label="Hodnoty"
                      data={valueOptions}
                      value={entry.values}
                      searchable
                      placeholder="Vyber hodnoty"
                      onChange={(values) => handleAiFilteringValueChange(entry.id, values)}
                    />
                    <Group align="flex-end" gap="xs">
                      <TextInput
                        label="Přidat novou hodnotu"
                        placeholder="Např. Modrá"
                        value={customValue}
                        onChange={(event) =>
                          handleAiFilteringValueInputChange(entry.id, event.currentTarget.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleAiFilteringValueInputSubmit(entry.id);
                          }
                        }}
                        flex={1}
                      />
                      <Button
                        mt={22}
                        onClick={() => handleAiFilteringValueInputSubmit(entry.id)}
                        disabled={customValue.trim() === ''}
                      >
                        Přidat
                      </Button>
                    </Group>
                    <Group justify="flex-end">
                      <Button
                        variant="subtle"
                        color="red"
                        size="xs"
                        onClick={() => handleAiFilteringRemove(entry.id)}
                      >
                        Odebrat filtr
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              );
            })}
            <Group justify="flex-end">
              <Button variant="light" size="xs" onClick={handleAiFilteringAdd}>
                Přidat filtr
              </Button>
            </Group>
          </Stack>
        );
      }
      case 'images': {
        if (!aiResult) {
          return <Text size="sm">Žádné návrhy.</Text>;
        }

        if (!aiResult.images || aiResult.images.length === 0) {
          return <Text size="sm">Žádné návrhy.</Text>;
        }

        return (
          <Stack gap="xs">
            {aiResult.images.map((image, index) => (
              <Stack key={`${image?.source ?? index}`} gap={4}>
                <Text fw={600}>{image?.source ?? `Obrázek ${index + 1}`}</Text>
                <Text size="sm" c="dimmed">
                  Titulek: {image?.title ?? '—'}
                </Text>
                <Text size="sm" c="dimmed">
                  Alt: {image?.alt ?? '—'}
                </Text>
              </Stack>
            ))}
          </Stack>
        );
      }
      case 'variants': {
        const variantDraftList = Object.values(aiVariantDrafts);

        if (variantDraftList.length === 0) {
          return <Text size="sm">Žádné varianty.</Text>;
        }

        return (
          <Stack gap="md">
            {variantDraftList.map((variant) => (
              <Card key={variant.code} withBorder radius="md" p="sm">
                <Stack gap="sm">
                  <Text fw={600}>{variant.code}</Text>
                  <TextInput
                    label="Název varianty"
                    value={variant.name}
                    onChange={(event) =>
                      handleAiVariantDraftChange(variant.code, { name: event.currentTarget.value })
                    }
                  />
                  <Group grow>
                    <NumberInput
                      label="Cena"
                      value={variant.price === '' ? undefined : Number(variant.price)}
                      decimalScale={2}
                      thousandSeparator=" "
                      onChange={(value) =>
                        handleAiVariantDraftChange(variant.code, {
                          price: value === '' || value === undefined ? '' : String(value),
                        })
                      }
                    />
                    <Select
                      label="Měna"
                      data={currencyOptions}
                      value={variant.currencyCode === '' ? null : variant.currencyCode}
                      allowDeselect
                      onChange={(value) => handleAiVariantDraftChange(variant.code, { currencyCode: value ?? '' })}
                    />
                  </Group>
                  <Group grow>
                    <NumberInput
                      label="Nákupní cena"
                      value={variant.purchasePrice === '' ? undefined : Number(variant.purchasePrice)}
                      decimalScale={2}
                      thousandSeparator=" "
                      onChange={(value) =>
                        handleAiVariantDraftChange(variant.code, {
                          purchasePrice: value === '' || value === undefined ? '' : String(value),
                        })
                      }
                    />
                    <NumberInput
                      label="DPH (%)"
                      value={variant.vatRate === '' ? undefined : Number(variant.vatRate)}
                      decimalScale={2}
                      onChange={(value) =>
                        handleAiVariantDraftChange(variant.code, {
                          vatRate: value === '' || value === undefined ? '' : String(value),
                        })
                      }
                    />
                  </Group>
                  <Group grow>
                    <NumberInput
                      label="Sklad"
                      value={variant.stock === '' ? undefined : Number(variant.stock)}
                      decimalScale={2}
                      onChange={(value) =>
                        handleAiVariantDraftChange(variant.code, {
                          stock: value === '' || value === undefined ? '' : String(value),
                        })
                      }
                    />
                  </Group>
                  <Stack gap="xs">
                    {variant.parameters.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        Parametry varianty nejsou k dispozici.
                      </Text>
                    ) : (
                      variant.parameters.map((parameter, index) => (
                        <Card key={parameter.id ?? `${variant.code}-${index}`} withBorder radius="md" p="sm">
                          <Stack gap="xs">
                            <TextInput
                              label="Parametr"
                              value={parameter.name}
                              onChange={(event) =>
                                handleAiVariantParameterChange(
                                  variant.code,
                                  index,
                                  { name: event.currentTarget.value }
                                )
                              }
                            />
                            <TextInput
                              label="Hodnota"
                              value={parameter.value}
                              onChange={(event) =>
                                handleAiVariantParameterChange(
                                  variant.code,
                                  index,
                                  { value: event.currentTarget.value }
                                )
                              }
                            />
                          </Stack>
                        </Card>
                      ))
                    )}
                  </Stack>
                </Stack>
              </Card>
            ))}
          </Stack>
        );
      }
      case 'pricing': {
        return (
          <Group grow>
            <NumberInput
              label="Výchozí cena"
              value={aiPricingDraft.price === '' ? undefined : Number(aiPricingDraft.price)}
              decimalScale={2}
              thousandSeparator=" "
              onChange={(value) =>
                setAiPricingDraft((current) => ({
                  ...current,
                  price: value === '' || value === undefined || value === null ? '' : String(value),
                }))
              }
            />
            <Select
              label="Měna"
              data={currencyOptions}
              value={aiPricingDraft.currencyCode}
              onChange={(value) =>
                setAiPricingDraft((current) => ({
                  ...current,
                  currencyCode: value ?? '',
                }))
              }
              searchable
            />
          </Group>
        );
      }
      default:
        return <Text size="sm">Náhled není k dispozici.</Text>;
    }
  };

  const renderFilteringMappingEditor = () => {
    const items = aiMappingMissing?.filtering_parameters ?? [];
    if (items.length === 0) {
      return null;
    }

    return (
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Title order={6}>Filtrační parametry</Title>
          <Badge
            color={filteringProgress.resolved === filteringProgress.total ? 'teal' : 'yellow'}
            variant="light"
          >
            {filteringProgress.resolved}/{filteringProgress.total} připraveno
          </Badge>
        </Group>
        {items.map((item) => {
          const override = aiMappingOverrides.filtering[item.master_key];
          const targetKey = override?.targetKey ?? null;
          const targetAttribute = filteringTargetAttributes.find((attribute) => attribute.key === targetKey);
          const valueOptions =
            targetAttribute?.values?.map((value) => ({
              value: value.key,
              label: value.label ?? value.key,
            })) ?? [];
          const status = filteringProgress.statusMap.get(item.master_key);
          const isComplete = status?.complete ?? false;
          const statusMessage = status?.issues[0]
            ?? (status?.ignore ? 'Parametr bude ignorován.' : status?.targetLabel ? `Cíl: ${status.targetLabel}` : 'Vyber cílový parametr.');
          const values = item.values ?? [];
          const valuesContent = (
            <Stack gap="xs">
              {values.map((value) => {
                const valueOverride = override?.values[value.master_value_key];
                const mode = valueOverride?.mode ?? 'map';

                return (
                  <Card key={value.master_value_key} withBorder radius="md" p="sm">
                    <Stack gap={8}>
                      <Group justify="space-between" align="center">
                        <div>
                          <Text size="sm" fw={500}>
                            {value.label ?? value.master_value_key}
                          </Text>
                          <Text size="xs" c="dimmed">
                            Kód: {value.master_value_key}
                          </Text>
                        </div>
                        <Checkbox
                          label="Ignorovat hodnotu"
                          size="xs"
                          checked={mode === 'ignore'}
                          onChange={(event) =>
                            handleFilteringValueOverrideChange(item.master_key, value.master_value_key, {
                              mode: event.currentTarget.checked ? 'ignore' : 'map',
                              targetValueKey: event.currentTarget.checked
                                ? null
                                : valueOverride?.targetValueKey ?? null,
                            })
                          }
                        />
                      </Group>
                      <Select
                        label="Cílová hodnota"
                        placeholder={targetKey ? 'Vyber hodnotu' : 'Vyber parametr'}
                        data={valueOptions}
                        value={valueOverride?.targetValueKey ?? null}
                        disabled={override?.ignore || mode === 'ignore' || !targetKey}
                        onChange={(selected) =>
                          handleFilteringValueOverrideChange(item.master_key, value.master_value_key, {
                            targetValueKey: selected ?? null,
                            mode: 'map',
                          })
                        }
                        searchable
                      />
                    </Stack>
                  </Card>
                );
              })}
            </Stack>
          );

          return (
            <Card
              key={item.master_key}
              withBorder
              radius="md"
              p="sm"
              style={{
                borderColor: isComplete ? 'var(--mantine-color-teal-4)' : 'var(--mantine-color-yellow-4)',
              }}
            >
              <Stack gap="xs">
                <Group justify="space-between" align="flex-start">
                  <Group gap="sm" align="flex-start">
                    <ThemeIcon
                      color={isComplete ? 'teal' : 'yellow'}
                      variant="light"
                      radius="xl"
                      size="lg"
                    >
                      {isComplete ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />}
                    </ThemeIcon>
                    <Stack gap={0}>
                      <Text fw={600}>{item.label ?? item.master_key}</Text>
                      <Text size="xs" c="dimmed">
                        Kód: {item.master_key}
                      </Text>
                      <Text size="xs" c={isComplete ? 'teal' : 'orange'}>
                        {statusMessage}
                      </Text>
                    </Stack>
                  </Group>
                  <Group gap="xs" align="center">
                    {values.length > 0 && (
                      <Badge
                        color={isComplete ? 'teal' : 'yellow'}
                        variant="light"
                      >
                        Hodnoty {status?.resolvedValues ?? 0}/{values.length}
                      </Badge>
                    )}
                    <Checkbox
                      label="Ignorovat"
                      checked={override?.ignore ?? false}
                      onChange={(event) =>
                        handleFilteringOverrideFieldChange(item.master_key, { ignore: event.currentTarget.checked })
                      }
                    />
                  </Group>
                </Group>
                <Select
                  label="Cílový parametr"
                  placeholder="Vyber parametr"
                  data={filteringAttributeOptions}
                  value={targetKey}
                  disabled={override?.ignore}
                  onChange={(value) => handleFilteringOverrideFieldChange(item.master_key, { targetKey: value ?? null })}
                  searchable
                />
                {values.length > 0 && (
                  <div>
                    <Text size="xs" c="dimmed" mb={4}>
                      Hodnoty k namapování
                    </Text>
                    {values.length > 3 ? (
                      <Spoiler
                        maxHeight={200}
                        showLabel={`Zobrazit všechny (${values.length})`}
                        hideLabel="Skrýt hodnoty"
                      >
                        {valuesContent}
                      </Spoiler>
                    ) : (
                      valuesContent
                    )}
                  </div>
                )}
              </Stack>
            </Card>
          );
        })}
      </Stack>
    );
  };

  const renderMappingSummaryCards = () => {
    if (!aiMappingMissing) {
      return null;
    }

    const cards: ReactNode[] = [];

    if (filteringProgress.total > 0) {
      const complete = filteringProgress.resolved === filteringProgress.total;
      cards.push(
        <Card key="mapping-summary-filtering" withBorder radius="md" p="sm">
          <Group align="flex-start" justify="space-between">
            <Group align="flex-start" gap="sm">
              <ThemeIcon color={complete ? 'teal' : 'yellow'} variant="light" radius="xl">
                {complete ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />}
              </ThemeIcon>
              <Stack gap={0}>
                <Text fw={600}>Filtrační parametry</Text>
                <Text size="sm" c="dimmed">
                  {complete
                    ? 'Všechno připraveno.'
                    : `Zbývá doplnit ${filteringProgress.total - filteringProgress.resolved} z ${filteringProgress.total}.`}
                </Text>
              </Stack>
            </Group>
            <Badge color={complete ? 'teal' : 'yellow'} variant="light">
              {filteringProgress.resolved}/{filteringProgress.total}
            </Badge>
          </Group>
        </Card>
      );
    }

    if (variantProgress.total > 0) {
      const complete = variantProgress.resolved === variantProgress.total;
      cards.push(
        <Card key="mapping-summary-variants" withBorder radius="md" p="sm">
          <Group align="flex-start" justify="space-between">
            <Group align="flex-start" gap="sm">
              <ThemeIcon color={complete ? 'teal' : 'yellow'} variant="light" radius="xl">
                {complete ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />}
              </ThemeIcon>
              <Stack gap={0}>
                <Text fw={600}>Variantní parametry</Text>
                <Text size="sm" c="dimmed">
                  {complete
                    ? 'Všechno připraveno.'
                    : `Zbývá doplnit ${variantProgress.total - variantProgress.resolved} z ${variantProgress.total}.`}
                </Text>
              </Stack>
            </Group>
            <Badge color={complete ? 'teal' : 'yellow'} variant="light">
              {variantProgress.resolved}/{variantProgress.total}
            </Badge>
          </Group>
        </Card>
      );
    }

    if (cards.length === 0) {
      return null;
    }

    return (
      <SimpleGrid cols={{ base: 1, sm: Math.min(cards.length, 2) }}>
        {cards}
      </SimpleGrid>
    );
  };

  const renderVariantMappingEditor = () => {
    const items = aiMappingMissing?.variants ?? [];
    if (items.length === 0) {
      return null;
    }

    return (
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Title order={6}>Varianty</Title>
          <Badge
            color={variantProgress.resolved === variantProgress.total ? 'teal' : 'yellow'}
            variant="light"
          >
            {variantProgress.resolved}/{variantProgress.total} připraveno
          </Badge>
        </Group>
        {items.map((item) => {
          const variantOverrides = aiMappingOverrides.variants[item.variant_code] ?? {};
          const override = variantOverrides[item.parameter_key];
          const targetKey = override?.targetKey ?? null;
          const targetAttribute = variantTargetAttributes.find((attribute) => attribute.key === targetKey);
          const valueOptions =
            targetAttribute?.values?.map((value) => ({
              value: value.key,
              label: value.label ?? value.key,
            })) ?? [];
          const statusKey = `${item.variant_code}-${item.parameter_key}`;
          const status = variantProgress.statusMap.get(statusKey);
          const isComplete = status?.complete ?? false;
          const values = item.values ?? [];
          const valueCards = (
            <Stack gap="xs">
              {values.map((value) => {
                const valueOverrides = override?.values ?? {};
                const valueOverride = valueOverrides[value.master_value_key];
                const mode = valueOverride?.mode ?? 'map';

                return (
                  <Card key={`${item.variant_code}-${item.parameter_key}-${value.master_value_key}`} withBorder p="sm">
                    <Stack gap="xs">
                      <Group justify="space-between" align="center">
                        <div>
                          <Text size="sm">{value.label ?? value.master_value_key}</Text>
                          <Text size="xs" c="dimmed">
                            Kód: {value.master_value_key}
                          </Text>
                        </div>
                        <Checkbox
                          label="Ignorovat hodnotu"
                          size="xs"
                          checked={mode === 'ignore'}
                          onChange={(event) =>
                            handleVariantValueOverrideChange(
                              item.variant_code,
                              item.parameter_key,
                              value.master_value_key,
                              {
                                mode: event.currentTarget.checked ? 'ignore' : 'map',
                                targetValueKey: event.currentTarget.checked
                                  ? null
                                  : valueOverride?.targetValueKey ?? null,
                              }
                            )
                          }
                        />
                      </Group>
                      <Select
                        label="Cílová hodnota"
                        placeholder={targetKey ? 'Vyber hodnotu' : 'Vyber parametr'}
                        data={valueOptions}
                        value={valueOverride?.targetValueKey ?? null}
                        disabled={override?.ignore || mode === 'ignore' || !targetKey}
                        onChange={(selected) =>
                          handleVariantValueOverrideChange(
                            item.variant_code,
                            item.parameter_key,
                            value.master_value_key,
                            {
                              targetValueKey: selected ?? null,
                              mode: 'map',
                            }
                          )
                        }
                        searchable
                      />
                    </Stack>
                  </Card>
                );
              })}
            </Stack>
          );
          const variantLabel = `${item.variant_code}${item.variant_name ? ` – ${item.variant_name}` : ''}`;

          return (
            <Card
              key={`${item.variant_code}-${item.parameter_key}`}
              withBorder
              radius="md"
              p="sm"
              style={{
                borderColor: isComplete ? 'var(--mantine-color-teal-4)' : 'var(--mantine-color-yellow-4)',
              }}
            >
              <Stack gap="xs">
                <Group justify="space-between" align="flex-start">
                  <Group gap="sm" align="flex-start">
                    <ThemeIcon
                      color={isComplete ? 'teal' : 'yellow'}
                      variant="light"
                      radius="xl"
                      size="lg"
                    >
                      {isComplete ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />}
                    </ThemeIcon>
                    <Stack gap={0}>
                      <Text fw={600}>{variantLabel}</Text>
                      <Text size="sm">{item.label ?? item.parameter_key}</Text>
                      <Text size="xs" c={isComplete ? 'teal' : 'orange'}>
                        {status?.issues[0]
                          ?? (status?.ignore
                            ? 'Parametr bude ignorován.'
                            : status?.targetLabel
                              ? `Cíl: ${status.targetLabel}`
                              : 'Vyber cílový parametr.')}
                      </Text>
                    </Stack>
                  </Group>
                  <Group gap="xs" align="center">
                    {values.length > 0 && (
                      <Badge color={isComplete ? 'teal' : 'yellow'} variant="light">
                        Hodnoty {status?.resolvedValues ?? 0}/{values.length}
                      </Badge>
                    )}
                    <Checkbox
                      label="Ignorovat"
                      checked={override?.ignore ?? false}
                      onChange={(event) =>
                        handleVariantOverrideFieldChange(item.variant_code, item.parameter_key, {
                          ignore: event.currentTarget.checked,
                        })
                      }
                    />
                  </Group>
                </Group>
                <Select
                  label="Cílový parametr"
                  placeholder="Vyber parametr"
                  data={variantAttributeOptions}
                  value={targetKey}
                  disabled={override?.ignore}
                  onChange={(value) =>
                    handleVariantOverrideFieldChange(item.variant_code, item.parameter_key, {
                      targetKey: value ?? null,
                    })
                  }
                  searchable
                />
                {values.length > 0 && (
                  <div>
                    <Text size="xs" c="dimmed" mb={4}>
                      Hodnoty k namapování
                    </Text>
                    {values.length > 3 ? (
                      <Spoiler
                        maxHeight={200}
                        showLabel={`Zobrazit všechny (${values.length})`}
                        hideLabel="Skrýt hodnoty"
                      >
                        {valueCards}
                      </Spoiler>
                    ) : (
                      valueCards
                    )}
                  </div>
                )}
              </Stack>
            </Card>
          );
        })}
      </Stack>
    );
  };

  useEffect(() => {
    const current = parseOverlayJsonObject();
    const next = { ...current };

    if (productOverlayIndexName.trim() !== '') {
      next.indexName = productOverlayIndexName.trim();
    } else {
      delete next.indexName;
    }

    if (productOverlayImages.length > 0) {
      next.images = buildOverlayImagesPayload();
    } else {
      delete next.images;
    }

    const nextJson = JSON.stringify(next, null, 2);
    if (nextJson !== productOverlayJson) {
      setProductOverlayJson(nextJson);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildOverlayImagesPayload, parseOverlayJsonObject, productOverlayImages, productOverlayIndexName]);
  useEffect(() => {
    if (!product || selectedShopId !== null) {
      return;
    }

    const requestedShop = searchParams.get('shop');
    if (requestedShop) {
      const parsed = Number(requestedShop);
      if (!Number.isNaN(parsed)) {
        setSelectedShopId(parsed);
        return;
      }
    }

    const overlayShopIds = overlays.map((overlay) => overlay.shop_id);
    const defaultShopId = overlayShopIds.includes(product.shop_id)
      ? product.shop_id
      : overlayShopIds[0] ?? product.shop_id;

    setSelectedShopId(defaultShopId ?? null);
  }, [overlays, product, searchParams, selectedShopId]);

  useEffect(() => {
    if (!locales || selectedShopId === null) {
      return;
    }

    const overlay = overlays.find((item) => item.shop_id === selectedShopId);
    const fallbackLocale =
      selectedShop?.locale ??
      selectedShop?.default_locale ??
      overlay?.shop?.locale ??
      locales.default;

    if (fallbackLocale && fallbackLocale !== selectedLocale) {
      setSelectedLocale(fallbackLocale);
    }
  }, [locales, overlays, selectedLocale, selectedShop, selectedShopId]);

  useEffect(() => {
    if (isLoadingTranslation) {
      return;
    }

    const overlayData = (activeOverlay?.data ?? {}) as Record<string, unknown>;
    const seoSource = (translation?.seo ?? overlayData?.seo ?? {}) as Record<string, unknown>;

    const resolveMetaValue = (
      primary: unknown,
      fallbackKeys: string[]
    ): string => {
      if (typeof primary === 'string' && primary.trim() !== '') {
        return primary;
      }

      for (const key of fallbackKeys) {
        const value = overlayData[key];
        if (typeof value === 'string' && value.trim() !== '') {
          return value;
        }
      }

      return '';
    };

    const canonicalPayload = (product?.base_payload ?? {}) as Record<string, unknown>;

    const resolveDescriptiveSource = (): unknown => {
      let source: unknown = translation?.parameters ?? null;

      if (source && typeof source === 'object' && !Array.isArray(source)) {
        const record = source as Record<string, unknown>;
        if (Array.isArray(record.descriptiveParameters)) {
          source = record.descriptiveParameters;
        }
      }

      if (!source || (Array.isArray(source) && source.length === 0)) {
        const overlayDescriptive = overlayData.descriptiveParameters as unknown;
        const overlayParameters = overlayData.parameters as unknown;
        if (Array.isArray(overlayDescriptive)) {
          source = overlayDescriptive;
        } else if (Array.isArray(overlayParameters)) {
          source = overlayParameters;
        } else if (Array.isArray(canonicalPayload.descriptiveParameters)) {
          source = canonicalPayload.descriptiveParameters;
        }
      }

      return source;
    };

    const resolveFilteringSource = (): unknown => {
      let source: unknown = null;

      const translationParameters = translation?.parameters;
      if (translationParameters && typeof translationParameters === 'object') {
        const record = translationParameters as Record<string, unknown>;
        if (Array.isArray(record.filteringParameters)) {
          source = record.filteringParameters;
        }
      }

      if (!source || (Array.isArray(source) && source.length === 0)) {
        const overlayFiltering = overlayData.filteringParameters as unknown;
        if (Array.isArray(overlayFiltering)) {
          source = overlayFiltering;
        } else if (Array.isArray(canonicalPayload.filteringParameters)) {
          source = canonicalPayload.filteringParameters;
        }
      }

      return source;
    };

    form.reset({
      name:
        translation?.name ?? (overlayData?.name as string | undefined) ?? (overlayData?.title as string | undefined) ?? '',
      short_description:
        translation?.short_description ?? (overlayData?.shortDescription as string | undefined) ?? '',
      description:
        translation?.description ?? (overlayData?.description as string | undefined) ?? '',
      seo_meta_title: resolveMetaValue(seoSource['metaTitle'], ['metaTitle', 'seoTitle', 'title']),
      seo_meta_description: resolveMetaValue(
        seoSource['metaDescription'],
        ['metaDescription', 'seoDescription']
      ),
      descriptive_parameters: toDescriptiveParameterFormValues(resolveDescriptiveSource()),
      filtering_parameters: toFilteringParameterFormValues(resolveFilteringSource()),
    });
  }, [activeOverlay, form, isLoadingTranslation, product?.base_payload, translation]);

  useEffect(() => {
    setProductOverlayStatus(activeOverlay?.status ?? '');
    setProductOverlayCurrency(activeOverlay?.currency_code ?? '');
    const overlayData = (activeOverlay?.data ?? {}) as Record<string, unknown>;

    let indexName = '';
    if (typeof overlayData.indexName === 'string') {
      indexName = overlayData.indexName;
    } else if (
      overlayData._hub &&
      typeof overlayData._hub === 'object' &&
      overlayData._hub !== null &&
      typeof (overlayData._hub as Record<string, unknown>).indexName === 'string'
    ) {
      indexName = (overlayData._hub as Record<string, unknown>).indexName as string;
    }
    setProductOverlayIndexName(indexName);

    const baseImagesSource = (() => {
      if (Array.isArray(overlayData.images)) {
        return overlayData.images;
      }
      const canonical = (product?.base_payload ?? {}) as Record<string, unknown>;
      if (Array.isArray(canonical.images)) {
        return canonical.images;
      }
      return [];
    })();

    const normalizedImages: ProductOverlayImageFormState[] = baseImagesSource
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map((item, index) => {
        const record = item as Record<string, unknown>;
        const source =
          (typeof record.sourceUrl === 'string' && record.sourceUrl) ||
          (typeof record.url === 'string' && record.url) ||
          (typeof record.cdnUrl === 'string' && record.cdnUrl) ||
          (typeof record.cdnName === 'string' && record.cdnName) ||
          (typeof record.name === 'string' && record.name) ||
          `image-${index + 1}`;

        return {
          id: String(record.id ?? source ?? index),
          source,
          title: typeof record.title === 'string' ? record.title : '',
          description: typeof record.description === 'string' ? record.description : '',
          original: record,
        };
      });

    setProductOverlayImages(normalizedImages);
    setProductOverlayJson(activeOverlay?.data ? JSON.stringify(activeOverlay.data, null, 2) : '');
  }, [activeOverlay, product?.base_payload, selectedShopId]);

  useEffect(() => {
    if (selectedShopId === null || variants.length === 0) {
      setVariantOverlayForms((prev) => (Object.keys(prev).length > 0 ? {} : prev));
      return;
    }

    setVariantOverlayForms((prev) => {
      const nextState: Record<string, VariantOverlayFormState> = {};
      const numericToString = (value: number | null | undefined) =>
        value === null || value === undefined ? '' : String(value);

      variants.forEach((variant) => {
        const overlay = variant.overlays?.find((item) => item.shop_id === selectedShopId);
        const overlayData = (overlay?.data ?? {}) as Record<string, unknown>;
        const variantTranslations = variant.translations ?? [];
        const translationRecord =
          variantTranslations.find(
            (record) => record.shop_id === selectedShopId && record.locale === selectedLocale
          ) ??
          variantTranslations.find((record) => record.shop_id === selectedShopId) ??
          variantTranslations.find((record) => record.locale === selectedLocale) ??
          variantTranslations.find((record) => record.shop_id === null);
        const translationData = (translationRecord?.data ?? {}) as Record<string, unknown>;
        const canonicalData = (variant.data ?? {}) as Record<string, unknown>;

        const overlayAttributeCombination = asRecord(overlayData.attributeCombination);
        const translationAttributeCombination = asRecord(translationData.attributeCombination);
        const canonicalAttributeCombination = asRecord(canonicalData.attributeCombination);

        const overlayHubData = asRecord(overlayData['_hub']);
        const translationHubData = asRecord(translationData['_hub']);
        const canonicalHubData = asRecord(canonicalData['_hub']);

        const attributeCombination =
          overlayAttributeCombination ?? translationAttributeCombination ?? canonicalAttributeCombination;

        const name = pickFirstNonEmptyString(
          overlayData.name,
          overlayData.label,
          overlayData.title,
          attributeCombination?.label,
          attributeCombination?.name,
          translationRecord?.name,
          canonicalData?.name,
          variant.name
        );

        const parameterSources: unknown[] = [
          overlayData.parameters,
          overlayData.variantParameters,
          translationData?.parameters,
          attributeCombination?.parameters,
          overlayHubData?.suggestedParameters,
          overlayData.suggestedParameters,
          translationRecord?.parameters,
          translationData.variantParameters,
          translationAttributeCombination?.parameters,
          translationHubData?.suggestedParameters,
          canonicalData.parameters,
          canonicalData.variantParameters,
          canonicalAttributeCombination?.parameters,
          canonicalHubData?.suggestedParameters,
        ];

        const parameterSource =
          parameterSources
            .map((candidate) => extractParameterArray(candidate))
            .find((candidate) => candidate && candidate.length > 0) ?? [];
        const parameters = toVariantParameterFormValues(parameterSource);

        const additionalData = (() => {
          if (!overlayData || typeof overlayData !== 'object') {
            return '';
          }

          const rest = { ...(overlayData ?? {}) } as Record<string, unknown>;
          delete rest.name;
          delete rest.parameters;
          delete rest.variantParameters;
          delete rest.attributeCombination;

          return Object.keys(rest).length > 0 ? JSON.stringify(rest, null, 2) : '';
        })();

        const fallbackCurrency = variant.currency_code ?? '';
        const fallbackUnit = variant.unit ?? '';
        const overlayPrice = overlay?.price ?? variant.price ?? null;
        const overlayPurchasePrice = overlay?.purchase_price ?? variant.purchase_price ?? null;
        const overlayVatRate = overlay?.vat_rate ?? selectedShopDefaultVatRate ?? variant.vat_rate ?? null;
        const overlayStock = overlay?.stock ?? variant.stock ?? null;
        const overlayMinStock = overlay?.min_stock_supply ?? variant.min_stock_supply ?? null;

        nextState[variant.id] = {
          name,
          parameters,
          additional_data: additionalData,
          price: numericToString(overlayPrice),
          purchase_price: numericToString(overlayPurchasePrice),
          vat_rate: numericToString(overlayVatRate),
          stock: numericToString(overlayStock),
          min_stock_supply: numericToString(overlayMinStock),
          currency_code: overlay?.currency_code ?? fallbackCurrency,
          unit: overlay?.unit ?? fallbackUnit,
        };
      });

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(nextState);
      const sameKeys = prevKeys.length === nextKeys.length && prevKeys.every((key, index) => key === nextKeys[index]);

      if (sameKeys) {
        let changed = false;
        for (const key of nextKeys) {
          const prevState = prev[key];
          const nextFormState = nextState[key];
          if (!prevState) {
            changed = true;
            break;
          }
          const entries = Object.keys(nextFormState) as Array<keyof VariantOverlayFormState>;
          for (const field of entries) {
            if (prevState[field] !== nextFormState[field]) {
              changed = true;
              break;
            }
          }
          if (changed) {
            break;
          }
        }

        if (!changed) {
          return prev;
        }
      }

      return nextState;
    });
  }, [selectedLocale, selectedShopId, selectedShopDefaultVatRate, variants]);

  const shopOptions = useMemo(() => {
    if (shops.length > 0) {
      return shops.map((shop) => ({
        value: shop.id.toString(),
        label: shop.is_master
          ? `${shop.name} (master)`
          : shop.name ?? `Shop #${shop.id}`,
      }));
    }

    if (!product) {
      return [];
    }

    if (overlays.length === 0) {
      return [
        {
          value: product.shop_id.toString(),
          label: overlayShop?.name ?? (product.base_payload?.shopName as string | undefined) ?? `Shop #${product.shop_id}`,
        },
      ];
    }

    return overlays.map((overlay) => ({
      value: overlay.shop_id.toString(),
      label: overlay.shop?.name ?? (overlay.data?.shopName as string | undefined) ?? `Shop #${overlay.shop_id}`,
    }));
  }, [overlayShop?.name, overlays, product, shops]);

  const handleVariantOverlayFieldChange = (
    variantId: string,
    field: keyof VariantOverlayFormState,
    value: string
  ) => {
    setVariantOverlayForms((prev) => ({
      ...prev,
      [variantId]: {
        ...(prev[variantId] ?? createEmptyVariantOverlayFormState()),
        [field]: value,
      },
    }));
  };

  const handleVariantParameterAdd = (variantId: string) => {
    setVariantOverlayForms((prev) => {
      const current = prev[variantId] ?? createEmptyVariantOverlayFormState();
      const parameters = [
        ...current.parameters,
        { id: createRowId(), name: '', value: '', nameIndex: null, valueIndex: null },
      ];
      return {
        ...prev,
        [variantId]: {
          ...current,
          parameters,
        },
      };
    });
  };

  const handleVariantParameterChange = (
    variantId: string,
    index: number,
    field: keyof VariantParameterFormValue,
    value: string
  ) => {
    setVariantOverlayForms((prev) => {
      const current = prev[variantId] ?? createEmptyVariantOverlayFormState();
      const parameters = [...current.parameters];
      if (!parameters[index]) {
        return prev;
      }

      const nextParameter: VariantParameterFormValue = {
        ...parameters[index],
        [field]: value,
      };

      if (field === 'name') {
        nextParameter.nameIndex = null;
      }

      if (field === 'value') {
        nextParameter.valueIndex = null;
      }

      parameters[index] = nextParameter;

      return {
        ...prev,
        [variantId]: {
          ...current,
          parameters,
        },
      };
    });
  };

  const handleVariantParameterRemove = (variantId: string, index: number) => {
    setVariantOverlayForms((prev) => {
      const current = prev[variantId] ?? createEmptyVariantOverlayFormState();
      const parameters = current.parameters.filter((_, parameterIndex) => parameterIndex !== index);
      return {
        ...prev,
        [variantId]: {
          ...current,
          parameters,
        },
      };
    });
  };

  const handleVariantParametersReplace = (
    variantId: string,
    parameters: VariantParameterFormValue[]
  ) => {
    setVariantOverlayForms((prev) => {
      const current = prev[variantId] ?? createEmptyVariantOverlayFormState();
      return {
        ...prev,
        [variantId]: {
          ...current,
          parameters,
        },
      };
    });
  };

  const handleOpenProductJsonModal = () => {
    setProductJsonDraft(productOverlayJson);
    openProductJsonModal();
  };

  const handleConfirmProductJsonModal = () => {
    if (productJsonDraft.trim() === '') {
      setProductOverlayJson('');
      closeProductJsonModal();
      return;
    }

    try {
      const parsed = JSON.parse(productJsonDraft);
      if (typeof parsed !== 'object' && !Array.isArray(parsed)) {
        throw new Error('Overlay data musí být objekt nebo pole.');
      }
      setProductOverlayJson(JSON.stringify(parsed, null, 2));
      closeProductJsonModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Overlay data musí být validní JSON';
      notifications.show({ message, color: 'red' });
    }
  };

  const renderInfoGrid = (items: Array<{ label: string; value: ReactNode }>) => (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      {items.map((item) => (
        <div key={item.label}>
          <Text size="sm" c="dimmed">
            {item.label}
          </Text>
          <Text size="sm" fw={500} style={{ whiteSpace: 'pre-wrap' }}>
            {item.value ?? '—'}
          </Text>
        </div>
      ))}
    </SimpleGrid>
  );

  const renderKeyValueRows = (entries: Array<[string, unknown]>) => (
    <Table withRowBorders={false} verticalSpacing="xs">
      <Table.Tbody>
        {entries.map(([key, value]) => {
          const formatted = formatDisplayValue(value);
          const multiline = formatted.includes('\n');

          return (
            <Table.Tr key={key}>
              <Table.Td w="30%">
                <Text fw={600}>{key}</Text>
              </Table.Td>
              <Table.Td>
                <Text
                  component={multiline ? 'pre' : 'span'}
                  style={{ whiteSpace: multiline ? 'pre-wrap' : undefined, margin: 0 }}
                >
                  {formatted}
                </Text>
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );

  const formatNumber = (value: number | null | undefined, maximumFractionDigits = 2) => {
    if (value === null || value === undefined) {
      return '—';
    }

    return value.toLocaleString('cs-CZ', { maximumFractionDigits });
  };

  const formatPriceValue = (value: number | null | undefined, currency?: string | null) => {
    if (value === null || value === undefined) {
      return '—';
    }

    const formatted = value.toLocaleString('cs-CZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return currency ? `${formatted} ${currency}` : formatted;
  };

  const parseNumeric = (value: string): number | null => {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }

    let normalized = trimmed.replace(/[\s\u00a0]/g, '');
    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');
    if (hasComma && hasDot) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(',', '.');
    }

    const parsed = Number(normalized);
    if (Number.isNaN(parsed)) {
      throw new Error(`Hodnota "${value}" není platné číslo.`);
    }

    return parsed;
  };

  const buildProductOverlayPayload = (): {
    shopId: number;
    payload: {
      status: string | null;
      currency_code: string | null;
      data: Record<string, unknown> | null;
    };
    nextJson: string;
  } => {
    if (selectedShopId === null) {
      throw new Error('Vyber e-shop pro uložení overlaye.');
    }

    let dataPayload: Record<string, unknown> = {};

    if (productOverlayJson.trim() !== '') {
      try {
        const parsed = JSON.parse(productOverlayJson);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Overlay data musí být objekt.');
        }
        dataPayload = { ...(parsed as Record<string, unknown>) };
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : 'Overlay data musí být validní JSON'
        );
      }
    }

    if (productOverlayIndexName.trim() !== '') {
      dataPayload.indexName = productOverlayIndexName.trim();
    } else {
      delete dataPayload.indexName;
    }

    if (productOverlayImages.length > 0) {
      dataPayload.images = buildOverlayImagesPayload();
    } else {
      delete dataPayload.images;
    }

    const nextJson = JSON.stringify(dataPayload, null, 2);

    return {
      shopId: selectedShopId,
      payload: {
        status: productOverlayStatus.trim() === '' ? null : productOverlayStatus.trim(),
        currency_code: productOverlayCurrency.trim() === '' ? null : productOverlayCurrency.trim(),
        data: dataPayload,
      },
      nextJson,
    };
  };

  const buildVariantOverlayPayload = (
    variantId: string
  ): {
    shopId: number;
    variantId: string;
    payload: {
      price?: number | null;
      purchase_price?: number | null;
      vat_rate?: number | null;
      stock?: number | null;
      min_stock_supply?: number | null;
      currency_code?: string | null;
      unit?: string | null;
      data?: Record<string, unknown> | Array<Record<string, unknown>> | null;
    };
  } => {
    if (selectedShopId === null) {
      throw new Error('Vyber e-shop pro uložení overlaye.');
    }

    const formState = variantOverlayForms[variantId];
    if (!formState) {
      throw new Error('Overlay varianty není k dispozici.');
    }

    let dataPayload: Record<string, unknown> | null = null;

    const additionalDraft = formState.additional_data.trim();
    if (additionalDraft !== '') {
      try {
        const parsed = JSON.parse(additionalDraft);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Další pole musí být JSON objekt.');
        }
        dataPayload = { ...(parsed as Record<string, unknown>) };
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : 'Další pole musí být validní JSON objekt.'
        );
      }
    }

    const variantName = formState.name.trim();
    if (variantName !== '') {
      dataPayload = dataPayload ?? {};
      dataPayload['name'] = variantName;
    }

    const parameterPayload = formState.parameters
      .map((parameter) => {
        const name = parameter.name?.trim() ?? '';
        const value = parameter.value?.trim() ?? '';
        if (name === '' && value === '') {
          return null;
        }

        const entry: Record<string, string> = {};

        if (name !== '') {
          entry.name = name;
        }

        if (value !== '') {
          entry.value = value;
        }

        const nameIndex = parameter.nameIndex?.trim() ?? '';
        if (nameIndex !== '') {
          entry.nameIndex = nameIndex;
        }

        const valueIndex = parameter.valueIndex?.trim() ?? '';
        if (valueIndex !== '') {
          entry.valueIndex = valueIndex;
        }

        return entry;
      })
      .filter((entry): entry is Record<string, string> => {
        if (!entry) {
          return false;
        }

        return Object.keys(entry).length > 0;
      });

    if (parameterPayload.length > 0) {
      dataPayload = dataPayload ?? {};
      dataPayload['parameters'] = parameterPayload;
    }

    if (dataPayload && Object.keys(dataPayload).length === 0) {
      dataPayload = null;
    }

    const payload = {
      price: parseNumeric(formState.price),
      purchase_price: parseNumeric(formState.purchase_price),
      vat_rate: parseNumeric(formState.vat_rate),
      stock: parseNumeric(formState.stock),
      min_stock_supply: parseNumeric(formState.min_stock_supply),
      currency_code: formState.currency_code.trim() === '' ? null : formState.currency_code.trim(),
      unit: formState.unit.trim() === '' ? null : formState.unit.trim(),
      data: dataPayload,
    };

    return {
      shopId: selectedShopId,
      variantId,
      payload,
    };
  };

  const productOverlayMutation = useMutation({
    mutationFn: ({
      shopId,
      payload,
    }: {
      shopId: number;
      payload: {
        status?: string | null;
        currency_code?: string | null;
        data?: Record<string, unknown> | null;
      };
      silent?: boolean;
    }) => updateProductOverlay(id!, shopId, payload),
    onMutate: (variables): OverlayMutationContext => ({
      silent: variables.silent ?? false,
    }),
    onSuccess: (_data, _variables, context) => {
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      const ctx = context as OverlayMutationContext | undefined;
      if (!ctx?.silent) {
        notifications.show({ message: 'Overlay produktu uložen', color: 'blue' });
      }
    },
    onError: (error: unknown, _variables, context) => {
      const ctx = context as OverlayMutationContext | undefined;
      if (!ctx?.silent) {
        const message = error instanceof Error ? error.message : 'Uložení overlaye se nezdařilo';
        notifications.show({ message, color: 'red' });
      }
    },
  });

  const variantOverlayMutation = useMutation({
    mutationFn: ({
      shopId,
      variantId,
      payload,
    }: {
      shopId: number;
      variantId: string;
      payload: {
        price?: number | null;
        purchase_price?: number | null;
        vat_rate?: number | null;
        stock?: number | null;
        min_stock_supply?: number | null;
        currency_code?: string | null;
        unit?: string | null;
        data?: Record<string, unknown> | Array<Record<string, unknown>> | null;
      };
      silent?: boolean;
    }) => updateProductVariantOverlay(id!, variantId, shopId, payload),
    onMutate: (variables): OverlayMutationContext => ({
      silent: variables.silent ?? false,
    }),
    onSuccess: (_data, _variables, context) => {
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      const ctx = context as OverlayMutationContext | undefined;
      if (!ctx?.silent) {
        notifications.show({ message: 'Overlay varianty uložen', color: 'blue' });
      }
    },
    onError: (error: unknown, _variables, context) => {
      const ctx = context as OverlayMutationContext | undefined;
      if (!ctx?.silent) {
        const message =
          error instanceof Error ? error.message : 'Uložení overlaye varianty se nezdařilo';
        notifications.show({ message, color: 'red' });
      }
    },
  });

  const saveOverlaysBeforeDraft = async () => {
    const { shopId, payload, nextJson } = buildProductOverlayPayload();
    setProductOverlayJson(nextJson);

    await productOverlayMutation.mutateAsync({ shopId, payload, silent: true });

    const variantIds = Object.keys(variantOverlayForms);
    for (const variantId of variantIds) {
      const variantPayload = buildVariantOverlayPayload(variantId);
      await variantOverlayMutation.mutateAsync({
        shopId: variantPayload.shopId,
        variantId: variantPayload.variantId,
        payload: variantPayload.payload,
        silent: true,
      });
    }
  };

  const handleProductOverlaySave = () => {
    try {
      const { shopId, payload, nextJson } = buildProductOverlayPayload();
      setProductOverlayJson(nextJson);
      productOverlayMutation.mutate({ shopId, payload });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Overlay data musí být validní JSON';
      notifications.show({ message, color: 'red' });
    }
  };

  const handleVariantOverlaySave = (variantId: string) => {
    try {
      const variantPayload = buildVariantOverlayPayload(variantId);
      variantOverlayMutation.mutate({
        shopId: variantPayload.shopId,
        variantId: variantPayload.variantId,
        payload: variantPayload.payload,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Overlay data obsahují chybu.';
      notifications.show({ message, color: 'red' });
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (values: TranslationFormValues) => {
      await saveOverlaysBeforeDraft();

      const payload: Partial<ProductTranslation> = {
        name: values.name.trim() === '' ? null : values.name,
        short_description: values.short_description.trim() === '' ? null : values.short_description,
        description: values.description.trim() === '' ? null : values.description,
      };

      const seoSource = { ...(translation?.seo ?? {}) } as Record<string, unknown>;
      const metaTitle = values.seo_meta_title.trim() === '' ? null : values.seo_meta_title;
      const metaDescription = values.seo_meta_description.trim() === '' ? null : values.seo_meta_description;
      seoSource.metaTitle = metaTitle;
      seoSource.metaDescription = metaDescription;

      const seoHasValue = Object.values(seoSource).some(
        (value) => value !== null && value !== '' && value !== undefined
      );

      payload.seo = seoHasValue ? (seoSource as Record<string, unknown>) : null;

      const descriptiveParametersPayload = values.descriptive_parameters
        .map((row) => {
          const name = row.name?.trim() ?? '';
          const value = row.value?.trim() ?? '';
          const description = row.description?.trim() ?? '';
          const priority = row.priority?.trim() ?? '';

          if (name === '' && value === '' && description === '' && priority === '') {
            return null;
          }

          const normalized: Record<string, unknown> = {
            name,
          };

          if (value !== '') {
            normalized.value = value;
          }

          if (description !== '') {
            normalized.description = description;
          }

          if (priority !== '' && !Number.isNaN(Number(priority))) {
            normalized.priority = Number(priority);
          }

          return normalized;
        })
        .filter((entry): entry is Record<string, unknown> => Boolean(entry));

      const filteringParametersPayload = values.filtering_parameters
        .map((row) => {
          const code = row.code?.trim() ?? '';
          const valuesList = (row.values ?? '')
            .split(/[\n,;]/)
            .map((item) => item.trim())
            .filter((item) => item !== '');

          if (code === '') {
            return null;
          }

          return {
            code,
            values: valuesList,
          };
        })
        .filter((entry): entry is { code: string; values: string[] } => Boolean(entry));

      if (descriptiveParametersPayload.length === 0 && filteringParametersPayload.length === 0) {
        payload.parameters = null;
      } else {
        payload.parameters = {
          descriptiveParameters: descriptiveParametersPayload,
          filteringParameters: filteringParametersPayload,
        };
      }

      return updateTranslation(id!, selectedLocale!, payload, selectedShopId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['translation', id, selectedLocale, selectedShopId] });
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      notifications.show({ message: 'Překlad uložen jako draft', color: 'blue' });
    },
    onError: (error: unknown) => {
      const baseMessage = 'Uložení překladu se nezdařilo';
      const detail = error instanceof Error && error.message ? error.message : null;
      const message = detail ? `${baseMessage}: ${detail}` : baseMessage;
      notifications.show({ message, color: 'red' });
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => submitTranslation(id!, selectedLocale!, selectedShopId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['translation', id, selectedLocale, selectedShopId] });
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      notifications.show({ message: 'Překlad odeslán ke kontrole', color: 'orange' });
    },
  });

  const pushToShoptetMutation = useMutation({
    mutationFn: async () => {
      if (!translation) {
        throw new Error('Překlad není k dispozici.');
      }

      if (selectedShopId === null) {
        throw new Error('Vyber shop pro odeslání do Shoptetu.');
      }

      return pushProductTranslation(selectedShopId, translation.id);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['translation', id, selectedLocale, selectedShopId] });
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });

      const status = result?.data?.status;
      notifications.show({
        message: status
          ? `Překlad odeslán do Shoptetu (status: ${status}).`
          : 'Překlad odeslán do Shoptetu.',
        color: 'green',
      });
    },
    onError: (error: unknown) => {
      if (axios.isAxiosError(error) && error.response?.data && typeof error.response.data === 'object') {
        const message = String((error.response.data as Record<string, unknown>).message ?? 'Odeslání překladu do Shoptetu se nezdařilo');
        const hint = (error.response.data as Record<string, unknown>).hint;
        notifications.show({
          title: 'Odeslání do Shoptetu selhalo',
          message: hint ? `${message}\n${hint}` : message,
          color: 'red',
        });
        return;
      }

      const message =
        error instanceof Error ? error.message : 'Odeslání překladu do Shoptetu se nezdařilo';
      notifications.show({ message, color: 'red' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectTranslation(id!, selectedLocale!, selectedShopId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['translation', id, selectedLocale, selectedShopId] });
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      notifications.show({ message: 'Překlad vrácen do draftu', color: 'red' });
    },
  });

  const aiMappingMutation = useMutation({
    mutationFn: async (overrides?: MappingOverridesPayload) => {
      if (!selectedLocale) {
        throw new Error('Vyber jazyk překladu.');
      }

      return prepareTranslationMapping(id!, selectedLocale!, {
        shopId: selectedShopId,
        mappingOverrides: overrides,
      });
    },
    onSuccess: (data, overrides) => {
      setAiMappingMissing(null);
      setAiMappingError(null);
      setAiMappingReady(true);
      setAiMappingOverrides(createEmptyMappingOverrides());
      setAiConfirmedOverrides(overrides ?? undefined);

      const filteringDraft = (data.filtering_parameters ?? []).map((entry) => {
        const valueLabels: Record<string, string> = {};
        const values =
          (entry.values ?? [])
            .map((value) => {
              const key =
                typeof value.key === 'string' && value.key.trim() !== ''
                  ? value.key.trim()
                  : null;
              const label =
                typeof value.label === 'string' && value.label.trim() !== ''
                  ? value.label.trim()
                  : null;

              if (key) {
                if (label) {
                  valueLabels[key] = label;
                }
                return key;
              }

              return label ?? '';
            })
            .filter((value) => value.trim() !== '') ?? [];

        return {
          id: createRowId(),
          code:
            typeof entry.code === 'string' && entry.code.trim() !== ''
              ? entry.code.trim()
              : typeof entry.key === 'string'
                ? entry.key.trim()
                : '',
          values,
          valueLabels,
        };
      });
      setAiFilteringDraft(filteringDraft);

      setFilteringValueLibrary((prev) => {
        const merged = new Set(prev);
        filteringDraft.forEach((entry) => entry.values.forEach((value) => merged.add(value)));
        return Array.from(merged);
      });
      setFilteringValueLabels((prev) => {
        const next = { ...prev };
        filteringDraft.forEach((entry) => {
          Object.entries(entry.valueLabels).forEach(([key, label]) => {
            if (key && label) {
              next[key] = label;
            }
          });
        });
        return next;
      });

      const variantDraftMap: Record<string, AiVariantDraft> = {};
      data.variants.forEach((variant, index) => {
        const code =
          (typeof variant.code === 'string' && variant.code.trim() !== ''
            ? variant.code
            : `variant-${index + 1}`) ?? `variant-${index + 1}`;

        const priceValue = toDraftNumericString(variant.price);
        const purchasePriceValue = toDraftNumericString(
          (variant as { purchasePrice?: unknown; purchase_price?: unknown }).purchasePrice ??
            (variant as { purchase_price?: unknown }).purchase_price
        );
        const vatValue = toDraftNumericString(
          (variant as { vatRate?: unknown; vat_rate?: unknown }).vatRate ??
            (variant as { vat_rate?: unknown }).vat_rate ??
            selectedShopDefaultVatRate
        );
        const stockValue = toDraftNumericString(variant.stock);

        variantDraftMap[code] = {
          code,
          name: (variant.name as string | undefined) ?? '',
          price: priceValue ?? '',
          purchasePrice: purchasePriceValue ?? '',
          currencyCode: variant.currencyCode ?? selectedShop?.currency_code ?? '',
          vatRate: vatValue ?? '',
          stock: stockValue ?? '',
          parameters: toVariantParameterFormValues(variant.parameters ?? []),
        };
      });
      setAiVariantDrafts(variantDraftMap);

      setAiPricingDraft({
        price: '',
        currencyCode: selectedShop?.currency_code ?? '',
      });
    },
    onError: (error: unknown) => {
      setAiMappingReady(false);
      setAiConfirmedOverrides(undefined);

      if (axios.isAxiosError(error) && error.response?.status === 422) {
        const responseData = (error.response.data ?? {}) as {
          message?: string;
          details?: {
            filtering_parameters?: MissingFilteringMapping[];
            variants?: MissingVariantMapping[];
          };
        };

        if (responseData.details) {
          setAiConfirmedOverrides(undefined);
          setAiMappingMissing({
            filtering_parameters: responseData.details.filtering_parameters ?? [],
            variants: responseData.details.variants ?? [],
          });
          setAiMappingError(responseData.message ?? 'Chybí mapování některých parametrů.');
          return;
        }
      }

      const message = error instanceof Error ? error.message : 'Ověření mapování selhalo';
      notifications.show({ message, color: 'red' });
    },
  });

  const aiDraftMutation = useMutation({
    mutationFn: async ({ sections, overrides }: { sections: string[]; overrides?: MappingOverridesPayload }) => {
      if (!selectedLocale) {
        throw new Error('Vyber jazyk překladu.');
      }

      return generateTranslationDraft(id!, selectedLocale!, {
        shopId: selectedShopId,
        sections,
        mappingOverrides: overrides,
      });
    },
    onSuccess: (data) => {
      const mappingSections = aiMappingReady ? ['filtering_parameters', 'variants', 'pricing'] : [];
      const extendedSections = Array.from(new Set([...(data.sections ?? []), ...mappingSections]));

      setAiResult({
        ...data,
        sections: extendedSections,
      });

      const initialSelections = extendedSections.reduce<Record<string, boolean>>((acc, section) => {
        acc[section] = true;
        return acc;
      }, {});

      setAiAppliedSections(initialSelections);
      setAiMappingMissing(null);
      setAiMappingOverrides(createEmptyMappingOverrides());
      setAiMappingError(null);
      setAiStep('review');
    },
    onError: (error: unknown) => {
      if (axios.isAxiosError(error) && error.response?.status === 422) {
        const responseData = (error.response.data ?? {}) as {
          message?: string;
          details?: {
            filtering_parameters?: MissingFilteringMapping[];
            variants?: MissingVariantMapping[];
          };
        };

        if (responseData.details) {
          setAiMappingMissing({
            filtering_parameters: responseData.details.filtering_parameters ?? [],
            variants: responseData.details.variants ?? [],
          });
          setAiMappingError(responseData.message ?? 'Chybí mapování některých parametrů.');
          setAiResult(null);
          setAiStep('mapping');
          return;
        }
      }

      const message = error instanceof Error ? error.message : 'AI překlad se nepodařilo získat';
      notifications.show({ message, color: 'red' });
    },
  });

  const runAiDraft = useCallback(
    (sections: string[]) => {
      const overridesPayload = getEffectiveMappingOverrides();
      aiDraftMutation.mutate({ sections, overrides: overridesPayload });
    },
    [aiDraftMutation, getEffectiveMappingOverrides]
  );

  const handleOpenAiModal = useCallback(() => {
    if (!selectedLocale) {
      notifications.show({ message: 'Vyber nejprve jazyk překladu.', color: 'red' });
      return;
    }

    setAiStep('mapping');
    setAiResult(null);
    setAiSelectedSections(defaultAiSections);
    setAiAppliedSections({});
    setAiVariantDrafts({});
    setAiFilteringDraft([]);
    setAiPricingDraft({
      price: '',
      currencyCode: selectedShop?.currency_code ?? '',
    });
    setAiMappingMissing(null);
    setAiMappingOverrides(createEmptyMappingOverrides());
    setAiMappingError(null);
    setAiMappingReady(false);
    setAiConfirmedOverrides(undefined);
    openAiModal();
    aiMappingMutation.mutate(undefined);
  }, [
    defaultAiSections,
    notifications,
    selectedLocale,
    selectedShop?.currency_code,
    aiMappingMutation,
    openAiModal,
  ]);

  useEffect(() => {
    if (!aiMappingMissing) {
      setAiMappingOverrides(createEmptyMappingOverrides());
      return;
    }

    setAiMappingOverrides((current) => {
      const nextFiltering = { ...current.filtering };
      const activeFilteringKeys = new Set<string>();

      (aiMappingMissing.filtering_parameters ?? []).forEach((item) => {
        activeFilteringKeys.add(item.master_key);
        const existing = nextFiltering[item.master_key] ?? {
          targetKey: item.target_key ?? null,
          ignore: false,
          values: {},
        };
        const nextValues = { ...existing.values };
        const missingValues = item.values ?? [];

        missingValues.forEach((value) => {
          if (!nextValues[value.master_value_key]) {
            nextValues[value.master_value_key] = { targetValueKey: null, mode: 'map' };
          }
        });

        Object.keys(nextValues).forEach((valueKey) => {
          if (!missingValues.some((value) => value.master_value_key === valueKey)) {
            delete nextValues[valueKey];
          }
        });

        nextFiltering[item.master_key] = {
          targetKey: existing.targetKey ?? item.target_key ?? null,
          ignore: existing.ignore,
          values: nextValues,
        };
      });

      Object.keys(nextFiltering).forEach((key) => {
        if (!activeFilteringKeys.has(key)) {
          delete nextFiltering[key];
        }
      });

      const nextVariants = { ...current.variants };
      const activeVariantMap = new Map<string, Set<string>>();

      (aiMappingMissing.variants ?? []).forEach((item) => {
        if (!activeVariantMap.has(item.variant_code)) {
          activeVariantMap.set(item.variant_code, new Set());
        }
        activeVariantMap.get(item.variant_code)!.add(item.parameter_key);

        const variantEntries = nextVariants[item.variant_code] ?? {};
        const existing = variantEntries[item.parameter_key] ?? {
          targetKey: item.target_key ?? null,
          ignore: false,
          values: {},
        };
        const nextValues = { ...existing.values };
        const missingValues = item.values ?? [];

        missingValues.forEach((value) => {
          if (!nextValues[value.master_value_key]) {
            nextValues[value.master_value_key] = { targetValueKey: null, mode: 'map' };
          }
        });

        Object.keys(nextValues).forEach((valueKey) => {
          if (!missingValues.some((value) => value.master_value_key === valueKey)) {
            delete nextValues[valueKey];
          }
        });

        variantEntries[item.parameter_key] = {
          targetKey: existing.targetKey ?? item.target_key ?? null,
          ignore: existing.ignore,
          values: nextValues,
        };
        nextVariants[item.variant_code] = variantEntries;
      });

      Object.entries(nextVariants).forEach(([variantCode, params]) => {
        const allowed = activeVariantMap.get(variantCode);
        if (!allowed) {
          delete nextVariants[variantCode];
          return;
        }

        Object.keys(params).forEach((parameterKey) => {
          if (!allowed.has(parameterKey)) {
            delete params[parameterKey];
          }
        });

        if (Object.keys(params).length === 0) {
          delete nextVariants[variantCode];
        }
      });

      return {
        filtering: nextFiltering,
        variants: nextVariants,
      };
    });
  }, [aiMappingMissing]);

  useEffect(() => {
    if (aiFilteringDraft.length === 0) {
      setFilteringValueLibrary([]);
      setFilteringValueLabels({});
      return;
    }

    setFilteringValueLibrary((prev) => {
      const merged = new Set(prev);
      aiFilteringDraft.forEach((entry) => {
        entry.values.forEach((value) => {
          if (value) {
            merged.add(value);
          }
        });
      });

      return Array.from(merged);
    });

    setFilteringValueLabels((prev) => {
      const next = { ...prev };
      aiFilteringDraft.forEach((entry) => {
        Object.entries(entry.valueLabels).forEach(([key, label]) => {
          if (key && label) {
            next[key] = label;
          }
        });
      });
      return next;
    });
  }, [aiFilteringDraft]);

  const startAiGeneration = useCallback(() => {
    if (!aiMappingReady) {
      notifications.show({ message: 'Nejprve dokonči mapování parametrů.', color: 'red' });
      return;
    }

    const selections = Array.from(new Set([...aiSelectedSections]));
    setAiSelectedSections(selections);

    const requestSections = selections.filter((section) =>
      ['text', 'seo', 'slug', 'parameters', 'images'].includes(section)
    );

    if (!requestSections.includes('text')) {
      requestSections.unshift('text');
    }

    runAiDraft(requestSections);
  }, [aiMappingReady, aiSelectedSections, notifications, runAiDraft]);

  const handleMappingSubmit = useCallback(() => {
    if (!validateMappingOverrides()) {
      return;
    }

    const overridesPayload = buildMappingOverridesPayload();
    aiMappingMutation.mutate(overridesPayload);
  }, [aiMappingMutation, buildMappingOverridesPayload, validateMappingOverrides]);

  useEffect(() => {
    if (aiModalOpened) {
      return;
    }

    let resetTriggered = false;

    setAiStep((prev) => {
      if (prev !== 'mapping') {
        resetTriggered = true;
        return 'mapping';
      }
      return prev;
    });

    setAiSelectedSections((prev) => {
      const prevSorted = [...prev].sort().join('|');
      const defaultSorted = [...defaultAiSections].sort().join('|');
      if (prevSorted !== defaultSorted) {
        resetTriggered = true;
        return defaultAiSections;
      }
      return prev;
    });

    setAiResult((prev) => {
      if (prev !== null) {
        resetTriggered = true;
        return null;
      }
      return prev;
    });

    setAiAppliedSections((prev) => {
      if (Object.keys(prev).length > 0) {
        resetTriggered = true;
        return {};
      }
      return prev;
    });

    setAiMappingMissing((prev) => {
      if (prev !== null) {
        resetTriggered = true;
        return null;
      }
      return prev;
    });

    setAiMappingOverrides((prev) => {
      const hasFiltering = Object.keys(prev.filtering).length > 0;
      const hasVariants = Object.keys(prev.variants).length > 0;
      if (hasFiltering || hasVariants) {
        resetTriggered = true;
        return createEmptyMappingOverrides();
      }
      return prev;
    });

    setAiMappingError((prev) => {
      if (prev !== null) {
        resetTriggered = true;
        return null;
      }
      return prev;
    });

    setAiVariantDrafts((prev) => {
      if (Object.keys(prev).length > 0) {
        resetTriggered = true;
        return {};
      }
      return prev;
    });

    setAiFilteringDraft((prev) => {
      if (prev.length > 0) {
        resetTriggered = true;
        return [];
      }
      return prev;
    });

    setAiPricingDraft((prev) => {
      if (prev.price !== '' || prev.currencyCode !== (selectedShop?.currency_code ?? '')) {
        resetTriggered = true;
        return {
          price: '',
          currencyCode: selectedShop?.currency_code ?? '',
        };
      }
      return prev;
    });

    setAiMappingReady((ready) => {
      if (ready) {
        resetTriggered = true;
        return false;
      }
      return ready;
    });

    setAiFilteringValueInputs((prev) => {
      if (Object.keys(prev).length > 0) {
        resetTriggered = true;
        return {};
      }
      return prev;
    });

    setAiConfirmedOverrides((prev) => {
      if (prev) {
        resetTriggered = true;
        return undefined;
      }
      return prev;
    });

    if (resetTriggered) {
      aiDraftMutation.reset();
      aiMappingMutation.reset();
    }
  }, [aiDraftMutation, aiMappingMutation, aiModalOpened, defaultAiSections, selectedShop?.currency_code, aiConfirmedOverrides]);

  const canonicalPayload = canonicalPayloadRecord;
  const overlayDataRecord = asRecord(activeOverlay?.data);
  const overlayHubData = asRecord(overlayDataRecord ? overlayDataRecord['_hub'] : undefined) ?? {};
  const basePayload = (overlayDataRecord ?? canonicalPayload) as Record<string, unknown>;
  const activeCurrencyCode = activeOverlay?.currency_code ?? (canonicalPayload.currencyCode as string | undefined);
  const currencyOptions = useMemo(() => {
    const codes = new Set<string>();

    shops.forEach((shop) => {
      if (shop.currency_code) {
        codes.add(shop.currency_code);
      }
    });

    if (selectedShop?.currency_code) {
      codes.add(selectedShop.currency_code);
    }

    if (activeCurrencyCode) {
      codes.add(activeCurrencyCode);
    }

    codes.add('CZK');

    return Array.from(codes)
      .filter((code): code is string => typeof code === 'string' && code.trim() !== '')
      .map((code) => ({ value: code, label: code }));
  }, [shops, selectedShop, activeCurrencyCode]);

  const bootstrapProductsMutation = useMutation({
    mutationFn: () => {
      if (selectedShopId === null) {
        throw new Error('Nejprve vyber shop.');
      }

      if (!selectedShop?.is_master) {
        throw new Error('Manuální import je dostupný pouze pro master shop.');
      }

      return bootstrapMasterProducts(selectedShopId);
    },
    onSuccess: (result) => {
      const processed = result.data?.processed ?? 0;
      const window = result.data?.window;
      const summary = window
        ? ` (okno ${formatDateTime(window.from)} – ${formatDateTime(window.to)})`
        : '';

      queryClient.invalidateQueries({ queryKey: ['product', id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['translation', id, selectedLocale, selectedShopId] });

      const color = processed > 0 ? 'teal' : 'blue';
      notifications.show({
        message: `Manuální import dokončen, zpracováno ${processed} produktů${summary}.`,
        color,
      });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Manuální import produktů selhal';
      notifications.show({ message, color: 'red' });
    },
  });

  if (shouldShowInitialLoader) {
    return <Loader />;
  }

  const supplierName =
    ((basePayload.supplier as { name?: string } | undefined)?.name) ??
    ((canonicalPayload.supplier as { name?: string } | undefined)?.name);
  const brandName =
    ((basePayload.brand as { name?: string } | undefined)?.name) ??
    ((canonicalPayload.brand as { name?: string } | undefined)?.name);
  const categoryName =
    ((basePayload.defaultCategory as { name?: string } | undefined)?.name) ??
    ((canonicalPayload.defaultCategory as { name?: string } | undefined)?.name);
  const productUrl = (basePayload.url as string | undefined) ?? (canonicalPayload.url as string | undefined);
  const additionalName =
    (basePayload.additionalName as string | undefined) ?? (canonicalPayload.additionalName as string | undefined);
  const internalNote =
    (basePayload.internalNote as string | undefined) ?? (canonicalPayload.internalNote as string | undefined);
  const images = pickArray<Record<string, unknown>>(basePayload.images, canonicalPayload.images);
  const descriptiveParameters = pickArray<RawParameter>(
    basePayload.descriptiveParameters,
    canonicalPayload.descriptiveParameters
  );
  const categories = pickPreferredArray<Record<string, unknown>>(
    [
      overlayDataRecord ? overlayDataRecord['mappedCategories'] : undefined,
      overlayHubData['mappedCategories'],
      overlayDataRecord ? overlayDataRecord['allCategories'] : undefined,
      basePayload.allCategories,
    ],
    [canonicalPayload.allCategories]
  );
  const flags = pickPreferredArray<Record<string, unknown>>(
    [
      overlayDataRecord ? overlayDataRecord['flags'] : undefined,
      overlayHubData['flags'],
      basePayload.flags,
    ],
    [canonicalPayload.flags]
  );
  const measureUnit =
    (basePayload.measureUnit as { name?: string } | undefined) ??
    (canonicalPayload.measureUnit as { name?: string } | undefined);
  const setItems = pickArray<Record<string, unknown>>(basePayload.setItems, canonicalPayload.setItems);
  const gifts = pickArray<Record<string, unknown>>(basePayload.gifts, canonicalPayload.gifts);
  const alternativeProducts = pickArray<Record<string, unknown>>(
    basePayload.alternativeProducts,
    canonicalPayload.alternativeProducts
  );
  const relatedProducts = pickArray<Record<string, unknown>>(
    basePayload.relatedProducts,
    canonicalPayload.relatedProducts
  );
  const perPricelistPrices = pickArray<Record<string, unknown>>(
    basePayload.perPricelistPrices,
    canonicalPayload.perPricelistPrices
  );
  const filteringParameters = pickPreferredArray<Record<string, unknown>>(
    [
      overlayDataRecord ? overlayDataRecord['filteringParameters'] : undefined,
      overlayHubData['suggestedFilters'],
      basePayload.filteringParameters,
    ],
    [canonicalPayload.filteringParameters]
  );
  const sortVariants =
    (basePayload.sortVariants as string | undefined) ?? (canonicalPayload.sortVariants as string | undefined);

  const descriptiveParameterEntries = descriptiveParameters.map((parameter, index) =>
    normalizeParameter(parameter, parameter.name as string | undefined ?? `Parametr ${index + 1}`)
  );

  const baseInfoItems = [
    {
      label: 'Shop',
      value: overlayShop?.name ?? (selectedShopId !== null ? `#${selectedShopId}` : '—'),
    },
    { label: 'Dodavatel', value: formatDisplayValue(supplierName) },
    { label: 'Značka', value: formatDisplayValue(brandName) },
    { label: 'Výchozí kategorie', value: formatDisplayValue(categoryName) },
    { label: 'Viditelnost', value: formatDisplayValue(basePayload.visibility) },
    { label: 'Obsah pro dospělé', value: formatDisplayValue(basePayload.adult) },
    { label: 'Online platby', value: formatDisplayValue(basePayload.allowOnlinePayments) },
    { label: 'IPlatba', value: formatDisplayValue(basePayload.allowIPlatba) },
    {
      label: 'URL',
      value: productUrl ? (
        <Anchor href={productUrl} target="_blank" rel="noopener noreferrer">
          {productUrl}
        </Anchor>
      ) : (
        '—'
      ),
    },
    { label: 'Vytvořeno', value: formatDateTime(basePayload.creationTime as string | undefined) },
    { label: 'Poslední změna', value: formatDateTime(basePayload.changeTime as string | undefined) },
  ];

  const baseMetaEntries: Array<[string, unknown]> = [
    ['Meta title', basePayload.metaTitle],
    ['Meta description', basePayload.metaDescription],
    ['Indexovací název', basePayload.indexName],
    ['XML feed název', basePayload.xmlFeedName],
    ['Dodatečný název', additionalName],
    ['Interní poznámka', internalNote],
  ];

  const translationParametersRaw = translation?.parameters;
  let translationDescriptiveSource: unknown = null;
  let translationFilteringSource: unknown = null;

  if (Array.isArray(translationParametersRaw)) {
    translationDescriptiveSource = translationParametersRaw;
  } else if (translationParametersRaw && typeof translationParametersRaw === 'object') {
    const record = translationParametersRaw as Record<string, unknown>;
    if (Array.isArray(record.descriptiveParameters)) {
      translationDescriptiveSource = record.descriptiveParameters;
    } else {
      translationDescriptiveSource = record;
    }

    if (Array.isArray(record.filteringParameters)) {
      translationFilteringSource = record.filteringParameters;
    }
  }

  const translationParameterEntries = Array.isArray(translationDescriptiveSource)
    ? (translationDescriptiveSource as RawParameter[]).map((parameter, index) =>
        normalizeParameter(parameter, parameter.name as string | undefined ?? `Parametr ${index + 1}`)
      )
    : translationDescriptiveSource && typeof translationDescriptiveSource === 'object'
      ? Object.entries(translationDescriptiveSource as Record<string, unknown>).map(([key, value]) =>
          normalizeParameter({ name: key, value } as RawParameter, key)
        )
      : [];
  const translationSeo = (translation?.seo ?? {}) as Record<string, unknown>;
  const hasTranslationParameters = translationParameterEntries.length > 0;
  const hasTranslationSeo = hasEntries(translationSeo);

  const activeFilteringParameters = Array.isArray(translationFilteringSource) && translationFilteringSource.length > 0
    ? (translationFilteringSource as RawParameter[])
    : filteringParameters;

  const filteringParameterEntries = activeFilteringParameters.map((parameter, index) => {
    const entry = normalizeParameter(
      parameter,
      (parameter.displayName as string | undefined) ?? (parameter.name as string | undefined) ?? `Filtr ${index + 1}`
    );

    const code = parameter.code as string | undefined;
    if (code) {
      entry.description = [entry.description, `Kód: ${code}`].filter(Boolean).join(' • ').trim() || undefined;
    }

    return entry;
  });

  const mapLinkedProducts = (items: Array<Record<string, unknown>>) =>
    items.map((item, index) => {
      const label =
        (item.name as string | undefined) ??
        (item.indexName as string | undefined) ??
        (item.guid as string | undefined) ??
        `Produkt ${index + 1}`;

      return {
        label,
        guid: item.guid as string | undefined,
        linkType: item.linkType as string | undefined,
        visibility: item.visibility as string | undefined,
        priority: typeof item.priority === 'number' ? item.priority : undefined,
      };
    });

  const alternativeProductEntries = mapLinkedProducts(alternativeProducts);
  const relatedProductEntries = mapLinkedProducts(relatedProducts);

  const storeDomain = (() => {
    if (!productUrl) {
      return null;
    }

    try {
      return new URL(productUrl).hostname;
    } catch {
      return null;
    }
  })();

  const cdnBaseUrl = storeDomain ? `https://cdn.myshoptet.com/usr/${storeDomain}/user/shop/orig/` : null;
  const canPushToShoptet =
    Boolean(
      translation &&
        translation.id &&
        selectedShopId !== null &&
        PUSHABLE_TRANSLATION_STATUSES.includes(translation.status)
    ) && !pushToShoptetMutation.isPending;

  return (
    <>
      <Stack>
        <Group justify="space-between">
        <div>
          <Title order={2}>{(product.base_payload?.name as string) ?? product.external_guid}</Title>
          <Group gap="xs" mt="xs">
            <Badge>{product.status}</Badge>
            <Badge color="gray">SKU: {product.sku ?? 'n/a'}</Badge>
            <Badge color="gray">Shop ID: {product.shop_id}</Badge>
          </Group>
        </div>
        <Stack gap={4} align="flex-end">
          <Select
            label="Shop"
            data={shopOptions}
            value={selectedShopId !== null ? String(selectedShopId) : null}
            onChange={(value) => setSelectedShopId(value ? Number.parseInt(value, 10) : null)}
            placeholder="Vyberte shop"
            w={220}
          />
          <TextInput label="Locale" value={selectedLocale ?? ''} readOnly w={200} />
          {translation && <Badge color="blue">Status: {translation.status}</Badge>}
        </Stack>
      </Group>

      <Grid>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Card withBorder>
            <Title order={4} mb="sm">
              Zdrojová data ({product.base_locale})
            </Title>
            <Stack gap="xs">
              <Text fw={600}>Název</Text>
              <Text>{(product.base_payload?.name as string) ?? '-'}</Text>
              <Text fw={600}>Krátký popis</Text>
              <Text>{(product.base_payload?.shortDescription as string) ?? '-'}</Text>
              <Text fw={600}>Popis</Text>
              <Text>{(product.base_payload?.description as string) ?? '-'}</Text>
              <Text fw={600}>Meta title</Text>
              <Text>{(product.base_payload?.metaTitle as string) ?? '-'}</Text>
              <Text fw={600}>Meta description</Text>
              <Text>
                {(product.base_payload?.metaDescription as string) ?? '-'}
              </Text>
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card withBorder>
            <Group justify="space-between" mb="md">
              <Title order={4}>Překlad ({selectedLocale})</Title>
              <Group gap="xs">
                <Button
                  variant="outline"
                  color="teal"
                  loading={bootstrapProductsMutation.isPending}
                  onClick={() => bootstrapProductsMutation.mutate()}
                  disabled={!canBootstrapProducts || bootstrapProductsMutation.isPending}
                >
                  Stáhnout nové produkty
                </Button>
                <Button
                  variant="light"
                  onClick={form.handleSubmit((values) => saveMutation.mutate(values))}
                  loading={saveMutation.isPending}
                >
                  Uložit draft
                </Button>
                <Button
                  variant="outline"
                  color="grape"
                  loading={aiMappingMutation.isPending || aiDraftMutation.isPending}
                  onClick={handleOpenAiModal}
                  disabled={
                    !selectedLocale ||
                    product.base_locale === selectedLocale ||
                    aiMappingMutation.isPending ||
                    aiDraftMutation.isPending
                  }
                >
                  Přeložit AI + mapování
                </Button>
                <Button
                  variant="outline"
                  loading={submitMutation.isPending}
                  onClick={() => submitMutation.mutate()}
                  disabled={!translation || translation.status !== 'draft'}
                >
                  Odeslat ke kontrole
                </Button>
                <Button
                  loading={pushToShoptetMutation.isPending}
                  onClick={() => pushToShoptetMutation.mutate()}
                  disabled={!canPushToShoptet}
                  color="green"
                >
                  Odeslat do Shoptetu
                </Button>
                <Button
                  color="red"
                  variant="light"
                  loading={rejectMutation.isPending}
                  onClick={() => rejectMutation.mutate()}
                  disabled={!translation || translation.status !== 'in_review'}
                >
                  Vrátit
                </Button>
              </Group>
            </Group>

            {isLoadingTranslation && <Loader />}

            {!isLoadingTranslation && translationChecklist.length > 0 && (
              <Stack mb="md" gap="xs">
                <Title order={6}>Kontrola před exportem</Title>
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
                  {translationChecklist.map((item) => {
                    const palette = item.completed
                      ? {
                          background: 'var(--mantine-color-green-0)',
                          border: 'var(--mantine-color-green-2)',
                          icon: 'teal' as const,
                          badgeLabel: 'Hotovo',
                        }
                      : {
                          background: 'var(--mantine-color-yellow-0)',
                          border: 'var(--mantine-color-yellow-3)',
                          icon: 'orange' as const,
                          badgeLabel: 'Chybí',
                        };

                    return (
                      <Card
                        key={item.key}
                        p="sm"
                        radius="md"
                        withBorder
                        style={{ background: palette.background, borderColor: palette.border }}
                      >
                        <Group align="flex-start" gap="sm" wrap="nowrap">
                          <ThemeIcon size="sm" color={palette.icon} variant="light">
                            {item.completed ? <IconCheck size={14} /> : <IconAlertTriangle size={14} />}
                          </ThemeIcon>
                          <Stack gap={4} style={{ flex: 1 }}>
                            <Group gap="xs" justify="space-between">
                              <Text fw={600} size="sm">
                                {item.label}
                              </Text>
                              <Badge
                                color={item.completed ? 'teal' : 'orange'}
                                variant="light"
                                size="xs"
                              >
                                {palette.badgeLabel}
                              </Badge>
                            </Group>
                            {!item.completed && item.hint && (
                              <Text size="xs" c="dimmed">
                                {item.hint}
                              </Text>
                            )}
                          </Stack>
                        </Group>
                      </Card>
                    );
                  })}
                </SimpleGrid>
              </Stack>
            )}

            {!isLoadingTranslation && (
              <form onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
                <Stack gap="sm">
                  <Controller
                    name="name"
                    control={form.control}
                    render={({ field }) => <TextInput label="Název" {...field} />}
                  />
                  <Controller
                    name="short_description"
                    control={form.control}
                    render={({ field }) => <Textarea label="Krátký popis" minRows={3} {...field} />}
                  />
                  <Controller
                    name="description"
                    control={form.control}
                    render={({ field }) => <Textarea label="Popis" minRows={6} {...field} />}
                  />
                  <Controller
                    name="seo_meta_title"
                    control={form.control}
                    render={({ field }) => <TextInput label="Meta title" {...field} />}
                  />
                  <Controller
                    name="seo_meta_description"
                    control={form.control}
                    render={({ field }) => (
                      <Textarea label="Meta description" minRows={3} {...field} />
                    )}
                  />
                  <Divider label="Popisné parametry" labelPosition="center" my="sm" />
                  <Stack gap="xs">
                    {descriptiveParameterFields.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        Zatím nemáš žádné parametry. Přidej je tlačítkem níže nebo načti z AI.
                      </Text>
                    ) : (
                      descriptiveParameterFields.map((field, index) => (
                        <Card key={field.id} withBorder p="sm">
                          <Stack gap="xs">
                            <Group align="flex-end" gap="sm" grow>
                              <TextInput
                                label="Název"
                                placeholder="Např. Druh vůně"
                                {...form.register(`descriptive_parameters.${index}.name` as const)}
                                defaultValue={field.name}
                              />
                              <TextInput
                                label="Priorita"
                                placeholder="Číslo"
                                {...form.register(`descriptive_parameters.${index}.priority` as const)}
                                defaultValue={field.priority}
                                w={120}
                              />
                            </Group>
                            <Textarea
                              label="Hodnota"
                              placeholder="Popiš hodnotu parametru…"
                              autosize
                              minRows={2}
                              {...form.register(`descriptive_parameters.${index}.value` as const)}
                              defaultValue={field.value}
                            />
                            <Textarea
                              label="Poznámka / popis"
                              placeholder="Volitelné doplňující informace"
                              autosize
                              minRows={2}
                              {...form.register(`descriptive_parameters.${index}.description` as const)}
                              defaultValue={field.description}
                            />
                            <Group justify="flex-end">
                              <Button
                                variant="subtle"
                                color="red"
                                size="xs"
                                type="button"
                                onClick={() => removeDescriptiveParameter(index)}
                              >
                                Odebrat parametr
                              </Button>
                            </Group>
                          </Stack>
                        </Card>
                      ))
                    )}
                    <Group justify="space-between" align="center">
                      <Group gap="xs">
                        <Button
                          variant="outline"
                          size="xs"
                          type="button"
                          onClick={() => appendDescriptiveParameter(createEmptyDescriptiveParameter())}
                        >
                          Přidat parametr
                        </Button>
                      </Group>
                      <Group gap="xs">
                        <Button
                          variant="subtle"
                          size="xs"
                          type="button"
                          disabled={descriptiveParameters.length === 0}
                          onClick={() => {
                            if (descriptiveParameters.length === 0) {
                              return;
                            }

                            const source = toDescriptiveParameterFormValues(descriptiveParameters).map((entry) => {
                              const { id, ...rest } = entry;
                              void id;
                              return { ...rest };
                            });

                            if (source.length === 0) {
                              return;
                            }

                            form.setValue('descriptive_parameters', source, { shouldDirty: true });
                          }}
                        >
                          Načíst z originálu
                        </Button>
                        <Button
                          variant="subtle"
                          color="gray"
                          size="xs"
                          type="button"
                          onClick={() => form.setValue('descriptive_parameters', [], { shouldDirty: true })}
                        >
                          Vyprázdnit
                        </Button>
                      </Group>
                    </Group>
                  </Stack>
                  <Divider label="Filtrační parametry" labelPosition="center" my="sm" />
                  <Stack gap="xs">
                    {filteringParameterFields.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        Žádné filtrační parametry nejsou nastavené.
                      </Text>
                    ) : (
                      filteringParameterFields.map((field, index) => (
                        <Card key={field.id} withBorder p="sm">
                          <Stack gap="xs">
                            <TextInput
                              label="Kód filtru"
                              placeholder="Např. color"
                              {...form.register(`filtering_parameters.${index}.code` as const)}
                              defaultValue={field.code}
                            />
                            <Textarea
                              label="Hodnoty"
                              description="Odděl hodnoty čárkou nebo novým řádkem."
                              autosize
                              minRows={2}
                              {...form.register(`filtering_parameters.${index}.values` as const)}
                              defaultValue={field.values}
                            />
                            <Group justify="flex-end">
                              <Button
                                variant="subtle"
                                color="red"
                                size="xs"
                                type="button"
                                onClick={() => removeFilteringParameter(index)}
                              >
                                Odebrat filtr
                              </Button>
                            </Group>
                          </Stack>
                        </Card>
                      ))
                    )}
                    <Group justify="space-between" align="center">
                      <Group gap="xs">
                        <Button
                          variant="outline"
                          size="xs"
                          type="button"
                          onClick={() => appendFilteringParameter(createEmptyFilteringParameter())}
                        >
                          Přidat filtr
                        </Button>
                      </Group>
                      <Group gap="xs">
                        <Button
                          variant="subtle"
                          size="xs"
                          type="button"
                          disabled={filteringParameters.length === 0}
                          onClick={() => {
                            if (filteringParameters.length === 0) {
                              return;
                            }

                            const source = toFilteringParameterFormValues(filteringParameters).map((entry) => {
                              const { id, ...rest } = entry;
                              void id;
                              return { ...rest };
                            });

                            if (source.length === 0) {
                              return;
                            }

                            form.setValue('filtering_parameters', source, { shouldDirty: true });
                          }}
                        >
                          Načíst z originálu
                        </Button>
                        <Button
                          variant="subtle"
                          color="gray"
                          size="xs"
                          type="button"
                          onClick={() => form.setValue('filtering_parameters', [], { shouldDirty: true })}
                        >
                          Vyprázdnit
                        </Button>
                      </Group>
                    </Group>
                  </Stack>
                  <Group justify="flex-end">
                    <Button type="submit" loading={saveMutation.isPending}>
                      Uložit draft
                    </Button>
                  </Group>
                </Stack>
              </form>
            )}
          </Card>
        </Grid.Col>
      </Grid>

      <Card withBorder>
        <Title order={4} mb="sm">
          Produktový overlay ({selectedShop?.name ?? `Shop #${selectedShopId}`})
        </Title>
        <Stack gap="sm">
          <Group gap="sm" grow>
            <TextInput
              label="Status"
              placeholder="např. visible"
              value={productOverlayStatus}
              onChange={(event) => setProductOverlayStatus(event.currentTarget.value)}
            />
            <TextInput
              label="Měna"
              placeholder="CZK"
              value={productOverlayCurrency}
              onChange={(event) => setProductOverlayCurrency(event.currentTarget.value)}
              maw={160}
            />
          </Group>
          <TextInput
            label="URL slug"
            placeholder="např. arome-zimni-smes-bobuli"
            value={productOverlayIndexName}
            onChange={(event) => setProductOverlayIndexName(event.currentTarget.value)}
          />
          {productOverlayImages.length > 0 && (
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Obrázky (přepis alt / titulků)
              </Text>
              {productOverlayImages.map((image) => (
              <Group key={image.id} align="flex-end" gap="sm">
                  <TextInput
                    label="Zdroj"
                    value={image.source}
                    readOnly
                    style={{ flex: 1.5 }}
                  />
                  <TextInput
                    label="Titulek"
                    placeholder="Titulek obrázku"
                    value={image.title}
                    onChange={(event) =>
                      handleOverlayImageChange(image.id, { title: event.currentTarget.value })
                    }
                    style={{ flex: 1 }}
                  />
                  <TextInput
                    label="Alt text"
                    placeholder="Alt text"
                    value={image.description}
                    onChange={(event) =>
                      handleOverlayImageChange(image.id, { description: event.currentTarget.value })
                    }
                    style={{ flex: 1 }}
                  />
                </Group>
              ))}
            </Stack>
          )}
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Text size="sm" fw={600}>
                Overlay data
              </Text>
              <Button variant="light" size="xs" onClick={handleOpenProductJsonModal}>
                Upravit JSON
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              {productOverlayJson.trim() === ''
                ? 'Žádná data nejsou nastavena.'
                : `${productOverlayJson.trim().split('\n').length} řádků JSON dat.`}
            </Text>
          </Stack>
          <Group justify="flex-end">
            <Button
              onClick={handleProductOverlaySave}
              loading={productOverlayMutation.isPending}
              disabled={selectedShopId === null}
            >
              Uložit overlay
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder>
        <Title order={4} mb="sm">
          Doplňující informace
        </Title>
        <Stack gap="md">
          {renderInfoGrid(baseInfoItems)}
          <div>
            <Title order={5} mb="xs">
              Metadata
            </Title>
            {renderKeyValueRows(baseMetaEntries)}
          </div>
        </Stack>
      </Card>

      {descriptiveParameterEntries.length > 0 && (
        <Card withBorder>
          <Title order={4} mb="sm">
            Deskriptivní parametry (zdroj)
          </Title>
          {renderParameterEntries(descriptiveParameterEntries)}
        </Card>
      )}

      {images.length > 0 && (
        <Card withBorder>
          <Title order={4} mb="sm">
            Obrázky
          </Title>
          <ScrollArea h={260} offsetScrollbars>
            <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md" pr="sm">
              {images.map((image, index) => {
                const imageRecord = image ?? {};
                const cdnName = imageRecord.cdnName as string | undefined;
                const imageName = imageRecord.name as string | undefined;
                const derivedUrl = cdnBaseUrl && (cdnName ?? imageName)
                  ? `${cdnBaseUrl}${cdnName ?? imageName}`
                  : undefined;
                const fallbackUrl = (imageRecord.detailUrl as string | undefined)
                  ?? (imageRecord.url as string | undefined)
                  ?? (imageRecord.thumbnailUrl as string | undefined);
                const url = derivedUrl ?? fallbackUrl;
                const caption = (imageRecord.description as string | undefined)
                  ?? imageName
                  ?? `Obrázek ${index + 1}`;
                const isMain = Boolean(
                  (imageRecord.isMainImage as boolean | undefined) ?? (imageRecord.isMain as boolean | undefined)
                );

                return (
                  <Stack key={`${url}-${index}`} gap={4} align="center">
                    {url ? (
                      <Image src={url} alt={caption} radius="sm" h={120} fit="contain" />
                    ) : (
                      <Card withBorder h={120} w="100%">
                        <Center h="100%">
                          <Text size="xs" c="dimmed">
                            Bez náhledu
                          </Text>
                        </Center>
                      </Card>
                    )}
                    <Text size="sm" ta="center">
                      {caption}
                    </Text>
                    {isMain && (
                      <Badge color="blue" size="sm">
                        Hlavní
                      </Badge>
                    )}
                  </Stack>
                );
              })}
            </SimpleGrid>
          </ScrollArea>
        </Card>
      )}

      {(categories.length > 0 || flags.length > 0 || measureUnit || sortVariants) && (
        <Card withBorder>
          <Title order={4} mb="sm">
            Kategorizace a štítky
          </Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {categories.length > 0 && (
              <Stack gap={4}>
                <Text size="sm" c="dimmed">
                  Kategorie
                </Text>
                {categories.map((category, index) => {
                  const record = category as Record<string, unknown>;
                  const mapping = asRecord(record.mapping);
                  const shopCategory =
                    asRecord(mapping?.shop_category ?? mapping?.shopCategory) ??
                    asRecord(record.shop_category ?? record.shopCategory);

                  const label =
                    (typeof record.path === 'string' ? record.path : undefined) ??
                    (typeof record.fullName === 'string' ? record.fullName : undefined) ??
                    (shopCategory && typeof shopCategory.path === 'string' ? shopCategory.path : undefined) ??
                    (shopCategory && typeof shopCategory.fullName === 'string' ? shopCategory.fullName : undefined) ??
                    (typeof record.name === 'string' ? record.name : undefined) ??
                    (typeof record.title === 'string' ? record.title : undefined) ??
                    (typeof record.label === 'string' ? record.label : undefined) ??
                    (shopCategory && typeof shopCategory.name === 'string' ? shopCategory.name : undefined) ??
                    '—';

                  return (
                    <Text key={`category-${index}`} size="sm">
                      {label}
                    </Text>
                  );
                })}
              </Stack>
            )}
            {flags.length > 0 && (
              <Stack gap={4}>
                <Text size="sm" c="dimmed">
                  Štítky
                </Text>
                {flags.map((flag, index) => (
                  <Badge key={`flag-${index}`} color="grape" variant="light" size="sm">
                    {(flag.name as string | undefined) ?? '—'}
                  </Badge>
                ))}
              </Stack>
            )}
            {(measureUnit || sortVariants) && (
              <Stack gap={4}>
                {measureUnit && (
                  <div>
                    <Text size="sm" c="dimmed">
                      Měrná jednotka
                    </Text>
                    <Text size="sm">{measureUnit.name ?? '—'}</Text>
                  </div>
                )}
                {sortVariants && (
                  <div>
                    <Text size="sm" c="dimmed">
                      Řazení variant
                    </Text>
                    <Text size="sm">{sortVariants}</Text>
                  </div>
                )}
              </Stack>
            )}
          </SimpleGrid>
        </Card>
      )}

      {filteringParameterEntries.length > 0 && (
        <Card withBorder>
          <Title order={4} mb="sm">
            Filtrovací parametry
          </Title>
          {renderParameterEntries(filteringParameterEntries)}
        </Card>
      )}

      {perPricelistPrices.length > 0 && (
        <Card withBorder>
          <Title order={4} mb="sm">
            Ceny podle ceníků
          </Title>
          <Table highlightOnHover verticalSpacing="sm" withRowBorders={false} striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Ceník</Table.Th>
                <Table.Th>Cena</Table.Th>
                <Table.Th>DPH</Table.Th>
                <Table.Th>Včetně DPH</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {perPricelistPrices.map((priceRecord, index) => {
                const priceList = priceRecord.priceList as { name?: string } | undefined;
                const priceInfo = priceRecord.price as {
                  price?: string;
                  includingVat?: boolean;
                  vatRate?: string;
                } | undefined;

                const priceValue = priceInfo?.price ? Number.parseFloat(priceInfo.price) : null;
                const vatRate = priceInfo?.vatRate ?? '—';
                const includingVat = priceInfo?.includingVat ? 'Ano' : 'Ne';

                return (
                  <Table.Tr key={`pricelist-${index}`}>
                    <Table.Td>{priceList?.name ?? '—'}</Table.Td>
                    <Table.Td>
                      {priceValue !== null ? formatPriceValue(priceValue, activeCurrencyCode) : '—'}
                    </Table.Td>
                    <Table.Td>{vatRate}</Table.Td>
                    <Table.Td>{includingVat}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      {setItems.length > 0 && (
        <Card withBorder>
          <Title order={4} mb="sm">
            Setové položky
          </Title>
          <Table highlightOnHover verticalSpacing="sm" withRowBorders={false} striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Produkt</Table.Th>
                <Table.Th>Množství</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {setItems.map((item, index) => {
                const productInfo = item.product as { name?: string } | undefined;
                const quantity = item.quantity ?? 1;

                return (
                  <Table.Tr key={`set-item-${index}`}>
                    <Table.Td>{productInfo?.name ?? '—'}</Table.Td>
                    <Table.Td>{formatDisplayValue(quantity)}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      {gifts.length > 0 && (
        <Card withBorder>
          <Title order={4} mb="sm">
            Dárky k produktu
          </Title>
          <Stack gap={4}>
            {gifts.map((gift, index) => (
              <Text key={`gift-${index}`} size="sm">
                {(gift.name as string | undefined) ?? '—'}
              </Text>
            ))}
          </Stack>
        </Card>
      )}

      {(alternativeProductEntries.length > 0 || relatedProductEntries.length > 0) && (
        <Card withBorder>
          <Title order={4} mb="sm">
            Související produkty
          </Title>
          <Stack gap="md">
            {alternativeProductEntries.length > 0 && (
              <div>
                <Title order={5} mb="xs">
                  Alternativy
                </Title>
                <Table withRowBorders={false} verticalSpacing="xs" striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Produkt</Table.Th>
                      <Table.Th>GUID</Table.Th>
                      <Table.Th>Typ vazby</Table.Th>
                      <Table.Th>Viditelnost</Table.Th>
                      <Table.Th>Priorita</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {alternativeProductEntries.map((entry, index) => (
                      <Table.Tr key={`alternative-${index}`}>
                        <Table.Td>{entry.label}</Table.Td>
                        <Table.Td>{entry.guid ?? '—'}</Table.Td>
                        <Table.Td>{entry.linkType ?? '—'}</Table.Td>
                        <Table.Td>{entry.visibility ?? '—'}</Table.Td>
                        <Table.Td>{entry.priority ?? '—'}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            )}
            {relatedProductEntries.length > 0 && (
              <div>
                <Title order={5} mb="xs">
                  Doporučené
                </Title>
                <Table withRowBorders={false} verticalSpacing="xs" striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Produkt</Table.Th>
                      <Table.Th>GUID</Table.Th>
                      <Table.Th>Typ vazby</Table.Th>
                      <Table.Th>Viditelnost</Table.Th>
                      <Table.Th>Priorita</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {relatedProductEntries.map((entry, index) => (
                      <Table.Tr key={`related-${index}`}>
                        <Table.Td>{entry.label}</Table.Td>
                        <Table.Td>{entry.guid ?? '—'}</Table.Td>
                        <Table.Td>{entry.linkType ?? '—'}</Table.Td>
                        <Table.Td>{entry.visibility ?? '—'}</Table.Td>
                        <Table.Td>{entry.priority ?? '—'}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            )}
          </Stack>
        </Card>
      )}

      <Card withBorder>
        <Title order={4} mb="sm">
          Parametry ({selectedLocale})
        </Title>
        {hasTranslationParameters ? (
          renderParameterEntries(translationParameterEntries)
        ) : (
          <Text size="sm" c="dimmed">
            Parametry zatím nejsou vyplněny.
          </Text>
        )}
      </Card>

      <Card withBorder>
        <Title order={4} mb="sm">
          SEO ({selectedLocale})
        </Title>
        {hasTranslationSeo ? (
          renderKeyValueRows(Object.entries(translationSeo))
        ) : (
          <Text size="sm" c="dimmed">
            SEO pole zatím nejsou vyplněna.
          </Text>
        )}
      </Card>

      {variants.length > 0 && (
        <Card withBorder>
          <Group justify="space-between" mb="md">
            <Title order={4}>Varianty ({variants.length})</Title>
          </Group>
          <Table highlightOnHover verticalSpacing="sm" withRowBorders={false} striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={160}>Kód</Table.Th>
                <Table.Th w={220}>Název</Table.Th>
                <Table.Th w={140}>SKU</Table.Th>
                <Table.Th w={150}>EAN</Table.Th>
                <Table.Th w={160}>Značka</Table.Th>
                <Table.Th w={160}>Dodavatel</Table.Th>
                <Table.Th w={190}>Stav překladu</Table.Th>
                <Table.Th w={200}>Kategorie</Table.Th>
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
              {variants.map((variant: ProductVariant) => {
                const statusDefinition = variantStatusMeta[variant.stock_status];
                const variantOverlay = variant.overlays?.find((overlay) => overlay.shop_id === selectedShopId);
                const variantTranslations = variant.translations ?? [];
                const variantTranslationRecord =
                  variantTranslations.find(
                    (record) => record.shop_id === selectedShopId && record.locale === selectedLocale
                  ) ??
                  variantTranslations.find((record) => record.shop_id === selectedShopId) ??
                  variantTranslations.find((record) => record.locale === selectedLocale);
                const displayName = variantTranslationRecord?.name ?? variant.name;
                const variantCategories = resolveVariantCategories(
                  variant,
                  categories,
                  (variantOverlay?.data ?? variantTranslationRecord?.data ?? variant.data) as
                    | Record<string, unknown>
                    | null
                );
                const variantParameters = getVariantParameters(variant, variantTranslationRecord);
                const availability = resolveVariantAvailability(
                  variant,
                  (variantOverlay?.data ?? variantTranslationRecord?.data ?? variant.data) as Record<string, unknown> | null
                );
                const displayStock = formatNumber(variantOverlay?.stock ?? variant.stock);
                const displayUnit = variantOverlay?.unit ?? variant.unit;
                const displayMinStock = formatNumber(variantOverlay?.min_stock_supply ?? variant.min_stock_supply);
                const currency = variantOverlay?.currency_code ?? variant.currency_code ?? activeCurrencyCode;
                const displayPrice = formatPriceValue(variantOverlay?.price ?? variant.price, currency);
                const displayPurchasePrice = formatPriceValue(
                  variantOverlay?.purchase_price ?? variant.purchase_price,
                  currency
                );
                const variantHasSavedTranslation =
                  !!selectedLocale &&
                  variantTranslations.some(
                    (record) =>
                      record.locale === selectedLocale &&
                      (record.shop_id === selectedShopId || record.shop_id === null) &&
                      !!record.name
                  );
                const variantDraftTranslation = variantOverlayForms[variant.id];
                const variantHasTranslation =
                  variantHasSavedTranslation || Boolean(variantDraftTranslation?.name?.trim());
                const variantRemoteRef =
                  selectedShopId !== null
                    ? variant.remote_refs?.find((ref) => ref.shop_id === selectedShopId) ?? null
                    : null;
                const variantHasMapping = Boolean(variantRemoteRef?.remote_guid);

                return (
                  <Table.Tr key={variant.id}>
                    <Table.Td>
                      <Text fw={600}>{variant.code}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text>{displayName ?? '—'}</Text>
                    </Table.Td>
                    <Table.Td>{variant.sku ?? '—'}</Table.Td>
                    <Table.Td>{variant.ean ?? '—'}</Table.Td>
                    <Table.Td>{variant.brand ?? '—'}</Table.Td>
                    <Table.Td>{variant.supplier ?? '—'}</Table.Td>
                    <Table.Td>
                      <Stack gap={4} align="flex-start">
                        {selectedLocale ? (
                          <Badge color={variantHasTranslation ? 'teal' : 'orange'} variant="light">
                            {variantHasTranslation ? 'Překlad hotový' : 'Chybí překlad'}
                          </Badge>
                        ) : (
                          <Badge color="gray" variant="light">
                            Vyber jazyk
                          </Badge>
                        )}
                        {selectedShopId !== null && (
                          <>
                            <Badge color={variantHasMapping ? 'teal' : 'orange'} variant="light">
                              {variantHasMapping ? 'Napárováno' : 'Chybí napárování'}
                            </Badge>
                            {variantHasMapping && variantRemoteRef?.remote_guid && (
                              <Text size="xs" c="dimmed">
                                {variantRemoteRef.remote_guid}
                              </Text>
                            )}
                          </>
                        )}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      {variantCategories.length > 0 ? (
                        <Stack gap={2} align="flex-start">
                          {variantCategories.map((categoryName, categoryIndex) => (
                            <Text size="sm" key={`${variant.id}-category-${categoryIndex}`}>
                              {categoryName}
                            </Text>
                          ))}
                        </Stack>
                      ) : (
                        <Text size="sm">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={statusDefinition.color}>{statusDefinition.label}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text>{displayStock}</Text>
                      {displayUnit && (
                        <Text size="xs" c="dimmed">
                          {displayUnit}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>{displayMinStock}</Table.Td>
                    <Table.Td>{displayPrice}</Table.Td>
                    <Table.Td>{displayPurchasePrice}</Table.Td>
                    <Table.Td>
                      {variantParameters.length > 0 ? (
                        <Stack gap={4} align="flex-start">
                          {variantParameters.map((param, paramIndex) => (
                            <div key={`${variant.id}-param-${paramIndex}`}>
                              <Text size="sm" fw={600}>
                                {param.name}
                              </Text>
                              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                                {param.value}
                              </Text>
                              {param.description && (
                                <Text size="xs" c="dimmed">
                                  {param.description}
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
        </Card>
      )}

      {variants.length > 0 && (
        <Card withBorder>
          <Title order={4} mb="sm">
            Úprava overlaye variant
          </Title>
          <Accordion chevronPosition="right" variant="contained">
            {variants.map((variant) => {
              const formState = variantOverlayForms[variant.id] ?? createEmptyVariantOverlayFormState();

              const masterSnapshot = (variant.data ?? {}) as Record<string, unknown>;

              return (
                <Accordion.Item value={variant.id} key={`variant-overlay-${variant.id}`}>
                  <Accordion.Control>
                    {variant.code} – {(variant.name as string | null) ?? 'Bez názvu'}
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      <Title order={6}>Zdrojová data (master)</Title>
                      {renderKeyValueRows(Object.entries(masterSnapshot))}
                      <Title order={6}>Overlay ({selectedShop?.name ?? `Shop #${selectedShopId}`})</Title>
                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                        <TextInput
                          label="Cena"
                          placeholder="např. 199.90"
                          value={formState.price}
                          onChange={(event) =>
                            handleVariantOverlayFieldChange(variant.id, 'price', event.currentTarget.value)
                          }
                        />
                        <TextInput
                          label="Nákupní cena"
                          value={formState.purchase_price}
                          onChange={(event) =>
                            handleVariantOverlayFieldChange(
                              variant.id,
                              'purchase_price',
                              event.currentTarget.value
                            )
                          }
                        />
                        <TextInput
                          label="DPH (%)"
                          value={formState.vat_rate}
                          onChange={(event) =>
                            handleVariantOverlayFieldChange(variant.id, 'vat_rate', event.currentTarget.value)
                          }
                        />
                        <TextInput
                          label="Sklad"
                          value={formState.stock}
                          onChange={(event) =>
                            handleVariantOverlayFieldChange(variant.id, 'stock', event.currentTarget.value)
                          }
                        />
                        <TextInput
                          label="Min. zásoba"
                          value={formState.min_stock_supply}
                          onChange={(event) =>
                            handleVariantOverlayFieldChange(
                              variant.id,
                              'min_stock_supply',
                              event.currentTarget.value
                            )
                          }
                        />
                        <TextInput
                          label="Měna"
                          value={formState.currency_code}
                          onChange={(event) =>
                            handleVariantOverlayFieldChange(variant.id, 'currency_code', event.currentTarget.value)
                          }
                        />
                        <TextInput
                          label="Jednotka"
                          value={formState.unit}
                          onChange={(event) =>
                            handleVariantOverlayFieldChange(variant.id, 'unit', event.currentTarget.value)
                          }
                        />
                      </SimpleGrid>
                      <Divider label="Obsah varianty" labelPosition="center" my="sm" />
                      <Stack gap="xs">
                        <TextInput
                          label="Název varianty"
                          placeholder="Např. 50 ml"
                          value={formState.name}
                          onChange={(event) =>
                            handleVariantOverlayFieldChange(variant.id, 'name', event.currentTarget.value)
                          }
                        />
                        <Stack gap="xs">
                          {formState.parameters.length === 0 ? (
                            <Text size="sm" c="dimmed">
                              Parametry varianty zatím nejsou vyplněny.
                            </Text>
                          ) : (
                            formState.parameters.map((parameter, index) => (
                              <Card key={parameter.id ?? `${variant.id}-param-${index}`} withBorder p="sm">
                                <Stack gap="xs">
                                  <TextInput
                                    label="Název parametru"
                                    placeholder="Např. Barva"
                                    value={parameter.name}
                                    onChange={(event) =>
                                      handleVariantParameterChange(
                                        variant.id,
                                        index,
                                        'name',
                                        event.currentTarget.value
                                      )
                                    }
                                  />
                                  <Textarea
                                    label="Hodnota"
                                    placeholder="Např. Černá"
                                    autosize
                                    minRows={2}
                                    value={parameter.value}
                                    onChange={(event) =>
                                      handleVariantParameterChange(
                                        variant.id,
                                        index,
                                        'value',
                                        event.currentTarget.value
                                      )
                                    }
                                  />
                                  <Group justify="flex-end">
                                    <Button
                                      variant="subtle"
                                      size="xs"
                                      color="red"
                                      type="button"
                                      onClick={() => handleVariantParameterRemove(variant.id, index)}
                                    >
                                      Odebrat parametr
                                    </Button>
                                  </Group>
                                </Stack>
                              </Card>
                            ))
                          )}
                          <Group justify="space-between" align="center">
                            <Button
                              variant="outline"
                              size="xs"
                              type="button"
                              onClick={() => handleVariantParameterAdd(variant.id)}
                            >
                              Přidat parametr
                            </Button>
                            <Group gap="xs">
                              {(() => {
                                const masterParameters = toVariantParameterFormValues(
                                  Array.isArray(masterSnapshot.variantParameters)
                                    ? masterSnapshot.variantParameters
                                    : Array.isArray(masterSnapshot.parameters)
                                      ? (masterSnapshot.parameters as Array<unknown>)
                                      : []
                                );

                                return (
                                  <Button
                                    variant="subtle"
                                    size="xs"
                                    type="button"
                                    disabled={masterParameters.length === 0}
                                    onClick={() =>
                                      handleVariantParametersReplace(variant.id, masterParameters)
                                    }
                                  >
                                    Načíst z masteru
                                  </Button>
                                );
                              })()}
                              <Button
                                variant="subtle"
                                color="gray"
                                size="xs"
                                type="button"
                                onClick={() => handleVariantParametersReplace(variant.id, [])}
                              >
                                Vyprázdnit
                              </Button>
                            </Group>
                          </Group>
                        </Stack>
                        <JsonInput
                          label="Další pole (JSON)"
                          description="Volitelné speciální hodnoty, které se přidají k variantě."
                          value={formState.additional_data}
                          onChange={(value) => handleVariantOverlayFieldChange(variant.id, 'additional_data', value)}
                          autosize
                          minRows={3}
                        />
                      </Stack>
                      <Group justify="flex-end">
                        <Button
                          onClick={() => handleVariantOverlaySave(variant.id)}
                          loading={variantOverlayMutation.isPending}
                          disabled={selectedShopId === null}
                        >
                          Uložit overlay varianty
                        </Button>
                      </Group>
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion>
        </Card>
      )}
      </Stack>

      <Modal
        opened={aiModalOpened}
        onClose={closeAiModal}
        title="AI překlad"
        size="xl"
      >
        {aiStep === 'mapping' && (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Nejprve zkontroluj mapování parametrů pro {selectedShopLabel} ({selectedLocale ?? '—'}).
            </Text>
            {aiMappingMutation.isPending ? (
              <Group justify="center">
                <Loader />
              </Group>
            ) : aiMappingMissing ? (
              <Stack gap="md">
                {aiMappingError && (
                  <Card withBorder radius="md" p="sm" bg="red.0">
                    <Text size="sm">{aiMappingError}</Text>
                  </Card>
                )}
                {renderMappingSummaryCards()}
                {renderFilteringMappingEditor()}
                {renderVariantMappingEditor()}
                <Group justify="space-between">
                  <Button variant="default" onClick={closeAiModal}>
                    Zavřít
                  </Button>
                  <Button color="grape" onClick={handleMappingSubmit} loading={aiMappingMutation.isPending}>
                    Ověřit mapování
                  </Button>
                </Group>
              </Stack>
            ) : (
              <Stack gap="md">
                {renderAiSectionPreview('filtering_parameters')}
                {renderAiSectionPreview('variants')}
                <Group justify="space-between">
                  <Button variant="default" onClick={closeAiModal}>
                    Zavřít
                  </Button>
                  <Button
                    color="grape"
                    onClick={startAiGeneration}
                    loading={aiDraftMutation.isPending}
                    disabled={aiDraftMutation.isPending}
                  >
                    Získat překlad
                  </Button>
                </Group>
              </Stack>
            )}
          </Stack>
        )}

        {aiStep === 'review' && (
          <Stack gap="md">
            {aiResult ? (
              <>
                <Text size="sm" c="dimmed">
                  Vyber sekce, které chceš použít do formuláře. Nevybrané části zůstanou beze změny.
                </Text>
                <Stack gap="md">
                  {aiResult.sections.map((section) => (
                    <Card key={section} withBorder radius="md" p="md">
                      <Stack gap="sm">
                        <Checkbox
                          checked={Boolean(aiAppliedSections[section])}
                          label={aiSectionLabels[section] ?? section}
                          onChange={(event) =>
                            handleAiAppliedSectionChange(section, event.currentTarget.checked)
                          }
                        />
                        <Divider />
                        {renderAiSectionPreview(section)}
                      </Stack>
                    </Card>
                  ))}
                </Stack>
                <Group justify="space-between" mt="sm">
                  <Button
                    variant="subtle"
                    onClick={() => {
                      setAiStep('mapping');
                      setAiResult(null);
                      setAiAppliedSections({});
                    }}
                  >
                    Upravit výběr sekcí
                  </Button>
                  <Group>
                    <Button variant="default" onClick={closeAiModal}>
                      Zavřít
                    </Button>
                    <Button color="grape" onClick={applyAiSuggestion}>
                      Vložit do formuláře
                    </Button>
                  </Group>
                </Group>
              </>
            ) : (
              <Stack gap="md">
                <Text size="sm">Výsledek překladu se nepodařilo načíst.</Text>
                <Group justify="space-between">
                  <Button
                    variant="subtle"
                    onClick={() => {
                      setAiStep('mapping');
                      setAiResult(null);
                      setAiAppliedSections({});
                    }}
                  >
                    Zkusit znovu
                  </Button>
                  <Button variant="default" onClick={closeAiModal}>
                    Zavřít
                  </Button>
                </Group>
              </Stack>
            )}
          </Stack>
        )}
      </Modal>

      <Modal
        opened={productJsonModalOpened}
        onClose={closeProductJsonModal}
        title="Overlay data (JSON)"
        size="xl"
      >
        <JsonInput
          autosize
          formatOnBlur
          minRows={12}
          validationError="Zadej platný JSON"
          value={productJsonDraft}
          onChange={setProductJsonDraft}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={closeProductJsonModal}>
            Zrušit
          </Button>
          <Button onClick={handleConfirmProductJsonModal}>Použít</Button>
        </Group>
      </Modal>

    </>
  );
};
