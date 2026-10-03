import type { CandidateDto } from "../mapping-contracts";
import { loadAllProposals, loadOptions, readOptionSignals } from "../review-queue";
import type { BulkRowState } from "./contract";
import {
  FLASHSCORE_APPROVAL_REASON,
  FLASHSCORE_BASIS,
  FLASHSCORE_EVIDENCE_CLASSES,
  FLASHSCORE_REASONS,
  type FlashscoreEvidenceClass,
} from "./flashscore-contract";
import { flashscoreEvidenceRefs, type FlashscoreRow } from "./flashscore-manifest";
import type { BulkProfile, PhaseSnapshot, ProfileDeps, Revalidation } from "./profile";
import { checkSupportingMapping } from "./supporting-mapping";

const refuse = (state: BulkRowState, code: string): Revalidation => ({ ok: false, state, code });

const OPEN = new Set(["pending", "approved", "position_disagreement", "stale_evidence"]);

/**
 * The supporting Sofascore mapping, checked against the data in hand: the Sofascore
 * candidate record and every executed proposal. Pure.
 */
function supportingFrom(row: FlashscoreRow, snapshot: PhaseSnapshot): Revalidation {
  const candidate = snapshot.candidates.find((c) => c.id === row.supporting.candidateId);
  const verdict = checkSupportingMapping(
    row.supporting,
    candidate,
    snapshot.proposals.filter((p) => p.status === "executed"),
  );
  return verdict.ok ? verdict : refuse(verdict.state, verdict.code);
}

/** Another proposal, open or executed, already holds this target for this provider or this id. */
function claimedByAnother(row: FlashscoreRow, snapshot: PhaseSnapshot): Revalidation | null {
  for (const p of snapshot.proposals) {
    if (p.kind !== "map") continue;
    const sameCandidate = p.flashscoreCandidateId === row.candidateId;
    const sameTarget = p.appPlayerId === row.appPlayerId && p.flashscoreCandidateId !== null;
    if (!sameCandidate && !sameTarget) continue;
    if (p.status === "executed")
      return refuse(
        "TARGET_ALREADY_MAPPED",
        sameCandidate ? "provider_id_already_mapped" : "target_already_mapped_for_flashscore",
      );
    if (OPEN.has(p.status) && !(sameCandidate && sameTarget))
      return refuse(
        "IDENTITY_CONFLICT",
        sameCandidate ? "other_proposal_for_id" : "other_proposal_for_target",
      );
  }
  return null;
}

async function revalidate(
  deps: ProfileDeps,
  row: FlashscoreRow,
  snapshot: PhaseSnapshot,
  preloaded?: CandidateDto,
): Promise<Revalidation> {
  const context = deps.context();
  const candidate =
    preloaded ?? (await deps.repository.getMappingCandidate(row.candidateId, context));
  if (candidate.status === "mapped" || candidate.existingMappingId !== null)
    return refuse("PROVIDER_ID_ALREADY_MAPPED", "already_mapped");
  if (candidate.status === "ignored") return refuse("HELD", "candidate_ignored");
  if (candidate.openProposalId !== null || candidate.status === "proposed")
    return refuse("IDENTITY_CONFLICT", "proposal_already_open");
  if (candidate.provider !== "flashscore" || candidate.externalId !== row.externalId)
    return refuse("IDENTITY_CONFLICT", "provider_identity_changed");
  if (candidate.evidenceRevision !== row.evidenceRevision)
    return refuse("STALE_EVIDENCE", "evidence_revision_changed");
  if (candidate.flags.length > 0) return refuse("STALE_EVIDENCE", "candidate_flags_changed");
  const observation = candidate.observations[0];
  if (row.appTeamId !== null && observation && observation.appTeamId !== row.appTeamId)
    return refuse("STALE_EVIDENCE", "observation_changed");

  // Either direction of collision, from every proposal read now.
  const claimed = claimedByAnother(row, snapshot);
  if (claimed) return claimed;

  // The target, as the backend ranks it for this id: free for Flashscore, and no position conflict
  // (a position conflict would hold the proposal for a note, which this batch does not carry).
  if (row.appTeamId !== null) {
    const options = await loadOptions(deps.repository, candidate, "club", context);
    const target = options.find((o) => o.appPlayerId === row.appPlayerId);
    if (target) {
      if (target.alreadyMappedForProvider) return refuse("TARGET_ALREADY_MAPPED", "already_mapped");
      // The same bar the Sofascore batch applies: no conflict, no flag. A position conflict would
      // also hold the proposal for a note, which this batch does not carry.
      const s = readOptionSignals(target.signals);
      if (s.position === "conflict") return refuse("HELD", "position_conflict");
      if (s.shirt === "conflict") return refuse("IDENTITY_CONFLICT", "shirt_conflict");
      if (s.club !== "match") return refuse("IDENTITY_CONFLICT", "club_context_mismatch");
      if (s.position !== "match" || s.flags.length > 0)
        return refuse("STALE_EVIDENCE", "signals_changed");
    }
  }

  // The supporting Sofascore mapping: same row, still active, still this player, same version.
  const supportingCandidate = await deps.repository.getMappingCandidate(
    row.supporting.candidateId,
    context,
  );
  const fresh: PhaseSnapshot = {
    candidates: [
      ...snapshot.candidates.filter((c) => c.id !== supportingCandidate.id),
      supportingCandidate,
    ],
    proposals: snapshot.proposals,
  };
  return supportingFrom(row, fresh);
}

/** Immediately before one execution: fresh reads of the supporting mapping, never the phase snapshot. */
async function beforeExecute(deps: ProfileDeps, row: FlashscoreRow): Promise<Revalidation> {
  const context = deps.context();
  const [supportingCandidate, executed] = await Promise.all([
    deps.repository.getMappingCandidate(row.supporting.candidateId, context),
    loadAllProposals(deps.repository, "executed", context),
  ]);
  return supportingFrom(row, { candidates: [supportingCandidate], proposals: executed });
}

export const flashscoreProfile: BulkProfile<FlashscoreRow> = {
  kind: "flashscore",
  candidateField: "flashscoreCandidateId",
  groups: [...FLASHSCORE_EVIDENCE_CLASSES],
  groupOf: (row) => row.evidenceClass,
  reasonOf: (group) => FLASHSCORE_REASONS[group as FlashscoreEvidenceClass],
  approvalReason: FLASHSCORE_APPROVAL_REASON,
  proposeItem: (row) => ({
    kind: "map",
    flashscoreCandidateId: row.candidateId,
    appPlayerId: row.appPlayerId,
    basis: FLASHSCORE_BASIS[row.evidenceClass],
    evidenceRefs: flashscoreEvidenceRefs(row),
  }),
  revalidate,
  beforeExecute,
  inspect: (row, snapshot) => {
    const verdict = supportingFrom(row, snapshot);
    return verdict.ok ? null : { state: verdict.state, code: verdict.code };
  },
};
