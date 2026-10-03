/**
 * SYNTHETIC tests of the reviewed-identity input to the reconciler.
 *
 * Every match here is built by hand from ids that exist nowhere. Nothing in
 * this file is a real payload: the real-payload replay is in
 * `provider-replay.real.test.ts`. A synthetic test shows how the code behaves
 * on a case it was built for; it says nothing about what a provider sends.
 */
import { describe, expect, test } from "bun:test";
import type { MatchSide } from "../football/provider/performance-contracts";
import {
  OBSERVED_AT,
  X,
  Y,
  Z,
  build,
  fid,
  row,
  sid,
  snapshot,
  type Spec,
} from "./provider-test-world";
import { reconcileMatch, type ProviderMatchData, type ReconcileInput } from "./provider-reconciler";
import {
  buildReviewedIdentitySnapshot,
  type ReviewedIdentitySnapshot,
} from "./reviewed-identities";

const run = (
  spec: Spec,
  reviewedIdentities?: ReviewedIdentitySnapshot,
  extra: Partial<ReconcileInput> = {},
) => reconcileMatch({ observedAt: OBSERVED_AT, ...build(spec), reviewedIdentities, ...extra });

const fixtureMessages = (r: ReturnType<typeof run>) =>
  r.discrepancies.filter((d) => d.level === "fixture").map((d) => d.code);
const find = (r: ReturnType<typeof run>, side: MatchSide, sofaShirt: number) =>
  r.players.find((p) => p.sofascoreId === sid(side, sofaShirt));

describe("SYNTHETIC: reviewed identity pairs players the shirt number cannot", () => {
  // The same person is #9 at Sofascore and #19 at Flashscore (his goal at 30).
  // Flashscore's #9 is someone else and does not play a part.
  const spec: Spec = {
    shirts: { "flashscore.home": [1, 2, 3, 4, 5, 6, 7, 8, 19, 10, 11] },
    goals: [["home", 30, 9, 19]],
  };

  test("without a mapping, a different shirt number sends the match to review", () => {
    const r = run(spec);
    expect(r.mode).toBe("review");
    expect(fixtureMessages(r)).toContain("goal_mismatch");
  });

  test("both ids mapped to the same app player: paired, scored, labelled reviewed", async () => {
    const snap = await snapshot([
      row("sofascore", sid("home", 9), X),
      row("flashscore", fid("home", 19), X),
    ]);
    const r = run(spec, snap);
    expect(r.mode).not.toBe("review");
    const player = find(r, "home", 9);
    expect(player?.flashscoreId).toBe(fid("home", 19));
    expect(player?.identityStatus).toBe("reviewed_pair");
    expect(player?.appPlayerId).toBe(X);
    expect(player?.stats.goals).toBe(1);
    expect(player?.appliedMappings.map((m) => m.mappingId).sort()).toEqual([
      `m-flashscore-${fid("home", 19)}`,
      `m-sofascore-${sid("home", 9)}`,
    ]);
  });

  test("the result states which mapping snapshot it used, and so does every evidence reference", async () => {
    const snap = await snapshot([
      row("sofascore", sid("home", 9), X),
      row("flashscore", fid("home", 19), X),
    ]);
    const r = run(spec, snap);
    expect(r.mappingSnapshot).toEqual({
      digest: snap.digest,
      capturedAt: snap.capturedAt,
      entries: 2,
    });
    const player = find(r, "home", 9);
    const refs = player?.evidence.goals?.references ?? [];
    expect(refs).toContain(`mapping-snapshot:sha256:${snap.digest}`);
    expect(refs).toContain(`mapping:sofascore:${sid("home", 9)}:m-sofascore-${sid("home", 9)}`);
  });

  test("the reviewed pair does not depend on the shirt numbers at all", async () => {
    // Swap which shirt each provider gives him; the mapping still pairs them.
    const swapped: Spec = {
      shirts: { "sofascore.home": [1, 2, 3, 4, 5, 6, 7, 8, 29, 10, 11] },
      goals: [["home", 30, 29, 9]],
    };
    const snap = await snapshot([
      row("sofascore", sid("home", 29), X),
      row("flashscore", fid("home", 9), X),
    ]);
    const r = run(swapped, snap);
    expect(r.mode).not.toBe("review");
    expect(find(r, "home", 29)?.flashscoreId).toBe(fid("home", 9));
  });
});

