import { chmod } from "node:fs/promises";
import { resolve } from "node:path";
import {
  BOTOLA_PRO_LEAGUE_ID,
  SPORTSMONKS_BASE_PATH,
  SportsMonksProbeError,
  boundedFixtureWindow,
  requestSportsMonksJson,
  requireSportsMonksToken,
  type ProbeDependencies,
} from "./sportsmonks-production-probe";

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BACKFILL_SEASON_COUNT = 3;

type JsonRecord = Record<string, unknown>;

export interface CompletedSeason {
  readonly id: number;
  readonly leagueId: number;
  readonly name: string;
  readonly current: false;
  readonly finished: true;
  readonly startingAt: string;
  readonly endingAt: string;
}

export class HistoricalBackfillProbeError extends SportsMonksProbeError {
  constructor(
    code: string,
    readonly discoveredSeasons: readonly CompletedSeason[],
  ) {
    super(code);
    this.name = "HistoricalBackfillProbeError";
  }
}

interface VerifiedCompletedSeason extends CompletedSeason {
  readonly verifiedResources: {
    readonly rounds: number;
    readonly teams: number;
    readonly fixtureSampleAvailable: true;
  };
  readonly fixtureWindow: {
    readonly from: string;
    readonly to: string;
    readonly inclusiveDays: number;
  };
}

export interface HistoricalBackfillProbeEvidence {
  readonly schemaVersion: 1;
  readonly provider: "sportsmonks";
  readonly mode: "read_only_last_three_completed_seasons";
  readonly expectedCommit: string;
  readonly observedAt: string;
  readonly league: {
    readonly id: number;
    readonly name: string;
    readonly active: true;
  };
  readonly seasons: readonly VerifiedCompletedSeason[];
  readonly seasonCount: 3;
  readonly requestCount: 10;
  readonly verdict: "pass";
}

function record(value: unknown, code: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SportsMonksProbeError(code);
  }
  return value as JsonRecord;
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

function expectedCommit(value: string | undefined): string {
  if (!value || !COMMIT_PATTERN.test(value)) {
    throw new SportsMonksProbeError("invalid_expected_commit");
  }
  return value;
}

function completedSeason(value: unknown): CompletedSeason | null {
  const season = record(value, "invalid_backfill_season");
  const leagueId = positiveInteger(season.league_id, "invalid_backfill_season_league_id");
  const current = boolean(season.is_current, "invalid_backfill_season_current");
  const finished = boolean(season.finished, "invalid_backfill_season_finished");
  const pending = boolean(season.pending, "invalid_backfill_season_pending");
  if (leagueId !== BOTOLA_PRO_LEAGUE_ID || current || !finished || pending) return null;
  const startingAt = isoDate(season.starting_at, "invalid_backfill_season_start");
  const endingAt = isoDate(season.ending_at, "invalid_backfill_season_end");
  if (startingAt > endingAt) throw new SportsMonksProbeError("invalid_backfill_season_dates");
  return {
    id: positiveInteger(season.id, "invalid_backfill_season_id"),
    leagueId,
    name: nonEmptyString(season.name, "invalid_backfill_season_name"),
    current: false,
    finished: true,
    startingAt,
    endingAt,
  };
}

function validateFixtureSample(value: unknown, seasonId: number): void {
  const fixtures = array(
    record(value, "invalid_backfill_fixtures_response").data,
    "invalid_backfill_fixtures_data",
  );
  if (fixtures.length === 0) throw new SportsMonksProbeError("backfill_fixture_sample_missing");
  const fixture = record(fixtures[0], "invalid_backfill_fixture_sample");
  positiveInteger(fixture.id, "invalid_backfill_fixture_id");
  if (
    positiveInteger(fixture.league_id, "invalid_backfill_fixture_league_id") !==
      BOTOLA_PRO_LEAGUE_ID ||
    positiveInteger(fixture.season_id, "invalid_backfill_fixture_season_id") !== seasonId ||
    array(fixture.participants, "invalid_backfill_fixture_participants").length !== 2
  ) {
    throw new SportsMonksProbeError("backfill_fixture_scope_mismatch");
  }
}

