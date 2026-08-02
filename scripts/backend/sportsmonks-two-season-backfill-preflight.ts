import { chmod } from "node:fs/promises";
import { resolve } from "node:path";
import {
  BOTOLA_PRO_LEAGUE_ID,
  SPORTSMONKS_BASE_PATH,
  SportsMonksProbeError,
  requestSportsMonksJson,
  requireSportsMonksToken,
  type ProbeDependencies,
} from "./sportsmonks-production-probe";

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const MAX_FIXTURE_WINDOW_DAYS = 100;
const MAX_TEAMS = 20;

type JsonRecord = Record<string, unknown>;

export const TWO_SEASON_BACKFILL_SCOPE = [
  {
    id: 26_027,
    name: "2025/2026",
    startingAt: "2025-09-12",
    endingAt: "2026-07-05",
  },
  {
    id: 24_319,
    name: "2024/2025",
    startingAt: "2024-08-30",
    endingAt: "2025-05-12",
  },
] as const;

export interface FixtureWindow {
  readonly from: string;
  readonly to: string;
  readonly inclusiveDays: number;
}

export interface TwoSeasonBackfillManifest {
  readonly schemaVersion: 1;
  readonly provider: "sportsmonks";
  readonly mode: "read_only_two_season_backfill_preflight";
  readonly expectedCommit: string;
  readonly observedAt: string;
  readonly league: { readonly id: 860; readonly name: string; readonly active: true };
  readonly seasons: ReadonlyArray<{
    readonly id: number;
    readonly name: string;
    readonly startingAt: string;
    readonly endingAt: string;
    readonly rounds: number;
    readonly teamIds: readonly number[];
    readonly fixtureWindows: readonly FixtureWindow[];
  }>;
  readonly seasonCount: 2;
  readonly requestCount: 11;
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

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function inclusiveDays(from: string, to: string): number {
  return (
    Math.round(
      (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000,
    ) + 1
  );
}

export function buildFixtureWindows(startingAt: string, endingAt: string): FixtureWindow[] {
  if (startingAt > endingAt) throw new SportsMonksProbeError("invalid_backfill_scope_dates");
  const windows: FixtureWindow[] = [];
  let from = startingAt;
  while (from <= endingAt) {
    const candidate = addDays(from, MAX_FIXTURE_WINDOW_DAYS - 1);
    const to = candidate < endingAt ? candidate : endingAt;
    const days = inclusiveDays(from, to);
    if (days < 1 || days > MAX_FIXTURE_WINDOW_DAYS) {
      throw new SportsMonksProbeError("fixture_window_out_of_bounds");
    }
    windows.push({ from, to, inclusiveDays: days });
    from = addDays(to, 1);
  }
  return windows;
}

function validateFixtureSample(value: unknown, seasonId: number): void {
  const fixtures = array(
    record(value, "invalid_backfill_fixtures_response").data,
    "invalid_backfill_fixtures_data",
  );
  if (fixtures.length !== 1) throw new SportsMonksProbeError("backfill_fixture_sample_missing");
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

function validatePinnedSeason(
  value: unknown,
  expected: (typeof TWO_SEASON_BACKFILL_SCOPE)[number],
) {
  const season = record(value, "invalid_backfill_season");
  if (
    positiveInteger(season.id, "invalid_backfill_season_id") !== expected.id ||
    positiveInteger(season.league_id, "invalid_backfill_season_league_id") !==
      BOTOLA_PRO_LEAGUE_ID ||
    nonEmptyString(season.name, "invalid_backfill_season_name") !== expected.name ||
    nonEmptyString(season.starting_at, "invalid_backfill_season_start") !== expected.startingAt ||
    nonEmptyString(season.ending_at, "invalid_backfill_season_end") !== expected.endingAt ||
    boolean(season.is_current, "invalid_backfill_season_current") ||
    !boolean(season.finished, "invalid_backfill_season_finished") ||
    boolean(season.pending, "invalid_backfill_season_pending")
  ) {
    throw new SportsMonksProbeError(`backfill_season_scope_mismatch_${expected.id}`);
  }
}

export async function runTwoSeasonBackfillPreflight(
  values: Readonly<Record<string, string | undefined>>,
  dependencies: ProbeDependencies = {},
): Promise<TwoSeasonBackfillManifest> {
  const token = requireSportsMonksToken(values.SPORTSMONKS_API_TOKEN);
  const expectedCommit = values.EXPECTED_COMMIT ?? "";
  if (!COMMIT_PATTERN.test(expectedCommit)) {
    throw new SportsMonksProbeError("invalid_expected_commit");
  }

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
  if (
    positiveInteger(league.id, "invalid_backfill_league_id") !== BOTOLA_PRO_LEAGUE_ID ||
    !boolean(league.active, "invalid_backfill_league_active")
  ) {
    throw new SportsMonksProbeError("backfill_league_scope_mismatch");
  }
  const providerSeasons = array(league.seasons, "backfill_seasons_missing");

  const seasons: TwoSeasonBackfillManifest["seasons"][number][] = [];
  for (const expected of TWO_SEASON_BACKFILL_SCOPE) {
    const providerSeason = providerSeasons.find(
      (candidate) =>
        typeof candidate === "object" &&
        candidate !== null &&
        !Array.isArray(candidate) &&
        (candidate as JsonRecord).id === expected.id,
    );
    if (!providerSeason) {
      throw new SportsMonksProbeError(`backfill_season_missing_${expected.id}`);
    }
    validatePinnedSeason(providerSeason, expected);

    const roundsResponse = record(
      await requestSportsMonksJson(
        `${SPORTSMONKS_BASE_PATH}/rounds/seasons/${expected.id}`,
        {},
        token,
        dependencies,
      ),
      "invalid_backfill_rounds_response",
    );
    const rounds = array(roundsResponse.data, "invalid_backfill_rounds_data");
    if (rounds.length < 1 || rounds.length > 100) {
      throw new SportsMonksProbeError(`backfill_round_count_invalid_${expected.id}`);
    }

    const teamsResponse = record(
      await requestSportsMonksJson(
        `${SPORTSMONKS_BASE_PATH}/teams/seasons/${expected.id}`,
        { page: "1", per_page: "50" },
        token,
        dependencies,
      ),
      "invalid_backfill_teams_response",
    );
    const teamIds = array(teamsResponse.data, "invalid_backfill_teams_data").map((team) =>
      positiveInteger(record(team, "invalid_backfill_team").id, "invalid_backfill_team_id"),
    );
    if (
      teamIds.length < 2 ||
      teamIds.length > MAX_TEAMS ||
      new Set(teamIds).size !== teamIds.length
    ) {
      throw new SportsMonksProbeError(`backfill_team_scope_invalid_${expected.id}`);
    }

    const fixtureWindows = buildFixtureWindows(expected.startingAt, expected.endingAt);
    for (const window of fixtureWindows) {
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
      validateFixtureSample(fixturesResponse, expected.id);
    }

    seasons.push({ ...expected, rounds: rounds.length, teamIds, fixtureWindows });
  }

  const manifest: TwoSeasonBackfillManifest = {
    schemaVersion: 1,
    provider: "sportsmonks",
    mode: "read_only_two_season_backfill_preflight",
    expectedCommit,
    observedAt: (dependencies.now?.() ?? new Date()).toISOString(),
    league: {
      id: BOTOLA_PRO_LEAGUE_ID,
      name: nonEmptyString(league.name, "invalid_backfill_league_name"),
      active: true,
    },
    seasons,
    seasonCount: 2,
    requestCount: 11,
    verdict: "pass",
  };
  if (JSON.stringify(manifest).includes(token)) {
    throw new SportsMonksProbeError("credential_in_backfill_manifest");
  }
  return manifest;
}

async function writeEvidence(payload: unknown, name: string): Promise<void> {
  const directory = process.env.G5_BACKFILL_EVIDENCE_DIR?.trim();
  if (!directory) throw new SportsMonksProbeError("missing_evidence_directory");
  const outputPath = resolve(directory, name);
  await Bun.write(outputPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
}

async function main(): Promise<void> {
  const manifest = await runTwoSeasonBackfillPreflight(process.env);
  await writeEvidence(manifest, "g5-two-season-backfill-manifest.json");
  console.log("SPORTSMONKS_TWO_SEASON_BACKFILL_PREFLIGHT_PASS");
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
          mode: "read_only_two_season_backfill_preflight",
          expectedCommit: COMMIT_PATTERN.test(process.env.EXPECTED_COMMIT ?? "")
            ? process.env.EXPECTED_COMMIT
            : null,
          requestedSeasonIds: TWO_SEASON_BACKFILL_SCOPE.map((season) => season.id),
          error: code,
          verdict: "fail",
        },
        "g5-two-season-backfill-preflight-failure.json",
      );
    } catch {
      // The original failure remains authoritative if evidence initialization also fails.
    }
    console.error(`SPORTSMONKS_TWO_SEASON_BACKFILL_PREFLIGHT_FAIL code=${code}`);
    process.exitCode = 1;
  });
}