describe("SYNTHETIC: entries mapped to different app players are never paired by a weaker signal", () => {
  const spec: Spec = { goals: [["home", 30, 9, 9]] };

  test("same shirt, different reviewed identities: not paired, the goal goes to review", async () => {
    const snap = await snapshot([
      row("sofascore", sid("home", 9), X),
      row("flashscore", fid("home", 9), Y),
    ]);
    const r = run(spec, snap);
    expect(r.mode).toBe("review");
    expect(fixtureMessages(r)).toContain("goal_mismatch");
    const conflict = r.discrepancies.find((d) => d.code === "identity_mapping_conflict");
    expect(conflict?.shirtNumber).toBe(9);
    expect(r.unmatched.filter((u) => u.reason === "mapped_to_different_players")).toHaveLength(2);
  });

  test("linkIdentityByGoal does not override two different reviewed identities", async () => {
    const snap = await snapshot([
      row("sofascore", sid("home", 9), X),
      row("flashscore", fid("home", 9), Y),
    ]);
    const r = run(spec, snap, { linkIdentityByGoal: true });
    expect(r.mode).toBe("review");
    expect(r.discrepancies.some((d) => d.code === "identity_linked_by_goal")).toBe(false);
  });

  test("a player nobody mentions is not paired by shirt when the mappings say they differ", async () => {
    const snap = await snapshot([
      row("sofascore", sid("home", 5), X),
      row("flashscore", fid("home", 5), Y),
    ]);
    const r = run({}, snap);
    expect(find(r, "home", 5)).toBeUndefined();
    expect(r.unmatched.map((u) => `${u.provider}:${u.providerId}`)).toEqual(
      expect.arrayContaining([`sofascore:${sid("home", 5)}`, `flashscore:${fid("home", 5)}`]),
    );
    // Two starters nobody can pair are held back, not scored.
    expect(r.heldBack).toBeGreaterThan(0);
  });
});

describe("SYNTHETIC: one mapped entry and one unmapped entry is not a reviewed identity", () => {
  test("the legacy shirt pairing stays, labelled partially reviewed, with no app player", async () => {
    const snap = await snapshot([row("sofascore", sid("home", 5), X)]);
    const r = run({}, snap);
    const player = find(r, "home", 5);
    expect(player?.flashscoreId).toBe(fid("home", 5));
    expect(player?.identityStatus).toBe("partially_reviewed");
    expect(player?.appPlayerId).toBeNull();
    // The unmapped Flashscore id was not thereby approved as app player X.
    expect(player?.appliedMappings.map((m) => m.provider)).toEqual(["sofascore"]);
  });

  test("legacy pairs without any mapping are labelled unreviewed, never reviewed", () => {
    const r = run({});
    expect(r.players.every((p) => p.identityStatus === "unreviewed_legacy")).toBe(true);
    expect(r.players.every((p) => p.appPlayerId === null)).toBe(true);
    expect(r.mappingSnapshot).toBeNull();
  });

  test("an unmapped Flashscore entry is not paired to a mapped Sofascore entry of a different shirt", async () => {
    const spec: Spec = {
      shirts: { "flashscore.home": [1, 2, 3, 4, 5, 6, 7, 8, 19, 10, 11] },
      goals: [["home", 30, 9, 19]],
    };
    const snap = await snapshot([row("sofascore", sid("home", 9), X)]);
    expect(run(spec, snap).mode).toBe("review");
  });
});

describe("SYNTHETIC: inactive and unreviewed mappings are not usable", () => {
  const spec: Spec = {
    shirts: { "flashscore.home": [1, 2, 3, 4, 5, 6, 7, 8, 19, 10, 11] },
    goals: [["home", 30, 9, 19]],
  };

  test("an inactive mapping does nothing", async () => {
    const snap = await snapshot([
      row("sofascore", sid("home", 9), X),
      row("flashscore", fid("home", 19), X, { active: false }),
    ]);
    expect(snap.excluded.inactive).toBe(1);
    expect(snap.entries).toHaveLength(1);
    expect(run(spec, snap).mode).toBe("review");
  });

  test("a mapping no person reviewed does nothing", async () => {
    const snap = await snapshot([
      row("sofascore", sid("home", 9), X),
      row("flashscore", fid("home", 19), X, { reviewed: false }),
    ]);
    expect(snap.excluded.unreviewed).toBe(1);
    expect(run(spec, snap).mode).toBe("review");
  });

  test("two usable rows that contradict each other make the snapshot refuse to build", async () => {
    await expect(
      snapshot([row("sofascore", "a", X), row("sofascore", "a", Y, { mappingId: "other" })]),
    ).rejects.toThrow("more than one active reviewed mapping");
    await expect(
      snapshot([row("sofascore", "a", X), row("sofascore", "b", X, { mappingId: "other" })]),
    ).rejects.toThrow("more than one active reviewed sofascore id");
  });
});

