import { createHash } from "node:crypto";
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import type { TwoSeasonBackfillManifest } from "./sportsmonks-two-season-backfill-preflight";

type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

const EXPECTED_PROJECT_REF = "tkewgajrljbwgwedqsxn";
const EXPECTED_FIXTURES_PER_SEASON = 240;
const MAX_BATCHES_PER_SEASON = 60;
const BATCH_SIZE = 5;
const CONFIRMATION = "RUN_G7_TWO_SEASON_HISTORICAL_PERFORMANCE_BACKFILL";
const ALGORITHM_VERSION = "botolago-preseason-rating-v2-fixture-performance";
const PROVIDER_BASE_URL = "https://api.sportmonks.com/v3/football";
const PROVIDER_TIMEOUT_MS = "15000";
const PROVIDER_MAX_RETRIES = "2";

/** The two seasons the shared preflight proves still exist at the provider (BG-0011-OWNER-2 pins 26027 only for a dispatch). */
export const ALLOWED_SEASON_IDS = [26_027, 24_319] as const;

/** The 15 function secrets this runner (and the pre-2026-09-18 defect) mutates. Order matters only for the .env file. */
export const MANAGED_SECRET_NAMES = [
  "SPORTSMONKS_API_TOKEN",
  "FOOTBALL_INGESTION_TRIGGER_SECRET",
  "FOOTBALL_PROVIDER",
  "FOOTBALL_PROVIDER_BASE_URL",
  "FOOTBALL_SPORTSMONKS_LEAGUE_ID",
  "FOOTBALL_SPORTSMONKS_SEASON_ID",
  "FOOTBALL_SPORTSMONKS_TEAM_IDS",
  "FOOTBALL_SPORTSMONKS_COUNTRY_CODE",
  "FOOTBALL_SPORTSMONKS_COMPETITION_TYPE",
  "FOOTBALL_SPORTSMONKS_SEASON_START",
  "FOOTBALL_SPORTSMONKS_SEASON_END",
  "FOOTBALL_SPORTSMONKS_FIXTURE_FROM",
  "FOOTBALL_SPORTSMONKS_FIXTURE_TO",
  "FOOTBALL_PROVIDER_TIMEOUT_MS",
  "FOOTBALL_PROVIDER_MAX_RETRIES",
] as const;

export type ManagedSecretName = (typeof MANAGED_SECRET_NAMES)[number];

const TRIGGER_SECRET_NAME: ManagedSecretName = "FOOTBALL_INGESTION_TRIGGER_SECRET";

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

/** BG-0011 option B: at most this many of a fixture's 22 raw starters may be anonymous. An
 * accepted fixture may therefore legitimately persist as few as 22 - 4 = 18 identified starters
 * (plus its bench). A quarantined fixture persists 0 rows and still counts toward
 * fixturesProcessed (it was attempted), never toward performanceRows. */
const MAX_ANONYMOUS_STARTER_ROWS = 4;
const MIN_IDENTIFIED_STARTER_ROWS = 22 - MAX_ANONYMOUS_STARTER_ROWS;

