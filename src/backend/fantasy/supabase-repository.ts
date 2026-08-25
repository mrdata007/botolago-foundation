import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { getFantasyApi } from "@/integrations/supabase/v2-client";
import {
  fantasyHubSchema,
  fantasyGameweekPageSchema,
  fantasyHistoryPageSchema,
  fantasyGlobalRankingPageSchema,
  fantasyLeaguePageSchema,
  fantasyLeagueStandingPageSchema,
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

  async getGlobalRankings(
    seasonId: string,
    gameweekId: string | null,
    sort: "overall" | "gameweek",
    query: string,
    page: number,
    limit: number,
    _context: RepositoryContext,
  ) {
    const normalizedQuery = query.trim();
    const { data, error } = await getFantasyApi().rpc("fantasy_global_rankings", {
      p_season_id: seasonId,
      p_gameweek_id: gameweekId ?? undefined,
      p_sort: sort,
      p_query: normalizedQuery || undefined,
      p_page: page,
      p_limit: limit,
    });
    check(error);
    return parse(fantasyGlobalRankingPageSchema, data);
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
}
