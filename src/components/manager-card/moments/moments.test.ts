import { describe, expect, it } from "bun:test";

import type { HistoryRowDto, MomentDto, MyCardDto } from "@/backend/manager-card/contracts";
import { FIXTURES, type FixtureId } from "@/backend/manager-card/fixtures";

import {
  DEADLINE_WINDOW_MINUTES,
  deriveReplayItems,
  pickHero,
  stateLines,
  withinDeadlineWindow,
  type PickHeroContext,
} from "./moments";

/**
 * `pickHero` for every fixture's pending moments: priority, coalescing, the 60-minute rule, the
 * session flag, the launch gate, and the team page's narrower reading (plan 5.3 and 7.6).
 */

const fixture = (id: FixtureId): MyCardDto => FIXTURES[id].card!;

function context(card: MyCardDto, over: Partial<PickHeroContext> = {}): PickHeroContext {
  return {
    surface: "curva",
    card,
    minutesToDeadline: 24 * 60,
    heroShownThisSession: false,
    launchGateOpen: true,
    latestEvaluatedGameweekSeq: card.throughGameweekSeq,
    ...over,
  };
}

const pick = (id: FixtureId, over: Partial<PickHeroContext> = {}) => {
  const card = fixture(id);
  return pickHero(card.moments, context(card, over));
};

describe("each fixture's pending moments, on Curva", () => {
  it("born0: the born panel, new, acknowledging card_created, with the make beat", () => {
    const { hero, lines } = pick("born0");
    expect(hero).toEqual({
      kind: "born_new",
      keys: ["card_created"],
      beat: "make",
      gameweekSeq: null,
      tier: null,
      first: null,
    });
    expect(lines).toEqual([]);
  });

  it("born0Serial is the same panel (the serial is a line inside it, not another hero)", () => {
    expect(pick("born0Serial").hero?.kind).toBe("born_new");
  });

  it("a forming card with card_created pending is the arrival-forming panel", () => {
    const card: MyCardDto = {
      ...fixture("forming1"),
      moments: [
        { kind: "card_created", key: "card_created", occurredAt: null, seasonLabel: "2026/27" },
      ],
    };
    const { hero } = pickHero(card.moments, context(card));
    expect(hero?.kind).toBe("born_arrival");
    expect(hero?.keys).toEqual(["card_created"]);
    expect(hero?.beat).toBe("make");
  });

  it("rated: the fresh first rating, with the first beat and its journée", () => {
    const { hero } = pick("rated");
    expect(hero).toMatchObject({
      kind: "first_fresh",
      beat: "first",
      gameweekSeq: 7,
      tier: "pro",
      first: null,
    });
    expect(hero?.keys).toEqual([expect.stringMatching(/^first_rating:/)]);
  });

  it("launchArrival: card_created and first_rating pending are one arrival hero acknowledging both", () => {
    const card = fixture("launchArrival");
    const { hero } = pick("launchArrival");
    expect(hero?.kind).toBe("first_arrival");
    expect(hero?.beat).toBe("make");
    expect(hero?.keys).toEqual(card.moments.map((moment) => moment.key));
    expect(hero?.keys).toHaveLength(2);
  });

  it("returning: a first rating older than the latest journée is one coalesced hero, no beat, both keys", () => {
    const card = fixture("returning");
    const { hero, lines } = pick("returning");
    expect(hero).toMatchObject({
      kind: "first_coalesced",
      beat: null,
      first: { ovr: 84, gameweekSeq: 3 },
      tier: "stade",
    });
    expect(hero?.keys).toEqual(card.moments.map((moment) => moment.key));
    // The cleared label is folded into the hero, so it is not a line as well; the fall from PRO to
    // STADE is a state line with no key.
    expect(lines).toEqual([{ kind: "tier_down", keys: [] }]);
  });

  it("cleared: no hero, one line acknowledged on display", () => {
    const card = fixture("cleared");
    const { hero, lines, ackOnDisplay } = pick("cleared");
    expect(hero).toBeNull();
    expect(lines).toEqual([{ kind: "provisional_cleared", keys: [card.moments[0]!.key] }]);
    expect(ackOnDisplay).toEqual([card.moments[0]!.key]);
  });

  it("tierUp: the tier hero with the tier beat, acknowledging tier_changed:champion", () => {
    expect(pick("tierUp").hero).toMatchObject({
      kind: "tier_up",
      keys: ["tier_changed:champion"],
      beat: "tier",
      tier: "champion",
      gameweekSeq: 12,
    });
  });

  it("legend: the legend beat", () => {
    expect(pick("legend").hero).toMatchObject({
      kind: "tier_up",
      beat: "legend",
      tier: "legend",
    });
  });

  it("founder: the founder hero with the founder beat", () => {
    expect(pick("founder").hero).toMatchObject({
      kind: "founder",
      keys: ["founder_granted"],
      beat: "founder",
    });
  });

  it("seasonClosed: the cast-off hero", () => {
    const hero = pick("seasonClosed").hero;
    expect(hero).toMatchObject({ kind: "season_closed", beat: "castoff", tier: "pro" });
    expect(hero?.keys[0]).toMatch(/^season_closed:/);
  });

  it("seasonStarted: no hero; the new-season line carries its key", () => {
    const card = fixture("seasonStarted");
    const { hero, lines, ackOnDisplay } = pick("seasonStarted");
    expect(hero).toBeNull();
    expect(lines).toEqual([{ kind: "season_started", keys: [card.moments[0]!.key] }]);
    expect(ackOnDisplay).toEqual([card.moments[0]!.key]);
  });

  it("a card with nothing pending has no hero, no moment line", () => {
    for (const id of ["homa", "clubNull", "tierDown", "eve2", "notFinal2"] as const) {
      const { hero, ackOnDisplay } = pick(id);
      expect(hero).toBeNull();
      expect(ackOnDisplay).toEqual([]);
    }
  });

  it("a fall is stated by a state line with no key; a rise or a first rating is not", () => {
    expect(pick("tierDown").lines).toEqual([{ kind: "tier_down", keys: [] }]);
    expect(stateLines(fixture("rated"))).toEqual([]);
  });

  it("a new season with no number yet keeps its line as a state, with no key to acknowledge", () => {
    const card: MyCardDto = { ...fixture("seasonStarted"), moments: [] };
    const { lines, ackOnDisplay } = pickHero([], context(card));
    expect(lines).toEqual([{ kind: "season_started", keys: [] }]);
    expect(ackOnDisplay).toEqual([]);
  });
});

