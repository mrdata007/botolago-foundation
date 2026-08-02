import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { getFootballApi } from "@/integrations/supabase/v2-client";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { postgresUuidSchema } from "@/backend/contracts/validation";
import {
  availabilitySchema,
  competitionSummarySchema,
  lineupSchema,
  matchCardSchema,
  matchStatisticSchema,
  playerSummarySchema,
  seasonSummarySchema,
  standingRowSchema,
  teamSummarySchema,
  timelineItemSchema,
  type AvailabilityStatusDto,
  type CompetitionSummaryDto,
  type FootballLanguage,
  type FootballRepository,
  type MatchCardDto,
  type MatchDetailHeaderDto,
  type MatchLineupDto,
  type MatchPageCursor,
  type MatchPageDto,
  type MatchesByDateInput,
  type MatchStatisticComparisonDto,
  type MatchTimelineItemDto,
  type PlayerSummaryDto,
  type SeasonSummaryDto,
  type StandingRowDto,
  type TeamSummaryDto,
} from "./contracts";
import { FootballError, mapFootballError } from "./errors";

const matchPageSchema = z.object({
  items: z.array(matchCardSchema),
  nextCursor: z
    .object({ kickoffAt: z.string().datetime({ offset: true }), id: postgresUuidSchema })
    .nullable(),
});

function throwIfError(error: PostgrestError | null): void {
  if (error) throw mapFootballError(error);
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new FootballError(
      "data_unavailable",
      "The football API returned an invalid DTO.",
      result.error,
    );
  }
  return result.data;
}

function requireUuid(value: string): string {
  const result = postgresUuidSchema.safeParse(value);
  if (!result.success)
    throw new FootballError("data_unavailable", "The football identifier is invalid.");
  return result.data;
}

function decodeCursor(value: string | null | undefined): MatchPageCursor | null {
  if (!value) return null;
  try {
    return parse(matchPageSchema.shape.nextCursor.unwrap(), JSON.parse(decodeURIComponent(value)));
  } catch (error) {
    throw new FootballError(
      "data_unavailable",
      "The football pagination cursor is invalid.",
      error,
    );
  }
}

export function encodeMatchCursor(cursor: MatchPageCursor | null): string | null {
  return cursor ? encodeURIComponent(JSON.stringify(cursor)) : null;
}

export class SupabaseFootballRepository implements FootballRepository {
  async getSeasons(
    language: FootballLanguage,
    limit: number,
    _context: RepositoryContext,
  ): Promise<readonly SeasonSummaryDto[]> {
    const { data, error } = await getFootballApi().rpc("football_season_catalog", {
      p_language: language,
      p_limit: limit,
    });
    throwIfError(error);
    return parse(z.array(seasonSummarySchema), data);
  }

  async getTeams(
    language: FootballLanguage,
    limit: number,
    _context: RepositoryContext,
  ): Promise<readonly TeamSummaryDto[]> {
    const { data, error } = await getFootballApi().rpc("football_team_catalog", {
      p_language: language,
      p_limit: limit,
    });
    throwIfError(error);
    return parse(z.array(teamSummarySchema), data);
  }

  async getHomeMatches(
    language: FootballLanguage,
    limit: number,
    _context: RepositoryContext,
  ): Promise<readonly MatchCardDto[]> {
    const { data, error } = await getFootballApi().rpc("football_home_matches", {
      p_language: language,
      p_limit: limit,
    });
    throwIfError(error);
    return parse(z.array(matchCardSchema), data);
  }

  async getLiveMatches(language: FootballLanguage, limit: number, _context: RepositoryContext) {
    const { data, error } = await getFootballApi().rpc("football_live_matches", {
      p_language: language,
      p_limit: limit,
    });
    throwIfError(error);
    return parse(z.array(matchCardSchema), data);
  }

  async getMatchesByDate(
    input: MatchesByDateInput,
    _context: RepositoryContext,
  ): Promise<MatchPageDto> {
    const cursor = decodeCursor(input.cursor);
    const { data, error } = await getFootballApi().rpc("football_matches_by_date", {
      p_date: input.date,
      p_language: input.language,
      p_timezone: input.timezone ?? "Africa/Casablanca",
      p_statuses: input.statuses ? [...input.statuses] : undefined,
      p_competition_id: input.competitionId ?? undefined,
      p_season_id: input.seasonId ? requireUuid(input.seasonId) : undefined,
      p_after_kickoff: cursor?.kickoffAt,
      p_after_id: cursor?.id,
      p_limit: input.limit ?? 50,
    });
    throwIfError(error);
    return parse(matchPageSchema, data);
  }

