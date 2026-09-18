import { describe, expect, it } from "bun:test";

import { BOTOLA_PRO_LEAGUE_ID, type ProbeDependencies } from "./sportsmonks-production-probe";
import {
  HISTORICAL_PERFORMANCE_COVERAGE_FAILURE_CODES,
  HISTORICAL_PERFORMANCE_FIXTURES,
  HISTORICAL_PERFORMANCE_INVARIANT_COUNTERS,
  HISTORICAL_PERFORMANCE_INVARIANT_SEASONS,
  HISTORICAL_PERFORMANCE_PRIOR_RUN_IDS,
  HISTORICAL_PERFORMANCE_REQUEST_ID,
  classifyFixtureInvariants,
  historicalPerformanceFailureEvidence,
  providerKickoff,
  rawLineupCounters,
  runHistoricalPerformanceInvariantProbe,
  runHistoricalPerformanceProbe,
} from "./sportsmonks-historical-performance-probe";
import {
  TWO_SEASON_BACKFILL_SCOPE,
  buildFixtureWindows,
} from "./sportsmonks-two-season-backfill-preflight";

const TOKEN = "sportsmonks-test-token-1234567890";
const COMMIT = "a".repeat(40);
const NOW = new Date("2026-09-18T15:00:00.000Z");
const TICKET_PATH = "docs/production/g7-historical-performance-probe-trigger.json";
const WORKFLOW_PATH = ".github/workflows/g7-sportsmonks-historical-performance-coverage.yml";
const WORKER_PATH = "supabase/functions/_shared/sportsmonks-historical-player-performance.ts";
const HALTING_FIXTURE_ID = 19489216;
const SEASON_ID = 26027;

function fixtureResponse(fixtureId: number, withDetails = true): Response {
  const fixture = HISTORICAL_PERFORMANCE_FIXTURES.find((item) => item.fixtureId === fixtureId);
  if (!fixture) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({
    data: {
      id: fixture.fixtureId,
      league_id: 860,
      season_id: fixture.seasonId,
      lineups: [
        null,
        {
          player_id: null,
          team_id: null,
          position_id: null,
          type_id: null,
          details: [{ type_id: null }],
        },
        {
          player_id: fixture.fixtureId + 1,
          team_id: 100,
          position_id: null,
          type_id: 11,
          details: withDetails
            ? [
                { type_id: 118, data: { value: 7.5 } },
                { type_id: 119, data: { value: 90 } },
              ]
            : [],
        },
        {
          player_id: fixture.fixtureId + 2,
          team_id: 200,
          position_id: 27,
          type_id: 12,
          details: [],
        },
      ],
      events: [{ type_id: 14, player_id: fixture.fixtureId + 1 }],
    },
  });
}

interface LineupShape {
  readonly valid: number;
  readonly starters: number;
  /** Rows without player_id that the provider declares as starters (type_id 11). */
  readonly incomplete?: number;
  /** Rows without player_id that the provider declares as substitutes (type_id 12). */
  readonly anonymousSubstitutes?: number;
  /** Identity hints copied onto every row without player_id. */
  readonly anonymousHint?: { readonly player_name?: string; readonly jersey_number?: number };
  readonly teams?: number;
  readonly badDetail?: boolean;
}

/** Build a worker-shaped fixture payload with exactly the requested lineup counts. */
function lineupPayload(fixtureId: number, seasonId: number, shape: LineupShape) {
  const teams = shape.teams ?? 2;
  const lineups: unknown[] = [];
  for (let index = 0; index < shape.valid; index += 1) {
    const started = index < shape.starters;
    lineups.push({
      player_id: fixtureId * 1_000 + index + 1,
      team_id: 500 + (index % teams),
      type_id: started ? 11 : 12,
      details: [
        { type_id: 119, data: { value: started ? 90 : 0 } },
        { type_id: 118, data: { value: shape.badDetail && index === 0 ? -1 : 6.5 } },
      ],
    });
  }
  for (let index = 0; index < (shape.incomplete ?? 0); index += 1) {
    lineups.push({
      player_id: null,
      team_id: 500,
      type_id: 11,
      details: [],
      ...shape.anonymousHint,
    });
  }
  for (let index = 0; index < (shape.anonymousSubstitutes ?? 0); index += 1) {
    lineups.push({
      player_id: null,
      team_id: 501,
      type_id: 12,
      details: [],
      ...shape.anonymousHint,
    });
  }
  return { data: { id: fixtureId, league_id: BOTOLA_PRO_LEAGUE_ID, season_id: seasonId, lineups } };
}

