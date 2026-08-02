import { chmod, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type {
  FixtureWindow,
  TwoSeasonBackfillManifest,
} from "./sportsmonks-two-season-backfill-preflight";
import {
  TWO_SEASON_BACKFILL_SCOPE,
  buildFixtureWindows,
} from "./sportsmonks-two-season-backfill-preflight";

type JsonRecord = Record<string, unknown>;
type Counters = Record<string, number>;

const EXPECTED_PROJECT_REF = "tkewgajrljbwgwedqsxn";
const RESTORE_SEASON = {
  id: 26_027,
  startingAt: "2025-09-12",
  endingAt: "2026-07-05",
  teamIds: [
    306, 2_846, 6_856, 9_369, 9_535, 16_845, 16_847, 16_849, 16_850, 16_851, 16_853, 16_858, 16_937,
    227_263, 270_260, 274_759,
  ],
  fixtureWindow: { from: "2026-03-28", to: "2026-07-05" },
} as const;
const COUNT_NAMES = [
  "fetched",
  "validated",
  "inserted",
  "updated",
  "skipped",
  "rejected",
  "retries",
] as const;

export class BackfillRunnerError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "BackfillRunnerError";
  }
}

function object(value: unknown, code: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BackfillRunnerError(code);
  }
  return value as JsonRecord;
}

function positiveInteger(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new BackfillRunnerError(code);
  }
  return value;
}

function counters(value: unknown, code: string): Counters {
  const candidate = object(value, code);
  const result: Counters = {};
  for (const name of COUNT_NAMES) {
    const count = candidate[name];
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
      throw new BackfillRunnerError(code);
    }
    result[name] = count;
  }
  return result;
}

function persisted(counts: Counters): number {
  return counts.inserted + counts.updated + counts.skipped;
}

export function validateCatalogResponse(
  value: unknown,
  expectedRounds: number,
  expectedTeams: number,
): Record<string, Counters> {
  const response = object(value, "invalid_catalog_response");
  if (response.provider !== "sportsmonks") {
    throw new BackfillRunnerError("catalog_provider_mismatch");
  }
  const jobs = object(response.jobs, "invalid_catalog_jobs");
  const expected = {
    competitions: 1,
    seasons: 1,
    rounds: expectedRounds,
    teams: expectedTeams,
  };
  const result: Record<string, Counters> = {};
  for (const [job, count] of Object.entries(expected)) {
    const values = counters(jobs[job], `invalid_catalog_${job}_counts`);
    if (
      values.fetched !== count ||
      values.validated !== count ||
      values.rejected !== 0 ||
      persisted(values) !== count
    ) {
      throw new BackfillRunnerError(`catalog_${job}_count_mismatch`);
    }
    result[job] = values;
  }
  return result;
}

export function validateContentResponse(
  value: unknown,
  seasonId: number,
  expectedTeams: number,
): { squads: Counters; standings: Counters } {
  const response = object(value, "invalid_content_response");
  if (response.provider !== "sportsmonks" || response.seasonId !== seasonId) {
    throw new BackfillRunnerError("content_scope_mismatch");
  }
  const jobs = object(response.jobs, "invalid_content_jobs");
  const squadsObject = object(jobs.squads, "invalid_squad_counts");
  const squads = counters(squadsObject, "invalid_squad_counts");
  const uniquePlayers = positiveInteger(squadsObject.uniquePlayers, "invalid_unique_player_count");
  const playersInserted = Number(squadsObject.playersInserted);
  const playersUpdated = Number(squadsObject.playersUpdated);
  const playersSkipped = Number(squadsObject.playersSkipped);
  if (
    ![playersInserted, playersUpdated, playersSkipped].every(
      (count) => Number.isSafeInteger(count) && count >= 0,
    ) ||
    squads.fetched !== squads.validated + squads.skipped + squads.rejected ||
    squads.validated < expectedTeams ||
    squads.inserted + squads.updated !== squads.validated ||
    playersInserted + playersUpdated + playersSkipped !== squads.validated ||
    uniquePlayers > squads.validated
  ) {
    throw new BackfillRunnerError("squad_count_mismatch");
  }
  Object.assign(squads, { uniquePlayers, playersInserted, playersUpdated, playersSkipped });

  const standings = counters(jobs.standings, "invalid_standing_counts");
  if (
    standings.fetched !== expectedTeams ||
    standings.validated !== expectedTeams ||
    standings.rejected !== 0 ||
    persisted(standings) !== expectedTeams
  ) {
    throw new BackfillRunnerError("standing_count_mismatch");
  }
  return { squads, standings };
}