describe("SYNTHETIC: one app player at most once per fixture", () => {
  test("two lineup entries of one provider holding the same app player send the fixture to review", () => {
    // Built by hand, bypassing the snapshot builder that would refuse it.
    const snap: ReviewedIdentitySnapshot = {
      kind: "reviewed-identity-snapshot/v1",
      capturedAt: "x",
      digest: "d",
      excluded: { inactive: 0, unreviewed: 0 },
      entries: [
        {
          provider: "sofascore",
          externalId: sid("home", 5),
          appPlayerId: X,
          mappingId: "m1",
          version: null,
          updatedAt: "x",
        },
        {
          provider: "sofascore",
          externalId: sid("home", 6),
          appPlayerId: X,
          mappingId: "m2",
          version: null,
          updatedAt: "x",
        },
      ],
    };
    const r = run({}, snap);
    expect(r.mode).toBe("review");
    expect(fixtureMessages(r)).toContain("duplicate_canonical_identity");
  });

  test("one app player on opposite sides of the fixture is a conflict, nothing is scored", async () => {
    const snap = await snapshot([
      row("sofascore", sid("home", 5), X),
      row("flashscore", fid("away", 5), X),
    ]);
    const r = run({}, snap);
    expect(r.mode).toBe("review");
    expect(fixtureMessages(r)).toContain("identity_side_conflict");
  });

  test("lineup fallback: the player the shirt rule would split in two is one record with the mapping", async () => {
    // Sofascore lists 10 starters at home, so Flashscore's lineup fills the gap.
    // The same person is #13 at Sofascore and #6 at Flashscore, where Flashscore's
    // #13 is someone else. By shirt alone his two entries are two different
    // records (and his Sofascore #13 pairs with the wrong person).
    const spec: Spec = {
      shirts: {
        "sofascore.home": [1, 2, 3, 4, 5, 13, 7, 8, 9, 10],
        "flashscore.home": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13],
      },
    };
    const snap = await snapshot([
      row("sofascore", sid("home", 13), X),
      row("flashscore", fid("home", 6), X),
    ]);
    const r = run(spec, snap);
    const holders = r.players.filter((p) => p.appPlayerId === X);
    expect(holders).toHaveLength(1);
    expect(holders[0]?.sofascoreId).toBe(sid("home", 13));
    expect(holders[0]?.flashscoreId).toBe(fid("home", 6));
    expect(fixtureMessages(r)).not.toContain("duplicate_canonical_identity");
    // Flashscore's #13 is a different person: single source, unreviewed, and not X.
    const other = r.players.find((p) => p.flashscoreId === fid("home", 13));
    expect(other?.appPlayerId).toBeNull();
    expect(other?.identityStatus).toBe("single_source_unreviewed");
  });
});

