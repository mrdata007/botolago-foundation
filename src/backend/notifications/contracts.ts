import { z } from "zod";
import type { CursorPageRequest, RepositoryContext } from "@/backend/contracts/repository";

export const notificationLanguageSchema = z.enum(["fr", "ar"]);
export const notificationCategorySchema = z.enum([
  "account",
  "security",
  "football",
  "fantasy",
  "news",
  "system",
]);
export const notificationPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export const notificationChannelSchema = z.enum(["in_app", "push", "email"]);
export const notificationDeepLinkTargetSchema = z.enum([
  "none",
  "match_detail",
  "article",
  "fantasy_team",
  "fantasy_points",
  "fantasy_transfers",
  "profile",
  "settings",
  "security_action",
]);

export const notificationDeepLinkSchema = z
  .object({
    target: notificationDeepLinkTargetSchema,
    entityId: z.string().uuid().nullable(),
  })
  .superRefine((value, context) => {
    const requiresEntity = value.target === "match_detail" || value.target === "article";
    if (requiresEntity !== (value.entityId !== null)) {
      context.addIssue({ code: "custom", message: "Invalid notification deep link." });
    }
  });

export const notificationCardSchema = z.object({
  id: z.string().uuid(),
  type: z.string().regex(/^[a-z][a-z0-9_]{2,79}$/),
  category: notificationCategorySchema,
  priority: notificationPrioritySchema,
  language: notificationLanguageSchema,
  direction: z.enum(["ltr", "rtl"]),
  title: z.string().min(1).max(240),
  body: z.string().min(1).max(4000),
  deepLink: notificationDeepLinkSchema,
  availableAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  readAt: z.string().datetime({ offset: true }).nullable(),
  dismissedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
});

export const notificationCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

export const notificationPageSchema = z.object({
  items: z.array(notificationCardSchema),
  nextCursor: notificationCursorSchema.nullable(),
});

export const quietHoursSchema = z
  .object({
    enabled: z.boolean(),
    start: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable(),
    end: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable(),
  })
  .superRefine((value, context) => {
    const valid = value.enabled
      ? value.start !== null && value.end !== null && value.start !== value.end
      : value.start === null && value.end === null;
    if (!valid) context.addIssue({ code: "custom", message: "Invalid quiet hours." });
  });

export const notificationPreferencesSchema = z.object({
  notificationsEnabled: z.boolean(),
  channels: z.object({ inApp: z.boolean(), push: z.boolean(), email: z.boolean() }),
  categories: z.object({
    matchAlerts: z.boolean(),
    breakingNews: z.boolean(),
    fantasyDeadlines: z.boolean(),
  }),
  timezone: z.string().min(1).max(100),
  quietHours: quietHoursSchema,
  digestMode: z.enum(["immediate", "daily", "weekly"]),
  fantasyDeadlineOffsetMinutes: z.number().int().min(15).max(10080),
  language: notificationLanguageSchema,
  updatedAt: z.string().datetime({ offset: true }),
});

export const notificationDeviceSummarySchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().min(8).max(128),
  platform: z.enum(["web", "ios", "android"]),
  pushProvider: z.enum(["fixture", "web_push", "fcm", "apns", "expo"]),
  appVersion: z.string().nullable().optional(),
  locale: notificationLanguageSchema,
  timezone: z.string().min(1).max(100),
  enabled: z.boolean(),
  lastSeenAt: z.string().datetime({ offset: true }).optional(),
  invalidatedAt: z.string().datetime({ offset: true }).nullable().optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
});

export const notificationEventTypeSchema = z.enum([
  "email_verified",
  "password_changed",
  "account_deletion_requested",
  "account_deletion_cancelled",
  "new_session_detected",
  "sensitive_profile_change",
  "match_starting",
  "match_started",
  "goal",
  "half_time",
  "full_time",
  "lineup_available",
  "match_postponed",
  "match_cancelled",
  "followed_team_result",
  "deadline_24h",
  "deadline_1h",
  "team_incomplete",
  "transfer_confirmation",
  "chip_activated",
  "gameweek_finalized",
  "league_position_changed",
  "breaking_news",
  "followed_team_article",
  "followed_competition_article",
  "editorial_digest",
  "system_announcement",
]);

export const notificationEventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: notificationEventTypeSchema,
  sourceDomain: z.enum(["identity", "football", "news", "fantasy", "system"]),
  sourceEntityId: z.string().uuid().nullable(),
  targetUserId: z.string().uuid().nullable(),
  occurredAt: z.string().datetime({ offset: true }),
  schemaVersion: z.literal(1),
  deduplicationKey: z.string().trim().min(8).max(200),
  correlationId: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()),
});

