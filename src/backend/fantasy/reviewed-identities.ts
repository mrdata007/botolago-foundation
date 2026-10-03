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
import { canonicalJson, sha256Hex } from "../football/identity/bulk-mapping/canonical";

export type IdentityProvider = "sofascore" | "flashscore";

/** One row of `football_provider_mappings` for a player, as the reader returns it. */
export interface MappingRowInput {
  readonly mappingId: string;
  readonly provider: IdentityProvider;
  readonly externalId: string;
  readonly appPlayerId: string;
  readonly active: boolean;
  /** `manually_corrected`: a person reviewed the pairing. Only reviewed rows are usable. */
  readonly reviewed: boolean;
  /** `source_version`, e.g. `football_player_mapping:<proposal id>`. */
  readonly version: string | null;
  readonly updatedAt: string;
}

export interface ReviewedIdentityEntry {
  readonly provider: IdentityProvider;
  readonly externalId: string;
  readonly appPlayerId: string;
  /** Provenance: the mapping row this entry came from, and its version. */
  readonly mappingId: string;
  readonly version: string | null;
  readonly updatedAt: string;
}

export interface ReviewedIdentitySnapshot {
  readonly kind: "reviewed-identity-snapshot/v1";
  /** When the rows were read. Supplied by the reader: this file has no clock. */
  readonly capturedAt: string;
  /** sha256 of the canonical entry list. The same mappings always give the same digest. */
  readonly digest: string;
  /** Active, reviewed entries only, sorted by provider then external id. */
  readonly entries: readonly ReviewedIdentityEntry[];
  /** What was read but not usable, so a count is never silently lost. */
  readonly excluded: {
    readonly inactive: number;
    readonly unreviewed: number;
  };
}

export class IdentitySnapshotError extends Error {
  constructor(
    readonly code: "duplicate_external_id" | "duplicate_app_player",
    message: string,
  ) {
    super(message);
    this.name = "IdentitySnapshotError";
  }
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Build a snapshot from mapping rows. Inactive rows and rows no person reviewed
 * are left out (and counted). Two usable rows that contradict each other (one
 * provider id twice, or one app player with two ids of the same provider) is a
 * defect in the data the database's unique constraints should make impossible:
 * the build refuses instead of choosing one.
 */
export async function buildReviewedIdentitySnapshot(
  rows: readonly MappingRowInput[],
  capturedAt: string,
): Promise<ReviewedIdentitySnapshot> {
  let inactive = 0;
  let unreviewed = 0;
  const entries: ReviewedIdentityEntry[] = [];
  const byExternal = new Map<string, string>();
  const byApp = new Map<string, string>();
  for (const row of rows) {
    if (!row.active) {
      inactive += 1;
      continue;
    }
    if (!row.reviewed) {
      unreviewed += 1;
      continue;
    }
    const externalKey = `${row.provider}:${row.externalId}`;
    const appKey = `${row.provider}:${row.appPlayerId}`;
    if (byExternal.has(externalKey)) {
      throw new IdentitySnapshotError(
        "duplicate_external_id",
        `${externalKey} has more than one active reviewed mapping.`,
      );
    }
    if (byApp.has(appKey)) {
      throw new IdentitySnapshotError(
        "duplicate_app_player",
        `One app player has more than one active reviewed ${row.provider} id.`,
      );
    }
    byExternal.set(externalKey, row.mappingId);
    byApp.set(appKey, row.mappingId);
    entries.push({
      provider: row.provider,
      externalId: row.externalId,
      appPlayerId: row.appPlayerId,
      mappingId: row.mappingId,
      version: row.version,
      updatedAt: row.updatedAt,
    });
  }
  entries.sort((a, b) => cmp(a.provider, b.provider) || cmp(a.externalId, b.externalId));
  const digest = await sha256Hex(canonicalJson(entries));
  return {
    kind: "reviewed-identity-snapshot/v1",
    capturedAt,
    digest,
    entries,
    excluded: { inactive, unreviewed },
  };
}

/** Lookup over a snapshot. Read-only; built once per reconcile call. */
export interface ReviewedIdentityIndex {
  readonly snapshot: ReviewedIdentitySnapshot;
  entryOf(provider: IdentityProvider, externalId: string | null): ReviewedIdentityEntry | null;
  appPlayerOf(provider: IdentityProvider, externalId: string | null): string | null;
}

export function indexReviewedIdentities(snapshot: ReviewedIdentitySnapshot): ReviewedIdentityIndex {
  const map = new Map<string, ReviewedIdentityEntry>();
  for (const entry of snapshot.entries) map.set(`${entry.provider}:${entry.externalId}`, entry);
  const entryOf = (provider: IdentityProvider, externalId: string | null) =>
    externalId === null ? null : (map.get(`${provider}:${externalId}`) ?? null);
  return {
    snapshot,
    entryOf,
    appPlayerOf: (provider, externalId) => entryOf(provider, externalId)?.appPlayerId ?? null,
  };
}

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
