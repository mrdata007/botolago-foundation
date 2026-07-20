import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  NotificationDeviceRepository,
  NotificationPreferenceRepository,
  NotificationRepository,
} from "@/backend/notifications/contracts";
import { NotificationError } from "@/backend/notifications/errors";
import {
  MockNotificationDeviceRepository,
  MockNotificationPreferenceRepository,
  MockNotificationRepository,
} from "@/backend/notifications/mock-repositories";
import {
  SupabaseNotificationDeviceRepository,
  SupabaseNotificationPreferenceRepository,
  SupabaseNotificationRepository,
} from "@/backend/notifications/supabase-repositories";
import { authService } from "@/services/auth";

export type NotificationsDataMode = "mock" | "supabase";

export function selectNotificationsDataMode(
  configuredMode: string | undefined,
  production: boolean,
): NotificationsDataMode {
  if (production && configuredMode !== "supabase")
    throw new NotificationError(
      "data_unavailable",
      "Production notifications require VITE_NOTIFICATIONS_DATA_MODE=supabase.",
    );
  if (configuredMode === "mock" || configuredMode === "supabase") return configuredMode;
  return "mock";
}

const mock = {
  notifications: new MockNotificationRepository(),
  preferences: new MockNotificationPreferenceRepository(),
  devices: new MockNotificationDeviceRepository(),
};
const cloud = {
  notifications: new SupabaseNotificationRepository(),
  preferences: new SupabaseNotificationPreferenceRepository(),
  devices: new SupabaseNotificationDeviceRepository(),
};

export function getNotificationsDataMode(): NotificationsDataMode {
  return selectNotificationsDataMode(
    import.meta.env.VITE_NOTIFICATIONS_DATA_MODE,
    import.meta.env.PROD,
  );
}

export function getNotificationRepositories(): {
  notifications: NotificationRepository;
  preferences: NotificationPreferenceRepository;
  devices: NotificationDeviceRepository;
} {
  return getNotificationsDataMode() === "supabase" ? cloud : mock;
}

export function notificationContext(): RepositoryContext {
  return {
    actorId: authService.getSession().user?.id ?? null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `notifications-${Date.now().toString(36)}`,
  };
}
