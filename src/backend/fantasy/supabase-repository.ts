import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { getFantasyApi } from "@/integrations/supabase/v2-client";
import {
  fantasyHubSchema,
  fantasyGameweekPageSchema,
  fantasyGameweekSummarySchema,
  fantasyHistoryPageSchema,
  fantasyLeaguePageSchema,
  fantasyLeagueStandingPageSchema,
  fantasyOverallStandingPageSchema,
  fantasyPlayerGameweekHistorySchema,
  fantasyPlayerSeasonStatsSchema,
  fantasyPointsSchema,
  fantasyTeamSchema,
  fantasyTopPlayerSchema,
  fantasyTransferPreviewSchema,
  fantasyRulesSchema,
  fantasyFixtureDifficultySchema,
  playerPoolPageSchema,
  type CreateFantasyTeamInput,
  type FantasyChip,
  type FantasyPlayerPoolInput,
  type FantasyOverallStandingsInput,
  type FantasyRepository,
  type LineupSelection,
  type TransferInput,
} from "./contracts";
import { FantasyError, mapFantasyError } from "./errors";

function check(error: PostgrestError | null): void {
  if (error) throw mapFantasyError(error);
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new FantasyError(
      "data_unavailable",
      "The Fantasy API returned an invalid DTO.",
      result.error,
    );
  return result.data;
}

/**
 * BG-0071 — `src/backend/generated/database.types.ts` carries a "do not edit by
 * hand" header and CI compares it byte-for-byte against `supabase gen types`
 * run over a live local database. Regenerating it needs Docker, which this
 * lane does not have, so the two statistics RPCs shipped by
 * `20260921160000_fantasy_player_statistics.sql` are not yet in the generated
 * `Functions` union and `getFantasyApi().rpc("fantasy_player_season_stats", …)`
 * would not compile.
 *
 * Rather than hand-write into a generated file — which would be a byte-for-byte
 * CI failure of its own, and a lie about the file's provenance — these two
 * calls go through one narrowly-scoped structural view of `rpc`. The payloads
 * are still validated by zod exactly like every other read on this class, so
 * nothing untyped escapes this function. It can be deleted, and the two callers
 * switched back to `getFantasyApi().rpc(…)`, in the commit that lands CI's
 * regenerated types.
 */
async function rpcAwaitingGeneratedTypes(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const client = getFantasyApi() as unknown as {
    rpc(
      fn: string,
      params: Record<string, unknown>,
    ): PromiseLike<{ data: unknown; error: PostgrestError | null }>;
  };
  const { data, error } = await client.rpc(name, args);
  check(error);
  return data;
}

export class SupabaseFantasyRepository implements FantasyRepository {
  async getHub(language: "fr" | "ar", _context: RepositoryContext) {
    const { data, error } = await getFantasyApi().rpc("fantasy_hub", { p_language: language });
    check(error);
    return parse(fantasyHubSchema, data);
  }

  async getPlayerPool(input: FantasyPlayerPoolInput, _context: RepositoryContext) {
    const { data, error } = await getFantasyApi().rpc("fantasy_player_pool", {
      p_season_id: input.seasonId,
      p_position: input.position,
      p_team_id: input.teamId,
      p_max_price: input.maxPrice,
      p_search: input.search,
      p_after_price: input.cursor?.price,
      p_after_id: input.cursor?.id,
      p_limit: input.limit ?? 50,
    });
    check(error);
    return parse(playerPoolPageSchema, data);
  }

  async getTeam(seasonId: string, _context: RepositoryContext) {
    const { data, error } = await getFantasyApi().rpc("get_my_fantasy_team", {
      p_season_id: seasonId,
    });
    check(error);
    return parse(fantasyTeamSchema, data);
  }

  async createTeam(input: CreateFantasyTeamInput, _context: RepositoryContext) {
    const { data, error } = await getFantasyApi().rpc("create_fantasy_team", {
      p_season_id: input.seasonId,
      p_gameweek_id: input.gameweekId,
      p_team_name: input.teamName,
      p_selection: [...input.selection],
      p_idempotency_key: input.idempotencyKey,
    });
    check(error);
    return parse(fantasyTeamSchema, data);
  }

  async saveLineup(
    teamId: string,
    gameweekId: string,
    selection: readonly LineupSelection[],
    expectedVersion: number,
    idempotencyKey: string,
    _context: RepositoryContext,
  ) {
    const { data, error } = await getFantasyApi().rpc("save_fantasy_lineup", {
      p_team_id: teamId,
      p_gameweek_id: gameweekId,
      p_selection: [...selection],
      p_expected_version: expectedVersion,
      p_idempotency_key: idempotencyKey,
    });
    check(error);
    return parse(fantasyTeamSchema, data);
  }

