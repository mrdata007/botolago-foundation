/**
 * SYNTHETIC tests of the identity worklist, its dependencies and collisions, the
 * hypothetical rows and the canary ranking (hand-built matches, see
 * provider-test-world.ts). The real-payload run is provider-identity-worklist.real.test.ts.
 */
import { describe, expect, test } from "bun:test";
import type { PerformanceIncident } from "../football/provider/performance-contracts";
import type { CorroborationResult } from "./provider-identity-corroboration";
import { rankMatches } from "./provider-canary-ranking";
import {
  buildWorklist,
  classifySofascoreCandidate,
  hypotheticalMappingRows,
  hypotheticalSnapshot,
  sealManifest,
  selectCorroborationPairs,
  type FlashCandidateRow,
  type SofaCandidateRow,
  type WorklistInput,
} from "./provider-identity-worklist";
import { X, Y, Z, build, fid, linkOf, row, sid, snapshot, type Spec } from "./provider-test-world";

const T = {
  payloadObservedAt: "2026-10-01T12:00:00.000Z",
  mappingSnapshotCapturedAt: "2026-10-03T07:00:00.000Z",
  candidateRecordsReadAt: "2026-10-03T07:05:00.000Z",
  corroborationObservedAt: null,
};
const yellow = (
  provider: "sofascore" | "flashscore",
  minute: number,
  id: string,
): PerformanceIncident => ({
  provider,
  kind: "yellow_card",
  side: "home",
  minute,
  addedMinutes: null,
  player: { externalId: id, name: "n" },
  assist: null,
  playerIn: null,
  playerOut: null,
  rawType: "yellow_card",
  rawClass: null,
});
/** A match where home #5 is carded in both providers (a shirt plus one event: a supported pair). */
function carded(spec: Spec = {}, shirt = 5, sPrefix = "", fPrefix = "") {
  const base = build({ ...spec, sofaIdPrefix: sPrefix, flashIdPrefix: fPrefix });
  return {
    link: linkOf(spec),
    sofascore: {
      ...base.sofascore,
      incidents: [yellow("sofascore", 40, sid("home", shirt, sPrefix))],
    },
    flashscore: {
      ...base.flashscore,
      incidents: [yellow("flashscore", 40, fid("home", shirt, fPrefix))],
    },
  };
}
const flashCand = (externalId: string): FlashCandidateRow => ({
  candidateId: `cand-${externalId}`,
  externalId,
  status: "unmapped",
  rev: 2,
  club: "c",
  complete: "COMPLETE",
});
const sofaCand = (externalId: string, over: Partial<SofaCandidateRow> = {}): SofaCandidateRow => ({
  candidateId: `cand-${externalId}`,
  externalId,
  status: "unmapped",
  rev: 2,
  nObs: 1,
  club: "c",
  complete: "COMPLETE",
  regDisagree: false,
  dobState: "valid",
  dobJan1: false,
  openProposal: false,
  extMapped: false,
  nOpts: 25,
  dobMatches: 1,
  target: Z,
  targetSignals: { position: "match", club: "match", shirt: "match", dob: "match", flags: [] },
  targetSmActive: true,
  targetSofaMapped: false,
  targetFlashMapped: false,
  ...over,
});
const allFlash = (...fixtures: ReturnType<typeof carded>[]) =>
  [...new Set(fixtures.flatMap((f) => f.flashscore.lineups.players.map((p) => p.externalId)))].map(
    flashCand,
  );
const input = async (
  over: Partial<WorklistInput> & Pick<WorklistInput, "fixtures">,
): Promise<WorklistInput> => ({
  snapshot: await snapshot([row("sofascore", sid("home", 5), X)]),
  flashCandidates: allFlash(...(over.fixtures as ReturnType<typeof carded>[])),
  sofaCandidates: [],
  lockedSquadAppPlayerIds: new Set(),
  corroboration: [],
  times: T,
  ...over,
});
const find = (w: Awaited<ReturnType<typeof buildWorklist>>, provider: string, id: string) =>
  w.rows.find((r) => r.provider === provider && r.externalId === id);

