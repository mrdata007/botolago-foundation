import { describe, expect, test } from "bun:test";
import {
  currentPlayerListGuard,
  loadClubSquad,
  loadFixtureLineup,
  observedPlayer,
  parseFixtureIds,
  runCurrentPlayerListObservation,
} from "./current-player-list";

type Row = Record<string, unknown>;
const TODAY = "2026-09-25";
const OBSERVED_AT = "2026-09-25T13:00:00.000Z";

function provider(responses: Record<string, unknown>, calls: string[] = []) {
  return async (path: string, query: Readonly<Record<string, string>>) => {
    calls.push(`${path}?${new URLSearchParams(query).toString()}`);
    if (!(path in responses)) throw new Error(`unexpected ${path}`);
    return responses[path];
  };
}
function squadRow(playerId: number, teamId: number, extra: Row = {}): Row {
  return {
    id: playerId * 10,
    player_id: playerId,
    team_id: teamId,
    season_id: 28647,
    position_id: 26,
    jersey_number: 8,
    player: { id: playerId, name: `Player ${playerId}`, display_name: `P. ${playerId}` },
    ...extra,
  };
}

describe("current player list observation", () => {
  test("a player is named from SportsMonks' fields, trimmed, and placed by the first known position", () => {
    expect(
      observedPlayer(
        7,
        {
          name: "  Mouad   Goulouss ",
          display_name: "M. Goulouss",
          firstname: "Mouad",
          lastname: "Goulouss",
          date_of_birth: "1996-02-30",
          position_id: 27,
        },
        null,
        [null, 26, 27],
        10,
        TODAY,
      ),
    ).toEqual({
      externalPlayerId: "7",
      fullName: "Mouad Goulouss",
      displayName: "M. Goulouss",
      firstName: "Mouad",
      lastName: "Goulouss",
      dateOfBirth: null,
      position: "midfielder",
      shirtNumber: 10,
    });
    // A lineup row without an included player is still named, by its label.
    // Only SportsMonks' own full name is a full name: nothing stands in for it.
    expect(observedPlayer(8, null, "Hatim Bouhbouh", [99], 0, TODAY)).toMatchObject({
      fullName: null,
      displayName: "Hatim Bouhbouh",
      position: null,
      shirtNumber: null,
    });
    expect(
      observedPlayer(
        11,
        { display_name: "Omar Kadi", common_name: "O. Kadi" },
        null,
        [27],
        9,
        TODAY,
      ),
    ).toMatchObject({ fullName: null, displayName: "Omar Kadi", position: "forward" });
    expect(observedPlayer(9, { name: "X" }, null, [24], 1, TODAY)).toBeNull();
    expect(
      observedPlayer(10, { name: "Future Born", date_of_birth: "2026-09-26" }, null, [], 1, TODAY)
        ?.dateOfBirth,
    ).toBeNull();
  });

  test("a club's season squad is read first; its current roster stands in when that is empty", async () => {
    const calls: string[] = [];
    const season = await loadClubSquad(
      501,
      OBSERVED_AT,
      "token",
      provider(
        {
          "/v3/football/squads/seasons/28647/teams/501": {
            data: [
              squadRow(1, 501),
              squadRow(2, 501, { player: { id: 2, name: "" } }),
              squadRow(3, 501, { position_id: null, player: { id: 3, name: "No Position" } }),
            ],
          },
        },
        calls,
      ),
    );
    expect(calls).toEqual(["/v3/football/squads/seasons/28647/teams/501?include=player"]);
    expect(season.evidence).toEqual({
      teamExternalId: "501",
      source: "season-squad",
      sourceRows: 3,
      players: 2,
      withoutPosition: 1,
      excludedContracts: 0,
      unnamed: 1,
      repeated: 0,
    });

    const roster = await loadClubSquad(
      502,
      OBSERVED_AT,
      "token",
      provider({
        "/v3/football/squads/seasons/28647/teams/502": { data: [] },
        "/v3/football/squads/teams/502": {
          data: [
            { ...squadRow(4, 502), season_id: undefined, start: "2026-07-01", end: "2027-06-30" },
            { ...squadRow(5, 502), season_id: undefined, start: "2024-07-01", end: "2026-06-30" },
          ],
        },
      }),
    );
    expect(roster.club).toMatchObject({ teamExternalId: "502", source: "current-team-roster" });
    expect((roster.club.players as Row[]).map((player) => player.externalPlayerId)).toEqual(["4"]);
    expect(roster.evidence.excludedContracts).toBe(1);

    await expect(
      loadClubSquad(
        503,
        OBSERVED_AT,
        "token",
        provider({ "/v3/football/squads/seasons/28647/teams/503": { data: [squadRow(6, 504)] } }),
      ),
    ).rejects.toMatchObject({ code: "squad_scope_mismatch" });
  });

  test("a lineup names only its two clubs' players, and skips the ones SportsMonks cannot name", async () => {
    const fixture = (lineups: Row[]) => ({
      data: {
        id: 19874708,
        season_id: 28647,
        league_id: 860,
        participants: [{ id: 501 }, { id: 502 }],
        lineups,
      },
    });
    const path = "/v3/football/fixtures/19874708";
    const loaded = await loadFixtureLineup(
      19874708,
      OBSERVED_AT,
      "token",
      provider({
        [path]: fixture([
          {
            player_id: 11,
            team_id: 501,
            position_id: 25,
            jersey_number: 4,
            player_name: "Koffi Holete",
            player: null,
          },
          { player_id: null, team_id: 502, player_name: "Unknown" },
        ]),
      }),
    );
    expect(loaded.lineup).toEqual({
      fixtureExternalId: "19874708",
      players: [
        {
          externalPlayerId: "11",
          teamExternalId: "501",
          fullName: null,
          displayName: "Koffi Holete",
          firstName: null,
          lastName: null,
          dateOfBirth: null,
          position: "defender",
          shirtNumber: 4,
        },
      ],
    });
    expect(loaded.evidence).toMatchObject({ lineupRows: 2, players: 1, unidentified: 1 });
    await expect(
      loadFixtureLineup(
        19874708,
        OBSERVED_AT,
        "token",
        provider({ [path]: fixture([{ player_id: 12, team_id: 999, player_name: "Elsewhere" }]) }),
      ),
    ).rejects.toMatchObject({ code: "lineup_fixture_scope_mismatch" });
    await expect(
      loadFixtureLineup(
        19874708,
        OBSERVED_AT,
        "token",
        provider({ [path]: { data: { ...fixture([]).data, season_id: 1 } } }),
      ),
    ).rejects.toMatchObject({ code: "lineup_fixture_scope_mismatch" });
  });

  test("records one observation of the sixteen clubs and returns its plan, and nothing else", async () => {
    const responses: Record<string, unknown> = {
      "/v3/football/teams/seasons/28647": {
        data: Array.from({ length: 16 }, (_, index) => ({ id: 601 + index })),
        pagination: { has_more: false },
      },
      "/v3/football/fixtures/19874708": {
        data: {
          id: 19874708,
          season_id: 28647,
          league_id: 860,
          participants: [{ id: 601 }, { id: 602 }],
          lineups: [{ player_id: 21, team_id: 602, player_name: "Played Here", position_id: 27 }],
        },
      },
    };
    for (let index = 0; index < 16; index += 1)
      responses[`/v3/football/squads/seasons/28647/teams/${601 + index}`] = {
        data: [squadRow(100 + index, 601 + index)],
      };
    const rpcCalls: Array<{ name: string; args: Row }> = [];
    const client = {
      schema: () => ({
        rpc: async (name: string, args: Row) => {
          rpcCalls.push({ name, args });
          return name === "service_record_current_player_list"
            ? {
                data: { observationId: "0b2d3c4e-0000-4000-8000-000000000001", clubs: 16 },
                error: null,
              }
            : { data: { digest: "a".repeat(64), summary: { changes: 1 } }, error: null };
        },
      }),
    };
    const result = await runCurrentPlayerListObservation(
      client,
      "token",
      [19874708],
      provider(responses),
      () => new Date(OBSERVED_AT),
    );
    expect(rpcCalls.map((call) => call.name)).toEqual([
      "service_record_current_player_list",
      "service_plan_current_player_list",
    ]);
    const observations = rpcCalls[0].args.p_observations as Row;
    expect(observations).toMatchObject({
      providerName: "sportsmonks",
      seasonExternalId: "28647",
      observedAt: OBSERVED_AT,
    });
    expect((observations.clubs as Row[]).length).toBe(16);
    expect((observations.lineups as Row[])[0]).toMatchObject({
      fixtureExternalId: "19874708",
      players: [{ externalPlayerId: "21", teamExternalId: "602", position: "forward" }],
    });
    expect(rpcCalls[1].args).toEqual({ p_observation_id: "0b2d3c4e-0000-4000-8000-000000000001" });
    expect(result).toMatchObject({ verdict: "planned", plan: { digest: "a".repeat(64) } });

    const refused = {
      schema: () => ({
        rpc: async () => ({
          data: null,
          error: { code: "PT409", message: "player_list_club_scope_mismatch" },
        }),
      }),
    };
    await expect(
      runCurrentPlayerListObservation(
        refused,
        "token",
        [],
        provider(responses),
        () => new Date(OBSERVED_AT),
      ),
    ).rejects.toMatchObject({
      code: "current_player_list_rpc_failed",
      diagnostic: {
        rpcName: "service_record_current_player_list",
        sqlState: "PT409",
        reason: "player_list_club_scope_mismatch",
      },
    });

    // A scheduled database job mid-run: the database refuses to record, so
    // the run waits and tries again, six times at most.
    const waitingFor = (refusals: number) => {
      let left = refusals;
      return {
        schema: () => ({
          rpc: async (name: string) =>
            name === "service_record_current_player_list" && left-- > 0
              ? { data: null, error: { code: "PT409", message: "scheduled_job_running" } }
              : name === "service_record_current_player_list"
                ? {
                    data: { observationId: "0b2d3c4e-0000-4000-8000-000000000001", clubs: 16 },
                    error: null,
                  }
                : { data: { digest: "a".repeat(64), summary: { changes: 1 } }, error: null },
        }),
      };
    };
    const waits: number[] = [];
    await expect(
      runCurrentPlayerListObservation(
        waitingFor(2),
        "token",
        [],
        provider(responses),
        () => new Date(OBSERVED_AT),
        async (milliseconds) => waits.push(milliseconds),
      ),
    ).resolves.toMatchObject({ verdict: "planned" });
    expect(waits).toEqual([10_000, 10_000]);
    waits.length = 0;
    await expect(
      runCurrentPlayerListObservation(
        waitingFor(6),
        "token",
        [],
        provider(responses),
        () => new Date(OBSERVED_AT),
        async (milliseconds) => waits.push(milliseconds),
      ),
    ).rejects.toMatchObject({ diagnostic: { reason: "scheduled_job_running" } });
    expect(waits).toHaveLength(5);
  });

  test("fixture ids are a short list of distinct SportsMonks ids", () => {
    expect(parseFixtureIds(undefined)).toEqual([]);
    expect(parseFixtureIds(" 19874708, 19874709 ")).toEqual([19874708, 19874709]);
    expect(() => parseFixtureIds("19874708,19874708")).toThrow("invalid_fixture_ids");
    expect(() => parseFixtureIds("abc")).toThrow("invalid_fixture_ids");
    expect(() =>
      parseFixtureIds(Array.from({ length: 21 }, (_, i) => String(i + 1)).join(",")),
    ).toThrow("invalid_fixture_ids");
  });

  test("runs only from the owner's reviewed dispatch on main, against production", () => {
    const env = {
      EXPECTED_COMMIT: "a".repeat(40),
      GITHUB_SHA: "a".repeat(40),
      GITHUB_REPOSITORY: "mrdata007/botolago-foundation",
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR: "mrdata007",
      GITHUB_RUN_ATTEMPT: "1",
      CONFIRMATION: "OBSERVE_CURRENT_PLAYER_LIST",
      SUPABASE_PRODUCTION_PROJECT_REF: "tkewgajrljbwgwedqsxn",
      SUPABASE_PRODUCTION_PROJECT_NAME: "BotolaGO Production V2",
      SUPABASE_PRODUCTION_URL: "https://tkewgajrljbwgwedqsxn.supabase.co",
      SUPABASE_SECRET_KEY: "service-key",
      SPORTSMONKS_API_TOKEN: "sportsmonks-token-value-long-enough",
      FIXTURE_IDS: "19874708",
    };
    expect(currentPlayerListGuard(env)).toMatchObject({ fixtureIds: [19874708] });
    for (const [key, value] of [
      ["CONFIRMATION", "INGEST_CURRENT_FINISHED_PERFORMANCES"],
      ["GITHUB_EVENT_NAME", "schedule"],
      ["GITHUB_REF", "refs/heads/feature"],
      ["GITHUB_SHA", "b".repeat(40)],
      ["SUPABASE_PRODUCTION_PROJECT_REF", "srdrflfrfpwixsllveid"],
    ])
      expect(() => currentPlayerListGuard({ ...env, [key]: value })).toThrow(
        "current_player_list_dispatch_guard_failed",
      );
  });
});
