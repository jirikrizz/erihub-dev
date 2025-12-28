import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  ColorInput,
  Divider,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  TagsInput,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconEdit, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listCustomerTagRules, createCustomerTagRule, updateCustomerTagRule, deleteCustomerTagRule, type CustomerTagRule, type CustomerTagRuleFieldDefinition } from '../../../api/customerTagRules';
import { fetchCustomerSettings, updateCustomerSettings, type CustomerSettings } from '../../../api/settings';

const DEFAULT_LABELS = {
  registered: 'Zaregistrován',
  guest: 'Neregistrován',
  company: 'Firma',
  vip: 'VIP',
} as const;

const DEFAULT_ALIASES = {
  registered: ['registered', 'registrovaný', 'registrována', 'registrováni', 'customer', 'customer-final', 'cumpărător final', 'zákazník'],
  guest: ['guest', 'neregistrovaný', 'bez registrace', 'návštěvník'],
  company: ['firma', 'company', 'business', 'b2b'],
} as const;

type RuleConditionFormValue = {
  field: string;
  operator: string;
  value: string | number | string[] | null;
  type: 'number' | 'string' | 'datetime' | 'boolean';
};

type RuleFormValues = {
  tag_key: string;
  label: string;
  color: string;
  priority: number;
  is_active: boolean;
  match_type: 'all' | 'any';
  set_vip: boolean;
  description: string;
  conditions: RuleConditionFormValue[];
};

const operatorLabel = (operator: string): string => {
  switch (operator) {
    case '>=':
      return '≥';
    case '<=':
      return '≤';
    case '!=':
      return '≠';
    case '>':
      return '>';
    case '<':
      return '<';
    case '=':
    case '==':
      return '=';
    case 'in':
      return 'je v seznamu';
    case 'not_in':
      return 'není v seznamu';
    case 'is_null':
      return 'není vyplněno';
    case 'is_not_null':
      return 'je vyplněno';
    case 'is_true':
      return 'je ANO';
    case 'is_false':
      return 'je NE';
    case 'before':
      return 'před';
    case 'after':
      return 'po';
    case 'on_or_before':
      return 'nejpozději';
    case 'on_or_after':
      return 'nejdříve';
    default:
      return operator;
  }
};

const requiresConditionValue = (operator: string, type: string): boolean => {
  if (type === 'boolean') {
    return false;
  }

  return !['is_null', 'is_not_null', 'is_true', 'is_false'].includes(operator);
};

const isMultiValueOperator = (operator: string, type: string): boolean =>
  type === 'string' && (operator === 'in' || operator === 'not_in');

const getDefaultRuleValues = (fields: CustomerTagRuleFieldDefinition[]): RuleFormValues => {
  const fallbackField = fields[0];
  const defaultCondition: RuleConditionFormValue[] = [];

  if (fallbackField) {
    defaultCondition.push({
      field: fallbackField.value,
      operator: fallbackField.operators[0] ?? '=',
      value: null,
      type: fallbackField.type,
    });
  }

  return {
    tag_key: '',
    label: '',
    color: '#868e96',
    priority: 0,
    is_active: true,
    match_type: 'all',
    set_vip: false,
    description: '',
    conditions: defaultCondition,
  };
};

const summarizeRuleConditions = (
  rule: CustomerTagRule,
  fieldDefinitions: CustomerTagRuleFieldDefinition[]
): string => {
  if (!rule.conditions || rule.conditions.length === 0) {
    return 'Bez podmínek';
  }

  const fieldMap = new Map(fieldDefinitions.map((field) => [field.value, field]));
  const parts = rule.conditions.map((condition) => {
    const definition = fieldMap.get(condition.field);
    const label = definition?.label ?? condition.field;
    const operatorText = operatorLabel(condition.operator);

    if (!requiresConditionValue(condition.operator, condition.type ?? definition?.type ?? 'string')) {
      return `${label} ${operatorText}`;
    }

    let valueText: string;
    if (Array.isArray(condition.value)) {
      valueText = condition.value.join(', ');
    } else if (condition.value === null || condition.value === undefined || condition.value === '') {
      valueText = '—';
    } else if (typeof condition.value === 'number') {
      valueText = condition.value.toString();
    } else {
      valueText = String(condition.value);
    }

    return `${label} ${operatorText} ${valueText}`;
  });

  const joiner = rule.match_type === 'all' ? ' a zároveň ' : ' nebo ';

  return parts.join(joiner);
};

