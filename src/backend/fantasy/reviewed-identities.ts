/**
 * The reviewed-identity input of the provider reconciler: a read-only snapshot
 * of the ACTIVE, human-reviewed player mappings, `(provider, external player id)
 * -> canonical app player id`.
 *
 * This file is pure. It reads nothing and writes nothing: a separate reader
 * fetches the rows (one consistent read of `app_private.football_provider_mappings`,
 * see `scripts/backend/football-reviewed-mapping-snapshot.sql`) and hands them to
 * `buildReviewedIdentitySnapshot`. Every entry keeps the id and version of the
 * mapping row it came from, and the snapshot carries a digest, so a replay can
 * say exactly which mappings it used.
 *
 * What a mapping establishes: that a provider's player id and an app player are
 * the same person. Nothing more. It does not establish that the player belonged
 * to a club on the match date, his position, that he took part, or that any
 * event attributed to him is right. The reconciler checks those from the match
 * evidence, as it always did.
 */
// The snapshot types, builder and index are shared with the Edge Function and
// live in supabase/functions/_shared/reviewed-identities.ts.
import type {
  IdentityProvider,
  ReviewedIdentityEntry,
} from "../../../supabase/functions/_shared/reviewed-identities.ts";

export {
  IdentitySnapshotError,
  buildReviewedIdentitySnapshot,
  indexReviewedIdentities,
  type IdentityProvider,
  type MappingRowInput,
  type ReviewedIdentityEntry,
  type ReviewedIdentityIndex,
  type ReviewedIdentitySnapshot,
} from "../../../supabase/functions/_shared/reviewed-identities.ts";

/**
 * Where a reconciled player's identity stands. Never inferred from a name.
 * - `reviewed_pair`: both provider ids are reviewed mappings of the SAME app player.
 * - `partially_reviewed`: the two entries were paired by the legacy rules and only
 *   one of them has a reviewed mapping. The other provider's id is NOT thereby
 *   approved as that app player.
 * - `unreviewed_legacy`: paired by the legacy rules (incident or shirt), no
 *   reviewed mapping on either entry. A suggestion, not a reviewed identity.
 * - `reviewed_single_source`: one provider's lineup supplies the player and that
 *   id is a reviewed mapping.
 * - `single_source_unreviewed`: one provider's lineup supplies the player, no mapping.
 */
export type IdentityStatus =
  | "reviewed_pair"
  | "partially_reviewed"
  | "unreviewed_legacy"
  | "reviewed_single_source"
  | "single_source_unreviewed";

export interface AppliedMapping {
  readonly provider: IdentityProvider;
  readonly externalId: string;
  readonly appPlayerId: string;
  readonly mappingId: string;
  readonly version: string | null;
}

export const toAppliedMapping = (entry: ReviewedIdentityEntry): AppliedMapping => ({
  provider: entry.provider,
  externalId: entry.externalId,
  appPlayerId: entry.appPlayerId,
  mappingId: entry.mappingId,
  version: entry.version,
});
