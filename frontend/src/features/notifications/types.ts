export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export type NotificationChannel = 'ui' | 'email' | 'slack';

export type NotificationModule =
  | 'inventory'
  | 'orders'
  | 'customers'
  | 'pim'
  | 'shoptet'
  | 'analytics'
  | 'system';

export type NotificationEventId =
  | 'inventory.low-stock'
  | 'inventory.out-of-stock'
  | 'inventory.restock'
  | 'inventory.slow-mover'
  | 'orders.high-value'
  | 'orders.status-changed'
  | 'orders.import-failed'
  | 'orders.volume-spike'
  | 'customers.vip-created'
  | 'customers.metrics-ready'
  | 'customers.backfill-issue'
  | 'pim.translation-assigned'
  | 'pim.translation-approved'
  | 'pim.push-failed'
  | 'shoptet.snapshot-success'
  | 'shoptet.snapshot-failed'
  | 'shoptet.token-expiring'
  | 'shoptet.master-product-added'
  | 'analytics.digest-ready'
  | 'system.job-failed'
  | 'system.queue-stalled'
  | 'system.release-deployed';

export type NotificationChannelPreferences = Partial<Record<NotificationChannel, boolean>>;

export type NotificationPreferencesMap = Partial<Record<NotificationEventId, NotificationChannelPreferences>>;

export type NotificationEventDefinition = {
  id: NotificationEventId;
  label: string;
  description: string;
  severity: NotificationSeverity;
  module: NotificationModule;
  defaultEnabled: boolean;
  recommendedChannels: NotificationChannel[];
  sampleLog: string;
  tags?: string[];
};

export type NotificationLogStatus = 'new' | 'read';

export type NotificationLogEntry = {
  id: string;
  eventId: NotificationEventId;
  title: string;
  message: string;
  severity: NotificationSeverity;
  channel: NotificationChannel;
  createdAt: string;
  status: NotificationLogStatus;
  module: NotificationModule;
  metadata?: Record<string, unknown>;
};
