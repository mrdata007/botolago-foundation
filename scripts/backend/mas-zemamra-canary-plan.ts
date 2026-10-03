/**
 * LOCAL, READ-ONLY. Where Maghreb Fes - Zemamra stands under three clearly separated worlds:
 *   A  the reviewed mappings that exist today (production);
 *   B  A plus the Flashscore rows of the EXECUTABLE manifest (HYPOTHETICAL: not proposed, not approved);
 *   C  B plus the Sofascore identities the catalogue already identifies (HYPOTHETICAL).
 * It uses committed payloads, saved read-only catalogue reads and the committed manifest. It opens no
 * database or network connection and writes only the file it is told to. Ids and counts only.
 *
 *   bun scripts/backend/mas-zemamra-canary-plan.ts [--out plan.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { replayFixture, type FixtureReplay } from "../../src/backend/fantasy/provider-replay";
import {
  COMMITTED_GW1_MATCHES,
  COMMITTED_OBSERVED_AT,
  loadCommittedMatch,
} from "../../src/backend/fantasy/provider-replay-fixtures";
import {
  buildReviewedIdentitySnapshot,
  type MappingRowInput,
  type ReviewedIdentitySnapshot,
} from "../../src/backend/fantasy/reviewed-identities";
import type { FlashscoreManifest } from "../../src/backend/football/identity/bulk-mapping/flashscore-manifest";
import { buildEvidence } from "./build-gw1-identity-evidence";
import { resolveMasZemamra } from "./resolve-mas-zemamra-identities";

const root = resolve(import.meta.dir, "../..");
const read = <T>(path: string): T => JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;

const hypothetical = (
  provider: "sofascore" | "flashscore",
  externalId: string,
  appPlayerId: string,
  why: string,
): MappingRowInput => ({
  mappingId: `HYPOTHETICAL:${why}:${provider}:${externalId}`,
  provider,
  externalId,
  appPlayerId,
  active: true,
  reviewed: true,
  version: "HYPOTHETICAL_NOT_PRODUCTION_REVIEWED",
  updatedAt: "HYPOTHETICAL",
});

const summary = (replay: FixtureReplay) => ({
  stages: replay.stages,
  sofascoreUnresolved: replay.coverage.sofascore.appearedUnresolvedIds.length,
  sofascoreUnresolvedWithScoringIncidents: replay.coverage.sofascore.unresolvedWithScoringIncidents,
  sofascoreUnresolvedStarters: replay.coverage.sofascore.appearedUnresolvedStarters,
  flashscoreUnresolved: replay.coverage.flashscore.appearedUnresolvedIds.length,
  flashscoreUnresolvedWithScoringIncidents:
    replay.coverage.flashscore.unresolvedWithScoringIncidents,
  heldBack: replay.after.heldBack,
  blockers: replay.blockers,
});

export async function masZemamraPlan() {
  const mappings = read<{ capturedAt: string; rows: MappingRowInput[] }>(
    "tests/fixtures/identity/reviewed-player-mappings-2026-10-03.json",
  );
  const manifest = read<FlashscoreManifest>(
    "docs/production/manifests/gw1-flashscore-executable.manifest.json",
  );
  const match = COMMITTED_GW1_MATCHES.find((m) => m.key === "masZemamra");
  if (!match) throw new Error("masZemamra is not a committed match");
  const data = loadCommittedMatch(match);
  const resolution = await resolveMasZemamra();

  const snapshotA: ReviewedIdentitySnapshot = await buildReviewedIdentitySnapshot(
    mappings.rows,
    mappings.capturedAt,
  );
  // B: the executable Flashscore rows (only those whose fixture is this match are used by the replay, but all are added).
  const flashRows = manifest.rows.map((r) =>
    hypothetical("flashscore", r.externalId, r.appPlayerId, "B"),
  );
  const snapshotB = await buildReviewedIdentitySnapshot(
    [...mappings.rows, ...flashRows],
    `HYPOTHETICAL_B(${mappings.capturedAt})`,
  );
  // C: B plus the Sofascore identities the catalogue already identifies (one canonical player each).
  const identified = resolution.rows.filter(
    (r) =>
      r.resolution.classification === "EXISTING_CANONICAL_PLAYER_IDENTIFIED" &&
      r.resolution.targetAppPlayerId,
  );
  const sofaRows = identified.map((r) =>
    hypothetical("sofascore", r.externalId, r.resolution.targetAppPlayerId as string, "C"),
  );
  const snapshotC = await buildReviewedIdentitySnapshot(
    [...mappings.rows, ...flashRows, ...sofaRows],
    `HYPOTHETICAL_C(${mappings.capturedAt})`,
  );

  const run = (snapshot: ReviewedIdentitySnapshot) =>
    summary(replayFixture({ observedAt: COMMITTED_OBSERVED_AT, snapshot, ...data }));

  // With those Sofascore identities reviewed, which MORE Flashscore ids of this match would have evidence?
  // (They cannot be proposed until the Sofascore mappings exist: a later batch, not part of the 42.)
  const worklistC = await buildEvidence({
    corroborationPath: "tests/fixtures/identity/gw1-dob-corroboration-2026-10-03.json",
    extraMappings: sofaRows,
  });
  const alreadyInManifest = new Set(manifest.rows.map((r) => r.externalId));
  const heldBack = new Set(manifest.heldBack.map((h) => h.externalId));
  const laterFlashscore = worklistC.worklist.rows.filter(
    (r) =>
      r.provider === "flashscore" &&
      r.classification === "READY_FOR_BATCH_REVIEW" &&
      !alreadyInManifest.has(r.externalId) &&
      !heldBack.has(r.externalId) &&
      r.fixtures.some((f) => f.sofascoreFixtureId === match.sofascoreId),
  );

  // What C still lacks: the identities the catalogue does not settle, by class.
  const remaining = resolution.rows.filter(
    (r) => r.resolution.classification !== "EXISTING_CANONICAL_PLAYER_IDENTIFIED",
  );
  const scoringRemaining = remaining.filter((r) => r.scoringRelevant || r.lineupPosition === "G");
  return {
    match: match.key,
    worlds: {
      A_CURRENT_REVIEWED_PRODUCTION: run(snapshotA),
      B_PLUS_EXECUTABLE_FLASHSCORE_ROWS_HYPOTHETICAL: run(snapshotB),
      C_PLUS_CATALOGUE_IDENTIFIED_SOFASCORE_HYPOTHETICAL: run(snapshotC),
    },
    flashscoreRowsInThisMatch: manifest.rows.filter((r) =>
      r.fixtures.some((f) => f.sofascoreFixtureId === match.sofascoreId),
    ).length,
    flashscoreRowsUnlockedByC: laterFlashscore.map((r) => ({
      externalId: r.externalId,
      evidenceClass: r.evidenceClass,
      dependsOnSofascoreId: r.supportingMappings.map((s) => s.externalId),
    })),
    identifiedByCatalogue: identified.map((r) => ({
      externalId: r.externalId,
      conflicts: r.resolution.attributeConflicts,
      code: r.resolution.code,
      inLockedSquad: r.resolution.fantasy.inLockedSquad,
    })),
    stillUnresolvedAfterC: remaining.map((r) => ({
      externalId: r.externalId,
      classification: r.resolution.classification,
      code: r.resolution.code,
      lineupPosition: r.lineupPosition,
      scoringRelevant: r.scoringRelevant,
    })),
    scoringRelevantStillUnresolvedAfterC: scoringRemaining.map((r) => r.externalId),
  };
}

if (import.meta.main) {
  const plan = await masZemamraPlan();
  const text = JSON.stringify(plan, null, 2);
  const at = process.argv.indexOf("--out");
  if (at >= 0) writeFileSync(process.argv[at + 1] as string, text);
  else console.log(text);
}
