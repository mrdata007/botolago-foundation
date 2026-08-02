import { chmod, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import type { TwoSeasonBackfillManifest } from "./sportsmonks-two-season-backfill-preflight";

type JsonRecord = Record<string, unknown>;

const EXPECTED_PROJECT_REF = "tkewgajrljbwgwedqsxn";
const EXPECTED_FIXTURES_PER_SEASON = 240;
const MAX_BATCHES_PER_SEASON = 60;
const BATCH_SIZE = 5;
const CONFIRMATION = "RUN_G7_TWO_SEASON_HISTORICAL_PERFORMANCE_BACKFILL";
const ALGORITHM_VERSION = "botolago-preseason-rating-v2-fixture-performance";

const RESTORE_SEASON = {
  id: 26_027,
  startingAt: "2025-09-12",
  endingAt: "2026-07-05",
} as const;

export class HistoricalPerformanceBackfillError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "HistoricalPerformanceBackfillError";
  }
}

function object(value: unknown, code: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HistoricalPerformanceBackfillError(code);
  }
  return value as JsonRecord;
}

function positiveInteger(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new HistoricalPerformanceBackfillError(code);
  }
  return value;
}

function nonNegativeInteger(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new HistoricalPerformanceBackfillError(code);
  }
  return value;
}

function numericCursor(value: unknown, code: string): string {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new HistoricalPerformanceBackfillError(code);
  }
  return value;
}

interface ValidatedBatch {
  readonly fixturesProcessed: number;
  readonly performanceRows: number;
  readonly excludedIncompleteRows: number;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export function validateHistoricalPerformanceBatch(
  value: unknown,
  expectedSeasonId: number,
  previousCursor: string | null,
): ValidatedBatch {
  const response = object(value, "invalid_historical_performance_batch");
  const counters = object(response.counters, "invalid_historical_performance_counters");
  const fixturesProcessed = positiveInteger(
    response.fixturesProcessed,
    "invalid_historical_fixture_count",
  );
  const performanceRows = positiveInteger(
    response.performanceRows,
    "invalid_historical_performance_count",
  );
  const excludedIncompleteRows = nonNegativeInteger(
    response.excludedIncompleteRows,
    "invalid_historical_excluded_count",
  );
  if (
    response.provider !== "sportsmonks" ||
    response.seasonId !== expectedSeasonId ||
    response.action !== "ingest_batch" ||
    response.expectedFixtureCount !== EXPECTED_FIXTURES_PER_SEASON ||
    fixturesProcessed > BATCH_SIZE ||
    performanceRows < fixturesProcessed * 22 ||
    performanceRows > fixturesProcessed * 100 ||
    counters.rejected !== 0 ||
    nonNegativeInteger(counters.validated, "invalid_historical_validated_count") !==
      performanceRows ||
    typeof response.hasMore !== "boolean"
  ) {
    throw new HistoricalPerformanceBackfillError("historical_performance_batch_mismatch");
  }
  const nextCursor =
    response.nextCursor === null
      ? null
      : numericCursor(response.nextCursor, "invalid_historical_next_cursor");
  if (
    (response.hasMore && nextCursor === null) ||
    (!response.hasMore && nextCursor !== null) ||
    (nextCursor !== null && previousCursor !== null && Number(nextCursor) <= Number(previousCursor))
  ) {
    throw new HistoricalPerformanceBackfillError("historical_performance_cursor_mismatch");
  }
  return {
    fixturesProcessed,
    performanceRows,
    excludedIncompleteRows,
    nextCursor,
    hasMore: response.hasMore,
  };
}

export function validateHistoricalRatingDerivation(
  value: unknown,
  expectedSeasonId: number,
  expectedPerformanceRows: number,
): JsonRecord {
  const response = object(value, "invalid_historical_rating_derivation");
  const range = object(response.ratingRange, "invalid_historical_rating_range");
  const counters = object(response.counters, "invalid_historical_rating_counters");
  const candidates = positiveInteger(response.candidates, "invalid_historical_rating_candidates");
  const minimum = range.minimum;
  const maximum = range.maximum;
  if (
    response.provider !== "sportsmonks" ||
    response.seasonId !== expectedSeasonId ||
    response.action !== "derive_ratings" ||
    response.historicalOnly !== true ||
    response.algorithmVersion !== ALGORITHM_VERSION ||
    response.expectedFixtureCount !== EXPECTED_FIXTURES_PER_SEASON ||
    response.performanceRows !== expectedPerformanceRows ||
    candidates < 100 ||
    candidates > 1_000 ||
    counters.rejected !== 0 ||
    counters.validated !== candidates ||
    typeof response.sourceVersion !== "string" ||
    !/^sportsmonks-season-fixtures:[0-9a-f]{64}$/.test(response.sourceVersion) ||
    typeof minimum !== "number" ||
    typeof maximum !== "number" ||
    minimum < 4 ||
    minimum >= maximum ||
    maximum > 10
  ) {
    throw new HistoricalPerformanceBackfillError("historical_rating_derivation_mismatch");
  }
  return {
    candidates,
    ratingRange: { minimum, maximum },
    sourceVersion: response.sourceVersion,
    counters,
  };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new HistoricalPerformanceBackfillError(`missing_${name.toLowerCase()}`);
  return value;
}

async function jsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    throw new HistoricalPerformanceBackfillError("invalid_historical_backfill_manifest_json");
  }
}

