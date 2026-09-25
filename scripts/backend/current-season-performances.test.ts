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
      // 0-0 unless a test says otherwise (withScore).
      scores: [
        {
          id: 1,
          participant_id: 10,
          description: "1ST_HALF",
          score: { goals: 0, participant: "home" },
        },
        {
          id: 2,
          participant_id: 20,
          description: "1ST_HALF",
          score: { goals: 0, participant: "away" },
        },
        {
          id: 3,
          participant_id: 10,
          description: "CURRENT",
          score: { goals: 0, participant: "home" },
        },
        {
          id: 4,
          participant_id: 20,
          description: "CURRENT",
          score: { goals: 0, participant: "away" },
        },
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
/** Sets the final (CURRENT) score. */
function withScore(payload: ReturnType<typeof fixture>, home: number, away: number) {
  for (const score of payload.data.scores)
    if (score.description === "CURRENT")
      score.score.goals = score.score.participant === "home" ? home : away;
  return payload;
}
/** Sets one statistic on one lineup row, adding it when SportsMonks would have left it out. */
function setDetail(
  payload: ReturnType<typeof fixture>,
  index: number,
  typeId: number,
  value: number,
) {
  const lineup = payload.data.lineups[index]!;
  const detail = lineup.details.find((candidate) => candidate.type_id === typeId);
  if (detail) detail.data.value = value;
  else
    lineup.details.push({
      ...lineup.details[0]!,
      id: 900000 + typeId * 100 + index,
      type_id: typeId,
      data: { value },
    });
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
  test("accepts explicit zero facts and derives clean sheets from official minutes and goals conceded", async () => {
    const payload = fixture();
    const normalized = await normalizeCurrentFinishedFixture(payload, 9001);
    expect(normalized.rows).toHaveLength(22);
    expect(normalized.rows[0]).toMatchObject({ goals: 0, saves: 0, minutes: 90, cleanSheets: 1 });
    expect(normalized.coverage).toMatchObject({
      excludedIncompleteRows: 0,
      scoringStatisticsComplete: true,
      cleanSheetSource: "official_minutes_and_on_pitch_goals_conceded",
      goalsConcededFromFinalScore: 0,
    });
    // Went off after 70 minutes: SportsMonks' own goals conceded decide.
    withScore(payload, 0, 1);
    setDetail(payload, 1, 119, 70);
    expect((await normalizeCurrentFinishedFixture(payload, 9001)).rows[1]).toMatchObject({
      goalsConceded: 0,
      cleanSheets: 1,
    });
    setDetail(payload, 1, 88, 1);
    expect((await normalizeCurrentFinishedFixture(payload, 9001)).rows[1].cleanSheets).toBe(0);
    setDetail(payload, 1, 88, 0);
    setDetail(payload, 1, 119, 59);
    expect((await normalizeCurrentFinishedFixture(payload, 9001)).rows[1].cleanSheets).toBe(0);
    expect(CURRENT_PERFORMANCE_TYPES).not.toContain(194);
  });
  test("goals conceded follow the final score: all of them for a starter's 90 minutes, never more", async () => {
    // Lost 0-2. As 37 goalkeepers did last season, SportsMonks gives the
    // home goalkeeper none, and a defender one: both started and played 90.
    const payload = withBench(withScore(fixture(), 0, 2), 1);
    setDetail(payload, 3, 88, 1);
    setDetail(payload, 5, 119, 65); // off after 65 minutes with 3: capped at 2
    setDetail(payload, 5, 88, 3);
    setDetail(payload, 6, 119, 75); // off after 75, before both goals
    setDetail(payload, 7, 119, 20); // off after 20, on for the first goal only
    setDetail(payload, 7, 88, 1);
    // On for him from the 20th, SportsMonks counts the substitute 90 as well:
    // only the second goal was his, and his own figure stands.
    setDetail(payload, 22, 119, 90);
    setDetail(payload, 22, 88, 1);
    setDetail(payload, 12, 88, 1); // the away side conceded none
    const normalized = await normalizeCurrentFinishedFixture(payload, 9001);
    expect(normalized.rows[0]).toMatchObject({ minutes: 90, goalsConceded: 2, cleanSheets: 0 });
    expect(normalized.rows[3]).toMatchObject({ minutes: 90, goalsConceded: 2, cleanSheets: 0 });
    expect(normalized.rows[5]).toMatchObject({ minutes: 65, goalsConceded: 2, cleanSheets: 0 });
    expect(normalized.rows[6]).toMatchObject({ minutes: 75, goalsConceded: 0, cleanSheets: 1 });
    expect(normalized.rows[7]).toMatchObject({ minutes: 20, goalsConceded: 1, cleanSheets: 0 });
    expect(normalized.rows[22]).toMatchObject({ started: false, minutes: 90, goalsConceded: 1 });
    const away = normalized.rows.filter((player) => player.externalTeamId === "20");
    expect(away).toHaveLength(11);
    for (const player of away) expect(player).toMatchObject({ goalsConceded: 0, cleanSheets: 1 });
    // 8 home starters with 90 minutes lifted to 2; 1 home and 1 away capped.
    expect(normalized.coverage).toMatchObject({ goalsConcededFromFinalScore: 10 });
  });
  test("no final score, no import", async () => {
    const missing = fixture();
    (missing.data as { scores?: unknown }).scores = undefined;
    await expect(normalizeCurrentFinishedFixture(missing, 9001)).rejects.toMatchObject({
      code: "current_final_score_missing",
      diagnostic: { fixtureExternalId: "9001" },
    });
    const halfTimeOnly = fixture();
    halfTimeOnly.data.scores = halfTimeOnly.data.scores.filter(
      (score) => score.description !== "CURRENT",
    );
    await expect(normalizeCurrentFinishedFixture(halfTimeOnly, 9001)).rejects.toThrow(
      "current_final_score_missing",
    );
    const twice = fixture();
    twice.data.scores.push({ ...twice.data.scores[2]!, id: 5 });
    await expect(normalizeCurrentFinishedFixture(twice, 9001)).rejects.toThrow(
      "current_final_score_missing",
    );
  });
  test("an absent statistic counts as zero: SportsMonks sends only the ones that are not", async () => {
    // Fixture 19874708's shape: minutes and a rating for the players who
    // played, and a goal only on the scorer (a 1-0).
    const payload = withScore(fixture(), 1, 0);
    for (const lineup of payload.data.lineups)
      lineup.details = lineup.details.filter((detail) => [118, 119].includes(detail.type_id));
    payload.data.lineups[10].details.push({
      ...payload.data.lineups[10].details[0]!,
      id: 999001,
      type_id: 52,
      data: { value: 1 },
    });
    const normalized = await normalizeCurrentFinishedFixture(payload, 9001);
    expect(normalized.rows).toHaveLength(22);
    expect(normalized.rows[0]).toMatchObject({
      goals: 0,
      assists: 0,
      yellowCards: 0,
      goalsConceded: 0,
      saves: 0,
      penaltiesSaved: 0,
      minutes: 90,
      cleanSheets: 1,
    });
    expect(normalized.rows[10]).toMatchObject({ goals: 1 });
    // Nobody carries goals conceded; the score says the away side conceded one.
    expect(normalized.rows[11]).toMatchObject({ goalsConceded: 1, cleanSheets: 0 });
    // 8 counted statistics absent on each of 22 players, less the one goal.
    expect(normalized.coverage).toMatchObject({
      absentStatisticsCountedAsZero: 22 * 8 - 1,
      missingStatisticRows: 0,
      scoringStatisticsComplete: true,
      goalsConcededFromFinalScore: 11,
    });
  });
  test("an explicit null is still unknown, never zero", async () => {
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
      saves: 0,
      penaltiesSaved: 0,
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
  test("a starter without minutes played means the statistics are not in yet", async () => {
    const payload = fixture();
    payload.data.lineups[5].details = payload.data.lineups[5].details.filter(
      (detail) => detail.type_id !== 119,
    );
    await expect(normalizeCurrentFinishedFixture(payload, 9001)).rejects.toMatchObject({
      code: "current_starter_minutes_missing",
      diagnostic: { fixtureExternalId: "9001", starterRows: 1 },
    });
    const bare = fixture();
    bare.data.lineups[5].details = [];
    await expect(normalizeCurrentFinishedFixture(bare, 9001)).rejects.toThrow(
      "current_starter_minutes_missing",
    );
    // Sent as 0 is no better than left out.
    const zero = fixture();
    setDetail(zero, 5, 119, 0);
    await expect(normalizeCurrentFinishedFixture(zero, 9001)).rejects.toThrow(
      "current_starter_minutes_missing",
    );
  });
  test("a substitute without minutes never scored, assisted, saved, missed a penalty or put through an own goal", async () => {
    // Unused substitutes come with no statistics at all, or none but a card.
    const unused = withBench(fixture(), 3);
    unused.data.lineups[22]!.details = [];
    (unused.data.lineups[23] as { details?: unknown }).details = undefined;
    unused.data.lineups[24]!.details = unused.data.lineups[24]!.details.filter(
      (detail) => detail.type_id === 84,
    ).map((detail) => ({ ...detail, data: { value: 1 } })); // booked on the bench
    const normalized = await normalizeCurrentFinishedFixture(unused, 9001);
    const bench = normalized.rows.filter((player) => !player.started);
    expect(bench).toHaveLength(3);
    for (const player of bench)
      expect(player).toMatchObject({ minutes: 0, appeared: false, saves: 0, cleanSheets: 0 });
    expect(bench.map((player) => player.yellowCards).sort()).toEqual([0, 0, 1]);

    // A late substitute can carry goals conceded without minutes played (23
    // did last season): kept, with no appearance and no clean sheet.
    const late = withBench(withScore(fixture(), 0, 1), 1);
    late.data.lineups[22]!.details = late.data.lineups[22]!.details.filter(
      (detail) => detail.type_id === 88,
    ).map((detail) => ({ ...detail, data: { value: 1 } }));
    expect(
      (await normalizeCurrentFinishedFixture(late, 9001)).rows.find((player) => !player.started),
    ).toMatchObject({ minutes: 0, appeared: false, goalsConceded: 1, cleanSheets: 0 });

    // A goal, an assist, an own goal or a missed penalty without minutes says
    // the statistics are wrong, not zero (none did last season).
    for (const typeId of [52, 79, 324, 112, 57, 113]) {
      const scored = withBench(fixture(), 1);
      scored.data.lineups[22]!.details = scored.data.lineups[22]!.details.filter(
        (detail) => detail.type_id === typeId,
      ).map((detail) => ({ ...detail, data: { value: 1 } }));
      await expect(normalizeCurrentFinishedFixture(scored, 9001)).rejects.toMatchObject({
        code: "current_statistics_inconsistent",
        diagnostic: { fixtureExternalId: "9001", substituteRowsWithoutMinutes: 1 },
      });
    }
    // Minutes sent as 0 are no minutes: withBench sends every statistic, 0.
    const zeroMinutes = withBench(fixture(), 1);
    setDetail(zeroMinutes, 22, 52, 1);
    await expect(normalizeCurrentFinishedFixture(zeroMinutes, 9001)).rejects.toThrow(
      "current_statistics_inconsistent",
    );
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
        // A starter with no statistics at all: not in yet (no minutes played).
        if (path.endsWith("9002")) payload.data.lineups[0].details = [];
        return payload;
      }),
    ).rejects.toThrow("current_starter_minutes_missing");
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
        expect(query.include).toBe("lineups.details;state;participants;scores");
        return fixture();
      },
    );
    expect(result).toMatchObject({ verdict: "pass", fixturesProcessed: 1 });
    expect(calls).toEqual([
      "football_current_performance_fixture_batch",
      "ingest_current_player_fixture_performance",
    ]);
  });
  test("a database refusal keeps its own reason code, and nothing else", async () => {
    const refusing = (message: string) => ({
      schema: (_name: "api") => ({
        rpc: async (name: string) =>
          name === "football_current_performance_fixture_batch"
            ? {
                data: {
                  seasonExternalId: "28647",
                  items: [{ externalFixtureId: "9001" }],
                  hasMore: false,
                  nextCursor: null,
                },
                error: null,
              }
            : { data: null, error: { code: "22023", message } },
      }),
    });
    await expect(
      runCurrentPerformanceBatch(
        refusing("CURRENT_GOALS_CONCEDED_INCOMPLETE"),
        "test-provider-token",
        null,
        async () => fixture(),
      ),
    ).rejects.toMatchObject({
      code: "current_performance_rpc_failed",
      diagnostic: {
        rpcName: "ingest_current_player_fixture_performance",
        sqlState: "22023",
        reason: "CURRENT_GOALS_CONCEDED_INCOMPLETE",
      },
    });
    const free = runCurrentPerformanceBatch(
      refusing("relation app.x does not exist at 10.0.0.1"),
      "test-provider-token",
      null,
      async () => fixture(),
    );
    await expect(free).rejects.toMatchObject({ code: "current_performance_rpc_failed" });
    await free.catch((error: { diagnostic?: Record<string, unknown> }) =>
      expect(error.diagnostic).not.toHaveProperty("reason"),
    );
  });
});
