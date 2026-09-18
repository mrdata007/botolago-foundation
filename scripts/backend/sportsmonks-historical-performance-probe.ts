import { chmod } from "node:fs/promises";
import { resolve } from "node:path";

import {
  HISTORICAL_PERFORMANCE_DETAIL_TYPE_IDS,
  HistoricalPerformanceRuntimeError,
  normalizeHistoricalFixture,
} from "../../supabase/functions/_shared/sportsmonks-historical-player-performance";
import {
  BOTOLA_PRO_LEAGUE_ID,
  requestSportsMonksJson,
  requireSportsMonksToken,
  SPORTSMONKS_BASE_PATH,
  SportsMonksProbeError,
  type ProbeDependencies,
} from "./sportsmonks-production-probe";
import {
  TWO_SEASON_BACKFILL_SCOPE,
  buildFixtureWindows,
} from "./sportsmonks-two-season-backfill-preflight";

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;
const PROVIDER_DATETIME_PATTERN = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;
const MAX_PAGES_PER_WINDOW = 10;
const PER_PAGE = 50;

type JsonRecord = Record<string, unknown>;

export const HISTORICAL_PERFORMANCE_FIXTURES = [
  { seasonId: 26027, fixtureId: 19489211 },
  { seasonId: 26027, fixtureId: 19662879 },
  { seasonId: 26027, fixtureId: 19734478 },
  { seasonId: 26027, fixtureId: 19489216 },
  { seasonId: 24319, fixtureId: 19263646 },
  { seasonId: 24319, fixtureId: 19334647 },
  { seasonId: 24319, fixtureId: 19420617 },
] as const;

export const HISTORICAL_PERFORMANCE_REQUEST_ID =
  "g7-historical-performance-coverage-2026-09-18-01" as const;
export const HISTORICAL_PERFORMANCE_PRIOR_RUN_IDS = [30752931530, 30753527952] as const;

/**
 * Seasons whose every fixture is classified against the edge worker's coverage
 * invariants (BG-0034 / Option A step A0). Season 26027 is 2025/2026 and holds
 * the fixture (19489216) that halted the G7 backfill.
 */
export const HISTORICAL_PERFORMANCE_INVARIANT_SEASONS = [26027] as const;
export const HISTORICAL_PERFORMANCE_EXPECTED_FIXTURES_PER_SEASON = 240;

/**
 * The six coverage failure codes raised by normalizeHistoricalFixture in
 * supabase/functions/_shared/sportsmonks-historical-player-performance.ts.
 * The probe does not re-implement the thresholds: it calls that function and
 * reads the codes it emits, so the names below only seed the per-season
 * failure histogram with zeros. A unit test asserts the list matches what the
 * worker actually emits.
 */
export const HISTORICAL_PERFORMANCE_COVERAGE_FAILURE_CODES = [
  "lineup_rows_out_of_range",
  "valid_player_rows_out_of_range",
  "incomplete_rows_limit_exceeded",
  "starter_rows_mismatch",
  "team_count_mismatch",
  "invalid_detail_rows_present",
] as const;

const FANTASY_DETAIL_TYPE_IDS = new Set([
  52, 57, 79, 83, 84, 85, 88, 112, 113, 118, 119, 194, 321, 322, 324,
]);

export class HistoricalPerformanceProbeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "HistoricalPerformanceProbeError";
  }
}

interface FixtureCoverage {
  readonly fixtureId: number;
  readonly seasonId: number;
  readonly lineupCollectionValid: boolean;
  readonly eventCollectionValid: boolean;
  readonly lineupCount: number;
  readonly playerLineupCount: number;
  readonly malformedLineupCount: number;
  readonly lineupsWithoutPlayerId: number;
  readonly lineupsWithoutTeamId: number;
  readonly lineupsWithoutParticipationType: number;
  readonly starterCount: number;
  readonly substituteCount: number;
  readonly playersWithDetails: number;
  readonly playersWithFantasyDetails: number;
  readonly detailCount: number;
  readonly invalidDetailCount: number;
  readonly detailTypeIds: number[];
  readonly eventCount: number;
  readonly invalidEventCount: number;
  readonly eventTypeIds: number[];
}

