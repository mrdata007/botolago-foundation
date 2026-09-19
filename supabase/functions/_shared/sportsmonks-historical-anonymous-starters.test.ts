import { describe, expect, it } from "bun:test";

import {
  HistoricalPerformanceRuntimeError,
  MAX_ANONYMOUS_STARTER_ROWS,
  handleSportsMonksHistoricalPlayerPerformanceRequest,
  normalizeHistoricalFixture,
  type HistoricalPerformanceRpcClient,
} from "./sportsmonks-historical-player-performance";

// BG-0011 option B regression tests.
//
// Rule under test: the SportsMonks provider always reports exactly 22 raw starter rows
// (type_id 11) per completed fixture. Some of those rows lack a player_id ("anonymous").
// Up to MAX_ANONYMOUS_STARTER_ROWS (4) anonymous starters are tolerated on the historical
// ingestion path; more than that and the whole fixture must be quarantined (none of its rows
// used, not even identified ones). This file exercises the pure normalization function only —
// it does not touch a database, so it cannot exercise mapping-quarantine (case f) or ingestion
// idempotency (case h) end to end; those require the DB-level RPCs and are covered (but, per the
// implementation report, NOT executed against a live Postgres in this sandbox) by
// supabase/tests/database/historical_player_performances.test.sql.

const FIXTURE_ID = 19_596_474;
const SEASON_ID = 26_027;

function baseLineup(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1_000 + index,
    fixture_id: FIXTURE_ID,
    player_id: 10_000 + index,
    team_id: index < 11 ? 500 : 600,
    type_id: index < 22 ? 11 : 12,
    details: [
      { type_id: 119, data: { value: 90 } },
      { type_id: 118, data: { value: 6.8 } },
    ],
    ...overrides,
  };
}

/**
 * Builds a fixture payload with exactly 22 raw starters (type_id 11) and `benchCount`
 * substitutes, where `anonymousStarterCount` of the 22 starters carry no player_id
 * (matching the real SportsMonks shape: the provider still sends the row, minus player_id).
 */
function fixtureWithAnonymousStarters(
  anonymousStarterCount: number,
  benchCount = 5,
  fixtureId = FIXTURE_ID,
): Record<string, unknown> {
  const lineups: Record<string, unknown>[] = [];
  for (let index = 0; index < 22; index += 1) {
    const anonymous = index < anonymousStarterCount;
    lineups.push(
      baseLineup(index, anonymous ? { player_id: null, team_id: null } : {}),
    );
  }
  for (let index = 0; index < benchCount; index += 1) {
    lineups.push(baseLineup(22 + index));
  }
  return {
    data: {
      id: fixtureId,
      league_id: 860,
      season_id: SEASON_ID,
      lineups,
    },
  };
}

function withTeamCount(count: 1 | 3): Record<string, unknown> {
  const payload = fixtureWithAnonymousStarters(0, 5) as { data: Record<string, unknown> };
  const lineups = payload.data.lineups as Array<Record<string, unknown>>;
  if (count === 1) {
    for (const row of lineups) row.team_id = 500;
  } else {
    lineups[0]!.team_id = 700;
  }
  return payload;
}

function withDuplicatePlayer(): Record<string, unknown> {
  const payload = fixtureWithAnonymousStarters(0, 5) as { data: Record<string, unknown> };
  const lineups = payload.data.lineups as Array<Record<string, unknown>>;
  lineups[1]!.player_id = lineups[0]!.player_id;
  return payload;
}

