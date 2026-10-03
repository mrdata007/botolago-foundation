import { describe, expect, test } from "bun:test";
import { BULK_MANIFEST } from "@/components/admin/player-mappings/bulk-manifest";
import { BULK_REASONS } from "./contract";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsonbFingerprint, mapProposalFingerprint } from "./fingerprint";
import type { ManifestRow } from "./manifest";

describe("the proposal fingerprint, recomputed", () => {
  test("it reproduces all 189 fingerprints the database gave the completed Sofascore batch", async () => {
    const rows = (BULK_MANIFEST as { rows: ManifestRow[] }).rows;
    expect(rows).toHaveLength(189);
    let matched = 0;
    for (const r of rows) {
      const i = r.fingerprintInputs;
      const fp = await mapProposalFingerprint({
        sofascoreCandidateId: i.sofascoreCandidateId,
        flashscoreCandidateId: null,
        sofascoreExternalId: i.sofascoreExternalId,
        flashscoreExternalId: null,
        appPlayerId: i.appPlayerId,
        basis: i.basis,
        evidence: i.evidence,
        signals: i.signals,
        candidateRevisions: i.candidateRevisions,
        positionDisagreement: i.positionDisagreement,
        reason: BULK_REASONS[r.tier],
      });
      if (fp === r.expectedFingerprint) matched += 1;
    }
    expect(matched).toBe(189);
  });
});

/**
 * Two Flashscore proposals made by the REAL database functions (with the supporting-dependency
 * migration applied) on a synthetic world: the evidence they stored, and the fingerprint the database
 * gave each. The client recomputes the evidence-reference digest and the fingerprint from the same
 * inputs and must reach the same values: this is what lets a manifest freeze the new fingerprints
 * before any proposal exists. Synthetic ids only.
 */
describe("the dependency-bound proposal fingerprint, recomputed", () => {
  const golden = JSON.parse(
    readFileSync(
      resolve(
        import.meta.dir,
        "../../../../../tests/fixtures/identity/dependency-guard-golden-proposals.json",
      ),
      "utf8",
    ),
  ) as {
    sofascoreCandidateId: string | null;
    flashscoreCandidateId: string;
    sofascoreExternalId: string | null;
    flashscoreExternalId: string;
    appPlayerId: string;
    basis: string;
    evidence: Record<string, unknown> & { refs: unknown; refsDigest: string; supporting: unknown };
    signals: Record<string, unknown>;
    candidateRevisions: Record<string, number>;
    positionDisagreement: boolean;
    reason: string;
    fingerprint: string;
  }[];

  test("the evidence-reference digest follows from the references", async () => {
    for (const g of golden)
      expect(await jsonbFingerprint(g.evidence.refs)).toBe(g.evidence.refsDigest);
  });

  test("the proposal fingerprint follows from the stored inputs, supporting block included", async () => {
    expect(golden.length).toBeGreaterThanOrEqual(2);
    for (const g of golden) {
      expect(g.evidence.supporting).toBeDefined();
      expect(await mapProposalFingerprint(g)).toBe(g.fingerprint);
    }
  });

  test("a different supporting state gives a different fingerprint (it is part of the proof)", async () => {
    const g = golden[0]!;
    const changed = {
      ...g,
      evidence: {
        ...g.evidence,
        supporting: { ...(g.evidence.supporting as object), stateDigest: "0".repeat(64) },
      },
    };
    expect(await mapProposalFingerprint(changed)).not.toBe(g.fingerprint);
  });
});
