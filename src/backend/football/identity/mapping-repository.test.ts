import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { mapMappingError } from "./mapping-errors";
import { SupabasePlayerMappingRepository, type MappingRpcClient } from "./mapping-repository";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const ctx = (actorId: string | null = ACTOR): RepositoryContext => ({ actorId, requestId: "r" });
const ID = "33333333-3333-4333-8333-333333333333";
const FP = "a".repeat(64);

function fake(answer: unknown, error: { message: string; code?: string } | null = null) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const api: MappingRpcClient = {
    rpc: (name, args) => {
      calls.push({ name, args });
      return Promise.resolve({ data: error ? null : answer, error }) as ReturnType<
        MappingRpcClient["rpc"]
      >;
    },
  };
  return { calls, repo: new SupabasePlayerMappingRepository(api) };
}

const proposalDto = (over: Record<string, unknown> = {}) => ({
  id: ID,
  batchId: ID,
  kind: "map",
  status: "pending",
  effectiveStatus: "pending",
  sofascoreCandidateId: ID,
  flashscoreCandidateId: null,
  sofascoreExternalId: "1",
  flashscoreExternalId: null,
  providerName: null,
  mappingId: null,
  appPlayerId: ID,
  newExternalId: null,
  newAppPlayerId: null,
  expectedBefore: null,
  basis: "manual",
  evidence: {},
  signals: {},
  positionDisagreement: false,
  positionNote: null,
  positionDisagreementAcknowledged: false,
  reason: "A reason long enough.",
  requestedBy: ID,
  requestedAt: "2026-10-01T00:00:00Z",
  expiresAt: "2026-10-04T00:00:00Z",
  decidedBy: null,
  decidedAt: null,
  decisionReason: null,
  fingerprint: FP,
  executedBy: null,
  executedAt: null,
  executedBefore: null,
  executedAfter: null,
  holdCode: null,
  proposedByMe: true,
  canApprove: false,
  ...over,
});

