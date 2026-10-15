import { describe, expect, it } from "bun:test";

import { leagueStandingsRefetchInterval } from "./fantasy-league-pages";

/**
 * Codex review of Phase B: once a league member loaded a second standings page
 * the automatic refresh stopped altogether, so a league over 100 members stayed
 * stale. It now slows down with the pages shown and stops only far out.
 */
describe("how often the open league standings re-read themselves", () => {
  it("keeps the minute for the first page, as before", () => {
    expect(leagueStandingsRefetchInterval(0)).toBe(60_000);
    expect(leagueStandingsRefetchInterval(1)).toBe(60_000);
  });

  it("keeps refreshing after more pages are loaded, but less often", () => {
    for (const pages of [2, 3, 4, 5]) {
      const interval = leagueStandingsRefetchInterval(pages);
      expect(interval).toBe(5 * 60_000);
      expect(interval).toBeGreaterThan(60_000);
    }
  });

  it("stops only past five pages (500 members), where a return to the window still refreshes", () => {
    expect(leagueStandingsRefetchInterval(6)).toBe(false);
    expect(leagueStandingsRefetchInterval(20)).toBe(false);
  });
});
