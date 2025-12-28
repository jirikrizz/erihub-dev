import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  Select,
  NumberInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconCircleFilled, IconCloudDownload, IconEdit, IconRefresh, IconTrash, IconWorld } from '@tabler/icons-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { Shop, WebhookJob } from '../../../api/shops';
import type { WooCommerceShop } from '../../../api/woocommerce';
import {
  useCreateShop,
  useDeleteShop,
  useDownloadWebhookJob,
  useSnapshotExecutions,
  useRefreshShopToken,
  useRequestCustomerSnapshot,
  useRequestOrderSnapshot,
  useRequestProductSnapshot,
  useShops,
  useUpdateShop,
  useWebhookJobs,
  useJobFinishedWebhookStatus,
  useRegisterJobFinishedWebhook,
} from '../hooks/useShops';
import {
  useCreateWooCommerceShop,
  useDeleteWooCommerceShop,
  useSyncWooCommerceOrders,
  useUpdateWooCommerceShop,
  useWooCommerceShops,
} from '../../woocommerce/hooks/useWooCommerceShops';

type FormValues = {
  name: string;
  domain: string;
  default_locale?: string;
  timezone?: string;
  api_mode?: string;
  private_api_token: string;
  is_master?: boolean;
  locale?: string;
  currency_code?: string;
  default_vat_rate?: number | '' | null;
};

type WooFormValues = {
  name: string;
  base_url: string;
  currency_code: string;
  customer_link_shop_id: string | null;
  consumer_key: string;
  consumer_secret: string;
  api_version?: string;
};

const DOWNLOADABLE_STATUSES: WebhookJob['status'][] = ['requested', 'waiting_result', 'download_failed', 'downloaded'];

