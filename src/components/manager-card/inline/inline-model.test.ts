import { describe, expect, it } from "bun:test";

import type { MemberCardDto, MyCardDto } from "@/backend/manager-card/contracts";
import { FIXTURES } from "@/backend/manager-card/fixtures";

import {
  nextDeadline,
  firstTransferEligible,
  hintEligible,
  hubCardModel,
  newlyRated,
  nextSeasonLabel,
  rankTokenFigure,
  recapCounted,
  type RoundRef,
} from "./inline-model";

const card = (id: keyof typeof FIXTURES, over: Partial<MyCardDto> = {}): MyCardDto => ({
  ...(FIXTURES[id].card as MyCardDto),
  ...over,
});

const NOW = Date.parse("2026-10-08T12:00:00Z");
const AHEAD = "2026-10-10T10:20:00Z";
const BEHIND = "2026-10-07T10:20:00Z";
const round = (over: Partial<RoundRef> = {}): RoundRef => ({
  number: 6,
  deadline: AHEAD,
  status: "open",
  ...over,
});

describe("nextSeasonLabel", () => {
  it("is the next season's name, in the shape the seasons are named", () => {
    expect(nextSeasonLabel("2026/27")).toBe("2027/28");
    expect(nextSeasonLabel("2099/00")).toBe("2100/01");
    expect(nextSeasonLabel(" 2026/27 ")).toBe("2027/28");
  });
  it("is null when the label is not a season's name, never a guess", () => {
    expect(nextSeasonLabel("2026-27")).toBeNull();
    expect(nextSeasonLabel("2026/28")).toBeNull();
    expect(nextSeasonLabel("")).toBeNull();
    expect(nextSeasonLabel("Saison 1")).toBeNull();
  });
});

describe("hubCardModel: the head", () => {
  it("is the counter while there is no number, from what the server counted", () => {
    const model = hubCardModel(card("forming1"), round(), NOW);
    expect(model.head).toEqual({ kind: "counter", k: 1, n: 3 });
  });
  it("is the number once there is one, with its tier and whether it is provisional", () => {
    expect(hubCardModel(card("rated"), round(), NOW).head).toEqual({
      kind: "number",
      ovr: 84,
      tier: "pro",
      provisional: true,
    });
    expect(hubCardModel(card("cleared"), round(), NOW).head).toMatchObject({
      kind: "number",
      ovr: 85,
      provisional: false,
    });
  });
  it("is never a number the server did not send: an unrated card has no 0", () => {
    for (const id of ["born0", "forming1", "eve2", "seasonStarted"] as const) {
      expect(hubCardModel(card(id), round(), NOW).head.kind).toBe("counter");
    }
    // Every journée counted, too few statistics: the statistics filled, never « 3/3 ».
    expect(hubCardModel(card("insufficient3"), round(), NOW).head).toEqual({
      kind: "stats",
      filled: 2,
      total: 4,
    });
  });
  it("marks a card with a moment waiting, and only then", () => {
    expect(hubCardModel(card("born0"), round(), NOW).fresh).toBe(true);
    expect(hubCardModel(card("rated"), round(), NOW).fresh).toBe(true);
    expect(hubCardModel(card("forming1"), round(), NOW).fresh).toBe(false);
    expect(hubCardModel(card("rated", { moments: [] }), round(), NOW).fresh).toBe(false);
  });
});

describe("hubCardModel: the line", () => {
  it("names the next round and its deadline while the card forms", () => {
    expect(hubCardModel(card("forming1"), round({ number: 6 }), NOW).line).toEqual({
      kind: "next",
      gameweek: 6,
      deadline: AHEAD,
    });
  });
  it("says nothing about a round whose deadline has passed, or when there is no round", () => {
    expect(hubCardModel(card("forming1"), round({ deadline: BEHIND }), NOW).line.kind).toBe("none");
    expect(hubCardModel(card("forming1"), null, NOW).line.kind).toBe("none");
  });
  it("names the first counted round before any is counted", () => {
    const born = card("born0", { firstCountedGameweekSeq: 5 });
    expect(hubCardModel(born, round(), NOW).line).toEqual({ kind: "first_counted", gameweek: 5 });
    // A card whose first round is not known has nothing to say about it: the next round instead.
    expect(hubCardModel(card("born0"), round(), NOW).line.kind).toBe("next");
  });
  it("is the eve when one round is short and the counted round is locked or live", () => {
    for (const status of ["locked", "live"] as const) {
      expect(hubCardModel(card("eve2"), round({ number: 7, status }), NOW).line).toEqual({
        kind: "eve",
        gameweek: 7,
      });
    }
    // Two rounds short is not the eve.
    expect(
      hubCardModel(card("forming1"), round({ number: 6, status: "locked" }), NOW).line.kind,
    ).not.toBe("eve");
  });
  it("is « over, not final » while a counted round is provisional or finalizing", () => {
    for (const status of ["provisional", "finalizing"] as const) {
      expect(hubCardModel(card("eve2"), round({ number: 7, status }), NOW).line).toEqual({
        kind: "over",
        gameweek: 7,
      });
    }
  });
  it("does not claim a round counts when the server does not list it as counted", () => {
    // Round 9 is not among the rating rounds 5, 6, 7: no eve, no « over ».
    expect(
      hubCardModel(card("eve2"), round({ number: 9, status: "locked" }), NOW).line.kind,
    ).not.toBe("eve");
    expect(
      hubCardModel(card("eve2"), round({ number: 9, status: "provisional" }), NOW).line.kind,
    ).not.toBe("over");
    // And with no list at all, never.
    expect(
      hubCardModel(
        card("eve2", { ratingGameweeks: null }),
        round({ number: 7, status: "locked" }),
        NOW,
      ).line.kind,
    ).not.toBe("eve");
    // A round the server has already evaluated is not the eve either.
    expect(
      hubCardModel(card("eve2"), round({ number: 6, status: "locked" }), NOW).line.kind,
    ).not.toBe("eve");
  });
  it("says the minimum is reached and the number waits for a statistic", () => {
    expect(hubCardModel(card("insufficient3"), round(), NOW).line).toEqual({
      kind: "insufficient",
    });
  });
  it("is the next round once rated", () => {
    expect(hubCardModel(card("rated"), round({ number: 8 }), NOW).line).toEqual({
      kind: "next",
      gameweek: 8,
      deadline: AHEAD,
    });
    expect(hubCardModel(card("rated"), null, NOW).line.kind).toBe("none");
  });
  it("is the closed season's own sentence when the season ended with a number", () => {
    expect(hubCardModel(card("seasonClosed"), round(), NOW).line).toEqual({
      kind: "closed",
      season: "2026/27",
      ovr: 86,
      tier: "pro",
    });
  });
  it("is the late-signer line when the season ended before a first number", () => {
    const late = card("forming1", { seasonClosed: true });
    expect(hubCardModel(late, round(), NOW).line).toEqual({ kind: "late", season: "2027/28" });
    // With no next season name the line is not shown, rather than guessed.
    const odd = card("forming1", {
      seasonClosed: true,
      season: { id: late.season.id, label: "S1" },
    });
    expect(hubCardModel(odd, round(), NOW).line.kind).toBe("none");
  });
  it("keeps the new season's counter at its own count, not last season's number", () => {
    const started = hubCardModel(card("seasonStarted"), round(), NOW);
    expect(started.head).toEqual({ kind: "counter", k: 0, n: 3 });
  });
});