describe("priority", () => {
  const rated = fixture("rated");
  const at = "2026-10-19T21:14:00Z";
  const created: MomentDto = {
    kind: "card_created",
    key: "card_created",
    occurredAt: null,
    seasonLabel: "2026/27",
  };
  const first = rated.moments[0]!;
  const founder: MomentDto = {
    kind: "founder_granted",
    key: "founder_granted",
    occurredAt: at,
    cohort: 2026,
    cutoffDate: null,
  };
  const tier = (code: "stade" | "pro" | "champion" | "legend", seq = 9): MomentDto => ({
    kind: "tier_changed",
    key: `tier_changed:${code}`,
    occurredAt: at,
    tier: code,
    previousTier: null,
    ovr: 84,
    gameweekSeq: seq,
    seasonLabel: "2026/27",
  });
  const closed: MomentDto = {
    kind: "season_closed",
    key: "season_closed:s1",
    occurredAt: at,
    seasonLabel: "2026/27",
    ovr: 86,
    tier: "pro",
  };
  const founderCard: MyCardDto = {
    ...rated,
    founder: { cohort: 2026, grantedAt: at, cutoffDate: null },
  };

  it("the first rating beats the founder mark, a tier and a closed season", () => {
    const moments = [closed, tier("pro"), founder, first];
    expect(pickHero(moments, context(founderCard)).hero?.kind).toBe("first_fresh");
  });

  it("the founder mark beats a tier and a closed season", () => {
    expect(pickHero([closed, tier("pro"), founder], context(founderCard)).hero?.kind).toBe(
      "founder",
    );
  });

  it("a tier beats a closed season; the lower ones wait", () => {
    const { hero } = pickHero([closed, tier("pro")], context(rated));
    expect(hero?.kind).toBe("tier_up");
    expect(hero?.keys).toEqual(["tier_changed:pro"]);
  });

  it("a jump over a tier is one hero for the highest, acknowledging every key in one call", () => {
    const { hero } = pickHero(
      [tier("stade", 8), tier("champion", 10), tier("pro", 9)],
      context(rated),
    );
    expect(hero?.tier).toBe("champion");
    expect(hero?.gameweekSeq).toBe(10);
    expect([...hero!.keys].sort()).toEqual(
      ["tier_changed:champion", "tier_changed:pro", "tier_changed:stade"].sort(),
    );
  });

  it("a founder moment with no founder part on the card shows no founder hero", () => {
    expect(pickHero([founder], context(rated)).hero).toBeNull();
  });

  it("the born panel beats everything pending", () => {
    const born = fixture("born0");
    expect(pickHero([...born.moments, founder, tier("pro")], context(born)).hero?.kind).toBe(
      "born_new",
    );
  });

  it("an arrival folds the first rating and a cleared label in, and the cleared line is not repeated", () => {
    const cleared: MomentDto = {
      kind: "provisional_cleared",
      key: "provisional_cleared:s1",
      occurredAt: at,
      gameweekSeq: 9,
      ovr: 85,
      gameweeksCounted: 5,
    };
    const { hero, lines } = pickHero([created, first, cleared], context(rated));
    expect(hero?.kind).toBe("first_arrival");
    expect(hero?.keys).toEqual(["card_created", first.key, "provisional_cleared:s1"]);
    expect(lines).toEqual([]);
  });

  it("a fresh first rating leaves a cleared label as its own line", () => {
    const cleared: MomentDto = {
      kind: "provisional_cleared",
      key: "provisional_cleared:s1",
      occurredAt: at,
      gameweekSeq: 7,
      ovr: 85,
      gameweeksCounted: 5,
    };
    const { hero, lines } = pickHero([first, cleared], context(rated));
    expect(hero?.kind).toBe("first_fresh");
    expect(lines).toEqual([{ kind: "provisional_cleared", keys: ["provisional_cleared:s1"] }]);
  });
});

