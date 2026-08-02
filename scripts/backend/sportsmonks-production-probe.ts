import { chmod } from "node:fs/promises";
import { resolve } from "node:path";

export const SPORTSMONKS_ORIGIN = "https://api.sportmonks.com";
export const SPORTSMONKS_BASE_PATH = "/v3/football";
export const BOTOLA_PRO_LEAGUE_ID = 860;

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 30_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;

type JsonRecord = Record<string, unknown>;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Sleep = (milliseconds: number) => Promise<void>;

export class SportsMonksProbeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "SportsMonksProbeError";
  }
}

export interface ProbeDependencies {
  readonly fetch?: FetchLike;
  readonly sleep?: Sleep;
  readonly now?: () => Date;
}

export interface SportsMonksProbeEvidence {
  readonly schemaVersion: 1;
  readonly provider: "sportsmonks";
  readonly mode: "read_only";
  readonly expectedCommit: string;
  readonly observedAt: string;
  readonly league: {
    readonly id: number;
    readonly name: string;
    readonly active: boolean;
  };
  readonly season: {
    readonly id: number;
    readonly leagueId: number;
    readonly name: string;
    readonly current: boolean;
    readonly startingAt: string;
    readonly endingAt: string;
  };
  readonly verifiedResources: {
    readonly rounds: number;
    readonly teams: number;
  };
  readonly fixtureWindow: {
    readonly from: string;
    readonly to: string;
    readonly inclusiveDays: number;
  };
  readonly fixtureSample: {
    readonly available: boolean;
    readonly leagueMatches: boolean | null;
    readonly seasonMatches: boolean | null;
    readonly participants: number | null;
    readonly statePresent: boolean | null;
    readonly scores: number | null;
  };
  readonly requestCount: 4;
  readonly verdict: "pass";
}

export interface SportsMonksProbeFailureEvidence {
  readonly schemaVersion: 1;
  readonly provider: "sportsmonks";
  readonly mode: "read_only_current_season_readiness";
  readonly expectedCommit: string | null;
  readonly observedAt: string;
  readonly verdict: "fail";
  readonly errorCode: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, code: string): JsonRecord {
  if (!isRecord(value)) throw new SportsMonksProbeError(code);
  return value;
}

function array(value: unknown, code: string): unknown[] {
  if (!Array.isArray(value)) throw new SportsMonksProbeError(code);
  return value;
}

function positiveInteger(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new SportsMonksProbeError(code);
  }
  return value;
}

function nonEmptyString(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw new SportsMonksProbeError(code);
  }
  return value.trim();
}

function boolean(value: unknown, code: string): boolean {
  if (typeof value !== "boolean") throw new SportsMonksProbeError(code);
  return value;
}

