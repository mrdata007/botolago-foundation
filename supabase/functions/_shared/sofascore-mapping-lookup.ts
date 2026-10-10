// Builds the `SofascoreMappingLookup` that `buildFixtureIngestPlan` needs from
// rows of app_private.football_provider_mappings. Pure: it takes rows that the
// caller already read, never a database client, so it runs under Bun and Deno
// and cannot write anything.
//
// A row counts only when provider_name is 'sofascore', it is active and its
// entity type is one the fixtures plan resolves. Two active rows for the same
// (entity type, external id) that point at different internal ids are
// ambiguous: neither is trusted, the key resolves to null (so the event is
// reported unmapped, never ingested against a guess) and the key is listed.

import {
  createMapLookup,
  SOFASCORE_PROVIDER_NAME,
  type SofascoreEntityType,
  type SofascoreMappingLookup,
} from "./sofascore-fixtures.ts";

export interface FootballProviderMappingRow {
  readonly provider_name: string;
  readonly entity_type: string;
  readonly external_id: string;
  readonly internal_entity_id: string;
  readonly active: boolean;
}

const ENTITY_TYPES: ReadonlySet<string> = new Set<SofascoreEntityType>([
  "competition",
  "season",
  "round",
  "team",
  "fixture",
]);

export interface SofascoreMappingLookupResult {
  readonly lookup: SofascoreMappingLookup;
  /** Accepted mappings per entity type. */
  readonly counts: Readonly<Record<SofascoreEntityType, number>>;
  /** `<entity_type>:<external_id>` keys with conflicting active rows. */
  readonly conflicts: readonly string[];
  /** Rows ignored: other provider, inactive or an entity type not used here. */
  readonly ignoredRows: number;
}

export function buildSofascoreMappingLookup(
  rows: readonly FootballProviderMappingRow[],
): SofascoreMappingLookupResult {
  const accepted = new Map<string, [SofascoreEntityType, string, string]>();
  const conflicted = new Set<string>();
  let ignoredRows = 0;
  for (const row of rows) {
    if (
      row.provider_name !== SOFASCORE_PROVIDER_NAME ||
      row.active !== true ||
      !ENTITY_TYPES.has(row.entity_type) ||
      typeof row.external_id !== "string" ||
      row.external_id === "" ||
      typeof row.internal_entity_id !== "string" ||
      row.internal_entity_id === ""
    ) {
      ignoredRows += 1;
      continue;
    }
    const type = row.entity_type as SofascoreEntityType;
    const key = `${type}:${row.external_id}`;
    const existing = accepted.get(key);
    if (existing && existing[2] !== row.internal_entity_id) conflicted.add(key);
    else accepted.set(key, [type, row.external_id, row.internal_entity_id]);
  }
  const entries = [...accepted.entries()]
    .filter(([key]) => !conflicted.has(key))
    .map(([, entry]) => entry);
  const counts: Record<SofascoreEntityType, number> = {
    competition: 0,
    season: 0,
    round: 0,
    team: 0,
    fixture: 0,
  };
  for (const [type] of entries) counts[type] += 1;
  return {
    lookup: createMapLookup(entries),
    counts,
    conflicts: [...conflicted].sort(),
    ignoredRows,
  };
}
