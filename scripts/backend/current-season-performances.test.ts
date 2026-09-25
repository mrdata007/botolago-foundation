import { describe, expect, test } from "bun:test";
import {
  CURRENT_PERFORMANCE_TYPES,
  normalizeCurrentFinishedFixture,
  runCurrentPerformanceBatch,
  currentPerformanceGuard,
} from "./current-season-performances";

function fixture(id = 9001) {
  return {
    data: {
      id,
      season_id: 28647,
      league_id: 860,
      state_id: 5,
      state: { id: 5, developer_name: "FT" },
      placeholder: false,
      participants: [
        { id: 10, meta: { location: "home" } },
        { id: 20, meta: { location: "away" } },
      ],
      lineups: Array.from({ length: 22 }, (_, index) => {
        const playerId = index + 100;
        const teamId = index < 11 ? 10 : 20;
        return {
          id: index + 1,
          fixture_id: id,
          player_id: playerId,
          team_id: teamId,
          type_id: 11,
          details: CURRENT_PERFORMANCE_TYPES.map((typeId) => ({
            id: typeId * 1000 + index,
            fixture_id: id,
            lineup_id: index + 1,
            player_id: playerId,
            team_id: teamId,
            type_id: typeId,
            data: { value: typeId === 119 ? 90 : typeId === 118 ? 7 : 0 },
          })),
        };
      }),
    },
  };
}
/** Adds `count` named substitutes who did not come on (type 12), 11 per club at most. */
function withBench(payload: ReturnType<typeof fixture>, count: number) {
  for (let index = 0; index < count; index += 1) {
    const playerId = 200 + index;
    const teamId = index % 2 === 0 ? 10 : 20;
    const lineupId = 50 + index;
    payload.data.lineups.push({
      id: lineupId,
      fixture_id: payload.data.id,
      player_id: playerId,
      team_id: teamId,
      type_id: 12,
      details: CURRENT_PERFORMANCE_TYPES.map((typeId) => ({
        id: typeId * 1000 + lineupId,
        fixture_id: payload.data.id,
        lineup_id: lineupId,
        player_id: playerId,
        team_id: teamId,
        type_id: typeId,
        data: { value: typeId === 118 ? 6 : 0 },
      })),
    });
  }
  return payload;
}
/** SportsMonks' shape for a player it has not identified: no player_id, no statistics. */
function unnamedRow(payload: ReturnType<typeof fixture>, index: number) {
  const lineup = payload.data.lineups[index] as { player_id: number | null; details: unknown[] };
  lineup.player_id = null;
  lineup.details = [];
}
const env = {
  EXPECTED_COMMIT: "a".repeat(40),
  GITHUB_SHA: "a".repeat(40),
  GITHUB_REPOSITORY: "mrdata007/botolago-foundation",
  GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_ACTOR: "mrdata007",
  GITHUB_RUN_ATTEMPT: "1",
  CONFIRMATION: "INGEST_CURRENT_FINISHED_PERFORMANCES",
  SUPABASE_PRODUCTION_PROJECT_REF: "tkewgajrljbwgwedqsxn",
  SUPABASE_PRODUCTION_PROJECT_NAME: "BotolaGO Production V2",
  SUPABASE_PRODUCTION_URL: "https://tkewgajrljbwgwedqsxn.supabase.co",
  SUPABASE_SECRET_KEY: "test-server-secret",
  SPORTSMONKS_API_TOKEN: "test-provider-token-only",
};

