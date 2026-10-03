/**
 * LOCAL, READ-ONLY. For the Maghreb Fes - Zemamra match, lists every Sofascore
 * identity that has no reviewed mapping, and says for each why and what would
 * settle it. Uses only committed payloads and saved read-only catalogue reads:
 * no database, no network, no writes. Prints ids and codes only (no names, no
 * birth dates).
 *
 *   bun scripts/backend/resolve-mas-zemamra-identities.ts [--out report.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyAppearances } from "../../src/backend/fantasy/provider-appearances";
import {
  resolveSofascoreIdentity,
  type CatalogRead,
  type PoolPlayer,
  type Resolution,
} from "../../src/backend/fantasy/provider-identity-resolution";
import type { SofaCandidateRow } from "../../src/backend/fantasy/provider-identity-worklist";
import {
  COMMITTED_GW1_MATCHES,
  loadCommittedMatch,
} from "../../src/backend/fantasy/provider-replay-fixtures";
import {
  buildReviewedIdentitySnapshot,
  indexReviewedIdentities,
  type MappingRowInput,
} from "../../src/backend/fantasy/reviewed-identities";

const root = resolve(import.meta.dir, "../..");
const DIR = "tests/fixtures/identity/";
const read = <T>(path: string): T => JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;

export async function resolveMasZemamra() {
  const match = COMMITTED_GW1_MATCHES.find((m) => m.key === "masZemamra");
  if (!match) throw new Error("masZemamra is not a committed match");
  const data = loadCommittedMatch(match);
  const mappings = read<{ capturedAt: string; rows: MappingRowInput[] }>(
    `${DIR}reviewed-player-mappings-2026-10-03.json`,
  );
  const sofa = read<{ rows: SofaCandidateRow[] }>(
    `${DIR}gw1-sofascore-unmapped-candidates-2026-10-03.json`,
  );
  const catalog = read<{ wide: CatalogRead[]; pool: PoolPlayer[] }>(
    `${DIR}mas-zemamra-catalog-reads-2026-10-03.json`,
  );
  const snapshot = await buildReviewedIdentitySnapshot(mappings.rows, mappings.capturedAt);
  const index = indexReviewedIdentities(snapshot);

  const records = classifyAppearances(data.sofascore, "sofascore");
  const unresolved = records.filter((r) => !index.entryOf("sofascore", r.externalId));
  // The team of each side, from the candidates that do have a record (a missing-record id has none).
  const teamOfSide = new Map<string, string>();
  for (const r of unresolved) {
    const known = catalog.wide.find((c) => c.ext === r.externalId);
    if (known && r.side) teamOfSide.set(r.side, known.team);
  }
  const rows = unresolved.map((r) => {
    const candidate = sofa.rows.find((c) => c.externalId === r.externalId) ?? null;
    const read = catalog.wide.find((c) => c.ext === r.externalId) ?? null;
    const resolution: Resolution = resolveSofascoreIdentity({
      externalId: r.externalId,
      candidate,
      read,
      pool: catalog.pool,
      lineupPosition: r.lineup?.position ?? null,
      lineupClubTeam: (r.side && teamOfSide.get(r.side)) || null,
    });
    return {
      externalId: r.externalId,
      side: r.side,
      lineupPosition: r.lineup?.position ?? null,
      participation: { evidence: r.evidence, state: r.state },
      scoringRelevant: r.scoringRelevant,
      scorer: r.scorer,
      assister: r.assister,
      carded: r.carded,
      candidateRecord: candidate !== null,
      resolution,
    };
  });
  const byClass: Record<string, number> = {};
  for (const r of rows)
    byClass[r.resolution.classification] = (byClass[r.resolution.classification] ?? 0) + 1;
  return {
    snapshotDigest: snapshot.digest,
    appearing: records.length,
    unresolved: rows.length,
    byClass,
    rows,
  };
}

if (import.meta.main) {
  const report = await resolveMasZemamra();
  const text = JSON.stringify(report, null, 2);
  const at = process.argv.indexOf("--out");
  if (at >= 0) writeFileSync(process.argv[at + 1] as string, text);
  else console.log(text);
}
