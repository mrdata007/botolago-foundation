import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { getNotificationsApi } from "@/integrations/supabase/v2-client";
import {
  notificationDeviceSummarySchema,
  notificationPageSchema,
  notificationPreferencesSchema,
  type NotificationCategory,
  type NotificationDeviceRegistrationInput,
  type NotificationDeviceRepository,
  type NotificationDeviceSummaryDto,
  type NotificationListInput,
  type NotificationPageDto,
  type NotificationPreferenceRepository,
  type NotificationPreferencesDto,
  type NotificationPreferenceUpdate,
  type NotificationRepository,
} from "./contracts";
import { mapNotificationError, NotificationError } from "./errors";

function requireActor(context: RepositoryContext): void {
  if (!context.actorId)
    throw new NotificationError("notification_access_denied", "Authentication is required.");
}

function requireUuid(value: string): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new NotificationError("notification_not_found", "Invalid identifier.");
  return parsed.data;
}

function throwIfError(error: PostgrestError | null): void {
  if (error) throw mapNotificationError(error);
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new NotificationError(
      "data_unavailable",
      "The Notifications API returned an invalid DTO.",
      parsed.error,
    );
  return parsed.data;
}

function decodeCursor(value: string | null | undefined): { createdAt: string; id: string } | null {
  if (!value) return null;
  try {
    return z
      .object({ createdAt: z.string().datetime({ offset: true }), id: z.string().uuid() })
      .parse(JSON.parse(decodeURIComponent(value)));
  } catch (error) {
    throw new NotificationError("data_unavailable", "Invalid notification cursor.", error);
  }
}

export function encodeNotificationCursor(cursor: NotificationPageDto["nextCursor"]): string | null {
  return cursor ? encodeURIComponent(JSON.stringify(cursor)) : null;
}

export class SupabaseNotificationRepository implements NotificationRepository {
  async list(
    input: NotificationListInput,
    context: RepositoryContext,
  ): Promise<NotificationPageDto> {
    requireActor(context);
    const cursor = decodeCursor(input.cursor);
    const { data, error } = await getNotificationsApi().rpc("list_my_notifications", {
      p_category: input.category ?? undefined,
      p_before_created_at: cursor?.createdAt,
      p_before_id: cursor?.id,
      p_limit: input.limit ?? 20,
    });
    throwIfError(error);
    return parse(notificationPageSchema, data);
  }

  async unreadCount(
    category: NotificationCategory | null,
    context: RepositoryContext,
  ): Promise<number> {
    requireActor(context);
    const { data, error } = await getNotificationsApi().rpc("my_notification_unread_count", {
      p_category: category ?? undefined,
    });
    throwIfError(error);
    return z.number().int().nonnegative().parse(data);
  }

  async markRead(id: string, read: boolean, context: RepositoryContext): Promise<void> {
    requireActor(context);
    const { error } = await getNotificationsApi().rpc("mark_my_notification_read", {
      p_notification_id: requireUuid(id),
      p_read: read,
    });
    throwIfError(error);
  }

  async markAllRead(
    category: NotificationCategory | null,
    context: RepositoryContext,
  ): Promise<number> {
    requireActor(context);
    const { data, error } = await getNotificationsApi().rpc("mark_all_my_notifications_read", {
      p_category: category ?? undefined,
    });
    throwIfError(error);
    return z.number().int().nonnegative().parse(data);
  }

  async dismiss(id: string, archive: boolean, context: RepositoryContext): Promise<void> {
    requireActor(context);
    const { error } = await getNotificationsApi().rpc("dismiss_my_notification", {
      p_notification_id: requireUuid(id),
      p_archive: archive,
    });
    throwIfError(error);
  }
}

export class SupabaseNotificationPreferenceRepository implements NotificationPreferenceRepository {
  async get(context: RepositoryContext): Promise<NotificationPreferencesDto> {
    requireActor(context);
    const { data, error } = await getNotificationsApi().rpc("get_my_notification_preferences");
    throwIfError(error);
    return parse(notificationPreferencesSchema, data);
  }

  async update(
    input: NotificationPreferenceUpdate,
    _language: "fr" | "ar",
    context: RepositoryContext,
  ): Promise<NotificationPreferencesDto> {
    requireActor(context);
    const { data, error } = await getNotificationsApi().rpc("update_my_notification_preferences", {
      p_notifications_enabled: input.notificationsEnabled,
      p_in_app_enabled: input.channels.inApp,
      p_push_enabled: input.channels.push,
      p_email_enabled: input.channels.email,
      p_match_alerts: input.categories.matchAlerts,
      p_breaking_news: input.categories.breakingNews,
      p_fantasy_deadlines: input.categories.fantasyDeadlines,
      p_timezone: input.timezone,
      p_quiet_hours_enabled: input.quietHours.enabled,
      p_quiet_hours_start: input.quietHours.start ?? undefined,
      p_quiet_hours_end: input.quietHours.end ?? undefined,
      p_digest_mode: input.digestMode,
      p_fantasy_deadline_offset_minutes: input.fantasyDeadlineOffsetMinutes,
    });
    throwIfError(error);
    return parse(notificationPreferencesSchema, data);
  }
}

export class SupabaseNotificationDeviceRepository implements NotificationDeviceRepository {
  async register(
    input: NotificationDeviceRegistrationInput,
    context: RepositoryContext,
  ): Promise<NotificationDeviceSummaryDto> {
    requireActor(context);
    const { data, error } = await getNotificationsApi().rpc("register_my_notification_device", {
      p_device_id: input.deviceId,
      p_platform: input.platform,
      p_push_provider: input.pushProvider,
      p_destination: input.destination,
      p_locale: input.locale,
      p_timezone: input.timezone,
      p_app_version: input.appVersion ?? undefined,
    });
    throwIfError(error);
    return parse(notificationDeviceSummarySchema, data);
  }

  async list(context: RepositoryContext): Promise<readonly NotificationDeviceSummaryDto[]> {
    requireActor(context);
    const { data, error } = await getNotificationsApi().rpc("list_my_notification_devices");
    throwIfError(error);
    return parse(z.array(notificationDeviceSummarySchema), data);
  }

  async disable(id: string, context: RepositoryContext): Promise<void> {
    requireActor(context);
    const { error } = await getNotificationsApi().rpc("disable_my_notification_device", {
      p_device_id: requireUuid(id),
    });
    throwIfError(error);
  }

  async unregister(id: string, context: RepositoryContext): Promise<void> {
    requireActor(context);
    const { error } = await getNotificationsApi().rpc("unregister_my_notification_device", {
      p_device_id: requireUuid(id),
    });
    throwIfError(error);
  }
}
