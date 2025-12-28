import {
  Button,
  Card,
  Group,
  MultiSelect,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useAnalyticsSettings, useUpdateAnalyticsSettings } from '../hooks/useAnalyticsSettings';

const RANGE_OPTIONS = [
  { value: 'last_7_days', label: 'Posledních 7 dní' },
  { value: 'last_30_days', label: 'Posledních 30 dní' },
  { value: 'month_to_date', label: 'Tento měsíc' },
  { value: 'quarter_to_date', label: 'Toto čtvrtletí' },
  { value: 'year_to_date', label: 'Tento rok' },
];

const METRIC_OPTIONS = [
  { value: 'orders_total', label: 'Počet objednávek' },
  { value: 'orders_total_value', label: 'Obrat celkem' },
  { value: 'orders_average_value', label: 'Průměrná hodnota objednávky' },
  { value: 'products_sold_total', label: 'Prodáno kusů' },
  { value: 'customers_total', label: 'Počet zákazníků' },
  { value: 'customers_repeat_ratio', label: 'Podíl vracejících se zákazníků' },
  { value: 'new_customers_total', label: 'Noví zákazníci' },
  { value: 'customers_orders_average', label: 'Objednávky na zákazníka' },
  { value: 'orders_gross_margin', label: 'Hrubá marže' },
];

type FormValues = {
  default_range: string;
  compare_enabled: boolean;
  visible_metrics: string[];
  rfm_recency: string;
  rfm_frequency: string;
  rfm_monetary: string;
};

const serializeThresholds = (values: number[]): string => values.join(', ');

const parseThresholds = (value: string): number[] =>
  value
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry >= 0);

export const AnalyticsSettingsPage = () => {
  const { data, isLoading } = useAnalyticsSettings();
  const updateMutation = useUpdateAnalyticsSettings();

  const form = useForm<FormValues>({
    defaultValues: {
      default_range: 'last_30_days',
      compare_enabled: true,
      visible_metrics: ['orders_total', 'orders_total_value', 'customers_total'],
      rfm_recency: '30, 60, 90',
      rfm_frequency: '1, 3, 5',
      rfm_monetary: '1000, 3000, 7000',
    },
  });

  useEffect(() => {
    if (!data) {
      return;
    }

    form.reset({
      default_range: data.default_range,
      compare_enabled: data.compare_enabled,
      visible_metrics: data.visible_metrics ?? [],
      rfm_recency: serializeThresholds(data.rfm_thresholds.recency ?? []),
      rfm_frequency: serializeThresholds(data.rfm_thresholds.frequency ?? []),
      rfm_monetary: serializeThresholds(data.rfm_thresholds.monetary ?? []),
    });
  }, [data, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await updateMutation.mutateAsync({
        default_range: values.default_range,
        compare_enabled: values.compare_enabled,
        visible_metrics: values.visible_metrics,
        rfm_thresholds: {
          recency: parseThresholds(values.rfm_recency),
          frequency: parseThresholds(values.rfm_frequency),
          monetary: parseThresholds(values.rfm_monetary),
        },
      });
      notifications.show({ message: 'Analytická nastavení uložena.', color: 'green' });
    } catch {
      notifications.show({ message: 'Uložení nastavení selhalo.', color: 'red' });
    }
  });

  return (
    <Stack gap="lg" component="form" onSubmit={onSubmit}>
      <Title order={3}>Analytika</Title>
      <Card withBorder>
        <Stack gap="md">
          <div>
            <Title order={4}>Základní přehled</Title>
            <Text c="gray.6" size="sm">
              Vyber výchozí časové období a metriky, které se zobrazí na dashboardu analytiky. Tato konfigurace
              se použije pro nové uživatele nebo při resetu filtrů.
            </Text>
          </div>
          <Select
            label="Výchozí období"
            placeholder="Vyber období"
            data={RANGE_OPTIONS}
            value={form.watch('default_range')}
            onChange={(value) => value && form.setValue('default_range', value)}
            comboboxProps={{ withinPortal: true }}
            disabled={isLoading}
          />
          <Switch
            label="Automaticky porovnat s předchozím obdobím"
            checked={form.watch('compare_enabled')}
            onChange={(event) => form.setValue('compare_enabled', event.currentTarget.checked)}
            disabled={isLoading}
          />
          <MultiSelect
            label="Výchozí metriky"
            placeholder="Vyber metriky"
            data={METRIC_OPTIONS}
            value={form.watch('visible_metrics')}
            onChange={(value) => form.setValue('visible_metrics', value)}
            searchable
            clearable
            disabled={isLoading}
            comboboxProps={{ withinPortal: true }}
          />
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="md">
          <div>
            <Title order={4}>RFM segmentace</Title>
            <Text c="gray.6" size="sm">
              Hranice pro recency (dny), frequency (počet objednávek) a monetary (CZK) se použijí při výpočtu RFM
              segmentů v analytice zákazníků.
            </Text>
          </div>
          <TextInput
            label="Recency (dny)"
            description="Zadej hodnoty oddělené čárkou, např. 30, 60, 90"
            value={form.watch('rfm_recency')}
            onChange={(event) => form.setValue('rfm_recency', event.currentTarget.value)}
            disabled={isLoading}
          />
          <TextInput
            label="Frequency (počet objednávek)"
            description="Hodnoty oddělené čárkou, např. 1, 3, 5"
            value={form.watch('rfm_frequency')}
            onChange={(event) => form.setValue('rfm_frequency', event.currentTarget.value)}
            disabled={isLoading}
          />
          <TextInput
            label="Monetary (CZK)"
            description="Hodnoty oddělené čárkou, např. 1000, 3000, 7000"
            value={form.watch('rfm_monetary')}
            onChange={(event) => form.setValue('rfm_monetary', event.currentTarget.value)}
            disabled={isLoading}
          />
        </Stack>
      </Card>

      <Group justify="flex-end">
        <Button type="submit" loading={updateMutation.isPending} disabled={isLoading}>
          Uložit nastavení
        </Button>
      </Group>
    </Stack>
  );
};