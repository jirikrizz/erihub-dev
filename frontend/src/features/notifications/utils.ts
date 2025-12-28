import type { NotificationModule, NotificationSeverity } from './types';

const dateTimeFormatter = new Intl.DateTimeFormat('cs-CZ', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const relativeTimeFormatter = new Intl.RelativeTimeFormat('cs', {
  numeric: 'auto',
});

export const severityColor: Record<NotificationSeverity, string> = {
  info: 'blue',
  success: 'green',
  warning: 'yellow',
  error: 'red',
};

export const severityLabel: Record<NotificationSeverity, string> = {
  info: 'Info',
  success: 'Úspěch',
  warning: 'Upozornění',
  error: 'Chyba',
};

export const moduleLabel: Record<NotificationModule, string> = {
  inventory: 'Inventář',
  orders: 'Objednávky',
  customers: 'Zákazníci',
  pim: 'PIM',
  shoptet: 'Shoptet',
  analytics: 'Analytika',
  system: 'Systém',
};

export const formatDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateTimeFormatter.format(date);
};

export const formatRelativeTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const diff = date.getTime() - Date.now();
  const absDiff = Math.abs(diff);

  const minutes = Math.round(absDiff / (1000 * 60));
  if (minutes < 1) {
    return 'před chvílí';
  }
  if (minutes < 60) {
    return relativeTimeFormatter.format(Math.round(diff / (1000 * 60)), 'minute');
  }

  const hours = Math.round(diff / (1000 * 60 * 60));
  if (Math.abs(hours) < 24) {
    return relativeTimeFormatter.format(hours, 'hour');
  }

  const days = Math.round(diff / (1000 * 60 * 60 * 24));
  return relativeTimeFormatter.format(days, 'day');
};
