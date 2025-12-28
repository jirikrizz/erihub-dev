import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCircleCheck,
  IconDeviceFloppy,
  IconDownload,
  IconInfoCircle,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import clsx from 'clsx';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEventHandler,
} from 'react';
import { SectionPageShell } from '../../../components/layout/SectionPageShell';
import type {
  AttributeMappingItem,
  AttributeMappingRecord,
  AttributeMappingResponse,
  AttributeMappingType,
  AttributeMappingValue,
  AttributeValueMappingRecord,
} from '../../../api/pim';
import { useShops } from '../../shoptet/hooks/useShops';
import {
  useAttributeMappings,
  useSaveAttributeMappings,
  useAttributeMappingAiSuggest,
  useSyncAttributeOptions,
} from '../../pim/hooks/useAttributeMappings';

const ATTRIBUTE_DND_TYPE = 'attribute-mapping-item';
const VALUE_DND_TYPE = 'attribute-value-mapping-item';

const ATTRIBUTE_TYPES: Array<{ label: string; value: AttributeMappingType }> = [
  { label: 'Varianty', value: 'variants' },
  { label: 'Filtry', value: 'filtering_parameters' },
  { label: 'Product flagy', value: 'flags' },
];

const ATTRIBUTE_TYPE_HELP: Record<AttributeMappingType, string> = {
  variants:
    'Mapuj parametry variant (např. barva, velikost) mezi master shopem a cílovým shopem. Parametry, které mají stejný text jako master jazyk, automaticky skrýváme.',
  filtering_parameters:
    'Přiřaď filtrační parametry a jejich hodnoty, aby se ve všech shopech používala shodná logika. Parametry se stejným názvem jako v master jazyce jsou vyfiltrovány.',
  flags:
    'Synchronizuj produktové flagy (např. Akce, Novinka) mezi jednotlivými shopy. Flagy totožné s master jazykem nejsou nabízeny.',
};

const ATTRIBUTE_TYPE_DOWNLOAD_LABEL: Record<AttributeMappingType, string> = {
  variants: 'variantní parametry',
  filtering_parameters: 'filtry',
  flags: 'product flagy',
};