interface ValidatedBatch {
  readonly fixturesProcessed: number;
  readonly acceptedFixtures: number;
  readonly quarantinedFixtures: number;
  readonly performanceRows: number;
  readonly excludedIncompleteRows: number;
  readonly excludedMappingRows: number;
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
  const quarantinedFixtures = nonNegativeInteger(
    response.quarantinedFixtures,
    "invalid_historical_quarantined_fixture_count",
  );
  const acceptedFixtures = nonNegativeInteger(
    response.acceptedFixtures,
    "invalid_historical_accepted_fixture_count",
  );
  // performanceRows may legitimately be 0 when every fixture in this batch was quarantined.
  const performanceRows = nonNegativeInteger(
    response.performanceRows,
    "invalid_historical_performance_count",
  );
  const excludedIncompleteRows = nonNegativeInteger(
    response.excludedIncompleteRows,
    "invalid_historical_excluded_count",
  );
  const excludedMappingRows = nonNegativeInteger(
    response.excludedMappingRows,
    "invalid_historical_mapping_excluded_count",
  );
  if (
    response.provider !== "sportsmonks" ||
    response.seasonId !== expectedSeasonId ||
    response.action !== "ingest_batch" ||
    response.expectedFixtureCount !== EXPECTED_FIXTURES_PER_SEASON ||
    fixturesProcessed > BATCH_SIZE ||
    acceptedFixtures + quarantinedFixtures !== fixturesProcessed ||
    // BG-0011 option B: an accepted fixture persists at least MIN_IDENTIFIED_STARTER_ROWS rows
    // (its identified starters) plus whatever identified bench rows it also has; a quarantined
    // fixture persists none. This is the relaxed floor that replaces the old `* 22` requirement.
    performanceRows < acceptedFixtures * MIN_IDENTIFIED_STARTER_ROWS ||
    performanceRows > acceptedFixtures * 100 ||
    excludedMappingRows > excludedIncompleteRows ||
    counters.rejected !== quarantinedFixtures ||
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
    acceptedFixtures,
    quarantinedFixtures,
    performanceRows,
    excludedIncompleteRows,
    excludedMappingRows,
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

// ---------------------------------------------------------------------------
// Season scope (BG-0011-OWNER-2: 26027 only for this dispatch; 24319 must not be touched).
// ---------------------------------------------------------------------------

export function parseRequestedSeasonIds(raw: string | undefined): number[] {
  const value = raw?.trim();
  if (!value) throw new HistoricalPerformanceBackfillError("g7_season_ids_empty");
  const parts = value.split(",").map((part) => part.trim());
  if (parts.some((part) => part.length === 0)) {
    throw new HistoricalPerformanceBackfillError("g7_season_ids_malformed");
  }
  const ids = parts.map((part) => {
    if (!/^[1-9]\d*$/.test(part)) {
      throw new HistoricalPerformanceBackfillError("g7_season_ids_malformed");
    }
    const id = Number(part);
    if (!(ALLOWED_SEASON_IDS as readonly number[]).includes(id)) {
      throw new HistoricalPerformanceBackfillError("g7_season_ids_out_of_scope");
    }
    return id;
  });
  if (new Set(ids).size !== ids.length) {
    throw new HistoricalPerformanceBackfillError("g7_season_ids_duplicate");
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Fingerprints. The Management API's secrets endpoint (and the CLI's DIGEST column, which is that
// same API field) never returns plaintext, so a restore can only be PROVEN, never read back.
// ---------------------------------------------------------------------------

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function fingerprintMatches(suppliedValue: string, fingerprint: string): boolean {
  return sha256Hex(suppliedValue) === fingerprint || suppliedValue === fingerprint;
}

/** Parses the Supabase CLI's `secrets list` two-column NAME/DIGEST text table. Never call with --output. */
export function parseSecretsListTable(text: string): Map<string, string> {
  const table = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^[-+|\s]+$/.test(line)) continue;
    const cells = (line.includes("|") ? line.split("|") : line.split(/\s{2,}/))
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
    if (cells.length < 2) continue;
    const [name, digest] = cells;
    if (!name || !digest) continue;
    if (name.toUpperCase() === "NAME" || digest.toUpperCase() === "DIGEST") continue;
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) continue;
    table.set(name, digest);
  }
  return table;
}

export interface CapturedSecret {
  readonly name: ManagedSecretName;
  readonly present: boolean;
  readonly fingerprint: string | null;
}

export type PreRunConfig = Readonly<Record<ManagedSecretName, CapturedSecret>>;

function parsePreRunConfig(value: unknown): PreRunConfig {
  const root = object(value, "invalid_pre_run_config");
  const secrets = object(root.secrets, "invalid_pre_run_config_secrets");
  const result = {} as Record<ManagedSecretName, CapturedSecret>;
  for (const name of MANAGED_SECRET_NAMES) {
    const entry = object(secrets[name], "invalid_pre_run_config_entry");
    if (
      typeof entry.present !== "boolean" ||
      (entry.fingerprint !== null && typeof entry.fingerprint !== "string")
    ) {
      throw new HistoricalPerformanceBackfillError("invalid_pre_run_config_entry");
    }
    result[name] = {
      name,
      present: entry.present,
      fingerprint: entry.fingerprint as string | null,
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface RunnerDependencies {
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Path to the Supabase CLI executable. Fake-CLI tests point this at a recorded shim. */
  readonly cliPath: string;
  readonly fetch: FetchLike;
  readonly now: () => Date;
  /** Writes a runtime/evidence file with mode 0600. */
  readonly writeFile: (path: string, content: string) => Promise<void>;
}

async function defaultWriteSecure(path: string, content: string): Promise<void> {
  await writeFile(path, content, { mode: 0o600 });
  await chmod(path, 0o600);
}

export function defaultRunnerDependencies(): RunnerDependencies {
  return {
    env: process.env,
    cliPath: resolve("node_modules/.bin/supabase"),
    fetch: globalThis.fetch.bind(globalThis),
    now: () => new Date(),
    writeFile: defaultWriteSecure,
  };
}

function required(deps: RunnerDependencies, name: string): string {
  const value = deps.env[name]?.trim();
  if (!value) throw new HistoricalPerformanceBackfillError(`missing_${name.toLowerCase()}`);
  return value;
}

function optional(deps: RunnerDependencies, name: string): string | undefined {
  const value = deps.env[name]?.trim();
  return value ? value : undefined;
}

async function jsonFile(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    throw new HistoricalPerformanceBackfillError("invalid_historical_backfill_manifest_json");
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

interface CommandResult {
  readonly operation: string;
  readonly exitCode: number;
  readonly stdout: string;
}

/**
 * The only shape of a command's outcome allowed to reach `evidence.commands` (and therefore the
 * uploaded evidence JSON). `CommandResult.stdout` carries the raw `secrets list` table so
 * captureConfiguration/performRestore can parse it, and season-configuration/restore stdout can
 * contain live secret values (SPORTSMONKS_API_TOKEN, the freshly-minted
 * FOOTBALL_INGESTION_TRIGGER_SECRET) verbatim on success or failure — never widen this type to
 * carry stdout, and never push a bare CommandResult into evidence.commands.
 */
interface EvidenceCommand {
  readonly operation: string;
  readonly exitCode: number;
}

function toEvidenceCommand(result: CommandResult): EvidenceCommand {
  return { operation: result.operation, exitCode: result.exitCode };
}

async function runCommand(
  deps: RunnerDependencies,
  operation: string,
  args: readonly string[],
  runtimeDirectory: string,
): Promise<CommandResult> {
  // The real process environment (PATH, HOME, …) is always inherited so the CLI executable can
  // actually run; deps.env is layered on top so tests can override specific values it reads.
  const env = {
    ...process.env,
    ...Object.fromEntries(
      Object.entries(deps.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
  };
  const child = Bun.spawn([deps.cliPath, ...args], { env, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  await deps.writeFile(resolve(runtimeDirectory, `${operation}.raw.log`), `${stdout}${stderr}`);
  await deps.writeFile(resolve(runtimeDirectory, `${operation}.exit`), `${exitCode}\n`);
  return { operation, exitCode, stdout };
}

interface Invocation {
  readonly status: number;
  readonly response: JsonRecord;
  readonly responseFile: string;
}

async function invoke(
  deps: RunnerDependencies,
  operation: string,
  payload: JsonRecord,
  evidenceDirectory: string,
  trigger: string,
): Promise<Invocation> {
  const endpoint = `https://${EXPECTED_PROJECT_REF}.supabase.co/functions/v1/football-ingest`;
  let response: Response;
  try {
    response = await deps.fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-botolago-ingestion-job": "historical_player_performances",
        apikey: required(deps, "SUPABASE_SECRET_KEY"),
        Authorization: `Bearer ${required(deps, "SUPABASE_SECRET_KEY")}`,
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
  await deps.writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`);
  if (response.status !== 200) {
    const error =
      typeof parsed.error === "string" && /^[a-z][a-z0-9_]{1,79}$/.test(parsed.error)
        ? parsed.error
        : `http_${response.status}`;
    throw new HistoricalPerformanceBackfillError(`${operation}_${error}`);
  }
  return { status: response.status, response: parsed, responseFile };
}

// ---------------------------------------------------------------------------
// Capture (before any mutation)
// ---------------------------------------------------------------------------

interface CaptureResult {
  readonly preRunConfig: PreRunConfig;
  readonly evidenceSecrets: JsonRecord[];
}

async function captureConfiguration(
  deps: RunnerDependencies,
  runtimeDirectory: string,
): Promise<CaptureResult> {
  const listCommand = await runCommand(
    deps,
    "capture-secrets",
    ["secrets", "list", "--project-ref", EXPECTED_PROJECT_REF],
    runtimeDirectory,
  );
  if (listCommand.exitCode !== 0) {
    throw new HistoricalPerformanceBackfillError("production_config_capture_failed");
  }
  const table = parseSecretsListTable(listCommand.stdout);
  if (table.size === 0) {
    throw new HistoricalPerformanceBackfillError("production_config_capture_failed");
  }
  const preRunConfig = {} as Record<ManagedSecretName, CapturedSecret>;
  const evidenceSecrets: JsonRecord[] = [];
  for (const name of MANAGED_SECRET_NAMES) {
    const fingerprint = table.get(name) ?? null;
    const present = fingerprint !== null;
    preRunConfig[name] = { name, present, fingerprint };
    evidenceSecrets.push({
      name,
      present,
      fingerprintSha256: fingerprint ? sha256Hex(fingerprint) : null,
    });
  }
  await deps.writeFile(
    resolve(runtimeDirectory, "pre-run-config.json"),
    `${JSON.stringify(
      { schemaVersion: 1, capturedAt: deps.now().toISOString(), secrets: preRunConfig },
      null,
      2,
    )}\n`,
  );
  return { preRunConfig, evidenceSecrets };
}

// ---------------------------------------------------------------------------
// Restore plan (proven before any mutation)
// ---------------------------------------------------------------------------

interface RestorePlan {
  readonly setValues: Readonly<Record<string, string>>;
  readonly unsetNames: readonly string[];
  readonly currentSeasonId: number;
  readonly crossCheck: {
    readonly catalogIsCurrent: boolean;
    readonly catalogLabelMatchesProvider: boolean;
    readonly providerIsCurrentAndLeagueMatches: boolean;
  };
}

async function verifyCurrentSeasonIdentity(
  deps: RunnerDependencies,
  currentSeasonId: number,
): Promise<RestorePlan["crossCheck"]> {
  let catalogLabel: string | null = null;
  let catalogIsCurrent = false;
  try {
    const secretKey = required(deps, "SUPABASE_SECRET_KEY");
    const response = await deps.fetch(
      `https://${EXPECTED_PROJECT_REF}.supabase.co/rest/v1/rpc/football_season_catalog`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: secretKey,
          Authorization: `Bearer ${secretKey}`,
        },
        body: JSON.stringify({ p_language: "fr", p_limit: 1 }),
      },
    );
    const rows = (await response.json()) as unknown;
    const first = Array.isArray(rows) ? (rows[0] as JsonRecord | undefined) : undefined;
    if (first && typeof first.label === "string") {
      catalogLabel = first.label;
      catalogIsCurrent = first.isCurrent === true;
    }
  } catch {
    catalogIsCurrent = false;
  }

  let providerIsCurrentAndLeagueMatches = false;
  let catalogLabelMatchesProvider = false;
  try {
    const token = required(deps, "SPORTSMONKS_API_TOKEN");
    const response = await deps.fetch(
      `${PROVIDER_BASE_URL}/seasons/${currentSeasonId}?api_token=${encodeURIComponent(token)}`,
    );
    const payload = (await response.json()) as JsonRecord;
    const season = payload.data as JsonRecord | undefined;
    if (season) {
      providerIsCurrentAndLeagueMatches = season.is_current === true && season.league_id === 860;
      if (catalogLabel !== null && typeof season.name === "string") {
        catalogLabelMatchesProvider = season.name === catalogLabel;
      }
    }
  } catch {
    providerIsCurrentAndLeagueMatches = false;
  }

  return { catalogIsCurrent, catalogLabelMatchesProvider, providerIsCurrentAndLeagueMatches };
}

async function buildRestorePlan(
  deps: RunnerDependencies,
  preRunConfig: PreRunConfig,
): Promise<RestorePlan> {
  const currentSeasonIdRaw = required(deps, "G7_CURRENT_SEASON_ID");
  if (!/^[1-9]\d*$/.test(currentSeasonIdRaw)) {
    throw new HistoricalPerformanceBackfillError("invalid_g7_current_season_id");
  }
  const currentSeasonId = Number(currentSeasonIdRaw);
  const currentSeasonStart = required(deps, "G7_CURRENT_SEASON_START");
  const currentSeasonEnd = required(deps, "G7_CURRENT_SEASON_END");
  const currentFixtureFrom = required(deps, "G7_CURRENT_FIXTURE_FROM");
  const currentFixtureTo = required(deps, "G7_CURRENT_FIXTURE_TO");
  const currentTeamIds = required(deps, "G7_CURRENT_TEAM_IDS");
  const sportsmonksToken = required(deps, "SPORTSMONKS_API_TOKEN");

  const restoreValues: Record<
    Exclude<ManagedSecretName, "FOOTBALL_INGESTION_TRIGGER_SECRET">,
    string
  > = {
    SPORTSMONKS_API_TOKEN: sportsmonksToken,
    FOOTBALL_PROVIDER: "sportsmonks",
    FOOTBALL_PROVIDER_BASE_URL: PROVIDER_BASE_URL,
    FOOTBALL_SPORTSMONKS_LEAGUE_ID: "860",
    FOOTBALL_SPORTSMONKS_SEASON_ID: String(currentSeasonId),
    FOOTBALL_SPORTSMONKS_TEAM_IDS: currentTeamIds,
    FOOTBALL_SPORTSMONKS_COUNTRY_CODE: "MA",
    FOOTBALL_SPORTSMONKS_COMPETITION_TYPE: "league",
    FOOTBALL_SPORTSMONKS_SEASON_START: currentSeasonStart,
    FOOTBALL_SPORTSMONKS_SEASON_END: currentSeasonEnd,
    FOOTBALL_SPORTSMONKS_FIXTURE_FROM: currentFixtureFrom,
    FOOTBALL_SPORTSMONKS_FIXTURE_TO: currentFixtureTo,
    FOOTBALL_PROVIDER_TIMEOUT_MS: PROVIDER_TIMEOUT_MS,
    FOOTBALL_PROVIDER_MAX_RETRIES: PROVIDER_MAX_RETRIES,
  };

  const setValues: Record<string, string> = {};
  const unsetNames: string[] = [];
  for (const name of MANAGED_SECRET_NAMES) {
    if (name === TRIGGER_SECRET_NAME) continue;
    const captured = preRunConfig[name];
    const supplied = restoreValues[name];
    if (captured.present) {
      if (!captured.fingerprint || !fingerprintMatches(supplied, captured.fingerprint)) {
        throw new HistoricalPerformanceBackfillError("production_config_restore_unprovable");
      }
      setValues[name] = supplied;
    } else {
      unsetNames.push(name);
    }
  }

  const capturedTrigger = preRunConfig[TRIGGER_SECRET_NAME];
  if (capturedTrigger.present) {
    const suppliedTrigger = optional(deps, "G7_CURRENT_TRIGGER_SECRET");
    if (
      !suppliedTrigger ||
      !capturedTrigger.fingerprint ||
      !fingerprintMatches(suppliedTrigger, capturedTrigger.fingerprint)
    ) {
      throw new HistoricalPerformanceBackfillError("production_config_restore_unprovable");
    }
    setValues[TRIGGER_SECRET_NAME] = suppliedTrigger;
  } else {
    unsetNames.push(TRIGGER_SECRET_NAME);
  }

  const crossCheck = await verifyCurrentSeasonIdentity(deps, currentSeasonId);

  return { setValues, unsetNames, currentSeasonId, crossCheck };
}

// ---------------------------------------------------------------------------
// Restore execution + verification
// ---------------------------------------------------------------------------

interface RestorationOutcome {
  readonly attempted: boolean;
  readonly setExit: number | null;
  readonly unsetExit: number | null;
  readonly verified: boolean;
  readonly perName: JsonRecord[];
  readonly verifiedAt: string | null;
}

async function performRestore(
  deps: RunnerDependencies,
  runtimeDirectory: string,
  plan: RestorePlan,
): Promise<RestorationOutcome> {
  const restoreLines = Object.entries(plan.setValues)
    .map(([name, value]) => `${name}=${value}\n`)
    .join("");
  const restorePath = resolve(runtimeDirectory, "restore-production-config.env");
  await deps.writeFile(restorePath, restoreLines);

  const setResult = await runCommand(
    deps,
    "restore-production-configuration",
    ["secrets", "set", "--project-ref", EXPECTED_PROJECT_REF, "--env-file", restorePath],
    runtimeDirectory,
  );

  let unsetExit: number | null = null;
  if (plan.unsetNames.length > 0) {
    const unsetResult = await runCommand(
      deps,
      "disable-stale-production-configuration",
      ["secrets", "unset", ...plan.unsetNames, "--project-ref", EXPECTED_PROJECT_REF],
      runtimeDirectory,
    );
    unsetExit = unsetResult.exitCode;
  }

  const verifyList = await runCommand(
    deps,
    "verify-restored-configuration",
    ["secrets", "list", "--project-ref", EXPECTED_PROJECT_REF],
    runtimeDirectory,
  );
  const observedTable = parseSecretsListTable(verifyList.stdout);

  const perName: JsonRecord[] = [];
  let verified = setResult.exitCode === 0 && (plan.unsetNames.length === 0 || unsetExit === 0);
  for (const name of MANAGED_SECRET_NAMES) {
    const shouldBePresent = Object.hasOwn(plan.setValues, name);
    const observedFingerprint = observedTable.get(name) ?? null;
    const observedPresent = observedFingerprint !== null;
    let fingerprintMatched: boolean | null = null;
    if (shouldBePresent) {
      fingerprintMatched =
        observedPresent && fingerprintMatches(plan.setValues[name]!, observedFingerprint!);
    }
    const nameOk = shouldBePresent
      ? observedPresent && fingerprintMatched === true
      : !observedPresent;
    if (!nameOk) verified = false;
    perName.push({ name, expectedPresent: shouldBePresent, observedPresent, fingerprintMatched });
  }

  return {
    attempted: true,
    setExit: setResult.exitCode,
    unsetExit,
    verified,
    perName,
    verifiedAt: deps.now().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Season env file for the mutation step (unchanged shape; no more RESTORE_SEASON constant).
// ---------------------------------------------------------------------------

function seasonEnvFileContent(
  deps: RunnerDependencies,
  season: {
    readonly id: number;
    readonly startingAt: string;
    readonly endingAt: string;
    readonly teamIds: readonly number[];
  },
  trigger: string,
): string {
  const values: Record<string, string> = {
    SPORTSMONKS_API_TOKEN: required(deps, "SPORTSMONKS_API_TOKEN"),
    FOOTBALL_INGESTION_TRIGGER_SECRET: trigger,
    FOOTBALL_PROVIDER: "sportsmonks",
    FOOTBALL_PROVIDER_BASE_URL: PROVIDER_BASE_URL,
    FOOTBALL_SPORTSMONKS_LEAGUE_ID: "860",
    FOOTBALL_SPORTSMONKS_SEASON_ID: String(season.id),
    FOOTBALL_SPORTSMONKS_TEAM_IDS: season.teamIds.join(","),
    FOOTBALL_SPORTSMONKS_COUNTRY_CODE: "MA",
    FOOTBALL_SPORTSMONKS_COMPETITION_TYPE: "league",
    FOOTBALL_SPORTSMONKS_SEASON_START: season.startingAt,
    FOOTBALL_SPORTSMONKS_SEASON_END: season.endingAt,
    FOOTBALL_SPORTSMONKS_FIXTURE_FROM: season.startingAt,
    FOOTBALL_SPORTSMONKS_FIXTURE_TO: season.endingAt,
    FOOTBALL_PROVIDER_TIMEOUT_MS: PROVIDER_TIMEOUT_MS,
    FOOTBALL_PROVIDER_MAX_RETRIES: PROVIDER_MAX_RETRIES,
  };
  return Object.entries(values)
    .map(([name, value]) => `${name}=${value}\n`)
    .join("");
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

export type RunnerMode = "default" | "capture-only" | "restore" | "restore-only";

export function parseMode(argv: readonly string[]): RunnerMode {
  if (argv.includes("--capture-only")) return "capture-only";
  if (argv.includes("--restore-only")) return "restore-only";
  if (argv.includes("--restore")) return "restore";
  return "default";
}

function checkGuards(deps: RunnerDependencies): string {
  if (deps.env.GITHUB_ACTIONS !== "true" || required(deps, "CONFIRMATION") !== CONFIRMATION) {
    throw new HistoricalPerformanceBackfillError("production_runner_guard_failed");
  }
  if (required(deps, "EXPECTED_PROJECT_REF") !== EXPECTED_PROJECT_REF) {
    throw new HistoricalPerformanceBackfillError("production_project_guard_failed");
  }
  const expectedCommit = required(deps, "EXPECTED_COMMIT");
  if (!/^[0-9a-f]{40}$/.test(expectedCommit) || required(deps, "GITHUB_SHA") !== expectedCommit) {
    throw new HistoricalPerformanceBackfillError("invalid_expected_commit");
  }
  return expectedCommit;
}

/**
 * The double-failure recovery path: a fresh dispatch whose runtime dir has no capture from an
 * earlier, killed run (the ordinary `--restore` mode requires one). It captures the LIVE
 * configuration now, proves the reviewed current-runtime inputs against those fresh fingerprints,
 * writes them back, and re-verifies — i.e. "reassert the reviewed current configuration and prove
 * it", without ever touching the two-season manifest or running any batch.
 */
async function runRestoreOnlyMode(
  deps: RunnerDependencies,
  runtimeDirectory: string,
  evidenceDirectory: string,
): Promise<JsonRecord> {
  const capture = await captureConfiguration(deps, runtimeDirectory);
  const plan = await buildRestorePlan(deps, capture.preRunConfig);
  const restoration = await performRestore(deps, runtimeDirectory, plan);
  const evidence: JsonRecord = {
    schemaVersion: 1,
    mode: "restore_only",
    secrets: capture.evidenceSecrets,
    currentSeasonCrossCheck: plan.crossCheck,
    restoration,
    verdict: restoration.verified ? "pass" : "fail",
  };
  await deps.writeFile(
    resolve(evidenceDirectory, "restore-only-result.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  if (!restoration.verified) {
    throw new HistoricalPerformanceBackfillError("production_config_restore_unverified");
  }
  await deps.writeFile(resolve(runtimeDirectory, "restore-verified"), "verified\n");
  console.log("G7_HISTORICAL_PERFORMANCE_RESTORE_ONLY_PASS");
  return evidence;
}

async function runRestoreMode(
  deps: RunnerDependencies,
  runtimeDirectory: string,
  evidenceDirectory: string,
): Promise<JsonRecord> {
  const markerPath = resolve(runtimeDirectory, "restore-verified");
  if (await fileExists(markerPath)) {
    console.log("G7_HISTORICAL_PERFORMANCE_RESTORE_NOOP marker=restore-verified");
    return { schemaVersion: 1, mode: "restore", noop: true, verdict: "pass" };
  }
  const preRunConfig = parsePreRunConfig(
    await jsonFile(resolve(runtimeDirectory, "pre-run-config.json")),
  );
  const plan = await buildRestorePlan(deps, preRunConfig);
  const restoration = await performRestore(deps, runtimeDirectory, plan);
  const evidence: JsonRecord = {
    schemaVersion: 1,
    mode: "restore_after_cancel",
    currentSeasonCrossCheck: plan.crossCheck,
    restoration,
    verdict: restoration.verified ? "pass" : "fail",
  };
  await deps.writeFile(
    resolve(evidenceDirectory, "restore-after-cancel.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  if (!restoration.verified) {
    throw new HistoricalPerformanceBackfillError("production_config_restore_unverified");
  }
  await deps.writeFile(markerPath, "verified\n");
  console.log("G7_HISTORICAL_PERFORMANCE_RESTORE_PASS");
  return evidence;
}

export async function runHistoricalPerformanceBackfill(
  deps: RunnerDependencies,
  mode: RunnerMode = "default",
): Promise<JsonRecord> {
  const expectedCommit = checkGuards(deps);
  const runtimeDirectory = resolve(required(deps, "G7_BACKFILL_RUNTIME_DIR"));
  const evidenceDirectory = resolve(required(deps, "G7_BACKFILL_EVIDENCE_DIR"));

  if (mode === "restore") {
    return runRestoreMode(deps, runtimeDirectory, evidenceDirectory);
  }
  if (mode === "restore-only") {
    return runRestoreOnlyMode(deps, runtimeDirectory, evidenceDirectory);
  }

  const requestedSeasonIds = parseRequestedSeasonIds(deps.env.G7_SEASON_IDS);
  const capture = await captureConfiguration(deps, runtimeDirectory);

  if (mode === "capture-only") {
    const evidence: JsonRecord = {
      schemaVersion: 1,
      mode: "production_two_season_historical_player_performance_backfill_capture_only",
      requestedSeasonIds,
      capturedAt: deps.now().toISOString(),
      secrets: capture.evidenceSecrets,
      verdict: "pass",
    };
    await deps.writeFile(
      resolve(evidenceDirectory, "g7-historical-performance-backfill-capture.json"),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    console.log("G7_HISTORICAL_PERFORMANCE_BACKFILL_CAPTURE_ONLY_PASS");
    return evidence;
  }

  const plan = await buildRestorePlan(deps, capture.preRunConfig);
  const dryRun = deps.env.G7_DRY_RUN === "1";
  const resultPath = resolve(evidenceDirectory, "g7-historical-performance-backfill-result.json");

  if (dryRun) {
    const evidence: JsonRecord = {
      schemaVersion: 1,
      mode: "production_two_season_historical_player_performance_backfill",
      dryRun: true,
      historicalOnly: true,
      currentSeasonActivated: false,
      expectedCommit,
      projectRef: EXPECTED_PROJECT_REF,
      requestedSeasonIds,
      secrets: capture.evidenceSecrets,
      restorePlan: {
        setNames: Object.keys(plan.setValues).sort(),
        unsetNames: [...plan.unsetNames].sort(),
      },
      currentSeasonCrossCheck: plan.crossCheck,
      verdict: "pass",
    };
    await deps.writeFile(resultPath, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(`G7_HISTORICAL_PERFORMANCE_BACKFILL_PASS evidence=${basename(resultPath)}`);
    return evidence;
  }

  const manifest = validateManifest(
    await jsonFile(resolve(evidenceDirectory, "g7-historical-performance-backfill-manifest.json")),
    expectedCommit,
  );
  const requestedSet = new Set(requestedSeasonIds);
  const seasonsToRun = manifest.seasons.filter((season) => requestedSet.has(season.id));
  if (seasonsToRun.length !== requestedSeasonIds.length) {
    throw new HistoricalPerformanceBackfillError("historical_backfill_requested_season_missing");
  }

  const trigger = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  console.log(`::add-mask::${trigger}`);
  await writeFile(required(deps, "GITHUB_ENV"), `G7_BACKFILL_TRIGGER=${trigger}\n`, { flag: "a" });

  const evidence: JsonRecord = {
    schemaVersion: 1,
    mode: "production_two_season_historical_player_performance_backfill",
    historicalOnly: true,
    currentSeasonActivated: false,
    expectedCommit,
    projectRef: EXPECTED_PROJECT_REF,
    requestedSeasonIds,
    expectedFixturesPerSeason: EXPECTED_FIXTURES_PER_SEASON,
    batchSize: BATCH_SIZE,
    algorithmVersion: ALGORITHM_VERSION,
    currentSeasonCrossCheck: plan.crossCheck,
    coverageDiagnostics: {
      providerPayloadIncluded: false,
      fixtureIdIncluded: true,
      boundedCountsIncluded: true,
      failedInvariantsIncluded: true,
    },
    mappingQuarantine: {
      unmappedPlayerRows: "exclude",
      requiredMappedStartersPerFixture: 22,
      requiredMappedTeamsPerFixture: 2,
      maxTotalExcludedRowsPerFixture: 20,
    },
    // BG-0011 option B: identity-completeness tolerance. See the migration
    // 20260919120000_historical_anonymous_starter_tolerance.sql and
    // docs/engineering/tasks/BG-0011/engineering-brief-option-b-identity-completeness.yaml.
    anonymousStarterTolerance: {
      rule: "at most 4 of a fixture's 22 raw provider starters may be anonymous (missing player_id); more than 4 quarantines the whole fixture",
      maxAnonymousStarterRowsPerFixture: MAX_ANONYMOUS_STARTER_ROWS,
      minAcceptedIdentifiedStarterRowsPerFixture: MIN_IDENTIFIED_STARTER_ROWS,
      measuredCoverage:
        "238/240 season-26027 fixtures accepted; fixtures 19596474 (7 anonymous) and 19596475 (8 anonymous) quarantined (BG-0044)",
    },
    commands: [],
    seasons: [],
    restoration: { attempted: false, succeeded: false },
    verdict: "fail",
  };
  const commands = evidence.commands as EvidenceCommand[];
  const seasonResults = evidence.seasons as JsonRecord[];
  let failureCode: string | undefined;

  try {
    for (const season of seasonsToRun) {
      const secretPath = resolve(runtimeDirectory, `season-${season.id}.env`);
      await deps.writeFile(secretPath, seasonEnvFileContent(deps, season, trigger));
      const configure = await runCommand(
        deps,
        `season-${season.id}-configuration`,
        ["secrets", "set", "--project-ref", EXPECTED_PROJECT_REF, "--env-file", secretPath],
        runtimeDirectory,
      );
      commands.push(toEvidenceCommand(configure));
      if (configure.exitCode !== 0) {
        throw new HistoricalPerformanceBackfillError(`season_${season.id}_configuration_failed`);
      }

      let cursor: string | null = null;
      let fixturesProcessed = 0;
      let acceptedFixtures = 0;
      let quarantinedFixtures = 0;
      let performanceRows = 0;
      let excludedIncompleteRows = 0;
      let excludedMappingRows = 0;
      const requests: JsonRecord[] = [];
      for (let batchNumber = 1; batchNumber <= MAX_BATCHES_PER_SEASON; batchNumber += 1) {
        const invocation = await invoke(
          deps,
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
        acceptedFixtures += batch.acceptedFixtures;
        quarantinedFixtures += batch.quarantinedFixtures;
        performanceRows += batch.performanceRows;
        excludedIncompleteRows += batch.excludedIncompleteRows;
        excludedMappingRows += batch.excludedMappingRows;
        requests.push({
          batchNumber,
          status: invocation.status,
          responseFile: invocation.responseFile,
          fixturesProcessed: batch.fixturesProcessed,
          acceptedFixtures: batch.acceptedFixtures,
          quarantinedFixtures: batch.quarantinedFixtures,
          performanceRows: batch.performanceRows,
          excludedIncompleteRows: batch.excludedIncompleteRows,
          excludedMappingRows: batch.excludedMappingRows,
        });
        cursor = batch.nextCursor;
        if (!batch.hasMore) break;
        if (batchNumber === MAX_BATCHES_PER_SEASON) {
          throw new HistoricalPerformanceBackfillError(`season_${season.id}_batch_limit_exceeded`);
        }
      }
      // fixturesProcessed counts every fixture ATTEMPTED (accepted + quarantined), not fixtures
      // whose data is actually usable for pricing. It must still equal all 240 finished fixtures
      // of the season -- every one of them was looked at, even the ones later quarantined.
      if (fixturesProcessed !== EXPECTED_FIXTURES_PER_SEASON) {
        throw new HistoricalPerformanceBackfillError(`season_${season.id}_fixture_count_mismatch`);
      }
      if (acceptedFixtures + quarantinedFixtures !== fixturesProcessed) {
        throw new HistoricalPerformanceBackfillError(`season_${season.id}_fixture_count_mismatch`);
      }

      const derivation = await invoke(
        deps,
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
        // Never collapse this into a single "fixturesProcessed" headline: fixturesProcessed is
        // fixtures attempted, acceptedFixtures is fixtures whose rows actually feed pricing, and
        // quarantinedFixtures had more than MAX_ANONYMOUS_STARTER_ROWS_PER_FIXTURE anonymous
        // starters and contributed zero rows.
        fixturesProcessed,
        acceptedFixtures,
        quarantinedFixtures,
        performanceRows,
        excludedIncompleteRows,
        excludedMappingRows,
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
      const outcome = await performRestore(deps, runtimeDirectory, plan);
      evidence.restoration = outcome;
      commands.push(
        { operation: "restore-production-configuration", exitCode: outcome.setExit ?? -1 },
        ...(outcome.unsetExit !== null
          ? [{ operation: "disable-stale-production-configuration", exitCode: outcome.unsetExit }]
          : []),
      );
      if (outcome.verified) {
        await deps.writeFile(resolve(runtimeDirectory, "restore-verified"), "verified\n");
      } else {
        evidence.verdict = "fail";
        evidence.failureCode = failureCode ?? "production_config_restore_unverified";
      }
    } catch {
      evidence.restoration = {
        attempted: true,
        setExit: null,
        unsetExit: null,
        verified: false,
        perName: [],
        verifiedAt: null,
      };
      evidence.verdict = "fail";
      evidence.failureCode = failureCode ?? "production_config_restore_failed";
    }
    await deps.writeFile(resultPath, `${JSON.stringify(evidence, null, 2)}\n`);
  }

  if (evidence.verdict !== "pass") {
    throw new HistoricalPerformanceBackfillError(
      String(evidence.failureCode ?? "historical_performance_backfill_failed"),
    );
  }
  console.log(`G7_HISTORICAL_PERFORMANCE_BACKFILL_PASS evidence=${basename(resultPath)}`);
  return evidence;
}

if (import.meta.main) {
  const mode = parseMode(process.argv.slice(2));
  runHistoricalPerformanceBackfill(defaultRunnerDependencies(), mode).catch((error: unknown) => {
    const code =
      error instanceof HistoricalPerformanceBackfillError
        ? error.code
        : "unexpected_historical_performance_backfill_failure";
    console.error(`G7_HISTORICAL_PERFORMANCE_BACKFILL_FAIL code=${code}`);
    process.exitCode = 1;
  });
}
