/**
 * LOCAL, READ-ONLY. Builds the match-focused identity worklist for the seven
 * committed finished GW1 matches, seals the review manifest (deterministic
 * hash), and replays the current reviewed mappings (A) against the same plus the
 * HYPOTHETICAL ready rows (B). It opens no database connection and no network
 * connection, calls no propose, decide or execute, and writes only the files it
 * is told to.
 *
 *   bun scripts/backend/build-gw1-identity-evidence.ts \
 *     [--corroboration tests/fixtures/identity/gw1-dob-corroboration-2026-10-03.json] \
 *     [--write-manifest] [--out report.json]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { rankMatches, remainingWork } from "../../src/backend/fantasy/provider-canary-ranking";
import { replayFixture } from "../../src/backend/fantasy/provider-replay";
import {
  COMMITTED_GW1_MATCHES,
  COMMITTED_OBSERVED_AT,
  loadCommittedMatch,
} from "../../src/backend/fantasy/provider-replay-fixtures";
import {
  buildWorklist,
  hypotheticalSnapshot,
  sealManifest,
  type FlashCandidateRow,
  type SofaCandidateRow,
} from "../../src/backend/fantasy/provider-identity-worklist";
import type { CorroborationResult } from "../../src/backend/fantasy/provider-identity-corroboration";
import {
  buildReviewedIdentitySnapshot,
  type MappingRowInput,
} from "../../src/backend/fantasy/reviewed-identities";

const root = resolve(import.meta.dir, "../..");
const read = <T>(path: string): T => JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const DIR = "tests/fixtures/identity/";

/** The first manifest, kept unchanged as historical evidence (it predates the appearance-coverage correction). */
export const ORIGINAL_MANIFEST_PATH =
  "docs/production/manifests/gw1-identity-evidence-2026-10-03.manifest.json";
/** The corrected manifest: same inputs, appearance coverage corrected. */
export const MANIFEST_PATH =
  "docs/production/manifests/gw1-identity-evidence-2026-10-03.corrected.manifest.json";

export async function buildEvidence(
  options: {
    corroborationPath?: string;
    /** HYPOTHETICAL mapping rows added to the reviewed snapshot, for a what-if only. */
    extraMappings?: readonly MappingRowInput[];
  } = {},
) {
  const mappings = read<{ capturedAt: string; rows: MappingRowInput[] }>(
    `${DIR}reviewed-player-mappings-2026-10-03.json`,
  );
  const flash = read<{ readAt: string; rows: FlashCandidateRow[] }>(
    `${DIR}gw1-flashscore-candidates-2026-10-03.json`,
  );
  const sofa = read<{ readAt: string; rows: SofaCandidateRow[] }>(
    `${DIR}gw1-sofascore-unmapped-candidates-2026-10-03.json`,
  );
  const squads = read<{ squads: Record<string, number> }>(
    `${DIR}fantasy-squad-app-players-2026-10-03.json`,
  );
  // An explicitly requested file that is missing is an error: silently proceeding without it
  // would change the READY classifications (and overwrite the sealed manifest) without notice.
  if (options.corroborationPath && !existsSync(resolve(root, options.corroborationPath))) {
    throw new Error(`--corroboration file not found: ${options.corroborationPath}`);
  }
  const corroboration = options.corroborationPath
    ? read<{ observedAt: string; results: CorroborationResult[] }>(options.corroborationPath)
    : null;
  const locked = new Set(Object.keys(squads.squads));
  const snapshot = await buildReviewedIdentitySnapshot(
    [...mappings.rows, ...(options.extraMappings ?? [])],
    options.extraMappings?.length ? `HYPOTHETICAL(${mappings.capturedAt})` : mappings.capturedAt,
  );
  const loaded = COMMITTED_GW1_MATCHES.map((m) => ({ m, data: loadCommittedMatch(m) }));
  const fixtures = loaded.map(({ m, data }) => ({
    link: { sofascoreFixtureId: m.sofascoreId, flashscoreFixtureId: m.flashscoreId },
    lockedSquadAppPlayerIds: locked,
    ...data,
  }));
  const worklist = await buildWorklist({
    fixtures,
    snapshot,
    flashCandidates: flash.rows,
    sofaCandidates: sofa.rows,
    lockedSquadAppPlayerIds: locked,
    corroboration: (corroboration?.results ?? []).filter(
      (r) => r.dob !== undefined && (r as { dob: string }).dob !== "NOT_FETCHED",
    ),
    times: {
      payloadObservedAt: COMMITTED_OBSERVED_AT,
      mappingSnapshotCapturedAt: snapshot.capturedAt,
      candidateRecordsReadAt: flash.readAt,
      corroborationObservedAt: corroboration?.observedAt ?? null,
    },
  });
  const sealed = await sealManifest(worklist);
  const hypo = await hypotheticalSnapshot(snapshot, worklist);
  const perMatch = loaded.map(({ m, data }) => {
    const a = replayFixture({ observedAt: COMMITTED_OBSERVED_AT, snapshot, ...data });
    const b = replayFixture({ observedAt: COMMITTED_OBSERVED_AT, snapshot: hypo, ...data });
    return { key: m.key, a, b };
  });
  const ranking = rankMatches(perMatch.map(({ key, b }) => remainingWork(key, b)));
  return { snapshot, worklist, sealed, hypo, perMatch, ranking };
}

if (import.meta.main) {
  const built = await buildEvidence({ corroborationPath: arg("--corroboration") });
  if (process.argv.includes("--write-manifest")) {
    writeFileSync(
      resolve(root, MANIFEST_PATH),
      `${JSON.stringify(JSON.parse(built.sealed.text), null, 2)}\n`,
    );
    writeFileSync(
      resolve(root, `${MANIFEST_PATH.replace(/\.json$/, "")}.sha256`),
      `${built.sealed.sha256}\n`,
    );
  }
  const report = {
    manifestSha256: built.sealed.sha256,
    snapshotDigest: built.snapshot.digest,
    hypotheticalDigest: built.hypo.digest,
    counts: built.worklist.counts,
    perMatch: built.perMatch.map(({ key, a, b }) => ({
      key,
      A: {
        stages: a.after && a.stages,
        coverage: a.coverage,
        blockers: a.blockers,
        result: a.after,
      },
      B_HYPOTHETICAL_NOT_PRODUCTION_REVIEWED: {
        stages: b.stages,
        coverage: b.coverage,
        blockers: b.blockers,
        result: b.after,
      },
    })),
    ranking: built.ranking,
  };
  const text = JSON.stringify(report, null, 2);
  if (arg("--out")) writeFileSync(arg("--out") as string, text);
  else console.log(text);
}