describe("BG-0011 option B: bounded anonymous starters (historical ingestion path)", () => {
  it("(a) 0 anonymous starters — baseline still passes", async () => {
    const normalized = await normalizeHistoricalFixture(
      fixtureWithAnonymousStarters(0),
      FIXTURE_ID,
      SEASON_ID,
    );
    expect(normalized.coverage.anonymousStarterRows).toBe(0);
    expect(normalized.coverage.starterRows).toBe(22);
    expect(normalized.rows).toHaveLength(27);
  });

  it("(b) exactly 4 anonymous starters — boundary, passes", async () => {
    const normalized = await normalizeHistoricalFixture(
      fixtureWithAnonymousStarters(MAX_ANONYMOUS_STARTER_ROWS),
      FIXTURE_ID,
      SEASON_ID,
    );
    expect(normalized.coverage.anonymousStarterRows).toBe(4);
    expect(normalized.coverage.starterRows).toBe(18);
    // Anonymous rows are excluded, never persisted, never assigned to anyone.
    expect(normalized.rows).toHaveLength(27 - 4);
    expect(normalized.rows.some((row) => row.externalPlayerId === "null")).toBe(false);
  });

  it("(c) exactly 5 anonymous starters — boundary, fails/quarantined", async () => {
    await expect(
      normalizeHistoricalFixture(fixtureWithAnonymousStarters(5), FIXTURE_ID, SEASON_ID),
    ).rejects.toMatchObject({
      code: "historical_fixture_anonymous_starters_exceeded",
      diagnostic: { fixtureId: FIXTURE_ID, anonymousStarterRows: 5, identifiedStarterRows: 17 },
    });
  });

  it("(d) invalid raw starter totals (21 raw starters) — still fails, unrelated to this change", async () => {
    const payload = fixtureWithAnonymousStarters(0, 5) as { data: Record<string, unknown> };
    const lineups = payload.data.lineups as Array<Record<string, unknown>>;
    lineups[21]!.type_id = 12; // one fewer raw starter than the provider ever actually sends
    await expect(
      normalizeHistoricalFixture(payload, FIXTURE_ID, SEASON_ID),
    ).rejects.toMatchObject({
      code: "historical_fixture_coverage_incomplete",
      diagnostic: { failures: ["raw_starter_rows_mismatch"] },
    });
  });

  it("(e1) wrong team count — still fails", async () => {
    await expect(
      normalizeHistoricalFixture(withTeamCount(1), FIXTURE_ID, SEASON_ID),
    ).rejects.toMatchObject({
      code: "historical_fixture_coverage_incomplete",
      diagnostic: { failures: ["team_count_mismatch"] },
    });
    await expect(
      normalizeHistoricalFixture(withTeamCount(3), FIXTURE_ID, SEASON_ID),
    ).rejects.toMatchObject({
      code: "historical_fixture_coverage_incomplete",
      diagnostic: { failures: ["team_count_mismatch"] },
    });
  });

  it("(e2) duplicate player rows — still fails", async () => {
    await expect(
      normalizeHistoricalFixture(withDuplicatePlayer(), FIXTURE_ID, SEASON_ID),
    ).rejects.toMatchObject({ code: "duplicate_provider_lineup_player" });
  });

  it("(f) an identified player_id is normalized regardless of downstream mapping outcome", async () => {
    // Whether a provider player_id resolves to a BotolaGO player is a database-layer concern
    // (app_private.football_provider_mappings, via api.ingest_historical_player_fixture_performance's
    // excluded_mapping_rows accounting). normalizeHistoricalFixture only distinguishes
    // identified (player_id present) from anonymous (player_id missing) — it must never conflate
    // "unmapped" with "anonymous". This is a structural regression guard for that boundary.
    const normalized = await normalizeHistoricalFixture(
      fixtureWithAnonymousStarters(0),
      FIXTURE_ID,
      SEASON_ID,
    );
    expect(normalized.coverage.anonymousStarterRows).toBe(0);
    // Every identified row made it into `rows`; mapping resolution happens later, in the DB RPC.
    expect(normalized.rows.map((row) => row.externalPlayerId)).not.toContain(undefined);
  });

  it("(g1) fixture 19596474 shape (7 anonymous of 22 starters) fails", async () => {
    await expect(
      normalizeHistoricalFixture(fixtureWithAnonymousStarters(7, 10, 19_596_474), 19_596_474, SEASON_ID),
    ).rejects.toMatchObject({
      code: "historical_fixture_anonymous_starters_exceeded",
      diagnostic: { fixtureId: 19_596_474, anonymousStarterRows: 7, identifiedStarterRows: 15 },
    });
  });

  it("(g2) fixture 19596475 shape (8 anonymous of 22 starters) fails", async () => {
    await expect(
      normalizeHistoricalFixture(fixtureWithAnonymousStarters(8, 10, 19_596_475), 19_596_475, SEASON_ID),
    ).rejects.toMatchObject({
      code: "historical_fixture_anonymous_starters_exceeded",
      diagnostic: { fixtureId: 19_596_475, anonymousStarterRows: 8, identifiedStarterRows: 14 },
    });
  });

  it("re-throws HistoricalPerformanceRuntimeError instances (sanity on the error type used above)", () => {
    const error = new HistoricalPerformanceRuntimeError("historical_fixture_anonymous_starters_exceeded", {
      anonymousStarterRows: 5,
    });
    expect(error.code).toBe("historical_fixture_anonymous_starters_exceeded");
  });

  // Owner addendum (production-confirmed 2026-09-19): fixture 19596474 maps to internal
  // fixture_id 8f9c8cd8-29d7-4d22-afd2-8cfb3573fe9e; fixture 19596475 maps to
  // d30eb1d6-d257-49f4-a9ee-02c2ee9cc2b6. Neither has ever had a coverage row or any
  // app.player_fixture_performances row in production. These end-to-end batch tests prove, at
  // the worker layer, exactly the guarantee that finding depends on going forward: a quarantined
  // fixture's identified rows are NEVER sent to the ingest RPC -- only the dedicated quarantine
  // RPC is called for it -- and a normal fixture sharing the same batch is completely unaffected.
  describe("end-to-end batch: quarantine is all-or-nothing and never blocks the rest of the batch", () => {
    const NORMAL_FIXTURE_ID = 19_489_500;

    function rpcClient(
      handler: (name: string, args: Record<string, unknown>) => unknown,
    ): HistoricalPerformanceRpcClient {
      return {
        schema: () => ({
          rpc: async (name, args) => ({ data: handler(name, args), error: null }),
        }),
      };
    }

    function request(body: Record<string, unknown>): Request {
      return new Request("https://example.test/functions/v1/football-ingest", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-botolago-ingestion-key": "historical-performance-trigger-secret-1234567890",
        },
        body: JSON.stringify(body),
      });
    }

    it("(3)/(j) quarantines fixture 19596474 with zero rows sent to the ingest RPC, while the batch's other fixture ingests normally", async () => {
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
      const response = await handleSportsMonksHistoricalPlayerPerformanceRequest(
        request({
          job: "historical_player_performances",
          action: "ingest_batch",
          afterFixtureExternalId: null,
          batchSize: 5,
        }),
        {
          environment: {
            SPORTSMONKS_API_TOKEN: "sportsmonks-test-token-1234567890",
            FOOTBALL_INGESTION_TRIGGER_SECRET: "historical-performance-trigger-secret-1234567890",
            FOOTBALL_PROVIDER: "sportsmonks",
            FOOTBALL_PROVIDER_BASE_URL: "https://api.sportmonks.com/v3/football",
            FOOTBALL_SPORTSMONKS_SEASON_ID: String(SEASON_ID),
            FOOTBALL_PROVIDER_TIMEOUT_MS: "15000",
            FOOTBALL_PROVIDER_MAX_RETRIES: "2",
          },
          now: () => new Date("2026-09-19T00:00:00.000Z"),
          fetch: async (input) => {
            const url = new URL(input instanceof Request ? input.url : input.toString());
            const fixtureId = Number(url.pathname.split("/").at(-1));
            if (fixtureId === 19_596_474) {
              return Response.json(fixtureWithAnonymousStarters(7, 10, 19_596_474));
            }
            return Response.json(fixtureWithAnonymousStarters(0, 5, NORMAL_FIXTURE_ID));
          },
          client: rpcClient((name, args) => {
            calls.push({ name, args });
            if (name === "begin_historical_performance_ingestion") {
              return "44444444-4444-4444-8444-444444444444";
            }
            if (name === "football_historical_performance_fixture_batch") {
              return {
                seasonExternalId: String(SEASON_ID),
                expectedFixtureCount: 240,
                items: [
                  { externalFixtureId: "19596474", kickoffAt: "2025-11-01T16:00:00Z" },
                  { externalFixtureId: String(NORMAL_FIXTURE_ID), kickoffAt: "2025-11-02T16:00:00Z" },
                ],
                nextCursor: null,
                hasMore: false,
              };
            }
            if (name === "quarantine_historical_player_fixture_performance") {
              expect(args.p_fixture_external_id).toBe("19596474");
              expect(args.p_anonymous_starter_rows).toBe(7);
              expect(args.p_identified_starter_rows).toBe(15);
              return { fixtureId: "8f9c8cd8-29d7-4d22-afd2-8cfb3573fe9e", quarantined: true };
            }
            if (name === "ingest_historical_player_fixture_performance") {
              // Must never be called for 19596474 -- asserted structurally below via the call log,
              // and here defensively: any p_fixture_external_id other than the normal fixture's
              // fails the test outright.
              expect(args.p_fixture_external_id).toBe(String(NORMAL_FIXTURE_ID));
              return {
                inserted: 27,
                updated: 0,
                skipped: 0,
                active: 27,
                excludedMappingRows: 0,
                excludedIncompleteRows: 0,
                reconciled: true,
              };
            }
            if (name === "complete_football_ingestion") return true;
            throw new Error(`unexpected rpc ${name}`);
          }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        fixturesProcessed: 2,
        acceptedFixtures: 1,
        quarantinedFixtures: 1,
        quarantinedFixtureIds: ["19596474"],
        performanceRows: 27,
      });
      // The decisive assertion: ingest_historical_player_fixture_performance was called exactly
      // once (for the normal fixture only) and quarantine_historical_player_fixture_performance
      // exactly once (for 19596474 only) -- never both for the same fixture, never the ingest RPC
      // for the quarantined one.
      const ingestCalls = calls.filter((call) => call.name === "ingest_historical_player_fixture_performance");
      const quarantineCalls = calls.filter(
        (call) => call.name === "quarantine_historical_player_fixture_performance",
      );
      expect(ingestCalls).toHaveLength(1);
      expect(quarantineCalls).toHaveLength(1);
      expect(ingestCalls[0]!.args.p_fixture_external_id).toBe(String(NORMAL_FIXTURE_ID));
      expect(quarantineCalls[0]!.args.p_fixture_external_id).toBe("19596474");
    });
  });
});
