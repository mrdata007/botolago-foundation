import type { RepositoryContext } from "@/backend/contracts/repository";
import type { CandidateDto } from "../mapping-contracts";
import type { PlayerMappingRepository } from "../mapping-repository";
import { loadOptions, readOptionSignals } from "../review-queue";
import type { BulkRowState } from "./contract";
import type { ManifestRow } from "./manifest";

export type Revalidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly state: BulkRowState; readonly code: string };

const refuse = (state: BulkRowState, code: string): Revalidation => ({ ok: false, state, code });

/**
 * Re-checks one manifest row against the database, immediately before it is
 * proposed. The row is never replaced by a better-looking one: anything that
 * differs from the frozen manifest is a SKIP, with a reason, and the target app
 * player is never recomputed.
 *
 * Reads only. (The SportsMonks corroboration is frozen in the manifest and
 * re-read by the operator-side read-only check; the reviewed API does not
 * expose it, and no new endpoint is added for it.)
 */
export async function revalidateRow(
  repository: PlayerMappingRepository,
  row: ManifestRow,
  context: RepositoryContext,
  preloaded?: CandidateDto,
): Promise<Revalidation> {
  const candidate = preloaded ?? (await repository.getMappingCandidate(row.candidateId, context));
  if (candidate.status === "mapped" || candidate.existingMappingId !== null)
    return refuse("PROVIDER_ID_ALREADY_MAPPED", "already_mapped");
  if (candidate.status === "ignored") return refuse("HELD", "candidate_ignored");
  if (candidate.openProposalId !== null || candidate.status === "proposed")
    return refuse("IDENTITY_CONFLICT", "proposal_already_open");
  if (candidate.provider !== "sofascore" || candidate.externalId !== row.externalId)
    return refuse("IDENTITY_CONFLICT", "provider_identity_changed");
  if (candidate.evidenceRevision !== row.evidenceRevision)
    return refuse("STALE_EVIDENCE", "evidence_revision_changed");

  const [observation] = candidate.observations;
  if (candidate.observations.length !== 1 || !observation)
    return refuse("STALE_EVIDENCE", "observation_count_changed");
  if (
    observation.squadCompleteness !== "COMPLETE" ||
    observation.registeredTeamDisagreement ||
    observation.appTeamId !== row.appTeamId ||
    candidate.flags.length > 0
  )
    return refuse("STALE_EVIDENCE", "observation_changed");

  const options = await loadOptions(repository, candidate, "club", context);
  const exact = options.filter((o) => readOptionSignals(o.signals).dob === "match");
  if (exact.length > 1) return refuse("IDENTITY_CONFLICT", "more_than_one_exact_dob_target");
  const target = exact[0];
  if (!target || target.appPlayerId !== row.appPlayerId)
    return refuse("STALE_EVIDENCE", "target_no_longer_the_only_exact_dob_match");
  if (target.alreadyMappedForProvider) return refuse("TARGET_ALREADY_MAPPED", "already_mapped");

  const s = readOptionSignals(target.signals);
  if (s.position === "conflict" || s.shirt === "conflict")
    return refuse(
      "IDENTITY_CONFLICT",
      s.position === "conflict" ? "position_conflict" : "shirt_conflict",
    );
  if (s.position !== "match" || s.club !== "match" || s.flags.length > 0)
    return refuse("STALE_EVIDENCE", "signals_changed");
  if (s.shirt !== row.signals.shirt) return refuse("STALE_EVIDENCE", "shirt_signal_changed");
  return { ok: true };
}
