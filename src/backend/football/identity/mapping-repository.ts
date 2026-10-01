import type { PostgrestError } from "@supabase/supabase-js";
import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  appPlayerOptionSchema,
  candidateSchema,
  proposalSchema,
  proposeResultSchema,
  reviewerAvailabilitySchema,
  transitionResultSchema,
  type AppPlayerOption,
  type CandidateDto,
  type CandidateFilter,
  type ProposalDto,
  type ProposeItem,
  type ProposeResult,
  type ReviewerAvailability,
  type TransitionResult,
} from "./mapping-contracts";
import { MappingError, mapMappingError } from "./mapping-errors";

/**
 * What the admin screen may call. Each write is a trusted database function
 * that re-checks the caller itself (staff, AAL2, recent authentication,
 * football.manage_mappings) and keeps the append-only audit; nothing in this
 * contract can map anyone on one person's say-so.
 */
export interface PlayerMappingRepository {
  listMappingCandidates(
    filter: CandidateFilter,
    cursor: string | null,
    limit: number,
    context: RepositoryContext,
  ): Promise<readonly CandidateDto[]>;
  getMappingCandidate(candidateId: string, context: RepositoryContext): Promise<CandidateDto>;
  /** App players ranked by agreement for one candidate. Ranks; never filters on position. */
  listMappingCandidatesForAppPlayer(
    candidateId: string,
    appTeamId: string | null,
    limit: number,
    context: RepositoryContext,
  ): Promise<readonly AppPlayerOption[]>;
  listMappingProposals(
    status: string | null,
    cursor: string | null,
    limit: number,
    context: RepositoryContext,
  ): Promise<readonly ProposalDto[]>;
  getMappingProposal(proposalId: string, context: RepositoryContext): Promise<ProposalDto>;
  /** One batch, one human proposer. Creates pending proposals; maps nothing. */
  proposeMappings(
    items: readonly ProposeItem[],
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<ProposeResult>;
  proposeIgnore(
    candidate: { readonly provider: "sofascore" | "flashscore"; readonly candidateId: string },
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<ProposeResult>;
  proposeReverseIgnore(
    candidate: { readonly provider: "sofascore" | "flashscore"; readonly candidateId: string },
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<ProposeResult>;
  replaceMapping(
    mapping: {
      readonly provider: "sofascore" | "flashscore";
      readonly mappingId: string;
      readonly newExternalId?: string;
      readonly newAppPlayerId?: string;
    },
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<ProposeResult>;
  deactivateMapping(
    mapping: { readonly provider: "sofascore" | "flashscore"; readonly mappingId: string },
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<ProposeResult>;
  reactivateMapping(
    mapping: {
      readonly provider: "sofascore" | "flashscore";
      readonly mappingId: string;
      readonly newExternalId?: string;
      readonly newAppPlayerId?: string;
    },
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<ProposeResult>;
  addPositionNote(
    proposalId: string,
    note: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<TransitionResult>;
  refreshProposalEvidence(
    proposalId: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<TransitionResult>;
  /** A DIFFERENT human approves or rejects the exact fingerprint they were shown. */
  decideMappingProposal(
    input: {
      readonly proposalId: string;
      readonly decision: "approve" | "reject";
      readonly reason: string;
      readonly fingerprint: string;
      readonly positionDisagreementAcknowledged?: boolean;
    },
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<TransitionResult>;
  executeMappingProposal(
    proposalId: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<TransitionResult>;
  /**
   * Executes every APPROVED proposal of a batch, one by one. Each is its own
   * guarded transaction with its own idempotency key; a batch is a convenience
   * and never an approval.
   */
  executeMappingBatch(
    batchId: string,
    idempotencyKeyFor: (proposalId: string) => string,
    context: RepositoryContext,
  ): Promise<readonly { readonly proposalId: string; readonly result: TransitionResult }[]>;
  cancelMappingProposal(
    proposalId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<TransitionResult>;
  /** The count behind "second qualified reviewer required". There is no bypass. */
  getQualifiedReviewerAvailability(context: RepositoryContext): Promise<ReviewerAvailability>;
}

/** The slice of the Supabase client this adapter uses: RPC by name, nothing else. */
export interface MappingRpcClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: PostgrestError | null }> & {
    abortSignal?(signal: AbortSignal): PromiseLike<{ data: unknown; error: PostgrestError | null }>;
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireActor(context: RepositoryContext): void {
  if (!context.actorId) throw new MappingError("staff_access_denied", "Staff access is denied.");
}

function requireUuid(value: string, code: "proposal_not_found" | "candidate_not_found"): string {
  if (!UUID.test(value)) throw new MappingError(code, "The identifier is invalid.");
  return value;
}

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new MappingError(
      "mapping_unavailable",
      "The mapping service returned an invalid DTO.",
      error,
    );
  }
}

function toRpcItem(item: ProposeItem): Record<string, unknown> {
  switch (item.kind) {
    case "map":
      return {
        kind: "map",
        sofascoreCandidateId: item.sofascoreCandidateId ?? null,
        flashscoreCandidateId: item.flashscoreCandidateId ?? null,
        appPlayerId: item.appPlayerId,
        basis: item.basis ?? "manual",
        evidenceRefs: item.evidenceRefs ?? [],
      };
    case "replace":
    case "reactivate":
      return {
        kind: item.kind,
        providerName: item.providerName,
        mappingId: item.mappingId,
        newExternalId: item.newExternalId ?? null,
        newAppPlayerId: item.newAppPlayerId ?? null,
      };
    case "deactivate":
      return { kind: "deactivate", providerName: item.providerName, mappingId: item.mappingId };
    case "ignore":
    case "reverse_ignore":
      return {
        kind: item.kind,
        sofascoreCandidateId: item.sofascoreCandidateId ?? null,
        flashscoreCandidateId: item.flashscoreCandidateId ?? null,
      };
  }
}

export class SupabasePlayerMappingRepository implements PlayerMappingRepository {
  constructor(private readonly api: MappingRpcClient) {}

  private async call(
    name: string,
    args: Record<string, unknown>,
    context: RepositoryContext,
  ): Promise<unknown> {
    requireActor(context);
    const request = this.api.rpc(name, args);
    const { data, error } = await (context.signal && request.abortSignal
      ? request.abortSignal(context.signal)
      : request);
    if (error) throw mapMappingError(error);
    return data;
  }

  async listMappingCandidates(
    filter: CandidateFilter,
    cursor: string | null,
    limit: number,
    context: RepositoryContext,
  ) {
    const data = await this.call(
      "admin_football_mapping_list_candidates",
      {
        p_status: filter.status ?? null,
        p_provider: filter.provider ?? null,
        p_limit: limit,
        p_after: cursor,
      },
      context,
    );
    return parse(candidateSchema.array(), data);
  }

  async getMappingCandidate(candidateId: string, context: RepositoryContext) {
    const data = await this.call(
      "admin_football_mapping_get_candidate",
      { p_candidate_id: requireUuid(candidateId, "candidate_not_found") },
      context,
    );
    return parse(candidateSchema, data);
  }

  async listMappingCandidatesForAppPlayer(
    candidateId: string,
    appTeamId: string | null,
    limit: number,
    context: RepositoryContext,
  ) {
    const data = await this.call(
      "admin_football_mapping_app_player_options",
      {
        p_candidate_id: requireUuid(candidateId, "candidate_not_found"),
        p_app_team_id: appTeamId,
        p_limit: limit,
      },
      context,
    );
    return parse(appPlayerOptionSchema.array(), data);
  }

  async listMappingProposals(
    status: string | null,
    cursor: string | null,
    limit: number,
    context: RepositoryContext,
  ) {
    const data = await this.call(
      "admin_football_mapping_list_proposals",
      { p_status: status, p_limit: limit, p_after: cursor },
      context,
    );
    return parse(proposalSchema.array(), data);
  }

  async getMappingProposal(proposalId: string, context: RepositoryContext) {
    const data = await this.call(
      "admin_football_mapping_get_proposal",
      { p_proposal_id: requireUuid(proposalId, "proposal_not_found") },
      context,
    );
    return parse(proposalSchema, data);
  }

  async proposeMappings(
    items: readonly ProposeItem[],
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    const data = await this.call(
      "admin_football_mapping_propose",
      {
        p_items: items.map(toRpcItem),
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
      },
      context,
    );
    return parse(proposeResultSchema, data);
  }

  proposeIgnore(
    candidate: { provider: "sofascore" | "flashscore"; candidateId: string },
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    return this.proposeMappings([ignoreItem("ignore", candidate)], reason, idempotencyKey, context);
  }

  proposeReverseIgnore(
    candidate: { provider: "sofascore" | "flashscore"; candidateId: string },
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    return this.proposeMappings(
      [ignoreItem("reverse_ignore", candidate)],
      reason,
      idempotencyKey,
      context,
    );
  }

  replaceMapping(
    mapping: {
      provider: "sofascore" | "flashscore";
      mappingId: string;
      newExternalId?: string;
      newAppPlayerId?: string;
    },
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    return this.proposeMappings(
      [{ kind: "replace", providerName: mapping.provider, ...mappingFields(mapping) }],
      reason,
      idempotencyKey,
      context,
    );
  }

  deactivateMapping(
    mapping: { provider: "sofascore" | "flashscore"; mappingId: string },
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    return this.proposeMappings(
      [{ kind: "deactivate", providerName: mapping.provider, mappingId: mapping.mappingId }],
      reason,
      idempotencyKey,
      context,
    );
  }

  reactivateMapping(
    mapping: {
      provider: "sofascore" | "flashscore";
      mappingId: string;
      newExternalId?: string;
      newAppPlayerId?: string;
    },
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    return this.proposeMappings(
      [{ kind: "reactivate", providerName: mapping.provider, ...mappingFields(mapping) }],
      reason,
      idempotencyKey,
      context,
    );
  }

  async addPositionNote(
    proposalId: string,
    note: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    const data = await this.call(
      "admin_football_mapping_add_position_note",
      {
        p_proposal_id: requireUuid(proposalId, "proposal_not_found"),
        p_note: note,
        p_idempotency_key: idempotencyKey,
      },
      context,
    );
    return parse(transitionResultSchema, data);
  }

  async refreshProposalEvidence(
    proposalId: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    const data = await this.call(
      "admin_football_mapping_refresh_evidence",
      {
        p_proposal_id: requireUuid(proposalId, "proposal_not_found"),
        p_idempotency_key: idempotencyKey,
      },
      context,
    );
    return parse(transitionResultSchema, data);
  }

  async decideMappingProposal(
    input: {
      proposalId: string;
      decision: "approve" | "reject";
      reason: string;
      fingerprint: string;
      positionDisagreementAcknowledged?: boolean;
    },
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    const data = await this.call(
      "admin_football_mapping_decide",
      {
        p_proposal_id: requireUuid(input.proposalId, "proposal_not_found"),
        p_decision: input.decision,
        p_decision_reason: input.reason,
        p_fingerprint: input.fingerprint,
        p_position_acknowledged: input.positionDisagreementAcknowledged ?? false,
        p_idempotency_key: idempotencyKey,
      },
      context,
    );
    return parse(transitionResultSchema, data);
  }

  async executeMappingProposal(
    proposalId: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    const data = await this.call(
      "admin_football_mapping_execute",
      {
        p_proposal_id: requireUuid(proposalId, "proposal_not_found"),
        p_idempotency_key: idempotencyKey,
      },
      context,
    );
    return parse(transitionResultSchema, data);
  }

  async executeMappingBatch(
    batchId: string,
    idempotencyKeyFor: (proposalId: string) => string,
    context: RepositoryContext,
  ) {
    const proposals = await this.listMappingProposals("approved", null, 200, context);
    const results: { proposalId: string; result: TransitionResult }[] = [];
    for (const proposal of proposals.filter((p) => p.batchId === batchId)) {
      results.push({
        proposalId: proposal.id,
        result: await this.executeMappingProposal(
          proposal.id,
          idempotencyKeyFor(proposal.id),
          context,
        ),
      });
    }
    return results;
  }

  async cancelMappingProposal(
    proposalId: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ) {
    const data = await this.call(
      "admin_football_mapping_cancel",
      {
        p_proposal_id: requireUuid(proposalId, "proposal_not_found"),
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
      },
      context,
    );
    return parse(transitionResultSchema, data);
  }

  async getQualifiedReviewerAvailability(context: RepositoryContext) {
    const data = await this.call("admin_football_mapping_reviewer_availability", {}, context);
    return parse(reviewerAvailabilitySchema, data);
  }
}

function ignoreItem(
  kind: "ignore" | "reverse_ignore",
  candidate: { provider: "sofascore" | "flashscore"; candidateId: string },
): ProposeItem {
  return candidate.provider === "sofascore"
    ? { kind, sofascoreCandidateId: candidate.candidateId }
    : { kind, flashscoreCandidateId: candidate.candidateId };
}

function mappingFields(mapping: {
  mappingId: string;
  newExternalId?: string;
  newAppPlayerId?: string;
}) {
  return {
    mappingId: mapping.mappingId,
    ...(mapping.newExternalId === undefined ? {} : { newExternalId: mapping.newExternalId }),
    ...(mapping.newAppPlayerId === undefined ? {} : { newAppPlayerId: mapping.newAppPlayerId }),
  };
}
