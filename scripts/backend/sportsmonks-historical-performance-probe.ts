import { chmod } from "node:fs/promises";
import { resolve } from "node:path";

import {
  BOTOLA_PRO_LEAGUE_ID,
  requestSportsMonksJson,
  requireSportsMonksToken,
  SportsMonksProbeError,
  type ProbeDependencies,
} from "./sportsmonks-production-probe";

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;

type JsonRecord = Record<string, unknown>;

export const HISTORICAL_PERFORMANCE_FIXTURES = [
  { seasonId: 26027, fixtureId: 19489211 },
  { seasonId: 26027, fixtureId: 19662879 },
  { seasonId: 26027, fixtureId: 19734478 },
  { seasonId: 24319, fixtureId: 19263646 },
  { seasonId: 24319, fixtureId: 19334647 },
  { seasonId: 24319, fixtureId: 19420617 },
] as const;

export const HISTORICAL_PERFORMANCE_REQUEST_ID =
  "g7-historical-performance-coverage-2026-08-02-03" as const;
export const HISTORICAL_PERFORMANCE_PRIOR_RUN_IDS = [30752931530, 30753527952] as const;

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
  readonly requestCount: 6;
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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, code: string): JsonRecord {
  if (!isRecord(value)) throw new HistoricalPerformanceProbeError(code);
  return value;
}

function positiveInteger(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
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
  if (sampled.length !== 3) {
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
      `/v3/football/fixtures/${expected.fixtureId}`,
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
    requestCount: 6,
    seasons,
    usableForPreseasonDerivation: seasons.every((season) => season.usableForPreseasonDerivation),
    verdict: "pass",
  };
  if (JSON.stringify(evidence).includes(token)) {
    throw new HistoricalPerformanceProbeError("credential_in_evidence");
  }
  return evidence;
}

async function main(): Promise<void> {
  const evidenceDirectory = process.env.G7_PERFORMANCE_EVIDENCE_DIR?.trim();
  if (!evidenceDirectory) {
    throw new HistoricalPerformanceProbeError("missing_evidence_directory");
  }
  const evidence = await runHistoricalPerformanceProbe(process.env);
  const outputPath = resolve(evidenceDirectory, "sportsmonks-historical-performance.json");
  await Bun.write(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
  console.log("SPORTSMONKS_HISTORICAL_PERFORMANCE_PROBE_PASS");
}

if (import.meta.main) {
  main().catch(async (error: unknown) => {
    const evidence = historicalPerformanceFailureEvidence(error, process.env.EXPECTED_COMMIT);
    const evidenceDirectory = process.env.G7_PERFORMANCE_EVIDENCE_DIR?.trim();
    if (evidenceDirectory) {
      const outputPath = resolve(
        evidenceDirectory,
        "sportsmonks-historical-performance-failure.json",
      );
      await Bun.write(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
      await chmod(outputPath, 0o600);
    }
    console.error(`SPORTSMONKS_HISTORICAL_PERFORMANCE_PROBE_FAIL code=${evidence.errorCode}`);
    process.exitCode = 1;
  });
}
