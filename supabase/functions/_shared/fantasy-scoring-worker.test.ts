import { describe, expect, test } from "bun:test";
import {
  handleFantasyScoringRequest,
  scoringExecutionConfirmation,
  scoringManifestDigest,
  validateScoringManifest,
  type CanonicalScoringManifest,
  type FantasyScoringRpcClient,
} from "./fantasy-scoring-worker";

const TRIGGER_SECRET = "fantasy-scoring-test-key-000000000000000000000000";
const SEASON_ID = "10000000-0000-4000-8000-000000000001";
const GAMEWEEK_ID = "11000000-0000-4000-8000-000000000001";
const FIXTURE_ID = "20000000-0000-4000-8000-000000000001";
const TEAM_ONE_ID = "40000000-0000-4000-8000-000000000001";
const TEAM_TWO_ID = "40000000-0000-4000-8000-000000000002";
const LEAGUE_ID = "50000000-0000-4000-8000-000000000001";
const RUN_ID = "90000000-0000-4000-8000-000000000001";
const FIXTURE_SNAPSHOT_ID = "91000000-0000-4000-8000-000000000001";
const PLAYER_CURSOR = "30000000-0000-4000-8000-000000000011";
const REGRESSED_PLAYER_CURSOR = "30000000-0000-4000-8000-000000000010";

interface RpcCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

function manifestSource(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    seasonId: SEASON_ID,
    gameweekId: GAMEWEEK_ID,
    calculationVersion: 1,
    fixtures: [
      {
        fixtureId: FIXTURE_ID,
        footballInputVersion: 1_800_000_000_000,
        players: Array.from({ length: 22 }, (_, index) => ({
          fantasyPlayerId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          footballTeamId: index < 11 ? TEAM_ONE_ID : TEAM_TWO_ID,
          started: true,
          didPlay: true,
          minutesPlayed: 90,
          events: [{ category: "appearance", points: 2 }],
        })),
      },
    ],
    leagueIds: [LEAGUE_ID],
  };
}

async function requestBody(
  mode: "validate" | "execute",
  manifest = validateScoringManifest(manifestSource()),
  confirmation: string | null = null,
): Promise<Record<string, unknown>> {
  const digest = await scoringManifestDigest(manifest);
  return {
    mode,
    manifest,
    expectedManifestDigest: digest,
    confirmation,
  };
}

function request(body: unknown, triggerSecret = TRIGGER_SECRET): Request {
  return new Request("https://example.test/functions/v1/fantasy-scoring-worker", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-botolago-scoring-key": triggerSecret,
    },
    body: JSON.stringify(body),
  });
}

