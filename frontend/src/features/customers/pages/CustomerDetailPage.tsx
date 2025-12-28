import {
  Badge,
  Button,
  Card,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  TagsInput,
  Table,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { IconArrowLeft, IconStarFilled, IconStarOff } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { CustomerOrder, CustomerNote } from '../../../api/customers';
import { createCustomerNote, fetchCustomerTags, updateCustomer } from '../../../api/customers';
import { useCustomer } from '../hooks/useCustomers';

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('cs-CZ');
};

const renderAddress = (address: Record<string, unknown> | null | undefined) => {
  if (!address) {
    return <Text size="sm" c="dimmed">Neznámá adresa</Text>;
  }

  const entries = Object.entries(address).filter(([, value]) => value !== null && value !== '' && value !== undefined);
  if (entries.length === 0) {
    return <Text size="sm" c="dimmed">Neznámá adresa</Text>;
  }

  return (
    <Stack gap={2}>
      {entries.map(([key, value]) => (
        <Text key={key} size="sm">
          <strong>{key}:</strong> {String(value)}
        </Text>
      ))}
    </Stack>
  );
};

const formatCurrency = (
  value: number | null | undefined,
  currency: string,
  options?: { baseValue?: number | null | undefined; baseCurrency?: string | null }
) => {
  if (value === null || value === undefined) {
    return '—';
  }

  const formatted = new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);

  const baseValue = options?.baseValue;
  const baseCurrency = options?.baseCurrency;

  if (
    baseValue === null ||
    baseValue === undefined ||
    !baseCurrency ||
    baseCurrency === currency
  ) {
    return formatted;
  }

  const baseFormatted = new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: baseCurrency,
    maximumFractionDigits: 2,
  }).format(baseValue);

  return `${formatted} (≈ ${baseFormatted})`;
};

