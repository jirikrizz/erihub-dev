import { notifications as mantineNotifications } from '@mantine/notifications';
import { create } from 'zustand';
import { fetchNotificationLogs, markAllNotificationsRead, markNotificationRead } from '../../api/notifications';
import type { NotificationLogDto } from '../../api/notifications';
import { fetchUserPreference, updateUserPreference } from '../../api/settings';
import { notificationEventMap } from './eventCatalog';
import type {
  NotificationChannel,
  NotificationChannelPreferences,
  NotificationEventId,
  NotificationLogEntry,
  NotificationLogStatus,
  NotificationPreferencesMap,
  NotificationSeverity,
} from './types';

const PREFERENCE_KEY = 'notifications.events';
const MAX_LOG_ENTRIES = 500;
const displayedNotificationIds = new Set<string>();
const AVAILABLE_CHANNELS: NotificationChannel[] = ['ui', 'email', 'slack'];
const EVENT_IDS = new Set<NotificationEventId>(Object.keys(notificationEventMap) as NotificationEventId[]);

const getErrorMessage = (error: unknown): string => {
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') {
      return maybeMessage;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Došlo k neočekávané chybě.';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const getDefaultChannelValue = (eventId: NotificationEventId, channel: NotificationChannel): boolean => {
  const definition = notificationEventMap[eventId];
  if (!definition) {
    return false;
  }

  if (channel === 'ui') {
    return definition.defaultEnabled;
  }

  return false;
};

const clonePreferences = (source: NotificationPreferencesMap | null): NotificationPreferencesMap => {
  if (!source) {
    return {};
  }

  return Object.entries(source).reduce<NotificationPreferencesMap>((acc, [eventId, channels]) => {
    if (channels) {
      acc[eventId as NotificationEventId] = { ...channels };
    }

    return acc;
  }, {});
};