describe("the Supabase adapter", () => {
  test("proposeMappings sends the batch to the one propose function with the idempotency key", async () => {
    const { calls, repo } = fake({
      batchId: ID,
      proposals: [
        {
          index: 1,
          ok: true,
          id: ID,
          kind: "map",
          status: "pending",
          fingerprint: FP,
          positionDisagreement: false,
        },
      ],
    });
    const key = crypto.randomUUID();
    const result = await repo.proposeMappings(
      [
        {
          kind: "map",
          sofascoreCandidateId: ID,
          appPlayerId: ID,
          basis: "incident",
          evidenceRefs: [{ fixtureId: "f1", minute: 26 }],
        },
      ],
      "Both providers attributed the same goal.",
      key,
      ctx(),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("admin_football_mapping_propose");
    expect(calls[0]!.args).toMatchObject({
      p_reason: "Both providers attributed the same goal.",
      p_idempotency_key: key,
    });
    expect((calls[0]!.args.p_items as Record<string, unknown>[])[0]).toEqual({
      kind: "map",
      sofascoreCandidateId: ID,
      flashscoreCandidateId: null,
      appPlayerId: ID,
      basis: "incident",
      evidenceRefs: [{ fixtureId: "f1", minute: 26 }],
    });
    expect(result.proposals[0]).toMatchObject({ ok: true, status: "pending" });
  });

  test("replace, deactivate, reactivate, ignore all go through the same propose function", async () => {
    const { calls, repo } = fake({ batchId: ID, proposals: [] });
    await repo.replaceMapping(
      { provider: "sofascore", mappingId: ID, newAppPlayerId: ID },
      "A reason long enough.",
      crypto.randomUUID(),
      ctx(),
    );
    await repo.deactivateMapping(
      { provider: "flashscore", mappingId: ID },
      "A reason long enough.",
      crypto.randomUUID(),
      ctx(),
    );
    await repo.reactivateMapping(
      { provider: "sofascore", mappingId: ID },
      "A reason long enough.",
      crypto.randomUUID(),
      ctx(),
    );
    await repo.proposeIgnore(
      { provider: "flashscore", candidateId: ID },
      "A reason long enough.",
      crypto.randomUUID(),
      ctx(),
    );
    await repo.proposeReverseIgnore(
      { provider: "sofascore", candidateId: ID },
      "A reason long enough.",
      crypto.randomUUID(),
      ctx(),
    );
    expect(new Set(calls.map((c) => c.name))).toEqual(new Set(["admin_football_mapping_propose"]));
    const kinds = calls.map((c) => (c.args.p_items as { kind: string }[])[0]!.kind);
    expect(kinds).toEqual(["replace", "deactivate", "reactivate", "ignore", "reverse_ignore"]);
    const ignore = (calls[3]!.args.p_items as Record<string, unknown>[])[0]!;
    expect(ignore).toMatchObject({ flashscoreCandidateId: ID, sofascoreCandidateId: null });
  });

  test("decide sends the exact fingerprint and the acknowledgement; execute sends only the proposal and key", async () => {
    const { calls, repo } = fake({ ok: true, id: ID, status: "approved" });
    await repo.decideMappingProposal(
      {
        proposalId: ID,
        decision: "approve",
        reason: "Checked independently.",
        fingerprint: FP,
        positionDisagreementAcknowledged: true,
      },
      "k1".padEnd(36, "0").replace(/^(.{8})(.{4})(.{4})(.{4})(.*)$/, "$1-$2-$3-$4-$5"),
      ctx(),
    );
    expect(calls[0]!.name).toBe("admin_football_mapping_decide");
    expect(calls[0]!.args).toMatchObject({
      p_decision: "approve",
      p_fingerprint: FP,
      p_position_acknowledged: true,
    });
    await repo.executeMappingProposal(ID, crypto.randomUUID(), ctx());
    expect(calls[1]!.name).toBe("admin_football_mapping_execute");
    expect(Object.keys(calls[1]!.args).sort()).toEqual(["p_idempotency_key", "p_proposal_id"]);
  });

  test("a held state comes back as a value, not as an exception", async () => {
    const { repo } = fake({ ok: false, code: "identity_conflict", status: "identity_conflict" });
    expect(
      await repo.decideMappingProposal(
        { proposalId: ID, decision: "approve", reason: "Checked independently.", fingerprint: FP },
        crypto.randomUUID(),
        ctx(),
      ),
    ).toEqual({
      ok: false,
      code: "identity_conflict",
      status: "identity_conflict",
    });
  });

  test("database refusals become stable codes", async () => {
    for (const [message, code] of [
      ["self_approval_denied", "self_approval_denied"],
      ["fingerprint_mismatch", "fingerprint_mismatch"],
      ["position_disagreement_unacknowledged", "position_disagreement_unacknowledged"],
      ["operation_already_executed", "operation_already_executed"],
      ["mfa_assurance_insufficient", "mfa_assurance_insufficient"],
      ["recent_auth_required", "recent_auth_required"],
      ["permission_missing", "permission_missing"],
    ] as const) {
      const { repo } = fake(null, { message });
      await expect(
        repo.executeMappingProposal(ID, crypto.randomUUID(), ctx()),
      ).rejects.toMatchObject({ code });
    }
    expect(mapMappingError({ message: "something odd", code: "XX000" }).code).toBe(
      "mapping_unavailable",
    );
    expect(mapMappingError({ message: "denied", code: "42501" }).code).toBe("staff_access_denied");
  });

  test("it needs an actor, a valid id and a DTO of the right shape", async () => {
    const { repo, calls } = fake(proposalDto());
    await expect(repo.getMappingProposal(ID, ctx(null))).rejects.toMatchObject({
      code: "staff_access_denied",
    });
    await expect(repo.getMappingProposal("not-a-uuid", ctx())).rejects.toMatchObject({
      code: "proposal_not_found",
    });
    expect(calls).toHaveLength(0);
    await expect(repo.getMappingProposal(ID, ctx())).resolves.toMatchObject({
      id: ID,
      canApprove: false,
    });
    const bad = fake({ ...proposalDto(), status: "approved-ish" });
    await expect(bad.repo.getMappingProposal(ID, ctx())).rejects.toMatchObject({
      code: "mapping_unavailable",
    });
  });

  test("executeMappingBatch executes only the approved proposals of that batch, each on its own key", async () => {
    const other = "44444444-4444-4444-8444-444444444444";
    const proposals = [
      proposalDto({ id: ID, status: "approved", batchId: ID }),
      proposalDto({
        id: other,
        status: "approved",
        batchId: "55555555-5555-4555-8555-555555555555",
      }),
    ];
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const repo = new SupabasePlayerMappingRepository({
      rpc: (name, args) => {
        calls.push({ name, args });
        const data =
          name === "admin_football_mapping_list_proposals"
            ? proposals
            : { ok: true, id: args.p_proposal_id, status: "executed" };
        return Promise.resolve({ data, error: null }) as ReturnType<MappingRpcClient["rpc"]>;
      },
    });
    const results = await repo.executeMappingBatch(
      ID,
      (id) => `00000000-0000-4000-8000-${id.slice(-12)}`,
      ctx(),
    );
    expect(results.map((r) => r.proposalId)).toEqual([ID]);
    const executes = calls.filter((c) => c.name === "admin_football_mapping_execute");
    expect(executes).toHaveLength(1);
    expect(executes[0]!.args.p_idempotency_key).toBe(`00000000-0000-4000-8000-${ID.slice(-12)}`);
  });

  test("executeMappingBatch pages through every approved proposal, so a batch beyond the first 200 is not skipped", async () => {
    const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const BATCH = "55555555-5555-4555-8555-555555555555";
    const OTHER = "66666666-6666-4666-8666-666666666666";
    // 450 approved proposals ordered by id; the target batch's four are on the 2nd and 3rd pages.
    const targets = new Set([201, 250, 401, 450]);
    const all = Array.from({ length: 450 }, (_, i) =>
      proposalDto({
        id: idOf(i + 1),
        status: "approved",
        batchId: targets.has(i + 1) ? BATCH : OTHER,
      }),
    );
    const pages: (string | null)[] = [];
    const executed: string[] = [];
    const repo = new SupabasePlayerMappingRepository({
      rpc: (name, args) => {
        let data: unknown;
        if (name === "admin_football_mapping_list_proposals") {
          pages.push(args.p_after as string | null);
          const after = (args.p_after as string | null) ?? "";
          data = all.filter((p) => p.id > after).slice(0, args.p_limit as number);
        } else {
          executed.push(args.p_proposal_id as string);
          data = { ok: true, id: args.p_proposal_id, status: "executed" };
        }
        return Promise.resolve({ data, error: null }) as ReturnType<MappingRpcClient["rpc"]>;
      },
    });
    const results = await repo.executeMappingBatch(
      BATCH,
      (id) => `00000000-0000-4000-8000-${id.slice(-12)}`,
      ctx(),
    );
    expect(results.map((r) => r.proposalId)).toEqual([idOf(201), idOf(250), idOf(401), idOf(450)]);
    expect(executed).toHaveLength(4);
    expect(pages).toEqual([null, idOf(200), idOf(400)]);
  });

  test("reviewer availability is exposed (the screen shows second qualified reviewer required)", async () => {
    const { repo } = fake({
      qualifiedReviewersAvailable: 0,
      selfApprovalAllowed: false,
      secondReviewerRequired: true,
    });
    expect(await repo.getQualifiedReviewerAvailability(ctx())).toEqual({
      qualifiedReviewersAvailable: 0,
      selfApprovalAllowed: false,
      secondReviewerRequired: true,
    });
  });

  test("the contract has no bypass: no method approves without a fingerprint or skips the second person", () => {
    const methods = Object.getOwnPropertyNames(SupabasePlayerMappingRepository.prototype).filter(
      (m) => m !== "constructor",
    );
    expect(
      methods.filter((m) =>
        /bypass|force|override|skip|breakGlass|autoApprove|approveOwn/i.test(m),
      ),
    ).toEqual([]);
  });

  test("the adapter calls only the staff mapping functions, and never reads a table", () => {
    const code = readFileSync(new URL("./mapping-repository.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(
      /\.from\(|football_player_mapping_|football_provider_mappings|console\.|service_role/,
    );
    const rpcNames = [...code.matchAll(/"(admin_football_mapping_[a-z_]+)"/g)].map((m) => m[1]);
    expect(new Set(rpcNames)).toEqual(
      new Set([
        "admin_football_mapping_list_candidates",
        "admin_football_mapping_get_candidate",
        "admin_football_mapping_app_player_options",
        "admin_football_mapping_list_proposals",
        "admin_football_mapping_get_proposal",
        "admin_football_mapping_propose",
        "admin_football_mapping_add_position_note",
        "admin_football_mapping_refresh_evidence",
        "admin_football_mapping_decide",
        "admin_football_mapping_execute",
        "admin_football_mapping_cancel",
        "admin_football_mapping_reviewer_availability",
      ]),
    );
  });
});
