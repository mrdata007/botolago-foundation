/**
 * SYNTHETIC tests of the Flashscore bridge suggestions (hand-built matches, see
 * provider-test-world.ts), and the committed real-payload replay of the seven
 * Phase 0 matches in provider-replay.real.test.ts. A synthetic test says how the
 * code behaves on a case it was built for, nothing about what a provider sends.
 */
import { describe, expect, test } from "bun:test";
import type { MatchSide, PerformanceIncident } from "../football/provider/performance-contracts";
import { bridgeFixture, buildBridgeReviewSet } from "./provider-identity-bridge";
import type { ProviderMatchData } from "./provider-reconciler";
import { X, Y, build, fid, linkOf, row, sid, snapshot, type Spec } from "./provider-test-world";

const incident = (
  provider: "sofascore" | "flashscore",
  over: Partial<PerformanceIncident> & Pick<PerformanceIncident, "kind" | "side" | "minute">,
): PerformanceIncident => ({
  provider,
  addedMinutes: null,
  player: null,
  assist: null,
  playerIn: null,
  playerOut: null,
  rawType: over.kind,
  rawClass: null,
  ...over,
});

const ref = (id: string) => ({ externalId: id, name: "n" });

/** A match plus extra incidents the same event in both providers (sofascore id, flashscore id). */
function withEvents(
  spec: Spec,
  extra: (b: ReturnType<typeof build>) => {
    sofascore?: PerformanceIncident[];
    flashscore?: PerformanceIncident[];
  },
) {
  const base = build(spec);
  const more = extra(base);
  const add = (data: ProviderMatchData, list: PerformanceIncident[] = []) => ({
    ...data,
    incidents: [...data.incidents, ...list],
  });
  return {
    link: linkOf(spec),
    sofascore: add(base.sofascore, more.sofascore),
    flashscore: add(base.flashscore, more.flashscore),
  };
}

const yellow = (
  provider: "sofascore" | "flashscore",
  side: MatchSide,
  minute: number,
  id: string,
) => incident(provider, { kind: "yellow_card", side, minute, player: ref(id) });