const INVARIANT_ROW_KEYS = [
  "anonymousRowsWithNameOrJersey",
  "anonymousRowsWithTeamId",
  "anonymousStarterRows",
  "anonymousSubstituteRows",
  "enumerated",
  "excludedIncompleteRows",
  "failures",
  "fixtureId",
  "identityTolerantPass",
  "invalidDetailRows",
  "kickoff",
  "lineupRows",
  "pass",
  "rawStarterRows",
  "rawSubstituteRows",
  "seasonId",
  "starterRows",
  "teamCount",
  "validPlayerRows",
].sort();

/** The Python dict literal embedded in the workflow's ticket-verification step, as JSON. */
async function workflowExpectedTicket(): Promise<unknown> {
  const workflow = await Bun.file(WORKFLOW_PATH).text();
  const match = /expected = (\{[\s\S]*?\n\s*\})\n\s*path = Path\(/.exec(workflow);
  if (!match) throw new Error("workflow expected ticket literal not found");
  const json = match[1]
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/\bNone\b/g, "null")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(json) as unknown;
}

const SEASON_SCOPE = TWO_SEASON_BACKFILL_SCOPE.find((season) => season.id === SEASON_ID)!;
const SEASON_WINDOWS = buildFixtureWindows(SEASON_SCOPE.startingAt, SEASON_SCOPE.endingAt);
// 240 provider ids covering every reviewed 26027 ticket fixture, including 19489216.
const SEASON_FIXTURE_IDS = [
  ...Array.from({ length: 238 }, (_, index) => 19489210 + index),
  19662879,
  19734478,
];

interface InvariantFetchOptions {
  readonly omitFromListing?: readonly number[];
  readonly payloadFor?: (fixtureId: number) => unknown;
}

function invariantFetcher(
  requests: URL[],
  options: InvariantFetchOptions = {},
): NonNullable<ProbeDependencies["fetch"]> {
  const listed = SEASON_FIXTURE_IDS.filter((id) => !(options.omitFromListing ?? []).includes(id));
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("Authorization")).toBe(TOKEN);
    expect(url.href).not.toContain(TOKEN);
    requests.push(url);

    if (url.pathname.startsWith("/v3/football/fixtures/between/")) {
      const [, from, to] = url.pathname.match(/fixtures\/between\/([^/]+)\/([^/]+)$/) ?? [];
      const windowIndex = SEASON_WINDOWS.findIndex(
        (window) => window.from === from && window.to === to,
      );
      expect(windowIndex).toBeGreaterThanOrEqual(0);
      expect(url.searchParams.get("filters")).toBe("fixtureLeagues:860");
      expect(url.searchParams.get("per_page")).toBe("50");
      expect(url.searchParams.get("timezone")).toBe("UTC");
      const page = Number(url.searchParams.get("page"));
      const perWindow = Math.ceil(listed.length / SEASON_WINDOWS.length);
      const windowIds = listed.slice(windowIndex * perWindow, (windowIndex + 1) * perWindow);
      const pageIds = windowIds.slice((page - 1) * 50, page * 50);
      return Response.json({
        data: pageIds.map((id) => ({
          id,
          league_id: BOTOLA_PRO_LEAGUE_ID,
          season_id: SEASON_ID,
          starting_at: id === HALTING_FIXTURE_ID ? "2025-09-12 17:00:00" : "2025-10-01 19:00:00",
        })),
        pagination: { has_more: page * 50 < windowIds.length },
      });
    }

    const fixtureId = Number(url.pathname.split("/").at(-1));
    if (url.searchParams.get("include") === "lineups.details;events") {
      return fixtureResponse(fixtureId);
    }
    expect(url.searchParams.get("include")).toBe("lineups.details");
    expect(url.searchParams.get("filters")).toBe(
      "lineupDetailTypes:52,57,79,83,84,85,88,112,113,118,119,194,324",
    );
    const payload =
      options.payloadFor?.(fixtureId) ??
      lineupPayload(fixtureId, SEASON_ID, {
        valid: fixtureId === HALTING_FIXTURE_ID ? 39 : 40,
        starters: fixtureId === HALTING_FIXTURE_ID ? 21 : 22,
        incomplete: fixtureId === HALTING_FIXTURE_ID ? 1 : 0,
      });
    return Response.json(payload);
  };
}