describe("the gates", () => {
  it("the launch gate: nothing expands and nothing is acknowledged before it opens", () => {
    for (const id of ["born0", "rated", "launchArrival", "returning", "cleared"] as const) {
      expect(pick(id, { launchGateOpen: false })).toEqual({
        hero: null,
        lines: [],
        ackOnDisplay: [],
      });
    }
  });

  it("one hero per session: a hero shown already means no hero, but the lines still show", () => {
    expect(pick("rated", { heroShownThisSession: true }).hero).toBeNull();
    expect(pick("born0", { heroShownThisSession: true }).hero).toBeNull();
    const cleared = pick("cleared", { heroShownThisSession: true });
    expect(cleared.lines).toHaveLength(1);
  });

  it("nothing while the import prompt or the step-up notice is open", () => {
    expect(pick("rated", { blocked: true }).hero).toBeNull();
    expect(pick("born0", { blocked: true }).hero).toBeNull();
  });

  it("deadline first: within 60 minutes of a deadline the heroes stay collapsed", () => {
    for (const id of [
      "rated",
      "launchArrival",
      "returning",
      "tierUp",
      "legend",
      "founder",
      "seasonClosed",
    ] as const) {
      expect(pick(id, { minutesToDeadline: 59 }).hero).toBeNull();
      expect(pick(id, { minutesToDeadline: DEADLINE_WINDOW_MINUTES }).hero).toBeNull();
      expect(pick(id, { minutesToDeadline: 0 }).hero).toBeNull();
      expect(pick(id, { minutesToDeadline: 61 }).hero).not.toBeNull();
      expect(pick(id, { minutesToDeadline: null }).hero).not.toBeNull();
      // Past the deadline the window is over.
      expect(pick(id, { minutesToDeadline: -5 }).hero).not.toBeNull();
    }
  });

  it("the born panel is exempt from the deadline rule", () => {
    expect(pick("born0", { minutesToDeadline: 10 }).hero?.kind).toBe("born_new");
    expect(pick("born0Serial", { minutesToDeadline: 0 }).hero?.kind).toBe("born_new");
  });

  it("the deadline rule holds a hero back without losing the lines", () => {
    expect(pick("cleared", { minutesToDeadline: 30 }).lines).toHaveLength(1);
    expect(withinDeadlineWindow(30)).toBe(true);
    expect(withinDeadlineWindow(null)).toBe(false);
  });
});

