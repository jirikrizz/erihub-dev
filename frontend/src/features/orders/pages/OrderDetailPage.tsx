import {
  Anchor,
  Badge,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Order, OrderItem } from '../../../api/orders';
import { useOrder, useOrderFilters } from '../hooks/useOrders';
import { SurfaceCard } from '../../../components/layout/SurfaceCard';
import classes from './OrderDetailPage.module.css';
import clsx from 'clsx';
import { useCustomerByEmail, useCustomerByGuid } from '../../customers/hooks/useCustomers';

const formatCurrency = (
  value: number | null | undefined,
  currency?: string | null,
  options?: { baseValue?: number | null | undefined; baseCurrency?: string | null }
) => {
  if (value === null || value === undefined) {
    return '—';
  }

  const baseCurrency = options?.baseCurrency ?? null;
  const primaryCurrency = currency ?? baseCurrency ?? 'CZK';

  const primaryFormatted = new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: primaryCurrency,
    maximumFractionDigits: 2,
  }).format(value);

  const baseValue = options?.baseValue;

  if (baseValue === null || baseValue === undefined || !baseCurrency || baseCurrency === primaryCurrency) {
    return primaryFormatted;
  }

  const baseFormatted = new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: baseCurrency,
    maximumFractionDigits: 2,
  }).format(baseValue);

  return `${primaryFormatted} (≈ ${baseFormatted})`;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
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

