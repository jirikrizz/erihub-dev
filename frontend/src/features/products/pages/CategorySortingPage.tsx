import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  NumberInput,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowBackUp, IconDeviceFloppy, IconInfoCircle, IconSparkles } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShops } from '../../shoptet/hooks/useShops';
import { useCategoryTree } from '../../pim/hooks/useCategoryTree';
import { useCategoryProductPriority } from '../hooks/useCategoryProductPriority';
import {
  generateCategoryProductsPriorityAi,
  updateCategoryProductsPriority,
  type CategoryProductPriorityItem,
  type CategoryProductPriorityResponse,
  type CategoryProductPriorityAiSuggestion,
} from '../../../api/pim';
import type { ShopTreeNode } from '../../../api/pim';
import type { Shop } from '../../../api/shops';
import { SectionPageShell } from '../../../components/layout/SectionPageShell';

const EMPTY_SHOPS: Shop[] = [];
const EMPTY_SHOP_TREE: ShopTreeNode[] = [];
const EMPTY_PRIORITY_ITEMS: CategoryProductPriorityItem[] = [];
const EMPTY_PRIORITY_ERRORS: CategoryProductPriorityResponse['errors'] = [];
const EMPTY_AI_SUGGESTIONS: CategoryProductPriorityAiSuggestion[] = [];

const flattenShopCategories = (nodes: ShopTreeNode[], prefix: string[] = []): Array<{ value: string; label: string }> =>
  nodes.flatMap((node) => {
    const nextPrefix = [...prefix, node.name];
    const label = node.path ?? nextPrefix.join(' > ');
    const current = [{ value: node.remote_guid, label }];

    if (node.children.length === 0) {
      return current;
    }

    return [...current, ...flattenShopCategories(node.children, nextPrefix)];
  });

const numberFormatter = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

const integerFormatter = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0, minimumFractionDigits: 0 });

const dateTimeFormatter = new Intl.DateTimeFormat('cs-CZ', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return dateTimeFormatter.format(parsed);
};