describe("SYNTHETIC: a mapping settles identity and nothing else", () => {
  test("a reviewed pair keeps a goalkeeper-versus-outfield position conflict and holds the player back", async () => {
    const data = build();
    const marked = (provider: "sofascore" | "flashscore", id: string, position: "G" | "D") => ({
      ...data[provider],
      lineups: {
        ...data[provider].lineups,
        players: data[provider].lineups.players.map((p) =>
          p.externalId === id ? { ...p, position } : p,
        ),
      },
    });
    const snap = await snapshot([
      row("sofascore", sid("home", 5), X),
      row("flashscore", fid("home", 5), X),
    ]);
    const r = reconcileMatch({
      observedAt: OBSERVED_AT,
      sofascore: marked("sofascore", sid("home", 5), "D"),
      flashscore: marked("flashscore", fid("home", 5), "G"),
      reviewedIdentities: snap,
    });
    const player = find(r, "home", 5);
    expect(player?.identityStatus).toBe("reviewed_pair");
    expect(player?.evidence.saves?.state).toBe("unknown");
    expect(player?.evidence.penaltiesSaved?.state).toBe("unknown");
    expect(player?.mode).toBe("incomplete");
    expect(r.heldBack).toBeGreaterThan(0);
    expect(
      r.discrepancies.some((d) => d.code === "position_conflict" && d.level === "player"),
    ).toBe(true);
  });

  test("the keeper disagreement is caught the other way round too (Sofascore keeper, Flashscore outfield)", async () => {
    const data = build();
    const mark = (provider: "sofascore" | "flashscore", id: string, position: "G" | "D") => ({
      ...data[provider],
      lineups: {
        ...data[provider].lineups,
        players: data[provider].lineups.players.map((p) =>
          p.externalId === id ? { ...p, position } : p,
        ),
      },
    });
    const snap = await snapshot([
      row("sofascore", sid("home", 5), X),
      row("flashscore", fid("home", 5), X),
    ]);
    const r = reconcileMatch({
      observedAt: OBSERVED_AT,
      sofascore: mark("sofascore", sid("home", 5), "G"),
      flashscore: mark("flashscore", fid("home", 5), "D"),
      reviewedIdentities: snap,
    });
    expect(find(r, "home", 5)?.mode).toBe("incomplete");
    expect(
      r.discrepancies.some((d) => d.code === "position_conflict" && d.level === "player"),
    ).toBe(true);
  });

  test("a reviewed pair is recorded as reviewed_mapping, not as a shirt-only pairing", async () => {
    const spec: Spec = {
      shirts: { "flashscore.home": [1, 2, 3, 4, 5, 6, 7, 8, 19, 10, 11] },
    };
    const snap = await snapshot([
      row("sofascore", sid("home", 9), X),
      row("flashscore", fid("home", 19), X),
    ]);
    const player = find(run(spec, snap), "home", 9);
    expect(player?.identity).toBe("reviewed_mapping");
    expect(player?.evidence.goals?.references).not.toContain("identity:shirt-only");
    expect(player?.evidence.goals?.references).toContain("identity-status:reviewed_pair");
    // Without the mapping the same two entries are not paired at all.
    expect(find(run(spec), "home", 9)).toBeUndefined();
  });

  test("a mapped player the providers disagree about starting stays held back", async () => {
    const data = build();
    const flashscore: ProviderMatchData = {
      ...data.flashscore,
      lineups: {
        ...data.flashscore.lineups,
        players: data.flashscore.lineups.players.map((p) =>
          p.externalId === fid("home", 5) ? { ...p, starter: false } : p,
        ),
      },
    };
    const snap = await snapshot([
      row("sofascore", sid("home", 5), X),
      row("flashscore", fid("home", 5), X),
    ]);
    const r = reconcileMatch({
      observedAt: OBSERVED_AT,
      sofascore: data.sofascore,
      flashscore,
      reviewedIdentities: snap,
    });
    const player = find(r, "home", 5);
    expect(player?.identityStatus).toBe("reviewed_pair");
    // Identity is known; whether and for how long he played is not.
    expect(player?.evidence.minutes?.state).toBe("unknown");
    expect(player?.stats.minutes).toBeUndefined();
    expect(r.discrepancies.some((d) => d.code === "substitution_mismatch")).toBe(true);
  });

  test("a mapped player in only one lineup is single source, with the reviewed app player but no events invented", async () => {
    const spec: Spec = { shirts: { "flashscore.home": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] } };
    const snap = await snapshot([row("sofascore", sid("home", 11), Z)]);
    const r = run(spec, snap);
    // Flashscore lists 10 home starters: Sofascore's lineup is used alone for #11.
    const player = find(r, "home", 11);
    expect(player?.identityStatus).toBe("reviewed_single_source");
    expect(player?.appPlayerId).toBe(Z);
    expect(player?.flashscoreId).toBeNull();
    expect(player?.evidence.goals?.references).toContain("other-lineup-broken:flashscore");
  });

  test("changing every display name changes no identity decision", async () => {
    const spec: Spec = {
      shirts: { "flashscore.home": [1, 2, 3, 4, 5, 6, 7, 8, 19, 10, 11] },
      goals: [["home", 30, 9, 19]],
    };
    const snap = await snapshot([
      row("sofascore", sid("home", 9), X),
      row("flashscore", fid("home", 19), X),
    ]);
    const plain = run(spec, snap);
    const renamed = run(
      { ...spec, names: (p, s, n) => `ZZ ${n} ${s} ${p}`.split("").reverse().join("") },
      snap,
    );
    const strip = (r: ReturnType<typeof run>) =>
      JSON.stringify({
        mode: r.mode,
        players: r.players.map((p) => [
          p.sofascoreId,
          p.flashscoreId,
          p.identityStatus,
          p.appPlayerId,
          p.stats,
        ]),
        unmatched: r.unmatched.map((u) => [u.provider, u.providerId, u.reason]),
        discrepancies: r.discrepancies.map((d) => [d.code, d.level]),
      });
    expect(strip(renamed)).toBe(strip(plain));
  });
});