describe("SYNTHETIC: bridge suggestions need independent, unambiguous evidence", () => {
  test("a shirt number alone (club and position too) is not a bridge", async () => {
    const snap = await snapshot([row("sofascore", sid("home", 5), X)]);
    const one = bridgeFixture({ link: linkOf(), ...build() }, snap);
    const f5 = one.unresolved.find((u) => u.flashscoreId === fid("home", 5));
    expect(f5?.reason).toBe("no_event_alignment_shirt_only");
    expect(one.candidates).toHaveLength(0);
  });

  test("a shirt number plus one aligned event is supported, with the source references", async () => {
    const data = withEvents({}, () => ({
      sofascore: [yellow("sofascore", "home", 40, sid("home", 5))],
      flashscore: [yellow("flashscore", "home", 42, fid("home", 5))],
    }));
    const snap = await snapshot([row("sofascore", sid("home", 5), X)]);
    const { candidates: suggestions } = bridgeFixture(data, snap);
    expect(suggestions).toHaveLength(1);
    const s = suggestions[0];
    expect(s?.flashscoreId).toBe(fid("home", 5));
    expect(s?.sofascoreId).toBe(sid("home", 5));
    expect(s?.appPlayerId).toBe(X);
    expect(s?.evidence.shirtAgrees).toBe(true);
    expect(s?.evidence.events[0]).toMatchObject({
      signal: "yellow_card",
      sofascore: { provider: "sofascore", fixtureId: "S-FIX", minute: 40, side: "home" },
      flashscore: { provider: "flashscore", fixtureId: "F-FIX", minute: 42, side: "home" },
    });
    expect(s?.mapping.mappingId).toBe(`m-sofascore-${sid("home", 5)}`);
  });

  test("one event alone, with different shirt numbers, is not a bridge", async () => {
    const spec: Spec = {
      shirts: { "flashscore.home": [1, 2, 3, 4, 5, 6, 7, 8, 19, 10, 11] },
      goals: [["home", 30, 9, 19]],
    };
    const snap = await snapshot([row("sofascore", sid("home", 9), X)]);
    const { candidates: suggestions, unresolved } = bridgeFixture(
      { link: linkOf(spec), ...build(spec) },
      snap,
    );
    expect(suggestions.find((s) => s.flashscoreId === fid("home", 19))).toBeUndefined();
    expect(unresolved.find((u) => u.flashscoreId === fid("home", 19))?.reason).toBe(
      "single_event_shirt_disagrees",
    );
  });

  test("two different events align the pair, so differing shirt numbers do not matter", async () => {
    const spec: Spec = {
      shirts: { "flashscore.home": [1, 2, 3, 4, 5, 6, 7, 8, 19, 10, 11] },
      goals: [["home", 30, 9, 19]],
    };
    const data = withEvents(spec, () => ({
      sofascore: [yellow("sofascore", "home", 70, sid("home", 9))],
      flashscore: [yellow("flashscore", "home", 71, fid("home", 19))],
    }));
    const snap = await snapshot([row("sofascore", sid("home", 9), X)]);
    const { candidates: suggestions } = bridgeFixture(data, snap);
    const s = suggestions.find((x) => x.flashscoreId === fid("home", 19));
    expect(s?.evidence.shirtAgrees).toBe(false);
    expect(s?.evidence.events.map((e) => e.signal).sort()).toEqual(["goal_scored", "yellow_card"]);
  });

  test("no bridge when the Sofascore partner has no reviewed mapping, and it says so", async () => {
    const data = withEvents({}, () => ({
      sofascore: [yellow("sofascore", "home", 40, sid("home", 5))],
      flashscore: [yellow("flashscore", "home", 40, fid("home", 5))],
    }));
    const { candidates: suggestions, unresolved } = bridgeFixture(data, await snapshot([]));
    expect(suggestions).toHaveLength(0);
    expect(unresolved.find((u) => u.flashscoreId === fid("home", 5))?.reason).toBe(
      "sofascore_partner_not_reviewed",
    );
  });

  test("two close cards of the same kind cannot be told apart by minute: not a bridge", async () => {
    const data = withEvents({}, () => ({
      sofascore: [
        yellow("sofascore", "home", 40, sid("home", 5)),
        yellow("sofascore", "home", 41, sid("home", 6)),
      ],
      flashscore: [
        yellow("flashscore", "home", 40, fid("home", 5)),
        yellow("flashscore", "home", 41, fid("home", 6)),
      ],
    }));
    const snap = await snapshot([
      row("sofascore", sid("home", 5), X),
      row("sofascore", sid("home", 6), Y),
    ]);
    const { candidates: suggestions } = bridgeFixture(data, snap);
    // The cards do not align (each has two neighbours); only a shirt remains, which is not enough.
    expect(suggestions).toHaveLength(0);
  });

  test("an event that ties one of them to a different entry is a contradiction, not a bridge", async () => {
    // Shirts agree at #5, but the card at 40 is Sofascore #5 / Flashscore #6.
    const data = withEvents({}, () => ({
      sofascore: [yellow("sofascore", "home", 40, sid("home", 5))],
      flashscore: [yellow("flashscore", "home", 40, fid("home", 6))],
    }));
    const snap = await snapshot([row("sofascore", sid("home", 5), X)]);
    const { candidates: suggestions, unresolved } = bridgeFixture(data, snap);
    expect(suggestions.find((s) => s.flashscoreId === fid("home", 5))).toBeUndefined();
    expect(unresolved.find((u) => u.flashscoreId === fid("home", 6))?.reason).toBe(
      "contradicting_event",
    );
  });

  test("a goalkeeper marker against a known outfield position blocks the bridge", async () => {
    const data = withEvents({}, () => ({
      sofascore: [yellow("sofascore", "home", 40, sid("home", 5))],
      flashscore: [yellow("flashscore", "home", 40, fid("home", 5))],
    }));
    const flashscore = {
      ...data.flashscore,
      lineups: {
        ...data.flashscore.lineups,
        players: data.flashscore.lineups.players.map((p) =>
          p.externalId === fid("home", 5) ? { ...p, position: "G" as const } : p,
        ),
      },
    };
    const sofascore = {
      ...data.sofascore,
      lineups: {
        ...data.sofascore.lineups,
        players: data.sofascore.lineups.players.map((p) =>
          p.externalId === sid("home", 5) ? { ...p, position: "D" as const } : p,
        ),
      },
    };
    const snap = await snapshot([row("sofascore", sid("home", 5), X)]);
    expect(
      bridgeFixture({ link: linkOf(), sofascore, flashscore }, snap).unresolved.find(
        (u) => u.flashscoreId === fid("home", 5),
      )?.reason,
    ).toBe("position_conflict");
  });

  test("renaming every player changes no suggestion (names are never read)", async () => {
    const make = (names?: Spec["names"]) =>
      withEvents({ names }, () => ({
        sofascore: [yellow("sofascore", "home", 40, sid("home", 5))],
        flashscore: [yellow("flashscore", "home", 40, fid("home", 5))],
      }));
    const snap = await snapshot([row("sofascore", sid("home", 5), X)]);
    const a = buildBridgeReviewSet([make()], snap);
    const b = buildBridgeReviewSet([make((p, s, n) => `Renamed ${p}-${s}-${n}`)], snap);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(a)).not.toMatch(/Renamed|home 5/);
  });

  test("the review set is one consolidated, deterministic list and writes nothing", async () => {
    const data = withEvents({}, () => ({
      sofascore: [yellow("sofascore", "home", 40, sid("home", 5))],
      flashscore: [yellow("flashscore", "home", 40, fid("home", 5))],
    }));
    const snap = await snapshot([row("sofascore", sid("home", 5), X)]);
    const a = buildBridgeReviewSet([data], snap);
    expect(JSON.stringify(buildBridgeReviewSet([data], snap))).toBe(JSON.stringify(a));
    expect(a.summary.suggested).toBe(1);
    expect(a.summary.suggested + a.summary.unresolved).toBe(a.summary.flashscoreEntriesAppeared);
    expect(a.snapshotDigest).toBe(snap.digest);
  });
});