export const CustomerDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: customer, isLoading, isError } = useCustomer(id);
  const [notes, setNotes] = useState('');
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const deliveryAddresses = (customer?.delivery_addresses ?? []) as Record<string, unknown>[];
  const orders = (customer?.orders ?? []) as CustomerOrder[];
  const notesHistory = (customer?.notes_history ?? []) as CustomerNote[];
  const baseCurrency = customer?.base_currency ?? 'CZK';
  const productInsights = customer?.product_insights;
  const insightCurrency = productInsights?.base_currency ?? baseCurrency;

  useEffect(() => {
    setNotes('');
    setTagDraft(customer?.tags ?? []);
  }, [customer?.id]);

  const formatBaseCurrency = (value: number) =>
    new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency: baseCurrency,
      maximumFractionDigits: 2,
    }).format(value);

  const formatInsightCurrency = (value: number) =>
    new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency: insightCurrency,
      maximumFractionDigits: 2,
    }).format(value);

  const formatDecimal = (value: number) => value.toLocaleString('cs-CZ', { maximumFractionDigits: 2 });

  const formatOrderAmount = (order: CustomerOrder) =>
    formatCurrency(order.total_with_vat, order.currency_code ?? baseCurrency, {
      baseValue: order.total_with_vat_base,
      baseCurrency,
    });

  const metrics = [
    {
      label: 'Počet objednávek',
      value: customer?.orders_count ?? 0,
      formatter: (value: number) => value.toLocaleString('cs-CZ'),
    },
    {
      label: `Celková útrata (${baseCurrency})`,
      value: customer?.total_spent_base ?? customer?.total_spent ?? 0,
      formatter: (value: number) => formatBaseCurrency(value),
    },
    {
      label: `Průměrná objednávka (AOV, ${baseCurrency})`,
      value: customer?.average_order_value_base ?? customer?.average_order_value ?? 0,
      formatter: (value: number) => formatBaseCurrency(value),
    },
  ];

  const createNoteMutation = useMutation({
    mutationFn: (payload: { id: string; note: string }) => createCustomerNote(payload.id, payload.note),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customers', 'detail', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      notifications.show({ message: 'Poznámka uložena', color: 'green' });
      setNotes('');
    },
    onError: () => {
      notifications.show({ message: 'Poznámku se nepodařilo uložit', color: 'red' });
    },
  });

  const toggleVipMutation = useMutation({
    mutationFn: (payload: { id: string; value: boolean }) => updateCustomer(payload.id, { is_vip: payload.value }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customers', 'detail', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers', 'vip'] });
      notifications.show({
        message: variables.value ? 'Zákazník byl označen jako VIP.' : 'VIP štítek byl odebrán.',
        color: 'green',
      });
    },
    onError: () => {
      notifications.show({ message: 'VIP status se nepodařilo aktualizovat.', color: 'red' });
    },
  });

  const { data: allTags } = useQuery({
    queryKey: ['customers', 'manual-tags'],
    queryFn: fetchCustomerTags,
  });
  const tagOptions = useMemo(
    () =>
      (allTags ?? []).map((tag) => ({
        value: tag.value,
        label: tag.label,
        color: tag.color,
      })),
    [allTags]
  );

  const updateTagsMutation = useMutation({
    mutationFn: (payload: { id: string; tags: string[] }) => updateCustomer(payload.id, { tags: payload.tags }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['customers', 'detail', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      notifications.show({ message: 'Štítky uloženy.', color: 'green' });
      setTagDraft(variables.tags);
    },
    onError: () => {
      notifications.show({ message: 'Štítky se nepodařilo uložit.', color: 'red' });
    },
  });

  const handleSaveTags = () => {
    if (!customer) return;
    updateTagsMutation.mutate({ id: customer.id, tags: tagDraft });
  };

  if (isLoading) {
    return <Loader />;
  }

  if (isError || !customer) {
    return <Text>Zákazníka se nepodařilo načíst.</Text>;
  }

  return (
    <Stack>
      <Group gap={8} style={{ cursor: 'pointer' }} onClick={() => navigate(-1)}>
        <IconArrowLeft size={16} />
        <Text size="sm">Zpět</Text>
      </Group>

      <Card withBorder>
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Stack gap={4} pr="xl">
              <Group gap="xs" align="center">
                <Title order={2}>{customer.full_name ?? 'Neznámý zákazník'}</Title>
                {customer.is_vip && (
                  <Badge color="yellow" variant="filled" leftSection={<IconStarFilled size={12} />}>
                    VIP zákazník
                  </Badge>
                )}
              </Group>
              <Group gap="xs" wrap="wrap">
                {customer.customer_group && <Badge>{customer.customer_group}</Badge>}
                {customer.price_list && <Badge color="violet">Ceník: {customer.price_list}</Badge>}
                {customer.shop && (
                  <Badge color="blue">
                    {customer.shop.name}
                    {customer.shop.locale ? ` · ${customer.shop.locale.toUpperCase()}` : ''}
                    {customer.shop.is_master && ' · Master'}
                  </Badge>
                )}
                {tagDraft.length > 0 && (
                  <Group gap={4} wrap="wrap">
                    {tagDraft.map((tag) => {
                      const color = tagOptions.find((t) => t.value === tag)?.color ?? undefined;
                      return (
                        <Badge key={tag} color={color ?? 'gray'} variant="light" size="xs">
                          {tag}
                        </Badge>
                      );
                    })}
                  </Group>
                )}
              </Group>
            </Stack>
            <Stack gap={6} align="flex-end">
              <Button
                size="xs"
                color={customer.is_vip ? 'yellow' : 'gray'}
                variant={customer.is_vip ? 'light' : 'subtle'}
                leftSection={customer.is_vip ? <IconStarOff size={14} /> : <IconStarFilled size={14} />}
                onClick={() => toggleVipMutation.mutate({ id: customer.id, value: !customer.is_vip })}
                loading={toggleVipMutation.isPending}
              >
                {customer.is_vip ? 'Odebrat VIP' : 'Přidat jako VIP'}
              </Button>
              {customer.email && <Text fw={600}>{customer.email}</Text>}
              {customer.phone && <Text>{customer.phone}</Text>}
            </Stack>
          </Group>

          <SimpleGrid cols={{ base: 1, md: 2, lg: 4 }} spacing="md" mt="sm">
            <Card withBorder padding="sm">
              <Text size="sm" c="dimmed">
                Účet vytvořen
              </Text>
              <Title order={4}>{formatDateTime(customer.created_at_remote)}</Title>
            </Card>
            <Card withBorder padding="sm">
              <Text size="sm" c="dimmed">
                Poslední aktualizace
              </Text>
              <Title order={4}>{formatDateTime(customer.updated_at_remote)}</Title>
            </Card>
            <Card withBorder padding="sm">
              <Text size="sm" c="dimmed">
                První objednávka
              </Text>
              <Title order={4}>{formatDateTime(customer.first_order_at)}</Title>
            </Card>
            <Card withBorder padding="sm">
              <Text size="sm" c="dimmed">
                Poslední objednávka
              </Text>
              <Title order={4}>{formatDateTime(customer.last_order_at)}</Title>
            </Card>
          </SimpleGrid>
        </Stack>
      </Card>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card withBorder>
          <Title order={4} mb="sm">
            Fakturační adresa
          </Title>
          {renderAddress(customer.billing_address)}
        </Card>
        {deliveryAddresses.length > 0 && (
          <Card withBorder>
            <Title order={4} mb="sm">
              Doručovací adresy
            </Title>
            <Stack gap="sm">
              {deliveryAddresses.map((address, index) => (
                <Card key={`delivery-${index}`} withBorder padding="sm">
                  {renderAddress(address)}
                </Card>
              ))}
            </Stack>
          </Card>
        )}
      </SimpleGrid>

      <Card withBorder>
        <Title order={4} mb="sm">
          Shrnutí objednávek
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          {metrics.map((metric) => (
            <Card key={metric.label} withBorder padding="sm">
              <Text size="sm" c="dimmed">
                {metric.label}
              </Text>
              <Title order={3}>{metric.formatter(metric.value)}</Title>
            </Card>
          ))}
        </SimpleGrid>
      </Card>

      {productInsights && (productInsights.categories.length > 0 || productInsights.parameters.length > 0) && (
        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Title order={4}>Co zákazník nakupuje</Title>
                <Text size="sm" c="gray.6">
                  Souhrn nejčastějších kategorií a parametrů produktů (částky v {insightCurrency}).
                </Text>
              </div>
            </Group>

            {productInsights.categories.length > 0 && (
              <Stack gap="xs">
                <Text fw={600}>Nejčastější kategorie</Text>
                <Table highlightOnHover verticalSpacing="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Kategorie</Table.Th>
                      <Table.Th style={{ width: 120 }}>Objednávky</Table.Th>
                      <Table.Th style={{ width: 120 }}>Položky</Table.Th>
                      <Table.Th style={{ width: 160 }}>Útrata</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {productInsights.categories.slice(0, 12).map((category) => (
                      <Table.Tr key={category.name}>
                        <Table.Td>{category.name}</Table.Td>
                        <Table.Td>{category.orders.toLocaleString('cs-CZ')}</Table.Td>
                        <Table.Td>{formatDecimal(category.quantity)}</Table.Td>
                        <Table.Td>{formatInsightCurrency(category.revenue)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Stack>
            )}

            {productInsights.parameters.length > 0 && (
              <Stack gap="sm">
                <Text fw={600}>Klíčové parametry nákupů</Text>
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                  {productInsights.parameters.slice(0, 6).map((parameter) => (
                    <Card key={parameter.name} withBorder padding="sm">
                      <Stack gap="xs">
                        <Text fw={600}>{parameter.name}</Text>
                        <Table verticalSpacing="xs" striped>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Hodnota</Table.Th>
                              <Table.Th style={{ width: 100 }}>Obj.</Table.Th>
                              <Table.Th style={{ width: 100 }}>Položky</Table.Th>
                              <Table.Th style={{ width: 130 }}>Útrata</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {parameter.values.map((value) => (
                              <Table.Tr key={`${parameter.name}-${value.value}`}>
                                <Table.Td>{value.value}</Table.Td>
                                <Table.Td>{value.orders.toLocaleString('cs-CZ')}</Table.Td>
                                <Table.Td>{formatDecimal(value.quantity)}</Table.Td>
                                <Table.Td>{formatInsightCurrency(value.revenue)}</Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Stack>
                    </Card>
                  ))}
                </SimpleGrid>
              </Stack>
            )}
          </Stack>
        </Card>
      )}

      <Card withBorder>
        <Title order={4} mb="sm">
          Účty zákazníka
        </Title>
        {customer.accounts && customer.accounts.length > 0 ? (
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Email</Table.Th>
                <Table.Th>Telefon</Table.Th>
                <Table.Th>Hlavní účet</Table.Th>
                <Table.Th>Ověřený e-mail</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {customer.accounts.map((account) => (
                <Table.Tr key={account.id}>
                  <Table.Td>{account.email ?? '—'}</Table.Td>
                  <Table.Td>{account.phone ?? '—'}</Table.Td>
                  <Table.Td>{account.main_account ? 'Ano' : 'Ne'}</Table.Td>
                  <Table.Td>{account.email_verified ? 'Ano' : 'Ne'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm" c="dimmed">
            Žádné účty.
          </Text>
        )}
      </Card>

      <Card withBorder>
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Title order={4}>Štítky</Title>
            <Button
              size="xs"
              variant="light"
              onClick={handleSaveTags}
              loading={updateTagsMutation.isPending}
            >
              Uložit štítky
            </Button>
          </Group>
          <TagsInput
            value={tagDraft}
            onChange={setTagDraft}
            data={tagOptions}
            clearable
            placeholder="Přidej štítek a potvrď Enterem"
          />
          {tagDraft.length > 0 && (
            <Group gap={6} wrap="wrap">
              {tagDraft.map((tag) => {
                const rawColor = tagOptions.find((t) => t.value === tag)?.color ?? undefined;
                const colorValue = typeof rawColor === 'string' ? rawColor.trim() : '';
                const hasCustomColor = colorValue.startsWith('#');
                return (
                  <Badge
                    key={tag}
                    color={hasCustomColor ? 'gray' : rawColor ?? 'gray'}
                    variant="light"
                    size="xs"
                    leftSection={
                      hasCustomColor ? (
                        <span
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: 9999,
                            backgroundColor: colorValue,
                          }}
                        />
                      ) : null
                    }
                  >
                    {tag}
                  </Badge>
                );
              })}
            </Group>
          )}
        </Stack>
      </Card>

      <Card withBorder>
        <Title order={4} mb="sm">
          Interní poznámky
        </Title>
        <Stack gap="sm">
          <Textarea
            minRows={4}
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
            placeholder="Zapište interní poznámku k zákazníkovi"
          />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Poznámka se zobrazí všem administrátorům.
            </Text>
            <Button
              variant="light"
              onClick={() => createNoteMutation.mutate({ id: customer.id, note: notes.trim() })}
              loading={createNoteMutation.isPending}
              disabled={!notes.trim()}
            >
              Přidat poznámku
            </Button>
          </Group>

          {notesHistory.length > 0 ? (
            <Stack gap="sm">
              {notesHistory.map((note) => (
                <Card key={note.id} withBorder padding="sm">
                  <Group justify="space-between" align="flex-start">
                    <Text fw={600}>{note.user?.name ?? 'Neznámý uživatel'}</Text>
                    <Text size="xs" c="dimmed">
                      {formatDateTime(note.created_at)}
                    </Text>
                  </Group>
                  <Text size="sm" mt="xs" style={{ whiteSpace: 'pre-wrap' }}>
                    {note.note}
                  </Text>
                </Card>
              ))}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              Zatím nejsou žádné interní poznámky.
            </Text>
          )}
        </Stack>
      </Card>

      <Card withBorder>
        <Title order={4} mb="sm">
          Objednávky zákazníka
        </Title>
        {orders.length > 0 ? (
          <Table highlightOnHover verticalSpacing="sm" striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Kód</Table.Th>
                <Table.Th>Datum</Table.Th>
                <Table.Th>Stav</Table.Th>
                <Table.Th>Celkem</Table.Th>
                <Table.Th>Položek</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {orders.map((order) => (
                <Table.Tr
                  key={order.id}
                  onClick={() => navigate(`/orders/${order.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <Table.Td>{order.code}</Table.Td>
                  <Table.Td>{formatDateTime(order.ordered_at_local ?? order.ordered_at)}</Table.Td>
                  <Table.Td>{order.status ?? '—'}</Table.Td>
                  <Table.Td>{formatOrderAmount(order)}</Table.Td>
                  <Table.Td>{order.items?.length ?? 0}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Text size="sm" c="dimmed">
            Tento zákazník nemá evidované objednávky.
          </Text>
        )}
      </Card>
    </Stack>
  );
};