function successfulClient(
  calls: RpcCall[],
  options: {
    alreadyComplete?: boolean;
    failFixture?: boolean;
    failScope?: boolean;
    invalidFixtureResponse?: boolean;
    regressPlayers?: boolean;
    stallPlayers?: boolean;
  } = {},
): FantasyScoringRpcClient {
  let completionCalls = 0;
  let playerCalls = 0;
  return {
    schema(name) {
      expect(name).toBe("api");
      return {
        async rpc(rpcName, args) {
          calls.push({ name: rpcName, args });
          if (rpcName === "service_validate_fantasy_scoring_scope") {
            if (options.failScope) {
              return {
                data: null,
                error: { code: "PT409", message: "fantasy_scoring_scope_mismatch" },
              };
            }
            return {
              data: {
                status: options.alreadyComplete ? "finalized" : "locked",
                stableResult: true,
                fixtureCount: 1,
                leagueCount: 1,
              },
              error: null,
            };
          }
          if (rpcName === "service_complete_fantasy_gameweek") {
            completionCalls += 1;
            if (options.alreadyComplete || completionCalls > 1) {
              return {
                data: { finalized: true, stableResult: options.alreadyComplete ?? false },
                error: null,
              };
            }
            return {
              data: null,
              error: { code: "PT409", message: "gameweek_not_finalizable" },
            };
          }
          if (rpcName === "service_begin_fantasy_job") return { data: RUN_ID, error: null };
          if (rpcName === "service_complete_fantasy_job") return { data: true, error: null };
          if (rpcName === "service_replace_fantasy_fixture_points") {
            return options.failFixture
              ? { data: null, error: { code: "PT409", message: "input_version_conflict" } }
              : {
                  data: {
                    snapshotId: FIXTURE_SNAPSHOT_ID,
                    stableResult: options.alreadyComplete ?? false,
                    players: options.invalidFixtureResponse ? 21 : 22,
                  },
                  error: null,
                };
          }
          if (rpcName === "service_finalize_fantasy_player_points") {
            playerCalls += 1;
            if (options.stallPlayers) {
              return {
                data: { finalized: 0, afterPlayerId: null, hasMore: true },
                error: null,
              };
            }
            if (options.regressPlayers && playerCalls > 1) {
              return {
                data: {
                  finalized: 1,
                  afterPlayerId: REGRESSED_PLAYER_CURSOR,
                  hasMore: true,
                },
                error: null,
              };
            }
            return playerCalls === 1
              ? {
                  data: { finalized: 11, afterPlayerId: PLAYER_CURSOR, hasMore: true },
                  error: null,
                }
              : { data: { finalized: 11, afterPlayerId: null, hasMore: false }, error: null };
          }
          if (rpcName === "service_materialize_fantasy_team_results") {
            return { data: { materialized: 1, afterTeamId: null, hasMore: false }, error: null };
          }
          if (rpcName === "service_finalize_fantasy_team_results") {
            return { data: { finalized: 1, afterTeamId: null, hasMore: false }, error: null };
          }
          if (rpcName === "service_restore_free_hit") {
            return { data: { restored: 0, hasMore: false }, error: null };
          }
          if (rpcName === "service_roll_fantasy_free_transfers") {
            return { data: { updated: 1, hasMore: false }, error: null };
          }
          if (rpcName === "service_recalculate_fantasy_rankings") {
            return { data: 1, error: null };
          }
          throw new Error(`unexpected RPC ${rpcName}`);
        },
      };
    },
  };
}

