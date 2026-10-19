import { describe, expect, test } from "bun:test";
import {
  renderTeamReminderEmail,
  type TeamReminderEmailInput,
} from "./fantasy-team-reminder-email";

const base: TeamReminderEmailInput = {
  kind: "deadline-reminder",
  language: "fr",
  gameweek: 5,
  selectionState: "open",
  deadlineConfirmed: true,
  opensAt: "2026-10-22T08:00:00Z",
  deadlineAt: "2026-10-25T18:00:00Z",
  now: "2026-10-24T18:00:00Z",
  appUrl: "https://botolago.com",
  unsubscribeUrl: "https://botolago.com/unsubscribe?token=sample",
};

describe("manager team reminders", () => {
  test("both moments work in French and Arabic with one correct team CTA and text alternative", () => {
    for (const kind of ["selection-open", "deadline-reminder"] as const)
      for (const language of ["fr", "ar"] as const) {
        const email = renderTeamReminderEmail({ ...base, kind, language });
        expect(email.html).toContain(
          `lang="${language}" dir="${language === "ar" ? "rtl" : "ltr"}"`,
        );
        expect(email.html).toContain('alt="BotolaGO"');
        expect(email.html).toContain("/email/botolago-wordmark-light.png");
        expect(email.html.match(/href="https:\/\/botolago.com\/fantasy\/team"/g)).toHaveLength(1);
        expect(email.text).toContain("https://botolago.com/fantasy/team");
        expect(email.text).toContain(base.unsubscribeUrl);
        expect(email.html).not.toContain("<script");
        expect(email.subject).not.toContain("points");
      }
  });
  test("expired, locked, closed, unconfirmed and not-yet-open selections cannot invite edits", () => {
    const denied: Partial<TeamReminderEmailInput>[] = [
      { now: base.deadlineAt },
      { now: "2026-10-25T18:00:00.001Z" },
      { selectionState: "locked" },
      { selectionState: "closed" },
      { deadlineConfirmed: false },
      { opensAt: "2026-10-24T18:00:00.001Z" },
      { opensAt: base.deadlineAt },
    ];
    for (const kind of ["selection-open", "deadline-reminder"] as const)
      for (const changes of denied)
        expect(() => renderTeamReminderEmail({ ...base, kind, ...changes })).toThrow(
          "team_selection_not_open",
        );
    expect(() =>
      renderTeamReminderEmail({ ...base, now: "2026-10-25T17:59:59.999Z" }),
    ).not.toThrow();
  });
  test("deadline reminder is allowed at 24h, refused before, and never prints a stale 24h countdown", () => {
    expect(() => renderTeamReminderEmail(base)).not.toThrow();
    expect(() => renderTeamReminderEmail({ ...base, now: "2026-10-24T17:59:59.999Z" })).toThrow(
      "team_reminder_too_early",
    );
    const delayed = renderTeamReminderEmail({ ...base, now: "2026-10-25T17:00:00Z" });
    expect(delayed.text).toContain("18:00");
    expect(delayed.text).not.toMatch(/24\s*h/);
    expect(() =>
      renderTeamReminderEmail({ ...base, kind: "selection-open", now: base.opensAt }),
    ).not.toThrow();
  });
  test("Morocco uses the existing application clock; overseas readers see their own deadline date and offset", () => {
    const local = renderTeamReminderEmail(base);
    expect(local.text).toContain("18:00 (Heure du Maroc · UTC+0)");
    const dubai = renderTeamReminderEmail({ ...base, timeZone: "Asia/Dubai" });
    expect(dubai.text).toContain("22:00 (Asia/Dubai · GMT+4)");
    const late = renderTeamReminderEmail({
      ...base,
      timeZone: "Asia/Dubai",
      deadlineAt: "2026-10-25T23:30:00Z",
      now: "2026-10-25T22:00:00Z",
    });
    expect(late.text).toContain("lundi 26 octobre 03:30");
    expect(() => renderTeamReminderEmail({ ...base, timeZone: "Invented/Zone" })).toThrow();
  });
  test("personalization is escaped and links cannot inject credentials, scripts or external unsubscribe targets", () => {
    const email = renderTeamReminderEmail({
      ...base,
      managerName: "<img src=x onerror=alert(1)>\r\n\u202etest",
    });
    expect(email.html).toContain("&lt;img");
    expect(email.html).not.toContain("<img src=x");
    expect(email.text).not.toContain("\u202e");
    expect(email.subject).not.toMatch(/[\r\n]/);
    for (const appUrl of [
      "javascript:alert(1)",
      "http://botolago.com",
      "https://user:pass@botolago.com",
      "https://botolago.com/path",
    ])
      expect(() => renderTeamReminderEmail({ ...base, appUrl })).toThrow();
    for (const unsubscribeUrl of [
      "https://other.example/unsubscribe?token=x",
      "https://botolago.com/unsubscribe",
      "https://user:pass@botolago.com/unsubscribe?token=x",
    ])
      expect(() => renderTeamReminderEmail({ ...base, unsubscribeUrl })).toThrow(
        "team_reminder_invalid_unsubscribe",
      );
  });
  test("malformed times, weeks, languages and kinds are refused rather than displayed", () => {
    for (const value of ["not-a-date", "2026-10-25T18:00:00", "2026-99-25T18:00:00Z"])
      for (const field of ["opensAt", "deadlineAt", "now"] as const)
        expect(() => renderTeamReminderEmail({ ...base, [field]: value })).toThrow(
          "team_reminder_invalid_instant",
        );
    for (const gameweek of [0, -1, 1.5, NaN, Infinity])
      expect(() => renderTeamReminderEmail({ ...base, gameweek })).toThrow(
        "team_reminder_invalid_gameweek",
      );
    expect(() => renderTeamReminderEmail({ ...base, language: "en" as "fr" })).toThrow(
      "team_reminder_invalid_language",
    );
    expect(() =>
      renderTeamReminderEmail({ ...base, kind: "finished" as "selection-open" }),
    ).toThrow("team_reminder_invalid_kind");
  });
});
