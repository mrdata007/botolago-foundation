import type { ProviderMappingDto } from "../mapping-contracts";
import type { BulkRowState } from "./contract";

/**
 * The Sofascore mapping a Flashscore row rests on, frozen in the manifest. It is identified by
 * the mapping row itself and by the state digest the DATABASE computed over it when the manifest
 * was cut. "Reviewed" is the database's word, computed from the row's flags and the audit
 * record of the executed proposal that wrote it; a version label never counts.
 */
export interface SupportingBinding {
  readonly provider: "sofascore";
  readonly externalId: string;
  readonly mappingId: string;
  /** The canonical player the Sofascore mapping resolves to: must be the Flashscore row's target. */
  readonly appPlayerId: string;
  /** The executed proposal whose audit record makes the row reviewed. */
  readonly provenanceProposalId: string;
  /** The database's state digest of the row when the manifest was cut. */
  readonly stateDigest: string;
}

export type SupportingVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly state: BulkRowState; readonly code: string };

const refuse = (code: string): SupportingVerdict => ({
  ok: false,
  state: "STALE_EVIDENCE",
  code,
});

/** The refusal codes are the database's own (the same ones propose, approve and execute give). */
export const SUPPORTING_CODES = {
  missing: "supporting_mapping_missing",
  notSofascore: "supporting_mapping_not_sofascore",
  inactive: "supporting_mapping_inactive",
  unreviewed: "supporting_mapping_unreviewed",
  targetMismatch: "supporting_mapping_target_mismatch",
  changed: "supporting_mapping_changed",
  rowChanged: "supporting_mapping_row_changed",
} as const;

/**
 * Is the supporting Sofascore mapping, TODAY, the one the manifest froze? `current` is the actual
 * mapping row as the database reports it (api.admin_football_mapping_get_provider_mapping), read
 * now. This is an early warning for the person at the screen: the database decides, at propose,
 * at approval and again inside the executing transaction, and refuses on its own.
 *
 * Anything this cannot affirm is refused, never assumed.
 */
export function checkSupportingMapping(
  binding: SupportingBinding,
  current: ProviderMappingDto | null | undefined,
): SupportingVerdict {
  if (!current) return refuse(SUPPORTING_CODES.missing);
  if (current.provider !== binding.provider) return refuse(SUPPORTING_CODES.notSofascore);
  if (current.externalId !== binding.externalId || current.mappingId !== binding.mappingId)
    return refuse(SUPPORTING_CODES.rowChanged);
  // What changed first (the more specific reason), then the digest as the catch-all.
  if (!current.active) return refuse(SUPPORTING_CODES.inactive);
  if (!current.reviewed) return refuse(SUPPORTING_CODES.unreviewed);
  if (current.appPlayerId !== binding.appPlayerId) return refuse(SUPPORTING_CODES.targetMismatch);
  if (
    current.provenanceProposalId !== binding.provenanceProposalId ||
    current.stateDigest !== binding.stateDigest
  )
    return refuse(SUPPORTING_CODES.changed);
  return { ok: true };
}

/** Key of one provider mapping read in a snapshot. */
export const providerMappingKey = (provider: string, externalId: string) =>
  `${provider}:${externalId}`;