function validateManifest(value: unknown, expectedCommit: string): TwoSeasonBackfillManifest {
  const manifest = object(value, "invalid_historical_backfill_manifest");
  const seasons = Array.isArray(manifest.seasons) ? manifest.seasons : [];
  if (
    manifest.schemaVersion !== 1 ||
    manifest.provider !== "sportsmonks" ||
    manifest.mode !== "read_only_two_season_backfill_preflight" ||
    manifest.expectedCommit !== expectedCommit ||
    manifest.seasonCount !== 2 ||
    manifest.verdict !== "pass" ||
    seasons.length !== 2 ||
    object(seasons[0], "invalid_historical_manifest_season").id !== 26_027 ||
    object(seasons[1], "invalid_historical_manifest_season").id !== 24_319
  ) {
    throw new HistoricalPerformanceBackfillError("historical_backfill_manifest_scope_mismatch");
  }
  for (const raw of seasons) {
    const season = object(raw, "invalid_historical_manifest_season");
    const teamIds = Array.isArray(season.teamIds) ? season.teamIds : [];
    if (
      typeof season.startingAt !== "string" ||
      typeof season.endingAt !== "string" ||
      teamIds.length !== 16 ||
      teamIds.some(
        (teamId) => typeof teamId !== "number" || !Number.isSafeInteger(teamId) || teamId < 1,
      ) ||
      new Set(teamIds).size !== teamIds.length
    ) {
      throw new HistoricalPerformanceBackfillError("historical_backfill_manifest_scope_mismatch");
    }
  }
  return value as TwoSeasonBackfillManifest;
}

function envFileContent(
  season: {
    readonly id: number;
    readonly startingAt: string;
    readonly endingAt: string;
    readonly teamIds: readonly number[];
  },
  trigger: string,
): string {
  const values: Record<string, string> = {
    SPORTSMONKS_API_TOKEN: required("SPORTSMONKS_API_TOKEN"),
    FOOTBALL_INGESTION_TRIGGER_SECRET: trigger,
    FOOTBALL_PROVIDER: "sportsmonks",
    FOOTBALL_PROVIDER_BASE_URL: "https://api.sportmonks.com/v3/football",
    FOOTBALL_SPORTSMONKS_LEAGUE_ID: "860",
    FOOTBALL_SPORTSMONKS_SEASON_ID: String(season.id),
    FOOTBALL_SPORTSMONKS_TEAM_IDS: season.teamIds.join(","),
    FOOTBALL_SPORTSMONKS_COUNTRY_CODE: "MA",
    FOOTBALL_SPORTSMONKS_COMPETITION_TYPE: "league",
    FOOTBALL_SPORTSMONKS_SEASON_START: season.startingAt,
    FOOTBALL_SPORTSMONKS_SEASON_END: season.endingAt,
    FOOTBALL_SPORTSMONKS_FIXTURE_FROM: season.startingAt,
    FOOTBALL_SPORTSMONKS_FIXTURE_TO: season.endingAt,
    FOOTBALL_PROVIDER_TIMEOUT_MS: "15000",
    FOOTBALL_PROVIDER_MAX_RETRIES: "2",
  };
  return Object.entries(values)
    .map(([name, value]) => `${name}=${value}\n`)
    .join("");
}

interface CommandResult {
  readonly operation: string;
  readonly exitCode: number;
}

function processEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