interface SeasonCoverage {
  readonly seasonId: number;
  readonly sampledFixtures: number;
  readonly fixturesWithLineups: number;
  readonly fixturesWithPlayerLineups: number;
  readonly fixturesWithPlayerDetails: number;
  readonly fixturesWithFantasyDetails: number;
  readonly totalLineups: number;
  readonly totalPlayerLineups: number;
  readonly totalIncompleteLineups: number;
  readonly totalDetails: number;
  readonly totalInvalidDetails: number;
  readonly totalEvents: number;
  readonly totalInvalidEvents: number;
  readonly usableForPreseasonDerivation: boolean;
  readonly fixtures: FixtureCoverage[];
}

export interface HistoricalPerformanceEvidence {
  readonly schemaVersion: 1;
  readonly requestId: typeof HISTORICAL_PERFORMANCE_REQUEST_ID;
  readonly repairsRunIds: typeof HISTORICAL_PERFORMANCE_PRIOR_RUN_IDS;
  readonly provider: "sportsmonks";
  readonly mode: "read_only_historical_player_performance_coverage";
  readonly expectedCommit: string;
  readonly observedAt: string;
  readonly leagueId: 860;
  readonly requestCount: number;
  readonly seasons: SeasonCoverage[];
  readonly usableForPreseasonDerivation: boolean;
  readonly verdict: "pass";
}

export interface HistoricalPerformanceFailureEvidence {
  readonly schemaVersion: 1;
  readonly requestId: typeof HISTORICAL_PERFORMANCE_REQUEST_ID;
  readonly repairsRunIds: typeof HISTORICAL_PERFORMANCE_PRIOR_RUN_IDS;
  readonly provider: "sportsmonks";
  readonly mode: "read_only_historical_player_performance_coverage";
  readonly expectedCommit: string | null;
  readonly observedAt: string;
  readonly verdict: "fail";
  readonly errorCode: string;
}

/**
 * One fixture classified against the worker's coverage invariants. Counts are
 * null when the worker aborted on a row-level defect before it could evaluate
 * the invariants; `failures` then carries that abort code instead.
 */
export interface FixtureInvariantRow {
  readonly fixtureId: number;
  readonly seasonId: number;
  readonly kickoff: string | null;
  readonly enumerated: boolean;
  readonly lineupRows: number | null;
  readonly validPlayerRows: number | null;
  readonly excludedIncompleteRows: number | null;
  readonly starterRows: number | null;
  readonly teamCount: number | null;
  readonly invalidDetailRows: number | null;
  readonly failures: string[];
  readonly pass: boolean;
}

export interface SeasonInvariantSummary {
  readonly seasonId: number;
  readonly expectedFixtures: number;
  readonly fixturesEnumerated: number;
  readonly enumerationComplete: boolean;
  readonly pinnedFixtureIds: number[];
  readonly requests: number;
  readonly fixtures: number;
  readonly passing: number;
  readonly failing: number;
  readonly failuresByCode: Record<string, number>;
  readonly rows: FixtureInvariantRow[];
}

export interface HistoricalPerformanceInvariantEvidence {
  readonly schemaVersion: 1;
  readonly requestId: typeof HISTORICAL_PERFORMANCE_REQUEST_ID;
  readonly provider: "sportsmonks";
  readonly mode: "read_only_historical_player_performance_invariants";
  readonly expectedCommit: string;
  readonly observedAt: string;
  readonly leagueId: 860;
  readonly providerPayloadIncluded: false;
  readonly invariantSource: "supabase/functions/_shared/sportsmonks-historical-player-performance.ts#normalizeHistoricalFixture";
  readonly coverageFailureCodes: typeof HISTORICAL_PERFORMANCE_COVERAGE_FAILURE_CODES;
  readonly requestCount: number;
  readonly fixtures: number;
  readonly passing: number;
  readonly failing: number;
  readonly seasons: SeasonInvariantSummary[];
  readonly verdict: "pass";
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, code: string): JsonRecord {
  if (!isRecord(value)) throw new HistoricalPerformanceProbeError(code);
  return value;
}