const toDisplayString = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(toDisplayString).filter(Boolean).join(', ');
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const renderKeyValueTable = (data: Record<string, unknown> | null | undefined) => {
  if (!data || Object.keys(data).length === 0) {
    return <Text size="sm" c="dimmed">Žádné údaje</Text>;
  }

  return (
    <Table withRowBorders={false} highlightOnHover>
      <Table.Tbody>
        {Object.entries(data).map(([key, value]) => (
          <Table.Tr key={key}>
            <Table.Td w="30%">
              <Text fw={600}>{key}</Text>
            </Table.Td>
            <Table.Td>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : String(value)}
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
};

const getItemCurrency = (item: OrderItem, fallback: string | null | undefined) => {
  const itemCurrency = (item.data?.itemPrice as { currencyCode?: string } | undefined)?.currencyCode;
  return itemCurrency ?? fallback ?? null;
};

const extractDiscounts = (order: Order) => {
  const couponItems = (order.items ?? []).filter((item) => item.item_type === 'discount-coupon');
  const discountItems = (order.items ?? []).filter((item) => item.item_type === 'discount');
  const dataCoupons = (order.data?.discountCoupons as Array<Record<string, unknown>> | undefined) ?? [];
  const dataDiscounts = (order.data?.discounts as Array<Record<string, unknown>> | undefined) ?? [];

  return {
    couponItems,
    discountItems,
    dataCoupons,
    dataDiscounts,
  };
};

const renderPaymentInfo = (order: Order) => {
  const payment = order.payment;

  if (!payment) {
    return <Text size="sm" c="dimmed">Žádné údaje</Text>;
  }

  const method = payment.method as { name?: string } | undefined;
  const billing = payment.billing as { name?: string } | undefined;
  const link = payment.onlinePaymentLink as string | undefined;
  const paymentMethods = (order.data?.paymentMethods as Array<Record<string, unknown>> | undefined) ?? [];

  return (
    <Stack gap={6}>
      <Text size="sm">
        <strong>Způsob platby:</strong> {method?.name ?? '—'}
      </Text>
      <Text size="sm">
        <strong>Fakturace:</strong> {billing?.name ?? '—'}
      </Text>
      {paymentMethods.length > 0 && (
        <Stack gap={2}>
          <Text size="sm" fw={600}>
            Použité metody
          </Text>
          {paymentMethods.map((entry, index) => {
            const entryMethod = entry.paymentMethod as { name?: string } | undefined;
            return (
              <Text key={`payment-method-${index}`} size="sm">
                {entryMethod?.name ?? '—'}
              </Text>
            );
          })}
        </Stack>
      )}
      {link && (
        <Text size="sm">
          <strong>Odkaz na platbu:</strong>{' '}
          <Anchor href={link} target="_blank" rel="noopener noreferrer">
            Otevřít odkaz
          </Anchor>
        </Text>
      )}
    </Stack>
  );
};

const renderShippingInfo = (shipping: Record<string, unknown> | null | undefined) => {
  if (!shipping) {
    return <Text size="sm" c="dimmed">Žádné údaje</Text>;
  }

  const name = shipping.name as string | undefined;
  const guid = shipping.guid as string | undefined;

  return (
    <Stack gap={6}>
      <Text size="sm">
        <strong>Doprava:</strong> {name ?? '—'}
      </Text>
      {guid && (
        <Text size="sm">
          <strong>GUID:</strong> {guid}
        </Text>
      )}
    </Stack>
  );
};

export const OrderDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: order, isLoading, isError } = useOrder(id);
  const orderFilters = useOrderFilters();
  const baseCurrency = orderFilters.data?.base_currency ?? 'CZK';
  const customerGuid = order?.customer_guid ?? undefined;
  const customerEmail = order?.customer_email?.trim() ?? undefined;
  const hasExplicitCustomer = Boolean(order?.customer?.id);
  const shouldFetchByGuid = Boolean(order && !hasExplicitCustomer && !!customerGuid);
  const {
    data: customerByGuid,
    isLoading: customerByGuidLoading,
    isError: customerByGuidError,
  } = useCustomerByGuid(customerGuid, shouldFetchByGuid);
  const shouldFetchByEmail = Boolean(
    order &&
      !hasExplicitCustomer &&
      !!customerEmail &&
      (!customerGuid || customerByGuidError)
  );
  const {
    data: customerByEmail,
    isLoading: customerByEmailLoading,
  } = useCustomerByEmail(customerEmail, shouldFetchByEmail);

  const shippingDetails = useMemo(
    () => (order?.data?.shippingDetails as Array<Record<string, unknown>> | undefined) ?? [],
    [order]
  );

  if (isLoading) {
    return <Loader />;
  }

  if (isError || !order) {
    return <Text>Objednávku se nepodařilo načíst.</Text>;
  }

  const priceData = (order.price ?? null) as { currencyCode?: string | null } | null;
  const currency = order.currency_code ?? priceData?.currencyCode ?? null;
  const customer = order.customer ?? customerByGuid ?? customerByEmail ?? null;
  const hasCustomerLink = !!(customer?.id || customer?.email || customerEmail);

  return (
    <Stack className={classes.page}>
      <SurfaceCard className={classes.heroCard}>
        <div className={classes.heroContent}>
          <div className={classes.heroMain}>
            <div className={classes.heroHeader}>
              <ActionButton onClick={() => navigate(-1)} label="Zpět" />
              <Title order={1} className={classes.heroTitle}>
                {order.code}
              </Title>
            </div>
            <Group gap="xs" className={classes.badgeRow}>
              {order.status && (
                <Badge color="ocean" variant="light" radius="xl">
                  {order.status}
                </Badge>
              )}
              {order.source && (
                <Badge color="gray" variant="light" radius="xl">
                  Zdroj: {order.source}
                </Badge>
              )}
            </Group>
            <div className={classes.heroMeta}>
              <span>Vytvořeno: {formatDateTime(order.ordered_at_local ?? order.ordered_at)}</span>
              {order.external_id && <span>Externí ID: {order.external_id}</span>}
            </div>
          </div>
          {hasCustomerLink && (
            <div className={classes.heroSide}>
              <span className={classes.heroCustomerLabel}>Zákazník</span>
              <span className={classes.heroCustomerName}>
                {customer?.full_name ?? order.customer_name ?? '—'}
              </span>
              {(customer?.email ?? order.customer_email) && (
                <span className={classes.heroCustomerMeta}>{customer?.email ?? order.customer_email}</span>
              )}
              {customer?.id ? (
                <Anchor component={Link} to={`/customers/${customer.id}`} size="sm">
                  Detail zákazníka
                </Anchor>
              ) : customerByGuidLoading || customerByEmailLoading ? (
                <Loader size="xs" />
              ) : order.customer_guid && (order.customer_email || customer?.email) ? (
                <Anchor
                  component={Link}
                  to={`/customers?search=${encodeURIComponent(customer?.email ?? order.customer_email ?? '')}`}
                  size="sm"
                >
                  Zobrazit zákazníka
                </Anchor>
              ) : (
                <Badge color="gray" variant="light" radius="xl">
                  Zákazník se synchronizuje
                </Badge>
              )}
            </div>
          )}
        </div>
      </SurfaceCard>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" className={classes.statsGrid}>
        <SurfaceCard className={classes.metricCard}>
          <Text className={classes.metricLabel}>Celkem (s DPH)</Text>
          <Text className={classes.metricValue} component="div">
            {formatCurrency(order.total_with_vat, currency, {
              baseValue: order.total_with_vat_base,
              baseCurrency,
            })}
          </Text>
        </SurfaceCard>
        <SurfaceCard className={classes.metricCard}>
          <Text className={classes.metricLabel}>Celkem bez DPH</Text>
          <Text className={classes.metricValue} component="div">
            {formatCurrency(order.total_without_vat, currency, {
              baseValue: order.total_without_vat_base,
              baseCurrency,
            })}
          </Text>
        </SurfaceCard>
        <SurfaceCard className={classes.metricCard}>
          <Text className={classes.metricLabel}>DPH</Text>
          <Text className={classes.metricValue} component="div">
            {formatCurrency(order.total_vat, currency, {
              baseValue: order.total_vat_base,
              baseCurrency,
            })}
          </Text>
        </SurfaceCard>
      </SimpleGrid>

      <SurfaceCard className={classes.sectionCard}>
        <Title order={4} mb="sm">
          Kontaktní údaje
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              Jméno
            </Text>
            <Text>{order.customer_name ?? '—'}</Text>
            <Text size="sm" c="dimmed">
              E-mail
            </Text>
            <Text>{order.customer_email ?? '—'}</Text>
          </Stack>
          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              Telefon
            </Text>
            <Text>{order.customer_phone ?? '—'}</Text>
            {customer?.customer_group && (
              <div>
                <Text size="sm" c="dimmed">
                  Zákaznická skupina
                </Text>
                <Text>{customer.customer_group}</Text>
              </div>
            )}
          </Stack>
        </SimpleGrid>
      </SurfaceCard>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <SurfaceCard className={classes.sectionCard}>
          <Title order={4} mb="sm">
            Fakturační adresa
          </Title>
          {renderAddress(order.billing_address)}
        </SurfaceCard>
        <SurfaceCard className={classes.sectionCard}>
          <Title order={4} mb="sm">
            Doručovací adresa
          </Title>
          {renderAddress(order.delivery_address)}
        </SurfaceCard>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <SurfaceCard className={classes.sectionCard}>
          <Title order={4} mb="sm">
            Platba
          </Title>
          {renderPaymentInfo(order)}
        </SurfaceCard>
        <SurfaceCard className={classes.sectionCard}>
          <Title order={4} mb="sm">
            Doprava
          </Title>
          {renderShippingInfo(order.shipping)}
        </SurfaceCard>
      </SimpleGrid>

      {shippingDetails.length > 0 && (
        <SurfaceCard className={classes.sectionCard}>
          <Title order={4} mb="sm">
            Detaily dopravy
          </Title>
          <Stack gap="sm">
            {shippingDetails.map((shipment, index) => (
              <SurfaceCard key={`shipment-${index}`} p="md" className={classes.subCard}>
                {renderKeyValueTable(shipment)}
              </SurfaceCard>
            ))}
          </Stack>
        </SurfaceCard>
      )}

      <SurfaceCard className={classes.sectionCard}>
        <Title order={4} mb="sm">
          Slevy a kupóny
        </Title>
        {(() => {
          const { couponItems, discountItems, dataCoupons, dataDiscounts } = extractDiscounts(order);

          if (
            couponItems.length === 0 &&
            discountItems.length === 0 &&
            dataCoupons.length === 0 &&
            dataDiscounts.length === 0
          ) {
            return <Text size="sm" c="dimmed">Žádné slevy</Text>;
          }

          return (
            <Stack gap="sm">
              {couponItems.length > 0 && (
                <Stack gap={4}>
                  <Text fw={600}>Slevové kupóny (položky)</Text>
                  {couponItems.map((item) => (
                    <Text key={item.id} size="sm">
                      {item.name}
                    </Text>
                  ))}
                </Stack>
              )}
              {discountItems.length > 0 && (
                <Stack gap={4}>
                  <Text fw={600}>Slevové položky</Text>
                  {discountItems.map((item) => (
                    <Text key={item.id} size="sm">
                      {item.name}
                    </Text>
                  ))}
                </Stack>
              )}
              {dataCoupons.length > 0 && (
                <Stack gap={4}>
                  <Text fw={600}>Kupóny (data)</Text>
                  {dataCoupons.map((coupon, index) => {
                    const couponValue = toDisplayString(
                      (coupon.value as unknown) ?? (coupon.amount as unknown) ?? ''
                    );
                    return (
                      <Text key={`coupon-${index}`} size="sm">
                        {(coupon.code as string | undefined) ?? '—'} – {couponValue || '—'}
                      </Text>
                    );
                  })}
                </Stack>
              )}
              {dataDiscounts.length > 0 && (
                <Stack gap={4}>
                  <Text fw={600}>Slevy (data)</Text>
                  {dataDiscounts.map((discount, index) => {
                    const discountValue = toDisplayString(
                      (discount.value as unknown) ?? (discount.amount as unknown) ?? ''
                    );
                    return (
                      <Text key={`discount-${index}`} size="sm">
                        {(discount.name as string | undefined) ?? '—'} – {discountValue || '—'}
                      </Text>
                    );
                  })}
                </Stack>
              )}
            </Stack>
          );
        })()}
      </SurfaceCard>

      <SurfaceCard className={classes.sectionCard}>
        <Title order={4} mb="sm">
          Položky objednávky
        </Title>
        <Table highlightOnHover verticalSpacing="sm" striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Název</Table.Th>
              <Table.Th>Kód</Table.Th>
              <Table.Th>EAN</Table.Th>
              <Table.Th>Množství</Table.Th>
              <Table.Th>Cena s DPH</Table.Th>
              <Table.Th>DPH</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(order.items ?? []).map((item) => {
              const currencyCode = getItemCurrency(item, currency);
              const variantLink = item.variant_id ? `/inventory/variants/${item.variant_id}` : null;

              return (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Stack gap={4} align="flex-start">
                      {variantLink ? (
                        <Anchor component={Link} to={variantLink} fw={600}>
                          {item.name}
                        </Anchor>
                      ) : (
                        <Text fw={600}>{item.name}</Text>
                      )}
                      {item.variant_name && (
                        <Text size="sm" c="dimmed">
                          Varianta: {item.variant_name}
                        </Text>
                      )}
                      {item.item_type && item.item_type !== 'product' && (
                        <Badge color="gray" variant="light" size="sm">
                          {item.item_type}
                        </Badge>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td>{item.code ?? '—'}</Table.Td>
                  <Table.Td>{item.ean ?? '—'}</Table.Td>
                  <Table.Td>
                    {item.amount ?? '—'} {item.amount_unit ?? ''}
                  </Table.Td>
                  <Table.Td>{formatCurrency(item.price_with_vat, currencyCode)}</Table.Td>
                  <Table.Td>{formatCurrency(item.vat, currencyCode)}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </SurfaceCard>

      {order.data && (
        <SurfaceCard className={classes.sectionCard}>
          <Title order={4} mb="sm">
            Surová data (Shoptet)
          </Title>
          <pre className={classes.rawData}>{JSON.stringify(order.data, null, 2)}</pre>
        </SurfaceCard>
      )}
    </Stack>
  );
};

const ActionButton = ({
  onClick,
  label,
  className,
}: {
  onClick: () => void;
  label: string;
  className?: string;
}) => (
  <Group gap={4} onClick={onClick} className={clsx(classes.backAction, className)}>
    <IconArrowLeft size={16} />
    <Text size="sm" className={classes.backActionLabel}>
      {label}
    </Text>
  </Group>
);