describe("SYNTHETIC: identity worklist classes", () => {
  test("a supported Flashscore pair on a reviewed Sofascore identity is READY with its evidence chain", async () => {
    const w = await buildWorklist(await input({ fixtures: [carded()] }));
    const r = find(w, "flashscore", fid("home", 5));
    expect(r).toMatchObject({
      classification: "READY_FOR_BATCH_REVIEW",
      evidenceClass: "F1_REVIEWED_SOFASCORE_EVENTS",
      targetAppPlayerId: X,
      candidateId: `cand-${fid("home", 5)}`,
      dependsOn: [],
    });
    expect(r?.supportingMappings[0]).toMatchObject({
      externalId: sid("home", 5),
      mappingId: `m-sofascore-${sid("home", 5)}`,
    });
    expect(r?.proposedAuditReason).toContain("No name was used");
    expect(r?.limitations.length).toBeGreaterThan(0);
  });

  test("one identity in two matches is one row (deduplicated by provider identity, not by fixture)", async () => {
    const a = carded({ sofascoreFixtureId: "S-1", flashscoreFixtureId: "F-1" });
    const b = carded({
      sofascoreFixtureId: "S-2",
      flashscoreFixtureId: "F-2",
      kickoffAt: "2026-10-08T10:00:00.000Z",
    });
    const w = await buildWorklist(await input({ fixtures: [a, b] }));
    expect(
      w.rows.filter((r) => r.provider === "flashscore" && r.externalId === fid("home", 5)),
    ).toHaveLength(1);
    expect(find(w, "flashscore", fid("home", 5))?.fixtures).toHaveLength(2);
  });

  test("NO candidate record and NO safe canonical match are different classes", async () => {
    const f = carded();
    const w = await buildWorklist(
      await input({
        fixtures: [f],
        flashCandidates: allFlash(f).filter((c) => c.externalId !== fid("home", 7)),
        sofaCandidates: [
          sofaCand(sid("home", 6), { dobMatches: 0, target: null, targetSignals: null }),
        ],
      }),
    );
    expect(find(w, "flashscore", fid("home", 7))?.classification).toBe("CANDIDATE_RECORD_MISSING");
    expect(find(w, "sofascore", sid("home", 7))?.classification).toBe("CANDIDATE_RECORD_MISSING");
    const noMatch = find(w, "sofascore", sid("home", 6));
    expect(noMatch?.classification).toBe("INSUFFICIENT_EVIDENCE");
    expect(noMatch?.candidateId).toBe(`cand-${sid("home", 6)}`);
    expect(noMatch?.missingEvidence.join(" ")).toContain("same birth date");
  });

  test("Sofascore classes from the structured signals", () => {
    const c = (over: Partial<SofaCandidateRow>) =>
      classifySofascoreCandidate(sofaCand("1", over)).classification;
    expect(c({})).toBe("READY_FOR_BATCH_REVIEW");
    expect(c({ dobJan1: true })).toBe("INSUFFICIENT_EVIDENCE");
    expect(c({ dobState: "missing" })).toBe("INSUFFICIENT_EVIDENCE");
    expect(c({ regDisagree: true })).toBe("CONFLICT");
    expect(c({ dobMatches: 2 })).toBe("AMBIGUOUS");
    expect(c({ nObs: 2 })).toBe("AMBIGUOUS");
    expect(
      c({
        targetSignals: {
          position: "conflict",
          club: "match",
          shirt: "match",
          dob: "match",
          flags: [],
        },
      }),
    ).toBe("CONFLICT");
    expect(c({ targetSofaMapped: true })).toBe("CONFLICT");
    expect(c({ extMapped: true })).toBe("CONFLICT");
    expect(
      c({
        targetSignals: {
          position: "no_signal",
          club: "match",
          shirt: "match",
          dob: "match",
          flags: [],
        },
      }),
    ).toBe("INSUFFICIENT_EVIDENCE");
  });
});