const pruneEventChannels = (
  eventId: NotificationEventId,
  channels: NotificationChannelPreferences
): NotificationChannelPreferences | null => {
  const result: NotificationChannelPreferences = {};

  for (const channel of AVAILABLE_CHANNELS) {
    const value = channels[channel];
    if (typeof value !== 'boolean') {
      continue;
    }

    if (value !== getDefaultChannelValue(eventId, channel)) {
      result[channel] = value;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
};

const normalizePreferences = (value: unknown): NotificationPreferencesMap => {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<NotificationPreferencesMap>((acc, [eventId, rawValue]) => {
    if (!EVENT_IDS.has(eventId as NotificationEventId)) {
      return acc;
    }

    if (typeof rawValue === 'boolean') {
      const override = pruneEventChannels(eventId as NotificationEventId, { ui: rawValue });
      if (override) {
        acc[eventId as NotificationEventId] = override;
      }

      return acc;
    }

    if (!isRecord(rawValue)) {
      return acc;
    }

    const channels: NotificationChannelPreferences = {};
    for (const channel of AVAILABLE_CHANNELS) {
      const flag = rawValue[channel];
      if (typeof flag === 'boolean') {
        channels[channel] = flag;
      }
    }

    const override = pruneEventChannels(eventId as NotificationEventId, channels);
    if (override) {
      acc[eventId as NotificationEventId] = override;
    }

    return acc;
  }, {});
};

const collectDisabledEvents = (preferences: NotificationPreferencesMap | null): Set<NotificationEventId> => {
  const disabled = new Set<NotificationEventId>();

  for (const eventId of EVENT_IDS) {
    const definition = notificationEventMap[eventId];
    const override = preferences?.[eventId]?.ui;

    let enabled: boolean;
    if (typeof override === 'boolean') {
      enabled = override;
    } else {
      enabled = definition ? definition.defaultEnabled : false;
    }

    if (!enabled) {
      disabled.add(eventId);
    }
  }

  return disabled;
};

const preparePreferencesForSave = (
  preferences: NotificationPreferencesMap | null
): NotificationPreferencesMap | null => {
  if (!preferences) {
    return null;
  }

  const payload: NotificationPreferencesMap = {};

  for (const eventId of Object.keys(preferences) as NotificationEventId[]) {
    const channels = preferences[eventId];
    if (!channels) {
      continue;
    }

    const serialized: NotificationChannelPreferences = {};
    for (const channel of AVAILABLE_CHANNELS) {
      const value = channels[channel];
      if (typeof value === 'boolean') {
        serialized[channel] = value;
      }
    }

    if (Object.keys(serialized).length > 0) {
      payload[eventId] = serialized;
    }
  }

  return Object.keys(payload).length > 0 ? payload : null;
};

type NotificationStoreState = {
  preferences: NotificationPreferencesMap | null;
  preferencesLoaded: boolean;
  preferencesLoading: boolean;
  preferencesError: string | null;
  disabledEvents: Set<NotificationEventId>;
  logs: NotificationLogEntry[];
  logsLoaded: boolean;
  logsLoading: boolean;
  logsError: string | null;
  unreadCount: number;
  lastFetchedAt: string | null;
  hydrateFromServer: (value: NotificationPreferencesMap | null) => void;
  reset: () => void;
  loadPreferences: () => Promise<void>;
  loadLogs: (options?: { force?: boolean }) => Promise<void>;
  refreshLogs: () => Promise<void>;
  setChannelEnabled: (
    eventId: NotificationEventId,
    channel: NotificationChannel,
    enabled: boolean
  ) => Promise<void>;
  isChannelEnabled: (eventId: NotificationEventId, channel: NotificationChannel) => boolean;
  isEventEnabled: (eventId: NotificationEventId) => boolean;
  markAsRead: (logId: string) => Promise<void>;
  markAllAsRead: (logIds?: string[]) => Promise<void>;
};

const severityToColor = (severity: NotificationSeverity): string => {
  switch (severity) {
    case 'success':
      return 'green';
    case 'warning':
      return 'yellow';
    case 'error':
      return 'red';
    default:
      return 'blue';
  }
};

const countUnread = (logs: NotificationLogEntry[]): number =>
  logs.reduce((acc, log) => acc + (log.status === 'new' ? 1 : 0), 0);

const normalizeLogEntry = (entry: NotificationLogDto): NotificationLogEntry => ({
  id: entry.id,
  eventId: entry.event_id,
  title: entry.title,
  message: entry.message,
  severity: entry.severity,
  channel: entry.channel,
  createdAt: entry.created_at,
  status: entry.status,
  module: entry.module,
  metadata: entry.metadata,
});

export const useNotificationStore = create<NotificationStoreState>((set, get) => ({
  preferences: null,
  preferencesLoaded: false,
  preferencesLoading: false,
  preferencesError: null,
  disabledEvents: new Set<NotificationEventId>(),
  logs: [],
  logsLoaded: false,
  logsLoading: false,
  logsError: null,
  unreadCount: 0,
  lastFetchedAt: null,
  hydrateFromServer: (value) => {
    const normalized = normalizePreferences(value ?? {});
    set({
      preferences: normalized,
      disabledEvents: collectDisabledEvents(normalized),
      preferencesLoaded: true,
      preferencesLoading: false,
      preferencesError: null,
    });
  },
  reset: () => {
    set({
      preferences: null,
      preferencesLoaded: false,
      preferencesLoading: false,
      preferencesError: null,
      logs: [],
      logsLoaded: false,
      logsLoading: false,
      logsError: null,
      disabledEvents: new Set<NotificationEventId>(),
      unreadCount: 0,
      lastFetchedAt: null,
    });
  },
  loadPreferences: async () => {
    const state = get();
    if (state.preferencesLoaded || state.preferencesLoading) {
      return;
    }

    set({ preferencesLoading: true, preferencesError: null });

    try {
      const response = await fetchUserPreference<NotificationPreferencesMap>(PREFERENCE_KEY);
      const normalized = normalizePreferences(response.value);
      set({
        preferences: normalized,
        disabledEvents: collectDisabledEvents(normalized),
        preferencesLoaded: true,
        preferencesLoading: false,
        preferencesError: null,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      set({ preferencesError: message, preferencesLoading: false });
      throw error;
    }
  },
  loadLogs: async (options) => {
    const force = options?.force ?? false;
    const state = get();

    if (!force && (state.logsLoaded || state.logsLoading)) {
      return;
    }

    set({ logsLoading: true, logsError: null });

    try {
      const response = await fetchNotificationLogs();
      const stateBefore = get();
      const disabledEvents = stateBefore.disabledEvents;
      const rawLogs = Array.isArray(response.logs)
        ? response.logs.map(normalizeLogEntry)
        : [];
      const boundedLogs = rawLogs.length > MAX_LOG_ENTRIES
        ? rawLogs.slice(0, MAX_LOG_ENTRIES)
        : rawLogs;
      const visibleLogs = boundedLogs.filter((log) => !disabledEvents.has(log.eventId));
      const unread = countUnread(visibleLogs);

      if (stateBefore.logsLoaded) {
        const previousIds = new Set(stateBefore.logs.map((log) => log.id));
        visibleLogs.forEach((entry) => {
          if (entry.status !== 'new') {
            return;
          }

          if (previousIds.has(entry.id)) {
            return;
          }

          if (displayedNotificationIds.has(entry.id)) {
            return;
          }

          displayedNotificationIds.add(entry.id);

          mantineNotifications.show({
            id: entry.id,
            title: entry.title,
            message: entry.message,
            color: severityToColor(entry.severity),
            withBorder: entry.severity === 'error',
            autoClose: entry.severity === 'error' ? false : 6000,
          });
        });
      }

      set({
        logs: boundedLogs,
        logsLoaded: true,
        logsLoading: false,
        logsError: null,
        unreadCount: unread,
        lastFetchedAt: response.fetched_at ?? new Date().toISOString(),
      });
    } catch (error) {
      const message = getErrorMessage(error);
      set({
        logsError: message,
        logsLoading: false,
        logsLoaded: false,
      });
      throw error;
    }
  },
  refreshLogs: async () => {
    await get().loadLogs({ force: true });
  },
  setChannelEnabled: async (eventId, channel, enabled) => {
    const state = get();

    if (!state.preferencesLoaded && !state.preferencesLoading) {
      try {
        await state.loadPreferences();
      } catch (error) {
        const message = getErrorMessage(error);
        mantineNotifications.show({
          color: 'red',
          title: 'Nepodařilo se načíst nastavení',
          message,
        });
        throw error;
      }
    }

    const current = get().preferences;
    const previous = clonePreferences(current);
    const next = clonePreferences(current);
    const eventChannels: NotificationChannelPreferences = {
      ...(next[eventId] ?? {}),
      [channel]: enabled,
    };

    const pruned = pruneEventChannels(eventId, eventChannels);

    if (pruned) {
      next[eventId] = pruned;
    } else {
      delete next[eventId];
    }

    set({ preferences: next, preferencesError: null, disabledEvents: collectDisabledEvents(next) });

    try {
      const payload = preparePreferencesForSave(next);
      await updateUserPreference<NotificationPreferencesMap>(PREFERENCE_KEY, payload);
      set({ preferencesLoaded: true });
    } catch (error) {
      const message = getErrorMessage(error);
      set({ preferences: previous, preferencesError: message, disabledEvents: collectDisabledEvents(previous) });
      mantineNotifications.show({
        color: 'red',
        title: 'Uložení selhalo',
        message: 'Nepodařilo se uložit nastavení notifikací.',
      });
      throw error;
    }
  },
  isChannelEnabled: (eventId, channel) => {
    if (!EVENT_IDS.has(eventId)) {
      return false;
    }

    const preferences = get().preferences;
    const override = preferences?.[eventId]?.[channel];

    if (typeof override === 'boolean') {
      return override;
    }

    return getDefaultChannelValue(eventId, channel);
  },
  isEventEnabled: (eventId) => get().isChannelEnabled(eventId, 'ui'),
  markAsRead: async (logId) => {
    const state = get();
    if (!state.logs.some((log) => log.id === logId)) {
      return;
    }

    const previousLogs = state.logs;
    const previousUnread = state.unreadCount;

    const nextLogs = previousLogs.map((log) =>
      log.id === logId ? { ...log, status: 'read' as NotificationLogStatus } : log
    );

    set({ logs: nextLogs, unreadCount: countUnread(nextLogs) });

    try {
      const response = await markNotificationRead(logId);
      set((current) => ({
        unreadCount:
          typeof response.unread_count === 'number'
            ? response.unread_count
            : countUnread(current.logs),
      }));
    } catch (error) {
      const message = getErrorMessage(error);
      set({ logs: previousLogs, unreadCount: previousUnread });
      mantineNotifications.show({
        color: 'red',
        title: 'Označení selhalo',
        message: message || 'Nepodařilo se označit notifikaci jako přečtenou.',
      });
      throw error;
    }
  },
  markAllAsRead: async (logIds) => {
    const hasExplicitIds = Array.isArray(logIds);
    const ids = hasExplicitIds ? logIds ?? [] : get().logs.map((log) => log.id);

    if (!hasExplicitIds && !ids.length) {
      try {
        const response = await markAllNotificationsRead();
        set(() => ({
          unreadCount: typeof response.unread_count === 'number' ? response.unread_count : 0,
        }));
      } catch (error) {
        const message = getErrorMessage(error);
        mantineNotifications.show({
          color: 'red',
          title: 'Akce selhala',
          message: message || 'Nepodařilo se označit notifikace jako přečtené.',
        });
        throw error;
      }

      return;
    }

    if (ids.length === 0) {
      return;
    }

    const state = get();
    const idSet = new Set(ids);
    const previousLogs = state.logs;
    const previousUnread = state.unreadCount;

    const nextLogs = previousLogs.map((log) =>
      idSet.has(log.id) ? { ...log, status: 'read' as NotificationLogStatus } : log
    );

    set({ logs: nextLogs, unreadCount: countUnread(nextLogs) });

    try {
      const response = await markAllNotificationsRead(hasExplicitIds ? ids : undefined);
      set((current) => ({
        unreadCount:
          typeof response.unread_count === 'number'
            ? response.unread_count
            : countUnread(current.logs),
      }));
    } catch (error) {
      const message = getErrorMessage(error);
      set({ logs: previousLogs, unreadCount: previousUnread });
      mantineNotifications.show({
        color: 'red',
        title: 'Akce selhala',
        message: message || 'Nepodařilo se označit notifikace jako přečtené.',
      });
      throw error;
    }
  },
}));

export const isNotificationChannelEnabled = (
  eventId: NotificationEventId,
  channel: NotificationChannel
): boolean => useNotificationStore.getState().isChannelEnabled(eventId, channel);

export const isNotificationEnabled = (eventId: NotificationEventId): boolean =>
  useNotificationStore.getState().isEventEnabled(eventId);