/**
 * The one-click unsubscribe link carried by every notification e-mail.
 *
 * `api.unsubscribe_notification_email(p_token)` is callable signed out: the
 * token alone names the account, and the function only ever turns e-mail OFF.
 * A token is exactly 32 characters of base64url; anything else is answered
 * `invalid` without a round trip.
 */
export const notificationEmailUnsubscribeTokenSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{32}$/);

/** Whether `token` has the shape of an unsubscribe token (not whether it is live). */
export function isNotificationEmailUnsubscribeToken(token: string): boolean {
  return notificationEmailUnsubscribeTokenSchema.safeParse(token).success;
}
export const notificationEmailUnsubscribeStatusSchema = z.enum([
  "unsubscribed",
  "already_unsubscribed",
  "invalid",
]);
/**
 * A Pépites email's token turns off only the Pépites weekly email; the reply
 * then says so with `topic`. Without it, the token turned off all product
 * email.
 */
export const notificationEmailUnsubscribeTopicSchema = z.literal("pepites_weekly");
export const notificationEmailUnsubscribeResultSchema = z.object({
  status: notificationEmailUnsubscribeStatusSchema,
  topic: notificationEmailUnsubscribeTopicSchema.optional(),
});

export type NotificationCategory = z.infer<typeof notificationCategorySchema>;
export type NotificationEmailUnsubscribeStatus = z.infer<
  typeof notificationEmailUnsubscribeStatusSchema
>;
export type NotificationEmailUnsubscribeTopic = z.infer<
  typeof notificationEmailUnsubscribeTopicSchema
>;
/** What the link did: its status, and the one topic it turned off, if any. */
export interface NotificationEmailUnsubscribeOutcome {
  readonly status: NotificationEmailUnsubscribeStatus;
  readonly topic: NotificationEmailUnsubscribeTopic | null;
}
export type NotificationCardDto = z.infer<typeof notificationCardSchema>;
export type NotificationPageDto = z.infer<typeof notificationPageSchema>;
export type NotificationPreferencesDto = z.infer<typeof notificationPreferencesSchema>;
export type NotificationDeviceSummaryDto = z.infer<typeof notificationDeviceSummarySchema>;
export type NotificationEventEnvelope = z.infer<typeof notificationEventEnvelopeSchema>;

export interface NotificationListInput extends CursorPageRequest {
  readonly category?: NotificationCategory | null;
}

export type NotificationPreferenceUpdate = Omit<
  NotificationPreferencesDto,
  "language" | "updatedAt"
>;

export interface NotificationDeviceRegistrationInput {
  readonly deviceId: string;
  readonly platform: "web" | "ios" | "android";
  readonly pushProvider: "fixture" | "web_push" | "fcm" | "apns" | "expo";
  readonly destination: string;
  readonly locale: "fr" | "ar";
  readonly timezone: string;
  readonly appVersion?: string | null;
}

export interface NotificationRepository {
  list(input: NotificationListInput, context: RepositoryContext): Promise<NotificationPageDto>;
  unreadCount(category: NotificationCategory | null, context: RepositoryContext): Promise<number>;
  markRead(id: string, read: boolean, context: RepositoryContext): Promise<void>;
  markAllRead(category: NotificationCategory | null, context: RepositoryContext): Promise<number>;
  dismiss(id: string, archive: boolean, context: RepositoryContext): Promise<void>;
}

export interface NotificationPreferenceRepository {
  get(context: RepositoryContext): Promise<NotificationPreferencesDto>;
  update(
    input: NotificationPreferenceUpdate,
    language: "fr" | "ar",
    context: RepositoryContext,
  ): Promise<NotificationPreferencesDto>;
}

/** No actor: the page that calls this is opened from an e-mail, usually signed out. */
export interface NotificationEmailUnsubscribeRepository {
  unsubscribe(token: string): Promise<NotificationEmailUnsubscribeOutcome>;
}

export interface NotificationDeviceRepository {
  register(
    input: NotificationDeviceRegistrationInput,
    context: RepositoryContext,
  ): Promise<NotificationDeviceSummaryDto>;
  list(context: RepositoryContext): Promise<readonly NotificationDeviceSummaryDto[]>;
  disable(id: string, context: RepositoryContext): Promise<void>;
  unregister(id: string, context: RepositoryContext): Promise<void>;
}