async function runCommand(
  operation: string,
  executable: string,
  args: readonly string[],
  runtimeDirectory: string,
): Promise<CommandResult> {
  const child = Bun.spawn([executable, ...args], {
    env: processEnv(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  await writeSecure(resolve(runtimeDirectory, `${operation}.raw.log`), `${stdout}${stderr}`);
  await writeSecure(resolve(runtimeDirectory, `${operation}.exit`), `${exitCode}\n`);
  return { operation, exitCode };
}

async function writeSecure(path: string, content: string): Promise<void> {
  await writeFile(path, content, { mode: 0o600 });
  await chmod(path, 0o600);
}

interface Invocation {
  readonly status: number;
  readonly response: JsonRecord;
  readonly responseFile: string;
}

async function invoke(
  operation: string,
  payload: JsonRecord,
  evidenceDirectory: string,
  trigger: string,
): Promise<Invocation> {
  const endpoint = `https://${EXPECTED_PROJECT_REF}.supabase.co/functions/v1/football-ingest`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-botolago-ingestion-job": "historical_player_performances",
        apikey: required("SUPABASE_SECRET_KEY"),
        Authorization: `Bearer ${required("SUPABASE_SECRET_KEY")}`,
        "x-botolago-ingestion-key": trigger,
      },
      body: JSON.stringify(payload),
      redirect: "error",
      signal: AbortSignal.timeout(600_000),
    });
  } catch {
    throw new HistoricalPerformanceBackfillError(`${operation}_network_failure`);
  }
  const responseFile = `${operation}.json`;
  const path = resolve(evidenceDirectory, responseFile);
  let parsed: JsonRecord;
  try {
    parsed = object(JSON.parse(await response.text()), `${operation}_invalid_json`);
  } catch (error) {
    if (error instanceof HistoricalPerformanceBackfillError) throw error;
    throw new HistoricalPerformanceBackfillError(`${operation}_invalid_json`);
  }
  await writeSecure(path, `${JSON.stringify(parsed, null, 2)}\n`);
  if (response.status !== 200) {
    const error =
      typeof parsed.error === "string" && /^[a-z][a-z0-9_]{1,79}$/.test(parsed.error)
        ? parsed.error
        : `http_${response.status}`;
    throw new HistoricalPerformanceBackfillError(`${operation}_${error}`);
  }
  return { status: response.status, response: parsed, responseFile };
}

