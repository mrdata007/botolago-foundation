import { describe, expect, test } from "bun:test";
import type { CandidateDto, ProposalDto } from "../mapping-contracts";
import { checkSupportingMapping, type SupportingBinding } from "./supporting-mapping";

const MAPPING = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const FIRST = "44444444-4444-4444-8444-444444444444";
const SECOND = "55555555-5555-4555-8555-555555555555";
const binding: SupportingBinding = {
  provider: "sofascore",
  externalId: "S1",
  candidateId: "66666666-6666-4666-8666-666666666666",
  mappingId: MAPPING,
  appPlayerId: TARGET,
  version: `football_player_mapping:${FIRST}`,
};

const candidate = (patch: Partial<CandidateDto> = {}): CandidateDto =>
  ({
    id: binding.candidateId,
    provider: "sofascore",
    externalId: "S1",
    status: "mapped",
    existingMappingId: MAPPING,
    ...patch,
  }) as CandidateDto;

const executed = (id: string, at: string, after: Record<string, unknown>): ProposalDto =>
  ({ id, status: "executed", executedAt: at, executedAfter: after }) as unknown as ProposalDto;

const created = executed(FIRST, "2026-10-03T06:00:00.000Z", {
  rows: [
    {
      mappingId: MAPPING,
      provider: "sofascore",
      externalId: "S1",
      appPlayerId: TARGET,
      active: true,
    },
  ],
});
const code = (v: ReturnType<typeof checkSupportingMapping>) => (v.ok ? "ok" : v.code);

describe("checkSupportingMapping", () => {
  test("the mapping the manifest froze is accepted", () => {
    expect(code(checkSupportingMapping(binding, candidate(), [created]))).toBe("ok");
  });

  test("no candidate record, a different id, an inactive mapping, a different row", () => {
    expect(code(checkSupportingMapping(binding, undefined, [created]))).toBe(
      "supporting_candidate_missing",
    );
    expect(code(checkSupportingMapping(binding, candidate({ externalId: "S2" }), [created]))).toBe(
      "supporting_identity_changed",
    );
    expect(
      code(checkSupportingMapping(binding, candidate({ status: "unmapped" }), [created])),
    ).toBe("supporting_mapping_not_active");
    expect(
      code(checkSupportingMapping(binding, candidate({ existingMappingId: OTHER }), [created])),
    ).toBe("supporting_mapping_row_changed");
  });

  test("no executed history is refused, never assumed good", () => {
    expect(code(checkSupportingMapping(binding, candidate(), []))).toBe(
      "supporting_history_unavailable",
    );
    // An executed proposal about another row is not history for this one.
    const other = executed(SECOND, "2026-10-03T07:00:00.000Z", {
      rows: [{ mappingId: OTHER, appPlayerId: TARGET, active: true }],
    });
    expect(code(checkSupportingMapping(binding, candidate(), [other]))).toBe(
      "supporting_history_unavailable",
    );
  });

  test("the LAST executed write decides: a later retarget, a later deactivation, a later reactivation", () => {
    const retarget = executed(SECOND, "2026-10-03T07:00:00.000Z", {
      mappingId: MAPPING,
      appPlayerId: OTHER,
      active: true,
    });
    expect(code(checkSupportingMapping(binding, candidate(), [created, retarget]))).toBe(
      "supporting_mapping_retargeted",
    );
    const off = executed(SECOND, "2026-10-03T07:00:00.000Z", {
      mappingId: MAPPING,
      appPlayerId: TARGET,
      active: false,
    });
    expect(code(checkSupportingMapping(binding, candidate(), [created, off]))).toBe(
      "supporting_mapping_not_active",
    );
    // Off and back on leaves the same target and an active row, but a different version: refused.
    const on = executed("77777777-7777-4777-8777-777777777777", "2026-10-03T08:00:00.000Z", {
      mappingId: MAPPING,
      appPlayerId: TARGET,
      active: true,
    });
    expect(code(checkSupportingMapping(binding, candidate(), [created, off, on]))).toBe(
      "supporting_mapping_version_changed",
    );
    // Order in the list is irrelevant: the execution time decides.
    expect(code(checkSupportingMapping(binding, candidate(), [on, off, created]))).toBe(
      "supporting_mapping_version_changed",
    );
  });

  test("a proposal that never executed is not a write", () => {
    const pending = {
      ...created,
      id: SECOND,
      status: "pending",
      executedAt: null,
      executedAfter: null,
    } as unknown as ProposalDto;
    expect(code(checkSupportingMapping(binding, candidate(), [created, pending]))).toBe("ok");
  });
});
