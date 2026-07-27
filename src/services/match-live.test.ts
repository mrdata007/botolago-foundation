import { describe, expect, it } from "vitest";
import { buildMatchLiveDetail, elapsedMinutes } from "./match-live";
import type { Match } from "@/types/domain";

const base: Match = {
  id: "match-live-1",
  gameweek: 12,
  homeClubId: "club-a",
  awayClubId: "club-b",
  kickoff: "2026-07-27T18:00:00.000Z",
  status: "live",
  minute: 67,
  homeScore: 2,
  awayScore: 1,
  venue: { fr: "Stade", ar: "ملعب" },
};

describe("match-live", () => {
  it("is deterministic for the same match", () => {
    expect(buildMatchLiveDetail(base)).toEqual(buildMatchLiveDetail(base));
  });

  it("produces goal events consistent with the scoreline", () => {
    const detail = buildMatchLiveDetail(base);
    const goals = detail.events.filter((e) => e.homeScore !== undefined);
    expect(goals).toHaveLength(3);
    const last = goals[goals.length - 1]!;
    expect(last.homeScore).toBe(2);
    expect(last.awayScore).toBe(1);
  });

  it("keeps events ordered by minute and within elapsed time", () => {
    const detail = buildMatchLiveDetail(base);
    const minutes = detail.events.map((e) => e.minute);
    expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
    expect(Math.max(...minutes)).toBeLessThanOrEqual(90);
  });

  it("returns an empty state for scheduled matches", () => {
    const scheduled = { ...base, status: "scheduled" as const, minute: undefined };
    const detail = buildMatchLiveDetail(scheduled);
    expect(detail.elapsed).toBe(0);
    expect(detail.events).toHaveLength(0);
    expect(detail.momentum).toHaveLength(0);
    expect(detail.stats.home.possession).toBe(50);
  });

  it("splits possession to 100 and bounds momentum", () => {
    const detail = buildMatchLiveDetail(base);
    expect(detail.stats.home.possession + detail.stats.away.possession).toBe(100);
    for (const p of detail.momentum) {
      expect(p.value).toBeGreaterThanOrEqual(-100);
      expect(p.value).toBeLessThanOrEqual(100);
    }
  });

  it("treats finished matches as full time", () => {
    expect(elapsedMinutes({ status: "finished", minute: undefined })).toBe(90);
    expect(elapsedMinutes({ status: "live", minute: 120 })).toBe(90);
  });
});
