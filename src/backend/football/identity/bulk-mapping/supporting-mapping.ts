import type { CandidateDto, ProposalDto } from "../mapping-contracts";
import type { BulkRowState } from "./contract";

/**
 * The Sofascore mapping a Flashscore row rests on, frozen in the manifest. "Reviewed"
 * means it was written by the reviewed path (its version stamp is
 * `football_player_mapping:<proposal id>`), never by a script or a guess.
 */
export interface SupportingBinding {
  readonly provider: "sofascore";
  readonly externalId: string;
  /** The Sofascore candidate record that tracks this identity (status "mapped" while the mapping is active). */
  readonly candidateId: string;
  readonly mappingId: string;
  /** The canonical player the Sofascore mapping resolves to: must be the Flashscore row's target. */
  readonly appPlayerId: string;
  /** The version stamp the mapping row carried when the manifest was frozen. */
  readonly version: string;
}

export const VERSION_PREFIX = "football_player_mapping:";

export type SupportingVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly state: BulkRowState; readonly code: string };

const refuse = (state: BulkRowState, code: string): SupportingVerdict => ({
  ok: false,
  state,
  code,
});

/** What an executed proposal wrote to one mapping row: its target, whether it is active, its version. */
interface WrittenRow {
  readonly proposalId: string;
  readonly executedAt: string;
  readonly appPlayerId: string | null;
  readonly active: boolean | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every write an executed proposal made to the mapping row, read from its own audit record. */
function writesTo(mappingId: string, proposals: readonly ProposalDto[]): WrittenRow[] {
  const out: WrittenRow[] = [];
  for (const p of proposals) {
    if (p.status !== "executed" || !isRecord(p.executedAfter)) continue;
    const after = p.executedAfter;
    const rows = Array.isArray(after.rows) ? after.rows.filter(isRecord) : [after];
    for (const row of rows) {
      if (row.mappingId !== mappingId) continue;
      out.push({
        proposalId: p.id,
        executedAt: p.executedAt ?? "",
        appPlayerId: typeof row.appPlayerId === "string" ? row.appPlayerId : null,
        active: typeof row.active === "boolean" ? row.active : null,
      });
    }
  }
  return out.sort(
    (a, b) => a.executedAt.localeCompare(b.executedAt) || a.proposalId.localeCompare(b.proposalId),
  );
}

/**
 * Is the supporting Sofascore mapping, TODAY, the one the manifest froze: the same row,
 * still active, still resolving to the same canonical player, still at the same reviewed
 * version?
 *
 * Read ONLY through what the authenticated screen can call: the Sofascore candidate
 * record (its status is "mapped" exactly while an active mapping holds the id, and it
 * names the mapping row) and the audit record of every executed proposal (each one
 * records the row it wrote: target, active flag, and, by its id, the version stamp).
 * The current state is the LAST executed write to that row.
 *
 * What this cannot see, stated rather than hidden: the mapping table itself. A row
 * changed outside the reviewed proposals (a hand-run script) leaves no proposal; only a
 * read-only "get this mapping" function over the table could see it. Until one exists,
 * anything this cannot affirm is refused, never assumed: no history, a different last
 * writer, an unexpected shape.
 */
export function checkSupportingMapping(
  binding: SupportingBinding,
  candidate: CandidateDto | undefined,
  executedProposals: readonly ProposalDto[],
): SupportingVerdict {
  if (!candidate) return refuse("STALE_EVIDENCE", "supporting_candidate_missing");
  if (candidate.provider !== "sofascore" || candidate.externalId !== binding.externalId)
    return refuse("STALE_EVIDENCE", "supporting_identity_changed");
  if (candidate.status !== "mapped")
    return refuse("STALE_EVIDENCE", "supporting_mapping_not_active");
  if (candidate.existingMappingId !== binding.mappingId)
    return refuse("STALE_EVIDENCE", "supporting_mapping_row_changed");

  const writes = writesTo(binding.mappingId, executedProposals);
  const last = writes[writes.length - 1];
  if (!last) return refuse("STALE_EVIDENCE", "supporting_history_unavailable");
  // What changed first (the more specific reason), then the version stamp as the catch-all.
  if (last.active !== true) return refuse("STALE_EVIDENCE", "supporting_mapping_not_active");
  if (last.appPlayerId !== binding.appPlayerId)
    return refuse("STALE_EVIDENCE", "supporting_mapping_retargeted");
  if (`${VERSION_PREFIX}${last.proposalId}` !== binding.version)
    return refuse("STALE_EVIDENCE", "supporting_mapping_version_changed");
  return { ok: true };
}
