import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  SupabasePremiumLeagueContextRepository,
  type LeagueContextResponse,
  type PremiumLeagueContextRepository,
} from "@/backend/premium/league-context";
import { authService } from "@/services/auth";
import { managerCardDataMode } from "@/services/manager-card-mode";

/**
 * The member read behind the league figures of « Votre saison » and « Détail du duel »
 * (`api.get_card_league_context`).
 *
 * A development server in the Manager Card's mock mode has no league to read: the read answers
 * « switched off », so the sections draw the career and the duel with « — » for the league's
 * figures. Every other build reads the database. Only a member's screens call it (the hook is
 * disabled for anyone else, `use-premium-league-context.ts`), and the database answers
 * `{ locked: true }` to a non-member anyway.
 */
const supabaseRepository = new SupabasePremiumLeagueContextRepository();
const OFF_REPOSITORY: PremiumLeagueContextRepository = {
  leagueContext: async (): Promise<LeagueContextResponse> => ({ available: false }),
};

export function getPremiumLeagueContextRepository(): PremiumLeagueContextRepository {
  if (import.meta.env.DEV && managerCardDataMode() === "mock") return OFF_REPOSITORY;
  return supabaseRepository;
}

function context(signal?: AbortSignal): RepositoryContext {
  const session = authService.getSession();
  return {
    actorId: session.status === "authenticated" ? (session.user?.id ?? null) : null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `premium-league-${Date.now().toString(36)}`,
    signal,
  };
}

export const premiumLeagueContextService = {
  async leagueContext(
    request: { league: string | null; rivalTeam: string | null },
    signal?: AbortSignal,
  ) {
    return getPremiumLeagueContextRepository().leagueContext(
      { league: request.league, season: null, rivalTeam: request.rivalTeam },
      context(signal),
    );
  },
};