describe("SYNTHETIC: compatibility, determinism, no side effects", () => {
  test("with no input the result is the legacy result, labelled unreviewed", async () => {
    const spec: Spec = { goals: [["home", 30, 9, 9]] };
    const bare = run(spec);
    const empty = run(spec, await snapshot([]));
    const core = (r: ReturnType<typeof run>) =>
      JSON.stringify({
        mode: r.mode,
        heldBack: r.heldBack,
        players: r.players.map((p) => [p.sofascoreId, p.flashscoreId, p.identity, p.stats, p.mode]),
        unmatched: r.unmatched,
        discrepancies: r.discrepancies,
      });
    expect(core(empty)).toBe(core(bare));
    expect(bare.mappingSnapshot).toBeNull();
    expect(bare.players.every((p) => p.appliedMappings.length === 0)).toBe(true);
  });

  test("the same payloads and snapshot give the same result, and the digest ignores row order", async () => {
    const rows = [row("sofascore", sid("home", 9), X), row("flashscore", fid("home", 19), X)];
    const a = await snapshot(rows);
    const b = await snapshot([...rows].reverse());
    expect(b.digest).toBe(a.digest);
    const spec: Spec = {
      shirts: { "flashscore.home": [1, 2, 3, 4, 5, 6, 7, 8, 19, 10, 11] },
      goals: [["home", 30, 9, 19]],
    };
    expect(JSON.stringify(run(spec, a))).toBe(JSON.stringify(run(spec, b)));
    expect(JSON.stringify(run(spec, a))).toBe(JSON.stringify(run(spec, a)));
  });

  test("the digest changes when a mapping changes, and not when only an excluded row changes", async () => {
    const base = await snapshot([row("sofascore", "a", X)]);
    expect((await snapshot([row("sofascore", "a", Y)])).digest).not.toBe(base.digest);
    expect(
      (await snapshot([row("sofascore", "a", X), row("sofascore", "b", Y, { active: false })]))
        .digest,
    ).toBe(base.digest);
  });

  test("a replay opens no network connection and touches no database", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => {
      calls += 1;
      throw new Error("network is not allowed in a replay");
    }) as unknown as typeof fetch;
    try {
      const snap = await snapshot([
        row("sofascore", sid("home", 9), X),
        row("flashscore", fid("home", 19), X),
      ]);
      run(
        {
          shirts: { "flashscore.home": [1, 2, 3, 4, 5, 6, 7, 8, 19, 10, 11] },
          goals: [["home", 30, 9, 19]],
        },
        snap,
      );
    } finally {
      globalThis.fetch = original;
    }
    expect(calls).toBe(0);
  });

  test("the reconciler files import no database client, network client or clock source", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of [
      "provider-reconciler.ts",
      "provider-matching.ts",
      "reviewed-identities.ts",
      "provider-replay.ts",
      "provider-identity-bridge.ts",
    ]) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      const imports = [...source.matchAll(/^import[\s\S]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
      expect(
        imports.filter((i) => /supabase|fetch|server|node:|gateway|repository/i.test(i ?? "")),
      ).toEqual([]);
      expect(source).not.toMatch(/Date\.now\(|new Date\(|\bfetch\(|\.from\(["']/);
    }
  });
});