describe("Fantasy scoring worker", () => {
  test("rejects calls without the exact dedicated trigger secret", async () => {
    const calls: RpcCall[] = [];
    const response = await handleFantasyScoringRequest(
      request(await requestBody("validate"), "wrong-key"),
      { client: successfulClient(calls), expectedTriggerSecret: TRIGGER_SECRET },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(calls).toHaveLength(0);
  });

  test("validates a complete canonical manifest without database writes", async () => {
    const calls: RpcCall[] = [];
    const response = await handleFantasyScoringRequest(request(await requestBody("validate")), {
      client: successfulClient(calls),
      expectedTriggerSecret: TRIGGER_SECRET,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.valid).toBe(true);
    expect(body.recurringScheduleEnabled).toBe(false);
    expect(body.executionConfirmation).toMatch(
      /^FINALIZE:11000000-0000-4000-8000-000000000001:v1:[0-9a-f]{12}$/,
    );
    expect(body.counts).toEqual({ fixtures: 1, players: 22, pointEvents: 22, leagueScopes: 4 });
    expect(calls).toHaveLength(0);
  });

  test("rejects incomplete or non-canonical player snapshots", () => {
    const tooSmall = manifestSource();
    const fixture = (tooSmall.fixtures as Array<Record<string, unknown>>)[0];
    fixture.players = (fixture.players as unknown[]).slice(0, 21);
    expect(() => validateScoringManifest(tooSmall)).toThrow("invalid_manifest");

    const unsorted = manifestSource();
    const unsortedFixture = (unsorted.fixtures as Array<Record<string, unknown>>)[0];
    const players = unsortedFixture.players as unknown[];
    [players[0], players[1]] = [players[1], players[0]];
    expect(() => validateScoringManifest(unsorted)).toThrow("manifest_not_canonical");

    const disabledCategory = manifestSource();
    const disabledFixture = (disabledCategory.fixtures as Array<Record<string, unknown>>)[0];
    const disabledPlayer = (disabledFixture.players as Array<Record<string, unknown>>)[0];
    disabledPlayer.events = [{ category: "bonus", points: 3 }];
    expect(() => validateScoringManifest(disabledCategory)).toThrow("invalid_manifest");
  });

  test("uses the same canonical UUID order as PostgreSQL scope arrays", () => {
    const source = manifestSource();
    const fixture = (source.fixtures as Array<Record<string, unknown>>)[0];
    source.fixtures = [
      { ...structuredClone(fixture), fixtureId: "20000000-0000-4000-8000-000000000009" },
      { ...structuredClone(fixture), fixtureId: "20000000-0000-4000-8000-00000000000a" },
    ];
    source.leagueIds = [
      "50000000-0000-4000-8000-000000000009",
      "50000000-0000-4000-8000-00000000000a",
    ];
    const canonical = validateScoringManifest(source);
    expect(canonical.fixtures.map((item) => item.fixtureId)).toEqual([
      "20000000-0000-4000-8000-000000000009",
      "20000000-0000-4000-8000-00000000000a",
    ]);
    expect(canonical.leagueIds).toEqual([
      "50000000-0000-4000-8000-000000000009",
      "50000000-0000-4000-8000-00000000000a",
    ]);

    const unsortedFixtures = structuredClone(source);
    (unsortedFixtures.fixtures as unknown[]).reverse();
    expect(() => validateScoringManifest(unsortedFixtures)).toThrow("manifest_not_canonical");
    const unsortedLeagues = structuredClone(source);
    (unsortedLeagues.leagueIds as unknown[]).reverse();
    expect(() => validateScoringManifest(unsortedLeagues)).toThrow("manifest_not_canonical");
  });

  test("requires the digest-bound execution confirmation", async () => {
    const calls: RpcCall[] = [];
    const response = await handleFantasyScoringRequest(
      request(await requestBody("execute", undefined, "FINALIZE:wrong")),
      { client: successfulClient(calls), expectedTriggerSecret: TRIGGER_SECRET },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "execution_confirmation_failed",
      stage: "validation",
    });
    expect(calls).toHaveLength(0);
  });

  test("runs every phase in fail-closed order and pages player finalization", async () => {
    const calls: RpcCall[] = [];
    const manifest = validateScoringManifest(manifestSource());
    const digest = await scoringManifestDigest(manifest);
    const confirmation = scoringExecutionConfirmation(manifest, digest);
    const response = await handleFantasyScoringRequest(
      request(await requestBody("execute", manifest, confirmation)),
      { client: successfulClient(calls), expectedTriggerSecret: TRIGGER_SECRET },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.completed).toBe(true);
    expect(body.recurringScheduleEnabled).toBe(false);
    expect(calls.map((call) => call.name)).toEqual([
      "service_validate_fantasy_scoring_scope",
      "service_begin_fantasy_job",
      "service_replace_fantasy_fixture_points",
      "service_complete_fantasy_gameweek",
      "service_finalize_fantasy_player_points",
      "service_finalize_fantasy_player_points",
      "service_materialize_fantasy_team_results",
      "service_finalize_fantasy_team_results",
      "service_restore_free_hit",
      "service_roll_fantasy_free_transfers",
      "service_recalculate_fantasy_rankings",
      "service_recalculate_fantasy_rankings",
      "service_recalculate_fantasy_rankings",
      "service_recalculate_fantasy_rankings",
      "service_complete_fantasy_gameweek",
      "service_complete_fantasy_job",
    ]);
    const playerPageTwo = calls.filter(
      (call) => call.name === "service_finalize_fantasy_player_points",
    )[1];
    expect(playerPageTwo.args.p_after_player_id).toBe(PLAYER_CURSOR);
  });

  test("stops on fixture rejection and records a failed job", async () => {
    const calls: RpcCall[] = [];
    const manifest = validateScoringManifest(manifestSource());
    const digest = await scoringManifestDigest(manifest);
    const response = await handleFantasyScoringRequest(
      request(
        await requestBody("execute", manifest, scoringExecutionConfirmation(manifest, digest)),
      ),
      {
        client: successfulClient(calls, { failFixture: true }),
        expectedTriggerSecret: TRIGGER_SECRET,
      },
    );
    expect(response.status).toBe(409);
    expect(calls.map((call) => call.name)).toEqual([
      "service_validate_fantasy_scoring_scope",
      "service_begin_fantasy_job",
      "service_replace_fantasy_fixture_points",
      "service_complete_fantasy_job",
    ]);
    expect(calls.at(-1)?.args.p_status).toBe("failed");
  });

  test("rejects an unacknowledged fixture snapshot response", async () => {
    const calls: RpcCall[] = [];
    const manifest = validateScoringManifest(manifestSource());
    const digest = await scoringManifestDigest(manifest);
    const response = await handleFantasyScoringRequest(
      request(
        await requestBody("execute", manifest, scoringExecutionConfirmation(manifest, digest)),
      ),
      {
        client: successfulClient(calls, { invalidFixtureResponse: true }),
        expectedTriggerSecret: TRIGGER_SECRET,
      },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "invalid_rpc_response",
      stage: "fixture_replacement",
    });
    expect(calls.at(-1)?.name).toBe("service_complete_fantasy_job");
  });

  test("rejects an incomplete database scope before starting a job", async () => {
    const calls: RpcCall[] = [];
    const manifest = validateScoringManifest(manifestSource());
    const digest = await scoringManifestDigest(manifest);
    const response = await handleFantasyScoringRequest(
      request(
        await requestBody("execute", manifest, scoringExecutionConfirmation(manifest, digest)),
      ),
      {
        client: successfulClient(calls, { failScope: true }),
        expectedTriggerSecret: TRIGGER_SECRET,
      },
    );
    expect(response.status).toBe(409);
    expect(calls.map((call) => call.name)).toEqual([
      "service_validate_fantasy_scoring_scope",
    ]);
  });

  test("treats an already-finalized gameweek as a stable replay", async () => {
    const calls: RpcCall[] = [];
    const manifest = validateScoringManifest(manifestSource());
    const digest = await scoringManifestDigest(manifest);
    const response = await handleFantasyScoringRequest(
      request(
        await requestBody("execute", manifest, scoringExecutionConfirmation(manifest, digest)),
      ),
      {
        client: successfulClient(calls, { alreadyComplete: true }),
        expectedTriggerSecret: TRIGGER_SECRET,
      },
    );
    expect(response.status).toBe(200);
    expect(calls.map((call) => call.name)).toEqual([
      "service_validate_fantasy_scoring_scope",
      "service_begin_fantasy_job",
      "service_replace_fantasy_fixture_points",
      "service_complete_fantasy_gameweek",
      "service_complete_fantasy_job",
    ]);
    expect(calls.map((call) => call.name)).not.toContain(
      "service_materialize_fantasy_team_results",
    );
    const body = (await response.json()) as { summary: { alreadyComplete: boolean } };
    expect(body.summary.alreadyComplete).toBe(true);
  });

  test("fails closed when a paged RPC cannot prove progress", async () => {
    const calls: RpcCall[] = [];
    const manifest = validateScoringManifest(manifestSource());
    const digest = await scoringManifestDigest(manifest);
    const response = await handleFantasyScoringRequest(
      request(
        await requestBody("execute", manifest, scoringExecutionConfirmation(manifest, digest)),
      ),
      {
        client: successfulClient(calls, { stallPlayers: true }),
        expectedTriggerSecret: TRIGGER_SECRET,
      },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "worker_progress_stalled",
      stage: "player_finalization",
    });
    expect(calls.at(-1)?.name).toBe("service_complete_fantasy_job");
  });

  test("fails closed when a paged RPC returns a regressing UUID cursor", async () => {
    const calls: RpcCall[] = [];
    const manifest = validateScoringManifest(manifestSource());
    const digest = await scoringManifestDigest(manifest);
    const response = await handleFantasyScoringRequest(
      request(
        await requestBody("execute", manifest, scoringExecutionConfirmation(manifest, digest)),
      ),
      {
        client: successfulClient(calls, { regressPlayers: true }),
        expectedTriggerSecret: TRIGGER_SECRET,
      },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "worker_progress_stalled",
      stage: "player_finalization",
    });
    expect(calls.at(-1)?.name).toBe("service_complete_fantasy_job");
  });
});