function array(value: unknown, code: string): unknown[] {
  if (!Array.isArray(value)) throw new HistoricalPerformanceProbeError(code);
  return value;
}

function positiveInteger(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new HistoricalPerformanceProbeError(code);
  }
  return value;
}

function nonNegativeInteger(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new HistoricalPerformanceProbeError(code);
  }
  return value;
}

interface OptionalCollection {
  readonly values: unknown[];
  readonly valid: boolean;
}

function optionalCollection(value: unknown): OptionalCollection {
  if (value === undefined || value === null) return { values: [], valid: true };
  return Array.isArray(value) ? { values: value, valid: true } : { values: [], valid: false };
}

function optionalPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

interface TypeCoverage {
  readonly typeIds: number[];
  readonly validCount: number;
  readonly invalidCount: number;
}

function typeCoverage(values: unknown[]): TypeCoverage {
  const ids = new Set<number>();
  let validCount = 0;
  let invalidCount = 0;
  for (const value of values) {
    if (!isRecord(value)) {
      invalidCount += 1;
      continue;
    }
    const typeId = optionalPositiveInteger(value.type_id);
    if (typeId === null) {
      invalidCount += 1;
      continue;
    }
    ids.add(typeId);
    validCount += 1;
  }
  return {
    typeIds: [...ids].sort((left, right) => left - right),
    validCount,
    invalidCount,
  };
}

function fixtureCoverage(
  response: unknown,
  expected: (typeof HISTORICAL_PERFORMANCE_FIXTURES)[number],
): FixtureCoverage {
  const root = record(response, "invalid_fixture_response");
  const fixture = record(root.data, "invalid_fixture_data");
  const fixtureId = positiveInteger(fixture.id, "invalid_fixture_id");
  const seasonId = positiveInteger(fixture.season_id, "invalid_fixture_season_id");
  const leagueId = positiveInteger(fixture.league_id, "invalid_fixture_league_id");
  if (
    fixtureId !== expected.fixtureId ||
    seasonId !== expected.seasonId ||
    leagueId !== BOTOLA_PRO_LEAGUE_ID
  ) {
    throw new HistoricalPerformanceProbeError("fixture_scope_mismatch");
  }

  const lineupCollection = optionalCollection(fixture.lineups);
  const eventCollection = optionalCollection(fixture.events);
  const lineups = lineupCollection.values;
  const events = eventCollection.values;
  let starterCount = 0;
  let substituteCount = 0;
  let playerLineupCount = 0;
  let malformedLineupCount = 0;
  let lineupsWithoutPlayerId = 0;
  let lineupsWithoutTeamId = 0;
  let lineupsWithoutParticipationType = 0;
  let playersWithDetails = 0;
  let playersWithFantasyDetails = 0;
  let detailCount = 0;
  let invalidDetailCount = 0;
  const detailTypeIds = new Set<number>();

  for (const value of lineups) {
    if (!isRecord(value)) {
      malformedLineupCount += 1;
      continue;
    }
    const lineup = value;
    const playerId = optionalPositiveInteger(lineup.player_id);
    const teamId = optionalPositiveInteger(lineup.team_id);
    const participationType = optionalPositiveInteger(lineup.type_id);
    if (playerId === null) lineupsWithoutPlayerId += 1;
    else playerLineupCount += 1;
    if (teamId === null) lineupsWithoutTeamId += 1;
    if (participationType === null) lineupsWithoutParticipationType += 1;
    if (participationType === 11) starterCount += 1;
    if (participationType === 12) substituteCount += 1;
    const detailCollection = optionalCollection(lineup.details);
    const playerDetails = typeCoverage(detailCollection.values);
    if (playerId !== null && playerDetails.validCount > 0) playersWithDetails += 1;
    if (
      playerId !== null &&
      playerDetails.typeIds.some((typeId) => FANTASY_DETAIL_TYPE_IDS.has(typeId))
    ) {
      playersWithFantasyDetails += 1;
    }
    detailCount += playerDetails.validCount;
    invalidDetailCount += playerDetails.invalidCount + (detailCollection.valid ? 0 : 1);
    for (const typeId of playerDetails.typeIds) detailTypeIds.add(typeId);
  }

  const eventCoverage = typeCoverage(events);

  return {
    fixtureId,
    seasonId,
    lineupCollectionValid: lineupCollection.valid,
    eventCollectionValid: eventCollection.valid,
    lineupCount: lineups.length,
    playerLineupCount,
    malformedLineupCount,
    lineupsWithoutPlayerId,
    lineupsWithoutTeamId,
    lineupsWithoutParticipationType,
    starterCount,
    substituteCount,
    playersWithDetails,
    playersWithFantasyDetails,
    detailCount,
    invalidDetailCount,
    detailTypeIds: [...detailTypeIds].sort((left, right) => left - right),
    eventCount: eventCoverage.validCount,
    invalidEventCount: eventCoverage.invalidCount + (eventCollection.valid ? 0 : 1),
    eventTypeIds: eventCoverage.typeIds,
  };
}

