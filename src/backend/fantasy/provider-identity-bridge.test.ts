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
import { X, Y, build, fid, row, sid, snapshot, type Spec } from "./provider-test-world";

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
    const one = bridgeFixture(build(), snap);
    const f5 = one.unresolved.find((u) => u.flashscoreId === fid("home", 5));
    expect(f5?.reason).toBe("no_event_alignment_shirt_only");
    expect(one.suggestions).toHaveLength(0);
  });

  test("a shirt number plus one aligned event is supported, with the source references", async () => {
    const data = withEvents({}, () => ({
      sofascore: [yellow("sofascore", "home", 40, sid("home", 5))],
      flashscore: [yellow("flashscore", "home", 42, fid("home", 5))],
    }));
    const snap = await snapshot([row("sofascore", sid("home", 5), X)]);
    const { suggestions } = bridgeFixture(data, snap);
    expect(suggestions).toHaveLength(1);
    const s = suggestions[0];
    expect(s?.flashscoreId).toBe(fid("home", 5));
    expect(s?.sofascoreId).toBe(sid("home", 5));
    expect(s?.appPlayerId).toBe(X);
    expect(s?.sofascoreMapping.mappingId).toBe(`m-sofascore-${sid("home", 5)}`);
    expect(s?.shirtAgrees).toBe(true);
    expect(s?.events[0]).toMatchObject({
      signal: "yellow_card",
      sofascore: { provider: "sofascore", fixtureId: "S-FIX", minute: 40, side: "home" },
      flashscore: { provider: "flashscore", fixtureId: "F-FIX", minute: 42, side: "home" },
    });
    expect(s?.confidenceLimits.length).toBeGreaterThan(0);
  });

  test("one event alone, with different shirt numbers, is not a bridge", async () => {
    const spec: Spec = {
      shirts: { "flashscore.home": [1, 2, 3, 4, 5, 6, 7, 8, 19, 10, 11] },
      goals: [["home", 30, 9, 19]],
    };
    const snap = await snapshot([row("sofascore", sid("home", 9), X)]);
    const { suggestions, unresolved } = bridgeFixture(build(spec), snap);
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
    const { suggestions } = bridgeFixture(data, snap);
    const s = suggestions.find((x) => x.flashscoreId === fid("home", 19));
    expect(s?.shirtAgrees).toBe(false);
    expect(s?.events.map((e) => e.signal).sort()).toEqual(["goal_scored", "yellow_card"]);
  });

  test("no bridge when the Sofascore partner has no reviewed mapping, and it says so", async () => {
    const data = withEvents({}, () => ({
      sofascore: [yellow("sofascore", "home", 40, sid("home", 5))],
      flashscore: [yellow("flashscore", "home", 40, fid("home", 5))],
    }));
    const { suggestions, unresolved } = bridgeFixture(data, await snapshot([]));
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
    const { suggestions } = bridgeFixture(data, snap);
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
    const { suggestions, unresolved } = bridgeFixture(data, snap);
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
      bridgeFixture({ sofascore, flashscore }, snap).unresolved.find(
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
