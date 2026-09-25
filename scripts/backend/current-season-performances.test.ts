import { describe, expect, test } from "bun:test";
import {
  CURRENT_PERFORMANCE_TYPES,
  CurrentPerformanceError,
  normalizeCurrentFinishedFixture,
  providerValueType,
  runCurrentPerformanceBatch,
  currentPerformanceGuard,
  isProviderOutage,
  manualRunExitCode,
} from "./current-season-performances";
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
      [
        (p) => delete (p.data.lineups[8] as Record<string, unknown>).details,
        "current_statistics_incomplete",
        { fixtureExternalId: "9001", field: "data.lineups[8].details", valueType: "missing" },
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
        {
          externalFixtureId: "9002",
          kickoffAt: "2026-09-24T17:00:00+00:00",
          // Carried through when the listing reports it, so the orchestrator
          // ages the gap from the real final whistle.
          finalizedAt: "2026-09-24T18:57:00+00:00",
        },
        { externalFixtureId: "9003", finalizedAt: "soon" },
      ],
    });
    const result = await runCurrentPerformanceBatch(
      client,
      "test-provider-token",
      null,
      async (path) => {
        calls.push(`fetch ${path.slice(-4)}`);
        const payload = fixture(Number(path.slice(-4)));
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
          finalizedAt: "2026-09-24T18:57:00+00:00",
          stage: "validation",
          code: "current_statistics_incomplete",
          diagnostic: { fixtureExternalId: "9002" },
        },
        {
          fixtureExternalId: "9003",
          kickoffAt: null,
          stage: "validation",
          code: "historical_fixture_coverage_incomplete",
          diagnostic: { starterRows: 21, failures: ["raw_starter_rows_mismatch"] },
        },
      ],
    });
    expect(result.incomplete[0]?.diagnostic?.missingDetailTypes).toHaveLength(9);
    // A time the listing cannot vouch for is left out rather than guessed.
    expect(result.incomplete[1]).not.toHaveProperty("finalizedAt");
  });

  test("a database refusal for one fixture keeps its stable code and does not stop the next", async () => {
    const { client, calls } = batchClient({
      items: [
        { externalFixtureId: "9001", finalizedAt: 1727218620 },
        { externalFixtureId: "9002" },
      ],
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
          databaseCode: "PLAYER_MAPPING_NOT_FOUND",
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