function seasonCoverage(seasonId: number, fixtures: FixtureCoverage[]): SeasonCoverage {
  const sampled = fixtures.filter((fixture) => fixture.seasonId === seasonId);
  const expectedSamples = HISTORICAL_PERFORMANCE_FIXTURES.filter(
    (fixture) => fixture.seasonId === seasonId,
  ).length;
  if (sampled.length !== expectedSamples || expectedSamples < 1) {
    throw new HistoricalPerformanceProbeError("historical_fixture_sample_incomplete");
  }
  const fixturesWithLineups = sampled.filter((fixture) => fixture.lineupCount > 0).length;
  const fixturesWithPlayerLineups = sampled.filter(
    (fixture) => fixture.playerLineupCount > 0,
  ).length;
  const fixturesWithPlayerDetails = sampled.filter(
    (fixture) => fixture.playersWithDetails > 0,
  ).length;
  const fixturesWithFantasyDetails = sampled.filter(
    (fixture) => fixture.playersWithFantasyDetails > 0,
  ).length;
  return {
    seasonId,
    sampledFixtures: sampled.length,
    fixturesWithLineups,
    fixturesWithPlayerLineups,
    fixturesWithPlayerDetails,
    fixturesWithFantasyDetails,
    totalLineups: sampled.reduce((total, fixture) => total + fixture.lineupCount, 0),
    totalPlayerLineups: sampled.reduce((total, fixture) => total + fixture.playerLineupCount, 0),
    totalIncompleteLineups: sampled.reduce(
      (total, fixture) => total + fixture.malformedLineupCount + fixture.lineupsWithoutPlayerId,
      0,
    ),
    totalDetails: sampled.reduce((total, fixture) => total + fixture.detailCount, 0),
    totalInvalidDetails: sampled.reduce((total, fixture) => total + fixture.invalidDetailCount, 0),
    totalEvents: sampled.reduce((total, fixture) => total + fixture.eventCount, 0),
    totalInvalidEvents: sampled.reduce((total, fixture) => total + fixture.invalidEventCount, 0),
    usableForPreseasonDerivation:
      fixturesWithPlayerLineups === sampled.length && fixturesWithFantasyDetails === sampled.length,
    fixtures: sampled,
  };
}

