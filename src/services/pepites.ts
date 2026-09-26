import type { RepositoryContext } from "@/backend/contracts/repository";
import { BackendError } from "@/backend/errors";
import type {
  EditionResponse,
  FollowState,
  HomeResponse,
  MethodologyResponse,
  PepitesRepository,
  PlayerMatchesResponse,
  PlayerResponse,
  PlayerStatsResponse,
  RankingQuery,
  RankingResponse,
  ReportableField,
  VersionResponse,
  WeeklyEmailDto,
} from "@/backend/pepites/contracts";
import { MockPepitesRepository } from "@/backend/pepites/mock-repository";
import { SupabasePepitesRepository } from "@/backend/pepites/supabase-repository";
import { authService } from "@/services/auth";

export type PepitesDataMode = "mock" | "supabase";

/** Same contract as the other domains: production reads the database or fails loudly. */
export function selectPepitesDataMode(
  configuredMode: string | undefined,
  production: boolean,
): PepitesDataMode {
  if (production && configuredMode !== "supabase")
    throw new BackendError(
      "data_unavailable",
      "Production Pépites require VITE_PEPITES_DATA_MODE=supabase.",
      { status: 503 },
    );
  if (configuredMode === "mock" || configuredMode === "supabase") return configuredMode;
  return "mock";
}

const mockRepository = new MockPepitesRepository();
const supabaseRepository = new SupabasePepitesRepository();

export function pepitesDataMode(): PepitesDataMode {
  return selectPepitesDataMode(import.meta.env.VITE_PEPITES_DATA_MODE, import.meta.env.PROD);
}

export function getPepitesRepository(): PepitesRepository {
  return pepitesDataMode() === "supabase" ? supabaseRepository : mockRepository;
}

function context(signal?: AbortSignal): RepositoryContext {
  const session = authService.getSession();
  return {
    actorId: session.status === "authenticated" ? (session.user?.id ?? null) : null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `pepites-${Date.now().toString(36)}`,
    signal,
  };
}

export const pepitesService = {
  version(signal?: AbortSignal): Promise<VersionResponse> {
    return getPepitesRepository().version(context(signal));
  },
  home(version: string | null, signal?: AbortSignal): Promise<HomeResponse> {
    return getPepitesRepository().home(version, context(signal));
  },
  ranking(query: RankingQuery, signal?: AbortSignal): Promise<RankingResponse> {
    return getPepitesRepository().ranking(query, context(signal));
  },
  player(version: string | null, playerId: string, signal?: AbortSignal): Promise<PlayerResponse> {
    return getPepitesRepository().player(version, playerId, context(signal));
  },
  playerMatches(
    playerId: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<PlayerMatchesResponse> {
    return getPepitesRepository().playerMatches(playerId, limit, context(signal));
  },
  playerStats(
    version: string | null,
    playerId: string,
    signal?: AbortSignal,
  ): Promise<PlayerStatsResponse> {
    return getPepitesRepository().playerStats(version, playerId, context(signal));
  },
  followState(playerId: string, signal?: AbortSignal): Promise<FollowState> {
    return getPepitesRepository().followState(playerId, context(signal));
  },
  setFollow(playerId: string, follow: boolean): Promise<FollowState> {
    return getPepitesRepository().setFollow(playerId, follow, context());
  },
  edition(seasonId: string | null, week: number, signal?: AbortSignal): Promise<EditionResponse> {
    return getPepitesRepository().edition(seasonId, week, context(signal));
  },
  methodology(signal?: AbortSignal): Promise<MethodologyResponse> {
    return getPepitesRepository().methodology(context(signal));
  },
  myWeeklyEmail(signal?: AbortSignal): Promise<WeeklyEmailDto> {
    return getPepitesRepository().myWeeklyEmail(context(signal));
  },
  setMyWeeklyEmail(enabled: boolean): Promise<WeeklyEmailDto> {
    return getPepitesRepository().setMyWeeklyEmail(enabled, context());
  },
  reportDataIssue(playerId: string, field: ReportableField, message: string): Promise<void> {
    return getPepitesRepository().reportDataIssue(playerId, field, message, context());
  },
};