export function validateFixtureResponse(value: unknown, expectedWindow: FixtureWindow): Counters {
  const response = object(value, "invalid_fixture_response");
  const window = object(response.window, "invalid_fixture_window");
  if (
    response.provider !== "sportsmonks" ||
    window.from !== expectedWindow.from ||
    window.to !== expectedWindow.to
  ) {
    throw new BackfillRunnerError("fixture_scope_mismatch");
  }
  const values = counters(
    object(response.jobs, "invalid_fixture_jobs").fixtures,
    "invalid_fixture_counts",
  );
  if (
    values.fetched < 1 ||
    values.fetched > 150 ||
    values.validated !== values.fetched ||
    values.rejected !== 0 ||
    persisted(values) !== values.fetched
  ) {
    throw new BackfillRunnerError("fixture_count_mismatch");
  }
  return values;
}

export function validateRatingsResponse(value: unknown, seasonId: number): JsonRecord {
  const response = object(value, "invalid_ratings_response");
  const candidates = positiveInteger(response.candidates, "invalid_rating_candidate_count");
  const values = counters(response.counters, "invalid_rating_counts");
  const range = object(response.ratingRange, "invalid_rating_range");
  const minimum = range.minimum;
  const maximum = range.maximum;
  if (
    response.provider !== "sportsmonks" ||
    response.seasonId !== seasonId ||
    response.algorithmVersion !== "botolago-preseason-rating-v1" ||
    values.validated !== candidates ||
    persisted(values) < candidates ||
    typeof minimum !== "number" ||
    typeof maximum !== "number" ||
    minimum < 4 ||
    minimum > maximum ||
    maximum > 10
  ) {
    throw new BackfillRunnerError("rating_count_mismatch");
  }
  return { candidates, ratingRange: { minimum, maximum }, counters: values };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new BackfillRunnerError(`missing_${name.toLowerCase()}`);
  return value;
}

async function jsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    throw new BackfillRunnerError("invalid_backfill_manifest_json");
  }
}

function validateManifest(value: unknown, expectedCommit: string): TwoSeasonBackfillManifest {
  const manifest = object(value, "invalid_backfill_manifest");
  const seasons = Array.isArray(manifest.seasons) ? manifest.seasons : [];
  if (
    manifest.schemaVersion !== 1 ||
    manifest.provider !== "sportsmonks" ||
    manifest.mode !== "read_only_two_season_backfill_preflight" ||
    manifest.expectedCommit !== expectedCommit ||
    manifest.seasonCount !== 2 ||
    manifest.requestCount !== 11 ||
    manifest.verdict !== "pass" ||
    seasons.length !== 2 ||
    object(seasons[0], "invalid_manifest_season").id !== 26_027 ||
    object(seasons[1], "invalid_manifest_season").id !== 24_319
  ) {
    throw new BackfillRunnerError("backfill_manifest_scope_mismatch");
  }
  for (const [index, pinned] of TWO_SEASON_BACKFILL_SCOPE.entries()) {
    const season = object(seasons[index], "invalid_manifest_season");
    const teamIds = Array.isArray(season.teamIds) ? season.teamIds : [];
    const windows = Array.isArray(season.fixtureWindows) ? season.fixtureWindows : [];
    if (
      season.id !== pinned.id ||
      season.name !== pinned.name ||
      season.startingAt !== pinned.startingAt ||
      season.endingAt !== pinned.endingAt ||
      typeof season.rounds !== "number" ||
      !Number.isSafeInteger(season.rounds) ||
      season.rounds < 1 ||
      season.rounds > 100 ||
      teamIds.length < 2 ||
      teamIds.length > 20 ||
      teamIds.some(
        (teamId) => typeof teamId !== "number" || !Number.isSafeInteger(teamId) || teamId <= 0,
      ) ||
      new Set(teamIds).size !== teamIds.length ||
      JSON.stringify(windows) !==
        JSON.stringify(buildFixtureWindows(pinned.startingAt, pinned.endingAt))
    ) {
      throw new BackfillRunnerError(`backfill_manifest_season_scope_mismatch_${pinned.id}`);
    }
  }
  return value as TwoSeasonBackfillManifest;
}