describe("SYNTHETIC: dependencies are explicit, never presented as reviewed", () => {
  // Home #5 is NOT a reviewed Sofascore identity; its Flashscore twin's events support the pairing.
  const noReview = () => snapshot([]);

  test("a Flashscore row on a PROPOSED Sofascore row depends on it and says so", async () => {
    const f = carded();
    const w = await buildWorklist(
      await input({
        fixtures: [f],
        snapshot: await noReview(),
        sofaCandidates: [sofaCand(sid("home", 5))],
      }),
    );
    const sofa = find(w, "sofascore", sid("home", 5));
    const flash = find(w, "flashscore", fid("home", 5));
    expect(sofa?.classification).toBe("READY_FOR_BATCH_REVIEW");
    expect(flash).toMatchObject({
      classification: "READY_FOR_BATCH_REVIEW",
      evidenceClass: "F3_DEPENDS_ON_PROPOSED_SOFASCORE",
      targetAppPlayerId: Z,
      dependsOn: [sofa?.rowId],
      supportingMappings: [],
    });
    expect(flash?.limitations.join(" ")).toContain("itself only proposed");
    expect(flash?.evidence).toMatchObject({ pairedSofascoreMapping: "PROPOSED_NOT_REVIEWED" });
    expect(w.counts.dependencies).toBe(1);
  });

  test("when the Sofascore row is not ready, the Flashscore row is not ready either", async () => {
    const f = carded();
    const w = await buildWorklist(
      await input({
        fixtures: [f],
        snapshot: await noReview(),
        sofaCandidates: [
          sofaCand(sid("home", 5), { dobMatches: 0, target: null, targetSignals: null }),
        ],
      }),
    );
    const flash = find(w, "flashscore", fid("home", 5));
    expect(flash?.classification).toBe("INSUFFICIENT_EVIDENCE");
    expect(flash?.dependsOn).toEqual([]);
    expect(flash?.missingEvidence.join(" ")).toContain("canonical app-player target");
  });

  test("two Sofascore ids proposed for one app player collide: neither is ready, and nothing depending on them is", async () => {
    const f = carded();
    const w = await buildWorklist(
      await input({
        fixtures: [f],
        snapshot: await noReview(),
        sofaCandidates: [sofaCand(sid("home", 5)), sofaCand(sid("home", 6))],
      }),
    );
    expect(find(w, "sofascore", sid("home", 5))?.classification).toBe("CONFLICT");
    expect(find(w, "sofascore", sid("home", 6))?.classification).toBe("CONFLICT");
    expect(find(w, "flashscore", fid("home", 5))?.classification).toBe("INSUFFICIENT_EVIDENCE");
    expect(w.counts.collisions).toBe(2);
  });
});

describe("SYNTHETIC: date-of-birth corroboration as the second signal", () => {
  const f = () => carded({}, 5); // events pair home #5; #9 has no event
  const corr = (dob: CorroborationResult["dob"], s: string, fl: string): CorroborationResult => ({
    sofascoreFixtureId: "S-FIX",
    sofascorePlayerId: s,
    flashscorePlayerId: fl,
    dob,
    sofascoreState: "valid",
    flashscoreState: "valid",
    flashscoreFormat: "iso_date",
  });
  const snap = () =>
    snapshot([row("sofascore", sid("home", 5), X), row("sofascore", sid("home", 9), Y)]);

  test("a shirt-only pair with a reviewed partner and NO corroboration is insufficient, and says what is missing", async () => {
    const w = await buildWorklist(await input({ fixtures: [f()], snapshot: await snap() }));
    const r = find(w, "flashscore", fid("home", 9));
    expect(r?.classification).toBe("INSUFFICIENT_EVIDENCE");
    expect(r?.evidence).toMatchObject({ dobCorroboration: "NOT_FETCHED" });
    expect(r?.missingEvidence.join(" ")).toContain("birth date");
    expect(selectCorroborationPairs(w, { maxPairs: 5 }).map((p) => p.flashscorePlayerId)).toContain(
      fid("home", 9),
    );
  });

  test("shirt plus an AGREEING birth date is READY (class F2)", async () => {
    const w = await buildWorklist(
      await input({
        fixtures: [f()],
        snapshot: await snap(),
        corroboration: [corr("AGREE", sid("home", 9), fid("home", 9))],
      }),
    );
    expect(find(w, "flashscore", fid("home", 9))).toMatchObject({
      classification: "READY_FOR_BATCH_REVIEW",
      evidenceClass: "F2_REVIEWED_SOFASCORE_SHIRT_DOB",
      targetAppPlayerId: Y,
    });
  });

  test("a DISAGREEING birth date is a CONFLICT, even with a supported pair", async () => {
    const w = await buildWorklist(
      await input({
        fixtures: [f()],
        snapshot: await snap(),
        corroboration: [
          corr("DISAGREE", sid("home", 9), fid("home", 9)),
          corr("DISAGREE", sid("home", 5), fid("home", 5)),
        ],
      }),
    );
    expect(find(w, "flashscore", fid("home", 9))?.classification).toBe("CONFLICT");
    expect(find(w, "flashscore", fid("home", 5))?.classification).toBe("CONFLICT");
  });

  test("no signal from a provider is never a disagreement", async () => {
    const w = await buildWorklist(
      await input({
        fixtures: [f()],
        snapshot: await snap(),
        corroboration: [corr("NO_SIGNAL_FLASHSCORE", sid("home", 9), fid("home", 9))],
      }),
    );
    expect(find(w, "flashscore", fid("home", 9))?.classification).toBe("INSUFFICIENT_EVIDENCE");
  });
});