export const ShopsPage = () => {
  const { data } = useShops();
  const wooCommerceShops = useWooCommerceShops();
  const refreshToken = useRefreshShopToken();
  const requestProductSnapshot = useRequestProductSnapshot();
  const requestOrderSnapshot = useRequestOrderSnapshot();
  const requestCustomerSnapshot = useRequestCustomerSnapshot();
  const createWooShop = useCreateWooCommerceShop();
  const updateWooShop = useUpdateWooCommerceShop();
  const deleteWooShopMutation = useDeleteWooCommerceShop();
  const syncWooOrders = useSyncWooCommerceOrders();
  const [shopModalOpened, { open: openShopModal, close: closeShopModal }] = useDisclosure(false);
  const [wooModalOpened, { open: openWooModal, close: closeWooModal }] = useDisclosure(false);
  const [activeTab, setActiveTab] = useState<'shoptet' | 'woocommerce'>('shoptet');
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
  const [editingShop, setEditingShop] = useState<Shop | null>(null);
  const [editingWooShop, setEditingWooShop] = useState<WooCommerceShop | null>(null);
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);
  const [deletingShopId, setDeletingShopId] = useState<number | null>(null);
  const [deletingWooShopId, setDeletingWooShopId] = useState<number | null>(null);
  const [syncingWooShopId, setSyncingWooShopId] = useState<number | null>(null);
  const [orderSnapshotOpened, { open: openOrderSnapshotModal, close: closeOrderSnapshotModal }] = useDisclosure(false);
  const [orderSnapshotShopId, setOrderSnapshotShopId] = useState<number | null>(null);
  const [orderSnapshotFrom, setOrderSnapshotFrom] = useState('');
  const [orderSnapshotTo, setOrderSnapshotTo] = useState('');
  const [logTab, setLogTab] = useState<'pipelines' | 'webhooks'>('pipelines');
  const localeOptions = [
    { value: 'cs_CZ', label: 'Čeština (cs_CZ)' },
    { value: 'sk_SK', label: 'Slovenčina (sk_SK)' },
    { value: 'hu_HU', label: 'Maďarština (hu_HU)' },
    { value: 'ro_RO', label: 'Rumunština (ro_RO)' },
    { value: 'de_DE', label: 'Němčina (de_DE)' },
    { value: 'hr_HR', label: 'Chorvatština (hr_HR)' },
    { value: 'en_GB', label: 'Angličtina (en_GB)' },
  ];
  const currencyOptions = [
    { value: 'CZK', label: 'CZK' },
    { value: 'EUR', label: 'EUR' },
    { value: 'HUF', label: 'HUF' },
    { value: 'RON', label: 'RON' },
    { value: 'HRK', label: 'HRK' },
    { value: 'USD', label: 'USD' },
  ];

  const createShop = useCreateShop();
  const updateShop = useUpdateShop();
  const deleteShopMutation = useDeleteShop();
  const downloadJob = useDownloadWebhookJob();
  const webhookJobs = useWebhookJobs(selectedShopId);
  const snapshotExecutions = useSnapshotExecutions(selectedShopId);

  const form = useForm<FormValues>({
    defaultValues: {
      name: '',
      domain: '',
      api_mode: 'premium',
      private_api_token: '',
      is_master: false,
      locale: 'cs_CZ',
      currency_code: 'CZK',
      default_vat_rate: null,
    },
  });

  const wooForm = useForm<WooFormValues>({
    defaultValues: {
      name: '',
      base_url: '',
      currency_code: 'CZK',
      customer_link_shop_id: null,
      consumer_key: '',
      consumer_secret: '',
      api_version: 'wc/v3',
    },
  });

  const shoptetShopOptions = (data?.data ?? []).map((shop) => ({
    value: String(shop.id),
    label: shop.name ?? shop.domain ?? `Shop ${shop.id}`,
  }));

  const wooShops = wooCommerceShops.data?.data ?? [];

  const resolveDefaultVatValue = (settings: Shop['settings']) => {
    if (!settings) {
      return null;
    }
    const candidate = (settings as Record<string, unknown>)['default_vat_rate'];
    if (typeof candidate === 'number') {
      return candidate;
    }
    if (typeof candidate === 'string') {
      const parsed = Number(candidate);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const normalizeVatRate = (value: FormValues['default_vat_rate']) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = typeof value === 'number' ? value : Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) {
      return '—';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString('cs-CZ');
  };

  const resetForm = () => {
    form.reset({
      name: '',
      domain: '',
      api_mode: 'premium',
      private_api_token: '',
      is_master: false,
      locale: 'cs_CZ',
      currency_code: 'CZK',
      default_vat_rate: null,
    });
  };

  const resetWooForm = () => {
    wooForm.reset({
      name: '',
      base_url: '',
      currency_code: 'CZK',
      customer_link_shop_id: null,
      consumer_key: '',
      consumer_secret: '',
      api_version: 'wc/v3',
    });
  };

  const openCreateModal = () => {
    setEditingShop(null);
    resetForm();
    openShopModal();
  };

  const openEditModal = (shop: Shop) => {
    setEditingShop(shop);
    form.reset({
      name: shop.name ?? '',
      domain: shop.domain ?? '',
      api_mode: shop.api_mode ?? 'premium',
      private_api_token: '',
      is_master: shop.is_master ?? false,
      locale: shop.locale ?? shop.default_locale ?? 'cs_CZ',
      currency_code: shop.currency_code ?? 'CZK',
      default_vat_rate: resolveDefaultVatValue(shop.settings ?? null),
    });
    openShopModal();
  };

  const closeModal = () => {
    closeShopModal();
    setEditingShop(null);
    resetForm();
  };

  const openCreateWooShopModal = () => {
    setEditingWooShop(null);
    resetWooForm();
    openWooModal();
  };

  const openEditWooShopModal = (shop: WooCommerceShop) => {
    setEditingWooShop(shop);
    wooForm.reset({
      name: shop.name ?? '',
      base_url: shop.woocommerce?.base_url ?? `https://${shop.domain}`,
      currency_code: shop.currency_code ?? 'CZK',
      customer_link_shop_id: shop.customer_link_shop_id ? String(shop.customer_link_shop_id) : null,
      consumer_key: '',
      consumer_secret: '',
      api_version: shop.woocommerce?.api_version ?? 'wc/v3',
    });
    openWooModal();
  };

  const closeWooShopModal = () => {
    closeWooModal();
    setEditingWooShop(null);
    resetWooForm();
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const { default_vat_rate, ...rest } = values;
      const vatValue = normalizeVatRate(default_vat_rate);
      const baseSettings =
        editingShop?.settings && typeof editingShop.settings === 'object'
          ? { ...(editingShop.settings as Record<string, unknown>) }
          : {};

      if (vatValue === null) {
        delete baseSettings.default_vat_rate;
      } else {
        baseSettings.default_vat_rate = vatValue;
      }

      const payload: Record<string, unknown> = {
        ...rest,
        settings: Object.keys(baseSettings).length > 0 ? baseSettings : null,
      };

      if (editingShop) {
        if (!payload.private_api_token) {
          delete payload.private_api_token;
        }
        await updateShop.mutateAsync({ id: editingShop.id, payload });
        notifications.show({ message: 'Shop upraven', color: 'green' });
      } else {
        await createShop.mutateAsync(payload);
        notifications.show({ message: 'Shop uložen', color: 'green' });
      }

      closeModal();
    } catch {
      notifications.show({ message: 'Uložení shopu selhalo', color: 'red' });
    }
  };

  const onWooSubmit = async (values: WooFormValues) => {
    const payload: Record<string, unknown> = {
      name: values.name.trim(),
      base_url: values.base_url.trim(),
      currency_code: values.currency_code.toUpperCase(),
    };

    if (values.customer_link_shop_id) {
      payload.customer_link_shop_id = Number(values.customer_link_shop_id);
    }

    if (values.api_version && values.api_version.trim() !== '') {
      payload.api_version = values.api_version.trim();
    }

    try {
      if (editingWooShop) {
        if (values.consumer_key.trim() !== '') {
          payload.consumer_key = values.consumer_key.trim();
        }
        if (values.consumer_secret.trim() !== '') {
          payload.consumer_secret = values.consumer_secret.trim();
        }

        await updateWooShop.mutateAsync({ id: editingWooShop.id, payload });
        notifications.show({ message: 'WooCommerce shop upraven', color: 'green' });
      } else {
        payload.consumer_key = values.consumer_key.trim();
        payload.consumer_secret = values.consumer_secret.trim();

        await createWooShop.mutateAsync(payload);
        notifications.show({ message: 'WooCommerce shop přidán', color: 'green' });
      }

      closeWooShopModal();
    } catch {
      notifications.show({ message: 'Uložení WooCommerce shopu selhalo', color: 'red' });
    }
  };

  const handleDeleteShop = async (shop: Shop) => {
    const confirmed = window.confirm(`Opravdu chceš smazat shop "${shop.name}"?`);
    if (!confirmed) {
      return;
    }

    try {
      setDeletingShopId(shop.id);
      await deleteShopMutation.mutateAsync(shop.id);
      notifications.show({ message: 'Shop odstraněn', color: 'green' });
      if (editingShop?.id === shop.id) {
        closeModal();
      }
    } catch {
      notifications.show({ message: 'Smazání shopu selhalo', color: 'red' });
    } finally {
      setDeletingShopId(null);
    }
  };

  const handleDeleteWooShop = async (shop: WooCommerceShop) => {
    const confirmed = window.confirm(`Opravdu chceš smazat WooCommerce shop "${shop.name}"?`);
    if (!confirmed) {
      return;
    }

    try {
      setDeletingWooShopId(shop.id);
      await deleteWooShopMutation.mutateAsync(shop.id);
      notifications.show({ message: 'WooCommerce shop odstraněn', color: 'green' });
      if (editingWooShop?.id === shop.id) {
        closeWooShopModal();
      }
    } catch {
      notifications.show({ message: 'Smazání WooCommerce shopu selhalo', color: 'red' });
    } finally {
      setDeletingWooShopId(null);
    }
  };

  const handleSyncWooShop = async (shop: WooCommerceShop) => {
    try {
      setSyncingWooShopId(shop.id);
      const response = await syncWooOrders.mutateAsync({ id: shop.id, payload: {} });
      notifications.show({
        message: response?.message ?? 'Synchronizace WooCommerce objednávek dokončena.',
        color: 'green',
      });
    } catch {
      notifications.show({ message: 'Synchronizace WooCommerce objednávek selhala.', color: 'red' });
    } finally {
      setSyncingWooShopId(null);
    }
  };

  const resetOrderSnapshotForm = () => {
    setOrderSnapshotFrom('');
    setOrderSnapshotTo('');
  };

  const openOrderSnapshot = (shopId: number) => {
    setOrderSnapshotShopId(shopId);
    resetOrderSnapshotForm();
    openOrderSnapshotModal();
  };

  const closeOrderSnapshot = () => {
    closeOrderSnapshotModal();
    setOrderSnapshotShopId(null);
    resetOrderSnapshotForm();
  };

  const formatToShoptetDateTime = (value: string) => {
    if (!value) {
      return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const iso = date.toISOString();
    return `${iso.substring(0, 19)}+0000`;
  };

  const handleSnapshot = async (type: 'products' | 'customers', shopId: number) => {
    try {
      let response: { job_id: string; status: string; endpoint: string };
      if (type === 'products') {
        response = await requestProductSnapshot.mutateAsync({ shopId });
      } else {
        response = await requestCustomerSnapshot.mutateAsync({ shopId });
      }

      notifications.show({
        message: `Snapshot (${type}) zahájen – Job ${response.job_id}`,
        color: 'blue',
      });
    } catch {
      notifications.show({
        message: 'Snapshot se nepodařilo vyžádat',
        color: 'red',
      });
    }
  };

  const submitOrderSnapshot = async () => {
    if (!orderSnapshotShopId) {
      return;
    }

    try {
      const payload: Record<string, unknown> = {};
      const fromValue = formatToShoptetDateTime(orderSnapshotFrom);
      const toValue = formatToShoptetDateTime(orderSnapshotTo);

      if (fromValue) {
        payload.creationTimeFrom = fromValue;
      }
      if (toValue) {
        payload.creationTimeTo = toValue;
      }

      const response = await requestOrderSnapshot.mutateAsync({ shopId: orderSnapshotShopId, payload });
      notifications.show({
        message: `Snapshot (orders) zahájen – Job ${response.job_id}`,
        color: 'blue',
      });
      closeOrderSnapshot();
    } catch {
      notifications.show({
        message: 'Snapshot objednávek se nepodařilo vyžádat',
        color: 'red',
      });
    }
  };

  const handleDownloadJob = async (jobId: string) => {
    if (!selectedShopId) {
      return;
    }

    try {
      setDownloadingJobId(jobId);
      const response = await downloadJob.mutateAsync({ shopId: selectedShopId, jobId });
      notifications.show({ message: response?.message ?? 'Stahování bylo spuštěno', color: 'green' });
    } catch {
      notifications.show({ message: 'Stažení snapshotu selhalo', color: 'red' });
    } finally {
      setDownloadingJobId(null);
    }
  };

  const openWebhookModal = (shopId: number) => {
    setSelectedShopId(shopId);
    setLogTab('pipelines');
  };

  const closeWebhookModal = () => {
    setSelectedShopId(null);
    setLogTab('pipelines');
  };

  const isSaving = editingShop ? updateShop.isPending : createShop.isPending;
  const wooIsSaving = editingWooShop ? updateWooShop.isPending : createWooShop.isPending;

  return (
    <Stack>
      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab(value as 'shoptet' | 'woocommerce')}
      >
        <Tabs.List>
          <Tabs.Tab value="shoptet">Shoptet</Tabs.Tab>
          <Tabs.Tab value="woocommerce">WooCommerce</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="shoptet" pt="md">
          <Stack>
            <Group justify="space-between">
              <Title order={2}>Shoptet propojení</Title>
              <Button onClick={openCreateModal}>Přidat shop</Button>
            </Group>

            <Card withBorder>
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Název</Table.Th>
                    <Table.Th>Doména</Table.Th>
                    <Table.Th>API mód</Table.Th>
                    <Table.Th>Jazyk</Table.Th>
                    <Table.Th>Měna</Table.Th>
                    <Table.Th>Master</Table.Th>
                    <Table.Th>Webhook</Table.Th>
                    <Table.Th>Akce</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data?.data.map((shop) => (
                    <ShopRow
                      key={shop.id}
                      shop={shop}
                      onRefreshToken={() => refreshToken.mutate(shop.id)}
                      refreshLoading={refreshToken.isPending}
                      onSnapshotProducts={() => handleSnapshot('products', shop.id)}
                      snapshotProductsLoading={requestProductSnapshot.isPending}
                      onSnapshotOrders={() => openOrderSnapshot(shop.id)}
                      onSnapshotCustomers={() => handleSnapshot('customers', shop.id)}
                      snapshotCustomersLoading={requestCustomerSnapshot.isPending}
                      onOpenWebhookModal={() => openWebhookModal(shop.id)}
                      onEdit={() => openEditModal(shop)}
                      onDelete={() => handleDeleteShop(shop)}
                      deleteLoading={deleteShopMutation.isPending && deletingShopId === shop.id}
                    />
                  ))}
                </Table.Tbody>
              </Table>
            </Card>

            <Modal
              opened={shopModalOpened}
              onClose={closeModal}
              title={editingShop ? 'Upravit Shoptet shop' : 'Přidat Shoptet shop'}
              size="lg"
            >
              <Text size="sm" c="dimmed" mb="md">
                Doména je název e-shopu bez protokolu (např. <strong>krasnevune.cz</strong>). Privátní API token zjistíš v administraci Shoptetu v sekci <em>Propojení → Private API</em>.
              </Text>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <Stack>
                  <Controller
                    name="name"
                    control={form.control}
                    rules={{ required: 'Zadej název' }}
                    render={({ field, fieldState }) => (
                      <TextInput label="Název" error={fieldState.error?.message} {...field} />
                    )}
                  />
                  <Controller
                    name="domain"
                    control={form.control}
                    rules={{ required: 'Zadej doménu' }}
                    render={({ field, fieldState }) => (
                      <TextInput label="Doména" placeholder="krasnevune.cz" error={fieldState.error?.message} {...field} />
                    )}
                  />
                  <Controller
                    name="api_mode"
                    control={form.control}
                    render={({ field }) => (
                      <TextInput label="Typ API" component="select" {...field}>
                        <option value="premium">Premium</option>
                        <option value="private">Private</option>
                        <option value="partner">Partner</option>
                      </TextInput>
                    )}
                  />
                  <Controller
                    name="locale"
                    control={form.control}
                    render={({ field }) => (
                      <Select
                        label="Jazyk e-shopu"
                        data={localeOptions}
                        {...field}
                      />
                    )}
                  />
                  <Controller
                    name="currency_code"
                    control={form.control}
                    render={({ field }) => (
                      <Select label="Měna" data={currencyOptions} {...field} />
                    )}
                  />
                  <Controller
                    name="default_vat_rate"
                    control={form.control}
                    render={({ field }) => (
                      <NumberInput
                        label="Výchozí DPH (%)"
                        description="Použije se jako výchozí VAT pro všechny varianty při překladu."
                        min={0}
                        max={100}
                        decimalScale={2}
                        allowNegative={false}
                        value={field.value ?? ''}
                        onChange={(value) => field.onChange(value === '' ? null : value)}
                      />
                    )}
                  />
                  <Controller
                    name="private_api_token"
                    control={form.control}
                    rules={editingShop ? undefined : { required: 'Zadej private API token' }}
                    render={({ field, fieldState }) => (
                      <TextInput
                        label="Private API token"
                        description={editingShop ? 'Vyplň jen pokud chceš token změnit' : '32 znaků z Shoptet administrace'}
                        error={fieldState.error?.message}
                        {...field}
                      />
                    )}
                  />
                  <Controller
                    name="is_master"
                    control={form.control}
                    render={({ field }) => (
                      <Switch
                        label="Nastavit jako master shop (hlavní zdroj dat)"
                        description="Master shop slouží jako hlavní zdroj překladu a referenčních dat."
                        checked={!!field.value}
                        onChange={(event) => field.onChange(event.currentTarget.checked)}
                      />
                    )}
                  />
                  <Group justify="space-between">
                    {editingShop && (
                      <Button
                        type="button"
                        color="red"
                        variant="light"
                        onClick={() => handleDeleteShop(editingShop)}
                        loading={deleteShopMutation.isPending && deletingShopId === editingShop.id}
                      >
                        Smazat shop
                      </Button>
                    )}
                    <Button type="submit" loading={isSaving}>
                      {editingShop ? 'Uložit změny' : 'Uložit'}
                    </Button>
                  </Group>
                </Stack>
              </form>
            </Modal>

            <Modal
              opened={orderSnapshotOpened}
              onClose={closeOrderSnapshot}
              title="Snapshot objednávek"
              size="md"
            >
              <Stack>
                <Text size="sm" c="dimmed">
                  Můžeš omezit rozsah objednávek podle data vytvoření. Pokud pole necháš prázdná, stáhne se celé období.
                </Text>
                <TextInput
                  label="Od"
                  type="datetime-local"
                  value={orderSnapshotFrom}
                  onChange={(event) => setOrderSnapshotFrom(event.currentTarget.value)}
                />
                <TextInput
                  label="Do"
                  type="datetime-local"
                  value={orderSnapshotTo}
                  onChange={(event) => setOrderSnapshotTo(event.currentTarget.value)}
                />
                <Group justify="flex-end">
                  <Button variant="default" onClick={closeOrderSnapshot}>
                    Zrušit
                  </Button>
                  <Button onClick={submitOrderSnapshot} loading={requestOrderSnapshot.isPending}>
                    Spustit snapshot
                  </Button>
                </Group>
              </Stack>
            </Modal>

            <Modal opened={selectedShopId !== null} onClose={closeWebhookModal} title="Historie synchronizace" size="xl">
              <Tabs value={logTab} onChange={(value) => setLogTab(value as 'pipelines' | 'webhooks')} keepMounted={false}>
                <Tabs.List>
                  <Tabs.Tab value="pipelines">Pipeline</Tabs.Tab>
                  <Tabs.Tab value="webhooks">Webhooky</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="pipelines" pt="md">
                  {snapshotExecutions.data ? (
                    <Table verticalSpacing="sm">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Endpoint</Table.Th>
                          <Table.Th>Status</Table.Th>
                          <Table.Th>Požádáno</Table.Th>
                          <Table.Th>Staženo</Table.Th>
                          <Table.Th>Dokončeno</Table.Th>
                          <Table.Th>Záznamy</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {snapshotExecutions.data.data.length ? (
                          snapshotExecutions.data.data.map((execution) => (
                            <Table.Tr key={execution.id}>
                              <Table.Td>
                                <Text size="sm" style={{ maxWidth: '45ch' }} lineClamp={2}>
                                  {execution.endpoint}
                                </Text>
                              </Table.Td>
                              <Table.Td>
                                <Badge color={execution.status === 'completed' ? 'green' : execution.status === 'error' || execution.status === 'download_failed' ? 'red' : 'blue'}>
                                  {execution.status}
                                </Badge>
                              </Table.Td>
                              <Table.Td>{execution.requested_at ? new Date(execution.requested_at).toLocaleString('cs-CZ') : '—'}</Table.Td>
                              <Table.Td>{execution.downloaded_at ? new Date(execution.downloaded_at).toLocaleString('cs-CZ') : '—'}</Table.Td>
                              <Table.Td>{execution.finished_at ? new Date(execution.finished_at).toLocaleString('cs-CZ') : '—'}</Table.Td>
                              <Table.Td>
                                {(() => {
                                  const processed = execution.meta?.processed_count as number | undefined;
                                  const variants = execution.meta?.variant_count as number | undefined;
                                  if (processed === undefined && variants === undefined) {
                                    return '—';
                                  }

                                  return [
                                    processed !== undefined ? `${processed} řádků` : null,
                                    variants !== undefined ? `${variants} variant` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(', ');
                                })()}
                              </Table.Td>
                            </Table.Tr>
                          ))
                        ) : (
                          <Table.Tr>
                            <Table.Td colSpan={6}>
                              <Text size="sm" c="dimmed" ta="center">
                                Zatím nejsou žádné záznamy.
                              </Text>
                            </Table.Td>
                          </Table.Tr>
                        )}
                      </Table.Tbody>
                    </Table>
                  ) : (
                    <Text size="sm" c="dimmed">
                      Načítám historii…
                    </Text>
                  )}
                </Tabs.Panel>

                <Tabs.Panel value="webhooks" pt="md">
                  {webhookJobs.data ? (
                    <Table verticalSpacing="sm">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Událost</Table.Th>
                          <Table.Th>Status</Table.Th>
                          <Table.Th>Endpoint</Table.Th>
                          <Table.Th>Záznamy</Table.Th>
                          <Table.Th>Datum</Table.Th>
                          <Table.Th>Akce</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {webhookJobs.data.data.map((job) => (
                          <Table.Tr key={job.id}>
                            <Table.Td>{job.event ?? 'unknown'}</Table.Td>
                            <Table.Td>{job.status}</Table.Td>
                            <Table.Td>
                              {(() => {
                                const endpoint = job.endpoint ?? ((job.meta?.job_details as { endpoint?: string } | undefined)?.endpoint ?? '—');
                                const display = endpoint.length > 80 ? `${endpoint.slice(0, 77)}…` : endpoint;

                                return (
                                  <Tooltip label={endpoint} disabled={endpoint === display} withinPortal>
                                    <Text size="sm" style={{ maxWidth: '50ch' }} lineClamp={2}>
                                      {display}
                                    </Text>
                                  </Tooltip>
                                );
                              })()}
                            </Table.Td>
                            <Table.Td>{(job.meta?.processed_count as number | undefined) ?? ((job.meta?.job_details as { processed_count?: number } | undefined)?.processed_count ?? '—')}</Table.Td>
                            <Table.Td>{new Date(job.created_at).toLocaleString('cs-CZ')}</Table.Td>
                            <Table.Td>
                              {DOWNLOADABLE_STATUSES.includes(job.status) ? (
                                <Button
                                  size="xs"
                                  variant="light"
                                  onClick={() => handleDownloadJob(job.id)}
                                  loading={downloadJob.isPending && downloadingJobId === job.id}
                                >
                                  Stáhnout
                                </Button>
                              ) : (
                                <Text size="sm" c="dimmed">
                                  —
                                </Text>
                              )}
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  ) : (
                    <Text size="sm" c="dimmed">
                      Zatím nejsou žádné záznamy.
                    </Text>
                  )}
                </Tabs.Panel>
              </Tabs>
            </Modal>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="woocommerce" pt="md">
          <Stack>
            <Group justify="space-between">
              <Title order={2}>WooCommerce propojení</Title>
              <Button onClick={openCreateWooShopModal}>Přidat WooCommerce shop</Button>
            </Group>

            <Card withBorder>
              {wooCommerceShops.isLoading ? (
                <Group justify="center" py="xl">
                  <Loader />
                </Group>
              ) : wooCommerceShops.isError ? (
                <Text c="red">Nepodařilo se načíst WooCommerce shopy.</Text>
              ) : wooShops.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Zatím nemáš žádný WooCommerce shop. Přidej první kliknutím na tlačítko výše.
                </Text>
              ) : (
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Název</Table.Th>
                      <Table.Th>URL</Table.Th>
                      <Table.Th>Měna</Table.Th>
                      <Table.Th>Propojený shop</Table.Th>
                      <Table.Th>Poslední synchronizace</Table.Th>
                      <Table.Th>Akce</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {wooShops.map((shop) => (
                      <Table.Tr key={shop.id}>
                        <Table.Td>{shop.name}</Table.Td>
                        <Table.Td>
                          <Text size="sm" style={{ maxWidth: '45ch' }} lineClamp={2}>
                            {shop.woocommerce?.base_url ?? `https://${shop.domain}`}
                          </Text>
                        </Table.Td>
                        <Table.Td>{shop.currency_code ?? '—'}</Table.Td>
                        <Table.Td>{shop.customer_link_target?.name ?? '—'}</Table.Td>
                        <Table.Td>{formatDateTime(shop.woocommerce?.last_synced_at)}</Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Tooltip label="Synchronizovat objednávky" withinPortal>
                              <ActionIcon
                                variant="light"
                                color="blue"
                                onClick={() => handleSyncWooShop(shop)}
                                loading={syncWooOrders.isPending && syncingWooShopId === shop.id}
                              >
                                <IconCloudDownload size={16} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Upravit" withinPortal>
                              <ActionIcon variant="light" onClick={() => openEditWooShopModal(shop)}>
                                <IconEdit size={16} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Smazat" withinPortal>
                              <ActionIcon
                                variant="light"
                                color="red"
                                onClick={() => handleDeleteWooShop(shop)}
                                loading={deleteWooShopMutation.isPending && deletingWooShopId === shop.id}
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
              )}
            </Card>

            <Modal
              opened={wooModalOpened}
              onClose={closeWooShopModal}
              title={editingWooShop ? 'Upravit WooCommerce shop' : 'Přidat WooCommerce shop'}
              size="lg"
            >
              <form onSubmit={wooForm.handleSubmit(onWooSubmit)}>
                <Stack>
                  <Controller
                    name="name"
                    control={wooForm.control}
                    rules={{ required: 'Zadej název' }}
                    render={({ field, fieldState }) => (
                      <TextInput label="Název" error={fieldState.error?.message} {...field} />
                    )}
                  />
                  <Controller
                    name="base_url"
                    control={wooForm.control}
                    rules={{ required: 'Zadej URL' }}
                    render={({ field, fieldState }) => (
                      <TextInput
                        label="Base URL"
                        placeholder="https://example.com"
                        error={fieldState.error?.message}
                        {...field}
                      />
                    )}
                  />
                  <Controller
                    name="currency_code"
                    control={wooForm.control}
                    render={({ field }) => (
                      <Select label="Měna" data={currencyOptions} {...field} />
                    )}
                  />
                  <Controller
                    name="api_version"
                    control={wooForm.control}
                    render={({ field }) => (
                      <TextInput label="API verze" placeholder="wc/v3" {...field} />
                    )}
                  />
                  <Controller
                    name="customer_link_shop_id"
                    control={wooForm.control}
                    render={({ field }) => (
                      <Select
                        label="Propojit zákazníky se shopem"
                        data={shoptetShopOptions}
                        placeholder="Nevybráno"
                        clearable
                        comboboxProps={{ withinPortal: true }}
                        value={field.value}
                        onChange={(value) => field.onChange(value ?? null)}
                      />
                    )}
                  />
                  <Controller
                    name="consumer_key"
                    control={wooForm.control}
                    rules={editingWooShop ? undefined : { required: 'Zadej Consumer Key' }}
                    render={({ field, fieldState }) => (
                      <TextInput
                        label="Consumer Key"
                        placeholder="ck_..."
                        description={editingWooShop ? 'Vyplň jen pokud chceš klíč změnit' : undefined}
                        error={fieldState.error?.message}
                        {...field}
                      />
                    )}
                  />
                  <Controller
                    name="consumer_secret"
                    control={wooForm.control}
                    rules={editingWooShop ? undefined : { required: 'Zadej Consumer Secret' }}
                    render={({ field, fieldState }) => (
                      <TextInput
                        label="Consumer Secret"
                        type="password"
                        placeholder="cs_..."
                        description={editingWooShop ? 'Vyplň jen pokud chceš klíč změnit' : undefined}
                        error={fieldState.error?.message}
                        {...field}
                      />
                    )}
                  />
                  <Group justify="space-between">
                    {editingWooShop && (
                      <Button
                        type="button"
                        color="red"
                        variant="light"
                        onClick={() => handleDeleteWooShop(editingWooShop)}
                        loading={deleteWooShopMutation.isPending && deletingWooShopId === editingWooShop.id}
                      >
                        Smazat shop
                      </Button>
                    )}
                    <Button type="submit" loading={wooIsSaving}>
                      {editingWooShop ? 'Uložit změny' : 'Uložit'}
                    </Button>
                  </Group>
                </Stack>
              </form>
            </Modal>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
};

type ShopRowProps = {
  shop: Shop;
  onRefreshToken: () => void;
  refreshLoading: boolean;
  onSnapshotProducts: () => void | Promise<void>;
  snapshotProductsLoading: boolean;
  onSnapshotOrders: () => void;
  onSnapshotCustomers: () => void | Promise<void>;
  snapshotCustomersLoading: boolean;
  onOpenWebhookModal: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleteLoading: boolean;
};

const ShopRow = ({
  shop,
  onRefreshToken,
  refreshLoading,
  onSnapshotProducts,
  snapshotProductsLoading,
  onSnapshotOrders,
  onSnapshotCustomers,
  snapshotCustomersLoading,
  onOpenWebhookModal,
  onEdit,
  onDelete,
  deleteLoading,
}: ShopRowProps) => {
  const { data: webhookStatus, isFetching: statusLoading } = useJobFinishedWebhookStatus(shop.id);
  const registerMutation = useRegisterJobFinishedWebhook();
  const registered = webhookStatus?.registered ?? false;
  const isSyncing = statusLoading || registerMutation.isPending;
  const statusLabel = isSyncing
    ? 'Ověřuji stav webhooku…'
    : registered
      ? 'Webhook job:finished je registrován'
      : 'Webhook job:finished není registrován';

  const handleRegister = async () => {
    try {
      const result = await registerMutation.mutateAsync(shop.id);
      notifications.show({
        message: result?.registered
          ? 'Webhook job:finished byl úspěšně zaregistrován.'
          : 'Registrace webhooku byla odeslána, ověř stav za chvíli.',
        color: result?.registered ? 'green' : 'blue',
      });
    } catch {
      notifications.show({ message: 'Registrace webhooku selhala.', color: 'red' });
    }
  };

  return (
    <Table.Tr>
      <Table.Td>{shop.name}</Table.Td>
      <Table.Td>
        <Group gap="xs">
          <IconWorld size={16} />
          <Text>{shop.domain}</Text>
        </Group>
      </Table.Td>
      <Table.Td>
        <Badge>{shop.api_mode}</Badge>
      </Table.Td>
      <Table.Td>{shop.locale ?? shop.default_locale ?? '—'}</Table.Td>
      <Table.Td>{shop.currency_code ?? '—'}</Table.Td>
      <Table.Td>{shop.is_master ? <Badge color="green">Master</Badge> : '—'}</Table.Td>
      <Table.Td>
        <Group gap="xs" align="center">
          <Tooltip label={statusLabel} withArrow>
            <ThemeIcon
              color={registered ? 'teal' : 'gray'}
              variant={registered ? 'filled' : 'light'}
              radius="xl"
              size={28}
            >
              {isSyncing ? <Loader size="xs" color={registered ? 'white' : 'gray'} /> : <IconCircleFilled size={16} />}
            </ThemeIcon>
          </Tooltip>
          <Button
            size="xs"
            variant="light"
            onClick={handleRegister}
            loading={registerMutation.isPending}
          >
            Registrovat webhook
          </Button>
        </Group>
      </Table.Td>
      <Table.Td>
        <Group gap="xs">
          <Tooltip label="Refresh token">
            <ActionIcon
              onClick={onRefreshToken}
              loading={refreshLoading}
              variant="light"
              aria-label="Refresh token"
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
          <Button size="xs" variant="light" onClick={onSnapshotProducts} loading={snapshotProductsLoading}>
            Snapshot produkty
          </Button>
          <Button size="xs" variant="light" onClick={onSnapshotOrders}>
            Snapshot objednávky
          </Button>
          <Button size="xs" variant="light" onClick={onSnapshotCustomers} loading={snapshotCustomersLoading}>
            Snapshot zákazníci
          </Button>
          <Button size="xs" variant="subtle" onClick={onOpenWebhookModal}>
            Webhooky
          </Button>
          <Tooltip label="Upravit">
            <ActionIcon variant="light" aria-label="Upravit" onClick={onEdit}>
              <IconEdit size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Smazat">
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label="Smazat"
              disabled={deleteLoading}
              onClick={onDelete}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
};