function expectedCommit(value: string | undefined): string {
  if (!value || !COMMIT_PATTERN.test(value)) {
    throw new HistoricalPerformanceProbeError("invalid_expected_commit");
  }
  return value;
}

export function historicalPerformanceFailureEvidence(
  error: unknown,
  commit: string | undefined,
  observedAt = new Date(),
): HistoricalPerformanceFailureEvidence {
  const rawCode =
    error instanceof HistoricalPerformanceProbeError || error instanceof SportsMonksProbeError
      ? error.code
      : "unexpected_historical_performance_probe_failure";
  return {
    schemaVersion: 1,
    requestId: HISTORICAL_PERFORMANCE_REQUEST_ID,
    repairsRunIds: HISTORICAL_PERFORMANCE_PRIOR_RUN_IDS,
    provider: "sportsmonks",
    mode: "read_only_historical_player_performance_coverage",
    expectedCommit: COMMIT_PATTERN.test(commit ?? "") ? commit! : null,
    observedAt: observedAt.toISOString(),
    verdict: "fail",
    errorCode: ERROR_CODE_PATTERN.test(rawCode)
      ? rawCode
      : "unexpected_historical_performance_probe_failure",
  };
}

export async function runHistoricalPerformanceProbe(
  values: Readonly<Record<string, string | undefined>>,
  dependencies: ProbeDependencies = {},
): Promise<HistoricalPerformanceEvidence> {
  const token = requireSportsMonksToken(values.SPORTSMONKS_API_TOKEN);
  const commit = expectedCommit(values.EXPECTED_COMMIT);
  const observedAt = dependencies.now?.() ?? new Date();
  const fixtures: FixtureCoverage[] = [];
  for (const expected of HISTORICAL_PERFORMANCE_FIXTURES) {
    const response = await requestSportsMonksJson(
      `${SPORTSMONKS_BASE_PATH}/fixtures/${expected.fixtureId}`,
      { include: "lineups.details;events" },
      token,
      dependencies,
    );
    fixtures.push(fixtureCoverage(response, expected));
  }
  const seasons = [26027, 24319].map((seasonId) => seasonCoverage(seasonId, fixtures));
  const evidence: HistoricalPerformanceEvidence = {
    schemaVersion: 1,
    requestId: HISTORICAL_PERFORMANCE_REQUEST_ID,
    repairsRunIds: HISTORICAL_PERFORMANCE_PRIOR_RUN_IDS,
    provider: "sportsmonks",
    mode: "read_only_historical_player_performance_coverage",
    expectedCommit: commit,
    observedAt: observedAt.toISOString(),
    leagueId: BOTOLA_PRO_LEAGUE_ID,
    requestCount: HISTORICAL_PERFORMANCE_FIXTURES.length,
    seasons,
    usableForPreseasonDerivation: seasons.every((season) => season.usableForPreseasonDerivation),
    verdict: "pass",
  };
  if (JSON.stringify(evidence).includes(token)) {
    throw new HistoricalPerformanceProbeError("credential_in_evidence");
  }
  return evidence;
}