describe("current finished fixture performance ingestion", () => {
  test("accepts explicit zero facts and derives clean sheets from on-pitch goals conceded and official minutes", async () => {
    const payload = fixture();
    const normalized = await normalizeCurrentFinishedFixture(payload, 9001);
    expect(normalized.rows).toHaveLength(22);
    expect(normalized.rows[0]).toMatchObject({ goals: 0, saves: 0, minutes: 90, cleanSheets: 1 });
    expect(normalized.coverage).toMatchObject({
      excludedIncompleteRows: 0,
      scoringStatisticsComplete: true,
      cleanSheetSource: "official_minutes_and_on_pitch_goals_conceded",
    });
    payload.data.lineups[0].details.find((detail) => detail.type_id === 88)!.data.value = 1;
    expect((await normalizeCurrentFinishedFixture(payload, 9001)).rows[0].cleanSheets).toBe(0);
    payload.data.lineups[0].details.find((detail) => detail.type_id === 88)!.data.value = 0;
    payload.data.lineups[0].details.find((detail) => detail.type_id === 119)!.data.value = 59;
    expect((await normalizeCurrentFinishedFixture(payload, 9001)).rows[0].cleanSheets).toBe(0);
    expect(CURRENT_PERFORMANCE_TYPES).not.toContain(194);
  });
  test("missing or null common statistics cannot silently become zero", async () => {
    const payload = fixture();
    payload.data.lineups[0].details = payload.data.lineups[0].details.filter(
      (detail) => detail.type_id !== 52,
    );
    await expect(normalizeCurrentFinishedFixture(payload, 9001)).rejects.toMatchObject({
      code: "current_statistics_incomplete",
      diagnostic: {
        fixtureExternalId: "9001",
        missingDetailTypes: [{ typeId: 52, playerRows: 1 }],
      },
    });
    const nullPayload = fixture();
    Object.assign(nullPayload.data.lineups[0].details[0].data, { value: null });
    await expect(normalizeCurrentFinishedFixture(nullPayload, 9001)).rejects.toThrow(
      "invalid_provider_detail",
    );
    const optional = fixture();
    optional.data.lineups[0].details = optional.data.lineups[0].details.filter(
      (detail) => detail.type_id !== 57 && detail.type_id !== 113,
    );
    expect((await normalizeCurrentFinishedFixture(optional, 9001)).rows[0]).toMatchObject({
      saves: null,
      penaltiesSaved: null,
    });
    const optionalNulls = fixture();
    for (const detail of optionalNulls.data.lineups[0].details) {
      if ([57, 113, 118].includes(detail.type_id)) Object.assign(detail.data, { value: null });
    }
    expect((await normalizeCurrentFinishedFixture(optionalNulls, 9001)).rows[0]).toMatchObject({
      saves: null,
      penaltiesSaved: null,
      providerRating: null,
    });
  });
  test("rejects wrong state, identities and incomplete starter reconciliation", async () => {
    const scheduled = fixture();
    scheduled.data.state.developer_name = "NS";
    await expect(normalizeCurrentFinishedFixture(scheduled, 9001)).rejects.toThrow(
      "finished_fixture_required",
    );
    const wrong = fixture();
    wrong.data.lineups[0].details[0].player_id = 999;
    await expect(normalizeCurrentFinishedFixture(wrong, 9001)).rejects.toThrow(
      "detail_identity_mismatch",
    );
    const starters = fixture();
    starters.data.lineups[0].type_id = 12;
    await expect(normalizeCurrentFinishedFixture(starters, 9001)).rejects.toThrow(
      "historical_fixture_coverage_incomplete",
    );
    const duplicate = fixture();
    duplicate.data.lineups[1].id = duplicate.data.lineups[0].id;
    await expect(normalizeCurrentFinishedFixture(duplicate, 9001)).rejects.toThrow(
      "lineup_identity_mismatch",
    );
  });
  test("up to 4 unnamed starters: they are skipped and every named player is kept (BG-0011 option B)", async () => {
    // Fixture 19874708 (2026-09-24): 3 unnamed starters and 4 other unnamed rows.
    const unnamed = withBench(fixture(), 4);
    for (const index of [3, 5, 14]) unnamedRow(unnamed, index); // two home starters, one away
    unnamedRow(unnamed, 25); // one bench row
    const normalized = await normalizeCurrentFinishedFixture(unnamed, 9001);
    expect(normalized.rows).toHaveLength(26 - 4);
    expect(normalized.rows.map((player) => player.externalPlayerId)).not.toContain("103");
    expect(normalized.rows.filter((player) => player.started)).toHaveLength(19);
    expect(normalized.coverage).toMatchObject({
      lineupRowsSeen: 26,
      validPlayerRows: 22,
      excludedIncompleteRows: 4,
      anonymousStarterRows: 3,
      identifiedStarterRows: 19,
      starterRows: 19,
    });
  });
  test("more than 4 unnamed starters: the fixture waits, and says why with counts", async () => {
    const tooMany = withBench(fixture(), 6);
    for (const index of [0, 1, 2, 11, 12]) unnamedRow(tooMany, index);
    unnamedRow(tooMany, 27);
    await expect(normalizeCurrentFinishedFixture(tooMany, 9001)).rejects.toMatchObject({
      code: "current_lineup_unidentified_starters_exceeded",
      diagnostic: { fixtureExternalId: "9001", unidentifiedStarters: 5, unidentifiedOthers: 1 },
    });
  });
  test("an unnamed starter must fit its club's 11", async () => {
    // A home starter reported unnamed under the away club: the home side
    // then fields 10 and the away side 12.
    const misplaced = withBench(fixture(), 2);
    unnamedRow(misplaced, 3);
    misplaced.data.lineups[3]!.team_id = 20;
    await expect(normalizeCurrentFinishedFixture(misplaced, 9001)).rejects.toThrow(
      "current_starters_incomplete",
    );
  });
  test("a bad provider id names its field", async () => {
    // 2026-09-25: every run since the first finished match reported only
    // `invalid_provider_id`, so nobody could tell which value was wrong.
    const badDetail = fixture();
    (badDetail.data.lineups[0].details[0] as { lineup_id: number | null }).lineup_id = null;
    await expect(normalizeCurrentFinishedFixture(badDetail, 9001)).rejects.toMatchObject({
      code: "invalid_provider_id",
      diagnostic: { field: "detail.lineup_id" },
    });
  });
  test("requires reviewed manual main execution and never enables a schedule", () => {
    expect(currentPerformanceGuard(env).expectedCommit).toBe(env.EXPECTED_COMMIT);
    for (const override of [
      { GITHUB_EVENT_NAME: "schedule" },
      { GITHUB_RUN_ATTEMPT: "2" },
      { GITHUB_REF: "refs/heads/feature" },
      { SUPABASE_PRODUCTION_PROJECT_REF: "other" },
      { GITHUB_ACTOR: "other" },
    ])
      expect(() => currentPerformanceGuard({ ...env, ...override })).toThrow(
        "current_performance_dispatch_guard_failed",
      );
  });
  test("empty finished-fixture scope causes no provider fetch or write", async () => {
    const calls: string[] = [];
    const client = {
      schema: (_name: "api") => ({
        rpc: async (name: string) => {
          calls.push(name);
          return {
            data: { seasonExternalId: "28647", items: [], hasMore: false, nextCursor: null },
            error: null,
          };
        },
      }),
    };
    expect(
      await runCurrentPerformanceBatch(client, "test-provider-token", null, async () => {
        throw Error("must not fetch");
      }),
    ).toMatchObject({
      verdict: "no_finished_fixtures",
      fixturesProcessed: 0,
    });
    expect(calls).toEqual(["football_current_performance_fixture_batch"]);
  });
  test("checks every fixture in the bounded batch before the first mutation", async () => {
    const calls: string[] = [];
    const client = {
      schema: (_name: "api") => ({
        rpc: async (name: string) => {
          calls.push(name);
          return {
            data: {
              seasonExternalId: "28647",
              items: [{ externalFixtureId: "9001" }, { externalFixtureId: "9002" }],
              hasMore: false,
              nextCursor: null,
            },
            error: null,
          };
        },
      }),
    };
    await expect(
      runCurrentPerformanceBatch(client, "test-provider-token", null, async (path) => {
        const payload = fixture(path.endsWith("9001") ? 9001 : 9002);
        if (path.endsWith("9002")) payload.data.lineups[0].details = [];
        return payload;
      }),
    ).rejects.toThrow("current_statistics_incomplete");
    expect(calls).toEqual(["football_current_performance_fixture_batch"]);
  });
  test("publishes validated facts through only the current service RPC and reconciles its result", async () => {
    const calls: string[] = [];
    const client = {
      schema: (_name: "api") => ({
        rpc: async (name: string, args: Record<string, unknown>) => {
          calls.push(name);
          if (name === "football_current_performance_fixture_batch")
            return {
              data: {
                seasonExternalId: "28647",
                items: [{ externalFixtureId: "9001" }],
                hasMore: false,
                nextCursor: null,
              },
              error: null,
            };
          expect(args.p_rows).toHaveLength(22);
          expect(args.p_coverage).toMatchObject({ scoringStatisticsComplete: true });
          expect(args.p_source_version).toBeUndefined();
          return {
            data: {
              active: 22,
              reconciled: true,
              scoringStatisticsComplete: true,
              sourceVersion: `sportsmonks-current-fixture:${"a".repeat(64)}`,
            },
            error: null,
          };
        },
      }),
    };
    const result = await runCurrentPerformanceBatch(
      client,
      "test-provider-token",
      null,
      async (_path, query) => {
        expect(query.include).toBe("lineups.details;state;participants");
        return fixture();
      },
    );
    expect(result).toMatchObject({ verdict: "pass", fixturesProcessed: 1 });
    expect(calls).toEqual([
      "football_current_performance_fixture_batch",
      "ingest_current_player_fixture_performance",
    ]);
  });
});
