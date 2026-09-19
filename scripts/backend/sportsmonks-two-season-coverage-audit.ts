import { chmod } from "node:fs/promises";
import { resolve } from "node:path";

import {
  HISTORICAL_PERFORMANCE_DETAIL_TYPE_IDS,
  HistoricalPerformanceRuntimeError,
  normalizeHistoricalFixture,
} from "../../supabase/functions/_shared/sportsmonks-historical-player-performance";
import {
  BOTOLA_PRO_LEAGUE_ID,
  SPORTSMONKS_BASE_PATH,
  SportsMonksProbeError,
  requestSportsMonksJson,
  requireSportsMonksToken,
  type ProbeDependencies,
} from "./sportsmonks-production-probe";
import {
  TWO_SEASON_BACKFILL_SCOPE,
  buildFixtureWindows,
} from "./sportsmonks-two-season-backfill-preflight";

type JsonRecord = Record<string, unknown>;

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;
const EXPECTED_FIXTURES_PER_SEASON = 240;
const MAX_PAGES_PER_WINDOW = 10;
const PER_PAGE = 50;

interface CoverageCounts {
  fixturesWithCoverage: number;
  lineupRowsSeen: number;
  validPlayerRows: number;
  excludedIncompleteRows: number;
  starterRows: number;
  minimumStarterRows: number | null;
  maximumStarterRows: number | null;
}

interface CoverageFailure extends JsonRecord {
  fixtureId: number;
  errorCode: string;
}

export interface TwoSeasonCoverageAuditEvidence {
  readonly schemaVersion: 1;
  readonly provider: "sportsmonks";
  readonly mode: "read_only_two_season_historical_fixture_coverage_audit";
  readonly expectedCommit: string;
  readonly observedAt: string;
  readonly providerPayloadIncluded: false;
  readonly supabaseAccess: false;
  readonly databaseWrites: false;
  readonly requestedSeasonIds: readonly [26027, 24319];
  readonly expectedFixturesPerSeason: 240;
  readonly diagnosticOf: {
    readonly runId: 30767752509;
    readonly artifactId: 8839509446;
    readonly artifactSha256: "97b3db1a6542a0316958841a4ce2238ba03c313d3997706b498ec627e04387b0";
    readonly fixtureId: 19489216;
    readonly failedInvariant: "starter_rows_mismatch";
  };
  readonly requestCount: number;
  readonly fixturesAudited: number;
  readonly failedFixtures: number;
  readonly seasons: ReadonlyArray<{
    readonly id: number;
    readonly name: string;
    readonly fixturesDiscovered: number;
    readonly fixtureIdsSha256: string;
    readonly requests: number;
    readonly counts: CoverageCounts;
    readonly failedFixtures: number;
    readonly failures: readonly CoverageFailure[];
  }>;
  readonly verdict: "pass" | "fail";
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
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new SportsMonksProbeError(code);
  }
  return value;
}

function nonNegativeInteger(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new SportsMonksProbeError(code);
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function paginationHasMore(value: JsonRecord): boolean {
  const pagination = record(value.pagination, "invalid_coverage_audit_pagination");
  if (typeof pagination.has_more !== "boolean") {
    throw new SportsMonksProbeError("invalid_coverage_audit_pagination");
  }
  return pagination.has_more;
}

function incompleteRowSummary(fixture: JsonRecord): JsonRecord | null {
  if (!Array.isArray(fixture.lineups)) return null;
  let starterRows = 0;
  let benchRows = 0;
  let unknownTypeRows = 0;
  let rowsWithTeamId = 0;
  for (const value of fixture.lineups) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const row = value as JsonRecord;
    if (row.player_id !== null && row.player_id !== undefined) continue;
    if (row.type_id === 11) starterRows += 1;
    else if (row.type_id === 12) benchRows += 1;
    else unknownTypeRows += 1;
    if (typeof row.team_id === "number" && Number.isSafeInteger(row.team_id) && row.team_id > 0) {
      rowsWithTeamId += 1;
    }
  }
  return { starterRows, benchRows, unknownTypeRows, rowsWithTeamId };
}

function emptyCounts(): CoverageCounts {
  return {
    fixturesWithCoverage: 0,
    lineupRowsSeen: 0,
    validPlayerRows: 0,
    excludedIncompleteRows: 0,
    starterRows: 0,
    minimumStarterRows: null,
    maximumStarterRows: null,
  };
}

