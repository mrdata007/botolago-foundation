import { describe, expect, test } from "bun:test";

import { NOTIFICATION_BADGE, notificationKind } from "./notification-kind";

describe("notificationKind", () => {
  test("reads the server's event types", () => {
    expect(notificationKind("goal", "football")).toBe("goal");
    expect(notificationKind("goal_cancelled", "football")).toBe("goal_cancelled");
    expect(notificationKind("match_starting", "football")).toBe("kickoff");
    expect(notificationKind("match_started", "football")).toBe("kickoff");
    expect(notificationKind("match_postponed", "football")).toBe("match_off");
    expect(notificationKind("matchday_results", "football")).toBe("results");
    expect(notificationKind("followed_team_result", "football")).toBe("results");
    expect(notificationKind("deadline_24h", "fantasy")).toBe("deadline");
    expect(notificationKind("rival_lead_change", "fantasy")).toBe("rival");
    expect(notificationKind("manager_card_ovr_change", "fantasy")).toBe("rating");
    expect(notificationKind("gameweek_finalized", "fantasy")).toBe("fantasy");
    expect(notificationKind("breaking_news", "news")).toBe("news");
  });

  test("falls back on the category for an unknown type", () => {
    expect(notificationKind("something_new", "football")).toBe("football");
    expect(notificationKind("something_new", "security")).toBe("account");
    expect(notificationKind("something_new", "system")).toBe("system");
  });

  test("every kind has a badge", () => {
    for (const badge of Object.values(NOTIFICATION_BADGE)) {
      expect(badge.icon).toBeDefined();
      expect(badge.className).toContain("text-[color:var(--ui-");
    }
  });
});
