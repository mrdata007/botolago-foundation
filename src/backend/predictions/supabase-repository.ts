import type { PostgrestError } from "@supabase/supabase-js";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { getFantasyApi } from "@/integrations/supabase/v2-client";
import {
  claimGuestPredictionsResponseSchema,
  createLeagueResponseSchema,
  joinLeagueResponseSchema,
  leaderboardResponseSchema,
  leagueStandingsResponseSchema,
  leaveLeagueResponseSchema,
  matchVotesResponseSchema,
  myLeaguesResponseSchema,
  myPredictionsResponseSchema,
  predictionsRoundResponseSchema,
  resetInviteCodeResponseSchema,
  savePredictionsResponseSchema,
  type ClaimGuestPredictionsDto,
  type CreateLeagueDto,
  type GuestClaimInput,
  type JoinLeagueDto,
  type LeaderboardDto,
  type LeaderboardRequest,
  type LeagueStandingsDto,
  type LeaveLeagueDto,
  type MatchVoteInput,
  type MatchVotesDto,
  type MyLeaguesDto,
  type MyPredictionsDto,
  type MyPredictionsRequest,
  type PredictionInput,
  type PredictionsRepository,
  type PredictionsRoundDto,
  type ResetInviteCodeDto,
  type RoundRequest,
  type SavePredictionsDto,
} from "./contracts";
import { mapPredictionsError, PredictionsError } from "./errors";

type PredictionsApi = ReturnType<typeof getFantasyApi>;

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new PredictionsError(
      "data_unavailable",
      "The Pronostics API returned an invalid DTO.",
      error,
    );
  }
}

async function call<T>(
  request: PromiseLike<{ data: unknown; error: PostgrestError | null }> & {
    abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: PostgrestError | null }>;
  },
  schema: { parse(value: unknown): T },
  context: RepositoryContext,
): Promise<T> {
  let response: { data: unknown; error: PostgrestError | null };
  try {
    response = await (context.signal ? request.abortSignal(context.signal) : request);
  } catch (error) {
    throw mapPredictionsError(error);
  }
  if (response.error) throw mapPredictionsError(response.error);
  return parse(schema, response.data);
}

/** The Pronostics RPCs (the game, its leagues, the match votes), through the `api` schema only. */
export class SupabasePredictionsRepository implements PredictionsRepository {
  constructor(private readonly api: PredictionsApi | null = null) {}

  private client(): PredictionsApi {
    return this.api ?? getFantasyApi();
  }

  getRound(input: RoundRequest, context: RepositoryContext): Promise<PredictionsRoundDto> {
    return call(
      this.client().rpc("predictions_round", {
        p_round_number: input.roundNumber ?? undefined,
        p_language: input.language,
      }),
      predictionsRoundResponseSchema,
      context,
    );
  }

  getMyPredictions(
    input: MyPredictionsRequest,
    context: RepositoryContext,
  ): Promise<MyPredictionsDto> {
    return call(
      this.client().rpc("my_predictions", {
        p_round_number: input.roundNumber ?? undefined,
        p_fixture_id: input.fixtureId ?? undefined,
      }),
      myPredictionsResponseSchema,
      context,
    );
  }

  savePredictions(
    items: readonly PredictionInput[],
    context: RepositoryContext,
  ): Promise<SavePredictionsDto> {
    return call(
      this.client().rpc("save_predictions", {
        p_items: items.map(({ fixtureId, home, away }) => ({ fixtureId, home, away })),
      }),
      savePredictionsResponseSchema,
      context,
    );
  }

  claimGuestPredictions(
    items: readonly GuestClaimInput[],
    context: RepositoryContext,
  ): Promise<ClaimGuestPredictionsDto> {
    return call(
      this.client().rpc("claim_guest_predictions", {
        p_items: items.map(({ fixtureId, home, away, homeTeamId, awayTeamId }) => ({
          fixtureId,
          home,
          away,
          homeTeamId,
          awayTeamId,
        })),
      }),
      claimGuestPredictionsResponseSchema,
      context,
    );
  }

  getLeaderboard(input: LeaderboardRequest, context: RepositoryContext): Promise<LeaderboardDto> {
    return call(
      this.client().rpc("predictions_leaderboard", {
        p_scope: input.scope,
        p_round_number: input.roundNumber ?? undefined,
        p_after_rank: input.cursor?.rank,
        p_after_id: input.cursor?.id,
        p_limit: Math.min(Math.max(Math.trunc(input.limit), 1), 100),
      }),
      leaderboardResponseSchema,
      context,
    );
  }

  listMyLeagues(context: RepositoryContext): Promise<MyLeaguesDto> {
    return call(this.client().rpc("my_prediction_leagues"), myLeaguesResponseSchema, context);
  }

  getLeagueStandings(
    input: { leagueId: string; roundNumber: number | null },
    context: RepositoryContext,
  ): Promise<LeagueStandingsDto> {
    return call(
      this.client().rpc("predictions_league_standings", {
        p_league_id: input.leagueId,
        p_round_number: input.roundNumber ?? undefined,
      }),
      leagueStandingsResponseSchema,
      context,
    );
  }

  joinLeague(inviteCode: string, context: RepositoryContext): Promise<JoinLeagueDto> {
    return call(
      this.client().rpc("join_prediction_league", { p_invite_code: inviteCode }),
      joinLeagueResponseSchema,
      context,
    );
  }

  leaveLeague(leagueId: string, context: RepositoryContext): Promise<LeaveLeagueDto> {
    return call(
      this.client().rpc("leave_prediction_league", { p_league_id: leagueId }),
      leaveLeagueResponseSchema,
      context,
    );
  }

  createLeague(name: string, context: RepositoryContext): Promise<CreateLeagueDto> {
    return call(
      this.client().rpc("create_prediction_league", { p_name: name }),
      createLeagueResponseSchema,
      context,
    );
  }

  resetLeagueInviteCode(leagueId: string, context: RepositoryContext): Promise<ResetInviteCodeDto> {
    return call(
      this.client().rpc("reset_prediction_league_invite_code", { p_league_id: leagueId }),
      resetInviteCodeResponseSchema,
      context,
    );
  }

  getMatchVotes(fixtureId: string, context: RepositoryContext): Promise<MatchVotesDto> {
    return call(
      this.client().rpc("match_votes", { p_fixture_id: fixtureId }),
      matchVotesResponseSchema,
      context,
    );
  }

  castMatchVote(input: MatchVoteInput, context: RepositoryContext): Promise<MatchVotesDto> {
    return call(
      this.client().rpc("cast_match_vote", {
        p_fixture_id: input.fixtureId,
        p_question: input.question,
        p_choice: input.choice,
      }),
      matchVotesResponseSchema,
      context,
    );
  }
}