function addCoverage(counts: CoverageCounts, coverage: JsonRecord): void {
  const lineupRowsSeen = nonNegativeInteger(
    coverage.lineupRowsSeen,
    "invalid_coverage_audit_lineup_count",
  );
  const validPlayerRows = nonNegativeInteger(
    coverage.validPlayerRows,
    "invalid_coverage_audit_player_count",
  );
  const excludedIncompleteRows = nonNegativeInteger(
    coverage.excludedIncompleteRows,
    "invalid_coverage_audit_excluded_count",
  );
  const starterRows = nonNegativeInteger(
    coverage.starterRows,
    "invalid_coverage_audit_starter_count",
  );
  if (
    lineupRowsSeen > 200 ||
    validPlayerRows + excludedIncompleteRows !== lineupRowsSeen ||
    starterRows > validPlayerRows
  ) {
    throw new SportsMonksProbeError("invalid_coverage_audit_accounting");
  }
  counts.fixturesWithCoverage += 1;
  counts.lineupRowsSeen += lineupRowsSeen;
  counts.validPlayerRows += validPlayerRows;
  counts.excludedIncompleteRows += excludedIncompleteRows;
  counts.starterRows += starterRows;
  counts.minimumStarterRows =
    counts.minimumStarterRows === null
      ? starterRows
      : Math.min(counts.minimumStarterRows, starterRows);
  counts.maximumStarterRows =
    counts.maximumStarterRows === null
      ? starterRows
      : Math.max(counts.maximumStarterRows, starterRows);
}

function normalizedCoverageRecord(
  coverage: Awaited<ReturnType<typeof normalizeHistoricalFixture>>["coverage"],
): JsonRecord {
  return {
    lineupRowsSeen: coverage.lineupRowsSeen,
    validPlayerRows: coverage.validPlayerRows,
    excludedIncompleteRows: coverage.excludedIncompleteRows,
    starterRows: coverage.starterRows,
    teamCount: coverage.teamCount,
    invalidDetailRows: coverage.invalidDetailRows,
  };
}

export async function runTwoSeasonCoverageAudit(
  values: Readonly<Record<string, string | undefined>>,
  dependencies: ProbeDependencies = {},
): Promise<TwoSeasonCoverageAuditEvidence> {
  const token = requireSportsMonksToken(values.SPORTSMONKS_API_TOKEN);
  const expectedCommit = values.EXPECTED_COMMIT ?? "";
  if (!COMMIT_PATTERN.test(expectedCommit)) {
    throw new SportsMonksProbeError("invalid_expected_commit");
  }

  let requestCount = 0;
  const request = async (path: string, query: Readonly<Record<string, string>>) => {
    requestCount += 1;
    return requestSportsMonksJson(path, query, token, dependencies);
  };
  const seasons: TwoSeasonCoverageAuditEvidence["seasons"][number][] = [];

  for (const season of TWO_SEASON_BACKFILL_SCOPE) {
    const seasonRequestStart = requestCount;
    const fixtureIds = new Set<number>();
    for (const window of buildFixtureWindows(season.startingAt, season.endingAt)) {
      for (let page = 1; page <= MAX_PAGES_PER_WINDOW; page += 1) {
        const response = record(
          await request(`${SPORTSMONKS_BASE_PATH}/fixtures/between/${window.from}/${window.to}`, {
            filters: `fixtureLeagues:${BOTOLA_PRO_LEAGUE_ID}`,
            page: String(page),
            per_page: String(PER_PAGE),
            timezone: "UTC",
          }),
          "invalid_coverage_audit_fixtures_response",
        );
        const fixtures = array(response.data, "invalid_coverage_audit_fixtures_data");
        if (fixtures.length > PER_PAGE) {
          throw new SportsMonksProbeError("coverage_audit_page_too_large");
        }
        for (const value of fixtures) {
          const fixture = record(value, "invalid_coverage_audit_fixture");
          const fixtureId = positiveInteger(fixture.id, "invalid_coverage_audit_fixture_id");
          if (
            positiveInteger(fixture.league_id, "invalid_coverage_audit_league_id") !==
              BOTOLA_PRO_LEAGUE_ID ||
            positiveInteger(fixture.season_id, "invalid_coverage_audit_season_id") !== season.id ||
            fixtureIds.has(fixtureId)
          ) {
            throw new SportsMonksProbeError("coverage_audit_fixture_scope_mismatch");
          }
          fixtureIds.add(fixtureId);
        }
        if (!paginationHasMore(response)) break;
        if (fixtures.length < 1 || page === MAX_PAGES_PER_WINDOW) {
          throw new SportsMonksProbeError("coverage_audit_pagination_limit_exceeded");
        }
      }
    }
    if (fixtureIds.size !== EXPECTED_FIXTURES_PER_SEASON) {
      throw new SportsMonksProbeError(`coverage_audit_fixture_count_mismatch_${season.id}`);
    }

    const counts = emptyCounts();
    const failures: CoverageFailure[] = [];
    for (const fixtureId of [...fixtureIds].sort((left, right) => left - right)) {
      const response = record(
        await request(`${SPORTSMONKS_BASE_PATH}/fixtures/${fixtureId}`, {
          include: "lineups.details",
          filters: `lineupDetailTypes:${HISTORICAL_PERFORMANCE_DETAIL_TYPE_IDS.join(",")}`,
        }),
        "invalid_coverage_audit_fixture_response",
      );
      const fixture = record(response.data, "invalid_coverage_audit_fixture_data");
      try {
        const normalized = await normalizeHistoricalFixture(
          { data: fixture },
          fixtureId,
          season.id,
        );
        addCoverage(counts, normalizedCoverageRecord(normalized.coverage));
      } catch (error) {
        if (!(error instanceof HistoricalPerformanceRuntimeError)) {
          throw new SportsMonksProbeError("unexpected_coverage_audit_normalization_failure");
        }
        const errorCode = ERROR_CODE_PATTERN.test(error.code)
          ? error.code
          : "unexpected_coverage_audit_normalization_failure";
        const failure: CoverageFailure = { fixtureId, errorCode };
        if (error.diagnostic) {
          // BG-0011 option B: historical_fixture_anonymous_starters_exceeded carries a narrower
          // diagnostic (anonymousStarterRows/identifiedStarterRows only, no full coverage
          // accounting) since the fixture is quarantined outright, not coverage-mismatched.
          if (error.code === "historical_fixture_coverage_incomplete") {
            addCoverage(counts, error.diagnostic as JsonRecord);
          }
          failure.diagnostic = error.diagnostic;
        }
        const incompleteRows = incompleteRowSummary(fixture);
        if (incompleteRows) failure.incompleteRows = incompleteRows;
        failures.push(failure);
      }
    }

    const sortedFixtureIds = [...fixtureIds].sort((left, right) => left - right);
    seasons.push({
      id: season.id,
      name: season.name,
      fixturesDiscovered: sortedFixtureIds.length,
      fixtureIdsSha256: await sha256(sortedFixtureIds),
      requests: requestCount - seasonRequestStart,
      counts,
      failedFixtures: failures.length,
      failures,
    });
  }

  const fixturesAudited = seasons.reduce((total, season) => total + season.fixturesDiscovered, 0);
  const failedFixtures = seasons.reduce((total, season) => total + season.failedFixtures, 0);
  const evidence: TwoSeasonCoverageAuditEvidence = {
    schemaVersion: 1,
    provider: "sportsmonks",
    mode: "read_only_two_season_historical_fixture_coverage_audit",
    expectedCommit,
    observedAt: (dependencies.now?.() ?? new Date()).toISOString(),
    providerPayloadIncluded: false,
    supabaseAccess: false,
    databaseWrites: false,
    requestedSeasonIds: [26_027, 24_319],
    expectedFixturesPerSeason: 240,
    diagnosticOf: {
      runId: 30_767_752_509,
      artifactId: 8_839_509_446,
      artifactSha256: "97b3db1a6542a0316958841a4ce2238ba03c313d3997706b498ec627e04387b0",
      fixtureId: 19_489_216,
      failedInvariant: "starter_rows_mismatch",
    },
    requestCount,
    fixturesAudited,
    failedFixtures,
    seasons,
    verdict: failedFixtures === 0 ? "pass" : "fail",
  };
  if (JSON.stringify(evidence).includes(token)) {
    throw new SportsMonksProbeError("credential_in_coverage_audit_evidence");
  }
  return evidence;
}

