import { describe, expect, it } from "bun:test";

import { mockDuel } from "@/backend/premium/card-reads-mock";
import type { DuelMember } from "@/backend/premium/card-reads";

import { gappedCareer, leagueSeries } from "./plus-league-fixture";
import { careerToSeasonView, duelToSeasonView } from "./plus-member-data";
import { EXAMPLE_VIEW } from "./plus-season-context";
import { isMissing } from "./plus-season-data";

/** A duel on journées 1, 2, 3 and 5, as the career above. */
function gappedDuel(): DuelMember {
  const duel = mockDuel("t2");
  const seqs = [1, 2, 3, 5];
  return {
    ...duel,
    weeks: duel.weeks.slice(0, 4).map((week, i) => ({ ...week, gameweekSeq: seqs[i]! })),
  };
}
const names = { you: "Moi", rival: "Yassine" };

describe("the league context in « Votre saison » (finding 1)", () => {
  it("fills the league's figures from the context, matched on the real journée number", () => {
    const view = careerToSeasonView(gappedCareer(), leagueSeries())!;
    // The league's journées are 1, 2, 3 and 5 too: the fourth entry is journée 5, not journée 4.
    expect(view.raw.leagueAvg).toEqual([56.67, 50, 50, 57.5]);
    expect(view.raw.leagueBest).toEqual([60, 55, 70, 80]);
    expect(view.raw.youRank).toEqual([1, 1, 2, 1]);
    expect(view.raw.leaderTotal).toBe(655);
    expect(view.raw.leagueCaptain).toBe(20.5);
    expect(view.raw.leagueNetTransfers).toBe(3.5);
    expect(view.raw.leagueRating.CAP).toBe(56);
    expect(view.raw.ratingRank).toEqual({ CAP: 1, SEL: 2, TRF: 1, CON: 1, OVR: 1 });
    expect(view.leagueSize).toBe(4);
    for (const figure of [
      view.S.leagueTotal,
      view.S.captainVsLeague,
      view.S.netVsLeague,
      view.S.topHalf,
      view.S.leagueOvr,
    ]) {
      expect(isMissing(figure)).toBe(false);
    }
  });

  it("aligns by journée when the league has a journée the reader lacks, and the reverse", () => {
    const career = gappedCareer();
    const series = leagueSeries();
    const shifted = { ...series, gameweeks: [1, 2, 4, 5] };
    const view = careerToSeasonView(career, shifted)!;
    // The reader's journée 3 is not one of the league's: missing, never journée 4's figure.
    expect(view.raw.leagueAvg[2]).toBeNaN();
    expect(view.raw.leagueAvg[3]).toBe(57.5);
  });

  it("keeps « — » only where the API returns null (a league under the minimum group)", () => {
    const view = careerToSeasonView(gappedCareer(), leagueSeries({ minGroup: true }))!;
    expect(view.raw.leagueCaptain).toBeNaN();
    expect(view.raw.leagueNetTransfers).toBeNaN();
    expect(view.raw.leagueRating.TRF).toBeNaN();
    // What the standings already show is still there.
    expect(view.raw.leaderTotal).toBe(655);
    expect(view.raw.leagueAvg[0]).toBe(56.67);
  });

  it("is the career alone, figures missing, when there is no league context", () => {
    const view = careerToSeasonView(gappedCareer(), null)!;
    expect(view.raw.leagueAvg.every(Number.isNaN)).toBe(true);
    expect(view.raw.leaderTotal).toBeNaN();
    expect(view.S.total).toBe(210);
  });
});

describe("the league context in « Détail du duel » (finding 1)", () => {
  it("adds the rival's side and the reader's own season figures", () => {
    const view = duelToSeasonView(
      gappedDuel(),
      "fr",
      names,
      leagueSeries({ withRival: true, rivalShowsHistory: true }),
    )!;
    expect(view.raw.rivalRank).toEqual([2, 2, 1, 2]);
    expect(view.raw.youRank).toEqual([1, 1, 2, 1]);
    expect(view.raw.rival_.captain).toBe(15);
    expect(view.raw.rival_.gross).toBe(12);
    // 12 gross, 8 net: 4 points of penalty, one paid transfer.
    expect(view.raw.rival_.penalty).toBe(4);
    expect(view.raw.rival_.paidTransfers).toBe(1);
    expect(view.raw.rival_.transfers).toBe(3);
    expect(view.raw.rivalRatingRank.CAP).toBe(3);
    expect(view.raw.ratingRank.OVR).toBe(1);
    expect(view.S.gross).toBe(19);
    expect(view.S.net).toBe(11);
    expect(view.S.penalty).toBe(8);
    expect(view.S.captainTotal).toBe(10 + 11 + 12 + 13);
    // What the context does not serve stays missing.
    expect(view.raw.rival_.bestStarters).toBeNaN();
    expect(view.raw.rival_.captainBest).toBeNaN();
  });

  it("leaves the rival's side missing when the context has no rival data", () => {
    const view = duelToSeasonView(gappedDuel(), "fr", names, leagueSeries())!;
    expect(view.raw.rival_.captain).toBeNaN();
    expect(view.raw.rivalRank.every(Number.isNaN)).toBe(true);
    expect(view.raw.leagueAvg).toEqual([56.67, 50, 50, 57.5]);
  });
});

describe("the real journée numbers (finding 2)", () => {
  it("are carried: 1, 2, 3, 5 stay 1, 2, 3, 5 in the career and the duel", () => {
    expect(careerToSeasonView(gappedCareer())!.S.seq).toEqual([1, 2, 3, 5]);
    expect(duelToSeasonView(gappedDuel(), "fr", names)!.S.seq).toEqual([1, 2, 3, 5]);
  });
  it("leave the example season on 1 to 11", () => {
    expect(EXAMPLE_VIEW.S.seq).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe("the captain's « meilleur choix » (finding 3)", () => {
  it("is counted over the weeks the card counts, not the journées played", () => {
    const view = careerToSeasonView(gappedCareer())!;
    expect(view.J).toBe(4);
    expect(view.raw.captainWeeks).toBe(3);
    expect(view.S.bestChoiceWeeks).toBe(2);
  });
});

describe("the transfers' gain (finding 4)", () => {
  it("is not net of the hit twice: a gain of 2 after a 4-point hit shows +2 net", () => {
    const career = gappedCareer();
    const view = careerToSeasonView(career)!;
    // Journée 2: the API's net gain is 2 and the hit 4, so the gross is 6 and the net on screen 2.
    expect(view.raw.transfers[0]).toEqual([2, 6, 4, 2]);
    expect(view.S.netByWeek[0]).toBe(2);
    // Journée 5: net 9 after a 4-point hit.
    expect(view.raw.transfers[1]).toEqual([5, 13, 4, 1]);
    expect(view.S.netByWeek[1]).toBe(9);
    // The season: the career's own seasonGain, to the point.
    expect(view.S.net).toBe(career.transfers.seasonGain as number);
    expect(view.S.gross).toBe(19);
    expect(view.S.penalty).toBe(8);
  });
  it("keeps the best and worst week by net gain", () => {
    const view = careerToSeasonView(gappedCareer())!;
    expect(view.S.bestTransferWeek[0]).toBe(5);
    expect(view.S.worstTransferWeek[0]).toBe(2);
  });
});
