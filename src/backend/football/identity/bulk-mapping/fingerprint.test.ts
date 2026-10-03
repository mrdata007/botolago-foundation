import { describe, expect, test } from "bun:test";
import { BULK_MANIFEST } from "@/components/admin/player-mappings/bulk-manifest";
import { BULK_REASONS } from "./contract";
import { mapProposalFingerprint } from "./fingerprint";
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
