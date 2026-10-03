import type { CandidateDto, ProposalDto, ProviderMappingDto } from "../mapping-contracts";
import { loadOptions, mapWithConcurrency, readOptionSignals } from "../review-queue";
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
import { checkSupportingMapping, providerMappingKey } from "./supporting-mapping";

const refuse = (state: BulkRowState, code: string): Revalidation => ({ ok: false, state, code });

const OPEN = new Set(["pending", "approved", "position_disagreement", "stale_evidence"]);

/**
 * The supporting Sofascore mapping, checked against the actual mapping row the database reports
 * (api.admin_football_mapping_get_provider_mapping), read now. Pure over that one read.
 */
function supportingFrom(
  row: FlashscoreRow,
  current: ProviderMappingDto | null | undefined,
): Revalidation {
  const verdict = checkSupportingMapping(row.supporting, current);
  return verdict.ok ? verdict : refuse(verdict.state, verdict.code);
}

const readSupporting = (deps: ProfileDeps, row: FlashscoreRow) =>
  deps.repository.getProviderMapping("sofascore", row.supporting.externalId, deps.context());

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

  // The supporting Sofascore mapping, read from the database now: same row, still active, still
  // reviewed, still this player, same state. (The database checks it again on its own.)
  return supportingFrom(row, await readSupporting(deps, row));
}

/** Immediately before one execution: a fresh read of the supporting mapping, never the phase snapshot. */
async function beforeExecute(deps: ProfileDeps, row: FlashscoreRow): Promise<Revalidation> {
  return supportingFrom(row, await readSupporting(deps, row));
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
    // The database requires, and reads for itself, the Sofascore mapping this row rests on.
    evidenceClass: row.evidenceClass,
    supportingMappingId: row.supporting.mappingId,
  }),
  revalidate,
  beforeExecute,
  async loadSupporting(deps, rows) {
    const reads = await mapWithConcurrency(rows, 4, async (row) => {
      const mapping = await readSupporting(deps, row);
      return [providerMappingKey("sofascore", row.supporting.externalId), mapping] as const;
    });
    return new Map(reads);
  },
  inspect: (row, snapshot) => {
    const key = providerMappingKey("sofascore", row.supporting.externalId);
    // Not read yet (a screen still loading): say nothing; the phases read it again anyway.
    if (!snapshot.providerMappings?.has(key)) return null;
    const verdict = supportingFrom(row, snapshot.providerMappings.get(key));
    return verdict.ok ? null : { state: verdict.state, code: verdict.code };
  },
};

/**
 * The same supporting-mapping check, for ONE proposal executed outside the bulk runner (the
 * ordinary proposal queue): an early warning from a fresh read of the actual mapping row. The
 * database enforces the dependency on its own (propose, approve and execute all refuse), so
 * this is never the guard; it only tells the person before they press. A Flashscore proposal for
 * a candidate the manifest covers is checked whatever its reason says; one the manifest does not
 * cover has no binding to compare and is left to the database. Returns the refusal, or null.
 */
export async function guardFlashscoreExecute(
  deps: ProfileDeps,
  rows: readonly FlashscoreRow[],
  proposal: Pick<ProposalDto, "kind" | "flashscoreCandidateId">,
): Promise<{ readonly state: BulkRowState; readonly code: string } | null> {
  if (proposal.kind !== "map" || proposal.flashscoreCandidateId === null) return null;
  const row = rows.find((r) => r.candidateId === proposal.flashscoreCandidateId);
  if (!row) return null;
  const verdict = await beforeExecute(deps, row);
  return verdict.ok ? null : { state: verdict.state, code: verdict.code };
}
