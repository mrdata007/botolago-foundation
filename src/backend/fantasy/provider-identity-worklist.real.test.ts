/**
 * REAL-PAYLOAD run of the GW1 identity worklist: the seven committed finished
 * matches (historical payloads of 2026-10-01), the 191 reviewed Sofascore
 * mappings read on 2026-10-03, the candidate records read the same day, and the
 * sanitized date-of-birth corroboration of two read-only provider runs. Nothing
 * here is synthetic. It validates those inputs only; it is not a fresh provider
 * check, and the hypothetical (B) replay is NOT production-reviewed.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildEvidence, MANIFEST_PATH } from "../../../scripts/backend/build-gw1-identity-evidence";

const CORROBORATION = "tests/fixtures/identity/gw1-dob-corroboration-2026-10-03.json";
const built = await buildEvidence({ corroborationPath: CORROBORATION });
const disk = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const perMatch = new Map(built.perMatch.map((m) => [m.key, m]));
const get = (key: string) => {
  const m = perMatch.get(key);
  if (!m) throw new Error(`no match ${key}`);
  return m;
};

describe("REAL PAYLOADS: the worklist and the sealed manifest", () => {
  test("351 identities, deduplicated by provider id, classified by the five classes", () => {
    expect(built.worklist.counts.identitiesTotal).toBe(351);
    expect(built.worklist.counts.byProviderAndClass).toEqual({
      "flashscore|CANDIDATE_RECORD_MISSING": 19,
      "flashscore|INSUFFICIENT_EVIDENCE": 146,
      "flashscore|READY_FOR_BATCH_REVIEW": 53,
      "sofascore|AMBIGUOUS": 2,
      "sofascore|CANDIDATE_RECORD_MISSING": 11,
      "sofascore|CONFLICT": 40,
      "sofascore|INSUFFICIENT_EVIDENCE": 79,
      "sofascore|READY_FOR_BATCH_REVIEW": 1,
    });
    expect(built.worklist.counts.readyByEvidenceClass).toEqual({
      "flashscore|F1_REVIEWED_SOFASCORE_EVENTS": 32,
      "flashscore|F2_REVIEWED_SOFASCORE_SHIRT_DOB": 21,
      "sofascore|S1_DOB_CLUB_POSITION": 1,
    });
    const keys = built.worklist.rows.map((r) => `${r.provider}:${r.externalId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("collisions and dependencies: none among the ready rows; nothing depends on an unreviewed row", () => {
    expect(built.worklist.counts.collisions).toBe(0);
    expect(built.worklist.counts.dependencies).toBe(0);
    const ready = built.worklist.rows.filter((r) => r.classification === "READY_FOR_BATCH_REVIEW");
    expect(new Set(ready.map((r) => r.targetAppPlayerId)).size).toBe(ready.length);
    // A Flashscore target is always a REVIEWED Sofascore identity's app player here.
    const reviewedApps = new Set(built.snapshot.entries.map((e) => e.appPlayerId));
    for (const r of ready.filter((x) => x.provider === "flashscore")) {
      expect(reviewedApps.has(r.targetAppPlayerId as string)).toBe(true);
      expect(r.supportingMappings).toHaveLength(1);
      expect(r.dependsOn).toEqual([]);
    }
  });

  test("every ready row has a unique target, a candidate record and a factual audit reason", () => {
    for (const r of built.worklist.rows.filter(
      (x) => x.classification === "READY_FOR_BATCH_REVIEW",
    )) {
      expect(r.candidateId).not.toBeNull();
      expect(r.targetAppPlayerId).not.toBeNull();
      expect(r.proposedAuditReason).toContain("No name was used");
      expect(r.limitations.length).toBeGreaterThan(0);
    }
    for (const r of built.worklist.rows.filter(
      (x) => x.classification === "CANDIDATE_RECORD_MISSING",
    )) {
      expect(r.candidateId).toBeNull();
      expect(r.targetAppPlayerId).toBeNull();
    }
  });

  test("the F2 rows rest on a shirt number AND a birth date both providers give; nothing is a goalkeeper by 'only keeper'", () => {
    const f2 = built.worklist.rows.filter(
      (r) => r.evidenceClass === "F2_REVIEWED_SOFASCORE_SHIRT_DOB",
    );
    expect(f2).toHaveLength(21);
    for (const r of f2) {
      expect(r.evidence).toMatchObject({ shirtAgrees: true, dobCorroboration: "AGREE" });
    }
    expect(f2.filter((r) => r.priority.includes("goalkeeper"))).toHaveLength(8);
  });

  test("the sealed manifest on disk is the one this code builds, and its hash is deterministic", () => {
    const onDisk = JSON.parse(disk(MANIFEST_PATH)) as unknown;
    expect(onDisk).toEqual(JSON.parse(built.sealed.text));
    expect(disk(MANIFEST_PATH.replace(/\.json$/, ".sha256")).trim()).toBe(built.sealed.sha256);
    expect(built.sealed.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test("the manifest carries no name, no birth date and says it is review-only", () => {
    const text = built.sealed.text;
    expect(text).toContain("REVIEW_ONLY_NOT_A_PROPOSAL");
    expect(text).not.toMatch(
      /"(name|displayName|fullName|shortName|birthDate|dateOfBirth|birthday)"/i,
    );
    // The only dates are the three capture times and kickoffs, never a birth date.
    expect(text).not.toMatch(/BIRTHDAY|1995-06-15/);
  });

  test("the completed 189-row manifest is untouched", () => {
    const old = disk("docs/production/manifests/player-mapping-bulk-2026-10-02.manifest.sha256");
    expect(old).toContain("b3c4caf466b696892cdcf857a6c21789db06212485e758d19ce3415a613f2f82");
  });

  test("the corroboration stayed inside the request budget and nothing disagreed", () => {
    const f = JSON.parse(disk(CORROBORATION)) as {
      runs: { requests: { sofascore: number; flashscore: number } }[];
      results: { dob: string }[];
    };
    const total = f.runs.reduce((n, r) => n + r.requests.sofascore + r.requests.flashscore, 0);
    expect(total).toBe(28);
    expect(total).toBeLessThanOrEqual(32);
    expect(f.results).toHaveLength(21);
    expect(new Set(f.results.map((r) => r.dob))).toEqual(new Set(["AGREE"]));
  });
});

describe("REAL PAYLOADS: current (A) against HYPOTHETICAL (B, not production-reviewed)", () => {
  test("B is labelled and built from the reviewed snapshot plus ready rows only", () => {
    expect(built.hypo.capturedAt).toContain("HYPOTHETICAL");
    const extra = built.hypo.entries.filter((e) => e.mappingId.startsWith("HYPOTHETICAL:"));
    expect(extra).toHaveLength(54);
    expect(built.hypo.entries).toHaveLength(191 + 54);
    expect(extra.every((e) => e.version === "HYPOTHETICAL_NOT_PRODUCTION_REVIEWED")).toBe(true);
  });

  const expected: Record<
    string,
    { a: [string, number]; b: [string, number]; sofaUnres: number; flashA: number; flashB: number }
  > = {
    touargaFus: {
      a: ["incomplete", 1],
      b: ["incomplete", 1],
      sofaUnres: 18,
      flashA: 29,
      flashB: 21,
    },
    dhjCodm: { a: ["review", 0], b: ["review", 0], sofaUnres: 20, flashA: 32, flashB: 27 },
    wacTemara: { a: ["review", 0], b: ["incomplete", 13], sofaUnres: 22, flashA: 32, flashB: 27 },
    tiznitTanger: {
      a: ["incomplete", 3],
      b: ["incomplete", 3],
      sofaUnres: 19,
      flashA: 31,
      flashB: 27,
    },
    masZemamra: { a: ["full", 0], b: ["full", 0], sofaUnres: 22, flashA: 31, flashB: 22 },
    tetouanBerkane: {
      a: ["incomplete", 2],
      b: ["incomplete", 2],
      sofaUnres: 13,
      flashA: 31,
      flashB: 23,
    },
    kacmHusa: { a: ["simple", 0], b: ["simple", 0], sofaUnres: 18, flashA: 32, flashB: 18 },
  };
  for (const [key, want] of Object.entries(expected)) {
    test(`${key}: result, held back and unresolved appearances`, () => {
      const { a, b } = get(key);
      expect([a.after.mode, a.after.heldBack]).toEqual(want.a);
      expect([b.after.mode, b.after.heldBack]).toEqual(want.b);
      expect(b.coverage.sofascore.appearedUnresolvedIds).toHaveLength(want.sofaUnres);
      expect(a.coverage.flashscore.appearedUnresolvedIds).toHaveLength(want.flashA);
      expect(b.coverage.flashscore.appearedUnresolvedIds).toHaveLength(want.flashB);
      // No duplicate or conflicting canonical identity appears in either replay.
      expect(a.after.duplicateCanonicalIdentities).toBe(0);
      expect(b.after.duplicateCanonicalIdentities).toBe(0);
    });
  }

  test("no match is ingestion-ready, even where the legacy reconciler says full or simple", () => {
    for (const { b } of built.perMatch) {
      expect(b.stages.identityResolved).toBe(false);
      expect(b.stages.ingestionReady).toBe(false);
    }
    const mas = get("masZemamra").b.stages;
    expect([
      mas.eventsReconciled,
      mas.participationEstablished,
      mas.scoringFieldsReady,
      mas.identityResolved,
    ]).toEqual([true, true, true, false]);
  });

  test("the four stages are separate: WAC-Temara leaves review, but participation and scoring fields are not ready", () => {
    const wac = get("wacTemara").b.stages;
    expect([wac.eventsReconciled, wac.participationEstablished, wac.scoringFieldsReady]).toEqual([
      true,
      false,
      false,
    ]);
    const dhj = get("dhjCodm").b.stages;
    expect(dhj.eventsReconciled).toBe(false);
  });

  test("the canary: Maghreb Fes-Zemamra ranks first; its Flashscore gap is exactly its Sofascore gap (so is KACM-HUSA's)", () => {
    expect(built.ranking.map((r) => r.key)).toEqual([
      "masZemamra",
      "kacmHusa",
      "tetouanBerkane",
      "touargaFus",
      "wacTemara",
      "tiznitTanger",
      "dhjCodm",
    ]);
    const mas = get("masZemamra").b;
    // Every unresolved Flashscore player in the canary is the same person as an unresolved Sofascore one.
    expect(mas.coverage.flashscore.appearedUnresolvedIds).toHaveLength(22);
    expect(mas.coverage.sofascore.appearedUnresolvedIds).toHaveLength(22);
    const kacm = get("kacmHusa").b;
    expect(kacm.coverage.flashscore.appearedUnresolvedIds).toHaveLength(18);
    expect(kacm.coverage.sofascore.appearedUnresolvedIds).toHaveLength(18);
  });
});