const resolveApiErrorMessage = (error: unknown, fallback: string): string => {
  if (error && typeof error === 'object') {
    const maybeResponse = (error as { response?: { data?: unknown } }).response;
    if (maybeResponse && typeof maybeResponse === 'object') {
      const data = maybeResponse.data as { message?: unknown } | undefined;
      if (data && typeof data.message === 'string' && data.message.trim()) {
        return data.message;
      }
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
};

type AiEvaluationState = {
  evaluatedAt: string;
  criteria: string | null;
  suggestions: Record<string, { priority: number; rationale: string }>;
};

const normalizeVisibilityValue = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  const normalized = value.toString().trim().toLowerCase();

  switch (normalized) {
    case 'visible':
    case 'public':
    case 'shown':
    case 'show':
    case 'yes':
    case 'true':
    case 'active':
    case 'available':
      return 'visible';
    case 'hidden':
    case 'invisible':
    case 'no':
    case 'false':
    case 'inactive':
    case 'disabled':
    case 'private':
    case 'blocked':
    case 'unavailable':
      return 'hidden';
    case 'draft':
    case 'pending':
    case 'prepared':
    case 'notlisted':
    case 'not_listed':
    case 'unlisted':
    case 'archived':
    case 'waiting':
      return 'draft';
    default:
      return value;
  }
};

const getVisibilityMeta = (value: string | null | undefined) => {
  const normalized = normalizeVisibilityValue(value);

  if (!normalized) {
    return { label: 'Neznámá', color: 'gray' };
  }

  if (normalized === 'visible') {
    return { label: 'Viditelné', color: 'teal' };
  }

  if (normalized === 'hidden') {
    return { label: 'Skryté', color: 'red' };
  }

  if (normalized === 'draft') {
    return { label: 'Nezveřejněné', color: 'yellow' };
  }

  return { label: value ?? 'Neznámá', color: 'gray' };
};

const VisibilityBadge = ({ value, size = 'sm' }: { value: string | null | undefined; size?: 'xs' | 'sm' }) => {
  const meta = getVisibilityMeta(value);

  return (
    <Badge color={meta.color} variant="light" size={size}>
      {meta.label}
    </Badge>
  );
};

export const CategorySortingPage = () => {
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
  const [selectedCategoryGuid, setSelectedCategoryGuid] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 20;

  const shopsQuery = useShops({ per_page: 100 });
  const shops = shopsQuery.data?.data ?? EMPTY_SHOPS;

  const queryClient = useQueryClient();
  const [priorityDrafts, setPriorityDrafts] = useState<Record<string, number | null>>({});
  const [savingGuid, setSavingGuid] = useState<string | null>(null);
  const [aiEvaluation, setAiEvaluation] = useState<AiEvaluationState | null>(null);

  const updatePriorityMutation = useMutation({
    mutationFn: updateCategoryProductsPriority,
  });

  const {
    mutate: evaluateAi,
    reset: resetAiEvaluation,
    isPending: isAiEvaluationPending,
  } = useMutation({
    mutationFn: generateCategoryProductsPriorityAi,
  });

  const shopOptions = useMemo(
    () =>
      shops
        .map((shop) => ({
          value: shop.id.toString(),
          label: `${shop.is_master ? 'Master — ' : ''}${shop.name ?? `#${shop.id}`} (${shop.locale?.toUpperCase() ?? '??'})`,
          isMaster: shop.is_master,
        }))
        .sort((a, b) => {
          if (a.isMaster === b.isMaster) {
            return a.label.localeCompare(b.label, 'cs');
          }
          return a.isMaster ? -1 : 1;
        })
        .map(({ value, label }) => ({ value, label })),
    [shops]
  );

  useEffect(() => {
    if (selectedShopId !== null) {
      return;
    }

    const preferred = shopOptions[0];
    if (preferred) {
      setSelectedShopId(Number(preferred.value));
    }
  }, [selectedShopId, shopOptions]);

  useEffect(() => {
    setSelectedCategoryGuid(null);
    setPage(1);
  }, [selectedShopId]);

  useEffect(() => {
    setPage(1);
  }, [selectedCategoryGuid]);

  const resetAiEvaluationRef = useRef(resetAiEvaluation);

  useEffect(() => {
    resetAiEvaluationRef.current = resetAiEvaluation;
  }, [resetAiEvaluation]);

  useEffect(() => {
    setAiEvaluation(null);
    resetAiEvaluationRef.current();
  }, [selectedShopId, selectedCategoryGuid]);

  const categoryTree = useCategoryTree(selectedShopId ? { shop_id: selectedShopId } : {});

  const shopCategories = categoryTree.data?.shop ?? EMPTY_SHOP_TREE;

  const categoryOptions = useMemo(() => {
    if (!selectedShopId) {
      return [] as Array<{ value: string; label: string }>;
    }

    return flattenShopCategories(shopCategories);
  }, [selectedShopId, shopCategories]);

  const priorityParams = useMemo(
    () => ({
      shop_id: selectedShopId ?? undefined,
      category_guid: selectedCategoryGuid ?? undefined,
      page,
      per_page: perPage,
    }),
    [selectedShopId, selectedCategoryGuid, page, perPage]
  );

  const priorityQuery = useCategoryProductPriority(priorityParams, {
    enabled: Boolean(priorityParams.shop_id && priorityParams.category_guid),
  });

  const items = priorityQuery.data?.data.items ?? EMPTY_PRIORITY_ITEMS;
  const paginator = priorityQuery.data?.data.paginator;
  const shoptetErrors = priorityQuery.data?.errors ?? EMPTY_PRIORITY_ERRORS;
  const canEdit = Boolean(selectedShopId && selectedCategoryGuid);
  const isMutationPending = updatePriorityMutation.isPending;

  useEffect(() => {
    const currentGuids = new Set(items.map((item) => item.product_guid));

    setPriorityDrafts((prev) => {
      let mutated = false;
      const next: Record<string, number | null> = {};

      for (const key of Object.keys(prev)) {
        if (currentGuids.has(key)) {
          next[key] = prev[key];
        } else {
          mutated = true;
        }
      }

      return mutated ? next : prev;
    });
  }, [items]);

  const handlePriorityChange = (guid: string, original: number | null, value: string | number) => {
    let normalized: number | null;

    if (value === '' || value === null) {
      normalized = null;
    } else {
      const parsed = typeof value === 'number' ? value : Number(value);
      normalized = Number.isFinite(parsed) ? Math.round(parsed) : null;
    }

    const originalNormalized = original ?? null;

    setPriorityDrafts((prev) => {
      if (normalized === originalNormalized) {
        if (!Object.prototype.hasOwnProperty.call(prev, guid)) {
          return prev;
        }

        const rest = { ...prev };
        delete rest[guid];
        return rest;
      }

      if (Object.prototype.hasOwnProperty.call(prev, guid) && prev[guid] === normalized) {
        return prev;
      }

      return { ...prev, [guid]: normalized };
    });
  };

  const handleAiEvaluate = () => {
    if (!selectedShopId || !selectedCategoryGuid) {
      notifications.show({
        message: 'Vyber prosím shop i kategorii před spuštěním AI analýzy.',
        color: 'yellow',
      });
      return;
    }

    evaluateAi(
      {
        shop_id: selectedShopId,
        category_guid: selectedCategoryGuid,
        pages: 2,
        per_page: perPage,
      },
      {
        onSuccess: (response) => {
          const data = response?.data;
          const suggestions = data?.suggestions ?? EMPTY_AI_SUGGESTIONS;

          if (!suggestions.length) {
            notifications.show({
              message: 'AI nevrátila žádné návrhy pro tuto kategorii.',
              color: 'yellow',
            });
            setAiEvaluation(null);
            return;
          }

          const suggestionMap = suggestions.reduce<AiEvaluationState['suggestions']>((acc, item) => {
            if (item && typeof item.product_guid === 'string') {
              acc[item.product_guid] = {
                priority: item.suggested_priority,
                rationale: item.rationale,
              };
            }
            return acc;
          }, {});

          setAiEvaluation({
            evaluatedAt: data?.evaluated_at ?? new Date().toISOString(),
            criteria: data?.criteria ?? null,
            suggestions: suggestionMap,
          });

          notifications.show({
            message: 'AI připravila návrhy priorit. V pravém sloupci tabulky můžeš návrhy aplikovat.',
            color: 'violet',
          });
        },
        onError: (error) => {
          const message = resolveApiErrorMessage(
            error,
            'AI vyhodnocení priorit se nepovedlo. Zkus to prosím znovu.'
          );

          notifications.show({ message, color: 'red' });
        },
      }
    );
  };

  const handlePriorityReset = (guid: string) => {
    setPriorityDrafts((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, guid)) {
        return prev;
      }

      const rest = { ...prev };
      delete rest[guid];
      return rest;
    });
  };

  const handlePrioritySave = (guid: string, original: number | null) => {
    if (!selectedShopId || !selectedCategoryGuid) {
      notifications.show({
        message: 'Vyber prosím shop i kategorii před uložením priority.',
        color: 'yellow',
      });
      return;
    }

    if (isMutationPending) {
      return;
    }

    const hasDraft = Object.prototype.hasOwnProperty.call(priorityDrafts, guid);
    if (!hasDraft) {
      return;
    }

    const draftValue = priorityDrafts[guid] ?? null;
    const originalValue = original ?? null;

    if (draftValue === originalValue) {
      return;
    }

    setSavingGuid(guid);

    updatePriorityMutation.mutate(
      {
        shop_id: selectedShopId,
        category_guid: selectedCategoryGuid,
        updates: [
          {
            product_guid: guid,
            priority: draftValue ?? null,
          },
        ],
      },
      {
        onSuccess: (data) => {
          const errors = Array.isArray(data?.errors) ? data.errors : [];

          if (errors.length > 0) {
            const message = errors[0]?.message ?? 'Shoptet vrátil chybu při ukládání priority.';
            notifications.show({ message, color: 'red' });
            return;
          }

          notifications.show({ message: 'Priorita byla uložena.', color: 'teal' });
          setPriorityDrafts((prev) => {
            if (!Object.prototype.hasOwnProperty.call(prev, guid)) {
              return prev;
            }

            const rest = { ...prev };
            delete rest[guid];
            return rest;
          });
          queryClient.invalidateQueries({ queryKey: ['category-priority'] });
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Uložení priority selhalo.';
          notifications.show({ message, color: 'red' });
        },
        onSettled: () => {
          setSavingGuid(null);
        },
      }
    );
  };

  const isLoading = priorityQuery.isLoading;
  const isFetching = priorityQuery.isFetching && !priorityQuery.isLoading;

  return (
    <SectionPageShell
      section="products"
      title="Kategorické řazení"
      description="Optimalizuj pořadí produktů v kategoriích pro jednotlivé shopy."
      actions={
        paginator ? (
          <Badge color="brand" variant="light">
            Celkem produktů: {integerFormatter.format(paginator.total)}
          </Badge>
        ) : undefined
      }
    >
      <Stack gap="lg">
        <Card withBorder padding="md" radius="md">
        <Stack gap="sm">
          <Group gap="md" align="flex-end">
            <Select
              label="Stát / shop"
              placeholder={shopsQuery.isLoading ? 'Načítám...' : 'Vyber shop'}
              data={shopOptions}
              value={selectedShopId !== null ? selectedShopId.toString() : null}
              onChange={(value) => setSelectedShopId(value ? Number(value) : null)}
              searchable
              clearable
              nothingFoundMessage="Žádný shop"
              disabled={shopsQuery.isLoading || shopOptions.length === 0}
            />
            <Select
              label="Kategorie"
              placeholder={selectedShopId ? 'Vyber kategorii' : 'Nejprve zvol shop'}
              data={categoryOptions}
              value={selectedCategoryGuid}
              onChange={(value) => setSelectedCategoryGuid(value)}
              searchable
              clearable
              nothingFoundMessage={categoryTree.isLoading ? 'Načítám...' : 'Žádná kategorie'}
              disabled={!selectedShopId || categoryTree.isLoading || categoryOptions.length === 0}
            />
          </Group>
          {selectedShopId && selectedCategoryGuid ? null : (
            <Text size="sm" c="gray.6">
              Vyber nejprve shop a konkrétní kategorii, pro kterou chceš zobrazit pořadí produktů.
            </Text>
          )}
          <Group justify="flex-end">
            <Button
              leftSection={<IconSparkles size={16} />}
              variant="light"
              onClick={handleAiEvaluate}
              loading={isAiEvaluationPending}
              disabled={!canEdit || isAiEvaluationPending || priorityQuery.isFetching}
            >
              Vyhodnotit AI priority
            </Button>
          </Group>
        </Stack>
      </Card>

      {shoptetErrors.length > 0 ? (
        <Alert color="orange" icon={<IconInfoCircle size={18} />} variant="light">
          {shoptetErrors.map((error, index) => (
            <Text key={`${error.errorCode ?? 'error'}-${index}`} size="sm">
              {error.message ?? 'Neznámá chyba ze Shoptetu'}
            </Text>
          ))}
        </Alert>
      ) : null}

      {aiEvaluation ? (
        <Alert color="violet" icon={<IconSparkles size={18} />} variant="light">
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              AI doporučení z {formatDateTime(aiEvaluation.evaluatedAt)}
            </Text>
            {aiEvaluation.criteria ? (
              <Text size="sm">{aiEvaluation.criteria}</Text>
            ) : null}
          </Stack>
        </Alert>
      ) : null}

      <Card withBorder padding="0" radius="md">
        {isLoading ? (
          <Group justify="center" align="center" mih={160}>
            <Loader />
          </Group>
        ) : items.length === 0 ? (
          <Group justify="center" align="center" mih={160}>
            <Stack gap={4} align="center">
              <Title order={5}>Žádné produkty</Title>
              <Text size="sm" c="gray.6" ta="center">
                Zkontroluj, zda je pro zvolenou kategorii v Shoptetu nastavené pořadí produktů.
              </Text>
            </Stack>
          </Group>
        ) : (
          <Table horizontalSpacing="md" verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Místo</Table.Th>
                <Table.Th>Produkt</Table.Th>
                <Table.Th>Priorita</Table.Th>
                <Table.Th>Viditelnost</Table.Th>
                <Table.Th>AI návrh</Table.Th>
                <Table.Th>Sklad</Table.Th>
                <Table.Th>Nákupy (30 dní)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item) => {
                const originalPriority = item.priority ?? null;
                const hasDraft = Object.prototype.hasOwnProperty.call(priorityDrafts, item.product_guid);
                const draftValue = hasDraft ? priorityDrafts[item.product_guid] ?? null : null;
                const effectivePriority = hasDraft ? draftValue : originalPriority;
                const inputValue = effectivePriority ?? undefined;
                const changed = hasDraft && draftValue !== originalPriority;
                const isSavingRow = savingGuid === item.product_guid && isMutationPending;
                const disableSave = !canEdit || !changed || (isMutationPending && !isSavingRow);
                const disableReset = !changed || isMutationPending;
                const aiSuggestion = aiEvaluation?.suggestions[item.product_guid];
                const suggestionApplied = aiSuggestion
                  ? (effectivePriority ?? null) === (aiSuggestion.priority ?? null)
                  : false;
                const disableAiApply = !canEdit || isAiEvaluationPending || isMutationPending;
                const hasVariantVisibilityDetails = item.variants && item.variants.length > 1;

                return (
                  <Table.Tr key={`${item.product_guid}-${item.position}`}>
                    <Table.Td>{item.position}</Table.Td>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text fw={500}>{item.name ?? '—'}</Text>
                        <Text size="xs" c="dimmed">
                          {item.sku ?? item.product_guid}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={6}>
                        <Group gap={4} align="center">
                          <NumberInput
                            value={inputValue}
                            onChange={(value) => handlePriorityChange(item.product_guid, originalPriority, value)}
                            min={0}
                            step={1}
                            size="xs"
                            w={120}
                            disabled={!canEdit || isMutationPending}
                          />
                          <Tooltip label="Uložit prioritu" withArrow position="top">
                            <ActionIcon
                              color="teal"
                              variant="light"
                              onClick={() => handlePrioritySave(item.product_guid, originalPriority)}
                              disabled={disableSave}
                              loading={isSavingRow}
                            >
                              <IconDeviceFloppy size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Vrátit změnu" withArrow position="top">
                            <ActionIcon
                              color="gray"
                              variant="subtle"
                              onClick={() => handlePriorityReset(item.product_guid)}
                              disabled={disableReset}
                            >
                              <IconArrowBackUp size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={6}>
                        <VisibilityBadge value={item.visibility} />
                        {hasVariantVisibilityDetails ? (
                          <Stack gap={2}>
                            {item.variants?.map((variant) => (
                              <Group
                                key={`${item.product_guid}-${variant.variant_id ?? variant.code ?? 'variant'}-visibility`}
                                gap={6}
                                align="center"
                              >
                                <Text size="xs" c="dimmed">
                                  {(variant.name ?? variant.code ?? 'Varianta') + ':'}
                                </Text>
                                <VisibilityBadge value={variant.visibility} size="xs" />
                              </Group>
                            ))}
                          </Stack>
                        ) : null}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      {aiSuggestion ? (
                        <Stack gap={6}>
                          <Group gap={6} align="center">
                            <Badge color={suggestionApplied ? 'teal' : 'violet'} variant="light">
                              {aiSuggestion.priority}
                            </Badge>
                            <Tooltip
                              label={
                                suggestionApplied
                                  ? 'Návrh je už použitý v poli vlevo.'
                                  : 'Vyplnit pole priority návrhem AI'
                              }
                              withArrow
                              position="top"
                            >
                              <ActionIcon
                                color={suggestionApplied ? 'teal' : 'violet'}
                                variant="light"
                                onClick={() =>
                                  handlePriorityChange(
                                    item.product_guid,
                                    originalPriority,
                                    aiSuggestion.priority
                                  )
                                }
                                disabled={disableAiApply || suggestionApplied}
                              >
                                <IconSparkles size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                          {aiSuggestion.rationale ? (
                            <Text size="xs" c="dimmed">
                              {aiSuggestion.rationale}
                            </Text>
                          ) : null}
                        </Stack>
                      ) : (
                        <Text size="sm" c="gray.5">
                          —
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={4}>
                        <Text>{item.stock === null ? '—' : numberFormatter.format(item.stock)}</Text>
                        {item.variants && item.variants.length > 1 ? (
                          <Stack gap={2}>
                            {item.variants.map((variant) => (
                              <Text size="xs" c="dimmed" key={`${item.product_guid}-${variant.variant_id ?? variant.code ?? 'variant'}`}>
                                {(variant.name ?? variant.code ?? 'Varianta') + ':'}{' '}
                                {variant.stock === null ? '—' : numberFormatter.format(variant.stock)}
                              </Text>
                            ))}
                          </Stack>
                        ) : null}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={4}>
                        <Text>{integerFormatter.format(item.purchases_30d)}</Text>
                        {item.variants && item.variants.length > 1 ? (
                          <Stack gap={2}>
                            {item.variants.map((variant) => (
                              <Text size="xs" c="dimmed" key={`${item.product_guid}-${variant.variant_id ?? variant.code ?? 'variant'}-purchases`}>
                                {(variant.name ?? variant.code ?? 'Varianta') + ':'}{' '}
                                {integerFormatter.format(variant.purchases_30d)}
                              </Text>
                            ))}
                          </Stack>
                        ) : null}
                      </Stack>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
        {isFetching && !isLoading ? (
          <Group justify="center" py="sm">
            <Loader size="sm" />
          </Group>
        ) : null}
      </Card>

      {paginator && paginator.page_count > 1 ? (
        <Group justify="space-between" align="center">
          <Text size="sm" c="gray.6">
            Stránka {paginator.page} z {paginator.page_count}
          </Text>
          <Pagination value={paginator.page} total={paginator.page_count} onChange={setPage} />
        </Group>
      ) : null}
    </Stack>
  </SectionPageShell>
  );
};