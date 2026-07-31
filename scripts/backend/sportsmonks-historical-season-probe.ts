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
const MAX_HISTORICAL_CANDIDATES = 6;

type JsonRecord = Record<string, unknown>;

interface HistoricalSeason {
  readonly id: number;
  readonly leagueId: number;
  readonly name: string;
  readonly current: false;
  readonly finished: true;
  readonly startingAt: string;
  readonly endingAt: string;
}

export interface HistoricalSeasonProbeEvidence {
  readonly schemaVersion: 1;
  readonly provider: "sportsmonks";
  readonly mode: "read_only_historical_discovery";
  readonly expectedCommit: string;
  readonly observedAt: string;
  readonly league: {
    readonly id: number;
    readonly name: string;
    readonly active: true;
  };
  readonly selectedSeason: HistoricalSeason;
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
  readonly candidatesChecked: number;
  readonly requestCount: number;
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

function historicalSeason(value: unknown): HistoricalSeason | null {
  const season = record(value, "invalid_historical_season");
  const leagueId = positiveInteger(season.league_id, "invalid_historical_season_league_id");
  const current = boolean(season.is_current, "invalid_historical_season_current");
  const finished = boolean(season.finished, "invalid_historical_season_finished");
  const pending = boolean(season.pending, "invalid_historical_season_pending");
  if (leagueId !== BOTOLA_PRO_LEAGUE_ID || current || !finished || pending) return null;
  const startingAt = isoDate(season.starting_at, "invalid_historical_season_start");
  const endingAt = isoDate(season.ending_at, "invalid_historical_season_end");
  if (startingAt > endingAt) throw new SportsMonksProbeError("invalid_historical_season_dates");
  return {
    id: positiveInteger(season.id, "invalid_historical_season_id"),
    leagueId,
    name: nonEmptyString(season.name, "invalid_historical_season_name"),
    current: false,
    finished: true,
    startingAt,
    endingAt,
  };
}

function validateFixtureSample(value: unknown, seasonId: number): void {
  const fixtures = array(
    record(value, "invalid_historical_fixtures_response").data,
    "invalid_historical_fixtures_data",
  );
  if (fixtures.length === 0) throw new SportsMonksProbeError("historical_fixture_sample_missing");
  const fixture = record(fixtures[0], "invalid_historical_fixture_sample");
  positiveInteger(fixture.id, "invalid_historical_fixture_id");
  if (
    positiveInteger(fixture.league_id, "invalid_historical_fixture_league_id") !==
      BOTOLA_PRO_LEAGUE_ID ||
    positiveInteger(fixture.season_id, "invalid_historical_fixture_season_id") !== seasonId ||
    array(fixture.participants, "invalid_historical_fixture_participants").length !== 2
  ) {
    throw new SportsMonksProbeError("historical_fixture_scope_mismatch");
  }
}

export async function runSportsMonksHistoricalSeasonProbe(
  values: Readonly<Record<string, string | undefined>>,
  dependencies: ProbeDependencies = {},
): Promise<HistoricalSeasonProbeEvidence> {
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
    "invalid_historical_league_response",
  );
  const league = record(leagueResponse.data, "invalid_historical_league_data");
  if (positiveInteger(league.id, "invalid_historical_league_id") !== BOTOLA_PRO_LEAGUE_ID) {
    throw new SportsMonksProbeError("historical_league_id_mismatch");
  }
  if (!boolean(league.active, "invalid_historical_league_active")) {
    throw new SportsMonksProbeError("historical_league_not_active");
  }

  const candidates = array(league.seasons, "historical_seasons_missing")
    .map(historicalSeason)
    .filter((season): season is HistoricalSeason => season !== null)
    .sort((left, right) => right.endingAt.localeCompare(left.endingAt))
    .slice(0, MAX_HISTORICAL_CANDIDATES);
  if (candidates.length === 0) {
    throw new SportsMonksProbeError("historical_season_not_available");
  }

  let selected: HistoricalSeason | undefined;
  let rounds = 0;
  let teams = 0;
  let candidatesChecked = 0;
  for (const candidate of candidates) {
    candidatesChecked += 1;
    const roundsResponse = record(
      await requestSportsMonksJson(
        `${SPORTSMONKS_BASE_PATH}/rounds/seasons/${candidate.id}`,
        {},
        token,
        dependencies,
      ),
      "invalid_historical_rounds_response",
    );
    const teamsResponse = record(
      await requestSportsMonksJson(
        `${SPORTSMONKS_BASE_PATH}/teams/seasons/${candidate.id}`,
        { page: "1", per_page: "50" },
        token,
        dependencies,
      ),
      "invalid_historical_teams_response",
    );
    rounds = array(roundsResponse.data, "invalid_historical_rounds_data").length;
    teams = array(teamsResponse.data, "invalid_historical_teams_data").length;
    if (rounds > 0 && teams > 0) {
      selected = candidate;
      break;
    }
  }
  if (!selected) throw new SportsMonksProbeError("populated_historical_season_not_available");

  const fixtureWindow = boundedFixtureWindow(selected.startingAt, selected.endingAt, observedAt);
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
  validateFixtureSample(fixturesResponse, selected.id);

  const evidence: HistoricalSeasonProbeEvidence = {
    schemaVersion: 1,
    provider: "sportsmonks",
    mode: "read_only_historical_discovery",
    expectedCommit: commit,
    observedAt: observedAt.toISOString(),
    league: {
      id: BOTOLA_PRO_LEAGUE_ID,
      name: nonEmptyString(league.name, "invalid_historical_league_name"),
      active: true,
    },
    selectedSeason: selected,
    verifiedResources: {
      rounds,
      teams,
      fixtureSampleAvailable: true,
    },
    fixtureWindow,
    candidatesChecked,
    requestCount: 2 + candidatesChecked * 2,
    verdict: "pass",
  };
  if (JSON.stringify(evidence).includes(token)) {
    throw new SportsMonksProbeError("credential_in_historical_evidence");
  }
  return evidence;
}

async function main(): Promise<void> {
  const evidenceDirectory = process.env.GATE2B_EVIDENCE_DIR?.trim();
  if (!evidenceDirectory) throw new SportsMonksProbeError("missing_evidence_directory");
  const evidence = await runSportsMonksHistoricalSeasonProbe(process.env);
  const outputPath = resolve(evidenceDirectory, "sportsmonks-historical-season-probe.json");
  await Bun.write(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
  console.log("SPORTSMONKS_HISTORICAL_SEASON_PROBE_PASS");
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const code = error instanceof SportsMonksProbeError ? error.code : "unexpected_probe_failure";
    console.error(`SPORTSMONKS_HISTORICAL_SEASON_PROBE_FAIL code=${code}`);
    process.exitCode = 1;
  });
}