function envFileContent(
  season: TwoSeasonBackfillManifest["seasons"][number] | typeof RESTORE_SEASON,
  window: { readonly from: string; readonly to: string },
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
    FOOTBALL_SPORTSMONKS_FIXTURE_FROM: window.from,
    FOOTBALL_SPORTSMONKS_FIXTURE_TO: window.to,
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

async function runCommand(
  operation: string,
  executable: string,
  args: readonly string[],
  runtimeDirectory: string,
): Promise<CommandResult> {
  const process = Bun.spawn([executable, ...args], {
    env: processEnv(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  const rawLog = resolve(runtimeDirectory, `${operation}.raw.log`);
  await writeFile(rawLog, `${stdout}${stderr}`, { mode: 0o600 });
  await chmod(rawLog, 0o600);
  return { operation, exitCode };
}

function processEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

async function writeSecure(path: string, content: string): Promise<void> {
  await writeFile(path, content, { mode: 0o600 });
  await chmod(path, 0o600);
}

interface RequestEvidence {
  readonly operation: string;
  readonly httpStatus: number;
  readonly responseFile: string;
  readonly response: JsonRecord;
}

async function invoke(
  operation: string,
  job: string,
  payload: JsonRecord,
  evidenceDirectory: string,
  trigger: string,
): Promise<RequestEvidence> {
  const endpoint = `https://${EXPECTED_PROJECT_REF}.supabase.co/functions/v1/football-ingest`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-botolago-ingestion-job": job,
        apikey: required("SUPABASE_SECRET_KEY"),
        Authorization: `Bearer ${required("SUPABASE_SECRET_KEY")}`,
        "x-botolago-ingestion-key": trigger,
      },
      body: JSON.stringify(payload),
      redirect: "error",
      signal: AbortSignal.timeout(600_000),
    });
  } catch {
    throw new BackfillRunnerError(`${operation}_network_failure`);
  }
  const file = `${operation}.json`;
  const outputPath = resolve(evidenceDirectory, file);
  let parsed: JsonRecord;
  try {
    parsed = object(JSON.parse(await response.text()), `${operation}_invalid_json`);
  } catch (error) {
    if (error instanceof BackfillRunnerError) throw error;
    throw new BackfillRunnerError(`${operation}_invalid_json`);
  }
  await writeSecure(outputPath, `${JSON.stringify(parsed, null, 2)}\n`);
  if (response.status !== 200)
    throw new BackfillRunnerError(`${operation}_http_${response.status}`);
  return { operation, httpStatus: response.status, responseFile: file, response: parsed };
}