  async getMatchDetail(
    id: string,
    language: FootballLanguage,
    _context: RepositoryContext,
  ): Promise<MatchDetailHeaderDto> {
    const { data, error } = await getFootballApi().rpc("football_match_detail", {
      p_fixture_id: requireUuid(id),
      p_language: language,
    });
    throwIfError(error);
    return parse(matchCardSchema, data);
  }

  async getTimeline(
    id: string,
    language: FootballLanguage,
    _context: RepositoryContext,
  ): Promise<readonly MatchTimelineItemDto[]> {
    const { data, error } = await getFootballApi().rpc("football_match_timeline", {
      p_fixture_id: requireUuid(id),
      p_language: language,
    });
    throwIfError(error);
    return parse(z.array(timelineItemSchema), data);
  }

  async getLineups(
    id: string,
    language: FootballLanguage,
    _context: RepositoryContext,
  ): Promise<readonly MatchLineupDto[]> {
    const { data, error } = await getFootballApi().rpc("football_match_lineups", {
      p_fixture_id: requireUuid(id),
      p_language: language,
    });
    throwIfError(error);
    return parse(z.array(lineupSchema), data);
  }

  async getStatistics(
    id: string,
    language: FootballLanguage,
    _context: RepositoryContext,
  ): Promise<readonly MatchStatisticComparisonDto[]> {
    const { data, error } = await getFootballApi().rpc("football_match_statistics", {
      p_fixture_id: requireUuid(id),
      p_language: language,
    });
    throwIfError(error);
    return parse(z.array(matchStatisticSchema), data);
  }

  async getHeadToHead(
    id: string,
    language: FootballLanguage,
    limit: number,
    _context: RepositoryContext,
  ) {
    const { data, error } = await getFootballApi().rpc("football_head_to_head", {
      p_fixture_id: requireUuid(id),
      p_language: language,
      p_limit: limit,
    });
    throwIfError(error);
    return parse(z.array(matchCardSchema), data);
  }

  async getStandings(
    seasonId: string,
    language: FootballLanguage,
    _context: RepositoryContext,
  ): Promise<readonly StandingRowDto[]> {
    const { data, error } = await getFootballApi().rpc("football_standings", {
      p_season_id: requireUuid(seasonId),
      p_language: language,
      p_group_key: "",
      p_table_type: "overall",
    });
    throwIfError(error);
    return parse(z.array(standingRowSchema), data);
  }

  async getCompetition(
    id: string,
    language: FootballLanguage,
    _context: RepositoryContext,
  ): Promise<CompetitionSummaryDto> {
    const { data, error } = await getFootballApi().rpc("football_competition_summary", {
      p_competition_id: requireUuid(id),
      p_language: language,
    });
    throwIfError(error);
    return parse(competitionSummarySchema, data);
  }

  async getTeam(
    id: string,
    language: FootballLanguage,
    _context: RepositoryContext,
  ): Promise<TeamSummaryDto> {
    const { data, error } = await getFootballApi().rpc("football_team_summary", {
      p_team_id: requireUuid(id),
      p_language: language,
    });
    throwIfError(error);
    return parse(teamSummarySchema, data);
  }

  async getPlayer(
    id: string,
    language: FootballLanguage,
    _context: RepositoryContext,
  ): Promise<PlayerSummaryDto> {
    const { data, error } = await getFootballApi().rpc("football_player_summary", {
      p_player_id: requireUuid(id),
      p_language: language,
    });
    throwIfError(error);
    return parse(playerSummarySchema, data);
  }

  async getAvailability(
    id: string,
    _context: RepositoryContext,
  ): Promise<readonly AvailabilityStatusDto[]> {
    const { data, error } = await getFootballApi().rpc("football_player_availability", {
      p_player_id: requireUuid(id),
      p_limit: 20,
    });
    throwIfError(error);
    return parse(z.array(availabilitySchema), data);
  }
}