  async previewTransfers(
    teamId: string,
    gameweekId: string,
    transfers: readonly TransferInput[],
    expectedVersion: number,
    chip: FantasyChip | null,
    _context: RepositoryContext,
  ) {
    const { data, error } = await getFantasyApi().rpc("preview_fantasy_transfers", {
      p_team_id: teamId,
      p_gameweek_id: gameweekId,
      p_transfers: transfers.map(({ player_out_id, player_in_id }) => ({
        player_out_id,
        player_in_id,
      })),
      p_expected_version: expectedVersion,
      p_chip_type: chip ?? undefined,
    });
    check(error);
    return parse(fantasyTransferPreviewSchema, data);
  }

  async confirmTransfers(
    teamId: string,
    gameweekId: string,
    transfers: readonly TransferInput[],
    expectedVersion: number,
    idempotencyKey: string,
    chip: FantasyChip | null,
    _context: RepositoryContext,
  ) {
    const { data, error } = await getFantasyApi().rpc("confirm_fantasy_transfers", {
      p_team_id: teamId,
      p_gameweek_id: gameweekId,
      p_transfers: transfers.map(({ player_out_id, player_in_id }) => ({
        player_out_id,
        player_in_id,
      })),
      p_expected_version: expectedVersion,
      p_idempotency_key: idempotencyKey,
      p_chip_type: chip ?? undefined,
    });
    check(error);
    return data;
  }

  async activateChip(
    teamId: string,
    gameweekId: string,
    chip: FantasyChip,
    expectedVersion: number,
    idempotencyKey: string,
    _context: RepositoryContext,
  ) {
    const { data, error } = await getFantasyApi().rpc("activate_fantasy_chip", {
      p_team_id: teamId,
      p_gameweek_id: gameweekId,
      p_chip_type: chip,
      p_expected_version: expectedVersion,
      p_idempotency_key: idempotencyKey,
    });
    check(error);
    return data;
  }

  async cancelChip(
    teamId: string,
    gameweekId: string,
    expectedVersion: number,
    _context: RepositoryContext,
  ) {
    const { data, error } = await getFantasyApi().rpc("cancel_fantasy_chip", {
      p_team_id: teamId,
      p_gameweek_id: gameweekId,
      p_expected_version: expectedVersion,
    });
    check(error);
    return data;
  }

  async getRules(seasonId: string, _context: RepositoryContext) {
    const { data, error } = await getFantasyApi().rpc("fantasy_rules", {
      p_season_id: seasonId,
    });
    check(error);
    return parse(fantasyRulesSchema, data);
  }

  async getFixtureDifficulty(
    seasonId: string,
    fromGameweek: number,
    gameweekCount: number,
    _context: RepositoryContext,
  ) {
    const { data, error } = await getFantasyApi().rpc("fantasy_fixture_difficulty", {
      p_season_id: seasonId,
      p_from_gameweek: fromGameweek,
      p_gameweek_count: gameweekCount,
    });
    check(error);
    return parse(z.array(fantasyFixtureDifficultySchema), data);
  }

  async getGameweeks(seasonId: string, beforeSequence: number | null, _context: RepositoryContext) {
    const { data, error } = await getFantasyApi().rpc("fantasy_gameweeks", {
      p_season_id: seasonId,
      p_before_sequence: beforeSequence ?? undefined,
      p_limit: 100,
    });
    check(error);
    return parse(fantasyGameweekPageSchema, data);
  }

  async getPoints(teamId: string, gameweekId: string, _context: RepositoryContext) {
    const { data, error } = await getFantasyApi().rpc("get_my_fantasy_points", {
      p_team_id: teamId,
      p_gameweek_id: gameweekId,
    });
    check(error);
    return parse(fantasyPointsSchema, data);
  }

  async getHistory(teamId: string, beforeSequence: number | null, _context: RepositoryContext) {
    const { data, error } = await getFantasyApi().rpc("get_my_fantasy_history", {
      p_team_id: teamId,
      p_before_gameweek_sequence: beforeSequence ?? undefined,
      p_limit: 50,
    });
    check(error);
    return parse(fantasyHistoryPageSchema, data);
  }

  /**
   * BG-0075 — the gameweek-wide Average / Highest strip. Anon-callable on
   * purpose: /fantasy/points is reachable signed out. Both figures come back
   * null while `teamCount` is 0, which is production today.
   */
  async getGameweekSummary(gameweekId: string, _context: RepositoryContext) {
    // `src/backend/generated/database.types.ts` is a CI artifact regenerated
    // from the applied schema, so it does not name this RPC until the migration
    // that creates it has run. The call is otherwise identical to its
    // neighbours; the response is validated by the schema below, exactly as a
    // generated-typed response would be.
    const { data, error } = await (
      getFantasyApi() as unknown as {
        rpc: (
          name: string,
          args: Record<string, unknown>,
        ) => PromiseLike<{ data: unknown; error: PostgrestError | null }>;
      }
    ).rpc("fantasy_gameweek_summary", { p_gameweek_id: gameweekId });
    check(error);
    return parse(fantasyGameweekSummarySchema, data);
  }