function isoDate(value: unknown, code: string): string {
  const date = nonEmptyString(value, code);
  if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00.000Z`))) {
    throw new SportsMonksProbeError(code);
  }
  return date;
}

export function requireSportsMonksToken(value: string | undefined): string {
  const hasForbiddenCharacter = Array.from(value ?? "").some((character) => {
    const code = character.charCodeAt(0);
    return /\s/.test(character) || code < 32 || code === 127;
  });
  if (!value || value.length < 16 || value.length > 256 || hasForbiddenCharacter) {
    throw new SportsMonksProbeError("invalid_sportsmonks_token");
  }
  return value;
}

export function sportsMonksProbeFailureEvidence(
  error: unknown,
  expectedCommit: string | undefined,
  observedAt = new Date(),
): SportsMonksProbeFailureEvidence {
  const rawCode = error instanceof SportsMonksProbeError ? error.code : "unexpected_probe_failure";
  return {
    schemaVersion: 1,
    provider: "sportsmonks",
    mode: "read_only_current_season_readiness",
    expectedCommit: COMMIT_PATTERN.test(expectedCommit ?? "") ? expectedCommit! : null,
    observedAt: observedAt.toISOString(),
    verdict: "fail",
    errorCode: ERROR_CODE_PATTERN.test(rawCode) ? rawCode : "unexpected_probe_failure",
  };
}

function requireCommit(value: string | undefined): string {
  if (!value || !COMMIT_PATTERN.test(value)) {
    throw new SportsMonksProbeError("invalid_expected_commit");
  }
  return value;
}

function parseRetryAfter(value: string | null, now: Date): number {
  if (!value) return 1_000;
  if (/^\d+$/.test(value)) return Number(value) * 1_000;
  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) return 1_000;
  return Math.max(0, retryAt - now.getTime());
}

function safeRetryDelay(response: Response, now: Date): number {
  const delay = parseRetryAfter(response.headers.get("retry-after"), now);
  if (!Number.isFinite(delay) || delay > MAX_RETRY_AFTER_MS) {
    throw new SportsMonksProbeError("provider_retry_after_too_long");
  }
  return delay;
}

async function responseJson(response: Response): Promise<unknown> {
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_RESPONSE_BYTES) {
    throw new SportsMonksProbeError("provider_response_too_large");
  }
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) {
    throw new SportsMonksProbeError("provider_response_too_large");
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new SportsMonksProbeError("invalid_provider_json");
  }
}

export async function requestSportsMonksJson(
  path: string,
  query: Readonly<Record<string, string>>,
  token: string,
  dependencies: ProbeDependencies = {},
): Promise<unknown> {
  if (!path.startsWith(`${SPORTSMONKS_BASE_PATH}/`) || path.includes("?") || path.includes("#")) {
    throw new SportsMonksProbeError("invalid_provider_path");
  }
  const url = new URL(`${SPORTSMONKS_ORIGIN}${path}`);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  if (url.origin !== SPORTSMONKS_ORIGIN || url.pathname !== path || url.href.includes(token)) {
    throw new SportsMonksProbeError("provider_origin_guard_failed");
  }

  const fetcher = dependencies.fetch ?? fetch;
  const sleep = dependencies.sleep ?? ((milliseconds) => Bun.sleep(milliseconds));
  const now = dependencies.now ?? (() => new Date());

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetcher(url, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: token },
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      if (attempt === MAX_ATTEMPTS) throw new SportsMonksProbeError("provider_network_failure");
      await sleep(250 * attempt);
      continue;
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok) return responseJson(response);
    if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
      await sleep(safeRetryDelay(response, now()));
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      throw new SportsMonksProbeError("provider_access_denied");
    }
    throw new SportsMonksProbeError(`provider_http_${response.status}`);
  }
  throw new SportsMonksProbeError("provider_attempts_exhausted");
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000,
  );
}

export function boundedFixtureWindow(
  seasonStart: string,
  seasonEnd: string,
  observedAt: Date,
): { from: string; to: string; inclusiveDays: number } {
  if (seasonStart > seasonEnd) throw new SportsMonksProbeError("invalid_season_dates");
  const today = observedAt.toISOString().slice(0, 10);
  let to: string;
  if (today < seasonStart)
    to = addDays(seasonStart, 99) < seasonEnd ? addDays(seasonStart, 99) : seasonEnd;
  else to = today < seasonEnd ? today : seasonEnd;
  const candidate = addDays(to, -99);
  const from = candidate > seasonStart ? candidate : seasonStart;
  const inclusiveDays = daysBetween(from, to) + 1;
  if (inclusiveDays < 1 || inclusiveDays > 100) {
    throw new SportsMonksProbeError("fixture_window_out_of_bounds");
  }
  return { from, to, inclusiveDays };
}

function currentSeason(league: JsonRecord): JsonRecord {
  for (const key of ["currentseason", "current_season", "currentSeason"]) {
    if (league[key] !== undefined) return record(league[key], "invalid_current_season");
  }
  throw new SportsMonksProbeError("current_season_missing");
}

function fixtureSample(
  value: unknown,
  seasonId: number,
): SportsMonksProbeEvidence["fixtureSample"] {
  const fixtures = array(record(value, "invalid_fixtures_response").data, "invalid_fixtures_data");
  if (fixtures.length === 0) {
    return {
      available: false,
      leagueMatches: null,
      seasonMatches: null,
      participants: null,
      statePresent: null,
      scores: null,
    };
  }
  const fixture = record(fixtures[0], "invalid_fixture_sample");
  positiveInteger(fixture.id, "invalid_fixture_id");
  const participants = array(fixture.participants, "invalid_fixture_participants");
  const scores = array(fixture.scores, "invalid_fixture_scores");
  const state = record(fixture.state, "invalid_fixture_state");
  positiveInteger(state.id, "invalid_fixture_state_id");
  const sample: SportsMonksProbeEvidence["fixtureSample"] = {
    available: true,
    leagueMatches:
      positiveInteger(fixture.league_id, "invalid_fixture_league_id") === BOTOLA_PRO_LEAGUE_ID,
    seasonMatches: positiveInteger(fixture.season_id, "invalid_fixture_season_id") === seasonId,
    participants: participants.length,
    statePresent: true,
    scores: scores.length,
  };
  if (!sample.leagueMatches || !sample.seasonMatches || sample.participants !== 2) {
    throw new SportsMonksProbeError("fixture_sample_scope_mismatch");
  }
  return sample;
}

export async function runSportsMonksProductionProbe(
  values: Readonly<Record<string, string | undefined>>,
  dependencies: ProbeDependencies = {},
): Promise<SportsMonksProbeEvidence> {
  const token = requireSportsMonksToken(values.SPORTSMONKS_API_TOKEN);
  const expectedCommit = requireCommit(values.EXPECTED_COMMIT);
  const now = dependencies.now ?? (() => new Date());
  const observedAt = now();

  const leagueResponse = record(
    await requestSportsMonksJson(
      `${SPORTSMONKS_BASE_PATH}/leagues/${BOTOLA_PRO_LEAGUE_ID}`,
      { include: "currentSeason" },
      token,
      dependencies,
    ),
    "invalid_league_response",
  );
  const league = record(leagueResponse.data, "invalid_league_data");
  const leagueId = positiveInteger(league.id, "invalid_league_id");
  if (leagueId !== BOTOLA_PRO_LEAGUE_ID) throw new SportsMonksProbeError("league_id_mismatch");
  const season = currentSeason(league);
  const seasonId = positiveInteger(season.id, "invalid_season_id");
  const seasonLeagueId = positiveInteger(season.league_id, "invalid_season_league_id");
  if (seasonLeagueId !== BOTOLA_PRO_LEAGUE_ID) {
    throw new SportsMonksProbeError("season_league_id_mismatch");
  }
  const seasonStart = isoDate(season.starting_at, "invalid_season_start");
  const seasonEnd = isoDate(season.ending_at, "invalid_season_end");
  const window = boundedFixtureWindow(seasonStart, seasonEnd, observedAt);

  const roundsResponse = record(
    await requestSportsMonksJson(
      `${SPORTSMONKS_BASE_PATH}/rounds/seasons/${seasonId}`,
      {},
      token,
      dependencies,
    ),
    "invalid_rounds_response",
  );
  const teamsResponse = record(
    await requestSportsMonksJson(
      `${SPORTSMONKS_BASE_PATH}/teams/seasons/${seasonId}`,
      { page: "1", per_page: "50" },
      token,
      dependencies,
    ),
    "invalid_teams_response",
  );
  const fixturesResponse = await requestSportsMonksJson(
    `${SPORTSMONKS_BASE_PATH}/fixtures/between/${window.from}/${window.to}`,
    {
      filters: `fixtureLeagues:${BOTOLA_PRO_LEAGUE_ID}`,
      include: "participants;state;scores",
      page: "1",
      per_page: "1",
      timezone: "UTC",
    },
    token,
    dependencies,
  );

  const leagueActive = boolean(league.active, "invalid_league_active");
  const seasonCurrent = boolean(season.is_current, "invalid_season_current");
  if (!leagueActive) throw new SportsMonksProbeError("league_not_active");
  if (!seasonCurrent) throw new SportsMonksProbeError("season_not_current");

  const evidence: SportsMonksProbeEvidence = {
    schemaVersion: 1,
    provider: "sportsmonks",
    mode: "read_only",
    expectedCommit,
    observedAt: observedAt.toISOString(),
    league: {
      id: leagueId,
      name: nonEmptyString(league.name, "invalid_league_name"),
      active: leagueActive,
    },
    season: {
      id: seasonId,
      leagueId: seasonLeagueId,
      name: nonEmptyString(season.name, "invalid_season_name"),
      current: seasonCurrent,
      startingAt: seasonStart,
      endingAt: seasonEnd,
    },
    verifiedResources: {
      rounds: array(roundsResponse.data, "invalid_rounds_data").length,
      teams: array(teamsResponse.data, "invalid_teams_data").length,
    },
    fixtureWindow: window,
    fixtureSample: fixtureSample(fixturesResponse, seasonId),
    requestCount: 4,
    verdict: "pass",
  };
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  if (serialized.includes(token)) throw new SportsMonksProbeError("credential_in_evidence");
  return evidence;
}

async function main(): Promise<void> {
  const evidenceDirectory = process.env.GATE2B_EVIDENCE_DIR?.trim();
  if (!evidenceDirectory) throw new SportsMonksProbeError("missing_evidence_directory");
  const evidence = await runSportsMonksProductionProbe(process.env);
  const outputPath = resolve(evidenceDirectory, "sportsmonks-production-probe.json");
  await Bun.write(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
  console.log("SPORTSMONKS_PRODUCTION_PROBE_PASS");
}

if (import.meta.main) {
  main().catch(async (error: unknown) => {
    const evidence = sportsMonksProbeFailureEvidence(error, process.env.EXPECTED_COMMIT);
    const evidenceDirectory = process.env.GATE2B_EVIDENCE_DIR?.trim();
    if (evidenceDirectory) {
      const outputPath = resolve(evidenceDirectory, "sportsmonks-production-probe-failure.json");
      await Bun.write(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
      await chmod(outputPath, 0o600);
    }
    console.error(`SPORTSMONKS_PRODUCTION_PROBE_FAIL code=${evidence.errorCode}`);
    process.exitCode = 1;
  });
}