const ATTRIBUTE_TYPE_PROMPT_LABEL: Record<AttributeMappingType, string> = {
  variants: 'variantní parametry',
  filtering_parameters: 'filtrační parametry',
  flags: 'produktové flagy',
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

const buildAttributeAiPrompt = (params: {
  masterShop: string;
  targetShop: string;
  type: AttributeMappingType;
  masterItems: AttributeMappingItem[];
  targetItems: AttributeMappingItem[];
}) => {
  const { masterShop, targetShop, type, masterItems, targetItems } = params;
  const data = {
    master_shop: masterShop,
    target_shop: targetShop,
    type,
    master_parameters: masterItems.map((item) => ({
      key: item.key,
      label: item.label,
      code: item.code ?? null,
      description: item.description ?? null,
      values: (item.values ?? []).map((value) => ({
        key: value.key,
        label: value.label,
      })),
    })),
    target_parameters: targetItems.map((item) => ({
      key: item.key,
      label: item.label,
      code: item.code ?? null,
      description: item.description ?? null,
      likely_master_language: Boolean(item.likely_master_language),
      values: (item.values ?? []).map((value) => ({
        key: value.key,
        label: value.label,
        likely_master_language: Boolean(value.likely_master_language),
      })),
    })),
  };

  return [
    `Úkol: Najdi shodu pro ${ATTRIBUTE_TYPE_PROMPT_LABEL[type]} mezi master shopem "${masterShop}" a cílovým shopem "${targetShop}".`,
    'Pravidla:',
    '1. Master seznam je zdroj pravdy. Každý master parametr může být namapován na nejvýše jeden cílový parametr.',
    '2. V datech cílových parametrů je pole "likely_master_language". Pokud je true, název parametru je pravděpodobně stále v master jazyce a měl bys jej ignorovat.',
    '3. Hodnoty parametrů mohou mít stejné texty v různých jazycích – proto je neposuzuj podle jazyka, ale podle významu.',
    '4. Pokud parametr v cílovém shopu neexistuje, nastav "target_key": null.',
    '5. Do výstupu nedávej nové názvy ani úpravy textu, pouze páruj existující klíče.',
    '',
    'Data pro analýzu (JSON):',
    JSON.stringify(data, null, 2),
    '',
    'Výsledkem musí být platný JSON ve tvaru:',
    `{
  "type": "${type}",
  "mappings": [
    {
      "master_key": "<klíč master parametru>",
      "target_key": "<klíč cílového parametru nebo null>",
      "reason": "stručné vysvětlení, volitelné",
      "values": [
        {
          "master_key": "<klíč master hodnoty>",
          "target_key": "<klíč cílové hodnoty nebo null>",
          "note": "volitelné vysvětlení"
        }
      ]
    }
  ]
}`,
    'Nevypisuj nic dalšího mimo JSON.',
  ].join('\n');
};

type AttributeValue = AttributeMappingValue;

const matchesSearch = (needle: string, haystack: string | null | undefined): boolean => {
  if (!needle.trim()) {
    return true;
  }
  return (haystack ?? '').toLowerCase().includes(needle.trim().toLowerCase());
};

const typeSupportsValues = (type: AttributeMappingType): boolean =>
  type === 'filtering_parameters' || type === 'variants';

const buildParameterMappingState = (data: AttributeMappingResponse | undefined): Record<string, string | null> => {
  if (!data) {
    return {};
  }

  const state = data.mappings.reduce<Record<string, string | null>>((acc, mapping) => {
    acc[mapping.master_key] = mapping.target_key ?? null;
    return acc;
  }, {});

  data.master.forEach((item) => {
    if (!(item.key in state)) {
      state[item.key] = null;
    }
  });

  return state;
};

const buildValueMappingState = (
  data: AttributeMappingResponse | undefined,
  masterItems: AttributeMappingItem[],
  mappingState: Record<string, string | null>,
  supportsValues: boolean
): Record<string, Record<string, string | null>> => {
  if (!supportsValues) {
    return {};
  }

  const base: Record<string, Record<string, string | null>> = {};
  const masterMap = new Map(masterItems.map((item) => [item.key, item]));

  masterItems.forEach((item) => {
    const values = (item.values ?? []).reduce<Record<string, string | null>>((acc, value) => {
      acc[value.key] = null;
      return acc;
    }, {});
    base[item.key] = values;
  });

  data?.mappings?.forEach((mapping) => {
    const targetKey = mappingState[mapping.master_key] ?? mapping.target_key ?? null;
    if (!targetKey) {
      return;
    }

    const masterItem = masterMap.get(mapping.master_key);
    if (!masterItem || !masterItem.values) {
      return;
    }

    const valueMap = base[mapping.master_key] ?? {};

    mapping.values?.forEach((valueMapping) => {
      if (valueMapping.target_key && Object.prototype.hasOwnProperty.call(valueMap, valueMapping.master_key)) {
        valueMap[valueMapping.master_key] = valueMapping.target_key;
      }
    });

    base[mapping.master_key] = valueMap;
  });

  return base;
};

const serializeParameterState = (state: Record<string, string | null>): string =>
  JSON.stringify(
    Object.entries(state)
      .map(([masterKey, targetKey]) => [masterKey, targetKey ?? null] as const)
      .sort((a, b) => a[0].localeCompare(b[0]))
  );

const serializeValueState = (state: Record<string, Record<string, string | null>>): string => {
  const entries = Object.entries(state).map(([masterKey, values]) => {
    const valueEntries: Array<[string, string | null]> = Object.entries(values).map(([valueKey, targetKey]) => [
      valueKey,
      targetKey ?? null,
    ]);

    valueEntries.sort((a, b) => a[0].localeCompare(b[0]));

    return [masterKey, valueEntries] as [string, Array<[string, string | null]>];
  });

  entries.sort((a, b) => a[0].localeCompare(b[0]));

  return JSON.stringify(entries);
};

type MappingRowProps = {
  item: AttributeMappingItem;
  assignedTarget: AttributeMappingItem | null;
  disabled: boolean;
  supportsValues: boolean;
  onDrop: (masterKey: string, targetKey: string) => void;
  onClear: (masterKey: string) => void;
  onOpenValues: (masterItem: AttributeMappingItem, targetItem: AttributeMappingItem) => void;
};

const MappingRow = ({
  item,
  assignedTarget,
  disabled,
  supportsValues,
  onDrop,
  onClear,
  onOpenValues,
}: MappingRowProps) => {
  const [{ isOver, canDrop }, drop] = useDrop<{ key: string }, void, { isOver: boolean; canDrop: boolean }>(() => ({
    accept: ATTRIBUTE_DND_TYPE,
    canDrop: () => !disabled,
    drop: (dragged) => {
      if (!disabled) {
        onDrop(item.key, dragged.key);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
  }), [item.key, disabled, onDrop]);

  const refCb = useCallback(
    (node: HTMLDivElement | null) => {
      drop(node);
    },
    [drop]
  );

  const hasTarget = Boolean(assignedTarget);

  return (
    <Card
      ref={refCb}
      withBorder
      padding="md"
      radius="md"
      shadow="xs"
      className={clsx('mapping-row', { 'mapping-row--active': isOver && canDrop })}
      style={{
        borderColor: isOver && canDrop ? '#15aabf' : undefined,
        backgroundColor: isOver && canDrop ? 'rgba(21, 170, 191, 0.08)' : undefined,
        opacity: disabled ? 0.6 : 1,
        transition: 'border-color 120ms ease, background-color 120ms ease',
      }}
    >
      <Group justify="space-between" align="flex-start" gap="md">
        <Stack gap={4} style={{ flex: 1 }}>
          <Group gap={6}>
            <Text fw={600}>{item.label}</Text>
            {item.code && (
              <Badge radius="sm" color="gray" variant="light">
                {item.code}
              </Badge>
            )}
          </Group>
          {item.description && (
            <Text size="xs" c="dimmed">
              {item.description}
            </Text>
          )}
        </Stack>
        <Group gap="xs">
          {hasTarget ? (
            <Badge color="teal" radius="sm" variant="filled" leftSection={<IconCircleCheck size={12} />} styles={{ root: { textTransform: 'none' } }}>
              {assignedTarget?.label ?? 'Namapováno'}
            </Badge>
          ) : (
            <Badge color="gray" radius="sm" variant="light" styles={{ root: { textTransform: 'none' } }}>
              Nenamapováno
            </Badge>
          )}
          {assignedTarget?.likely_master_language && (
            <Tooltip label="Tento parametr má stejný název jako v master shopu">
              <Badge color="gray" variant="outline" radius="sm">
                shodné s master
              </Badge>
            </Tooltip>
          )}
          {supportsValues && hasTarget && assignedTarget?.values?.length ? (
            <Tooltip label="Mapovat hodnoty" position="bottom">
              <ActionIcon
                variant="light"
                color="indigo"
                size="sm"
                onClick={() => onOpenValues(item, assignedTarget)}
                aria-label={`Namapovat hodnoty pro ${item.label}`}
              >
                <IconSparkles size={16} />
              </ActionIcon>
            </Tooltip>
          ) : null}
          {hasTarget && (
            <Tooltip label="Odebrat mapování">
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={() => onClear(item.key)}
                aria-label={`Zrušit mapování pro ${item.label}`}
                disabled={disabled}
              >
                <IconX size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
    </Card>
  );
};

type TargetCardProps = {
  item: AttributeMappingItem;
  disabled: boolean;
};

const TargetCard = ({ item, disabled }: TargetCardProps) => {
  const [{ isDragging }, drag] = useDrag<{ key: string }, void, { isDragging: boolean }>(() => ({
    type: ATTRIBUTE_DND_TYPE,
    canDrag: !disabled,
    item: { key: item.key },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }), [item.key, disabled]);

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      drag(node);
    },
    [drag]
  );

  return (
    <Card
      ref={setRef}
      withBorder
      padding="md"
      radius="md"
      shadow="xs"
      style={{ cursor: disabled ? 'not-allowed' : 'grab', opacity: isDragging ? 0.4 : 1, transition: 'opacity 120ms ease' }}
    >
      <Stack gap={4}>
        <Group justify="space-between" align="flex-start">
          <Text fw={600}>{item.label}</Text>
          {item.code && (
            <Badge color="gray" variant="light" radius="sm">
              {item.code}
            </Badge>
          )}
        </Group>
        {item.description && (
          <Text size="xs" c="dimmed">
            {item.description}
          </Text>
        )}
        {item.values && item.values.length > 0 && (
          <Text size="xs" c="dimmed">
            Hodnoty: {item.values.slice(0, 4).map((value) => value.label).join(', ')}
            {item.values.length > 4 ? ` (+${item.values.length - 4})` : ''}
          </Text>
        )}
      </Stack>
    </Card>
  );
};

type ValueModalProps = {
  opened: boolean;
  onClose: () => void;
  masterItem: AttributeMappingItem | null;
  targetItem: AttributeMappingItem | null;
  mapping: Record<string, string | null>;
  onChange: (next: Record<string, string | null>) => void;
  onAiSuggest: (() => void) | null;
  aiLoading: boolean;
  supportsMapping: boolean;
};

const ValueMappingModal = ({
  opened,
  onClose,
  masterItem,
  targetItem,
  mapping,
  onChange,
  onAiSuggest,
  aiLoading,
  supportsMapping,
}: ValueModalProps) => {
  const masterValues = useMemo(() => masterItem?.values ?? [], [masterItem]);
  const targetValues = useMemo(() => targetItem?.values ?? [], [targetItem]);
  const canMap = Boolean(masterItem && targetItem) && supportsMapping;

  const usedTargets = useMemo(
    () => new Set(Object.values(mapping).filter(Boolean) as string[]),
    [mapping]
  );

const filteredTargetValues = useMemo(
  () =>
    targetValues.filter(
      (value) => !usedTargets.has(value.key)
    ),
  [targetValues, usedTargets]
);

  const filteredMasterValues = masterValues;

  const handleDrop = useCallback(
    (masterValueKey: string, targetValueKey: string) => {
      const next = { ...mapping };
      Object.entries(next).forEach(([key, assigned]) => {
        if (assigned === targetValueKey) {
          next[key] = null;
        }
      });
      next[masterValueKey] = targetValueKey;
      onChange(next);
    },
    [mapping, onChange]
  );

  const handleClear = useCallback(
    (masterValueKey: string) => {
      onChange({
        ...mapping,
        [masterValueKey]: null,
      });
    },
    [mapping, onChange]
  );

  return (
    <Modal opened={opened} onClose={onClose} title={`Mapování hodnot – ${masterItem?.label ?? '—'}`} size="xl">
      {!canMap ? (
        <Alert color="gray" radius="md" icon={<IconInfoCircle size={16} />}>Nejprve namapuj cílový parametr.</Alert>
      ) : (
        <DndProvider backend={HTML5Backend}>
          <Group align="flex-start" gap="md" grow wrap="wrap">
            <Stack gap="sm" style={{ flex: 1, minWidth: 280 }}>
              <Text fw={600}>Hodnoty master shopu</Text>
              <Group justify="space-between" align="center">
                <Text size="xs" c="dimmed">
                  Přetažením z pravého seznamu nastavíš hodnoty. Můžeš také použít AI návrh.
                </Text>
                {onAiSuggest && (
                  <Tooltip label="Nechat AI navrhnout mapování hodnot">
                    <Button
                      variant="outline"
                      size="xs"
                      leftSection={<IconSparkles size={14} />}
                      onClick={onAiSuggest}
                      loading={aiLoading}
                    >
                      Předvyplnit AI
                    </Button>
                  </Tooltip>
                )}
              </Group>
              <ScrollArea h={360} offsetScrollbars>
                <Stack gap="sm">
                  {filteredMasterValues.map((value) => (
                    <ValueMappingRow
                      key={value.key}
                      value={value}
                      assignedTarget={mapping[value.key] ? targetValues.find((item) => item.key === mapping[value.key]) ?? null : null}
                      disabled={!canMap}
                      onDrop={handleDrop}
                      onClear={handleClear}
                    />
                  ))}
                </Stack>
              </ScrollArea>
            </Stack>
            <Stack gap="sm" style={{ flex: 1, minWidth: 280 }}>
              <Text fw={600}>Dostupné hodnoty cílového shopu</Text>
              <ScrollArea h={360} offsetScrollbars>
                <Stack gap="sm">
                  {filteredTargetValues.length === 0 ? (
                    <Alert color="gray" radius="md" variant="light">
                      Žádné další hodnoty v cílovém jazyce. Hodnoty shodné s master jazykem skrýváme.
                    </Alert>
                  ) : (
                    filteredTargetValues.map((value) => (
                      <ValueTargetCard key={value.key} value={value} disabled={!canMap} />
                    ))
                  )}
                </Stack>
              </ScrollArea>
            </Stack>
          </Group>
        </DndProvider>
      )}
    </Modal>
  );
};

type ValueRowProps = {
  value: AttributeValue;
  assignedTarget: AttributeValue | null;
  disabled: boolean;
  onDrop: (masterValueKey: string, targetValueKey: string) => void;
  onClear: (masterValueKey: string) => void;
};

const ValueMappingRow = ({ value, assignedTarget, disabled, onDrop, onClear }: ValueRowProps) => {
  const [{ isOver, canDrop }, drop] = useDrop<{ key: string }, void, { isOver: boolean; canDrop: boolean }>(() => ({
    accept: VALUE_DND_TYPE,
    canDrop: () => !disabled,
    drop: (dragged) => {
      if (!disabled) {
        onDrop(value.key, dragged.key);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
  }), [value.key, disabled, onDrop]);

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      drop(node);
    },
    [drop]
  );

  const hasTarget = Boolean(assignedTarget);

  return (
    <Card
      ref={setRef}
      withBorder
      radius="md"
      padding="sm"
      shadow="xs"
      style={{
        borderColor: isOver && canDrop ? '#228be6' : undefined,
        backgroundColor: isOver && canDrop ? 'rgba(34, 139, 230, 0.08)' : undefined,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Group justify="space-between" align="center">
        <Text size="sm" fw={500}>
          {value.label}
        </Text>
        <Group gap="xs">
          {hasTarget ? (
            <Badge color="teal" radius="sm" size="sm" variant="filled">
              {assignedTarget?.label}
            </Badge>
          ) : (
            <Badge color="gray" radius="sm" size="sm" variant="light">
              Bez mapování
            </Badge>
          )}
          {assignedTarget?.likely_master_language && (
            <Tooltip label="Tato hodnota má stejný název jako v master shopu" position="bottom">
              <Badge color="gray" radius="sm" size="sm" variant="outline">
                shodné s master
              </Badge>
            </Tooltip>
          )}
          {hasTarget && (
            <Tooltip label="Odebrat mapování" position="bottom">
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={() => onClear(value.key)}
                aria-label={`Zrušit mapování hodnoty ${value.label}`}
                disabled={disabled}
              >
                <IconX size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
    </Card>
  );
};

type ValueTargetCardProps = {
  value: AttributeValue;
  disabled: boolean;
};

const ValueTargetCard = ({ value, disabled }: ValueTargetCardProps) => {
  const [{ isDragging }, drag] = useDrag<{ key: string }, void, { isDragging: boolean }>(() => ({
    type: VALUE_DND_TYPE,
    canDrag: !disabled,
    item: { key: value.key },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }), [value.key, disabled]);

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      drag(node);
    },
    [drag]
  );

  return (
    <Card
      ref={setRef}
      withBorder
      radius="md"
      padding="sm"
      shadow="xs"
      style={{ cursor: disabled ? 'not-allowed' : 'grab', opacity: isDragging ? 0.4 : 1 }}
    >
      <Text size="sm" fw={500}>
        {value.label}
      </Text>
    </Card>
  );
};

export const AttributeMappingPage = () => {
  const shopsQuery = useShops({ per_page: 100 });
  const shops = useMemo(() => shopsQuery.data?.data ?? [], [shopsQuery.data]);

  const masterShops = useMemo(() => shops.filter((shop) => shop.is_master), [shops]);
  const targetShops = useMemo(() => shops.filter((shop) => !shop.is_master), [shops]);

  const [selectedMasterShopId, setSelectedMasterShopId] = useState<number | null>(null);
  const [selectedTargetShopId, setSelectedTargetShopId] = useState<number | null>(null);
  const [activeType, setActiveType] = useState<AttributeMappingType>('variants');
  const [masterSearch, setMasterSearch] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  const [mappingState, setMappingState] = useState<Record<string, string | null>>({});
  const [valueMappingState, setValueMappingState] = useState<Record<string, Record<string, string | null>>>({});
  const [initialMappingState, setInitialMappingState] = useState<Record<string, string | null>>({});
  const [initialValueState, setInitialValueState] = useState<Record<string, Record<string, string | null>>>({});
  const [valueModal, setValueModal] = useState<{
    opened: boolean;
    masterItem: AttributeMappingItem | null;
    targetItem: AttributeMappingItem | null;
  }>({ opened: false, masterItem: null, targetItem: null });
  const [aiModalOpened, setAiModalOpened] = useState(false);

  useEffect(() => {
    if (!selectedMasterShopId && masterShops.length > 0) {
      setSelectedMasterShopId(masterShops[0].id);
    }
  }, [masterShops, selectedMasterShopId]);

  useEffect(() => {
    if (!selectedTargetShopId) {
      const candidate = targetShops.find((shop) => shop.id !== selectedMasterShopId) ?? targetShops[0];
      if (candidate) {
        setSelectedTargetShopId(candidate.id);
      }
    } else if (selectedTargetShopId === selectedMasterShopId) {
      const candidate = targetShops.find((shop) => shop.id !== selectedMasterShopId);
      setSelectedTargetShopId(candidate?.id ?? null);
    }
  }, [selectedMasterShopId, selectedTargetShopId, targetShops]);

  const attributeQuery = useAttributeMappings({
    masterShopId: selectedMasterShopId,
    targetShopId: selectedTargetShopId,
    type: activeType,
  });

  const saveMutation = useSaveAttributeMappings();
  const aiMutation = useAttributeMappingAiSuggest();
  const valueAiMutation = useAttributeMappingAiSuggest();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mappingData = attributeQuery.data;
  const masterItems = useMemo(() => mappingData?.master ?? [], [mappingData]);
  const targetItems = useMemo(() => mappingData?.target ?? [], [mappingData]);
  const masterMap = useMemo(() => new Map(masterItems.map((item) => [item.key, item])), [masterItems]);
  const targetMap = useMemo(() => new Map(targetItems.map((item) => [item.key, item])), [targetItems]);
  const supportsValues = typeSupportsValues(activeType);

  useEffect(() => {
    if (mappingData) {
      const baseMapping = buildParameterMappingState(mappingData);
      setMappingState(baseMapping);
      setInitialMappingState(baseMapping);

      const baseValueState = buildValueMappingState(mappingData, masterItems, baseMapping, supportsValues);
      setValueMappingState(baseValueState);
      setInitialValueState(baseValueState);
    } else {
      setMappingState({});
      setInitialMappingState({});
      setValueMappingState({});
      setInitialValueState({});
    }
  }, [mappingData, masterItems, supportsValues]);

  const masterOptions = masterShops.map((shop) => ({ label: shop.name, value: String(shop.id) }));
  const targetOptions = targetShops
    .filter((shop) => shop.id !== selectedMasterShopId)
    .map((shop) => ({ label: shop.name, value: String(shop.id) }));

  const usedTargets = useMemo(() => new Set(Object.values(mappingState).filter(Boolean) as string[]), [mappingState]);

  const filteredMasterItems = useMemo(
    () => masterItems.filter((item) => matchesSearch(masterSearch, `${item.label} ${item.code ?? ''}`)),
    [masterItems, masterSearch]
  );

const availableTargetItems = useMemo(
  () =>
    targetItems.filter(
      (item) =>
        !usedTargets.has(item.key) && matchesSearch(targetSearch, `${item.label} ${item.code ?? ''}`)
    ),
  [targetItems, usedTargets, targetSearch]
);

  const mappedCount = useMemo(() => Object.values(mappingState).filter(Boolean).length, [mappingState]);
  const isDirty = useMemo(
    () =>
      serializeParameterState(mappingState) !== serializeParameterState(initialMappingState) ||
      serializeValueState(valueMappingState) !== serializeValueState(initialValueState),
    [mappingState, initialMappingState, valueMappingState, initialValueState]
  );

  const isBusy = attributeQuery.isFetching || saveMutation.isPending || aiMutation.isPending;

  const handleDrop = useCallback(
    (masterKey: string, targetKey: string) => {
      let nextMappingSnapshot: Record<string, string | null> = {};
      setMappingState((current) => {
        const next = { ...current };
        Object.entries(next).forEach(([key, assigned]) => {
          if (assigned === targetKey) {
            next[key] = null;
          }
        });
        next[masterKey] = targetKey;
        nextMappingSnapshot = next;
        return next;
      });

      if (supportsValues) {
        const snapshot = nextMappingSnapshot;
        setValueMappingState((current) => {
          const next = { ...current };

          Object.entries(snapshot).forEach(([key, assigned]) => {
            const masterItem = masterMap.get(key);
            if (!masterItem) {
              return;
            }

            if (!assigned) {
              next[key] = (masterItem.values ?? []).reduce<Record<string, string | null>>((acc, value) => {
                acc[value.key] = null;
                return acc;
              }, {});
              return;
            }

            if (key === masterKey) {
              next[key] = (masterItem.values ?? []).reduce<Record<string, string | null>>((acc, value) => {
                acc[value.key] = null;
                return acc;
              }, {});
            }
          });

          return next;
        });
      }
    },
    [supportsValues, masterMap]
  );

  const handleClear = useCallback(
    (masterKey: string) => {
      setMappingState((current) => ({ ...current, [masterKey]: null }));
      if (supportsValues) {
        const masterItem = masterMap.get(masterKey);
        if (masterItem) {
          setValueMappingState((current) => ({
            ...current,
            [masterKey]: (masterItem.values ?? []).reduce<Record<string, string | null>>((acc, value) => {
              acc[value.key] = null;
              return acc;
            }, {}),
          }));
        }
      }
    },
    [supportsValues, masterMap]
  );

  const handleReset = () => {
    setMappingState(initialMappingState);
    setValueMappingState(initialValueState);
    notifications.show({ message: 'Mapování bylo vráceno do původního stavu.', color: 'gray' });
  };

  const handleSave = () => {
    if (!selectedMasterShopId || !selectedTargetShopId) {
      notifications.show({ message: 'Vyber master a cílový shop.', color: 'red' });
      return;
    }

    const payload = Object.entries(mappingState).map(([masterKey, targetKey]) => {
      const record: AttributeMappingRecord = {
        master_key: masterKey,
        target_key: targetKey ?? null,
      };

      if (supportsValues && targetKey) {
        const valueMap = valueMappingState[masterKey] ?? {};
        const values: AttributeValueMappingRecord[] = Object.entries(valueMap)
          .filter(([, valueTarget]) => valueTarget)
          .map(([valueKey, valueTarget]) => ({ master_key: valueKey, target_key: valueTarget })) as AttributeValueMappingRecord[];

        if (values.length > 0) {
          record.values = values;
        }
      }

      return record;
    });

    saveMutation.mutate(
      {
        master_shop_id: selectedMasterShopId,
        target_shop_id: selectedTargetShopId,
        type: activeType,
        mappings: payload,
      },
      {
        onSuccess: (response) => {
          const baseMapping = buildParameterMappingState(response);
          setMappingState(baseMapping);
          setInitialMappingState(baseMapping);

          const baseValueState = buildValueMappingState(response, masterItems, baseMapping, supportsValues);
          setValueMappingState(baseValueState);
          setInitialValueState(baseValueState);

          notifications.show({ message: 'Mapování bylo uloženo.', color: 'teal' });
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Uložení mapování selhalo.';
          notifications.show({ message, color: 'red' });
        },
      }
    );
  };

  const handleOpenValueModal = (masterItem: AttributeMappingItem, targetItem: AttributeMappingItem) => {
    const current = valueMappingState[masterItem.key] ?? {};
    const normalized = { ...current };

    (masterItem.values ?? []).forEach((value) => {
      if (!Object.prototype.hasOwnProperty.call(normalized, value.key)) {
        normalized[value.key] = null;
      }
    });

    setValueMappingState((state) => ({ ...state, [masterItem.key]: normalized }));
    setValueModal({ opened: true, masterItem, targetItem });
  };

  const handleAiSuggest = () => {
    if (!selectedMasterShopId || !selectedTargetShopId) {
      notifications.show({ message: 'Vyber master a cílový shop.', color: 'red' });
      return;
    }
    setAiModalOpened(true);

    aiMutation.mutate(
      {
        master_shop_id: selectedMasterShopId,
        target_shop_id: selectedTargetShopId,
        type: activeType,
      },
      {
        onSuccess: (response) => {
          const baseResponse: AttributeMappingResponse = mappingData
            ? { ...mappingData, mappings: response.mappings }
            : { master: masterItems, target: targetItems, mappings: response.mappings };
          const nextMapping = buildParameterMappingState(baseResponse);
          const nextValueState = buildValueMappingState(
            baseResponse,
            masterItems,
            nextMapping,
            supportsValues
          );

          setMappingState(nextMapping);
          setValueMappingState(nextValueState);
          notifications.show({
            message: 'AI navrhla mapování. Zkontroluj změny a ulož je.',
            color: 'teal',
          });
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'AI návrh se nepodařilo získat.';
          notifications.show({ message, color: 'red' });
        },
        onSettled: () => setAiModalOpened(false),
      }
    );
  };

  const handleValueAiSuggest = useCallback(() => {
    if (!valueModal.masterItem) {
      notifications.show({ message: 'Vyber nejprve parametr.', color: 'red' });
      return;
    }

    if (!selectedMasterShopId || !selectedTargetShopId) {
      notifications.show({ message: 'Vyber master a cílový shop.', color: 'red' });
      return;
    }

    valueAiMutation.mutate(
      {
        master_shop_id: selectedMasterShopId,
        target_shop_id: selectedTargetShopId,
        type: activeType,
      },
      {
        onSuccess: (response) => {
          const baseResponse: AttributeMappingResponse = mappingData
            ? { ...mappingData, mappings: response.mappings }
            : { master: masterItems, target: targetItems, mappings: response.mappings };

          const nextMapping = buildParameterMappingState(baseResponse);
          const nextValueState = buildValueMappingState(
            baseResponse,
            masterItems,
            nextMapping,
            supportsValues
          );

          setMappingState(nextMapping);
          setValueMappingState(nextValueState);

          const updated = response.mappings.find(
            (mapping) => mapping.master_key === valueModal.masterItem?.key
          );
          if (updated?.target_key) {
            const nextTarget = targetMap.get(updated.target_key) ?? null;
            setValueModal((current) =>
              current.masterItem && current.masterItem.key === valueModal.masterItem?.key
                ? { ...current, targetItem: nextTarget }
                : current
            );
          }

          notifications.show({
            message: 'AI doplnila mapování hodnot. Zkontroluj návrh a ulož změny.',
            color: 'teal',
          });
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'AI návrh se nepodařilo získat.';
          notifications.show({ message, color: 'red' });
        },
      }
    );
  }, [
    valueModal.masterItem,
    selectedMasterShopId,
    selectedTargetShopId,
    activeType,
    valueAiMutation,
    mappingData,
    masterItems,
    targetItems,
    supportsValues,
    targetMap,
  ]);

  const handleCloseValueModal = () => setValueModal({ opened: false, masterItem: null, targetItem: null });

  const masterShopLabel = masterShops.find((shop) => shop.id === selectedMasterShopId)?.name ?? '—';
  const targetShopLabel = targetShops.find((shop) => shop.id === selectedTargetShopId)?.name ?? '—';

  const aiDisabled = !selectedMasterShopId || !selectedTargetShopId || attributeQuery.isLoading;
  const syncOptionsMutation = useSyncAttributeOptions();

  const handleSyncOptions = useCallback(() => {
    if (!selectedTargetShopId) {
      notifications.show({ color: 'red', message: 'Vyber nejprve cílový shop.' });
      return;
    }

    syncOptionsMutation.mutate(
      { shop_id: selectedTargetShopId, types: [activeType] },
      {
        onSuccess: () => {
          notifications.show({
            color: 'teal',
            message: 'Atributy byly načteny ze Shoptetu.',
          });
          attributeQuery.refetch();
        },
        onError: () => {
          notifications.show({ color: 'red', message: 'Stažení atributů selhalo.' });
        },
      }
    );
  }, [selectedTargetShopId, activeType, syncOptionsMutation, attributeQuery]);

  const handleExportForAi = useCallback(() => {
    if (!selectedMasterShopId || !selectedTargetShopId) {
      notifications.show({ color: 'yellow', message: 'Vyber master i cílový shop.' });
      return;
    }

    if (attributeQuery.isLoading || masterItems.length === 0 || targetItems.length === 0) {
      notifications.show({ color: 'yellow', message: 'Parametry ještě nejsou načtené. Zkus to za chvíli.' });
      return;
    }

    const masterName =
      masterShops.find((shop) => shop.id === selectedMasterShopId)?.name ?? `Master #${selectedMasterShopId}`;
    const targetName =
      targetShops.find((shop) => shop.id === selectedTargetShopId)?.name ?? `Shop #${selectedTargetShopId}`;

    const prompt = buildAttributeAiPrompt({
      masterShop: masterName,
      targetShop: targetName,
      type: activeType,
      masterItems,
      targetItems,
    });

    const filename = `ai-${activeType}-mapping-${selectedTargetShopId}.txt`;
    triggerFileDownload(prompt, filename);
    notifications.show({ color: 'teal', message: 'Exportní prompt byl stažen.' });
  }, [
    selectedMasterShopId,
    selectedTargetShopId,
    attributeQuery.isLoading,
    masterItems,
    targetItems,
    masterShops,
    targetShops,
    activeType,
  ]);

  const handleImportAiJsonClick = useCallback(() => {
    if (!selectedMasterShopId || !selectedTargetShopId) {
      notifications.show({ color: 'yellow', message: 'Vyber master i cílový shop.' });
      return;
    }

    fileInputRef.current?.click();
  }, [selectedMasterShopId, selectedTargetShopId]);

  const handleAiJsonFileChange: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { type?: string; mappings?: Array<Record<string, unknown>> } | null;

      if (!parsed || !Array.isArray(parsed.mappings)) {
        throw new Error('Soubor neobsahuje pole "mappings".');
      }

      if (parsed.type && parsed.type !== activeType) {
        notifications.show({
          color: 'yellow',
          message: `Soubor je určený pro typ "${parsed.type}", ale aktuálně řešíš "${activeType}". Pokračuji i tak.`,
        });
      }

      const nextMapping: Record<string, string | null> = { ...mappingState };
      const cloneValueState = () =>
        Object.entries(valueMappingState).reduce<Record<string, Record<string, string | null>>>(
          (acc, [key, values]) => {
            acc[key] = { ...values };
            return acc;
          },
          {}
        );
      const nextValueState: Record<string, Record<string, string | null>> = supportsValues
        ? cloneValueState()
        : {};
      const targetAssignments = new Map<string, string>();

      Object.entries(nextMapping).forEach(([masterKey, assigned]) => {
        if (assigned) {
          targetAssignments.set(assigned, masterKey);
        }
      });

      let applied = 0;
      const warnings: string[] = [];

      parsed.mappings.forEach((entry, index) => {
        const masterKey = typeof entry.master_key === 'string' ? entry.master_key : null;
        if (!masterKey) {
          warnings.push(`Řádek ${index + 1}: chybí master_key.`);
          return;
        }

        if (!masterMap.has(masterKey)) {
          warnings.push(`Řádek ${index + 1}: master parametr "${masterKey}" nebyl nalezen.`);
          return;
        }

        const rawTarget =
          entry.target_key === null
            ? null
            : typeof entry.target_key === 'string'
              ? entry.target_key
              : null;

        if (rawTarget && !targetMap.has(rawTarget)) {
          warnings.push(`Řádek ${index + 1}: cílový parametr "${rawTarget}" neexistuje.`);
          return;
        }

        if (rawTarget) {
          const currentOwner = targetAssignments.get(rawTarget);
          if (currentOwner && currentOwner !== masterKey) {
            nextMapping[currentOwner] = null;
          }
          targetAssignments.set(rawTarget, masterKey);
        }

        nextMapping[masterKey] = rawTarget ?? null;

        if (supportsValues) {
          if (rawTarget && Array.isArray(entry.values)) {
            const masterItem = masterMap.get(masterKey);
            const targetItem = targetMap.get(rawTarget);

            if (masterItem && targetItem) {
              const allowedMasterValues = new Set((masterItem.values ?? []).map((value) => value.key));
              const allowedTargetValues = new Set((targetItem.values ?? []).map((value) => value.key));
              const usedTargets = new Set<string>();

              const baseValues =
                nextValueState[masterKey] ??
                (masterItem.values ?? []).reduce<Record<string, string | null>>((acc, value) => {
                  acc[value.key] = acc[value.key] ?? null;
                  return acc;
                }, {});

              entry.values.forEach((valueEntry, valueIndex) => {
                const masterValueKey =
                  typeof valueEntry.master_key === 'string' ? valueEntry.master_key : null;
                const targetValueKey =
                  typeof valueEntry.target_key === 'string' ? valueEntry.target_key : null;

                if (!masterValueKey || !allowedMasterValues.has(masterValueKey)) {
                  warnings.push(
                    `Řádek ${index + 1}: hodnota #${valueIndex + 1} má neplatný master_value_key.`
                  );
                  return;
                }

                if (!targetValueKey || !allowedTargetValues.has(targetValueKey)) {
                  warnings.push(
                    `Řádek ${index + 1}: hodnota "${masterValueKey}" má neplatný target_value_key.`
                  );
                  return;
                }

                if (usedTargets.has(targetValueKey)) {
                  warnings.push(
                    `Řádek ${index + 1}: hodnota "${masterValueKey}" používá cílovou hodnotu "${targetValueKey}" vícekrát.`
                  );
                  return;
                }

                baseValues[masterValueKey] = targetValueKey;
                usedTargets.add(targetValueKey);
              });

              nextValueState[masterKey] = baseValues;
            }
          } else if (!rawTarget) {
            delete nextValueState[masterKey];
          }
        }

        applied += 1;
      });

      if (applied === 0) {
        notifications.show({ color: 'yellow', message: 'Soubor neobsahoval platné položky.' });
      } else {
        setMappingState(nextMapping);
        if (supportsValues) {
          setValueMappingState(nextValueState);
        }
        setValueModal((current) => {
          if (!current.masterItem) {
            return current;
          }
          const nextTargetKey = nextMapping[current.masterItem.key] ?? null;
          return {
            ...current,
            targetItem: nextTargetKey ? targetMap.get(nextTargetKey) ?? null : null,
          };
        });

        notifications.show({
          color: 'teal',
          message: `Importováno ${applied} mapování.${warnings.length ? ' Některé záznamy byly přeskočeny.' : ''}`,
        });
        if (warnings.length > 0) {
          console.warn('AI mapping import warnings', warnings);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Soubor se nepodařilo načíst.';
      notifications.show({ color: 'red', message });
    } finally {
      event.target.value = '';
    }
  };

  return (
    <SectionPageShell
      section="categories.attributes"
      title="Filtry, varianty, parametry"
      description="Namapuj parametry mezi master shopem a cílovými shopy a sjednoť překladové workflow."
      actions={
        <Group>
          <Tooltip label={`Stáhne dostupné ${ATTRIBUTE_TYPE_DOWNLOAD_LABEL[activeType]} z cílového shopu`}>
            <Button
              variant="light"
              leftSection={<IconDownload size={16} />}
              onClick={handleSyncOptions}
              disabled={!selectedTargetShopId || attributeQuery.isLoading}
              loading={syncOptionsMutation.isPending}
            >
              {`Stáhnout ${ATTRIBUTE_TYPE_DOWNLOAD_LABEL[activeType]}`}
            </Button>
          </Tooltip>
          <Tooltip label="Vygeneruje text s parametry pro AI">
            <Button
              variant="subtle"
              leftSection={<IconDownload size={16} />}
              onClick={handleExportForAi}
              disabled={!selectedMasterShopId || !selectedTargetShopId || attributeQuery.isLoading}
            >
              Export pro AI
            </Button>
          </Tooltip>
          <Tooltip label="Načti mapování z JSON souboru">
            <Button
              variant="subtle"
              leftSection={<IconUpload size={16} />}
              onClick={handleImportAiJsonClick}
              disabled={!selectedMasterShopId || !selectedTargetShopId}
            >
              Import AI JSON
            </Button>
          </Tooltip>
          <Tooltip label="Zahodit neuložené změny">
            <Button
              variant="light"
              leftSection={<IconRefresh size={16} />}
              onClick={handleReset}
              disabled={!isDirty || isBusy}
            >
              Obnovit
            </Button>
          </Tooltip>
          <Tooltip label="Nechat AI navrhnout mapování">
            <Button
              variant="outline"
              leftSection={<IconSparkles size={16} />}
              onClick={handleAiSuggest}
              disabled={aiDisabled}
              loading={aiMutation.isPending}
            >
              Předvyplnit AI
            </Button>
          </Tooltip>
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={handleSave}
            color="teal"
            disabled={!isDirty || isBusy}
            loading={saveMutation.isPending}
          >
            Uložit mapování
          </Button>
        </Group>
      }
    >
      <Stack gap="lg">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,text/plain,.json,.txt"
          style={{ display: 'none' }}
          onChange={handleAiJsonFileChange}
        />
        <Group align="flex-end" gap="lg" wrap="wrap">
          <Select
            label="Master shop"
            placeholder={masterOptions.length === 0 ? 'Žádný master shop' : 'Vyber master shop'}
            data={masterOptions}
            value={selectedMasterShopId ? String(selectedMasterShopId) : null}
            onChange={(value) => setSelectedMasterShopId(value ? Number(value) : null)}
            searchable
            nothingFoundMessage="Nenalezeno"
            disabled={shopsQuery.isLoading}
            maw={320}
          />
          <Select
            label="Cílový shop"
            placeholder={targetOptions.length === 0 ? 'Není dostupný cílový shop' : 'Vyber cílový shop'}
            data={targetOptions}
            value={selectedTargetShopId ? String(selectedTargetShopId) : null}
            onChange={(value) => setSelectedTargetShopId(value ? Number(value) : null)}
            searchable
            nothingFoundMessage="Nenalezeno"
            disabled={shopsQuery.isLoading || !selectedMasterShopId}
            maw={320}
          />
          <Stack gap={4} style={{ minWidth: 240 }}>
            <Text size="sm" fw={600}>
              Typ entity
            </Text>
            <SegmentedControl
              data={ATTRIBUTE_TYPES}
              value={activeType}
              onChange={(value) => setActiveType(value as AttributeMappingType)}
              disabled={!selectedMasterShopId || !selectedTargetShopId || attributeQuery.isLoading}
              fullWidth
            />
          </Stack>
        </Group>

        <Alert color="blue" icon={<IconInfoCircle size={18} />} radius="md" variant="light">
          {ATTRIBUTE_TYPE_HELP[activeType]} Master: <strong>{masterShopLabel}</strong>, cílový shop: <strong>{targetShopLabel}</strong>.
        </Alert>

        {!selectedMasterShopId || !selectedTargetShopId ? (
          <Alert color="gray" radius="md" icon={<IconInfoCircle size={18} />}>
            Vyber master a cílový shop, abychom načetli dostupné parametry.
          </Alert>
        ) : attributeQuery.isLoading ? (
          <Group justify="center" mt="xl">
            <Loader />
          </Group>
        ) : attributeQuery.isError ? (
          <Alert color="red" radius="md" icon={<IconInfoCircle size={18} />}>
            {attributeQuery.error instanceof Error
              ? attributeQuery.error.message
              : 'Nepodařilo se načíst parametry ze Shoptetu.'}
          </Alert>
        ) : (
          <DndProvider backend={HTML5Backend}>
            <Group align="flex-start" gap="md" grow wrap="wrap">
              <Stack gap="sm" style={{ flex: 1, minWidth: 320 }}>
                <Card withBorder padding="md" radius="md" shadow="xs">
                  <Group justify="space-between" align="flex-end" mb="md" gap="md">
                    <Stack gap={2}>
                      <Text fw={600}>Master parametry</Text>
                      <Text size="xs" c="dimmed">
                        Namapováno {mappedCount} z {masterItems.length}
                      </Text>
                    </Stack>
                    <TextInput
                      placeholder="Hledat master parametr"
                      leftSection={<IconSearch size={14} />}
                      value={masterSearch}
                      onChange={(event) => setMasterSearch(event.currentTarget.value)}
                      size="sm"
                      maw={240}
                    />
                  </Group>
                  <ScrollArea h={520} offsetScrollbars>
                    <Stack gap="sm">
                      {filteredMasterItems.length === 0 ? (
                        <Alert color="gray" variant="light" radius="md">
                          Žádný master parametr neodpovídá filtru.
                        </Alert>
                      ) : (
                        filteredMasterItems.map((item) => {
                          const targetKey = mappingState[item.key] ?? null;
                          const assignedTarget = targetKey ? targetMap.get(targetKey) ?? null : null;

                          return (
                            <MappingRow
                              key={item.key}
                              item={item}
                              assignedTarget={assignedTarget}
                              disabled={isBusy}
                              supportsValues={supportsValues}
                              onDrop={handleDrop}
                              onClear={handleClear}
                              onOpenValues={handleOpenValueModal}
                            />
                          );
                        })
                      )}
                    </Stack>
                  </ScrollArea>
                </Card>
              </Stack>

              <Stack gap="sm" style={{ flex: 1, minWidth: 320 }}>
                <Card withBorder padding="md" radius="md" shadow="xs">
                  <Group justify="space-between" align="flex-end" mb="md" gap="md">
                    <Stack gap={2}>
                      <Text fw={600}>Dostupné cílové parametry</Text>
                      <Text size="xs" c="dimmed">
                        {availableTargetItems.length === 0
                          ? 'Žádné další parametry se nenacházejí (pravděpodobně zůstaly jen ty se stejným názvem jako master).'
                          : `Filtrované parametry: ${availableTargetItems.length}`}
                      </Text>
                    </Stack>
                    <TextInput
                      placeholder="Hledat cílový parametr"
                      leftSection={<IconSearch size={14} />}
                      value={targetSearch}
                      onChange={(event) => setTargetSearch(event.currentTarget.value)}
                      size="sm"
                      maw={240}
                    />
                  </Group>
                  <ScrollArea h={520} offsetScrollbars>
                    <Stack gap="sm">
                      {availableTargetItems.length === 0 ? (
                        <Alert color="gray" variant="light" radius="md">
                          Nenašli jsme žádné další parametry, které by se lišily od master jazyka.
                        </Alert>
                      ) : (
                        availableTargetItems.map((item) => (
                          <TargetCard key={item.key} item={item} disabled={isBusy} />
                        ))
                      )}
                    </Stack>
                  </ScrollArea>
                </Card>
              </Stack>
            </Group>
          </DndProvider>
        )}
      </Stack>

      <ValueMappingModal
        opened={valueModal.opened}
        onClose={handleCloseValueModal}
        masterItem={valueModal.masterItem}
        targetItem={valueModal.targetItem}
        mapping={valueModal.masterItem ? valueMappingState[valueModal.masterItem.key] ?? {} : {}}
        onChange={(next) => {
          if (!valueModal.masterItem) {
            return;
          }
          setValueMappingState((current) => ({ ...current, [valueModal.masterItem!.key]: next }));
        }}
        onAiSuggest={
          supportsValues && valueModal.masterItem ? handleValueAiSuggest : null
        }
        aiLoading={valueAiMutation.isPending}
        supportsMapping={supportsValues}
      />

      <Modal opened={aiModalOpened && aiMutation.isPending} onClose={() => setAiModalOpened(false)} title="AI návrh mapování" size="lg">
        {aiMutation.isPending ? (
          <Group justify="center" gap="md">
            <Loader />
            <Text size="sm">AI připravuje návrh mapování…</Text>
          </Group>
        ) : (
          <Stack gap="md">
            <Text>
              AI navrhne mapování parametrů a hodnot mezi vybranými shopy. Po dokončení můžeš návrh upravit a uložit.
            </Text>
            <Button onClick={() => setAiModalOpened(false)}>Zavřít</Button>
          </Stack>
        )}
      </Modal>
    </SectionPageShell>
  );
};