describe("SportsMonks historical performance coverage probe", () => {
  it("keeps the reviewed ticket, the workflow's embedded copy and the probe constants identical", async () => {
    const ticket = (await Bun.file(TICKET_PATH).json()) as Record<string, unknown>;
    expect(await workflowExpectedTicket()).toEqual(ticket);
    expect(ticket).toEqual({
      schemaVersion: 1,
      requestId: HISTORICAL_PERFORMANCE_REQUEST_ID,
      repairsRuns: [
        {
          runId: HISTORICAL_PERFORMANCE_PRIOR_RUN_IDS[0],
          headSha: "21fb29e6224db136dda91430b53686360fc2f4e4",
          artifactId: 8835025623,
          artifactSha256: "8536a83be03a506bcd6cd67769a0865ea7043e3c60a2b14d4d92c4b1b179b6bc",
          errorCode: "invalid_lineup_position_id",
        },
        {
          runId: HISTORICAL_PERFORMANCE_PRIOR_RUN_IDS[1],
          headSha: "713f6914725d772c51d3026a49bb628c0119e08a",
          artifactId: 8835206440,
          artifactSha256: "a29ca84d999558ea373ff3520d45eb948ae56ec57e326e9b6f48519561235bd2",
          errorCode: "invalid_lineup_player_id",
        },
      ],
      mode: "read_only_historical_player_performance_coverage",
      leagueId: 860,
      fixtures: HISTORICAL_PERFORMANCE_FIXTURES.map((fixture) => ({ ...fixture })),
      invariantSeasons: [...HISTORICAL_PERFORMANCE_INVARIANT_SEASONS],
      invariantCounters: HISTORICAL_PERFORMANCE_INVARIANT_COUNTERS,
      confirmation: "RUN_G7_HISTORICAL_PERFORMANCE_PROBE_CLASSIFY",
    });
    expect(HISTORICAL_PERFORMANCE_REQUEST_ID).toBe(
      "g7-historical-performance-coverage-2026-09-18-02",
    );
    expect(HISTORICAL_PERFORMANCE_INVARIANT_COUNTERS).toBe("anonymous-starters-v1");
    expect(HISTORICAL_PERFORMANCE_FIXTURES).toContainEqual({
      seasonId: SEASON_ID,
      fixtureId: HALTING_FIXTURE_ID,
    });

    const workflow = await Bun.file(WORKFLOW_PATH).text();
    expect(workflow).toContain("RUN_G7_HISTORICAL_PERFORMANCE_PROBE_CLASSIFY");
    expect(workflow).toContain("GITHUB_WORKFLOW_RERUN_FORBIDDEN");
    expect(workflow).toContain("sportsmonks-historical-performance-invariants.json");
    expect(workflow).toContain("HALTING_FIXTURE_NOT_CLASSIFIED");
    expect(workflow).toContain("rawStarterExactly22");
    expect(workflow).toContain("identityTolerantPassing");
    expect(workflow).toContain("anonymousStarterHistogram");
  });

  it("lists exactly the coverage failure codes the edge worker emits", async () => {
    const worker = await Bun.file(WORKER_PATH).text();
    const emitted = [...worker.matchAll(/coverageFailures\.push\("([a-z_]+)"\)/g)].map(
      (match) => match[1],
    );
    expect(emitted).toEqual([...HISTORICAL_PERFORMANCE_COVERAGE_FAILURE_CODES]);
  });

  it("uses seven fixed read-only requests and records only aggregate coverage", async () => {
    const requests: URL[] = [];
    const evidence = await runHistoricalPerformanceProbe(
      { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
      {
        now: () => NOW,
        fetch: async (input, init) => {
          const url = new URL(input instanceof Request ? input.url : input.toString());
          requests.push(url);
          expect(init?.method).toBe("GET");
          expect(new Headers(init?.headers).get("Authorization")).toBe(TOKEN);
          expect(url.searchParams.get("include")).toBe("lineups.details;events");
          const fixtureId = Number(url.pathname.split("/").at(-1));
          return fixtureResponse(fixtureId);
        },
      },
    );

    expect(requests).toHaveLength(7);
    expect(requests.map((url) => Number(url.pathname.split("/").at(-1)))).toEqual(
      HISTORICAL_PERFORMANCE_FIXTURES.map((fixture) => fixture.fixtureId),
    );
    expect(evidence).toMatchObject({
      schemaVersion: 1,
      requestId: HISTORICAL_PERFORMANCE_REQUEST_ID,
      repairsRunIds: HISTORICAL_PERFORMANCE_PRIOR_RUN_IDS,
      provider: "sportsmonks",
      mode: "read_only_historical_player_performance_coverage",
      expectedCommit: COMMIT,
      leagueId: 860,
      requestCount: 7,
      usableForPreseasonDerivation: true,
      verdict: "pass",
      seasons: [
        {
          seasonId: 26027,
          sampledFixtures: 4,
          fixturesWithLineups: 4,
          fixturesWithPlayerDetails: 4,
          fixturesWithFantasyDetails: 4,
          totalLineups: 16,
          totalPlayerLineups: 8,
          totalIncompleteLineups: 8,
          totalDetails: 8,
          totalInvalidDetails: 4,
          totalEvents: 4,
          usableForPreseasonDerivation: true,
        },
        {
          seasonId: 24319,
          sampledFixtures: 3,
          fixturesWithLineups: 3,
          fixturesWithPlayerDetails: 3,
          fixturesWithFantasyDetails: 3,
          usableForPreseasonDerivation: true,
        },
      ],
    });
    expect(JSON.stringify(evidence)).not.toContain(TOKEN);
    expect(JSON.stringify(evidence)).not.toContain("player_id");
  });

  it("reports unavailable detail coverage without pretending the probe failed", async () => {
    const evidence = await runHistoricalPerformanceProbe(
      { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
      {
        now: () => NOW,
        fetch: async (input) => {
          const url = new URL(input instanceof Request ? input.url : input.toString());
          return fixtureResponse(Number(url.pathname.split("/").at(-1)), false);
        },
      },
    );
    expect(evidence.usableForPreseasonDerivation).toBe(false);
    expect(evidence.seasons[0]).toMatchObject({
      fixturesWithLineups: 4,
      fixturesWithPlayerDetails: 0,
      fixturesWithFantasyDetails: 0,
      usableForPreseasonDerivation: false,
    });
  });

  it("classifies malformed optional collections instead of crashing", async () => {
    const evidence = await runHistoricalPerformanceProbe(
      { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
      {
        now: () => NOW,
        fetch: async (input) => {
          const url = new URL(input instanceof Request ? input.url : input.toString());
          const fixtureId = Number(url.pathname.split("/").at(-1));
          const response = await fixtureResponse(fixtureId).json();
          return Response.json({
            ...response,
            data: {
              ...(response as { data: object }).data,
              lineups: { legacy: true },
              events: { legacy: true },
            },
          });
        },
      },
    );

    expect(evidence.usableForPreseasonDerivation).toBe(false);
    expect(evidence.seasons[0].fixtures[0]).toMatchObject({
      lineupCollectionValid: false,
      eventCollectionValid: false,
      lineupCount: 0,
      invalidEventCount: 1,
    });
  });

  it("fails closed when a provider fixture escapes its reviewed season", async () => {
    await expect(
      runHistoricalPerformanceProbe(
        { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
        {
          now: () => NOW,
          fetch: async (input) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            const fixtureId = Number(url.pathname.split("/").at(-1));
            const response = await fixtureResponse(fixtureId).json();
            return Response.json({
              ...response,
              data: { ...(response as { data: object }).data, season_id: 99999 },
            });
          },
        },
      ),
    ).rejects.toThrow("fixture_scope_mismatch");
  });

  it("creates bounded sanitized failure evidence", () => {
    const evidence = historicalPerformanceFailureEvidence(
      new Error(`${TOKEN}: provider exploded`),
      COMMIT,
      NOW,
    );
    expect(evidence).toEqual({
      schemaVersion: 1,
      requestId: HISTORICAL_PERFORMANCE_REQUEST_ID,
      repairsRunIds: HISTORICAL_PERFORMANCE_PRIOR_RUN_IDS,
      provider: "sportsmonks",
      mode: "read_only_historical_player_performance_coverage",
      expectedCommit: COMMIT,
      observedAt: NOW.toISOString(),
      verdict: "fail",
      errorCode: "unexpected_historical_performance_probe_failure",
    });
    expect(JSON.stringify(evidence)).not.toContain(TOKEN);
  });
});

describe("SportsMonks historical performance coverage invariants", () => {
  const classify = (shape: LineupShape) =>
    classifyFixtureInvariants(lineupPayload(1, SEASON_ID, shape), 1, SEASON_ID, null, true);

  it("passes a fixture the worker would ingest", async () => {
    await expect(classify({ valid: 40, starters: 22 })).resolves.toEqual({
      fixtureId: 1,
      seasonId: SEASON_ID,
      kickoff: null,
      enumerated: true,
      lineupRows: 40,
      validPlayerRows: 40,
      excludedIncompleteRows: 0,
      starterRows: 22,
      teamCount: 2,
      invalidDetailRows: 0,
      failures: [],
      pass: true,
      rawStarterRows: 22,
      rawSubstituteRows: 18,
      anonymousStarterRows: 0,
      anonymousSubstituteRows: 0,
      anonymousRowsWithTeamId: 0,
      anonymousRowsWithNameOrJersey: 0,
      identityTolerantPass: true,
    });
  });

  it("tells provider-declared starters apart from identified ones (19489216 shape)", async () => {
    // 22 declared starters + 18 declared substitutes; one starter and one substitute lack player_id.
    const row = await classify({ valid: 38, starters: 21, incomplete: 1, anonymousSubstitutes: 1 });
    expect(row).toEqual({
      fixtureId: 1,
      seasonId: SEASON_ID,
      kickoff: null,
      enumerated: true,
      lineupRows: 40,
      validPlayerRows: 38,
      excludedIncompleteRows: 2,
      starterRows: 21,
      teamCount: 2,
      invalidDetailRows: 0,
      failures: ["starter_rows_mismatch"],
      pass: false,
      rawStarterRows: 22,
      rawSubstituteRows: 18,
      anonymousStarterRows: 1,
      anonymousSubstituteRows: 1,
      anonymousRowsWithTeamId: 2,
      anonymousRowsWithNameOrJersey: 0,
      identityTolerantPass: true,
    });
  });

  it("does not read a fixture with five anonymous starters as identity-tolerant", async () => {
    const row = await classify({ valid: 35, starters: 17, incomplete: 5 });
    expect(row).toMatchObject({
      starterRows: 17,
      failures: ["starter_rows_mismatch"],
      pass: false,
      rawStarterRows: 22,
      anonymousStarterRows: 5,
      anonymousSubstituteRows: 0,
      identityTolerantPass: false,
    });
    // Exactly four anonymous starters is the cap and still reads as tolerant.
    await expect(classify({ valid: 36, starters: 18, incomplete: 4 })).resolves.toMatchObject({
      rawStarterRows: 22,
      anonymousStarterRows: 4,
      identityTolerantPass: true,
    });
  });

  it("keeps the identity-tolerant reading false when any other invariant fails", async () => {
    await expect(classify({ valid: 40, starters: 22, teams: 3 })).resolves.toMatchObject({
      rawStarterRows: 22,
      anonymousStarterRows: 0,
      failures: ["team_count_mismatch"],
      identityTolerantPass: false,
    });
    // 21 declared starters: the provider itself is short, not merely anonymous.
    await expect(classify({ valid: 40, starters: 21 })).resolves.toMatchObject({
      rawStarterRows: 21,
      rawSubstituteRows: 19,
      anonymousStarterRows: 0,
      identityTolerantPass: false,
    });
  });

  it("counts anonymous identity hints without copying names or jerseys into the evidence", async () => {
    const row = await classify({
      valid: 38,
      starters: 21,
      incomplete: 1,
      anonymousSubstitutes: 1,
      anonymousHint: { player_name: "Ghost Starter", jersey_number: 77 },
    });
    expect(row).toMatchObject({
      anonymousStarterRows: 1,
      anonymousSubstituteRows: 1,
      anonymousRowsWithTeamId: 2,
      anonymousRowsWithNameOrJersey: 2,
      identityTolerantPass: true,
    });
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("Ghost");
    expect(serialized).not.toContain("77");
    expect(serialized).not.toContain("player_name");
    expect(serialized).not.toContain("jersey_number");
    expect(Object.keys(row).sort()).toEqual(INVARIANT_ROW_KEYS);

    // Blank hints are not identity hints.
    expect(
      rawLineupCounters(
        lineupPayload(1, SEASON_ID, {
          valid: 38,
          starters: 21,
          incomplete: 1,
          anonymousSubstitutes: 1,
          anonymousHint: { player_name: "  " },
        }),
      ).anonymousRowsWithNameOrJersey,
    ).toBe(0);
  });

  it("returns null raw counters when the payload carries no lineup array", () => {
    expect(rawLineupCounters({ data: { id: 1, lineups: { legacy: true } } })).toEqual({
      rawStarterRows: null,
      rawSubstituteRows: null,
      anonymousStarterRows: null,
      anonymousSubstituteRows: null,
      anonymousRowsWithTeamId: null,
      anonymousRowsWithNameOrJersey: null,
    });
    expect(rawLineupCounters(null).rawStarterRows).toBeNull();
    // Non-record rows and rows without a team id are counted like the worker sees them.
    expect(
      rawLineupCounters({
        data: { lineups: [null, { player_id: null, type_id: 11 }, { player_id: 7, type_id: 12 }] },
      }),
    ).toEqual({
      rawStarterRows: 1,
      rawSubstituteRows: 1,
      anonymousStarterRows: 1,
      anonymousSubstituteRows: 0,
      anonymousRowsWithTeamId: 0,
      anonymousRowsWithNameOrJersey: 0,
    });
  });

  it("names lineup_rows_out_of_range when the lineup list exceeds 100 rows", async () => {
    const row = await classify({ valid: 100, starters: 22, incomplete: 1 });
    expect(row).toMatchObject({
      lineupRows: 101,
      validPlayerRows: 100,
      excludedIncompleteRows: 1,
      failures: ["lineup_rows_out_of_range"],
      pass: false,
    });
  });

  it("names valid_player_rows_out_of_range when fewer than 22 rows carry a player id", async () => {
    const row = await classify({ valid: 21, starters: 21, incomplete: 19 });
    expect(row).toMatchObject({
      lineupRows: 40,
      validPlayerRows: 21,
      excludedIncompleteRows: 19,
      starterRows: 21,
      failures: ["valid_player_rows_out_of_range", "starter_rows_mismatch"],
      pass: false,
    });
  });

  it("names incomplete_rows_limit_exceeded above 20 incomplete rows", async () => {
    const row = await classify({ valid: 44, starters: 22, incomplete: 21 });
    expect(row).toMatchObject({
      lineupRows: 65,
      validPlayerRows: 44,
      excludedIncompleteRows: 21,
      starterRows: 22,
      failures: ["incomplete_rows_limit_exceeded"],
      pass: false,
    });
  });

  it("names starter_rows_mismatch when the two lineups do not expose 22 starters", async () => {
    const row = await classify({ valid: 40, starters: 21 });
    expect(row).toMatchObject({
      lineupRows: 40,
      validPlayerRows: 40,
      starterRows: 21,
      teamCount: 2,
      failures: ["starter_rows_mismatch"],
      pass: false,
    });
  });

  it("names team_count_mismatch when the rows span more than two teams", async () => {
    const row = await classify({ valid: 40, starters: 22, teams: 3 });
    expect(row).toMatchObject({
      teamCount: 3,
      failures: ["team_count_mismatch"],
      pass: false,
    });
  });

  it("records the worker's row-level abort code when a detail is invalid", async () => {
    // The worker rethrows on the first invalid detail, so invalid_detail_rows_present
    // is never reached; the fixture is still classified as failing under the abort code.
    const row = await classify({ valid: 40, starters: 22, badDetail: true });
    expect(row).toEqual({
      fixtureId: 1,
      seasonId: SEASON_ID,
      kickoff: null,
      enumerated: true,
      lineupRows: null,
      validPlayerRows: null,
      excludedIncompleteRows: null,
      starterRows: null,
      teamCount: null,
      invalidDetailRows: null,
      failures: ["invalid_provider_detail"],
      pass: false,
      // The raw pass does not depend on the worker's abort; the abort code keeps the tolerant reading false.
      rawStarterRows: 22,
      rawSubstituteRows: 18,
      anonymousStarterRows: 0,
      anonymousSubstituteRows: 0,
      anonymousRowsWithTeamId: 0,
      anonymousRowsWithNameOrJersey: 0,
      identityTolerantPass: false,
    });
  });

  it("records fixture_scope_mismatch as a failing row rather than aborting the season", async () => {
    const row = await classifyFixtureInvariants(
      lineupPayload(1, 99_999, { valid: 40, starters: 22 }),
      1,
      SEASON_ID,
      null,
      true,
    );
    expect(row).toMatchObject({
      failures: ["fixture_scope_mismatch"],
      pass: false,
      rawStarterRows: 22,
      identityTolerantPass: false,
    });
  });

  it("normalizes provider kickoff strings and rejects anything else", () => {
    expect(providerKickoff("2025-09-12 17:00:00")).toBe("2025-09-12T17:00:00.000Z");
    expect(providerKickoff("2025-09-12T17:00:00Z")).toBeNull();
    expect(providerKickoff(1_757_696_400)).toBeNull();
    expect(providerKickoff(undefined)).toBeNull();
  });

  it("enumerates all 240 season fixtures with the worker's includes and names the halting invariant", async () => {
    const requests: URL[] = [];
    const evidence = await runHistoricalPerformanceInvariantProbe(
      { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
      { fetch: invariantFetcher(requests), now: () => NOW },
    );

    const listingRequests = requests.filter((url) => url.pathname.includes("/fixtures/between/"));
    expect(listingRequests).toHaveLength(SEASON_WINDOWS.length * 2);
    expect(requests).toHaveLength(SEASON_WINDOWS.length * 2 + 240);
    expect(evidence).toMatchObject({
      schemaVersion: 1,
      requestId: HISTORICAL_PERFORMANCE_REQUEST_ID,
      provider: "sportsmonks",
      mode: "read_only_historical_player_performance_invariants",
      expectedCommit: COMMIT,
      observedAt: NOW.toISOString(),
      leagueId: 860,
      providerPayloadIncluded: false,
      invariantCounters: "anonymous-starters-v1",
      coverageFailureCodes: [...HISTORICAL_PERFORMANCE_COVERAGE_FAILURE_CODES],
      requestCount: SEASON_WINDOWS.length * 2 + 240,
      fixtures: 240,
      passing: 239,
      failing: 1,
      verdict: "pass",
    });
    expect(evidence.seasons).toHaveLength(1);
    const season = evidence.seasons[0];
    expect(season).toMatchObject({
      seasonId: SEASON_ID,
      expectedFixtures: 240,
      fixturesEnumerated: 240,
      enumerationComplete: true,
      pinnedFixtureIds: [19489211, 19489216, 19662879, 19734478],
      requests: SEASON_WINDOWS.length * 2 + 240,
      fixtures: 240,
      passing: 239,
      failing: 1,
      failuresByCode: {
        lineup_rows_out_of_range: 0,
        valid_player_rows_out_of_range: 0,
        incomplete_rows_limit_exceeded: 0,
        starter_rows_mismatch: 1,
        team_count_mismatch: 0,
        invalid_detail_rows_present: 0,
      },
      rawStarterExactly22: 240,
      identityTolerantPassing: 240,
      anonymousStarterHistogram: { "0": 239, "1": 1 },
    });
    expect(season.rows).toHaveLength(240);
    expect(season.rows.map((row) => row.fixtureId)).toEqual(SEASON_FIXTURE_IDS);
    expect(season.rows.find((row) => row.fixtureId === HALTING_FIXTURE_ID)).toEqual({
      fixtureId: HALTING_FIXTURE_ID,
      seasonId: SEASON_ID,
      kickoff: "2025-09-12T17:00:00.000Z",
      enumerated: true,
      lineupRows: 40,
      validPlayerRows: 39,
      excludedIncompleteRows: 1,
      starterRows: 21,
      teamCount: 2,
      invalidDetailRows: 0,
      failures: ["starter_rows_mismatch"],
      pass: false,
      rawStarterRows: 22,
      rawSubstituteRows: 18,
      anonymousStarterRows: 1,
      anonymousSubstituteRows: 0,
      anonymousRowsWithTeamId: 1,
      anonymousRowsWithNameOrJersey: 0,
      identityTolerantPass: true,
    });

    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain("player_id");
    expect(serialized).not.toContain("player_name");
    expect(serialized).not.toContain("jersey_number");
    expect(serialized).not.toContain("details");
    for (const row of season.rows) {
      expect(Object.keys(row).sort()).toEqual(INVARIANT_ROW_KEYS);
    }
  });

  it("still classifies fixture 19489216 when the season enumeration is partial", async () => {
    const requests: URL[] = [];
    const evidence = await runHistoricalPerformanceInvariantProbe(
      { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
      {
        fetch: invariantFetcher(requests, { omitFromListing: [HALTING_FIXTURE_ID, 19489300] }),
        now: () => NOW,
      },
    );
    const season = evidence.seasons[0];
    expect(season).toMatchObject({
      fixturesEnumerated: 238,
      enumerationComplete: false,
      fixtures: 239,
      passing: 238,
      failing: 1,
    });
    expect(season.rows.find((row) => row.fixtureId === HALTING_FIXTURE_ID)).toMatchObject({
      enumerated: false,
      kickoff: null,
      failures: ["starter_rows_mismatch"],
      pass: false,
    });
    expect(season.rows.some((row) => row.fixtureId === 19489300)).toBe(false);
  });

  it("aggregates every failure code across the season", async () => {
    const shapes = new Map<number, LineupShape>([
      [19489210, { valid: 100, starters: 22, incomplete: 1 }],
      [19489211, { valid: 21, starters: 21, incomplete: 19 }],
      [19489212, { valid: 44, starters: 22, incomplete: 21 }],
      [19489213, { valid: 40, starters: 22, teams: 3 }],
      [19489214, { valid: 40, starters: 22, badDetail: true }],
    ]);
    const evidence = await runHistoricalPerformanceInvariantProbe(
      { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
      {
        fetch: invariantFetcher([], {
          payloadFor: (fixtureId) => {
            const shape = shapes.get(fixtureId);
            return shape ? lineupPayload(fixtureId, SEASON_ID, shape) : undefined;
          },
        }),
        now: () => NOW,
      },
    );
    expect(evidence.seasons[0]).toMatchObject({
      fixtures: 240,
      passing: 234,
      failing: 6,
      failuresByCode: {
        lineup_rows_out_of_range: 1,
        valid_player_rows_out_of_range: 1,
        incomplete_rows_limit_exceeded: 1,
        starter_rows_mismatch: 2,
        team_count_mismatch: 1,
        invalid_detail_rows_present: 0,
        invalid_provider_detail: 1,
      },
      // 19489210/11/12 declare 23/40/43 starters; the halting fixture (1 anonymous starter)
      // and the 234 clean fixtures read as tolerant; every other failing row fails another code.
      rawStarterExactly22: 237,
      identityTolerantPassing: 235,
      anonymousStarterHistogram: { "0": 236, "1": 2, "19": 1, "21": 1 },
    });
  });

  it("fails closed when the season listing escapes its scope", async () => {
    await expect(
      runHistoricalPerformanceInvariantProbe(
        { SPORTSMONKS_API_TOKEN: TOKEN, EXPECTED_COMMIT: COMMIT },
        {
          fetch: async (input) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            if (url.pathname.includes("/fixtures/between/")) {
              return Response.json({
                data: [{ id: 1, league_id: BOTOLA_PRO_LEAGUE_ID, season_id: 24319 }],
                pagination: { has_more: false },
              });
            }
            return Response.json({});
          },
        },
      ),
    ).rejects.toThrow("season_fixture_scope_mismatch");
  });
});