export async function runSportsMonksHistoricalBackfillProbe(
  values: Readonly<Record<string, string | undefined>>,
  dependencies: ProbeDependencies = {},
): Promise<HistoricalBackfillProbeEvidence> {
  const token = requireSportsMonksToken(values.SPORTSMONKS_API_TOKEN);
  const commit = expectedCommit(values.EXPECTED_COMMIT);
  const now = dependencies.now ?? (() => new Date());
  const observedAt = now();

  const leagueResponse = record(
    await requestSportsMonksJson(
      `${SPORTSMONKS_BASE_PATH}/leagues/${BOTOLA_PRO_LEAGUE_ID}`,
      { include: "seasons" },
      token,
      dependencies,
    ),
    "invalid_backfill_league_response",
  );
  const league = record(leagueResponse.data, "invalid_backfill_league_data");
  if (positiveInteger(league.id, "invalid_backfill_league_id") !== BOTOLA_PRO_LEAGUE_ID) {
    throw new SportsMonksProbeError("backfill_league_id_mismatch");
  }
  if (!boolean(league.active, "invalid_backfill_league_active")) {
    throw new SportsMonksProbeError("backfill_league_not_active");
  }

  const candidates = array(league.seasons, "backfill_seasons_missing")
    .map(completedSeason)
    .filter((season): season is CompletedSeason => season !== null)
    .sort((left, right) => right.endingAt.localeCompare(left.endingAt))
    .slice(0, BACKFILL_SEASON_COUNT);
  if (candidates.length !== BACKFILL_SEASON_COUNT) {
    throw new HistoricalBackfillProbeError("three_completed_seasons_not_available", candidates);
  }

  const seasons: VerifiedCompletedSeason[] = [];
  for (const candidate of candidates) {
    const roundsResponse = record(
      await requestSportsMonksJson(
        `${SPORTSMONKS_BASE_PATH}/rounds/seasons/${candidate.id}`,
        {},
        token,
        dependencies,
      ),
      "invalid_backfill_rounds_response",
    );
    const teamsResponse = record(
      await requestSportsMonksJson(
        `${SPORTSMONKS_BASE_PATH}/teams/seasons/${candidate.id}`,
        { page: "1", per_page: "50" },
        token,
        dependencies,
      ),
      "invalid_backfill_teams_response",
    );
    const rounds = array(roundsResponse.data, "invalid_backfill_rounds_data").length;
    const teams = array(teamsResponse.data, "invalid_backfill_teams_data").length;
    if (rounds <= 0 || teams <= 0) {
      throw new HistoricalBackfillProbeError("backfill_season_not_populated", candidates);
    }

    const fixtureWindow = boundedFixtureWindow(
      candidate.startingAt,
      candidate.endingAt,
      observedAt,
    );
    const fixturesResponse = await requestSportsMonksJson(
      `${SPORTSMONKS_BASE_PATH}/fixtures/between/${fixtureWindow.from}/${fixtureWindow.to}`,
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
    validateFixtureSample(fixturesResponse, candidate.id);
    seasons.push({
      ...candidate,
      verifiedResources: { rounds, teams, fixtureSampleAvailable: true },
      fixtureWindow,
    });
  }

  const evidence: HistoricalBackfillProbeEvidence = {
    schemaVersion: 1,
    provider: "sportsmonks",
    mode: "read_only_last_three_completed_seasons",
    expectedCommit: commit,
    observedAt: observedAt.toISOString(),
    league: {
      id: BOTOLA_PRO_LEAGUE_ID,
      name: nonEmptyString(league.name, "invalid_backfill_league_name"),
      active: true,
    },
    seasons,
    seasonCount: 3,
    requestCount: 10,
    verdict: "pass",
  };
  if (JSON.stringify(evidence).includes(token)) {
    throw new SportsMonksProbeError("credential_in_backfill_evidence");
  }
  return evidence;
}

async function main(): Promise<void> {
  const evidenceDirectory = process.env.G5_DISCOVERY_EVIDENCE_DIR?.trim();
  if (!evidenceDirectory) throw new SportsMonksProbeError("missing_evidence_directory");
  const evidence = await runSportsMonksHistoricalBackfillProbe(process.env);
  const outputPath = resolve(evidenceDirectory, "sportsmonks-last-three-completed-seasons.json");
  await Bun.write(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
  console.log("SPORTSMONKS_HISTORICAL_BACKFILL_PROBE_PASS");
}

if (import.meta.main) {
  main().catch(async (error: unknown) => {
    const rawCode =
      error instanceof SportsMonksProbeError ? error.code : "unexpected_probe_failure";
    const code = /^[a-z][a-z0-9_]{1,79}$/.test(rawCode) ? rawCode : "unexpected_probe_failure";
    console.error(`SPORTSMONKS_HISTORICAL_BACKFILL_PROBE_FAIL code=${code}`);
    const evidenceDirectory = process.env.G5_DISCOVERY_EVIDENCE_DIR?.trim();
    if (evidenceDirectory) {
      const discoveredSeasons =
        error instanceof HistoricalBackfillProbeError ? error.discoveredSeasons : [];
      const outputPath = resolve(
        evidenceDirectory,
        "sportsmonks-last-three-completed-seasons-failure.json",
      );
      await Bun.write(
        outputPath,
        `${JSON.stringify(
          {
            schemaVersion: 1,
            provider: "sportsmonks",
            mode: "read_only_last_three_completed_seasons",
            expectedCommit: COMMIT_PATTERN.test(process.env.EXPECTED_COMMIT ?? "")
              ? process.env.EXPECTED_COMMIT
              : null,
            observedAt: new Date().toISOString(),
            verdict: "fail",
            errorCode: code,
            discoveredSeasonCount: discoveredSeasons.length,
            discoveredSeasons,
          },
          null,
          2,
        )}\n`,
        { mode: 0o600 },
      );
      await chmod(outputPath, 0o600);
    }
    process.exitCode = 1;
  });
}
