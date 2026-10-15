import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import type { NotificationPreferencesDto } from "@/backend/notifications/contracts";
import { dictionaries } from "@/i18n/dictionaries";

import { emailRoute, reminderToast } from "./delivery-promise";

// PRO-04: a reminder is promised only when this account's e-mail route is open.

const prefs = (over: {
  enabled?: boolean;
  email?: boolean;
  matchAlerts?: boolean;
  fantasyDeadlines?: boolean;
}): NotificationPreferencesDto => ({
  notificationsEnabled: over.enabled ?? true,
  channels: { inApp: true, push: false, email: over.email ?? true },
  categories: {
    matchAlerts: over.matchAlerts ?? true,
    breakingNews: true,
    fantasyDeadlines: over.fantasyDeadlines ?? true,
  },
  timezone: "Africa/Casablanca",
  quietHours: { enabled: false, start: "23:00", end: "07:00" },
  digestMode: "immediate",
  fantasyDeadlineOffsetMinutes: 120,
  language: "fr",
  updatedAt: "2030-01-01T12:00:00.000Z",
});

describe("emailRoute", () => {
  test("open when notifications, the e-mail channel and the topic are on and the address is confirmed", () => {
    expect(emailRoute(prefs({}), true, "matchAlerts")).toBe("available");
    expect(emailRoute(prefs({}), true, "fantasyDeadlines")).toBe("available");
  });

  test("unknown while the preferences are not loaded or failed to load", () => {
    expect(emailRoute(undefined, true, "matchAlerts")).toBe("unknown");
    expect(emailRoute(null, true, "matchAlerts")).toBe("unknown");
  });

  test("only the e-mail channel being off is the one the reader can fix from the reminder", () => {
    expect(emailRoute(prefs({ email: false }), true, "matchAlerts")).toBe("email_off");
  });

  test("everything else that stops the e-mail is closed, not fixable from the reminder", () => {
    expect(emailRoute(prefs({ enabled: false }), true, "matchAlerts")).toBe("closed");
    expect(emailRoute(prefs({ matchAlerts: false }), true, "matchAlerts")).toBe("closed");
    expect(emailRoute(prefs({ fantasyDeadlines: false }), true, "fantasyDeadlines")).toBe("closed");
    expect(emailRoute(prefs({}), false, "matchAlerts")).toBe("closed");
    // The channel being off does not hide an address that still has to be confirmed.
    expect(emailRoute(prefs({ email: false }), false, "matchAlerts")).toBe("closed");
  });
});

describe("reminderToast: what a saved reminder says", () => {
  test("it promises only on an open route", () => {
    expect(reminderToast("available")).toBe("reminders.toast.on");
  });

  test("with the e-mail channel off it offers to turn it on", () => {
    expect(reminderToast("email_off")).toBe("reminders.toast.needs_email");
  });

  test("when the route is closed or unknown it says only that the reminder is saved", () => {
    expect(reminderToast("closed")).toBe("reminders.toast.saved");
    expect(reminderToast("unknown")).toBe("reminders.toast.saved");
  });
});

describe("the wiring", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  test("the bell no longer promises when the preferences could not be read", () => {
    const bell = read("src/components/common/MatchReminderBell.tsx");
    // The old branch `if (preferences && !preferences.channels.email) ... else toast.success(on)`.
    expect(bell).not.toMatch(/preferences\s*&&\s*!preferences\.channels\.email/);
    expect(bell).toMatch(
      /emailRoute\(\s*preferences,\s*auth\?\.user\?\.verified,\s*"matchAlerts"\s*\)/,
    );
    expect(bell).toMatch(/reminderToast\(route\)/);
  });

  test("the Fantasy hub states the e-mail setting only on an open route", () => {
    const hub = read("src/components/fantasy/FantasyHubPersonal.tsx");
    expect(hub).toMatch(
      /emailRoute\(\s*preferences,\s*user\?\.verified,\s*"fantasyDeadlines"\s*\)/,
    );
    expect(hub).toMatch(
      /route === "available"\s*\?\s*t\("fpl\.notifications_body"\)\s*:\s*t\("fpl\.notifications_body_neutral"\)/,
    );
  });
});

describe("the words", () => {
  const keys = [
    "reminders.toast.saved",
    "reminders.toast.on",
    "fpl.notifications_body",
    "fpl.notifications_body_neutral",
    "reminders.sign_in_reason",
    "notifications.empty_body",
    "notifications.signin_body",
    "pepites.email.on_toast",
  ] as const;

  test("exist in French and Arabic, written separately", () => {
    for (const key of keys) {
      expect(dictionaries.fr[key]).toBeTruthy();
      expect(dictionaries.ar[key]).toBeTruthy();
      expect(dictionaries.ar[key]).not.toBe(dictionaries.fr[key]);
    }
  });

  test("no text here promises that a message will arrive, not even on an open route", () => {
    // The app sees the account's settings, not whether sending is live (EMAIL_NOTIFICATIONS.md,
    // "Known gap"), so the open-route copy states the setting.
    const frDelivery = /prévenu|serez|recev|reçoi|reçu|arriv|apparaîtr|rappelé/;
    const arDelivery = /سنُنبّهك|سنُ|تصلك|ستظهر|ستصلك|ستتلقى|تذكيرك|ستستلم|استلم/;
    for (const key of keys) {
      expect({ key, fr: frDelivery.test(dictionaries.fr[key]) }).toEqual({ key, fr: false });
      expect({ key, ar: arDelivery.test(dictionaries.ar[key]) }).toEqual({ key, ar: false });
    }
  });

  test("the sign-in prompt does not repeat the title above it", () => {
    expect(dictionaries.fr["notifications.signin_body"]).not.toContain("Connectez-vous");
    expect(dictionaries.ar["notifications.signin_body"]).not.toContain("سجّل الدخول");
    expect(dictionaries.fr["reminders.sign_in_reason"].match(/ pour /g)?.length ?? 0).toBeLessThan(
      2,
    );
  });
});
