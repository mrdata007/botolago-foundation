import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  NotificationCategory,
  NotificationDeviceRegistrationInput,
  NotificationDeviceRepository,
  NotificationPageDto,
  NotificationEmailUnsubscribeRepository,
  NotificationEmailUnsubscribeOutcome,
  NotificationPreferenceRepository,
  NotificationPreferencesDto,
  NotificationPreferenceUpdate,
  NotificationRepository,
  NotificationSubscriptionRepository,
} from "@/backend/notifications/contracts";
import { NotificationError } from "@/backend/notifications/errors";
import {
  MockNotificationDeviceRepository,
  MockNotificationEmailUnsubscribeRepository,
  MockNotificationPreferenceRepository,
  MockNotificationRepository,
  MockNotificationSubscriptionRepository,
} from "@/backend/notifications/mock-repositories";
import {
  SupabaseNotificationDeviceRepository,
  SupabaseNotificationEmailUnsubscribeRepository,
  SupabaseNotificationPreferenceRepository,
  SupabaseNotificationRepository,
  SupabaseNotificationSubscriptionRepository,
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
  subscriptions: new MockNotificationSubscriptionRepository(),
};
const cloud = {
  notifications: new SupabaseNotificationRepository(),
  preferences: new SupabaseNotificationPreferenceRepository(),
  devices: new SupabaseNotificationDeviceRepository(),
  emailUnsubscribe: new SupabaseNotificationEmailUnsubscribeRepository(),
  subscriptions: new SupabaseNotificationSubscriptionRepository(),
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
  subscriptions: NotificationSubscriptionRepository;
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

/** `current` with only the phone (push) channel changed. */
export function withPushChannel(
  current: NotificationPreferencesDto,
  push: boolean,
): NotificationPreferenceUpdate {
  return {
    ...withEmailChannel(current, current.channels.email),
    channels: { ...current.channels, push },
  };
}

/** Turns phone alerts on or off for the signed-in account (reads the stored row first). */
export async function setMyPushNotifications(
  enabled: boolean,
  repository: NotificationPreferenceRepository = getNotificationRepositories().preferences,
  context: RepositoryContext = notificationContext(),
): Promise<NotificationPreferencesDto> {
  const current = await repository.get(context);
  if (current.channels.push === enabled) return current;
  return repository.update(withPushChannel(current, enabled), current.language, context);
}

/** Saves this browser's push address as one of the account's devices. */
export function registerMyPushDevice(input: NotificationDeviceRegistrationInput) {
  return getNotificationRepositories().devices.register(input, notificationContext());
}

export function listMyDevices() {
  return getNotificationRepositories().devices.list(notificationContext());
}

export function unregisterMyDevice(id: string) {
  return getNotificationRepositories().devices.unregister(id, notificationContext());
}

/** The one-click unsubscribe link from a notification e-mail. Works signed out. */
export async function unsubscribeFromNotificationEmails(
  token: string,
): Promise<NotificationEmailUnsubscribeOutcome> {
  return getNotificationRepositories().emailUnsubscribe.unsubscribe(token);
}

/** One page of the signed-in account's notifications, newest first. */
export function loadMyNotifications(
  category: NotificationCategory | null,
  cursor?: string | null,
): Promise<NotificationPageDto> {
  return getNotificationRepositories().notifications.list(
    { category, cursor: cursor ?? undefined, limit: 20 },
    notificationContext(),
  );
}

/** How many of the signed-in account's notifications are unread. */
export function loadMyUnreadNotificationCount(): Promise<number> {
  return getNotificationRepositories().notifications.unreadCount(null, notificationContext());
}

export function markMyNotificationRead(id: string, read = true): Promise<void> {
  return getNotificationRepositories().notifications.markRead(id, read, notificationContext());
}

export function markAllMyNotificationsRead(): Promise<number> {
  return getNotificationRepositories().notifications.markAllRead(null, notificationContext());
}

/** Removes a notification from the inbox (it is archived, not deleted). */
export function dismissMyNotification(id: string): Promise<void> {
  return getNotificationRepositories().notifications.dismiss(id, true, notificationContext());
}

/** Turns the reminder for one match on or off for the signed-in account. */
export function setMyMatchReminder(fixtureId: string, enabled: boolean): Promise<void> {
  return getNotificationRepositories().subscriptions.setMatchReminder(
    fixtureId,
    enabled,
    notificationContext(),
  );
}

/** The matches the signed-in account has a reminder on. */
export function loadMyMatchReminders(): Promise<readonly string[]> {
  return getNotificationRepositories().subscriptions.listMatchReminders(notificationContext());
}
