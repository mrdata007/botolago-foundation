import type { CandidateDto, ProposalDto } from "../mapping-contracts";
import { APPROVAL_VALIDITY_HOURS, type BulkRowState } from "./contract";
import type { BulkManifestBase, BulkProfile, BulkRowBase } from "./profile";
import { sofascoreProfile } from "./sofascore-profile";

export interface RowStateInfo {
  readonly state: BulkRowState;
  readonly proposalId: string | null;
  /** A stable, non-sensitive code explaining a non-happy state. */
  readonly code: string | null;
}

const OPEN = new Set(["pending", "approved", "position_disagreement", "stale_evidence"]);

/** The proposal this batch made for a row: same candidate, same target, its own group's reason. */
export function batchProposalFor<R extends BulkRowBase>(
  row: R,
  proposals: readonly ProposalDto[],
  profile: BulkProfile<R> = sofascoreProfile as unknown as BulkProfile<R>,
): ProposalDto | null {
  const reason = profile.reasonOf(profile.groupOf(row));
  const mine = proposals.filter(
    (p) =>
      p.kind === "map" &&
      p[profile.candidateField] === row.candidateId &&
      p.appPlayerId === row.appPlayerId &&
      p.reason === reason,
  );
  if (mine.length === 0) return null;
  // An open or executed one wins over a closed one; otherwise the latest.
  const rank = (p: ProposalDto) => (p.status === "executed" ? 2 : OPEN.has(p.status) ? 1 : 0);
  return [...mine].sort(
    (a, b) => rank(b) - rank(a) || b.requestedAt.localeCompare(a.requestedAt),
  )[0]!;
}

/** True when an approval is older than the execute function allows. */
export const approvalIsOld = (proposal: Pick<ProposalDto, "decidedAt">, now: Date): boolean =>
  proposal.decidedAt !== null &&
  now.getTime() - new Date(proposal.decidedAt).getTime() > APPROVAL_VALIDITY_HOURS * 3_600_000;

export function deriveRowState<R extends BulkRowBase>(
  row: R,
  candidate: CandidateDto | undefined,
  proposals: readonly ProposalDto[],
  now: Date,
  profile: BulkProfile<R> = sofascoreProfile as unknown as BulkProfile<R>,
): RowStateInfo {
  const info = (
    state: BulkRowState,
    code: string | null = null,
    proposalId: string | null = null,
  ) => ({ state, code, proposalId }) satisfies RowStateInfo;
  if (!candidate) return info("ERROR", "candidate_not_found");
  const proposal = batchProposalFor(row, proposals, profile);

  if (proposal) {
    if (proposal.status === "executed") return info("EXECUTED", null, proposal.id);
    const closed = ["rejected", "cancelled"].includes(proposal.status);
    if (!closed) {
      if (proposal.fingerprint !== row.expectedFingerprint)
        return info("STALE_EVIDENCE", "fingerprint_differs_from_manifest", proposal.id);
      // The evidence the proposal was made from has moved on since the manifest was frozen.
      if (
        (proposal.status === "pending" || proposal.status === "approved") &&
        candidate.evidenceRevision !== row.evidenceRevision
      )
        return info("STALE_EVIDENCE", "evidence_revision_changed", proposal.id);
    }
    switch (proposal.status) {
      case "approved":
        return proposal.effectiveStatus === "expired" || approvalIsOld(proposal, now)
          ? info("APPROVAL_EXPIRED", "approval_expired", proposal.id)
          : info("APPROVED", null, proposal.id);
      case "pending":
        return proposal.effectiveStatus === "expired"
          ? info("APPROVAL_EXPIRED", "proposal_expired", proposal.id)
          : info("PROPOSED", null, proposal.id);
      case "stale_evidence":
        return info("STALE_EVIDENCE", proposal.holdCode ?? "stale_evidence", proposal.id);
      case "identity_conflict":
        return info("IDENTITY_CONFLICT", proposal.holdCode ?? "identity_conflict", proposal.id);
      case "already_mapped":
        return info(
          candidate.status === "mapped" || candidate.existingMappingId
            ? "PROVIDER_ID_ALREADY_MAPPED"
            : "TARGET_ALREADY_MAPPED",
          "already_mapped",
          proposal.id,
        );
      case "position_disagreement":
        return info("HELD", "position_disagreement", proposal.id);
      case "expired":
        return info("APPROVAL_EXPIRED", "proposal_expired", proposal.id);
      default:
        break; // rejected / cancelled: the row is simply not proposed any more
    }
  }

  if (candidate.status === "mapped" || candidate.existingMappingId)
    return info("PROVIDER_ID_ALREADY_MAPPED", "already_mapped");
  if (candidate.status === "ignored") return info("HELD", "candidate_ignored");
  if (candidate.openProposalId) return info("IDENTITY_CONFLICT", "other_proposal_open");
  if (candidate.evidenceRevision !== row.evidenceRevision)
    return info("STALE_EVIDENCE", "evidence_revision_changed");
  return info("NOT_PROPOSED");
}

export function deriveAllRowStates<R extends BulkRowBase>(
  manifest: Pick<BulkManifestBase<R>, "rows">,
  candidates: readonly CandidateDto[],
  proposals: readonly ProposalDto[],
  now: Date,
  profile: BulkProfile<R> = sofascoreProfile as unknown as BulkProfile<R>,
): ReadonlyMap<string, RowStateInfo> {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  return new Map(
    manifest.rows.map((row) => {
      const derived = deriveRowState(row, byId.get(row.candidateId), proposals, now, profile);
      // A row that has not executed yet shows what its own evidence now says (for a Flashscore
      // row: its supporting mapping). Anything already executed stays executed.
      const refusal =
        profile.inspect && ["NOT_PROPOSED", "PROPOSED", "APPROVED"].includes(derived.state)
          ? profile.inspect(row, { candidates, proposals })
          : null;
      return [
        row.candidateId,
        refusal
          ? { state: refusal.state, code: refusal.code, proposalId: derived.proposalId }
          : derived,
      ];
    }),
  );
}

export function countStates(
  states: ReadonlyMap<string, RowStateInfo>,
): Record<BulkRowState, number> {
  const out = Object.fromEntries(
    [
      "NOT_PROPOSED",
      "PROPOSED",
      "APPROVED",
      "EXECUTED",
      "STALE_EVIDENCE",
      "IDENTITY_CONFLICT",
      "TARGET_ALREADY_MAPPED",
      "PROVIDER_ID_ALREADY_MAPPED",
      "APPROVAL_EXPIRED",
      "HELD",
      "ERROR",
    ].map((s) => [s, 0]),
  ) as Record<BulkRowState, number>;
  for (const { state } of states.values()) out[state] += 1;
  return out;
}
