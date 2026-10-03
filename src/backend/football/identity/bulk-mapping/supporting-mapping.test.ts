import { describe, expect, test } from "bun:test";
import type { ProviderMappingDto } from "../mapping-contracts";
import { checkSupportingMapping, type SupportingBinding } from "./supporting-mapping";

const MAPPING = "11111111-1111-4111-8111-111111111111";
const PLAYER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const PROPOSAL = "44444444-4444-4444-8444-444444444444";
const DIGEST = "a".repeat(64);

const binding: SupportingBinding = {
  provider: "sofascore",
  externalId: "S1",
  mappingId: MAPPING,
  appPlayerId: PLAYER,
  provenanceProposalId: PROPOSAL,
  stateDigest: DIGEST,
};

/** The row as the database reports it today. */
const row = (over: Partial<ProviderMappingDto> = {}): ProviderMappingDto => ({
  mappingId: MAPPING,
  provider: "sofascore",
  entityType: "player",
  externalId: "S1",
  appPlayerId: PLAYER,
  active: true,
  manuallyCorrected: true,
  reviewed: true,
  reviewProvenance: "executed_proposal",
  provenanceProposalId: PROPOSAL,
  correctedAt: "2026-10-03T08:00:00Z",
  sourceVersion: `football_player_mapping:${PROPOSAL}`,
  updatedAt: "2026-10-03T08:00:00Z",
  stateDigest: DIGEST,
  ...over,
});
const code = (v: ReturnType<typeof checkSupportingMapping>) => (v.ok ? "ok" : v.code);

describe("checkSupportingMapping (against the actual mapping row)", () => {
  test("the mapping the manifest froze is accepted", () => {
    expect(code(checkSupportingMapping(binding, row()))).toBe("ok");
  });

  test("no row, or a row of another provider or id, is refused", () => {
    expect(code(checkSupportingMapping(binding, null))).toBe("supporting_mapping_missing");
    expect(code(checkSupportingMapping(binding, undefined))).toBe("supporting_mapping_missing");
    expect(code(checkSupportingMapping(binding, row({ provider: "flashscore" })))).toBe(
      "supporting_mapping_not_sofascore",
    );
    expect(code(checkSupportingMapping(binding, row({ externalId: "S2" })))).toBe(
      "supporting_mapping_row_changed",
    );
    expect(code(checkSupportingMapping(binding, row({ mappingId: OTHER })))).toBe(
      "supporting_mapping_row_changed",
    );
  });

  test("inactive, unreviewed and retargeted rows are refused with the database's own codes", () => {
    expect(code(checkSupportingMapping(binding, row({ active: false })))).toBe(
      "supporting_mapping_inactive",
    );
    expect(
      code(
        checkSupportingMapping(
          binding,
          row({ reviewed: false, reviewProvenance: "none", provenanceProposalId: null }),
        ),
      ),
    ).toBe("supporting_mapping_unreviewed");
    expect(code(checkSupportingMapping(binding, row({ appPlayerId: OTHER })))).toBe(
      "supporting_mapping_target_mismatch",
    );
  });

  test("a version label alone never makes a row reviewed: only the database's `reviewed` does", () => {
    // The label looks right; the database says the audit record does not back it.
    const labelled = row({ reviewed: false, reviewProvenance: "none", provenanceProposalId: null });
    expect(labelled.sourceVersion).toBe(`football_player_mapping:${PROPOSAL}`);
    expect(code(checkSupportingMapping(binding, labelled))).toBe("supporting_mapping_unreviewed");
  });

  test("any other change of the row (same target, still active, still reviewed) is caught by the digest", () => {
    expect(code(checkSupportingMapping(binding, row({ stateDigest: "b".repeat(64) })))).toBe(
      "supporting_mapping_changed",
    );
    expect(code(checkSupportingMapping(binding, row({ provenanceProposalId: OTHER })))).toBe(
      "supporting_mapping_changed",
    );
  });

  test("a changed-and-restored row is a new state: the old binding does not match it", () => {
    // Same row, same player, active and reviewed again, but written by a later proposal: new digest.
    expect(
      code(
        checkSupportingMapping(
          binding,
          row({ provenanceProposalId: OTHER, stateDigest: "c".repeat(64) }),
        ),
      ),
    ).toBe("supporting_mapping_changed");
  });
});