/** Same spec twice, as two different finished matches (ids, kickoff) over the same players. */
const match = (over: Spec, events?: Parameters<typeof withEvents>[1]) =>
  withEvents(over, events ?? (() => ({})));

const cardPair =
  (sShirt: number, fShirt: number, minute = 40, sPrefix = "", fPrefix = "") =>
  () => ({
    sofascore: [yellow("sofascore", "home", minute, sid("home", sShirt, sPrefix))],
    flashscore: [yellow("flashscore", "home", minute, fid("home", fShirt, fPrefix))],
  });

describe("SYNTHETIC: one identity seen in several matches is one suggestion", () => {
  const first: Spec = { sofascoreFixtureId: "S-1", flashscoreFixtureId: "F-1" };
  const second: Spec = {
    sofascoreFixtureId: "S-2",
    flashscoreFixtureId: "F-2",
    kickoffAt: "2026-10-08T10:00:00.000Z",
  };

  test("same Flashscore id and same app player in two matches: ONE suggestion with both matches' evidence", async () => {
    const snap = await snapshot([row("sofascore", sid("home", 5), X)]);
    const a = match(first, cardPair(5, 5));
    const b = match(second, cardPair(5, 5, 70));
    const set = buildBridgeReviewSet([a, b], snap);
    const own = set.suggestions.filter((s) => s.flashscoreId === fid("home", 5));
    expect(own).toHaveLength(1);
    expect(own[0]?.evidence.map((e) => e.fixture.flashscoreFixtureId)).toEqual(["F-1", "F-2"]);
    expect(own[0]?.confidenceLimits[0]).toContain("more than one finished match");
    expect(set.conflicts).toEqual([]);
  });

  test("the result does not depend on the order the matches are given in", async () => {
    const snap = await snapshot([row("sofascore", sid("home", 5), X)]);
    const a = match(first, cardPair(5, 5));
    const b = match(second, cardPair(5, 5, 70));
    expect(JSON.stringify(buildBridgeReviewSet([b, a], snap))).toBe(
      JSON.stringify(buildBridgeReviewSet([a, b], snap)),
    );
  });

  test("same Flashscore id suggested for two different app players is a CONFLICT, neither is suggested", async () => {
    // In the second match the same Flashscore player lines up with a different Sofascore id.
    const snap = await snapshot([
      row("sofascore", sid("home", 5), X),
      row("sofascore", sid("home", 5, "t-"), Y),
    ]);
    const a = match(first, cardPair(5, 5));
    const b = match({ ...second, sofaIdPrefix: "t-" }, cardPair(5, 5, 70, "t-"));
    for (const order of [
      [a, b],
      [b, a],
    ]) {
      const set = buildBridgeReviewSet(order, snap);
      expect(set.suggestions.find((s) => s.flashscoreId === fid("home", 5))).toBeUndefined();
      expect(set.conflicts).toHaveLength(1);
      expect(set.conflicts[0]).toMatchObject({
        kind: "flashscore_id_two_app_players",
        flashscoreIds: [fid("home", 5)],
        appPlayerIds: [X, Y],
      });
    }
    expect(JSON.stringify(buildBridgeReviewSet([a, b], snap))).toBe(
      JSON.stringify(buildBridgeReviewSet([b, a], snap)),
    );
  });

  test("two Flashscore ids competing for one app player is a CONFLICT, whichever came first", async () => {
    const snap = await snapshot([row("sofascore", sid("home", 5), X)]);
    const a = match(first, cardPair(5, 5));
    const b = match({ ...second, flashIdPrefix: "g-" }, () => ({
      sofascore: [yellow("sofascore", "home", 70, sid("home", 5))],
      flashscore: [yellow("flashscore", "home", 70, fid("home", 5, "g-"))],
    }));
    const forward = buildBridgeReviewSet([a, b], snap);
    const backward = buildBridgeReviewSet([b, a], snap);
    expect(forward.suggestions).toEqual([]);
    expect(forward.conflicts).toHaveLength(1);
    expect(forward.conflicts[0]).toMatchObject({
      kind: "app_player_two_flashscore_ids",
      appPlayerIds: [X],
      flashscoreIds: [fid("home", 5), fid("home", 5, "g-")].sort(),
    });
    expect(JSON.stringify(backward)).toBe(JSON.stringify(forward));
  });

  test("two Flashscore entries for one app player inside one match: neither is chosen by list order", async () => {
    // A hand-built snapshot (the builder would refuse it) maps two Sofascore ids to X.
    const snap = {
      ...(await snapshot([row("sofascore", sid("home", 5), X)])),
      entries: [
        ...(await snapshot([row("sofascore", sid("home", 5), X)])).entries,
        ...(await snapshot([row("sofascore", sid("home", 6), X, { mappingId: "m2" })])).entries,
      ],
    };
    const data = match({}, () => ({
      sofascore: [
        yellow("sofascore", "home", 40, sid("home", 5)),
        yellow("sofascore", "home", 80, sid("home", 6)),
      ],
      flashscore: [
        yellow("flashscore", "home", 40, fid("home", 5)),
        yellow("flashscore", "home", 80, fid("home", 6)),
      ],
    }));
    const one = bridgeFixture(data, snap);
    expect(one.candidates).toEqual([]);
    expect(one.unresolved.filter((u) => u.reason === "app_player_claimed_twice")).toHaveLength(2);
  });
});