  async getLeagues(
    seasonId: string,
    visibility: "public" | "private" | null,
    _context: RepositoryContext,
  ) {
    const { data, error } = await getFantasyApi().rpc("fantasy_leagues", {
      p_season_id: seasonId,
      p_visibility: visibility ?? undefined,
      p_limit: 100,
    });
    check(error);
    return parse(fantasyLeaguePageSchema, data).items;
  }

  async getLeagueStandings(
    leagueId: string,
    gameweekId: string | null,
    _context: RepositoryContext,
  ) {
    const { data, error } = await getFantasyApi().rpc("fantasy_league_standings", {
      p_league_id: leagueId,
      p_gameweek_id: gameweekId ?? undefined,
      p_limit: 100,
    });
    check(error);
    return parse(fantasyLeagueStandingPageSchema, data);
  }

  /**
   * BG-0073 — the season-wide board, read from the `league_id is null` rows
   * that the ranking service already writes. Anonymous callers are supported
   * and get an empty page (never a 401/404) while no gameweek has finalized.
   */
  async getOverallStandings(input: FantasyOverallStandingsInput, _context: RepositoryContext) {
    const { data, error } = await getFantasyApi().rpc("fantasy_overall_standings", {
      p_season_id: input.seasonId,
      p_gameweek_id: input.gameweekId ?? undefined,
      p_after_rank: input.cursor?.rank,
      p_after_team_id: input.cursor?.teamId,
      p_limit: input.limit ?? 100,
    });
    check(error);
    return parse(fantasyOverallStandingPageSchema, data);
  }

  async createLeague(
    seasonId: string,
    teamId: string,
    name: string,
    visibility: "public" | "private",
    idempotencyKey: string,
    _context: RepositoryContext,
  ) {
    const { data, error } = await getFantasyApi().rpc("create_fantasy_league", {
      p_season_id: seasonId,
      p_team_id: teamId,
      p_name: name,
      p_visibility: visibility,
      p_idempotency_key: idempotencyKey,
    });
    check(error);
    return data;
  }

  async joinLeague(
    teamId: string,
    inviteCode: string,
    idempotencyKey: string,
    _context: RepositoryContext,
  ) {
    const { data, error } = await getFantasyApi().rpc("join_fantasy_league", {
      p_team_id: teamId,
      p_invite_code: inviteCode,
      p_idempotency_key: idempotencyKey,
    });
    check(error);
    return data;
  }

  async leaveLeague(leagueId: string, teamId: string, _context: RepositoryContext) {
    const { error } = await getFantasyApi().rpc("leave_fantasy_league", {
      p_league_id: leagueId,
      p_team_id: teamId,
    });
    check(error);
  }

  async archiveLeague(leagueId: string, teamId: string, _context: RepositoryContext) {
    const { error } = await getFantasyApi().rpc("archive_fantasy_league", {
      p_league_id: leagueId,
      p_team_id: teamId,
    });
    check(error);
  }

  async getTopPlayers(gameweekId: string, _context: RepositoryContext) {
    const { data, error } = await getFantasyApi().rpc("fantasy_top_players", {
      p_gameweek_id: gameweekId,
      p_limit: 5,
    });
    check(error);
    return parse(z.array(fantasyTopPlayerSchema), data);
  }

  /**
   * BG-0071 — season totals, form and live ownership for every active+eligible
   * player of the season, in one bounded read.
   *
   * `p_through_gameweek_id` is optional ("as of GW n"); passing `null` means
   * the whole season so far. Both parameters are uuid-only, so the BG-0063
   * `app`-schema coercion trap does not apply and anonymous callers succeed.
   */
  async getPlayerSeasonStats(
    seasonId: string,
    throughGameweekId: string | null,
    _context: RepositoryContext,
  ) {
    const data = await rpcAwaitingGeneratedTypes("fantasy_player_season_stats", {
      p_season_id: seasonId,
      p_through_gameweek_id: throughGameweekId ?? undefined,
    });
    return parse(fantasyPlayerSeasonStatsSchema, data);
  }

  /** BG-0071 — one entry per gameweek this player has a points row for. */
  async getPlayerGameweekHistory(fantasyPlayerId: string, _context: RepositoryContext) {
    const data = await rpcAwaitingGeneratedTypes("fantasy_player_gameweek_history", {
      p_fantasy_player_id: fantasyPlayerId,
    });
    return parse(fantasyPlayerGameweekHistorySchema, data);
  }
}
