import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  CURRENT_PERFORMANCE_TYPES,
  CurrentPerformanceError,
  normalizeCurrentFinishedFixture,
  providerValueType,
  type LineupParticipation,
  runCurrentPerformanceBatch,
  currentPerformanceGuard,
  isProviderOutage,
  manualRunExitCode,
} from "./current-season-performances";
import { createHash } from "node:crypto";
import { evidenceDigest, type VerifiedUnusedException } from "./verified-unused-exceptions";
import { SportsMonksProbeError } from "./sportsmonks-production-probe";

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
  typeId: (typeof CURRENT_PERFORMANCE_TYPES)[number],
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

type RpcAnswer = { data: unknown; error: { code?: string; message?: string } | null };

/**
 * A database that lists `items` as one page and accepts every ingestion like
 * the real RPC does, unless `ingest` answers otherwise for a fixture.
 */
function batchClient(options: {
  items: Array<Record<string, unknown>>;
  hasMore?: boolean;
  nextCursor?: string | null;
  ingest?: (fixtureExternalId: string) => RpcAnswer | undefined;
}) {
  const calls: string[] = [];
  /** Every RPC's arguments, in call order. */
  const received: Array<Record<string, unknown>> = [];
  const client = {
    schema: (_name: "api") => ({
      rpc: async (name: string, args: Record<string, unknown>): Promise<RpcAnswer> => {
        received.push(args);
        if (name === "football_current_performance_fixture_batch") {
          calls.push(name);
          return {
            data: {
              seasonExternalId: "28647",
              items: options.items,
              hasMore: options.hasMore ?? false,
              nextCursor: options.nextCursor ?? null,
            },
            error: null,
          };
        }
        const fixtureExternalId = String(args.p_fixture_external_id);
        calls.push(`${name} ${fixtureExternalId}`);
        return (
          options.ingest?.(fixtureExternalId) ?? {
            data: {
              active: (args.p_rows as unknown[]).length,
              reconciled: true,
              scoringStatisticsComplete: true,
              sourceVersion: `sportsmonks-current-fixture:${"a".repeat(64)}`,
            },
            error: null,
          }
        );
      },
    }),
  };
  return { client, calls, received };
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as CurrentPerformanceError;
  }
  throw new Error("expected a rejection");
}

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
    setDetail(payload, 11, 52, 1);
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
    setDetail(payload, 11, 52, 2);
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
    // No list at all is what a request without `scores` in its include gets.
    expect((await rejection(normalizeCurrentFinishedFixture(missing, 9001))).diagnostic).toEqual({
      fixtureExternalId: "9001",
      field: "data.scores",
      valueType: "missing",
    });
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
  test("holds an unattributed goal and accepts a documented own goal", async () => {
    const missing = withScore(fixture(), 1, 3);
    setDetail(missing, 11, 52, 1);
    setDetail(missing, 12, 52, 1);
    setDetail(missing, 13, 52, 1);
    await expect(normalizeCurrentFinishedFixture(missing, 9001)).rejects.toMatchObject({
      code: "current_goal_totals_mismatch",
      diagnostic: {
        fixtureExternalId: "9001",
        teamExternalId: "10",
        finalGoals: 1,
        attributedGoals: 0,
      },
    });
    // An own goal by an away player belongs to the home side's score.
    setDetail(missing, 14, 324, 1);
    const accepted = await normalizeCurrentFinishedFixture(missing, 9001);
    expect(accepted.rows.find((player) => player.externalPlayerId === "114")?.ownGoals).toBe(1);
    setDetail(missing, 14, 324, 0);
    setDetail(missing, 0, 52, 1);
    expect((await normalizeCurrentFinishedFixture(missing, 9001)).rows).toHaveLength(22);
    setDetail(missing, 0, 52, 2);
    await expect(normalizeCurrentFinishedFixture(missing, 9001)).rejects.toMatchObject({
      code: "current_goal_totals_mismatch",
      diagnostic: {
        fixtureExternalId: "9001",
        teamExternalId: "10",
        finalGoals: 1,
        attributedGoals: 2,
      },
    });
  });
  test("a goal mismatch names who was credited and what the provider's goal events say", async () => {
    const payload = withBench(withScore(fixture(), 1, 3), 4);
    setDetail(payload, 11, 52, 1);
    setDetail(payload, 12, 52, 1);
    setDetail(payload, 13, 52, 1);
    unnamedRow(payload, 5); // a home starter
    unnamedRow(payload, 25); // an away substitute
    const withEvents = {
      data: {
        ...payload.data,
        events: [
          { id: 1, fixture_id: 9001, participant_id: 20, type_id: 14, player_id: 111, minute: 9 },
          {
            id: 2,
            fixture_id: 9001,
            participant_id: 20,
            type_id: 16,
            player_id: 112,
            minute: 90,
            extra_minute: 6,
          },
          { id: 3, fixture_id: 9001, participant_id: 20, type_id: 14, player_id: null, minute: 70 },
          { id: 4, fixture_id: 9001, participant_id: 10, type_id: 18, player_id: 105, minute: 60 },
        ],
      },
    };
    await expect(normalizeCurrentFinishedFixture(withEvents, 9001)).rejects.toMatchObject({
      code: "current_goal_totals_mismatch",
      diagnostic: {
        teamExternalId: "10",
        finalGoals: 1,
        attributedGoals: 0,
        credited: [
          { externalPlayerId: "111", externalTeamId: "20", goals: 1, ownGoals: 0 },
          { externalPlayerId: "112", externalTeamId: "20", goals: 1, ownGoals: 0 },
          { externalPlayerId: "113", externalTeamId: "20", goals: 1, ownGoals: 0 },
        ],
        // A substitution is not a goal; a goal with no scorer id keeps a null playerId.
        goalEvents: [
          {
            eventId: 1,
            typeId: 14,
            participantId: 20,
            playerId: 111,
            minute: 9,
            extraMinute: null,
          },
          { eventId: 2, typeId: 16, participantId: 20, playerId: 112, minute: 90, extraMinute: 6 },
          {
            eventId: 3,
            typeId: 14,
            participantId: 20,
            playerId: null,
            minute: 70,
            extraMinute: null,
          },
        ],
        unidentifiedRows: [
          { teamExternalId: "10", starters: 1, others: 0 },
          { teamExternalId: "20", starters: 0, others: 1 },
        ],
      },
    });
    // Without an event list the diagnostic still says who was credited, and never invents goals.
    await expect(normalizeCurrentFinishedFixture(payload, 9001)).rejects.toMatchObject({
      diagnostic: { goalEvents: [] },
    });
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
    // 10 counted statistics absent on each of 22 players (saves and penalties
    // saved included), less the one goal.
    expect(normalized.coverage).toMatchObject({
      absentStatisticsCountedAsZero: 22 * 10 - 1,
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
    const absentGoalkeeping = await normalizeCurrentFinishedFixture(optional, 9001);
    expect(absentGoalkeeping.rows[0]).toMatchObject({ saves: 0, penaltiesSaved: 0 });
    // Both absences are counted as zero, and reported.
    expect(absentGoalkeeping.coverage).toMatchObject({ absentStatisticsCountedAsZero: 2 });
    const optionalNulls = fixture();
    for (const detail of optionalNulls.data.lineups[0].details) {
      if ([57, 113, 118].includes(detail.type_id)) Object.assign(detail.data, { value: null });
    }
    const nulls = await normalizeCurrentFinishedFixture(optionalNulls, 9001);
    expect(nulls.rows[0]).toMatchObject({
      saves: null,
      penaltiesSaved: null,
      providerRating: null,
    });
    // An explicit null is not an absence: nothing counted as zero.
    expect(nulls.coverage).toMatchObject({ absentStatisticsCountedAsZero: 0 });
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
  test("a starter without minutes is named by provider id, with the statistics it did carry", async () => {
    const payload = fixture();
    payload.data.lineups[5].details = payload.data.lineups[5].details.filter(
      (detail) => detail.type_id !== 119,
    );
    await expect(normalizeCurrentFinishedFixture(payload, 9001)).rejects.toMatchObject({
      code: "current_starter_minutes_missing",
      diagnostic: {
        starterRows: 1,
        players: [
          {
            externalPlayerId: "105",
            teamExternalId: "10",
            detailTypeIds: [...CURRENT_PERFORMANCE_TYPES]
              .filter((typeId) => typeId !== 119)
              .sort((a, b) => a - b),
          },
        ],
      },
    });
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
    setDetail(late, 11, 52, 1);
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
  // Run 36082097891 recorded only `invalid_provider_id`: nobody could tell
  // which of the fixture's hundreds of ids was wrong.
  test("an invalid provider id names its exact field and value type, never the value", async () => {
    const cases: Array<[(payload: ReturnType<typeof fixture>) => void, string, string]> = [
      [(p) => Object.assign(p.data, { id: null }), "data.id", "null"],
      [(p) => Object.assign(p.data, { season_id: "28647" }), "data.season_id", "numeric_string"],
      [(p) => delete (p.data.state as Record<string, unknown>).id, "data.state.id", "missing"],
      [
        (p) => Object.assign(p.data.participants[1]!, { id: -20 }),
        "data.participants[1].id",
        "non_positive_number",
      ],
      [
        (p) => Object.assign(p.data.lineups[12]!, { team_id: null }),
        "data.lineups[12].team_id",
        "null",
      ],
      [
        (p) => Object.assign(p.data.lineups[3]!.details[4]!, { player_id: "sb_secret_like_value" }),
        "data.lineups[3].details[4].player_id",
        "string",
      ],
      [
        (p) => Object.assign(p.data.lineups[7]!.details[0]!, { type_id: 52.5 }),
        "data.lineups[7].details[0].type_id",
        "fractional_number",
      ],
      [
        (p) => Object.assign(p.data.lineups[2]!.details[1]!, { lineup_id: 2 ** 60 }),
        "data.lineups[2].details[1].lineup_id",
        "unsafe_integer",
      ],
    ];
    for (const [mutate, field, valueType] of cases) {
      const payload = fixture();
      mutate(payload);
      const error = await rejection(normalizeCurrentFinishedFixture(payload, 9001));
      expect(error).toBeInstanceOf(CurrentPerformanceError);
      expect({ code: error.code, diagnostic: error.diagnostic }).toEqual({
        code: "invalid_provider_id",
        diagnostic: { field, valueType },
      });
      expect(JSON.stringify(error.diagnostic)).not.toContain("sb_secret_like_value");
    }
    const detail = fixture();
    Object.assign(detail.data.lineups[4]!.details[2]!.data, { value: "7" });
    expect((await rejection(normalizeCurrentFinishedFixture(detail, 9001))).diagnostic).toEqual({
      field: "data.lineups[4].details[2].data.value",
      typeId: CURRENT_PERFORMANCE_TYPES[2],
      valueType: "numeric_string",
    });
    expect(providerValueType(Number.NaN)).toBe("non_finite_number");
    expect(providerValueType([1])).toBe("array");
    expect(providerValueType({})).toBe("object");
    expect(providerValueType(true)).toBe("boolean");
    expect(providerValueType(19874708)).toBe("number");
  });

  test("every other rejection of the payload names where it stopped", async () => {
    type Payload = ReturnType<typeof fixture>;
    const cases: Array<[(payload: Payload) => void, string, Record<string, unknown>]> = [
      [
        (p) => ((p.data.lineups as unknown[])[3] = null),
        "invalid_provider_object",
        { field: "data.lineups[3]", valueType: "null" },
      ],
      [
        (p) => delete (p.data as Record<string, unknown>).state,
        "invalid_provider_object",
        { field: "data.state", valueType: "missing" },
      ],
      [
        (p) => Object.assign(p.data.lineups[6]!.details[3]!, { data: [] }),
        "invalid_provider_object",
        { field: "data.lineups[6].details[3].data", valueType: "array" },
      ],
      [
        (p) => Object.assign(p.data.lineups[9]!, { fixture_id: 9002 }),
        "lineup_identity_mismatch",
        { field: "data.lineups[9]" },
      ],
      [
        (p) => Object.assign(p.data.lineups[1]!, { id: 1 }),
        "lineup_identity_mismatch",
        { field: "data.lineups[1]" },
      ],
      [
        (p) => Object.assign(p.data.lineups[0]!.details[0]!, { player_id: 999 }),
        "detail_identity_mismatch",
        { field: "data.lineups[0].details[0]" },
      ],
      [
        (p) => p.data.lineups[5]!.details.push({ ...p.data.lineups[5]!.details[0]!, id: 1 }),
        "duplicate_provider_detail",
        {
          field: `data.lineups[5].details[${CURRENT_PERFORMANCE_TYPES.length}]`,
          typeId: CURRENT_PERFORMANCE_TYPES[0],
        },
      ],
      // Absent details are no statistics (an unused substitute's shape); a
      // value that is not a list breaks the contract.
      [
        (p) => Object.assign(p.data.lineups[8]!, { details: { 119: 90 } }),
        "current_statistics_incomplete",
        { fixtureExternalId: "9001", field: "data.lineups[8].details", valueType: "object" },
      ],
      [
        (p) => ((p.data.scores as unknown[])[1] = "1-0"),
        "invalid_provider_object",
        { field: "data.scores[1]", valueType: "string" },
      ],
      [
        (p) => Object.assign(p.data.scores[3]!, { score: null }),
        "invalid_provider_object",
        { field: "data.scores[3].score", valueType: "null" },
      ],
    ];
    for (const [mutate, code, diagnostic] of cases) {
      const payload = fixture();
      mutate(payload);
      const error = await rejection(normalizeCurrentFinishedFixture(payload, 9001));
      expect({ code: error.code, diagnostic: error.diagnostic }).toEqual({ code, diagnostic });
    }
  });

  test("an unnamed player is reported by field, role, club and minutes on a fixture that is accepted", async () => {
    const payload = withBench(fixture(), 4);
    // A starter listed with `player_id: null` (BG-0011) and a substitute who
    // came on, whose id is absent altogether.
    Object.assign(payload.data.lineups[4]!, { player_id: null });
    const substitute = {
      ...payload.data.lineups[21]!,
      id: 23,
      type_id: 12,
      details: [{ id: 1, type_id: 119, data: { value: 17 } }],
    } as Record<string, unknown>;
    delete substitute.player_id;
    payload.data.lineups.push(substitute as (typeof payload.data.lineups)[number]);
    const normalized = await normalizeCurrentFinishedFixture(payload, 9001);
    expect(normalized.rows).toHaveLength(21 + 4);
    expect(normalized.rows.map((player) => player.externalPlayerId)).not.toContain("104");
    expect(normalized.coverage).toMatchObject({
      excludedIncompleteRows: 2,
      anonymousStarterRows: 1,
      starterRows: 21,
    });
    // Evidence only: the database digest covers rows and coverage, never this.
    expect(normalized.coverage).not.toHaveProperty("unnamedRows");
    expect(normalized.unnamedRows).toEqual([
      {
        field: "data.lineups[4].player_id",
        valueType: "null",
        role: "starter",
        teamExternalId: "10",
        minutes: 90,
      },
      {
        field: "data.lineups[26].player_id",
        valueType: "missing",
        role: "substitute",
        teamExternalId: "20",
        minutes: 17,
      },
    ]);
    // Present but malformed is a defect, not an unidentified player.
    const malformed = fixture();
    Object.assign(malformed.data.lineups[4]!, { player_id: "104" });
    expect((await rejection(normalizeCurrentFinishedFixture(malformed, 9001))).diagnostic).toEqual({
      field: "data.lineups[4].player_id",
      valueType: "numeric_string",
    });
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
    expect(normalized.unnamedRows.map((entry) => [entry.field, entry.role])).toEqual([
      ["data.lineups[3].player_id", "starter"],
      ["data.lineups[5].player_id", "starter"],
      ["data.lineups[14].player_id", "starter"],
      ["data.lineups[25].player_id", "substitute"],
    ]);
  });
  test("more than 4 unnamed starters: the fixture waits, and says why with counts", async () => {
    const tooMany = withBench(fixture(), 6);
    for (const index of [0, 1, 2, 11, 12]) unnamedRow(tooMany, index);
    unnamedRow(tooMany, 27);
    const error = await rejection(normalizeCurrentFinishedFixture(tooMany, 9001));
    expect(error).toMatchObject({
      code: "current_lineup_unidentified_starters_exceeded",
      diagnostic: { fixtureExternalId: "9001", unidentifiedStarters: 5, unidentifiedOthers: 1 },
    });
    const rows = error.diagnostic?.rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({
      field: "data.lineups[0].player_id",
      valueType: "null",
      role: "starter",
      teamExternalId: "10",
      minutes: null,
    });
  });
  test("an unnamed starter must fit its club's 11", async () => {
    // A home starter reported unnamed under the away club: the home side
    // then fields 10 and the away side 12.
    const misplaced = withBench(fixture(), 2);
    unnamedRow(misplaced, 3);
    misplaced.data.lineups[3]!.team_id = 20;
    await expect(normalizeCurrentFinishedFixture(misplaced, 9001)).rejects.toMatchObject({
      code: "current_starters_incomplete",
      diagnostic: {
        fixtureExternalId: "9001",
        teamExternalId: "10",
        namedStarters: 10,
        unnamedStarters: 0,
        unplacedUnnamedStarters: 0,
      },
    });
  });
  test("a bad provider id names its field", async () => {
    // 2026-09-25: every run since the first finished match reported only
    // `invalid_provider_id`, so nobody could tell which value was wrong.
    const badDetail = fixture();
    (badDetail.data.lineups[0].details[0] as { lineup_id: number | null }).lineup_id = null;
    await expect(normalizeCurrentFinishedFixture(badDetail, 9001)).rejects.toMatchObject({
      code: "invalid_provider_id",
      diagnostic: { field: "data.lineups[0].details[0].lineup_id", valueType: "null" },
    });
  });
  test("requires reviewed manual main execution and never enables a schedule", () => {
    expect(currentPerformanceGuard(env).expectedCommit).toBe(env.EXPECTED_COMMIT);
    expect(currentPerformanceGuard(env).mode).toBe("ingest");
    expect(
      currentPerformanceGuard({ ...env, CONFIRMATION: "DIAGNOSE_CURRENT_FINISHED_PERFORMANCES" })
        .mode,
    ).toBe("diagnose");
    expect(() => currentPerformanceGuard({ ...env, CONFIRMATION: "diagnose" })).toThrow(
      "current_performance_dispatch_guard_failed",
    );
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
  // Run 36082097891 (2026-09-25): one payload failing `invalid_provider_id`
  // held back the whole page. Each fixture is written in its own database
  // transaction, so a fixture that cannot be certified is now reported with
  // its reason while the complete ones are published.
  test("reads every fixture in the page before the first write, and writes only the complete ones", async () => {
    const { client, calls } = batchClient({
      items: [
        { externalFixtureId: "9001", kickoffAt: "2026-09-24T20:00:00+00:00" },
        { externalFixtureId: "9002", kickoffAt: "2026-09-24T17:00:00+00:00" },
        { externalFixtureId: "9003", kickoffAt: "soon" },
      ],
    });
    const result = await runCurrentPerformanceBatch(
      client,
      "test-provider-token",
      null,
      async (path) => {
        calls.push(`fetch ${path.slice(-4)}`);
        const payload = fixture(Number(path.slice(-4)));
        // A starter with no statistics at all: not in yet (no minutes played).
        if (path.endsWith("9002")) payload.data.lineups[0].details = [];
        // 21 starters: the shared normalizer's own refusal, with its counts.
        if (path.endsWith("9003")) payload.data.lineups[0].type_id = 12;
        return payload;
      },
    );
    expect(calls).toEqual([
      "football_current_performance_fixture_batch",
      "fetch 9001",
      "fetch 9002",
      "fetch 9003",
      "ingest_current_player_fixture_performance 9001",
    ]);
    expect(result).toMatchObject({
      verdict: "incomplete",
      fixturesListed: 3,
      fixturesProcessed: 1,
      incomplete: [
        {
          fixtureExternalId: "9002",
          kickoffAt: "2026-09-24T17:00:00+00:00",
          stage: "validation",
          code: "current_starter_minutes_missing",
          diagnostic: { fixtureExternalId: "9002", starterRows: 1 },
        },
        {
          fixtureExternalId: "9003",
          // A time the listing cannot vouch for is left out rather than guessed.
          kickoffAt: null,
          stage: "validation",
          code: "historical_fixture_coverage_incomplete",
          diagnostic: { starterRows: 21, failures: ["raw_starter_rows_mismatch"] },
        },
      ],
    });
  });

  test("a database refusal for one fixture keeps its stable code and does not stop the next", async () => {
    const { client, calls } = batchClient({
      items: [{ externalFixtureId: "9001" }, { externalFixtureId: "9002" }],
      ingest: (fixtureId) =>
        fixtureId === "9001"
          ? {
              data: null,
              error: { code: "P0002", message: "PLAYER_MAPPING_NOT_FOUND" },
            }
          : undefined,
    });
    const result = await runCurrentPerformanceBatch(
      client,
      "test-provider-token",
      null,
      async (path) => fixture(path.endsWith("9001") ? 9001 : 9002),
    );
    expect(calls.filter((call) => call.startsWith("ingest"))).toEqual([
      "ingest_current_player_fixture_performance 9001",
      "ingest_current_player_fixture_performance 9002",
    ]);
    expect(result).toMatchObject({ verdict: "incomplete", fixturesProcessed: 1 });
    expect(result.incomplete).toEqual([
      {
        fixtureExternalId: "9001",
        kickoffAt: null,
        stage: "database",
        code: "current_performance_rpc_failed",
        diagnostic: {
          rpcName: "ingest_current_player_fixture_performance",
          sqlState: "P0002",
          reason: "PLAYER_MAPPING_NOT_FOUND",
        },
      },
    ]);

    // A free-form database message is never copied into evidence.
    const noisy = batchClient({
      items: [{ externalFixtureId: "9001" }],
      ingest: () => ({
        data: null,
        error: { code: "XX000", message: "connection to 10.0.0.4 lost: password=hunter2" },
      }),
    });
    const refused = await runCurrentPerformanceBatch(noisy.client, "t", null, async () =>
      fixture(),
    );
    expect(JSON.stringify(refused)).not.toContain("hunter2");
    expect(refused.incomplete[0]?.diagnostic).toEqual({
      rpcName: "ingest_current_player_fixture_performance",
      sqlState: "XX000",
    });
  });

  test("a provider outage reports the rest of the page without fetching it again", async () => {
    const { client, calls } = batchClient({
      items: [
        { externalFixtureId: "9001" },
        { externalFixtureId: "9002" },
        { externalFixtureId: "9003" },
      ],
    });
    let fetches = 0;
    const result = await runCurrentPerformanceBatch(client, "t", null, async () => {
      fetches += 1;
      throw new SportsMonksProbeError("provider_access_denied");
    });
    expect(fetches).toBe(1);
    expect(calls).toEqual(["football_current_performance_fixture_batch"]);
    expect(
      result.incomplete.map((entry) => [entry.fixtureExternalId, entry.code, entry.attempted]),
    ).toEqual([
      ["9001", "provider_access_denied", undefined],
      ["9002", "provider_access_denied", false],
      ["9003", "provider_access_denied", false],
    ]);

    // A failure of one fixture's payload is not an outage: the next is still read.
    let reads = 0;
    const single = await runCurrentPerformanceBatch(
      batchClient({ items: [{ externalFixtureId: "9001" }, { externalFixtureId: "9002" }] }).client,
      "t",
      null,
      async (path) => {
        reads += 1;
        if (path.endsWith("9001")) throw new SportsMonksProbeError("invalid_provider_json");
        return fixture(9002);
      },
    );
    expect(reads).toBe(2);
    expect(single).toMatchObject({
      fixturesProcessed: 1,
      providerOutage: null,
      incomplete: [{ fixtureExternalId: "9001", stage: "provider", code: "invalid_provider_json" }],
    });
  });

  // The probe retries a 429 or 5xx itself, then throws `provider_http_<status>`:
  // that, not a code it can never throw, is what an outage looks like here.
  test("a provider that keeps answering 5xx or 429 is an outage; a 404 is one fixture's problem", async () => {
    for (const status of [503, 500, 429]) {
      let fetches = 0;
      const result = await runCurrentPerformanceBatch(
        batchClient({
          items: [
            { externalFixtureId: "9001" },
            { externalFixtureId: "9002" },
            { externalFixtureId: "9003" },
          ],
        }).client,
        "t",
        null,
        async () => {
          fetches += 1;
          throw new SportsMonksProbeError(`provider_http_${status}`);
        },
      );
      expect(fetches).toBe(1);
      expect(result.providerOutage).toBe(`provider_http_${status}`);
      expect(result.incomplete.map((entry) => entry.attempted)).toEqual([undefined, false, false]);
    }
    let reads = 0;
    const missing = await runCurrentPerformanceBatch(
      batchClient({ items: [{ externalFixtureId: "9001" }, { externalFixtureId: "9002" }] }).client,
      "t",
      null,
      async (path) => {
        reads += 1;
        if (path.endsWith("9001")) throw new SportsMonksProbeError("provider_http_404");
        return fixture(9002);
      },
    );
    expect(reads).toBe(2);
    expect(missing).toMatchObject({ fixturesProcessed: 1, providerOutage: null });
    expect(isProviderOutage("provider_http_404")).toBe(false);
    expect(isProviderOutage("provider_http_502")).toBe(true);
    expect(isProviderOutage("provider_attempts_exhausted")).toBe(false);
  });

  test("an outage an earlier page met is carried: the next page is listed, reported and not fetched", async () => {
    const { client, calls } = batchClient({
      items: [{ externalFixtureId: "9006" }, { externalFixtureId: "9007" }],
    });
    const result = await runCurrentPerformanceBatch(
      client,
      "t",
      "9005",
      async () => {
        throw Error("must not fetch");
      },
      { providerOutage: "provider_http_503" },
    );
    expect(calls).toEqual(["football_current_performance_fixture_batch"]);
    expect(result).toMatchObject({
      verdict: "incomplete",
      fixturesProcessed: 0,
      providerOutage: "provider_http_503",
      incomplete: [
        { fixtureExternalId: "9006", code: "provider_http_503", attempted: false },
        { fixtureExternalId: "9007", code: "provider_http_503", attempted: false },
      ],
    });
  });

  test("a malformed page is still a contract failure before any provider request", async () => {
    const { client } = batchClient({
      items: [{ externalFixtureId: "9001" }],
      hasMore: true,
      nextCursor: "9999",
    });
    await expect(
      runCurrentPerformanceBatch(client, "t", null, async () => {
        throw Error("must not fetch");
      }),
    ).rejects.toThrow("invalid_current_fixture_batch");
  });

  test("the read-only diagnostic validates like ingestion and never writes", async () => {
    const { client, calls } = batchClient({
      items: [{ externalFixtureId: "9001" }, { externalFixtureId: "9002" }],
    });
    const result = await runCurrentPerformanceBatch(
      client,
      "t",
      null,
      async (path) => {
        const payload = withBench(fixture(path.endsWith("9001") ? 9001 : 9002), 2);
        // One unnamed starter is within the rule; five are not.
        for (const index of path.endsWith("9001") ? [5] : [0, 1, 2, 11, 12])
          unnamedRow(payload, index);
        return payload;
      },
      { mode: "diagnose" },
    );
    expect(calls).toEqual(["football_current_performance_fixture_batch"]);
    expect(result).toMatchObject({
      verdict: "incomplete",
      writesAttempted: false,
      fixturesProcessed: 0,
      fixtures: [
        {
          fixtureExternalId: "9001",
          players: 23,
          unnamedRows: [{ field: "data.lineups[5].player_id", role: "starter" }],
        },
      ],
      incomplete: [
        {
          fixtureExternalId: "9002",
          stage: "validation",
          code: "current_lineup_unidentified_starters_exceeded",
          diagnostic: { unidentifiedStarters: 5, unidentifiedOthers: 0 },
        },
      ],
    });
    expect(manualRunExitCode(result)).toBe(1);
    const lineup = (result as { fixtures: Array<{ lineup: unknown[] }> }).fixtures[0]!.lineup;
    expect(lineup).toHaveLength(23);
    expect(lineup[0]).toEqual({ externalPlayerId: "100", externalTeamId: "10", started: true });
  });

  test("a one-fixture canary starts its page at that fixture and touches nothing else", async () => {
    const { client, calls, received } = batchClient({
      items: [{ externalFixtureId: "9001" }, { externalFixtureId: "9002" }],
      hasMore: true,
      nextCursor: "9002",
    });
    const fetched: string[] = [];
    const result = await runCurrentPerformanceBatch(
      client,
      "t",
      null,
      async (path) => {
        fetched.push(path.slice(-4));
        const payload = withBench(fixture(9001), 2);
        unnamedRow(payload, 5);
        return payload;
      },
      { onlyFixtureExternalId: "9001" },
    );
    expect(received[0]).toMatchObject({ p_after_fixture_external_id: "9000" });
    expect(fetched).toEqual(["9001"]);
    expect(calls).toEqual([
      "football_current_performance_fixture_batch",
      "ingest_current_player_fixture_performance 9001",
    ]);
    expect(result).toMatchObject({
      verdict: "pass",
      fixturesListed: 1,
      fixturesProcessed: 1,
      canaryFixtureExternalId: "9001",
      hasMore: false,
      nextCursor: null,
      fixtures: [{ fixtureExternalId: "9001", unnamedRows: [{ role: "starter" }] }],
    });
    expect(manualRunExitCode(result)).toBe(0);
    // The unnamed rows are evidence, never part of what the database digests.
    expect(received[1]!.p_coverage).not.toHaveProperty("unnamedRows");

    // Not listed (finished, current, gameweek not final): refused before any fetch.
    const notListed = batchClient({ items: [{ externalFixtureId: "9002" }] });
    await expect(
      runCurrentPerformanceBatch(
        notListed.client,
        "t",
        null,
        async () => {
          throw Error("must not fetch");
        },
        { onlyFixtureExternalId: "9001" },
      ),
    ).rejects.toMatchObject({
      code: "canary_fixture_not_listed",
      diagnostic: { fixtureExternalId: "9001" },
    });
    expect(notListed.calls).toEqual(["football_current_performance_fixture_batch"]);
    for (const [after, only] of [
      ["9000", "9001"],
      [null, "19874708x"],
    ] as const)
      await expect(
        runCurrentPerformanceBatch(client, "t", after, async () => fixture(), {
          onlyFixtureExternalId: only,
        }),
      ).rejects.toThrow("invalid_canary_fixture");
  });

  test("the manual run is red unless every listed fixture was certified", () => {
    expect(manualRunExitCode({ verdict: "pass" })).toBe(0);
    expect(manualRunExitCode({ verdict: "no_finished_fixtures" })).toBe(0);
    expect(manualRunExitCode({ verdict: "incomplete" })).toBe(1);
    expect(manualRunExitCode({ verdict: "fail" })).toBe(1);
    expect(manualRunExitCode({})).toBe(1);
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
        expect(query.include).toBe("lineups.details;state;participants;scores;events");
        return fixture();
      },
    );
    expect(result).toMatchObject({ verdict: "pass", fixturesProcessed: 1 });
    expect(calls).toEqual([
      "football_current_performance_fixture_batch",
      "ingest_current_player_fixture_performance",
    ]);
  });
  // Review of the 2026-09-25 merge of main: the merge kept the per-fixture
  // request without `scores`, and every real fixture would then have stopped
  // at `current_final_score_missing`. The fixtures here always carry scores,
  // whatever was asked for, so only the request itself can show it; and an
  // assertion inside the provider stub would be caught as that fixture's own
  // provider failure. So every request is recorded and checked afterwards.
  test("every provider request asks for the final score, in every mode", async () => {
    const requests: Array<{ path: string; query: Record<string, string> }> = [];
    const provider = async (path: string, query: Record<string, string>) => {
      requests.push({ path, query });
      if (path.endsWith("9003")) throw new SportsMonksProbeError("provider_http_404");
      return fixture(Number(path.slice(-4)));
    };
    const page = () =>
      batchClient({
        items: [
          { externalFixtureId: "9001" },
          { externalFixtureId: "9002" },
          { externalFixtureId: "9003" },
          { externalFixtureId: "9004" },
        ],
        hasMore: true,
        nextCursor: "9004",
      }).client;
    const runs = [
      // A page, as the manual run and every orchestrator pass read it; 9003 is
      // one fixture's provider failure, and 9004 is still read after it.
      await runCurrentPerformanceBatch(page(), "t", null, provider),
      // A later page.
      await runCurrentPerformanceBatch(
        batchClient({ items: [{ externalFixtureId: "9006" }] }).client,
        "t",
        "9004",
        provider,
      ),
      // The read-only diagnostic.
      await runCurrentPerformanceBatch(page(), "t", null, provider, { mode: "diagnose" }),
      // The one-fixture canary, ingesting and read-only.
      await runCurrentPerformanceBatch(page(), "t", null, provider, {
        onlyFixtureExternalId: "9001",
      }),
      await runCurrentPerformanceBatch(page(), "t", null, provider, {
        mode: "diagnose",
        onlyFixtureExternalId: "9001",
      }),
    ];
    expect(requests.map((entry) => entry.path)).toEqual(
      [
        ...["9001", "9002", "9003", "9004"],
        "9006",
        ...["9001", "9002", "9003", "9004"],
        "9001",
        "9001",
      ].map((fixtureId) => `/v3/football/fixtures/${fixtureId}`),
    );
    for (const { query } of requests)
      expect(query).toEqual({
        include: "lineups.details;state;participants;scores;events",
        filters: `lineupDetailTypes:${CURRENT_PERFORMANCE_TYPES.join(",")}`,
      });
    // Every fixture the stub answered validated; only 9003's 404 is a gap.
    expect(runs.map((run) => run.verdict)).toEqual([
      "incomplete",
      "pass",
      "incomplete",
      "pass",
      "pass",
    ]);
    for (const run of runs)
      for (const gap of run.incomplete)
        expect(gap).toMatchObject({ fixtureExternalId: "9003", code: "provider_http_404" });

    // The request above is this module's only one: a new provider call site
    // has to join the modes listed here.
    const source = readFileSync(
      new URL("./current-season-performances.ts", import.meta.url),
      "utf8",
    );
    expect(source.match(/\brequest\(/g)).toHaveLength(1);
  });
  test("a database refusal keeps its own reason code, and nothing else", async () => {
    // Each fixture is written on its own, so a refusal is that fixture's
    // `incomplete[]` entry rather than a failure of the page.
    const refusing = (message: string) =>
      batchClient({
        items: [{ externalFixtureId: "9001" }],
        ingest: () => ({ data: null, error: { code: "22023", message } }),
      }).client;
    const mismatch = await runCurrentPerformanceBatch(
      refusing("CURRENT_GOALS_CONCEDED_MISMATCH"),
      "test-provider-token",
      null,
      async () => fixture(),
    );
    expect(mismatch).toMatchObject({ verdict: "incomplete", fixturesProcessed: 0 });
    expect(mismatch.incomplete).toEqual([
      {
        fixtureExternalId: "9001",
        kickoffAt: null,
        stage: "database",
        code: "current_performance_rpc_failed",
        diagnostic: {
          rpcName: "ingest_current_player_fixture_performance",
          sqlState: "22023",
          reason: "CURRENT_GOALS_CONCEDED_MISMATCH",
        },
      },
    ]);
    const free = await runCurrentPerformanceBatch(
      refusing("relation app.x does not exist at 10.0.0.1"),
      "test-provider-token",
      null,
      async () => fixture(),
    );
    expect(free.incomplete[0]).toMatchObject({ code: "current_performance_rpc_failed" });
    expect(free.incomplete[0]?.diagnostic).not.toHaveProperty("reason");
    expect(JSON.stringify(free)).not.toContain("10.0.0.1");
  });
});

describe("shortened starters and reconciled goal timelines", () => {
  function timeline() {
    const payload = withScore(fixture(), 1, 3);
    setDetail(payload, 0, 119, 84);
    setDetail(payload, 0, 52, 1);
    setDetail(payload, 11, 52, 3);
    payload.data.lineups[0]!.details = payload.data.lineups[0]!.details.filter(
      (d) => d.type_id !== 88,
    );
    return {
      data: {
        ...payload.data,
        events: [
          { id: 1, fixture_id: 9001, participant_id: 20, type_id: 14, minute: 9 },
          { id: 2, fixture_id: 9001, participant_id: 10, type_id: 14, minute: 45, extra_minute: 2 },
          { id: 3, fixture_id: 9001, participant_id: 20, type_id: 14, minute: 47 },
          { id: 4, fixture_id: 9001, participant_id: 20, type_id: 14, minute: 55 },
          { id: 5, fixture_id: 9001, participant_id: 10, type_id: 18, minute: 60 },
        ],
      },
    };
  }
  test("Azhari: all three goals before the first departure remove the false clean sheet", async () => {
    const result = await normalizeCurrentFinishedFixture(timeline(), 9001);
    expect(result.rows[0]).toMatchObject({
      minutes: 84,
      goals: 1,
      goalsConceded: 3,
      cleanSheets: 0,
    });
    expect(result.coverage).toMatchObject({ goalsConcededFromTimeline: 1 });
  });
  test("timeline overrides a contradictory explicit zero", async () => {
    const payload = timeline();
    setDetail(payload, 0, 88, 0);
    expect((await normalizeCurrentFinishedFixture(payload, 9001)).rows[0]!.cleanSheets).toBe(0);
  });
  for (const scenario of [
    "missing",
    "duplicate",
    "same minute",
    "early red",
    "wrong fixture",
    "own goal",
    "no departure",
    "official minutes",
  ] as const) {
    test(`does not derive a clean sheet from an uncertain timeline: ${scenario}`, async () => {
      const payload = timeline();
      if (scenario === "missing") payload.data.events.splice(0, 1);
      if (scenario === "duplicate") payload.data.events[1]!.id = 1;
      if (scenario === "same minute") payload.data.events[4]!.minute = 55;
      if (scenario === "early red") {
        payload.data.events[4]!.type_id = 20;
        payload.data.events[4]!.minute = 50;
      }
      if (scenario === "wrong fixture") payload.data.events[0]!.fixture_id = 9002;
      if (scenario === "own goal") payload.data.events[0]!.type_id = 15;
      if (scenario === "no departure") payload.data.events.pop();
      if (scenario === "official minutes") {
        setDetail(payload, 0, 119, 60);
        payload.data.events[3]!.minute = 60;
        payload.data.events[4]!.minute = 75;
      }
      await expect(normalizeCurrentFinishedFixture(payload, 9001)).rejects.toMatchObject({
        code: "current_defensive_statistics_incomplete",
      });
    });
  }
  test("the failure says why the timeline could not prove the concession, in numbers only", async () => {
    const noDeparture = timeline();
    noDeparture.data.events.pop();
    await expect(normalizeCurrentFinishedFixture(noDeparture, 9001)).rejects.toMatchObject({
      code: "current_defensive_statistics_incomplete",
      diagnostic: {
        fixtureExternalId: "9001",
        playerExternalId: "100",
        teamExternalId: "10",
        minutes: 84,
        goalsConcededByTeam: 3,
        explicitGoalsConceded: false,
        timeline: null,
      },
    });
    // The last goal falls on the player's own last minute: not provably before it.
    const late = timeline();
    setDetail(late, 0, 119, 60);
    late.data.events[3]!.minute = 60;
    late.data.events[4]!.minute = 75;
    await expect(normalizeCurrentFinishedFixture(late, 9001)).rejects.toMatchObject({
      diagnostic: {
        minutes: 60,
        timeline: { lastConcededGoalMinute: 60, firstDepartureMinute: 75 },
      },
    });
  });
});

// Diagnose-only evidence: what the provider says each named lineup player did, by
// ids and type ids. It changes nothing that is ingested.
describe("lineup participation evidence", () => {
  const HOME_BENCH = 200;
  const AWAY_BENCH = 201;
  const indexOf = (playerId: number) => 22 + (playerId - 200);
  /** Two bench players, no rating; 200 (club 10) has no statistics at all, 201 explicit zeros. */
  const bench = (bare = true) => {
    const payload = withBench(fixture(), 2);
    for (const playerId of [HOME_BENCH, AWAY_BENCH]) {
      const lineup = payload.data.lineups[indexOf(playerId)]!;
      lineup.details = lineup.details.filter((detail) => detail.type_id !== 118);
    }
    if (bare) payload.data.lineups[indexOf(HOME_BENCH)]!.details = [];
    return payload;
  };
  /** Gives 200 the statistic as well as 20 minutes, so the fixture is still valid. */
  const cameOn = (payload: ReturnType<typeof fixture>, typeId: number, value = 1) => {
    setDetail(payload, indexOf(HOME_BENCH), 119, 20);
    setDetail(
      payload,
      indexOf(HOME_BENCH),
      typeId as (typeof CURRENT_PERFORMANCE_TYPES)[number],
      value,
    );
    return payload;
  };
  const factsOf = async (payload: ReturnType<typeof fixture>, playerId = HOME_BENCH) => {
    const normalized = await normalizeCurrentFinishedFixture(payload, 9001);
    return normalized.participation.find((entry) => entry.externalPlayerId === String(playerId))!;
  };

  test("a substitute with no statistics at all: minutes absent, nothing else", async () => {
    expect(await factsOf(bench())).toEqual({
      externalPlayerId: "200",
      externalTeamId: "10",
      role: "substitute",
      positionId: null,
      officialMinutes: null,
      scoringStatisticTypeIds: [],
      unknownStatisticTypeIds: [],
      zeroStatisticTypeIds: [],
      eventTypeIds: [],
    });
  });

  test("a substitute with an explicit zero: minutes 0 and the explicit zeros, no scoring type", async () => {
    expect(await factsOf(bench(), AWAY_BENCH)).toEqual({
      externalPlayerId: "201",
      externalTeamId: "20",
      role: "substitute",
      positionId: null,
      officialMinutes: 0,
      scoringStatisticTypeIds: [],
      unknownStatisticTypeIds: [],
      zeroStatisticTypeIds: [52, 57, 79, 83, 84, 85, 88, 112, 113, 119, 324],
      eventTypeIds: [],
    });
  });

  test("the provider's position id is carried as sent, and a missing or unusable one stays null", async () => {
    for (const [sent, expected] of [
      [25, 25],
      [27, 27],
      [undefined, null],
      [null, null],
      [0, null],
      [-3, null],
      ["25", null],
      [2.5, null],
    ] as const) {
      const payload = bench();
      (payload.data.lineups[indexOf(HOME_BENCH)] as Record<string, unknown>).position_id = sent;
      expect((await factsOf(payload)).positionId).toBe(expected);
    }
  });

  test("a starter is reported as a starter, with his minutes", async () => {
    const facts = await factsOf(bench(), 100);
    // His rating (type 118) is a scoring-relevant value above zero.
    expect(facts).toMatchObject({
      role: "starter",
      officialMinutes: 90,
      scoringStatisticTypeIds: [118],
    });
  });

  test("minutes above zero are reported", async () => {
    const payload = bench(false);
    setDetail(payload, indexOf(HOME_BENCH), 119, 20);
    expect((await factsOf(payload)).officialMinutes).toBe(20);
  });

  // Each of these is a value above zero on a substitute who came on.
  for (const [label, typeId] of [
    ["a yellow card", 84],
    ["a red card", 83],
    ["a second yellow", 85],
    ["an assist", 79],
    ["a missed penalty", 112],
    ["a save", 57],
    ["a saved penalty", 113],
    ["goals conceded", 88],
    ["a provider rating", 118],
  ] as const)
    test(`${label} is reported as a scoring-relevant type`, async () => {
      const facts = await factsOf(cameOn(bench(false), typeId, typeId === 118 ? 6 : 1));
      expect(facts.scoringStatisticTypeIds).toEqual([typeId]);
      expect(facts.officialMinutes).toBe(20);
    });

  test("a goal is reported", async () => {
    const payload = withScore(cameOn(bench(false), 52), 1, 0);
    expect((await factsOf(payload)).scoringStatisticTypeIds).toEqual([52]);
  });

  test("an own goal is reported", async () => {
    const payload = withScore(cameOn(bench(false), 324), 0, 1);
    expect((await factsOf(payload)).scoringStatisticTypeIds).toEqual([324]);
  });

  test("an explicit null goalkeeper statistic is unknown, not zero", async () => {
    const payload = bench();
    const lineup = payload.data.lineups[indexOf(AWAY_BENCH)]!;
    for (const detail of lineup.details)
      if (detail.type_id === 57 || detail.type_id === 113)
        (detail.data as { value: number | null }).value = null;
    const facts = await factsOf(payload, AWAY_BENCH);
    expect(facts.unknownStatisticTypeIds).toEqual([57, 113]);
    expect(facts.zeroStatisticTypeIds).not.toContain(57);
    expect(facts.zeroStatisticTypeIds).not.toContain(113);
  });

  test("a match event that names a player is reported by type id, for either side of it", async () => {
    const payload = bench();
    (payload.data as unknown as { events: unknown[] }).events = [
      { id: 1, fixture_id: 9001, type_id: 19, participant_id: 10, player_id: 200, minute: 80 },
      {
        id: 2,
        fixture_id: 9001,
        type_id: 18,
        participant_id: 20,
        player_id: 100,
        related_player_id: 201,
        minute: 70,
      },
    ];
    const normalized = await normalizeCurrentFinishedFixture(payload, 9001);
    const events = (id: string) =>
      normalized.participation.find((entry) => entry.externalPlayerId === id)?.eventTypeIds;
    expect(events("200")).toEqual([19]);
    expect(events("201")).toEqual([18]);
    expect(events("100")).toEqual([18]);
    expect(events("101")).toEqual([]);
  });

  test("an unnamed row has no entry", async () => {
    const payload = bench();
    unnamedRow(payload, indexOf(HOME_BENCH));
    const normalized = await normalizeCurrentFinishedFixture(payload, 9001);
    expect(normalized.participation).toHaveLength(23);
    expect(normalized.unnamedRows).toHaveLength(1);
  });

  test("diagnose carries the evidence for every named player and writes nothing", async () => {
    const { client, calls } = batchClient({ items: [{ externalFixtureId: "9001" }] });
    const result = (await runCurrentPerformanceBatch(
      client,
      "t",
      null,
      async () => {
        const payload = bench();
        // A name and an unrelated field the provider might send: neither may appear.
        (
          payload.data.lineups[indexOf(HOME_BENCH)] as unknown as Record<string, unknown>
        ).player_name = "Secret Name";
        (payload.data as unknown as Record<string, unknown>).name = "Secret Match";
        return payload;
      },
      { mode: "diagnose", onlyFixtureExternalId: "9001" },
    )) as unknown as {
      writesAttempted: boolean;
      fixtures: Array<{ participation: LineupParticipation[]; lineup: unknown[] }>;
    };
    expect(result.writesAttempted).toBe(false);
    expect(calls).toEqual(["football_current_performance_fixture_batch"]);
    const evidence = result.fixtures[0]!;
    expect(evidence.participation).toHaveLength(24);
    expect(evidence.participation.find((entry) => entry.externalPlayerId === "200")?.role).toBe(
      "substitute",
    );
    // The lineup list the owner already reads is unchanged.
    expect(evidence.lineup[0]).toEqual({
      externalPlayerId: "100",
      externalTeamId: "10",
      started: true,
    });
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/Secret|player_name/);
    for (const entry of evidence.participation)
      expect(Object.keys(entry).sort()).toEqual([
        "eventTypeIds",
        "externalPlayerId",
        "externalTeamId",
        "officialMinutes",
        "positionId",
        "role",
        "scoringStatisticTypeIds",
        "unknownStatisticTypeIds",
        "zeroStatisticTypeIds",
      ]);
  });

  // Ingestion is exactly what it was: the database is called with the rows and the
  // coverage the normalizer always produced, and nothing else.
  const COVERAGE_KEYS = [
    "absentStatisticsCountedAsZero",
    "anonymousStarterRows",
    "cleanSheetSource",
    "detailRows",
    "excludedIncompleteRows",
    "goalkeeperStatistics",
    "goalsConcededFromFinalScore",
    "identifiedStarterRows",
    "invalidDetailRows",
    "lineupRowsSeen",
    "missingStatisticRows",
    "scoringStatisticsComplete",
    "starterRows",
    "teamCount",
    "validPlayerRows",
  ];
  for (const [label, options] of [
    ["a page", {}],
    ["the orchestrator's pass", { mode: "ingest" as const }],
    ["a one-fixture canary", { onlyFixtureExternalId: "9001" }],
  ] as const)
    test(`${label} calls the ingest function with the same arguments as before`, async () => {
      const { client, received } = batchClient({ items: [{ externalFixtureId: "9001" }] });
      const result = await runCurrentPerformanceBatch(
        client,
        "t",
        null,
        async () => bench(),
        options,
      );
      const ingest = received.filter((args) => "p_rows" in args);
      expect(ingest).toHaveLength(1);
      const normalized = await normalizeCurrentFinishedFixture(bench(), 9001);
      expect(Object.keys(ingest[0]!).sort()).toEqual([
        "p_coverage",
        "p_fixture_external_id",
        "p_observed_at",
        "p_provider_name",
        "p_rows",
        "p_season_external_id",
      ]);
      expect(ingest[0]!.p_rows).toEqual(normalized.rows);
      expect(ingest[0]!.p_coverage).toEqual(normalized.coverage);
      expect(Object.keys(ingest[0]!.p_coverage as object).sort()).toContain("validPlayerRows");
      for (const key of Object.keys(ingest[0]!.p_coverage as object))
        expect(COVERAGE_KEYS).toContain(key);
      expect(JSON.stringify(ingest[0])).not.toMatch(/participation|verifiedUnused|eventTypeIds/);
      expect(result).toMatchObject({ verdict: "pass", fixturesProcessed: 1 });
      // The evidence of an ingest run has no participation field either.
      expect(JSON.stringify(result)).not.toMatch(/participation/);
    });

  test("adaptive ingestion sends the same coverage plus only the adaptive evidence", async () => {
    const { client, received } = batchClient({ items: [{ externalFixtureId: "9001" }] });
    const wrapped = {
      schema: (name: "api") => ({
        rpc: async (rpcName: string, args: Record<string, unknown>) => {
          const answer = await client.schema(name).rpc(rpcName, args);
          return rpcName === "football_current_performance_fixture_batch"
            ? { ...answer, data: { ...(answer.data as object), adaptive: true } }
            : answer;
        },
      }),
    };
    await runCurrentPerformanceBatch(wrapped, "t", null, async () => bench(), {});
    const coverage = received.find((args) => "p_rows" in args)!.p_coverage as Record<
      string,
      unknown
    >;
    expect(Object.keys(coverage).filter((key) => !COVERAGE_KEYS.includes(key))).toEqual([
      "adaptiveFieldEvidence",
    ]);
  });
});

// The owner-approved exception, importer side: only the exact players an approved
// allowlist entry names, only on a one-fixture run, only while the provider's facts
// still show them unused, and only if the database leaves out exactly those players.
describe("scoped verified-unused exception", () => {
  const PREFLIGHT = Buffer.from("the reviewed preflight record");
  const PREFLIGHT_SHA = createHash("sha256").update(PREFLIGHT).digest("hex");
  const entry = (patch: Partial<VerifiedUnusedException> = {}): VerifiedUnusedException => ({
    fixtureExternalId: "9001",
    externalPlayerId: "200",
    status: "approved",
    preflightRecord: "docs/production/preflight.md",
    preflightSha256: PREFLIGHT_SHA,
    approvedBy: "owner",
    approvedAt: "2026-10-01T15:00:00Z",
    ...patch,
  });
  const readPreflightRecord = () => PREFLIGHT;
  const indexOf = (playerId: number) => 22 + (playerId - 200);
  /** Bench players 200 (club 10) and 201 (club 20), both unused: 200 with no statistics at all. */
  const bench = () => {
    const payload = withBench(fixture(), 2);
    for (const playerId of [200, 201]) {
      const lineup = payload.data.lineups[indexOf(playerId)]!;
      lineup.details = lineup.details.filter((detail) => detail.type_id !== 118);
    }
    payload.data.lineups[indexOf(200)]!.details = [];
    return payload;
  };
  const run = async (options: {
    allowlist: VerifiedUnusedException[];
    only?: string | null;
    mode?: "ingest" | "diagnose";
    adaptive?: boolean;
    payload?: () => ReturnType<typeof fixture>;
    ingest?: (fixtureId: string) => RpcAnswer | undefined;
    read?: (path: string) => Uint8Array;
  }) => {
    const { client, calls, received } = batchClient({
      items: [{ externalFixtureId: "9001" }],
      ingest: options.ingest,
    });
    const wrapped = options.adaptive
      ? {
          schema: (name: "api") => ({
            rpc: async (rpcName: string, args: Record<string, unknown>) => {
              const answer = await client.schema(name).rpc(rpcName, args);
              return rpcName === "football_current_performance_fixture_batch"
                ? { ...answer, data: { ...(answer.data as object), adaptive: true } }
                : answer;
            },
          }),
        }
      : client;
    const result = (await runCurrentPerformanceBatch(
      wrapped,
      "t",
      null,
      async () => (options.payload ?? bench)(),
      {
        ...(options.only === null ? {} : { onlyFixtureExternalId: options.only ?? "9001" }),
        ...(options.mode ? { mode: options.mode } : {}),
        verifiedUnusedAllowlist: options.allowlist,
        readPreflightRecord: options.read ?? readPreflightRecord,
      },
    )) as unknown as {
      verdict: string;
      fixtures: Array<Record<string, unknown>>;
      incomplete: Array<Record<string, unknown>>;
    };
    const ingest = received.find((args) => "p_rows" in args);
    return { result, calls, ingest };
  };
  const leftOut = (ids: unknown, active = 23): RpcAnswer => ({
    data: {
      active,
      reconciled: true,
      scoringStatisticsComplete: true,
      sourceVersion: `sportsmonks-current-fixture:${"c".repeat(64)}`,
      ...(ids === undefined ? {} : { excludedVerifiedUnusedUnmapped: ids }),
    },
    error: null,
  });
  /** The ordinary 22 starters under fixture id 19874711, with no 38227322 in the lineup. */
  const bench19874711 = () => fixture(19874711);
  const facts200 = {
    externalPlayerId: "200",
    externalTeamId: "10",
    role: "substitute" as const,
    officialMinutes: null,
    scoringStatisticTypeIds: [],
    unknownStatisticTypeIds: [],
    zeroStatisticTypeIds: [],
    eventTypeIds: [],
  };

  test("an approved entry is declared on a one-fixture run: that player only, with his digests", async () => {
    const { result, ingest } = await run({
      allowlist: [entry()],
      ingest: () => leftOut(["200"]),
    });
    const coverage = ingest!.p_coverage as Record<string, unknown>;
    // 201 is just as unused, but nobody approved him: he is not declared.
    expect(coverage.verifiedUnusedSubstitutes).toEqual([
      {
        fixtureExternalId: "9001",
        externalPlayerId: "200",
        externalTeamId: "10",
        role: "substitute",
        officialMinutes: null,
        scoringStatisticTypeIds: [],
        unknownStatisticTypeIds: [],
        eventTypeIds: [],
        zeroStatisticTypeIds: [],
        evidenceDigest: evidenceDigest("9001", facts200),
        preflightDigest: PREFLIGHT_SHA,
      },
    ]);
    // The rows are untouched: the database removes his row, never this script.
    expect((ingest!.p_rows as unknown[]).length).toBe(24);
    expect(result).toMatchObject({
      verdict: "pass",
      fixtures: [
        {
          fixtureExternalId: "9001",
          players: 23,
          excludedVerifiedUnusedUnmapped: [
            {
              externalPlayerId: "200",
              evidenceDigest: evidenceDigest("9001", facts200),
              preflightDigest: PREFLIGHT_SHA,
            },
          ],
        },
      ],
    });
  });

  test("the limit is on the approved list: eight unused substitutes, one approved", async () => {
    const payload = () => {
      const base = withBench(fixture(), 8);
      for (let index = 0; index < 8; index += 1) {
        const lineup = base.data.lineups[22 + index]!;
        lineup.details = lineup.details.filter((detail) => detail.type_id !== 118);
      }
      return base;
    };
    const { result, ingest } = await run({
      allowlist: [entry()],
      payload,
      ingest: () => leftOut(["200"], 29),
    });
    expect(
      (ingest!.p_coverage as { verifiedUnusedSubstitutes: unknown[] }).verifiedUnusedSubstitutes,
    ).toHaveLength(1);
    expect(result.verdict).toBe("pass");
  });

  test("a PROPOSED entry is never declared", async () => {
    const { ingest } = await run({
      allowlist: [entry({ status: "proposed", approvedBy: null, approvedAt: null })],
    });
    expect("verifiedUnusedSubstitutes" in (ingest!.p_coverage as object)).toBe(false);
  });

  test("an entry for another fixture or another player is never declared", async () => {
    for (const patch of [{ fixtureExternalId: "9002" }, { externalPlayerId: "201" }]) {
      const { ingest } = await run({
        allowlist: [entry(patch)],
        ingest: () => (patch.externalPlayerId ? leftOut(["201"]) : undefined),
      });
      if (patch.fixtureExternalId)
        expect("verifiedUnusedSubstitutes" in (ingest!.p_coverage as object)).toBe(false);
    }
  });

  test("a page or an orchestrator pass never declares, whatever the allowlist holds", async () => {
    for (const mode of [undefined, "ingest" as const]) {
      const { ingest } = await run({ allowlist: [entry()], only: null, ...(mode ? { mode } : {}) });
      expect("verifiedUnusedSubstitutes" in (ingest!.p_coverage as object)).toBe(false);
    }
  });

  test("an approved player the provider now shows with minutes stops the fixture, writing nothing", async () => {
    const payload = () => {
      const base = bench();
      base.data.lineups[indexOf(200)]!.details = [
        {
          id: 1,
          fixture_id: 9001,
          lineup_id: 50,
          player_id: 200,
          team_id: 10,
          type_id: 119,
          data: { value: 12 },
        },
      ];
      return base;
    };
    const { result, ingest, calls } = await run({ allowlist: [entry()], payload });
    expect(ingest).toBeUndefined();
    expect(calls).toEqual(["football_current_performance_fixture_batch"]);
    expect(result.verdict).toBe("incomplete");
    expect(result.incomplete[0]).toMatchObject({
      stage: "validation",
      code: "verified_unused_scope_not_verified",
      diagnostic: {
        fixtureExternalId: "9001",
        externalPlayerId: "200",
        shortfalls: ["official_minutes_above_zero"],
      },
    });
  });

  test("an approved player who appears in a match event stops the fixture", async () => {
    const payload = () => {
      const base = bench();
      (base.data as unknown as { events: unknown[] }).events = [
        { id: 1, fixture_id: 9001, type_id: 19, participant_id: 10, player_id: 200, minute: 80 },
      ];
      return base;
    };
    const { result, ingest } = await run({ allowlist: [entry()], payload });
    expect(ingest).toBeUndefined();
    expect(result.incomplete[0]).toMatchObject({
      code: "verified_unused_scope_not_verified",
      diagnostic: { shortfalls: ["named_by_a_match_event"] },
    });
  });

  test("an approved player who is not in the lineup stops the fixture", async () => {
    const { result, ingest } = await run({ allowlist: [entry({ externalPlayerId: "999" })] });
    expect(ingest).toBeUndefined();
    expect(result.incomplete[0]).toMatchObject({
      code: "verified_unused_scope_not_verified",
      diagnostic: { shortfalls: ["not_in_the_lineup"] },
    });
  });

  test("a preflight record that changed since review, or cannot be read, stops the fixture", async () => {
    const changed = await run({
      allowlist: [entry()],
      read: () => Buffer.from("edited after review"),
    });
    expect(changed.ingest).toBeUndefined();
    expect(changed.result.incomplete[0]).toMatchObject({
      code: "preflight_record_changed_since_review",
    });
    const missing = await run({
      allowlist: [entry()],
      read: () => {
        throw new Error("ENOENT");
      },
    });
    expect(missing.ingest).toBeUndefined();
    expect(missing.result.incomplete[0]).toMatchObject({ code: "preflight_record_unreadable" });
  });

  test("an approved exception under adaptive scoring is not declared and stops the fixture", async () => {
    // Under adaptive scoring an incomplete fixture is reported through the existing gap
    // call (which this stand-in answers as "not certified"); it is never ingested.
    const { result, ingest } = await run({
      allowlist: [entry()],
      adaptive: true,
      ingest: () => ({ data: { certified: false }, error: null }),
    });
    expect(ingest).toBeUndefined();
    expect(result.incomplete[0]).toMatchObject({
      code: "verified_unused_not_supported_under_adaptive",
    });
  });

  test("the result must name exactly the players that were declared", async () => {
    for (const answer of [["201"], [], ["200", "201"], ["200", "200"], "200", [200], undefined]) {
      const { result } = await run({ allowlist: [entry()], ingest: () => leftOut(answer) });
      expect(result.verdict).toBe("incomplete");
      expect(result.incomplete[0]).toMatchObject({
        stage: "database",
        code: "current_performance_reconciliation_failed",
      });
    }
  });

  test("a database that leaves someone out when nobody was declared is refused", async () => {
    // The row count is right (24), so only the unexpected exclusion is wrong.
    const { result } = await run({ allowlist: [], ingest: () => leftOut(["200"], 24) });
    expect(result.verdict).toBe("incomplete");
    expect(result.incomplete[0]).toMatchObject({
      code: "current_performance_reconciliation_failed",
    });
  });

  test("the row count must follow: declared and left out, 23 of 24", async () => {
    const { result } = await run({ allowlist: [entry()], ingest: () => leftOut(["200"], 24) });
    expect(result.verdict).toBe("incomplete");
  });

  test("a refusal from the database keeps its stable code and the fixture unwritten", async () => {
    const { result } = await run({
      allowlist: [entry()],
      ingest: () => ({
        data: null,
        error: { code: "55000", message: "VERIFIED_UNUSED_EXCEPTION_PRECONDITION_FAILED" },
      }),
    });
    expect(result.verdict).toBe("incomplete");
    expect(result.incomplete[0]).toMatchObject({
      stage: "database",
      code: "current_performance_rpc_failed",
    });
  });

  test("diagnose reports every entry for the fixture, any status, and writes nothing", async () => {
    const { result, calls, ingest } = await run({
      mode: "diagnose",
      allowlist: [
        entry(),
        entry({ externalPlayerId: "201", status: "proposed", approvedBy: null, approvedAt: null }),
      ],
    });
    expect(ingest).toBeUndefined();
    expect(calls).toEqual(["football_current_performance_fixture_batch"]);
    expect(result.verdict).toBe("pass");
    expect(result.fixtures[0]!.verifiedUnusedScope).toEqual([
      {
        externalPlayerId: "200",
        status: "approved",
        qualifies: true,
        evidenceDigest: evidenceDigest("9001", facts200),
        preflightRecordMatchesReview: true,
      },
      {
        externalPlayerId: "201",
        status: "proposed",
        qualifies: true,
        evidenceDigest: evidenceDigest("9001", {
          ...facts200,
          externalPlayerId: "201",
          externalTeamId: "20",
          officialMinutes: 0,
          zeroStatisticTypeIds: [52, 57, 79, 83, 84, 85, 88, 112, 113, 119, 324],
        }),
        preflightRecordMatchesReview: true,
      },
    ]);
  });

  test("diagnose says so when an entry would not qualify or its record changed, and does not fail", async () => {
    const { result } = await run({
      mode: "diagnose",
      allowlist: [entry({ externalPlayerId: "100" })],
      read: () => Buffer.from("edited"),
    });
    expect(result.verdict).toBe("pass");
    expect(result.fixtures[0]!.verifiedUnusedScope).toEqual([
      {
        externalPlayerId: "100",
        status: "approved",
        qualifies: false,
        shortfalls: [
          "not_a_substitute",
          "official_minutes_above_zero",
          "scoring_statistic_with_a_value",
        ],
        preflightRecordMatchesReview: false,
      },
    ]);
  });

  test("a one-fixture run with no option reads the committed allowlist: 711 is only proposed", async () => {
    const { client, calls } = batchClient({ items: [{ externalFixtureId: "19874711" }] });
    const result = (await runCurrentPerformanceBatch(
      client,
      "t",
      null,
      async () => bench19874711(),
      { onlyFixtureExternalId: "19874711", mode: "diagnose" },
    )) as unknown as { fixtures: Array<{ verifiedUnusedScope?: Array<Record<string, unknown>> }> };
    expect(calls).toEqual(["football_current_performance_fixture_batch"]);
    expect(result.fixtures[0]!.verifiedUnusedScope).toEqual([
      expect.objectContaining({
        externalPlayerId: "38227322",
        status: "proposed",
        qualifies: false,
        shortfalls: ["not_in_the_lineup"],
        preflightRecordMatchesReview: true,
      }),
    ]);
  });

  test("without an entry the ingest call is what it always was", async () => {
    const { ingest } = await run({ allowlist: [] });
    const normalized = await normalizeCurrentFinishedFixture(bench(), 9001);
    expect(ingest!.p_rows).toEqual(normalized.rows);
    expect(ingest!.p_coverage).toEqual(normalized.coverage);
  });
});