describe("SYNTHETIC: two events must be two distinct events", () => {
  const spec: Spec = {
    shirts: { "flashscore.home": [1, 2, 3, 4, 5, 6, 7, 8, 19, 10, 11] },
    goals: [["home", 30, 9, 19]],
  };

  test("a goal listed twice by both providers is still one event: no bridge on differing shirts", async () => {
    const doubled: Spec = {
      ...spec,
      goals: [
        ["home", 30, 9, 19],
        ["home", 30, 9, 19],
      ],
    };
    const snap = await snapshot([row("sofascore", sid("home", 9), X)]);
    const one = bridgeFixture({ link: linkOf(doubled), ...build(doubled) }, snap);
    expect(one.candidates.find((c) => c.flashscoreId === fid("home", 19))).toBeUndefined();
    expect(one.unresolved.find((u) => u.flashscoreId === fid("home", 19))?.reason).toBe(
      "single_event_shirt_disagrees",
    );
    expect(one.unresolved.find((u) => u.flashscoreId === fid("home", 19))?.events).toHaveLength(1);
  });

  test("a card listed twice is not two events and not even a unique alignment", async () => {
    const data = match({ shirts: spec.shirts }, () => ({
      sofascore: [
        yellow("sofascore", "home", 40, sid("home", 9)),
        yellow("sofascore", "home", 40, sid("home", 9)),
      ],
      flashscore: [
        yellow("flashscore", "home", 40, fid("home", 19)),
        yellow("flashscore", "home", 40, fid("home", 19)),
      ],
    }));
    const snap = await snapshot([row("sofascore", sid("home", 9), X)]);
    expect(bridgeFixture(data, snap).candidates).toEqual([]);
  });

  test("two genuinely different events do corroborate", async () => {
    const data = match(spec, cardPair(9, 19, 70));
    const snap = await snapshot([row("sofascore", sid("home", 9), X)]);
    const c = bridgeFixture(data, snap).candidates.find((x) => x.flashscoreId === fid("home", 19));
    expect(c?.evidence.events).toHaveLength(2);
  });
});