const convertRuleToFormValues = (
  rule: CustomerTagRule,
  fields: CustomerTagRuleFieldDefinition[]
): RuleFormValues => {
  const defaults = getDefaultRuleValues(fields);
  const fieldMap = new Map(fields.map((field) => [field.value, field]));

  const conditions: RuleConditionFormValue[] = (rule.conditions ?? []).map((condition) => {
    const definition = fieldMap.get(condition.field);
    const type = (condition.type ?? definition?.type ?? 'string') as RuleConditionFormValue['type'];

    let value: RuleConditionFormValue['value'] = (condition.value ?? null) as RuleConditionFormValue['value'];

    if (isMultiValueOperator(condition.operator, type)) {
      if (Array.isArray(value)) {
        value = value.map((entry) => String(entry));
      } else if (typeof value === 'string' && value !== '') {
        value = value
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry !== '');
      } else {
        value = [];
      }
    } else if (type === 'number') {
      if (typeof value === 'number') {
        // ok
      } else if (typeof value === 'string' && value !== '') {
        const numeric = Number(value);
        value = Number.isNaN(numeric) ? null : numeric;
      } else {
        value = null;
      }
    } else if (value !== null && value !== undefined && typeof value !== 'string') {
      value = String(value);
    }

    return {
      field: condition.field,
      operator: condition.operator,
      value,
      type,
    };
  });

  return {
    ...defaults,
    tag_key: rule.tag_key,
    label: rule.label,
    color: rule.color ?? defaults.color,
    priority: rule.priority ?? defaults.priority,
    is_active: rule.is_active,
    match_type: rule.match_type === 'any' ? 'any' : 'all',
    set_vip: Boolean(rule.set_vip),
    description: rule.description ?? '',
    conditions: conditions.length > 0 ? conditions : defaults.conditions,
  };
};

