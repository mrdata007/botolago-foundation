/**
 * REAL-PAYLOAD replay: the seven finished 2026/27 round-1 matches, from the
 * committed Phase 0 responses (captured 2026-10-01), against the committed copy
 * of the 191 reviewed Sofascore player mappings read from production on
 * 2026-10-03. Nothing here is synthetic.
 *
 * It validates those historical payloads only. It is not a fresh provider
 * check, and it does not say production scoring is fixed.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildBridgeReviewSet } from "./provider-identity-bridge";
import { replayFixture, type FixtureReplay } from "./provider-replay";
import {
  COMMITTED_GW1_MATCHES,
  COMMITTED_OBSERVED_AT,
  loadCommittedMatch,
} from "./provider-replay-fixtures";
import { reconcileMatch } from "./provider-reconciler";
import { buildReviewedIdentitySnapshot, type MappingRowInput } from "./reviewed-identities";

const committed = JSON.parse(
  readFileSync(
    new URL(
      "../../../tests/fixtures/identity/reviewed-player-mappings-2026-10-03.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { capturedAt: string; rows: MappingRowInput[] };

const snapshot = await buildReviewedIdentitySnapshot(committed.rows, committed.capturedAt);
const loaded = COMMITTED_GW1_MATCHES.map((m) => ({ m, data: loadCommittedMatch(m) }));
const replays = new Map<string, FixtureReplay>(
  loaded.map(({ m, data }) => [
    m.key,
    replayFixture({ observedAt: COMMITTED_OBSERVED_AT, snapshot, ...data }),
  ]),
);
const get = (key: string) => {
  const found = replays.get(key);
  if (!found) throw new Error(`no replay for ${key}`);
  return found;
};

describe("REAL PAYLOADS: the reviewed mapping snapshot", () => {
  test("is the 191 active reviewed Sofascore player mappings, with provenance and a digest", () => {
    expect(snapshot.entries).toHaveLength(191);
    expect(snapshot.excluded).toEqual({ inactive: 0, unreviewed: 0 });
    expect(snapshot.digest).toBe(
      "e9dfc4059f8252a8a5faf014982004c97bc0c690724c6a633df2cac28fbc7874",
    );
    expect(snapshot.entries.every((e) => e.provider === "sofascore")).toBe(true);
    expect(
      snapshot.entries.every(
        (e) => e.mappingId.length > 0 && e.version?.startsWith("football_player_mapping:"),
      ),
    ).toBe(true);
    expect(new Set(snapshot.entries.map((e) => e.appPlayerId)).size).toBe(191);
  });
});

describe("REAL PAYLOADS: before (no mapping input) and after (mapping-aware), seven matches", () => {
  const expected: Record<string, { mode: string; scorable: string | null; held: number }> = {
    touargaFus: { mode: "incomplete", scorable: "simple", held: 1 },
    dhjCodm: { mode: "review", scorable: null, held: 0 },
    wacTemara: { mode: "review", scorable: null, held: 0 },
    tiznitTanger: { mode: "incomplete", scorable: "full", held: 3 },
    masZemamra: { mode: "full", scorable: "full", held: 0 },
    tetouanBerkane: { mode: "incomplete", scorable: "full", held: 2 },
    kacmHusa: { mode: "simple", scorable: "simple", held: 0 },
  };

  for (const [key, want] of Object.entries(expected)) {
    test(`${key}: readiness is ${want.mode} before and after, because no Flashscore id is mapped`, () => {
      const r = get(key);
      for (const side of [r.before, r.after]) {
        expect(side.mode).toBe(want.mode as never);
        expect(side.scorableMode).toBe(want.scorable as never);
        expect(side.heldBack).toBe(want.held);
      }
      // The mapping changes how pairs are labelled, never what they score.
      expect(r.after.unmatchedRecords).toBe(r.before.unmatchedRecords);
      expect(r.after.fixtureBlockers).toEqual(r.before.fixtureBlockers);
    });
  }

  test("no match is IDENTITY_RESOLVED, and none is ingestion-ready", () => {
    for (const r of replays.values()) {
      expect(r.stages.identityResolved).toBe(false);
      expect(r.stages.ingestionReady).toBe(false);
      expect(r.coverage.flashscore.reviewed).toBe(0);
    }
  });

  test("the three stages are reported apart: events and scoring can be fine while identity is not", () => {
    const mas = get("masZemamra");
    expect([
      mas.stages.eventsReconciled,
      mas.stages.scoringReady,
      mas.stages.identityResolved,
    ]).toEqual([true, true, false]);
    const dhj = get("dhjCodm");
    expect([dhj.stages.eventsReconciled, dhj.stages.scoringReady]).toEqual([false, false]);
    expect(dhj.after.fixtureBlockers).toEqual([
      "The providers do not name the same away scorer for the goal at minute 26.",
    ]);
    const wac = get("wacTemara");
    expect(wac.after.fixtureBlockers).toEqual([
      "The providers do not name the same home scorer for the goal at minute 81.",
    ]);
  });

  test("reviewed identities present in the actual matches (Sofascore entries that appeared)", () => {
    const got = [...replays.entries()].map(([k, r]) => [
      k,
      r.coverage.sofascore.entries,
      r.coverage.sofascore.appeared,
      r.coverage.sofascore.appearedReviewed,
    ]);
    expect(got).toEqual([
      ["touargaFus", 40, 30, 12],
      ["dhjCodm", 40, 32, 12],
      ["wacTemara", 39, 31, 8],
      ["tiznitTanger", 39, 28, 9],
      ["masZemamra", 39, 31, 9],
      ["tetouanBerkane", 40, 31, 18],
      ["kacmHusa", 40, 32, 14],
    ]);
    const unresolved = [...replays.values()].reduce(
      (n, r) => n + r.coverage.sofascore.appearedUnresolvedIds.length,
      0,
    );
    expect(unresolved).toBe(133);
  });

  test("pairs that exist are labelled partially reviewed or unreviewed, never reviewed pairs", () => {
    for (const { data } of loaded) {
      const result = reconcileMatch({
        observedAt: COMMITTED_OBSERVED_AT,
        ...data,
        reviewedIdentities: snapshot,
      });
      expect(result.players.some((p) => p.identityStatus === "reviewed_pair")).toBe(false);
      expect(
        result.players.some(
          (p) => p.appPlayerId !== null && p.identityStatus !== "reviewed_single_source",
        ),
      ).toBe(false);
    }
  });

  test("replay is deterministic and leaves the snapshot untouched", () => {
    const before = JSON.stringify(snapshot);
    const again = loaded.map(({ data }) =>
      replayFixture({ observedAt: COMMITTED_OBSERVED_AT, snapshot, ...data }),
    );
    expect(JSON.stringify(again)).toBe(JSON.stringify([...replays.values()]));
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});

describe("REAL PAYLOADS: Flashscore bridge suggestions", () => {
  const linked = loaded.map(({ m, data }) => ({
    link: { sofascoreFixtureId: m.sofascoreId, flashscoreFixtureId: m.flashscoreId },
    ...data,
  }));
  const set = buildBridgeReviewSet(linked, snapshot);

  test("one consolidated review set over the seven matches", () => {
    expect(set.summary.flashscoreEntriesAppeared).toBe(218);
    expect(set.summary.suggested).toBe(33);
    expect(set.summary.unresolved).toBe(185);
    expect(set.summary.unresolvedByReason).toEqual({
      no_candidate: 6,
      no_event_alignment_shirt_only: 126,
      sofascore_partner_not_reviewed: 53,
    });
    expect(set.conflicts).toEqual([]);
    expect(set.rejectedFixtures).toEqual([]);
  });

  test("every suggestion rests on a reviewed Sofascore mapping and a counted event, and no goalkeeper is bridged", () => {
    for (const s of set.suggestions) {
      expect(
        snapshot.entries.some(
          (e) => e.mappingId === s.sofascoreMapping.mappingId && e.appPlayerId === s.appPlayerId,
        ),
      ).toBe(true);
      for (const e of s.evidence) {
        expect(e.events.length).toBeGreaterThan(0);
        expect(e.shirtAgrees || e.events.length >= 2).toBe(true);
      }
      expect(s.priority).not.toContain("goalkeeper");
    }
  });

  test("what-if: hypothetical Flashscore mappings made from the suggestions would move WAC-Temara out of review", async () => {
    // HYPOTHETICAL: these are NOT mappings. They exist only inside this test.
    const hypothetical = await buildReviewedIdentitySnapshot(
      [
        ...committed.rows,
        ...set.suggestions.map((s, i) => ({
          mappingId: `hypothetical-${i}`,
          provider: "flashscore" as const,
          externalId: s.flashscoreId,
          appPlayerId: s.appPlayerId,
          active: true,
          reviewed: true,
          version: null,
          updatedAt: "hypothetical",
        })),
      ],
      "hypothetical",
    );
    const wac = loaded.find(({ m }) => m.key === "wacTemara");
    const dhj = loaded.find(({ m }) => m.key === "dhjCodm");
    if (!wac || !dhj) throw new Error("missing fixture");
    const wacAfter = reconcileMatch({
      observedAt: COMMITTED_OBSERVED_AT,
      ...wac.data,
      reviewedIdentities: hypothetical,
    });
    expect(wacAfter.mode).toBe("incomplete");
    expect(wacAfter.discrepancies.filter((d) => d.level === "fixture")).toEqual([]);
    // DHJ-CODM stays in review: five of its scorers have no reviewed Sofascore mapping.
    const dhjAfter = reconcileMatch({
      observedAt: COMMITTED_OBSERVED_AT,
      ...dhj.data,
      reviewedIdentities: hypothetical,
    });
    expect(dhjAfter.mode).toBe("review");
  });
});

describe("REAL PAYLOADS: the bridge refuses two unrelated matches", () => {
  test("Sofascore of one match with Flashscore of another is never bridged, however the events fall", () => {
    const [a, b] = loaded;
    if (!a || !b) throw new Error("missing fixtures");
    const crossed = buildBridgeReviewSet(
      [
        {
          link: { sofascoreFixtureId: a.m.sofascoreId, flashscoreFixtureId: b.m.flashscoreId },
          sofascore: a.data.sofascore,
          flashscore: b.data.flashscore,
        },
      ],
      snapshot,
    );
    expect(crossed.suggestions).toEqual([]);
    expect(crossed.rejectedFixtures).toHaveLength(1);
  });

  test("all seven committed pairs verify as the same finished match", () => {
    const all = buildBridgeReviewSet(
      loaded.map(({ m, data }) => ({
        link: { sofascoreFixtureId: m.sofascoreId, flashscoreFixtureId: m.flashscoreId },
        ...data,
      })),
      snapshot,
    );
    expect(all.rejectedFixtures).toEqual([]);
    expect(all.summary.flashscoreEntriesAppeared).toBe(218);
  });
});
