import { describe, expect, it } from "bun:test";

import {
  ackResponseSchema,
  cardsResponseSchema,
  historyResponseSchema,
  historyRowSchema,
  managerCardStatusSchema,
  memberCardSchema,
  momentSchema,
  myCardResponseSchema,
  myCardSchema,
} from "./contracts";
import { FIXTURE_IDS, FIXTURES, MANAGER_CARD_FIXTURE_SENTINEL, fixtureById } from "./fixtures";

const rated = FIXTURES.rated.card!;

describe("the contracts accept every development fixture", () => {
  it.each([...FIXTURE_IDS])("%s", (id) => {
    const fixture = FIXTURES[id];
    expect(managerCardStatusSchema.safeParse(fixture.status).success).toBe(true);
    if (fixture.card) {
      expect(myCardSchema.safeParse(fixture.card).error?.issues ?? []).toEqual([]);
      expect(myCardResponseSchema.safeParse({ available: true, card: fixture.card }).success).toBe(
        true,
      );
    }
    for (const member of fixture.league?.members ?? []) {
      expect(memberCardSchema.safeParse(member).error?.issues ?? []).toEqual([]);
    }
    for (const row of fixture.history) {
      expect(historyRowSchema.safeParse(row).error?.issues ?? []).toEqual([]);
    }
  });

  it("answers for the three shapes a read can take", () => {
    expect(myCardResponseSchema.safeParse({ available: false }).success).toBe(true);
    expect(myCardResponseSchema.safeParse({ available: true, card: null }).success).toBe(true);
    expect(cardsResponseSchema.safeParse({ available: false }).success).toBe(true);
    expect(historyResponseSchema.safeParse({ available: false }).success).toBe(true);
    expect(
      historyResponseSchema.safeParse({
        available: true,
        items: FIXTURES.rated.history,
        nextBeforeSeq: null,
      }).success,
    ).toBe(true);
    expect(ackResponseSchema.safeParse({ acknowledged: ["a"], ignored: [] }).success).toBe(true);
  });
});

describe("the contracts refuse what the server must never send", () => {
  it("a serial with a leading zero, or of the wrong length", () => {
    expect(myCardSchema.safeParse({ ...rated, serial: "082913" }).success).toBe(false);
    expect(myCardSchema.safeParse({ ...rated, serial: "48291" }).success).toBe(false);
    expect(myCardSchema.safeParse({ ...rated, serial: "4829133" }).success).toBe(false);
    expect(myCardSchema.safeParse({ ...rated, serial: null }).success).toBe(true);
  });

  it("an out-of-range or fractional rating", () => {
    for (const ovr of [0, 100, -3, 84.5]) {
      expect(myCardSchema.safeParse({ ...rated, ovr }).success).toBe(false);
    }
    expect(myCardSchema.safeParse({ ...rated, ovr: 1 }).success).toBe(true);
    expect(myCardSchema.safeParse({ ...rated, ovr: 99 }).success).toBe(true);
  });

  it("a tier-changed moment for HOMA, where a card starts", () => {
    const base = FIXTURES.tierUp.card!.moments[0]!;
    expect(momentSchema.safeParse(base).success).toBe(true);
    expect(momentSchema.safeParse({ ...base, key: "tier_changed:homa" }).success).toBe(false);
    expect(momentSchema.safeParse({ ...base, key: "tier_changed:" }).success).toBe(false);
  });

  it("an unknown tier, rating state or null reason, and a club colour that is not #rrggbb", () => {
    expect(myCardSchema.safeParse({ ...rated, tier: "gold" }).success).toBe(false);
    expect(myCardSchema.safeParse({ ...rated, ratingState: "confirmed" }).success).toBe(false);
    expect(
      myCardSchema.safeParse({
        ...rated,
        stats: { ...rated.stats, trf: { value: null, nullReason: "later" } },
      }).success,
    ).toBe(false);
    expect(
      myCardSchema.safeParse({ ...rated, club: { ...rated.club!, primaryColor: "#c00" } }).success,
    ).toBe(false);
  });

  it("a malformed answer: a missing field, a snake_case one", () => {
    const { teamId: _teamId, ...withoutTeam } = rated;
    expect(myCardSchema.safeParse(withoutTeam).success).toBe(false);
    expect(myCardResponseSchema.safeParse({ available: true }).success).toBe(false);
    expect(
      myCardResponseSchema.safeParse({ available: true, card: { team_id: "x" } }).success,
    ).toBe(false);
  });
});

