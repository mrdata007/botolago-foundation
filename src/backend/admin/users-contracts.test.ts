import { describe, expect, test } from "bun:test";
import {
  adminUserDetailSchema,
  adminUserPageSchema,
  analyticsOverviewSchema,
  BAN_DURATIONS,
  banDurationHours,
  UserAdminError,
  userAdminErrorCode,
} from "./users-contracts";
import { mapUserAdminError } from "./users-repository";
import { AdminError } from "./errors";

// Timestamps exactly as PostgreSQL serialises a timestamptz into jsonb.
const USER = {
  userId: "e8a00000-0000-4000-8000-000000000011",
  username: "karim_10",
  displayName: "Karim Benali",
  maskedEmail: "k***@e***.test",
  emailVerified: true,
  createdAt: "2026-09-24T12:40:12.643353+00:00",
  lastSignInAt: null,
  onboardingCompleted: true,
  deleted: false,
  deletionRequested: false,
  isStaff: false,
  activeBan: {
    banId: "e8a40000-0000-4000-8000-000000000001",
    startsAt: "2026-09-24T12:40:12.643353+00:00",
    endsAt: null,
    reason: "Abusive team names reported twice.",
  },
};

describe("user directory DTOs", () => {
  test("a page parses as the database sends it", () => {
    const page = adminUserPageSchema.parse({
      items: [USER],
      nextCursor: { createdAt: USER.createdAt, id: USER.userId },
    });
    expect(page.items[0].activeBan?.endsAt).toBeNull();
    expect(page.nextCursor?.id).toBe(USER.userId);
  });

  test("a detail carries the Fantasy summary and the ban history", () => {
    const detail = adminUserDetailSchema.parse({
      ...USER,
      fantasy: {
        teamName: "Atlas Eleven",
        status: "active",
        createdAt: USER.createdAt,
        activeLeagues: 2,
      },
      bans: [
        {
          banId: USER.activeBan.banId,
          startsAt: USER.createdAt,
          endsAt: null,
          reason: USER.activeBan.reason,
          bannedByMaskedEmail: "o***@e***.test",
          liftedAt: null,
          liftReason: null,
          liftedByMaskedEmail: null,
        },
      ],
    });
    expect(detail.bans).toHaveLength(1);
    expect(detail.fantasy?.activeLeagues).toBe(2);
  });

  test("an unmasked email is not something the schema needs, and nothing requires one", () => {
    expect(Object.keys(adminUserPageSchema.shape.items.element.shape)).not.toContain("email");
  });

  test("the analytics overview parses and rejects a malformed day", () => {
    const overview = {
      generatedAt: "2026-09-24T12:40:12.643353+00:00",
      timeZone: "Africa/Casablanca",
      users: {
        total: 12,
        newToday: 1,
        new7Days: 4,
        new30Days: 9,
        active7Days: 6,
        active30Days: 10,
        emailVerified: 11,
        onboarded: 9,
        banned: 1,
        deletionRequested: 0,
      },
      signupsByDay: [{ date: "2026-09-24", count: 1 }],
      fantasy: { teams: 7, teamsNew7Days: 2, leagues: 3, transfers7Days: 14 },
      news: { published: 20, published7Days: 3, scheduled: 1, inReview: 2, drafts: 4 },
      notifications: { devices: 5 },
    };
    expect(analyticsOverviewSchema.parse(overview).users.total).toBe(12);
    expect(() =>
      analyticsOverviewSchema.parse({
        ...overview,
        signupsByDay: [{ date: "24/09/2026", count: 1 }],
      }),
    ).toThrow();
  });
});

describe("ban durations", () => {
  test("map to the hours the database is sent", () => {
    expect(BAN_DURATIONS.map((duration) => banDurationHours(duration.key))).toEqual([
      24,
      168,
      720,
      null,
    ]);
  });
});

describe("errors", () => {
  test("a missing function is the migration not being applied yet", () => {
    const error = { code: "PGRST202", message: "Could not find the function api.admin_list_users" };
    expect(userAdminErrorCode(error)).toBe("users_admin_unavailable");
    expect(mapUserAdminError(error)).toBeInstanceOf(UserAdminError);
  });

  test("a named refusal keeps its code", () => {
    expect(userAdminErrorCode({ code: "PT409", message: "user_already_banned" })).toBe(
      "user_already_banned",
    );
    expect(userAdminErrorCode({ code: "PT409", message: "staff_account_protected" })).toBe(
      "staff_account_protected",
    );
  });

  test("an access refusal falls through to the Admin error mapping", () => {
    const mapped = mapUserAdminError({ code: "PT403", message: "recent_auth_required" });
    expect(mapped).toBeInstanceOf(AdminError);
    expect(mapped.code).toBe("recent_auth_required");
  });
});
