import { describe, expect, it } from "bun:test";

import {
  deriveSeason,
  JOURNEES,
  LEAGUE_SIZE,
  RATING_CODES,
  roundHalfUp,
  SEASON,
  SEASON_RAW,
} from "./plus-season-data";

const S = SEASON;
const R = SEASON_RAW;

describe("the example season adds up", () => {
  it("has one value per journée in every series", () => {
    expect(JOURNEES).toBe(11);
    expect(LEAGUE_SIZE).toBe(12);
    for (const series of [
      R.you,
      R.rival,
      R.leagueAvg,
      R.leagueBest,
      R.youRank,
      R.rivalRank,
      R.captain,
      R.bestStarter,
      ...RATING_CODES.map((c) => R.ratings[c]),
    ])
      expect(series).toHaveLength(JOURNEES);
  });

  it("totals: you 616, Sami 602, the league average 575, and the cumulative lines end on them", () => {
    expect(S.total).toBe(616);
    expect(S.rivalTotal).toBe(602);
    expect(S.leagueTotal).toBe(575);
    expect(S.total - S.rivalTotal).toBe(14);
    expect(S.cumLead[JOURNEES - 1]).toBe(14);
    expect(S.total - S.leagueTotal).toBe(41);
    expect(S.cumYou[JOURNEES - 1]).toBe(S.total);
    expect(S.cumRival[JOURNEES - 1]).toBe(S.rivalTotal);
    expect(S.cumLeague[JOURNEES - 1]).toBe(S.leagueTotal);
    expect(R.leaderTotal).toBeGreaterThan(S.total);
    expect(R.leaderTotal - S.total).toBe(39);
  });

  it("wins 7 to 4, no draws, margins and the cumulative lead journée by journée", () => {
    expect(S.wins).toBe(7);
    expect(S.rivalWins).toBe(4);
    expect(S.wins + S.rivalWins).toBe(JOURNEES);
    expect(S.winsSum).toBe(30);
    expect(S.lossesSum).toBe(-16);
    expect(S.winsSum + S.lossesSum).toBe(14);
    expect(S.bestLead).toBe(7);
    expect(S.worstLead).toBe(-6);
    expect(S.cumLead.join()).toBe("3,0,4,10,7,10,13,9,16,10,14");
    expect(S.peakLead).toBe(16);
    expect(S.peakLeadWeek + 1).toBe(9);
    // level after J.2, ahead from J.3 on the cumulative line? (J.5, J.8 and J.10 slip back but stay positive)
    expect(S.cumLead[1]).toBe(0);
    expect(S.cumLead.slice(2).every((v) => v > 0)).toBe(true);
    expect(S.lead[JOURNEES - 1]! > 0 && S.lead[JOURNEES - 2]! < 0).toBe(true);
    expect(S.streak).toBe(1);
  });

  it("league comparison: averages, best and worst journée, journées above the average", () => {
    expect(S.above).toBe(8);
    expect(S.rivalAbove).toBe(7);
    expect(S.belowWeeks).toEqual([3, 6, 10]);
    expect(S.bestWeek + 1).toBe(9);
    expect(R.you[S.bestWeek]).toBe(71);
    expect(S.worstWeek + 1).toBe(3);
    expect(R.you[S.worstWeek]).toBe(44);
    expect(S.rivalBestWeek + 1).toBe(5);
    expect(R.rival[S.rivalBestWeek]).toBe(66);
    expect(roundHalfUp((S.total / JOURNEES) * 10) / 10).toBe(56);
    expect(S.leagueTotal / JOURNEES).toBeCloseTo(52.27, 2);
    R.you.forEach((v, i) => {
      expect(R.leagueBest[i]).toBeGreaterThanOrEqual(v);
      expect(R.leagueBest[i]).toBeGreaterThanOrEqual(R.rival[i]!);
    });
  });

  it("ranks: 3rd of 12 for you, 4th for Sami, best-half journées 9 and 7", () => {
    expect(R.youRank[JOURNEES - 1]).toBe(3);
    expect(R.rivalRank[JOURNEES - 1]).toBe(4);
    expect(S.topHalf).toBe(9);
    expect(S.rivalTopHalf).toBe(7);
    expect(R.youRank[0]! - R.youRank[JOURNEES - 1]!).toBe(4);
    expect(S.under50).toBe(3);
    expect(S.rivalUnder50).toBe(3);
  });

  it("where the points come from: 521 + 111 - 16 = 616", () => {
    expect(S.captainTotal).toBe(111);
    expect(S.penalty).toBe(16);
    expect(S.paidTransfers).toBe(4);
    expect(S.starters).toBe(521);
    expect(S.starters + S.captainTotal - S.penalty).toBe(S.total);
    expect(S.rivalStarters + R.rival_.captain - R.rival_.penalty).toBe(S.rivalTotal);
    expect(S.captainVsLeague).toBe(18);
  });

  it("the duel gap decomposes: +21 captain, -3 starters, -4 penalties = +14", () => {
    expect(S.gapTerms).toEqual({ captain: 21, starters: -3, penalty: -4 });
    expect(S.gapTerms.captain + S.gapTerms.starters + S.gapTerms.penalty).toBe(
      S.total - S.rivalTotal,
    );
  });

  it("captain: 26 points left on the table, best choice 6 times out of 11", () => {
    expect(S.bestStarterTotal).toBe(137);
    expect(S.captainLeft).toBe(26);
    expect(S.bestChoiceWeeks).toBe(6);
    R.captain.forEach((c, i) => expect(c).toBeLessThanOrEqual(R.bestStarter[i]!));
  });

  it("transfers: +27 gained, -16 paid, +11 net against +17 for the league, best J.8, worst J.6", () => {
    expect(S.gross).toBe(27);
    expect(S.net).toBe(11);
    expect(S.net).toBe(S.gross - S.penalty);
    expect(S.netVsLeague).toBe(-6);
    expect(S.transferCount).toBe(9);
    expect(S.bestTransferWeek[0]).toBe(8);
    expect(S.worstTransferWeek[0]).toBe(6);
    expect(S.netByWeek).toEqual([5, 3, -6, 11, -2]);
    // best and worst are picked and shown by the net gain, like the chart
    const netOf = (t: readonly number[]) => t[1]! - t[2]!;
    expect(netOf(S.bestTransferWeek)).toBe(Math.max(...S.netByWeek));
    expect(netOf(S.worstTransferWeek)).toBe(Math.min(...S.netByWeek));
    // the two journées that cost points net are J.6 and J.10
    expect(S.netByWeek.filter((n) => n < 0)).toHaveLength(2);
    expect(S.rivalNet).toBe(19);
  });

  it("duel categories: 5 of 7 for you", () => {
    expect(S.categoryCount).toBe(7);
    expect(S.categoriesWon).toBe(5);
  });

  it("OVR is the rounded mean of the four ratings, 72 against a league at 64", () => {
    expect(roundHalfUp((78 + 71 + 58 + 82) / 4)).toBe(72);
    expect(S.ovr).toBe(72);
    expect(S.ovrSeries[0]).toBe(roundHalfUp((62 + 70 + 55) / 3));
    expect(S.leagueOvr).toBe(64);
    expect(S.rivalOvr).toBe(69);
    expect(RATING_CODES.map((c) => S.lastRating(c))).toEqual([78, 71, 58, 82]);
    expect(R.ratingRank.OVR).toBe(3);
    expect(R.rivalRatingRank.OVR).toBe(4);
  });

  it("build contributions are whole points and add up to the lead over the league: +5 +3 +1 -1 = +8", () => {
    expect(S.contributions).toEqual({ CAP: 3, SEL: 1, TRF: -1, CON: 5 });
    for (const c of RATING_CODES) expect(Number.isInteger(S.contributions[c])).toBe(true);
    const total = RATING_CODES.reduce((s, c) => s + S.contributions[c], 0);
    expect(total).toBe(8);
    expect(total).toBe(S.ovr - S.leagueOvr);
  });

  it("is a pure function of the raw series", () => {
    expect(deriveSeason(SEASON_RAW).total).toBe(616);
  });

  it("noun agreement in the Arabic headlines holds: every counted figure used with « نقطة » is 11 or more", () => {
    for (const n of [
      S.total - S.leagueTotal,
      S.total - S.rivalTotal,
      S.captainVsLeague,
      S.captainLeft,
      S.peakLead,
      S.captainTotal,
    ])
      expect(n).toBeGreaterThanOrEqual(11);
  });
});

describe("the count-up rule", () => {
  it("never counts a figure the server painted, nor under reduced motion; counts one the reader brought", async () => {
    const { shouldCountUp } = await import("./plus-season-fmt");
    expect(shouldCountUp({ hydrating: true, reducedMotion: false })).toBe(false);
    expect(shouldCountUp({ hydrating: false, reducedMotion: true })).toBe(false);
    expect(shouldCountUp({ hydrating: false, reducedMotion: false })).toBe(true);
  });
});