describe("SYNTHETIC: a goalkeeper/outfield disagreement is detected in either direction", () => {
  const withPositions = (sofaPos: "G" | "D" | null, flashPos: "G" | "D" | null) => {
    const data = match({}, cardPair(5, 5));
    const set = (d: typeof data.sofascore, id: string, position: "G" | "D" | null) => ({
      ...d,
      lineups: {
        ...d.lineups,
        players: d.lineups.players.map((p) => (p.externalId === id ? { ...p, position } : p)),
      },
    });
    return {
      ...data,
      sofascore: set(data.sofascore, sid("home", 5), sofaPos),
      flashscore: set(data.flashscore, fid("home", 5), flashPos),
    };
  };
  const reason = async (sofaPos: "G" | "D" | null, flashPos: "G" | "D" | null) => {
    const snap = await snapshot([row("sofascore", sid("home", 5), X)]);
    const one = bridgeFixture(withPositions(sofaPos, flashPos), snap);
    return one.unresolved.find((u) => u.flashscoreId === fid("home", 5))?.reason ?? "bridged";
  };

  test("Flashscore says goalkeeper, Sofascore says outfield", async () => {
    expect(await reason("D", "G")).toBe("position_conflict");
  });
  test("Sofascore says goalkeeper, Flashscore says outfield", async () => {
    expect(await reason("G", "D")).toBe("position_conflict");
  });
  test("agreement, and an unknown position on either side, are not conflicts", async () => {
    expect(await reason("G", "G")).toBe("bridged");
    expect(await reason("D", "D")).toBe("bridged");
    expect(await reason("G", null)).toBe("bridged");
    expect(await reason(null, "G")).toBe("bridged");
  });
});

