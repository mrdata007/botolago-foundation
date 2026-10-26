import type { RepositoryContext } from "@/backend/contracts/repository";
import { BackendError } from "@/backend/errors";
import type { FootballLanguage } from "@/backend/football/contracts";
import type {
  ClaimGuestPredictionsDto,
  CreateLeagueDto,
  GuestClaimInput,
  JoinLeagueDto,
  LeaderboardCursor,
  LeaderboardDto,
  LeaderboardScope,
  LeagueStandingsDto,
  LeaveLeagueDto,
  MatchVoteInput,
  MatchVotesDto,
  MyLeaguesDto,
  MyPredictionsDto,
  PredictionInput,
  PredictionsRepository,
  PredictionsRoundDto,
  ResetInviteCodeDto,
  SavePredictionsDto,
} from "@/backend/predictions/contracts";
import { MockPredictionsRepository } from "@/backend/predictions/mock-repository";
import { SupabasePredictionsRepository } from "@/backend/predictions/supabase-repository";
import { authService } from "@/services/auth";

export type PredictionsDataMode = "mock" | "supabase";

/** Same contract as the other domains: production reads the database or fails loudly. */
export function selectPredictionsDataMode(
  configuredMode: string | undefined,
  production: boolean,
): PredictionsDataMode {
  if (production && configuredMode !== "supabase")
    throw new BackendError(
      "data_unavailable",
      "Production Pronostics require VITE_PREDICTIONS_DATA_MODE=supabase.",
      { status: 503 },
    );
  if (configuredMode === "mock" || configuredMode === "supabase") return configuredMode;
  return "mock";
}

const mockRepository = new MockPredictionsRepository();
const supabaseRepository = new SupabasePredictionsRepository();

export function predictionsDataMode(): PredictionsDataMode {
  return selectPredictionsDataMode(
    import.meta.env.VITE_PREDICTIONS_DATA_MODE,
    import.meta.env.PROD,
  );
}

export function getPredictionsRepository(): PredictionsRepository {
  return predictionsDataMode() === "supabase" ? supabaseRepository : mockRepository;
}

/**
 * The account comes from the session: the database reads it from the JWT and
 * the mock from `actorId`. Nothing the page passes can name another account.
 */
function context(signal?: AbortSignal): RepositoryContext {
  const session = authService.getSession();
  return {
    actorId: session.status === "authenticated" ? (session.user?.id ?? null) : null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `predictions-${Date.now().toString(36)}`,
    signal,
  };
}

export const predictionsService = {
  getRound(
    roundNumber: number | null,
    language: FootballLanguage,
    signal?: AbortSignal,
  ): Promise<PredictionsRoundDto> {
    return getPredictionsRepository().getRound({ roundNumber, language }, context(signal));
  },
  getMyPredictions(
    input: { roundNumber: number | null; fixtureId: string | null },
    signal?: AbortSignal,
  ): Promise<MyPredictionsDto> {
    return getPredictionsRepository().getMyPredictions(input, context(signal));
  },
  save(items: readonly PredictionInput[]): Promise<SavePredictionsDto> {
    return getPredictionsRepository().savePredictions(items, context());
  },
  claimGuest(items: readonly GuestClaimInput[]): Promise<ClaimGuestPredictionsDto> {
    return getPredictionsRepository().claimGuestPredictions(items, context());
  },
  leaderboard(
    input: {
      scope: LeaderboardScope;
      roundNumber: number | null;
      cursor: LeaderboardCursor | null;
      limit?: number;
    },
    signal?: AbortSignal,
  ): Promise<LeaderboardDto> {
    return getPredictionsRepository().getLeaderboard(
      { ...input, limit: input.limit ?? 50 },
      context(signal),
    );
  },
  myLeagues(signal?: AbortSignal): Promise<MyLeaguesDto> {
    return getPredictionsRepository().listMyLeagues(context(signal));
  },
  leagueStandings(
    leagueId: string,
    roundNumber: number | null,
    signal?: AbortSignal,
  ): Promise<LeagueStandingsDto> {
    return getPredictionsRepository().getLeagueStandings(
      { leagueId, roundNumber },
      context(signal),
    );
  },
  joinLeague(inviteCode: string): Promise<JoinLeagueDto> {
    return getPredictionsRepository().joinLeague(inviteCode, context());
  },
  leaveLeague(leagueId: string): Promise<LeaveLeagueDto> {
    return getPredictionsRepository().leaveLeague(leagueId, context());
  },
  createLeague(name: string): Promise<CreateLeagueDto> {
    return getPredictionsRepository().createLeague(name, context());
  },
  resetInviteCode(leagueId: string): Promise<ResetInviteCodeDto> {
    return getPredictionsRepository().resetLeagueInviteCode(leagueId, context());
  },
  matchVotes(fixtureId: string, signal?: AbortSignal): Promise<MatchVotesDto> {
    return getPredictionsRepository().getMatchVotes(fixtureId, context(signal));
  },
  castMatchVote(input: MatchVoteInput): Promise<MatchVotesDto> {
    return getPredictionsRepository().castMatchVote(input, context());
  },
};
