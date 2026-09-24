import { z } from "zod";
import type { RepositoryContext } from "@/backend/contracts/repository";

/**
 * The user directory, bans and the analytics overview
 * (`20260924160000_admin_user_moderation_and_analytics.sql`).
 *
 * Every DTO here is what a database function returns; nothing in this file is
 * an authority. Emails only ever arrive masked.
 */

const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();

export const adminUserActiveBanSchema = z.object({
  banId: z.string().uuid(),
  startsAt: timestamp,
  /** Null: until lifted. */
  endsAt: timestamp.nullable(),
  reason: z.string(),
});

export const adminUserSchema = z.object({
  userId: z.string().uuid(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  maskedEmail: z.string().nullable(),
  emailVerified: z.boolean(),
  createdAt: timestamp,
  lastSignInAt: timestamp.nullable(),
  onboardingCompleted: z.boolean(),
  deleted: z.boolean(),
  deletionRequested: z.boolean(),
  isStaff: z.boolean(),
  activeBan: adminUserActiveBanSchema.nullable(),
});

export const adminUserCursorSchema = z.object({
  createdAt: timestamp,
  id: z.string().uuid(),
});

export const adminUserPageSchema = z.object({
  items: z.array(adminUserSchema),
  nextCursor: adminUserCursorSchema.nullable(),
});

export const adminUserBanRecordSchema = z.object({
  banId: z.string().uuid(),
  startsAt: timestamp,
  endsAt: timestamp.nullable(),
  reason: z.string(),
  bannedByMaskedEmail: z.string().nullable(),
  liftedAt: timestamp.nullable(),
  liftReason: z.string().nullable(),
  liftedByMaskedEmail: z.string().nullable(),
});

export const adminUserDetailSchema = adminUserSchema.extend({
  fantasy: z
    .object({
      teamName: z.string(),
      status: z.string(),
      createdAt: timestamp,
      activeLeagues: count,
    })
    .nullable(),
  bans: z.array(adminUserBanRecordSchema),
});

export const analyticsOverviewSchema = z.object({
  generatedAt: timestamp,
  timeZone: z.string(),
  users: z.object({
    total: count,
    newToday: count,
    new7Days: count,
    new30Days: count,
    active7Days: count,
    active30Days: count,
    emailVerified: count,
    onboarded: count,
    banned: count,
    deletionRequested: count,
  }),
  signupsByDay: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      count,
    }),
  ),
  fantasy: z.object({
    teams: count,
    teamsNew7Days: count,
    leagues: count,
    transfers7Days: count,
  }),
  news: z.object({
    published: count,
    published7Days: count,
    scheduled: count,
    inReview: count,
    drafts: count,
  }),
  notifications: z.object({
    devices: count,
  }),
});

export type AdminUserDto = z.infer<typeof adminUserSchema>;
export type AdminUserCursor = z.infer<typeof adminUserCursorSchema>;
export type AdminUserPageDto = z.infer<typeof adminUserPageSchema>;
export type AdminUserBanRecordDto = z.infer<typeof adminUserBanRecordSchema>;
export type AdminUserDetailDto = z.infer<typeof adminUserDetailSchema>;
export type AnalyticsOverviewDto = z.infer<typeof analyticsOverviewSchema>;

export const ADMIN_USER_STATUSES = ["active", "banned", "deletion_requested"] as const;
export type AdminUserStatus = (typeof ADMIN_USER_STATUSES)[number];

export const ADMIN_USERS_PAGE_SIZE = 30;

/** The server's motive floor, mirrored only to explain a disabled button. */
export const USER_MODERATION_REASON_MIN = 8;

/**
 * The ban lengths offered, in hours. `null` bans until someone lifts it. The
 * database accepts any whole number of hours from 1 to 87 600 (ten years).
 */
export const BAN_DURATIONS = [
  { key: "day", hours: 24 },
  { key: "week", hours: 168 },
  { key: "month", hours: 720 },
  { key: "indefinite", hours: null },
] as const;
export type BanDurationKey = (typeof BAN_DURATIONS)[number]["key"];

export function banDurationHours(key: BanDurationKey): number | null {
  return BAN_DURATIONS.find((duration) => duration.key === key)?.hours ?? null;
}

export const USER_ADMIN_ERROR_CODES = [
  "moderation_reason_invalid",
  "ban_duration_invalid",
  "user_not_found",
  "self_moderation_forbidden",
  "staff_account_protected",
  "user_already_banned",
  "user_not_banned",
  "validation_failed",
  // Not a database refusal: the functions this console calls are missing,
  // because the migration has not been applied to this database yet.
  "users_admin_unavailable",
] as const;
export type UserAdminErrorCode = (typeof USER_ADMIN_ERROR_CODES)[number];

export class UserAdminError extends Error {
  constructor(
    readonly code: UserAdminErrorCode,
    readonly cause?: unknown,
  ) {
    super(code, { cause });
    this.name = "UserAdminError";
  }
}

/**
 * The refusal a PostgREST error names, or null when it names none of ours.
 *
 * PGRST202 is PostgREST's "no such function": the page was published before
 * the migration reached this database. That is reported as its own state
 * rather than as an access problem, so the page can say what is missing.
 */
export function userAdminErrorCode(error: unknown): UserAdminErrorCode | null {
  if (error instanceof UserAdminError) return error.code;
  const source = error as { message?: unknown; code?: unknown } | null;
  if (source?.code === "PGRST202") return "users_admin_unavailable";
  const message = typeof source?.message === "string" ? source.message.trim() : "";
  return (USER_ADMIN_ERROR_CODES as readonly string[]).includes(message)
    ? (message as UserAdminErrorCode)
    : null;
}

export interface AdminUserFilters {
  readonly query: string | null;
  readonly status: AdminUserStatus | null;
}

export interface UsersAdminRepository {
  listUsers(
    filters: AdminUserFilters,
    cursor: AdminUserCursor | null,
    limit: number,
    context: RepositoryContext,
  ): Promise<AdminUserPageDto>;
  getUser(userId: string, context: RepositoryContext): Promise<AdminUserDetailDto>;
  banUser(
    userId: string,
    reason: string,
    durationHours: number | null,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<AdminUserDto>;
  unbanUser(
    userId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<AdminUserDto>;
  getAnalyticsOverview(context: RepositoryContext): Promise<AnalyticsOverviewDto>;
}