async function main(): Promise<void> {
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    required("CONFIRMATION") !== "RUN_G5_TWO_SEASON_BACKFILL"
  ) {
    throw new BackfillRunnerError("production_runner_guard_failed");
  }
  if (required("EXPECTED_PROJECT_REF") !== EXPECTED_PROJECT_REF) {
    throw new BackfillRunnerError("production_project_guard_failed");
  }
  const expectedCommit = required("EXPECTED_COMMIT");
  if (!/^[0-9a-f]{40}$/.test(expectedCommit) || required("GITHUB_SHA") !== expectedCommit) {
    throw new BackfillRunnerError("invalid_expected_commit");
  }
  const runtimeDirectory = resolve(required("G5_BACKFILL_RUNTIME_DIR"));
  const evidenceDirectory = resolve(required("G5_BACKFILL_EVIDENCE_DIR"));
  const manifestPath = resolve(evidenceDirectory, "g5-two-season-backfill-manifest.json");
  const manifest = validateManifest(await jsonFile(manifestPath), expectedCommit);
  const supabase = resolve("node_modules/.bin/supabase");
  const trigger = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  console.log(`::add-mask::${trigger}`);
  process.env.FOOTBALL_INGESTION_TRIGGER_SECRET = trigger;
  await writeFile(required("GITHUB_ENV"), `G5_BACKFILL_TRIGGER=${trigger}\n`, { flag: "a" });

  const evidence: JsonRecord = {
    schemaVersion: 1,
    mode: "production_two_season_historical_backfill",
    expectedCommit,
    projectRef: EXPECTED_PROJECT_REF,
    requestedSeasonIds: [26_027, 24_319],
    commands: [],
    seasons: [],
    restoration: { attempted: false, succeeded: false },
    verdict: "fail",
  };
  const commands = evidence.commands as CommandResult[];
  const seasonEvidence = evidence.seasons as JsonRecord[];
  const resultPath = resolve(evidenceDirectory, "g5-two-season-backfill-result.json");
  let failureCode: string | undefined;

  try {
    for (const season of manifest.seasons) {
      const item: JsonRecord = {
        id: season.id,
        name: season.name,
        startingAt: season.startingAt,
        endingAt: season.endingAt,
        teamCount: season.teamIds.length,
        rounds: season.rounds,
        requests: [],
      };
      seasonEvidence.push(item);
      const requests = item.requests as JsonRecord[];
      const secretPath = resolve(runtimeDirectory, `season-${season.id}.env`);
      await writeSecure(secretPath, envFileContent(season, season.fixtureWindows[0], trigger));
      const setResult = await runCommand(
        `season-${season.id}-configuration`,
        supabase,
        ["secrets", "set", "--project-ref", EXPECTED_PROJECT_REF, "--env-file", secretPath],
        runtimeDirectory,
      );
      commands.push(setResult);
      if (setResult.exitCode !== 0) {
        throw new BackfillRunnerError(`season_${season.id}_configuration_failed`);
      }

      const catalog = await invoke(
        `season-${season.id}-catalog`,
        "catalog",
        { job: "catalog", pageSize: 50, maxPages: 20 },
        evidenceDirectory,
        trigger,
      );
      item.catalog = validateCatalogResponse(
        catalog.response,
        season.rounds,
        season.teamIds.length,
      );
      requests.push({
        operation: catalog.operation,
        httpStatus: catalog.httpStatus,
        responseFile: catalog.responseFile,
      });

      const content = await invoke(
        `season-${season.id}-historical-content`,
        "historical_content",
        { job: "historical_content" },
        evidenceDirectory,
        trigger,
      );
      item.historicalContent = validateContentResponse(
        content.response,
        season.id,
        season.teamIds.length,
      );
      requests.push({
        operation: content.operation,
        httpStatus: content.httpStatus,
        responseFile: content.responseFile,
      });

      const ratings = await invoke(
        `season-${season.id}-ratings`,
        "preseason_ratings",
        { job: "preseason_ratings" },
        evidenceDirectory,
        trigger,
      );
      item.ratings = validateRatingsResponse(ratings.response, season.id);
      requests.push({
        operation: ratings.operation,
        httpStatus: ratings.httpStatus,
        responseFile: ratings.responseFile,
      });

      const fixtureResults: JsonRecord[] = [];
      item.fixtureWindows = fixtureResults;
      for (let index = 0; index < season.fixtureWindows.length; index += 1) {
        const window = season.fixtureWindows[index];
        if (index > 0) {
          await writeSecure(secretPath, envFileContent(season, window, trigger));
          const windowSet = await runCommand(
            `season-${season.id}-window-${index + 1}-configuration`,
            supabase,
            ["secrets", "set", "--project-ref", EXPECTED_PROJECT_REF, "--env-file", secretPath],
            runtimeDirectory,
          );
          commands.push(windowSet);
          if (windowSet.exitCode !== 0) {
            throw new BackfillRunnerError(
              `season_${season.id}_window_${index + 1}_configuration_failed`,
            );
          }
        }
        const fixtures = await invoke(
          `season-${season.id}-fixtures-${index + 1}`,
          "fixtures",
          { job: "fixtures", pageSize: 50, maxPages: 3 },
          evidenceDirectory,
          trigger,
        );
        fixtureResults.push({
          window,
          counters: validateFixtureResponse(fixtures.response, window),
        });
        requests.push({
          operation: fixtures.operation,
          httpStatus: fixtures.httpStatus,
          responseFile: fixtures.responseFile,
        });
      }
    }
    evidence.verdict = "pass";
  } catch (error) {
    failureCode = error instanceof BackfillRunnerError ? error.code : "unexpected_backfill_failure";
    evidence.failureCode = failureCode;
  } finally {
    const restoration = evidence.restoration as JsonRecord;
    restoration.attempted = true;
    const restorePath = resolve(runtimeDirectory, "restore-production-config.env");
    try {
      await writeSecure(
        restorePath,
        envFileContent(RESTORE_SEASON, RESTORE_SEASON.fixtureWindow, trigger),
      );
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
      restoration.fixtureWindow = RESTORE_SEASON.fixtureWindow;
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
    throw new BackfillRunnerError(String(evidence.failureCode ?? "two_season_backfill_failed"));
  }
  console.log(`G5_TWO_SEASON_BACKFILL_PASS evidence=${basename(resultPath)}`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const code = error instanceof BackfillRunnerError ? error.code : "unexpected_backfill_failure";
    console.error(`G5_TWO_SEASON_BACKFILL_FAIL code=${code}`);
    process.exitCode = 1;
  });
}