describe("SYNTHETIC: manifest, hypothetical rows, ranking", () => {
  test("the manifest hash is deterministic, carries no name, and the READY rows are the only hypothetical ones", async () => {
    const mk = async () =>
      buildWorklist(await input({ fixtures: [carded({ names: () => "Secret Name" })] }));
    const a = await sealManifest(await mk());
    const b = await sealManifest(await mk());
    expect(b.sha256).toBe(a.sha256);
    expect(a.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(a.text).not.toContain("Secret Name");
    expect(a.text).toContain("REVIEW_ONLY_NOT_A_PROPOSAL");
    const w = await mk();
    const rows = hypotheticalMappingRows(w);
    expect(rows.length).toBe(
      w.rows.filter((r) => r.classification === "READY_FOR_BATCH_REVIEW").length,
    );
    expect(
      rows.every(
        (r) =>
          r.mappingId.startsWith("HYPOTHETICAL:") &&
          r.version === "HYPOTHETICAL_NOT_PRODUCTION_REVIEWED",
      ),
    ).toBe(true);
    const snap = await hypotheticalSnapshot((await input({ fixtures: [carded()] })).snapshot, w);
    expect(snap.capturedAt).toContain("HYPOTHETICAL");
    expect(snap.entries.some((e) => e.mappingId.startsWith("HYPOTHETICAL:"))).toBe(true);
  });

  test("ranking: a match whose evidence stages are cleared beats one with fewer unresolved identities", () => {
    const w = (key: string, over: Partial<Parameters<typeof rankMatches>[0][number]>) => ({
      key,
      eventsReconciled: true,
      participationEstablished: true,
      scoringFieldsReady: true,
      unresolvedAppearances: 40,
      unresolvedWithScoringIncidents: 5,
      heldBack: 0,
      blockers: [],
      ...over,
    });
    const ranked = rankMatches([
      w("fewIdsButHeldBack", {
        participationEstablished: false,
        scoringFieldsReady: false,
        unresolvedAppearances: 5,
        unresolvedWithScoringIncidents: 0,
        heldBack: 2,
      }),
      w("ready", {}),
      w("review", {
        eventsReconciled: false,
        participationEstablished: false,
        scoringFieldsReady: false,
        unresolvedAppearances: 1,
      }),
    ]);
    expect(ranked.map((r) => r.key)).toEqual(["ready", "fewIdsButHeldBack", "review"]);
  });
});

describe("SYNTHETIC: already-reviewed and already-claimed Flashscore identities are not new work", () => {
  test("a Flashscore id that already has a reviewed mapping gets no row", async () => {
    const f = carded();
    const w = await buildWorklist(
      await input({
        fixtures: [f],
        snapshot: await snapshot([
          row("sofascore", sid("home", 5), X),
          row("flashscore", fid("home", 5), X),
        ]),
      }),
    );
    expect(find(w, "flashscore", fid("home", 5))).toBeUndefined();
    // And the hypothetical snapshot still builds (no duplicate_external_id).
    await expect(
      hypotheticalSnapshot((await input({ fixtures: [f] })).snapshot, w),
    ).resolves.toBeDefined();
  });

  test("a candidate that is not unmapped is a CONFLICT, never READY", async () => {
    const f = carded();
    const base = await input({ fixtures: [f] });
    const w = await buildWorklist({
      ...base,
      flashCandidates: base.flashCandidates.map((c) =>
        c.externalId === fid("home", 5) ? { ...c, status: "mapped" } : c,
      ),
    });
    expect(find(w, "flashscore", fid("home", 5))?.classification).toBe("CONFLICT");
  });
});