describe("the team page", () => {
  it("shows only the born panel", () => {
    expect(pick("born0", { surface: "team" }).hero?.kind).toBe("born_new");
    for (const id of [
      "rated",
      "returning",
      "tierUp",
      "founder",
      "seasonClosed",
      "launchArrival",
    ] as const) {
      expect(pick(id, { surface: "team" }).hero).toBeNull();
    }
  });

  it("has no lines, and the deadline rule does not touch the panel", () => {
    expect(pick("cleared", { surface: "team" })).toEqual({
      hero: null,
      lines: [],
      ackOnDisplay: [],
    });
    expect(pick("born0", { surface: "team", minutesToDeadline: 5 }).hero?.kind).toBe("born_new");
  });
});

describe("deriveReplayItems", () => {
  it("lists only what happened, newest first, from the history and the card", () => {
    const card = fixture("seasonClosed");
    const rows = FIXTURES.seasonClosed.history;
    const items = deriveReplayItems(card, rows);
    expect(items.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["first_rating", "season"]),
    );
    const first = items.find((item) => item.kind === "first_rating")!;
    expect(first.row?.ovr).not.toBeNull();
    expect(first.beat).toBe("first");
    const season = items.find((item) => item.kind === "season")!;
    expect(season.beat).toBe("castoff");
    expect(season.row?.gameweekSeq).toBe(30);
  });

  it("the founder mark comes from the card, with no stored journée", () => {
    const items = deriveReplayItems(fixture("founder"), FIXTURES.founder.history);
    const founder = items.find((item) => item.kind === "founder");
    expect(founder).toMatchObject({ beat: "founder", row: null, seasonId: null });
  });

  it("a card with no number yet has nothing to replay", () => {
    expect(deriveReplayItems(fixture("born0"), FIXTURES.born0.history)).toEqual([]);
    expect(deriveReplayItems(fixture("forming1"), FIXTURES.forming1.history)).toEqual([]);
  });

  it("the first time at a tier is the earliest journée at it, and not the first rating twice", () => {
    const base = fixture("rated");
    const season = base.season;
    const row = (seq: number, ovr: number | null, tier: HistoryRowDto["tier"]): HistoryRowDto => ({
      seasonId: season.id,
      seasonLabel: season.label,
      gameweekSeq: seq,
      ovr,
      tier,
      provisional: false,
      gameweeksCounted: seq,
      stats: { cap: ovr, sel: ovr, trf: ovr, con: ovr },
      calculatedAt: `2026-10-${String(10 + seq).padStart(2, "0")}T21:14:00Z`,
    });
    const rows = [
      row(3, 84, "pro"),
      row(4, 83, "stade"),
      row(5, 84, "pro"),
      row(6, 88, "champion"),
    ];
    const items = deriveReplayItems({ ...base, seasons: base.seasons }, rows);
    const kinds = items.map((item) => `${item.kind}:${item.tier}:${item.gameweekSeq}`);
    // First rating at J3 (PRO); the first time at PRO is that same journée, so it is not listed twice.
    expect(kinds).toContain("first_rating:pro:3");
    expect(kinds).not.toContain("tier:pro:3");
    expect(kinds).toContain("tier:champion:6");
    expect(kinds).toContain("tier:stade:4");
    // Newest first.
    expect(items[0]!.gameweekSeq).toBe(6);
  });
});
