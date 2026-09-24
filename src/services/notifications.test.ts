import { describe, expect, test } from "bun:test";
import type {
  NotificationPreferenceRepository,
  NotificationPreferencesDto,
  NotificationPreferenceUpdate,
} from "@/backend/notifications/contracts";
import { NotificationError } from "@/backend/notifications/errors";
import {
  selectNotificationsDataMode,
  setMyEmailNotifications,
  withEmailChannel,
} from "./notifications";

describe("notifications data mode", () => {
  test("uses explicit modes", () => {
    expect(selectNotificationsDataMode("mock", false)).toBe("mock");
    expect(selectNotificationsDataMode("supabase", true)).toBe("supabase");
  });

  test("fails closed in production", () => {
    expect(() => selectNotificationsDataMode(undefined, true)).toThrow(NotificationError);
    expect(() => selectNotificationsDataMode("mock", true)).toThrow(NotificationError);
    expect(selectNotificationsDataMode(undefined, false)).toBe("mock");
  });
});

const stored: NotificationPreferencesDto = {
  notificationsEnabled: true,
  channels: { inApp: true, push: false, email: true },
  categories: { matchAlerts: false, breakingNews: true, fantasyDeadlines: false },
  timezone: "Africa/Casablanca",
  quietHours: { enabled: true, start: "23:00", end: "07:00" },
  digestMode: "daily",
  fantasyDeadlineOffsetMinutes: 120,
  language: "ar",
  updatedAt: "2030-01-01T12:00:00.000Z",
};

/** A repository that records what it was asked to write. */
function recording(initial: NotificationPreferencesDto) {
  let row = structuredClone(initial);
  const writes: Array<{ input: NotificationPreferenceUpdate; language: "fr" | "ar" }> = [];
  const repository: NotificationPreferenceRepository = {
    async get() {
      return structuredClone(row);
    },
    async update(input, language) {
      writes.push({ input: structuredClone(input), language });
      row = { ...structuredClone(input), language, updatedAt: row.updatedAt };
      return structuredClone(row);
    },
  };
  return {
    repository,
    writes,
    replaceRow: (next: NotificationPreferencesDto) => (row = structuredClone(next)),
  };
}

const context = { actorId: "11111111-1111-4111-8111-111111111111", requestId: "test" };

describe("e-mail notification switch", () => {
  test("withEmailChannel changes the e-mail channel and nothing else", () => {
    const update = withEmailChannel(stored, false);
    expect(update).toEqual({
      notificationsEnabled: true,
      channels: { inApp: true, push: false, email: false },
      categories: stored.categories,
      timezone: stored.timezone,
      quietHours: stored.quietHours,
      digestMode: stored.digestMode,
      fantasyDeadlineOffsetMinutes: stored.fantasyDeadlineOffsetMinutes,
    });
    expect(update).not.toHaveProperty("language");
    expect(update).not.toHaveProperty("updatedAt");
  });

  test("re-reads the stored row before writing, so a newer category is kept", async () => {
    const fake = recording(stored);
    // Saved elsewhere (the profile) after any copy a screen might have cached.
    fake.replaceRow({ ...stored, categories: { ...stored.categories, fantasyDeadlines: true } });
    const saved = await setMyEmailNotifications(false, fake.repository, context);
    expect(saved.channels.email).toBe(false);
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0]!.input.categories.fantasyDeadlines).toBe(true);
    expect(fake.writes[0]!.language).toBe("ar");
  });

  test("writes nothing when the stored value already matches", async () => {
    const fake = recording(stored);
    const saved = await setMyEmailNotifications(true, fake.repository, context);
    expect(saved.channels.email).toBe(true);
    expect(fake.writes).toHaveLength(0);
  });
});
