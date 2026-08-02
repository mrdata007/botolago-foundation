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
  readonly lineupCount: number;
  readonly starterCount: number;
  readonly substituteCount: number;
  readonly playersWithDetails: number;
  readonly playersWithFantasyDetails: number;
  readonly detailCount: number;
  readonly detailTypeIds: number[];
  readonly eventCount: number;
  readonly eventTypeIds: number[];
}

interface SeasonCoverage {
  readonly seasonId: number;
  readonly sampledFixtures: number;
  readonly fixturesWithLineups: number;
  readonly fixturesWithPlayerDetails: number;
  readonly fixturesWithFantasyDetails: number;
  readonly totalLineups: number;
  readonly totalDetails: number;
  readonly totalEvents: number;
  readonly usableForPreseasonDerivation: boolean;
  readonly fixtures: FixtureCoverage[];
}

export interface HistoricalPerformanceEvidence {
  readonly schemaVersion: 1;
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

function optionalArray(value: unknown, code: string): unknown[] {
  if (value === undefined || value === null) return [];
  return array(value, code);
}

function sortedTypeIds(values: unknown[], code: string): number[] {
  const ids = new Set<number>();
  for (const value of values) {
    const item = record(value, code);
    ids.add(positiveInteger(item.type_id, code));
  }
  return [...ids].sort((left, right) => left - right);
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

  const lineups = optionalArray(fixture.lineups, "invalid_fixture_lineups");
  const events = optionalArray(fixture.events, "invalid_fixture_events");
  let starterCount = 0;
  let substituteCount = 0;
  let playersWithDetails = 0;
  let playersWithFantasyDetails = 0;
  let detailCount = 0;
  const detailTypeIds = new Set<number>();

  for (const value of lineups) {
    const lineup = record(value, "invalid_lineup");
    positiveInteger(lineup.player_id, "invalid_lineup_player_id");
    positiveInteger(lineup.team_id, "invalid_lineup_team_id");
    positiveInteger(lineup.position_id, "invalid_lineup_position_id");
    const participationType = positiveInteger(lineup.type_id, "invalid_lineup_type_id");
    if (participationType === 11) starterCount += 1;
    if (participationType === 12) substituteCount += 1;
    const details = optionalArray(lineup.details, "invalid_lineup_details");
    if (details.length > 0) playersWithDetails += 1;
    const playerTypeIds = sortedTypeIds(details, "invalid_lineup_detail");
    if (playerTypeIds.some((typeId) => FANTASY_DETAIL_TYPE_IDS.has(typeId))) {
      playersWithFantasyDetails += 1;
    }
    detailCount += details.length;
    for (const typeId of playerTypeIds) detailTypeIds.add(typeId);
  }

  return {
    fixtureId,
    seasonId,
    lineupCount: lineups.length,
    starterCount,
    substituteCount,
    playersWithDetails,
    playersWithFantasyDetails,
    detailCount,
    detailTypeIds: [...detailTypeIds].sort((left, right) => left - right),
    eventCount: events.length,
    eventTypeIds: sortedTypeIds(events, "invalid_fixture_event"),
  };
}

function seasonCoverage(seasonId: number, fixtures: FixtureCoverage[]): SeasonCoverage {
  const sampled = fixtures.filter((fixture) => fixture.seasonId === seasonId);
  if (sampled.length !== 3) {
    throw new HistoricalPerformanceProbeError("historical_fixture_sample_incomplete");
  }
  const fixturesWithLineups = sampled.filter((fixture) => fixture.lineupCount > 0).length;
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
    fixturesWithPlayerDetails,
    fixturesWithFantasyDetails,
    totalLineups: sampled.reduce((total, fixture) => total + fixture.lineupCount, 0),
    totalDetails: sampled.reduce((total, fixture) => total + fixture.detailCount, 0),
    totalEvents: sampled.reduce((total, fixture) => total + fixture.eventCount, 0),
    usableForPreseasonDerivation:
      fixturesWithLineups === sampled.length && fixturesWithFantasyDetails === sampled.length,
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
