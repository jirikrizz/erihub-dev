import api from './client';
import type {
  NotificationChannel,
  NotificationLogEntry,
  NotificationLogStatus,
  NotificationModule,
  NotificationSeverity,
} from '../features/notifications/types';

export type NotificationLogDto = {
  id: string;
  event_id: NotificationLogEntry['eventId'];
  title: string;
  message: string;
  severity: NotificationSeverity;
  channel: NotificationChannel;
  created_at: string;
  status: NotificationLogStatus;
  module: NotificationModule;
  metadata?: Record<string, unknown>;
};

export type NotificationLogsResponse = {
  logs: NotificationLogDto[];
  unread_count: number;
  fetched_at: string;
  available_filters?: {
    modules?: string[];
    severities?: string[];
  };
};

export type NotificationLogsParams = {
  limit?: number;
  status?: 'new' | 'read' | 'all';
  module?: string;
  severity?: string;
  search?: string;
};

export const fetchNotificationLogs = async (params?: NotificationLogsParams): Promise<NotificationLogsResponse> => {
  const response = await api.get<NotificationLogsResponse>('/notifications/logs', {
    params,
  });

  return response.data;
};

export type MarkNotificationReadResponse = {
  notification_id: string;
  unread_count: number;
};

export const markNotificationRead = async (notificationId: string): Promise<MarkNotificationReadResponse> => {
  const response = await api.post<MarkNotificationReadResponse>(
    `/notifications/logs/${encodeURIComponent(notificationId)}/read`
  );

  return response.data;
};

export type MarkAllNotificationsReadResponse = {
  unread_count: number;
};

export const markAllNotificationsRead = async (ids?: string[]): Promise<MarkAllNotificationsReadResponse> => {
  const payload = ids ? { ids } : {};
  const response = await api.post<MarkAllNotificationsReadResponse>('/notifications/logs/read-all', payload);

  return response.data;
};