const transformFormValuesToPayload = (
  values: RuleFormValues,
  fields: CustomerTagRuleFieldDefinition[]
): Partial<CustomerTagRule> => {
  const fieldMap = new Map(fields.map((field) => [field.value, field]));

  const conditions = values.conditions
    .map((condition) => {
      if (!condition.field || !condition.operator) {
        return null;
      }

      const definition = fieldMap.get(condition.field);
      const type = (condition.type ?? definition?.type ?? 'string') as RuleConditionFormValue['type'];

      if (!requiresConditionValue(condition.operator, type)) {
        return {
          field: condition.field,
          operator: condition.operator,
          value: null,
          type,
        };
      }

      let value: unknown = condition.value;

      if (isMultiValueOperator(condition.operator, type)) {
        const arrayValue = Array.isArray(value)
          ? value
          : typeof value === 'string'
            ? value
                .split(',')
                .map((entry) => entry.trim())
                .filter((entry) => entry !== '')
            : [];

        if (arrayValue.length === 0) {
          return null;
        }

        value = arrayValue;
      } else if (type === 'number') {
        if (typeof value === 'number') {
          // ok
      } else if (typeof value === 'string' && value.trim() !== '') {
          const numeric = Number(value);
          if (Number.isNaN(numeric)) {
            return null;
          }
          value = numeric;
        } else {
          return null;
        }
      } else if (type === 'datetime') {
        if (typeof value !== 'string' || value.trim() === '') {
          return null;
        }

        const date = new Date(value);
        value = Number.isNaN(date.getTime()) ? value : date.toISOString();
      } else {
        if (typeof value !== 'string' || value.trim() === '') {
          return null;
        }

        value = value.trim();
      }

      return {
        field: condition.field,
        operator: condition.operator,
        value,
        type,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return {
    tag_key: values.tag_key.trim().toLowerCase(),
    label: values.label.trim(),
    color: values.color && values.color.trim() !== '' ? values.color : '#868e96',
    priority: values.priority ?? 0,
    is_active: values.is_active,
    match_type: values.match_type,
    set_vip: values.set_vip,
    description: values.description.trim() === '' ? null : values.description.trim(),
    conditions,
  };
};

const sanitizeAliasList = (value: readonly string[] | undefined): string[] =>
  (value ?? []).map((entry) => entry.trim()).filter((entry) => entry !== '');

const normalizeSettings = (value?: CustomerSettings | null): CustomerSettings => ({
  auto_create_guest: value?.auto_create_guest ?? true,
  auto_register_guest: value?.auto_register_guest ?? false,
  group_labels: {
    registered: value?.group_labels?.registered ?? DEFAULT_LABELS.registered,
    guest: value?.group_labels?.guest ?? DEFAULT_LABELS.guest,
    company: value?.group_labels?.company ?? DEFAULT_LABELS.company,
    vip: value?.group_labels?.vip ?? DEFAULT_LABELS.vip,
  },
  group_aliases: {
    registered: sanitizeAliasList(value?.group_aliases?.registered ?? DEFAULT_ALIASES.registered),
    guest: sanitizeAliasList(value?.group_aliases?.guest ?? DEFAULT_ALIASES.guest),
    company: sanitizeAliasList(value?.group_aliases?.company ?? DEFAULT_ALIASES.company),
  },
});

export const CustomerSettingsPage = () => {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['settings', 'customers'],
    queryFn: fetchCustomerSettings,
  });

  const [settings, setSettings] = useState<CustomerSettings>(() => normalizeSettings());

  useEffect(() => {
    if (settingsQuery.data) {
      setSettings(normalizeSettings(settingsQuery.data));
    }
  }, [settingsQuery.data]);

  const mutation = useMutation({
    mutationFn: (payload: CustomerSettings) => updateCustomerSettings(payload),
    onSuccess: (data) => {
      const normalized = normalizeSettings(data);
      queryClient.setQueryData(['settings', 'customers'], normalized);
      setSettings(normalized);
      notifications.show({ message: 'Nastavení zákazníků bylo uloženo.', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Uložení nastavení selhalo. Zkus to prosím znovu.', color: 'red' });
    },
  });

  const tagRulesQuery = useQuery({
    queryKey: ['settings', 'customers', 'tag-rules'],
    queryFn: listCustomerTagRules,
  });

  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CustomerTagRule | null>(null);

  const ruleForm = useForm<RuleFormValues>({
    initialValues: getDefaultRuleValues([]),
    validate: {
      tag_key: (value) => {
        const trimmed = value.trim();
        if (trimmed === '') {
          return 'Vyplň klíč štítku';
        }

        if (!/^[a-z0-9-]+$/.test(trimmed)) {
          return 'Použij jen malá písmena, čísla a pomlčky';
        }

        return null;
      },
      label: (value) => (value.trim() === '' ? 'Vyplň název' : null),
    },
  });

  const tagRuleFields = useMemo(
    () => tagRulesQuery.data?.meta.fields ?? [],
    [tagRulesQuery.data?.meta.fields]
  );
  const tagRules = useMemo(
    () => tagRulesQuery.data?.data ?? [],
    [tagRulesQuery.data?.data]
  );

  const fieldOptions = useMemo(
    () => tagRuleFields.map((field) => ({ value: field.value, label: field.label })),
    [tagRuleFields]
  );

  const getOperatorOptions = useCallback(
    (field: string) => {
      const definition = tagRuleFields.find((entry) => entry.value === field);
      if (!definition) {
        return [];
      }

      return definition.operators.map((operator) => ({
        value: operator,
        label: operatorLabel(operator),
      }));
    },
    [tagRuleFields]
  );

  const closeRuleModal = useCallback(() => {
    setRuleModalOpen(false);
    setEditingRule(null);
    const defaults = getDefaultRuleValues(tagRuleFields);
    ruleForm.setValues(defaults);
    ruleForm.resetDirty(defaults);
    ruleForm.clearErrors();
  }, [ruleForm, tagRuleFields]);

  const createRuleMutation = useMutation({
    mutationFn: createCustomerTagRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'customers', 'tag-rules'] });
      notifications.show({ message: 'Pravidlo bylo uloženo.', color: 'green' });
      closeRuleModal();
    },
    onError: () => {
      notifications.show({ message: 'Uložení pravidla selhalo. Zkus to prosím znovu.', color: 'red' });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CustomerTagRule> }) =>
      updateCustomerTagRule(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'customers', 'tag-rules'] });
      notifications.show({ message: 'Pravidlo bylo aktualizováno.', color: 'green' });
      closeRuleModal();
    },
    onError: () => {
      notifications.show({ message: 'Aktualizace pravidla selhala. Zkus to prosím znovu.', color: 'red' });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => deleteCustomerTagRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'customers', 'tag-rules'] });
      notifications.show({ message: 'Pravidlo bylo odstraněno.', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Odstranění pravidla selhalo. Zkus to prosím znovu.', color: 'red' });
    },
  });

  const savingRule = createRuleMutation.isPending || updateRuleMutation.isPending;

  const addCondition = useCallback(() => {
    const fallbackField = tagRuleFields[0];
    if (!fallbackField) {
      return;
    }

    ruleForm.insertListItem('conditions', {
      field: fallbackField.value,
      operator: fallbackField.operators[0] ?? '=',
      value: null,
      type: fallbackField.type,
    });
    ruleForm.clearFieldError('conditions');
  }, [ruleForm, tagRuleFields]);

  const handleConditionFieldChange = useCallback(
    (index: number, value: string | null) => {
      if (!value) {
        const remaining = ruleForm.values.conditions.length - 1;
        ruleForm.removeListItem('conditions', index);
        if (remaining > 0) {
          ruleForm.clearFieldError('conditions');
        }
        return;
      }

      const definition = tagRuleFields.find((field) => field.value === value);
      if (!definition) {
        return;
      }

      ruleForm.setFieldValue(`conditions.${index}`, {
        field: value,
        operator: definition.operators[0] ?? '=',
        value: null,
        type: definition.type,
      });
      ruleForm.clearFieldError('conditions');
    },
    [ruleForm, tagRuleFields]
  );

  const handleConditionOperatorChange = useCallback(
    (index: number, operatorValue: string | null) => {
      if (!operatorValue) {
        return;
      }

      const condition = ruleForm.values.conditions[index];
      if (!condition) {
        return;
      }

      ruleForm.setFieldValue(`conditions.${index}.operator`, operatorValue);

      if (!requiresConditionValue(operatorValue, condition.type)) {
        ruleForm.setFieldValue(`conditions.${index}.value`, null);
      } else if (isMultiValueOperator(operatorValue, condition.type) && !Array.isArray(condition.value)) {
        ruleForm.setFieldValue(`conditions.${index}.value`, []);
      }
      ruleForm.clearFieldError('conditions');
    },
    [ruleForm]
  );

  const renderConditionValueInput = useCallback(
    (condition: RuleConditionFormValue, index: number) => {
      if (!requiresConditionValue(condition.operator, condition.type)) {
        return null;
      }

      if (condition.type === 'number') {
        return (
          <NumberInput
            label="Hodnota"
            value={typeof condition.value === 'number' ? condition.value : undefined}
            onChange={(value) =>
              ruleForm.setFieldValue(
                `conditions.${index}.value`,
                value === '' || value === null ? null : Number(value)
              )
            }
            min={0}
            placeholder="Např. 5"
            disabled={savingRule}
            style={{ width: '100%' }}
          />
        );
      }

      if (condition.type === 'datetime') {
        return (
          <TextInput
            label="Hodnota"
            type="datetime-local"
            value={typeof condition.value === 'string' ? condition.value : ''}
            onChange={(event) =>
              ruleForm.setFieldValue(`conditions.${index}.value`, event.currentTarget.value || null)
            }
            style={{ width: '100%' }}
            disabled={savingRule}
          />
        );
      }

      if (isMultiValueOperator(condition.operator, condition.type)) {
        return (
          <TagsInput
            label="Hodnoty"
            value={Array.isArray(condition.value) ? condition.value : []}
            onChange={(value) => ruleForm.setFieldValue(`conditions.${index}.value`, value)}
            placeholder="Přidej hodnotu a potvrď Enterem"
            disabled={savingRule}
            style={{ width: '100%' }}
          />
        );
      }

      return (
        <TextInput
          label="Hodnota"
          value={typeof condition.value === 'string' ? condition.value : ''}
          onChange={(event) =>
            ruleForm.setFieldValue(`conditions.${index}.value`, event.currentTarget.value ?? '')
          }
          placeholder="Zadej hodnotu"
          disabled={savingRule}
          style={{ width: '100%' }}
        />
      );
    },
    [ruleForm, savingRule]
  );

  const handleRuleSubmit = useCallback(
    (values: RuleFormValues) => {
      const payload = transformFormValuesToPayload(values, tagRuleFields);

      if (!payload.tag_key || payload.tag_key.trim() === '' || !payload.label || payload.label.trim() === '') {
        notifications.show({ message: 'Vyplň klíč i název pravidla.', color: 'red' });
        return;
      }

      ruleForm.clearFieldError('conditions');
      if (!payload.conditions || payload.conditions.length === 0) {
        ruleForm.setFieldError('conditions', 'Přidej alespoň jednu platnou podmínku');
        return;
      }

      if (editingRule) {
        updateRuleMutation.mutate({ id: editingRule.id, payload });
      } else {
        createRuleMutation.mutate(payload);
      }
    },
    [createRuleMutation, editingRule, ruleForm, tagRuleFields, updateRuleMutation]
  );

  const handleAddRule = useCallback(() => {
    ruleForm.setValues(getDefaultRuleValues(tagRuleFields));
    ruleForm.resetDirty(getDefaultRuleValues(tagRuleFields));
    setEditingRule(null);
    setRuleModalOpen(true);
  }, [ruleForm, tagRuleFields]);

  const handleEditRule = useCallback(
    (rule: CustomerTagRule) => {
      const values = convertRuleToFormValues(rule, tagRuleFields);
      ruleForm.setValues(values);
      ruleForm.resetDirty(values);
      setEditingRule(rule);
      setRuleModalOpen(true);
    },
    [ruleForm, tagRuleFields]
  );

  const handleDeleteRule = useCallback(
    (rule: CustomerTagRule) => {
      if (!window.confirm(`Opravdu chceš odstranit pravidlo "${rule.label}"?`)) {
        return;
      }

      deleteRuleMutation.mutate(rule.id);
    },
    [deleteRuleMutation]
  );

  const loading = settingsQuery.isLoading || settingsQuery.isRefetching;
  const saving = mutation.isPending;
  const initialSettings = useMemo(() => normalizeSettings(settingsQuery.data), [settingsQuery.data]);
  const isDirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(initialSettings),
    [settings, initialSettings]
  );

  const handleSubmit = () => {
    mutation.mutate(settings);
  };

  const updateLabel = (key: keyof CustomerSettings['group_labels']) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    setSettings((prev) => ({
      ...prev,
      group_labels: {
        ...prev.group_labels,
        [key]: value,
      },
    }));
  };

  const updateAliases = (key: keyof CustomerSettings['group_aliases']) => (value: string[]) => {
    const sanitized = sanitizeAliasList(value);
    setSettings((prev) => ({
      ...prev,
      group_aliases: {
        ...prev.group_aliases,
        [key]: sanitized,
      },
    }));
  };

  return (
    <>
      <Stack gap="lg">
        <Title order={3}>Zákazníci</Title>
        <Text c="gray.6">
          Nastav, jak se mají z objednávek vytvářet nebo registrovat zákazníci. Změny se použijí na nové objednávky;
          existující záznamy můžeš kdykoliv dorovnat přes automatizace nebo ruční backfill.
        </Text>

        <Card withBorder padding="lg">
          {loading ? (
            <Group justify="center" py="xl">
              <Loader />
            </Group>
          ) : (
            <Stack gap="lg">
              <Stack gap="md">
                <Switch
                  label="Vytvářet neregistrované zákazníky z objednávek"
                  description="Pokud není k dispozici Shoptet zákazník, založí se nový záznam z údajů v objednávce."
                  checked={settings.auto_create_guest}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setSettings((prev) => ({
                      ...prev,
                      auto_create_guest: checked,
                      auto_register_guest: checked ? prev.auto_register_guest : false,
                    }));
                  }}
                />
                <Switch
                  label="Registrovat neregistrované zákazníky"
                  description="K neregistrovaným zákazníkům se automaticky vytvoří zákaznický účet (Customer account)."
                  checked={settings.auto_register_guest}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setSettings((prev) => ({
                      ...prev,
                      auto_register_guest: checked,
                    }));
                  }}
                  disabled={!settings.auto_create_guest}
                />
              </Stack>

              <Divider label="Štítky zákazníků" labelPosition="left" />
              <Text c="gray.6">
                Uprav texty a synonyma, které používáme pro označení registrovaných, neregistrovaných a firemních
                zákazníků. Tyto hodnoty se projeví v přehledech i v detailu zákazníka.
              </Text>

              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <TextInput
                  label="Štítek pro registrované"
                  value={settings.group_labels.registered}
                  onChange={updateLabel('registered')}
                />
                <TextInput
                  label="Štítek pro neregistrované"
                  value={settings.group_labels.guest}
                  onChange={updateLabel('guest')}
                />
                <TextInput
                  label="Štítek pro firmy"
                  value={settings.group_labels.company}
                  onChange={updateLabel('company')}
                />
                <TextInput
                  label="Štítek pro VIP"
                  value={settings.group_labels.vip}
                  onChange={updateLabel('vip')}
                />
              </SimpleGrid>

              <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                <TagsInput
                  label="Synonyma pro registrované"
                  description="Výrazy z importu, které automaticky přiřadíme jako registrované zákazníky."
                  value={settings.group_aliases.registered}
                  onChange={updateAliases('registered')}
                  placeholder="Zadej výraz a potvrď Enterem"
                />
                <TagsInput
                  label="Synonyma pro neregistrované"
                  value={settings.group_aliases.guest}
                  onChange={updateAliases('guest')}
                  placeholder="Zadej výraz a potvrď Enterem"
                />
                <TagsInput
                  label="Synonyma pro firmy"
                  value={settings.group_aliases.company}
                  onChange={updateAliases('company')}
                  placeholder="Zadej výraz a potvrď Enterem"
                />
              </SimpleGrid>

              <Group justify="flex-end">
                <Button
                  onClick={handleSubmit}
                  disabled={!isDirty || saving}
                  loading={saving}
                  variant="filled"
                >
                  Uložit změny
                </Button>
              </Group>
            </Stack>
          )}
        </Card>

        <Card withBorder padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Title order={4}>Automatické štítky</Title>
                <Text c="gray.6" size="sm">
                  Vytvoř pravidla, která podle aktivity zákazníků přiřadí štítky, barvy a VIP status automaticky.
                </Text>
              </Stack>
              <Group gap="xs">
                <ActionIcon
                  variant="subtle"
                  onClick={() => tagRulesQuery.refetch()}
                  loading={tagRulesQuery.isFetching}
                  title="Obnovit pravidla"
                  aria-label="Obnovit pravidla"
                >
                  <IconRefresh size={16} />
                </ActionIcon>
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={handleAddRule}
                  disabled={tagRulesQuery.isLoading || tagRuleFields.length === 0}
                >
                  Nové pravidlo
                </Button>
              </Group>
            </Group>

            {tagRulesQuery.isLoading ? (
              <Group justify="center" py="xl">
                <Loader />
              </Group>
            ) : tagRules.length === 0 ? (
              <Card withBorder padding="md" radius="md">
                <Text size="sm" c="gray.6">
                  Zatím nemáš žádná pravidla. Přidej první a systém začne automaticky přiřazovat štítky podle podmínek.
                </Text>
              </Card>
            ) : (
              <Table highlightOnHover withColumnBorders>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Pravidlo</Table.Th>
                    <Table.Th>Klíč</Table.Th>
                    <Table.Th>Priorita</Table.Th>
                    <Table.Th>Stav</Table.Th>
                    <Table.Th>Podmínky</Table.Th>
                    <Table.Th style={{ width: 96 }}>Akce</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {tagRules.map((rule) => (
                    <Table.Tr key={rule.id}>
                      <Table.Td>
                        <Stack gap={4}>
                          <Group gap={6}>
                            <Badge color={rule.color ?? 'gray'}>{rule.label}</Badge>
                            {rule.set_vip && (
                              <Badge color="yellow" variant="light" size="xs">
                                VIP
                              </Badge>
                            )}
                          </Group>
                          {rule.description && (
                            <Text size="xs" c="gray.6">
                              {rule.description}
                            </Text>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {rule.tag_key}
                        </Text>
                      </Table.Td>
                      <Table.Td>{rule.priority ?? 0}</Table.Td>
                      <Table.Td>
                        <Badge color={rule.is_active ? 'teal' : 'gray'} variant={rule.is_active ? 'light' : 'outline'} size="xs">
                          {rule.is_active ? 'Aktivní' : 'Vypnuto'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="gray.7">
                          {summarizeRuleConditions(rule, tagRuleFields)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" justify="flex-end">
                          <ActionIcon
                            variant="subtle"
                            color="blue"
                            onClick={() => handleEditRule(rule)}
                            aria-label={`Upravit pravidlo ${rule.label}`}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => handleDeleteRule(rule)}
                            loading={deleteRuleMutation.isPending && deleteRuleMutation.variables === rule.id}
                            aria-label={`Smazat pravidlo ${rule.label}`}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </Card>
      </Stack>

      <Modal
        opened={ruleModalOpen}
        onClose={closeRuleModal}
        title={editingRule ? 'Upravit pravidlo' : 'Nové pravidlo'}
        size="80vw"
        radius="md"
        overlayProps={{ opacity: 0.35, blur: 4 }}
      >
        <form onSubmit={ruleForm.onSubmit(handleRuleSubmit)}>
          <Stack gap="lg">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <TextInput
                label="Klíč štítku"
                description="Používá se pro filtrování a API. Povolena jsou pouze písmena, čísla a pomlčky."
                {...ruleForm.getInputProps('tag_key')}
                withAsterisk
              />
              <TextInput
                label="Název štítku"
                {...ruleForm.getInputProps('label')}
                withAsterisk
              />
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              <Stack gap={4}>
                <ColorInput
                  label="Barva"
                  {...ruleForm.getInputProps('color')}
                  format="hex"
                  swatches={['#868e96', '#228be6', '#20c997', '#fab005', '#fa5252', '#7950f2']}
                />
                <Badge
                  radius="sm"
                  variant="filled"
                  style={{
                    backgroundColor: ruleForm.values.color ?? '#868e96',
                    color: '#fff',
                    alignSelf: 'flex-start',
                  }}
                >
                  Náhled štítku
                </Badge>
              </Stack>
              <NumberInput
                label="Priorita"
                description="Vyšší číslo znamená vyšší prioritu při vyhodnocení."
                {...ruleForm.getInputProps('priority')}
              />
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Vyhodnocení
                </Text>
                <SegmentedControl
                  value={ruleForm.values.match_type}
                  onChange={(value) => ruleForm.setFieldValue('match_type', (value as 'all' | 'any') ?? 'all')}
                  data={[
                    { value: 'all', label: 'Všechny podmínky' },
                    { value: 'any', label: 'Stačí jedna' },
                  ]}
                  fullWidth
                  radius="md"
                />
              </Stack>
            </SimpleGrid>
            <Group>
              <Checkbox label="Pravidlo je aktivní" {...ruleForm.getInputProps('is_active', { type: 'checkbox' })} />
              <Checkbox
                label="Při splnění označit zákazníka jako VIP"
                {...ruleForm.getInputProps('set_vip', { type: 'checkbox' })}
              />
            </Group>
            <Textarea
              label="Poznámka"
              description="Vysvětlení pravidla pro ostatní kolegy."
              autosize
              minRows={2}
              {...ruleForm.getInputProps('description')}
            />
            <Divider label="Podmínky" labelPosition="left" />
            {ruleForm.errors.conditions && (
              <Text size="xs" c="red.5">
                {ruleForm.errors.conditions}
              </Text>
            )}
            <Stack gap="sm">
              {ruleForm.values.conditions.length === 0 && (
                <Text size="sm" c="gray.6">
                  Přidej alespoň jednu podmínku, podle které se bude štítek aplikovat.
                </Text>
              )}
              {ruleForm.values.conditions.map((condition, index) => {
                const definition = tagRuleFields.find((field) => field.value === condition.field);
                const valueInput = renderConditionValueInput(condition, index);
                const requiresValue = valueInput !== null;

                return (
                  <Paper key={`${condition.field}-${index}`} withBorder radius="md" p="md">
                    <Stack gap="xs">
                      <SimpleGrid cols={{ base: 1, md: requiresValue ? 3 : 2 }} spacing="sm">
                        <Select
                          label="Pole"
                          data={fieldOptions}
                          value={condition.field}
                          onChange={(value) => handleConditionFieldChange(index, value)}
                          searchable
                          nothingFoundMessage="Nenalezeno"
                        />
                        <Select
                          label="Operátor"
                          data={getOperatorOptions(condition.field)}
                          value={condition.operator}
                          onChange={(value) => handleConditionOperatorChange(index, value)}
                          searchable
                          nothingFoundMessage="Nenalezeno"
                        />
                        {valueInput}
                      </SimpleGrid>
                      <Group justify="space-between" align="center">
                        <Text size="xs" c="gray.6" style={{ minHeight: 18 }}>
                          {definition?.description ?? 'Vyber pole a nastav odpovídající operátor.'}
                        </Text>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => ruleForm.removeListItem('conditions', index)}
                          disabled={savingRule}
                          aria-label="Odstranit podmínku"
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Stack>
                  </Paper>
                );
              })}
              <Button
                leftSection={<IconPlus size={16} />}
                variant="light"
                onClick={addCondition}
                disabled={savingRule || tagRuleFields.length === 0}
              >
                Přidat podmínku
              </Button>
            </Stack>
            <Group justify="flex-end">
              <Button variant="default" onClick={closeRuleModal} disabled={savingRule}>
                Zrušit
              </Button>
              <Button type="submit" loading={savingRule}>
                {editingRule ? 'Uložit změny' : 'Vytvořit pravidlo'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
};