describe("SYNTHETIC: the bridge is used only for the same verified match", () => {
  const spec: Spec = { goals: [["home", 30, 9, 9]] };
  const snapFor = () => snapshot([row("sofascore", sid("home", 9), X)]);

  test("positive control: the linked, finished, matching pair is used", async () => {
    const data = match(spec, cardPair(9, 9));
    expect(bridgeFixture(data, await snapFor()).rejected).toBeNull();
  });

  const rejected = async (
    mutate: (d: ReturnType<typeof match>) => ReturnType<typeof match>,
  ): Promise<string> => {
    const one = bridgeFixture(mutate(match(spec, cardPair(9, 9))), await snapFor());
    expect(one.candidates).toEqual([]);
    return one.rejected?.reasons.join(" ") ?? "NOT REJECTED";
  };

  test("a payload that is not the linked fixture is refused, even with similar events", async () => {
    const other = match({ ...spec, sofascoreFixtureId: "S-OTHER" }, cardPair(9, 9));
    const one = bridgeFixture({ ...other, link: linkOf(spec) }, await snapFor());
    expect(one.rejected?.reasons.join(" ")).toContain("not the linked Sofascore fixture");
    expect(one.candidates).toEqual([]);
  });

  test("a different final score is refused", async () => {
    expect(
      await rejected((d) => ({
        ...d,
        flashscore: { ...d.flashscore, summary: { ...d.flashscore.summary, homeScore: 2 } },
      })),
    ).toContain("same final score");
  });

  test("a different kickoff is refused", async () => {
    expect(
      await rejected((d) => ({
        ...d,
        flashscore: {
          ...d.flashscore,
          summary: { ...d.flashscore.summary, kickoffAt: "2026-10-08T10:00:00.000Z" },
        },
      })),
    ).toContain("same kickoff");
  });

  test("a match not reported finished is refused", async () => {
    expect(
      await rejected((d) => ({
        ...d,
        sofascore: { ...d.sofascore, summary: { ...d.sofascore.summary, finished: false } },
      })),
    ).toContain("finished");
  });

  test("goals that do not add up to the score on a side are refused", async () => {
    expect(
      await rejected((d) => ({
        ...d,
        sofascore: { ...d.sofascore, incidents: d.sofascore.incidents.slice(1) },
      })),
    ).toContain("do not add up");
  });

  test("an own goal (an unknown incident) is covered: the match is still verified", async () => {
    const own = {
      provider: "sofascore" as const,
      kind: "unknown" as const,
      side: "home" as const,
      minute: 50,
      addedMinutes: null,
      player: null,
      assist: null,
      playerIn: null,
      playerOut: null,
      rawType: "goal",
      rawClass: "ownGoal",
    };
    // Home score 2: one known goal plus one own goal, listed by both providers.
    const withOwn = (d: ReturnType<typeof match>) => ({
      ...d,
      sofascore: {
        ...d.sofascore,
        summary: { ...d.sofascore.summary, homeScore: 2 },
        incidents: [...d.sofascore.incidents, own],
      },
      flashscore: {
        ...d.flashscore,
        summary: { ...d.flashscore.summary, homeScore: 2 },
        incidents: [...d.flashscore.incidents, { ...own, provider: "flashscore" as const }],
      },
    });
    const data = withOwn(match(spec, cardPair(9, 9)));
    expect(bridgeFixture(data, await snapFor()).rejected).toBeNull();
    // Too many known goals for the score is still refused, and so is a missing own goal.
    expect(
      await rejected((d) => ({
        ...d,
        sofascore: {
          ...d.sofascore,
          summary: { ...d.sofascore.summary, homeScore: 0 },
          incidents: d.sofascore.incidents,
        },
        flashscore: { ...d.flashscore, summary: { ...d.flashscore.summary, homeScore: 0 } },
      })),
    ).toContain("do not add up");
    const missing = match(spec, cardPair(9, 9));
    const noOwn = {
      ...missing,
      sofascore: { ...missing.sofascore, summary: { ...missing.sofascore.summary, homeScore: 2 } },
      flashscore: {
        ...missing.flashscore,
        summary: { ...missing.flashscore.summary, homeScore: 2 },
      },
    };
    expect(bridgeFixture(noOwn, await snapFor()).rejected?.reasons.join(" ")).toContain(
      "do not add up",
    );
  });

  test("a refused match shows in the consolidated set and contributes no suggestion", async () => {
    const bad = match({ ...spec, sofascoreFixtureId: "S-OTHER" }, cardPair(9, 9));
    const set = buildBridgeReviewSet([{ ...bad, link: linkOf(spec) }], await snapFor());
    expect(set.suggestions).toEqual([]);
    expect(set.rejectedFixtures).toHaveLength(1);
    expect(set.unresolved[0]?.reason).toBe("fixture_not_verified");
  });
});