async function main(): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== "true" || required("CONFIRMATION") !== CONFIRMATION) {
    throw new HistoricalPerformanceBackfillError("production_runner_guard_failed");
  }
  if (required("EXPECTED_PROJECT_REF") !== EXPECTED_PROJECT_REF) {
    throw new HistoricalPerformanceBackfillError("production_project_guard_failed");
  }
  const expectedCommit = required("EXPECTED_COMMIT");
  if (!/^[0-9a-f]{40}$/.test(expectedCommit) || required("GITHUB_SHA") !== expectedCommit) {
    throw new HistoricalPerformanceBackfillError("invalid_expected_commit");
  }
  const runtimeDirectory = resolve(required("G7_BACKFILL_RUNTIME_DIR"));
  const evidenceDirectory = resolve(required("G7_BACKFILL_EVIDENCE_DIR"));
  const manifest = validateManifest(
    await jsonFile(resolve(evidenceDirectory, "g7-historical-performance-backfill-manifest.json")),
    expectedCommit,
  );
  const supabase = resolve("node_modules/.bin/supabase");
  const trigger = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  console.log(`::add-mask::${trigger}`);
  process.env.FOOTBALL_INGESTION_TRIGGER_SECRET = trigger;
  await writeFile(required("GITHUB_ENV"), `G7_BACKFILL_TRIGGER=${trigger}\n`, { flag: "a" });

  const evidence: JsonRecord = {
    schemaVersion: 1,
    mode: "production_two_season_historical_player_performance_backfill",
    historicalOnly: true,
    currentSeasonActivated: false,
    expectedCommit,
    projectRef: EXPECTED_PROJECT_REF,
    requestedSeasonIds: [26_027, 24_319],
    expectedFixturesPerSeason: EXPECTED_FIXTURES_PER_SEASON,
    batchSize: BATCH_SIZE,
    algorithmVersion: ALGORITHM_VERSION,
    commands: [],
    seasons: [],
    restoration: { attempted: false, succeeded: false },
    verdict: "fail",
  };
  const commands = evidence.commands as CommandResult[];
  const seasonResults = evidence.seasons as JsonRecord[];
  const resultPath = resolve(evidenceDirectory, "g7-historical-performance-backfill-result.json");
  let failureCode: string | undefined;

  try {
    for (const season of manifest.seasons) {
      const secretPath = resolve(runtimeDirectory, `season-${season.id}.env`);
      await writeSecure(secretPath, envFileContent(season, trigger));
      const configure = await runCommand(
        `season-${season.id}-configuration`,
        supabase,
        ["secrets", "set", "--project-ref", EXPECTED_PROJECT_REF, "--env-file", secretPath],
        runtimeDirectory,
      );
      commands.push(configure);
      if (configure.exitCode !== 0) {
        throw new HistoricalPerformanceBackfillError(`season_${season.id}_configuration_failed`);
      }

      let cursor: string | null = null;
      let fixturesProcessed = 0;
      let performanceRows = 0;
      let excludedIncompleteRows = 0;
      const requests: JsonRecord[] = [];
      for (let batchNumber = 1; batchNumber <= MAX_BATCHES_PER_SEASON; batchNumber += 1) {
        const invocation = await invoke(
          `season-${season.id}-performance-batch-${String(batchNumber).padStart(2, "0")}`,
          {
            job: "historical_player_performances",
            action: "ingest_batch",
            afterFixtureExternalId: cursor,
            batchSize: BATCH_SIZE,
          },
          evidenceDirectory,
          trigger,
        );
        const batch = validateHistoricalPerformanceBatch(invocation.response, season.id, cursor);
        fixturesProcessed += batch.fixturesProcessed;
        performanceRows += batch.performanceRows;
        excludedIncompleteRows += batch.excludedIncompleteRows;
        requests.push({
          batchNumber,
          status: invocation.status,
          responseFile: invocation.responseFile,
          fixturesProcessed: batch.fixturesProcessed,
          performanceRows: batch.performanceRows,
          excludedIncompleteRows: batch.excludedIncompleteRows,
        });
        cursor = batch.nextCursor;
        if (!batch.hasMore) break;
        if (batchNumber === MAX_BATCHES_PER_SEASON) {
          throw new HistoricalPerformanceBackfillError(`season_${season.id}_batch_limit_exceeded`);
        }
      }
      if (fixturesProcessed !== EXPECTED_FIXTURES_PER_SEASON) {
        throw new HistoricalPerformanceBackfillError(`season_${season.id}_fixture_count_mismatch`);
      }

      const derivation = await invoke(
        `season-${season.id}-rating-derivation`,
        { job: "historical_player_performances", action: "derive_ratings" },
        evidenceDirectory,
        trigger,
      );
      const rating = validateHistoricalRatingDerivation(
        derivation.response,
        season.id,
        performanceRows,
      );
      seasonResults.push({
        id: season.id,
        name: season.name,
        completed: true,
        current: false,
        fixturesProcessed,
        performanceRows,
        excludedIncompleteRows,
        batches: requests.length,
        requests,
        rating: {
          ...rating,
          status: derivation.status,
          responseFile: derivation.responseFile,
        },
      });
    }
    evidence.verdict = "pass";
  } catch (error) {
    failureCode =
      error instanceof HistoricalPerformanceBackfillError
        ? error.code
        : "unexpected_historical_performance_backfill_failure";
    evidence.failureCode = failureCode;
  } finally {
    const restoration = evidence.restoration as JsonRecord;
    restoration.attempted = true;
    try {
      // validateManifest proves the pinned 26027 season exists before mutation.
      const baseline = manifest.seasons.find((season) => season.id === RESTORE_SEASON.id)!;
      const restorePath = resolve(runtimeDirectory, "restore-production-config.env");
      await writeSecure(restorePath, envFileContent(baseline, trigger));
      const restore = await runCommand(
        "restore-production-configuration",
        supabase,
        ["secrets", "set", "--project-ref", EXPECTED_PROJECT_REF, "--env-file", restorePath],
        runtimeDirectory,
      );
      commands.push(restore);
      const unset = await runCommand(
        "disable-one-time-trigger",
        supabase,
        [
          "secrets",
          "unset",
          "FOOTBALL_INGESTION_TRIGGER_SECRET",
          "--project-ref",
          EXPECTED_PROJECT_REF,
        ],
        runtimeDirectory,
      );
      commands.push(unset);
      restoration.succeeded = restore.exitCode === 0 && unset.exitCode === 0;
      restoration.seasonId = RESTORE_SEASON.id;
      if (!restoration.succeeded) {
        evidence.verdict = "fail";
        evidence.failureCode = failureCode ?? "production_configuration_restore_failed";
      }
    } catch {
      restoration.succeeded = false;
      evidence.verdict = "fail";
      evidence.failureCode = failureCode ?? "production_configuration_restore_failed";
    }
    await writeSecure(resultPath, `${JSON.stringify(evidence, null, 2)}\n`);
  }

  if (evidence.verdict !== "pass") {
    throw new HistoricalPerformanceBackfillError(
      String(evidence.failureCode ?? "historical_performance_backfill_failed"),
    );
  }
  console.log(`G7_HISTORICAL_PERFORMANCE_BACKFILL_PASS evidence=${basename(resultPath)}`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const code =
      error instanceof HistoricalPerformanceBackfillError
        ? error.code
        : "unexpected_historical_performance_backfill_failure";
    console.error(`G7_HISTORICAL_PERFORMANCE_BACKFILL_FAIL code=${code}`);
    process.exitCode = 1;
  });
}