async function writeEvidence(payload: unknown, name: string): Promise<void> {
  const directory = process.env.G7_COVERAGE_AUDIT_EVIDENCE_DIR?.trim();
  if (!directory) throw new SportsMonksProbeError("missing_coverage_audit_evidence_directory");
  const outputPath = resolve(directory, name);
  await Bun.write(outputPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
}

async function main(): Promise<void> {
  const evidence = await runTwoSeasonCoverageAudit(process.env);
  await writeEvidence(evidence, "g7-sportsmonks-two-season-coverage-audit.json");
  if (evidence.verdict === "fail") {
    console.error(
      `SPORTSMONKS_TWO_SEASON_COVERAGE_AUDIT_FAIL failedFixtures=${evidence.failedFixtures}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log("SPORTSMONKS_TWO_SEASON_COVERAGE_AUDIT_PASS");
}

if (import.meta.main) {
  main().catch(async (error: unknown) => {
    const rawCode =
      error instanceof SportsMonksProbeError ? error.code : "unexpected_coverage_audit_failure";
    const errorCode = ERROR_CODE_PATTERN.test(rawCode)
      ? rawCode
      : "unexpected_coverage_audit_failure";
    try {
      await writeEvidence(
        {
          schemaVersion: 1,
          provider: "sportsmonks",
          mode: "read_only_two_season_historical_fixture_coverage_audit",
          expectedCommit: COMMIT_PATTERN.test(process.env.EXPECTED_COMMIT ?? "")
            ? process.env.EXPECTED_COMMIT
            : null,
          providerPayloadIncluded: false,
          supabaseAccess: false,
          databaseWrites: false,
          requestedSeasonIds: [26_027, 24_319],
          diagnosticOf: {
            runId: 30_767_752_509,
            artifactId: 8_839_509_446,
            artifactSha256: "97b3db1a6542a0316958841a4ce2238ba03c313d3997706b498ec627e04387b0",
            fixtureId: 19_489_216,
            failedInvariant: "starter_rows_mismatch",
          },
          errorCode,
          verdict: "fail",
        },
        "g7-sportsmonks-two-season-coverage-audit-failure.json",
      );
    } catch {
      // The provider failure remains authoritative if evidence writing also fails.
    }
    console.error(`SPORTSMONKS_TWO_SEASON_COVERAGE_AUDIT_FAIL code=${errorCode}`);
    process.exitCode = 1;
  });
}