describe("rankTokenFigure", () => {
  it("is « k/n » while forming and the number once there is one", () => {
    expect(rankTokenFigure(card("forming1"))).toEqual({ kind: "counter", k: 1, n: 3 });
    expect(rankTokenFigure(card("rated"))).toMatchObject({ kind: "number", ovr: 84 });
  });
});

describe("recapCounted", () => {
  it("places a counted round among the counted ones", () => {
    expect(recapCounted(card("eve2"), 5)).toEqual({ k: 1, n: 3 });
    expect(recapCounted(card("eve2"), 6)).toEqual({ k: 2, n: 3 });
  });
  it("is null for a round the server does not list, or has not evaluated", () => {
    expect(recapCounted(card("eve2"), 4)).toBeNull();
    expect(recapCounted(card("eve2"), 7)).toBeNull(); // listed, but evaluated through 6 only
    expect(recapCounted(card("eve2", { ratingGameweeks: null }), 5)).toBeNull();
    expect(recapCounted(card("eve2", { throughGameweekSeq: null }), 5)).toBeNull();
  });
  it("is null once the card has a number, and once the season is closed", () => {
    expect(recapCounted(card("rated"), 6)).toBeNull();
    expect(recapCounted(card("forming1", { seasonClosed: true }), 5)).toBeNull();
  });
});

describe("nextDeadline", () => {
  it("is the round's deadline while it is ahead", () => {
    expect(nextDeadline(round(), NOW)).toBe(AHEAD);
  });
  it("is null once it has passed, or when there is no round", () => {
    expect(nextDeadline(round({ deadline: BEHIND }), NOW)).toBeNull();
    expect(nextDeadline(null, NOW)).toBeNull();
  });
});

describe("the hints and the first-transfer line", () => {
  it("teach only a manager whose card has no number yet", () => {
    expect(hintEligible(card("forming1"))).toBe(true);
    expect(hintEligible(card("insufficient3"))).toBe(true);
    expect(hintEligible(card("rated"))).toBe(false);
    expect(hintEligible(null)).toBe(false);
    expect(hintEligible(undefined)).toBe(false);
  });
  it("say TRF will measure a first transfer only while TRF has no transfer", () => {
    expect(firstTransferEligible(card("ratedTrfNull"))).toBe(true);
    expect(firstTransferEligible(card("insufficient3"))).toBe(true);
    expect(firstTransferEligible(card("rated"))).toBe(false);
    expect(firstTransferEligible(card("forming1"))).toBe(false); // pending_minimum, not no_transfers
    expect(firstTransferEligible(null)).toBe(false);
  });
});

describe("newlyRated", () => {
  const member = (teamId: string, firstRated: number | null): MemberCardDto => ({
    ...(FIXTURES.rated.league!.members[0] as MemberCardDto),
    teamId,
    firstRatedGameweekSeq: firstRated,
  });
  const cards = [
    member("a", 7),
    member("me", 7),
    member("b", 5),
    member("c", null),
    member("d", 7),
  ];
  it("keeps the members first rated in the latest journée, in the league's order, without the reader", () => {
    expect(newlyRated(cards, 7, "me").map((c) => c.teamId)).toEqual(["a", "d"]);
  });
  it("is empty when the latest journée is not known, or nobody is new", () => {
    expect(newlyRated(cards, null, "me")).toEqual([]);
    expect(newlyRated(cards, 9, "me")).toEqual([]);
    expect(newlyRated([], 7, null)).toEqual([]);
  });
});