describe("the fixtures", () => {
  it("are labelled samples and carry the sentinel the production gate scans for", () => {
    expect(MANAGER_CARD_FIXTURE_SENTINEL).toBe("mc-fixture-sentinel-6b1f");
    expect(FIXTURE_IDS).toHaveLength(25);
    for (const id of FIXTURE_IDS) expect(FIXTURES[id].id).toBe(id);
  });

  it("default to the rated card for anything unknown", () => {
    expect(fixtureById(undefined).id).toBe("rated");
    expect(fixtureById("nope").id).toBe("rated");
    expect(fixtureById("founder").id).toBe("founder");
  });

  it("never carry a serial with a leading zero or a number of 0", () => {
    for (const id of FIXTURE_IDS) {
      const card = FIXTURES[id].card;
      if (!card) continue;
      expect(card.serial === null || /^[1-9]\d{5}$/.test(card.serial)).toBe(true);
      expect(card.ovr === null || card.ovr >= 1).toBe(true);
    }
  });

  it("keep the league in points order, not rating order", () => {
    const league = FIXTURES.rated.league!;
    const byPoints = [...league.standings].sort((a, b) => b.totalScore - a.totalScore);
    expect(league.standings.map((row) => row.managerId)).toEqual(
      byPoints.map((row) => row.managerId),
    );
    const ratings = league.standings.map(
      (row) => league.members.find((member) => member.teamId === row.managerId)!.ovr,
    );
    const byRating = [...ratings].sort((a, b) => (b ?? 0) - (a ?? 0));
    expect(ratings).not.toEqual(byRating);
  });

  it("tell the stories of Appendix B", () => {
    expect(FIXTURES.rated.card).toMatchObject({ ovr: 84, tier: "pro", provisional: true });
    expect(FIXTURES.cleared.card).toMatchObject({ ovr: 85, provisional: false });
    expect(FIXTURES.tierUp.card).toMatchObject({ ovr: 88, tier: "champion" });
    expect(FIXTURES.legend.card).toMatchObject({ ovr: 93, tier: "legend" });
    expect(FIXTURES.tierDown.card).toMatchObject({ ovr: 79, tier: "stade", bestTier: "pro" });
    expect(FIXTURES.founder.card?.founder).toMatchObject({
      cohort: 2026,
      cutoffDate: "2026-11-30",
    });
    expect(FIXTURES.seasonClosed.card).toMatchObject({ gameweeksCounted: 30, seasonClosed: true });
    expect(FIXTURES.seasonStarted.card).toMatchObject({
      ratingState: "forming",
      previousSeason: { label: "2026/27", ovr: 86, tier: "pro" },
    });
    expect(FIXTURES.launchArrival.card?.moments.map((m) => m.kind)).toEqual([
      "card_created",
      "first_rating",
    ]);
    expect(FIXTURES.returning.card?.moments.map((m) => m.kind)).toEqual([
      "first_rating",
      "provisional_cleared",
    ]);
    expect(FIXTURES.born0.card).toMatchObject({ serial: null, gameweeksCounted: 0 });
    expect(FIXTURES.born0Serial.card?.serial).toBe("482913");
    expect(FIXTURES.insufficient3.card).toMatchObject({ ovr: null, ratingState: "insufficient" });
    expect(FIXTURES.clubNull.card?.club).toBeNull();
    expect(FIXTURES.homa.card).toMatchObject({ ovr: 61, tier: "homa" });
    expect(FIXTURES.noCard.card).toBeNull();
    expect(FIXTURES.featureOff.status.enabled).toBe(false);
    expect(FIXTURES.offline.behaviour).toBe("offline");
    expect(FIXTURES.unavailable.behaviour).toBe("unavailable");
  });

  it("have a first rating in the history that matches the moment that announces it", () => {
    for (const id of ["rated", "returning"] as const) {
      const card = FIXTURES[id].card!;
      const moment = card.moments.find((entry) => entry.kind === "first_rating");
      if (moment?.kind !== "first_rating") throw new Error("no first rating");
      const row = FIXTURES[id].history.find((entry) => entry.gameweekSeq === moment.gameweekSeq);
      expect(row?.ovr).toBe(moment.ovr);
    }
  });
});
