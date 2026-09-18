import { chmod } from "node:fs/promises";
import { resolve } from "node:path";

import { parseRequestedSeasonIds } from "./g7-historical-performance-backfill-runner";
import {
  runTwoSeasonBackfillPreflight,
  TWO_SEASON_BACKFILL_SCOPE,
} from "./sportsmonks-two-season-backfill-preflight";
import { SportsMonksProbeError } from "./sportsmonks-production-probe";

async function writeEvidence(payload: unknown, name: string): Promise<void> {
  const directory = process.env.G7_BACKFILL_EVIDENCE_DIR?.trim();
  if (!directory) throw new SportsMonksProbeError("missing_evidence_directory");
  const path = resolve(directory, name);
  await Bun.write(path, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

function requestedSeasonIdsOrThrow(): number[] {
  try {
    return parseRequestedSeasonIds(process.env.G7_SEASON_IDS);
  } catch {
    throw new SportsMonksProbeError("g7_season_ids_invalid");
  }
}

async function main(): Promise<void> {
  // Reads and validates G7_SEASON_IDS the same way the runner does (imported, not re-implemented)
  // so the preflight and the runner cannot disagree about which requested seasons are in scope.
  const requestedSeasonIds = requestedSeasonIdsOrThrow();
  const manifest = await runTwoSeasonBackfillPreflight(process.env);
  await writeEvidence(manifest, "g7-historical-performance-backfill-manifest.json");
  await writeEvidence(
    { schemaVersion: 1, requestedSeasonIds, verdict: "pass" },
    "g7-historical-performance-backfill-scope.json",
  );
  console.log("G7_HISTORICAL_PERFORMANCE_BACKFILL_PREFLIGHT_PASS");
}

if (import.meta.main) {
  main().catch(async (error: unknown) => {
    const rawCode =
      error instanceof SportsMonksProbeError ? error.code : "unexpected_preflight_failure";
    const code = /^[a-z][a-z0-9_]{1,79}$/.test(rawCode) ? rawCode : "unexpected_preflight_failure";
    try {
      await writeEvidence(
        {
          schemaVersion: 1,
          provider: "sportsmonks",
          mode: "read_only_two_season_historical_performance_preflight",
          expectedCommit: /^[0-9a-f]{40}$/.test(process.env.EXPECTED_COMMIT ?? "")
            ? process.env.EXPECTED_COMMIT
            : null,
          requestedSeasonIds: (() => {
            try {
              return parseRequestedSeasonIds(process.env.G7_SEASON_IDS);
            } catch {
              return TWO_SEASON_BACKFILL_SCOPE.map((season) => season.id);
            }
          })(),
          error: code,
          verdict: "fail",
        },
        "g7-historical-performance-backfill-preflight-failure.json",
      );
    } catch {
      // The original failure remains authoritative.
    }
    console.error(`G7_HISTORICAL_PERFORMANCE_BACKFILL_PREFLIGHT_FAIL code=${code}`);
    process.exitCode = 1;
  });
}
