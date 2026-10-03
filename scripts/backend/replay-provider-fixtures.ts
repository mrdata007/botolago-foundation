/**
 * LOCAL, READ-ONLY replay of the seven committed finished matches against a
 * reviewed-mapping snapshot, before and after the mapping-aware reconciler.
 *
 *   bun scripts/backend/replay-provider-fixtures.ts --mappings rows.json [--out report.json]
 *
 * `rows.json` is the output of `scripts/backend/football-reviewed-mapping-snapshot.sql`
 * (one consistent read). This script opens no database connection, makes no
 * network call and writes nothing but the optional --out file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { replayFixture } from "../../src/backend/fantasy/provider-replay";
import {
  COMMITTED_GW1_MATCHES,
  COMMITTED_OBSERVED_AT,
  loadCommittedMatch,
} from "../../src/backend/fantasy/provider-replay-fixtures";
import {
  buildReviewedIdentitySnapshot,
  type MappingRowInput,
} from "../../src/backend/fantasy/reviewed-identities";

const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

/** The columns the snapshot SQL returns, mapped onto the typed input. */
interface SqlRow {
  id: string;
  provider_name: "sofascore" | "flashscore";
  external_id: string;
  internal_entity_id: string;
  source_version: string | null;
  active: boolean;
  manually_corrected: boolean;
  updated_at: string;
}

export const rowsFromSql = (rows: readonly SqlRow[]): MappingRowInput[] =>
  rows.map((r) => ({
    mappingId: r.id,
    provider: r.provider_name,
    externalId: r.external_id,
    appPlayerId: r.internal_entity_id,
    active: r.active,
    reviewed: r.manually_corrected,
    version: r.source_version,
    updatedAt: r.updated_at,
  }));

async function main() {
  const file = arg("--mappings");
  if (!file) throw new Error("--mappings <rows.json> is required");
  const raw = JSON.parse(readFileSync(file, "utf8")) as SqlRow[];
  const rows = rowsFromSql(
    raw.map((r) => ({ ...r, provider_name: r.provider_name ?? "sofascore" })),
  );
  const capturedAt = arg("--captured-at") ?? COMMITTED_OBSERVED_AT;
  const snapshot = await buildReviewedIdentitySnapshot(rows, capturedAt);
  const fixtures = COMMITTED_GW1_MATCHES.map((m) => ({
    key: m.key,
    ...replayFixture({
      observedAt: COMMITTED_OBSERVED_AT,
      snapshot,
      ...loadCommittedMatch(m),
    }),
  }));
  const report = {
    snapshot: {
      digest: snapshot.digest,
      capturedAt: snapshot.capturedAt,
      entries: snapshot.entries.length,
      excluded: snapshot.excluded,
    },
    fixtures,
  };
  const text = JSON.stringify(report, null, 2);
  if (arg("--out")) writeFileSync(arg("--out") as string, text);
  else console.log(text);
}

if (import.meta.main) await main();
