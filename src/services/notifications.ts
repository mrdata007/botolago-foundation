import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  NotificationDeviceRepository,
  NotificationEmailUnsubscribeRepository,
  NotificationEmailUnsubscribeOutcome,
  NotificationPreferenceRepository,
  NotificationPreferencesDto,
  NotificationPreferenceUpdate,
  NotificationRepository,
} from "@/backend/notifications/contracts";
import { NotificationError } from "@/backend/notifications/errors";
import {
  MockNotificationDeviceRepository,
  MockNotificationEmailUnsubscribeRepository,
  MockNotificationPreferenceRepository,
  MockNotificationRepository,
} from "@/backend/notifications/mock-repositories";
import {
  SupabaseNotificationDeviceRepository,
  SupabaseNotificationEmailUnsubscribeRepository,
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
  emailUnsubscribe: new MockNotificationEmailUnsubscribeRepository(),
};
const cloud = {
  notifications: new SupabaseNotificationRepository(),
  preferences: new SupabaseNotificationPreferenceRepository(),
  devices: new SupabaseNotificationDeviceRepository(),
  emailUnsubscribe: new SupabaseNotificationEmailUnsubscribeRepository(),
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
  emailUnsubscribe: NotificationEmailUnsubscribeRepository;
} {
  return getNotificationsDataMode() === "supabase" ? cloud : mock;
}

export function notificationContext(): RepositoryContext {
  return {
    actorId: authService.getSession().user?.id ?? null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `notifications-${Date.now().toString(36)}`,
  };
}

/** The signed-in account's notification preferences. */
export function loadMyNotificationPreferences(): Promise<NotificationPreferencesDto> {
  return getNotificationRepositories().preferences.get(notificationContext());
}

/**
 * `current` with only the e-mail channel changed, in the full-replacement
 * shape `update_my_notification_preferences` takes.
 */
export function withEmailChannel(
  current: NotificationPreferencesDto,
  email: boolean,
): NotificationPreferenceUpdate {
  return {
    notificationsEnabled: current.notificationsEnabled,
    channels: { ...current.channels, email },
    categories: { ...current.categories },
    timezone: current.timezone,
    quietHours: { ...current.quietHours },
    digestMode: current.digestMode,
    fantasyDeadlineOffsetMinutes: current.fantasyDeadlineOffsetMinutes,
  };
}

/**
 * Turns notification e-mails on or off for the signed-in account.
 *
 * The update RPC replaces every preference at once, so this reads the stored
 * row immediately before writing rather than trusting a cached copy: the
 * Fantasy reminder and the three category switches are saved through the
 * profile, and a stale copy would quietly put them back.
 */
export async function setMyEmailNotifications(
  enabled: boolean,
  repository: NotificationPreferenceRepository = getNotificationRepositories().preferences,
  context: RepositoryContext = notificationContext(),
): Promise<NotificationPreferencesDto> {
  const current = await repository.get(context);
  if (current.channels.email === enabled) return current;
  return repository.update(withEmailChannel(current, enabled), current.language, context);
}

/** The one-click unsubscribe link from a notification e-mail. Works signed out. */
export async function unsubscribeFromNotificationEmails(
  token: string,
): Promise<NotificationEmailUnsubscribeOutcome> {
  return getNotificationRepositories().emailUnsubscribe.unsubscribe(token);
}