/** Provider `starting_at` ("YYYY-MM-DD HH:MM:SS", requested in UTC) to ISO-8601, else null. */
export function providerKickoff(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = PROVIDER_DATETIME_PATTERN.exec(value.trim());
  if (!match) return null;
  const iso = `${match[1]}T${match[2]}.000Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function failureCode(value: string): string {
  return ERROR_CODE_PATTERN.test(value) ? value : "unexpected_invariant_failure_code";
}

/**
 * Classify one provider fixture payload with the edge worker's own
 * normalizeHistoricalFixture. Coverage failures come back as the worker's
 * diagnostic (identical counts and failure codes to the 503 it would have
 * returned); row-level aborts come back as that abort code with null counts.
 */
export async function classifyFixtureInvariants(
  payload: unknown,
  fixtureId: number,
  seasonId: number,
  kickoff: string | null,
  enumerated: boolean,
): Promise<FixtureInvariantRow> {
  try {
    const normalized = await normalizeHistoricalFixture(payload, fixtureId, seasonId);
    return {
      fixtureId,
      seasonId,
      kickoff,
      enumerated,
      lineupRows: normalized.coverage.lineupRowsSeen,
      validPlayerRows: normalized.coverage.validPlayerRows,
      excludedIncompleteRows: normalized.coverage.excludedIncompleteRows,
      starterRows: normalized.coverage.starterRows,
      teamCount: normalized.coverage.teamCount,
      invalidDetailRows: normalized.coverage.invalidDetailRows,
      failures: [],
      pass: true,
    };
  } catch (error) {
    if (!(error instanceof HistoricalPerformanceRuntimeError)) {
      throw new HistoricalPerformanceProbeError("unexpected_invariant_normalization_failure");
    }
    const diagnostic = error.diagnostic;
    if (error.code === "historical_fixture_coverage_incomplete" && isRecord(diagnostic)) {
      const failures = array(diagnostic.failures, "invalid_invariant_diagnostic").map((value) =>
        typeof value === "string" ? failureCode(value) : "unexpected_invariant_failure_code",
      );
      if (failures.length < 1) {
        throw new HistoricalPerformanceProbeError("invalid_invariant_diagnostic");
      }
      return {
        fixtureId,
        seasonId,
        kickoff,
        enumerated,
        lineupRows: nonNegativeInteger(diagnostic.lineupRowsSeen, "invalid_invariant_diagnostic"),
        validPlayerRows: nonNegativeInteger(
          diagnostic.validPlayerRows,
          "invalid_invariant_diagnostic",
        ),
        excludedIncompleteRows: nonNegativeInteger(
          diagnostic.excludedIncompleteRows,
          "invalid_invariant_diagnostic",
        ),
        starterRows: nonNegativeInteger(diagnostic.starterRows, "invalid_invariant_diagnostic"),
        teamCount: nonNegativeInteger(diagnostic.teamCount, "invalid_invariant_diagnostic"),
        invalidDetailRows: nonNegativeInteger(
          diagnostic.invalidDetailRows,
          "invalid_invariant_diagnostic",
        ),
        failures,
        pass: false,
      };
    }
    return {
      fixtureId,
      seasonId,
      kickoff,
      enumerated,
      lineupRows: null,
      validPlayerRows: null,
      excludedIncompleteRows: null,
      starterRows: null,
      teamCount: null,
      invalidDetailRows: null,
      failures: [failureCode(error.code)],
      pass: false,
    };
  }
}

function paginationHasMore(value: JsonRecord): boolean {
  const pagination = record(value.pagination, "invalid_season_fixtures_pagination");
  if (typeof pagination.has_more !== "boolean") {
    throw new HistoricalPerformanceProbeError("invalid_season_fixtures_pagination");
  }
  return pagination.has_more;
}

type SeasonScope = (typeof TWO_SEASON_BACKFILL_SCOPE)[number];

function seasonScope(seasonId: number): SeasonScope {
  const scope = TWO_SEASON_BACKFILL_SCOPE.find((season) => season.id === seasonId);
  if (!scope) throw new HistoricalPerformanceProbeError("invariant_season_scope_missing");
  return scope;
}

type Requester = (path: string, query: Readonly<Record<string, string>>) => Promise<unknown>;

/**
 * Enumerate every league-860 fixture of a season through the same
 * fixtures/between windows, filters and page size the two-season coverage
 * audit and the fixture ingestion runtime use. Returns fixtureId -> kickoff.
 */
async function enumerateSeasonFixtures(
  scope: SeasonScope,
  request: Requester,
): Promise<Map<number, string | null>> {
  const fixtures = new Map<number, string | null>();
  for (const window of buildFixtureWindows(scope.startingAt, scope.endingAt)) {
    for (let page = 1; page <= MAX_PAGES_PER_WINDOW; page += 1) {
      const response = record(
        await request(`${SPORTSMONKS_BASE_PATH}/fixtures/between/${window.from}/${window.to}`, {
          filters: `fixtureLeagues:${BOTOLA_PRO_LEAGUE_ID}`,
          page: String(page),
          per_page: String(PER_PAGE),
          timezone: "UTC",
        }),
        "invalid_season_fixtures_response",
      );
      const rows = array(response.data, "invalid_season_fixtures_data");
      if (rows.length > PER_PAGE) {
        throw new HistoricalPerformanceProbeError("season_fixtures_page_too_large");
      }
      for (const value of rows) {
        const fixture = record(value, "invalid_season_fixture");
        const fixtureId = positiveInteger(fixture.id, "invalid_season_fixture_id");
        if (
          positiveInteger(fixture.league_id, "invalid_season_fixture_league_id") !==
            BOTOLA_PRO_LEAGUE_ID ||
          positiveInteger(fixture.season_id, "invalid_season_fixture_season_id") !== scope.id ||
          fixtures.has(fixtureId)
        ) {
          throw new HistoricalPerformanceProbeError("season_fixture_scope_mismatch");
        }
        fixtures.set(fixtureId, providerKickoff(fixture.starting_at));
      }
      if (!paginationHasMore(response)) break;
      if (rows.length < 1 || page === MAX_PAGES_PER_WINDOW) {
        throw new HistoricalPerformanceProbeError("season_fixtures_pagination_limit_exceeded");
      }
    }
  }
  return fixtures;
}

export async function runHistoricalPerformanceInvariantProbe(
  values: Readonly<Record<string, string | undefined>>,
  dependencies: ProbeDependencies = {},
): Promise<HistoricalPerformanceInvariantEvidence> {
  const token = requireSportsMonksToken(values.SPORTSMONKS_API_TOKEN);
  const commit = expectedCommit(values.EXPECTED_COMMIT);
  const observedAt = dependencies.now?.() ?? new Date();

  let requestCount = 0;
  const request: Requester = async (path, query) => {
    requestCount += 1;
    return requestSportsMonksJson(path, query, token, dependencies);
  };

  const seasons: SeasonInvariantSummary[] = [];
  for (const seasonId of HISTORICAL_PERFORMANCE_INVARIANT_SEASONS) {
    const scope = seasonScope(seasonId);
    const seasonRequestStart = requestCount;
    const enumerated = await enumerateSeasonFixtures(scope, request);

    // The reviewed ticket fixtures of this season are classified even when the
    // enumeration is partial, so fixture 19489216 can never fall out of scope.
    const pinnedFixtureIds = HISTORICAL_PERFORMANCE_FIXTURES.filter(
      (fixture) => fixture.seasonId === seasonId,
    )
      .map((fixture) => fixture.fixtureId)
      .sort((left, right) => left - right);
    const targets = new Map<number, { kickoff: string | null; enumerated: boolean }>();
    for (const [fixtureId, kickoff] of enumerated) {
      targets.set(fixtureId, { kickoff, enumerated: true });
    }
    for (const fixtureId of pinnedFixtureIds) {
      if (!targets.has(fixtureId)) targets.set(fixtureId, { kickoff: null, enumerated: false });
    }

    const failuresByCode: Record<string, number> = {};
    for (const code of HISTORICAL_PERFORMANCE_COVERAGE_FAILURE_CODES) failuresByCode[code] = 0;
    const rows: FixtureInvariantRow[] = [];
    for (const fixtureId of [...targets.keys()].sort((left, right) => left - right)) {
      const target = targets.get(fixtureId)!;
      const payload = await request(`${SPORTSMONKS_BASE_PATH}/fixtures/${fixtureId}`, {
        include: "lineups.details",
        filters: `lineupDetailTypes:${HISTORICAL_PERFORMANCE_DETAIL_TYPE_IDS.join(",")}`,
      });
      const row = await classifyFixtureInvariants(
        payload,
        fixtureId,
        seasonId,
        target.kickoff,
        target.enumerated,
      );
      for (const code of row.failures) failuresByCode[code] = (failuresByCode[code] ?? 0) + 1;
      rows.push(row);
    }

    const passing = rows.filter((row) => row.pass).length;
    seasons.push({
      seasonId,
      expectedFixtures: HISTORICAL_PERFORMANCE_EXPECTED_FIXTURES_PER_SEASON,
      fixturesEnumerated: enumerated.size,
      enumerationComplete: enumerated.size === HISTORICAL_PERFORMANCE_EXPECTED_FIXTURES_PER_SEASON,
      pinnedFixtureIds,
      requests: requestCount - seasonRequestStart,
      fixtures: rows.length,
      passing,
      failing: rows.length - passing,
      failuresByCode,
      rows,
    });
  }

  const fixtures = seasons.reduce((total, season) => total + season.fixtures, 0);
  const passing = seasons.reduce((total, season) => total + season.passing, 0);
  const evidence: HistoricalPerformanceInvariantEvidence = {
    schemaVersion: 1,
    requestId: HISTORICAL_PERFORMANCE_REQUEST_ID,
    provider: "sportsmonks",
    mode: "read_only_historical_player_performance_invariants",
    expectedCommit: commit,
    observedAt: observedAt.toISOString(),
    leagueId: BOTOLA_PRO_LEAGUE_ID,
    providerPayloadIncluded: false,
    invariantSource:
      "supabase/functions/_shared/sportsmonks-historical-player-performance.ts#normalizeHistoricalFixture",
    coverageFailureCodes: HISTORICAL_PERFORMANCE_COVERAGE_FAILURE_CODES,
    requestCount,
    fixtures,
    passing,
    failing: fixtures - passing,
    seasons,
    verdict: "pass",
  };
  if (JSON.stringify(evidence).includes(token)) {
    throw new HistoricalPerformanceProbeError("credential_in_evidence");
  }
  return evidence;
}

async function writeEvidence(directory: string, name: string, payload: unknown): Promise<void> {
  const outputPath = resolve(directory, name);
  await Bun.write(outputPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
}

async function main(): Promise<void> {
  const evidenceDirectory = process.env.G7_PERFORMANCE_EVIDENCE_DIR?.trim();
  if (!evidenceDirectory) {
    throw new HistoricalPerformanceProbeError("missing_evidence_directory");
  }
  const evidence = await runHistoricalPerformanceProbe(process.env);
  await writeEvidence(evidenceDirectory, "sportsmonks-historical-performance.json", evidence);
  const invariants = await runHistoricalPerformanceInvariantProbe(process.env);
  await writeEvidence(
    evidenceDirectory,
    "sportsmonks-historical-performance-invariants.json",
    invariants,
  );
  console.log(
    `SPORTSMONKS_HISTORICAL_PERFORMANCE_PROBE_PASS invariantFixtures=${invariants.fixtures} failing=${invariants.failing}`,
  );
}

if (import.meta.main) {
  main().catch(async (error: unknown) => {
    const evidence = historicalPerformanceFailureEvidence(error, process.env.EXPECTED_COMMIT);
    const evidenceDirectory = process.env.G7_PERFORMANCE_EVIDENCE_DIR?.trim();
    if (evidenceDirectory) {
      await writeEvidence(
        evidenceDirectory,
        "sportsmonks-historical-performance-failure.json",
        evidence,
      );
    }
    console.error(`SPORTSMONKS_HISTORICAL_PERFORMANCE_PROBE_FAIL code=${evidence.errorCode}`);
    process.exitCode = 1;
  });
}
