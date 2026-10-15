import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";

import { mockLeagueContext } from "@/backend/premium/league-context-mock";
import { toLeagueSeries } from "@/backend/premium/league-context";
import { mockCareer } from "@/backend/premium/card-reads-mock";

import { careerToSeasonView } from "./plus-member-data";
import { CARD_STYLES, editionLabel } from "./plus-card-style";
import { SEASON_RAW } from "./plus-season-data";

describe("the member side", () => {
  it("has no renewal or grace banner: a Saison has nothing to renew", () => {
    expect(existsSync(new URL("./PlusRenewal.tsx", import.meta.url))).toBe(false);
  });

  it("the picker offers the standard card first, then the four editions", () => {
    expect(CARD_STYLES).toEqual(["standard", "holo", "electric", "pixel", "chrome"]);
    expect(editionLabel((key) => key, "standard")).toBe("plus.pick.standard");
  });

  it("the development member reads as one person everywhere: 612 points, third of five", () => {
    const total = SEASON_RAW.you.reduce((a, b) => a + b, 0);
    expect(total).toBe(612);
    expect(mockCareer().weeks.reduce((a, w) => a + w.score, 0)).toBe(612);
    const league = mockLeagueContext(null);
    expect(league.me.total).toBe(612);
    expect(league.me.rank).toBe(3);
    expect(league.league.members).toBe(5);
  });

  it("with the development league, no figure of the season is missing", () => {
    const view = careerToSeasonView(mockCareer(), toLeagueSeries(mockLeagueContext(null)))!;
    expect(view.raw.leagueAvg.every(Number.isFinite)).toBe(true);
    expect(view.raw.youRank.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(view.S.leagueTotal)).toBe(true);
    expect(Number.isFinite(view.raw.leaderTotal)).toBe(true);
  });
});
