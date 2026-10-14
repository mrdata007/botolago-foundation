import type { RepositoryContext } from "@/backend/contracts/repository";
import {
  SupabasePremiumLeagueContextRepository,
  type PremiumLeagueContextRepository,
} from "@/backend/premium/league-context";
import { authService } from "@/services/auth";
import { managerCardDataMode } from "@/services/manager-card-mode";

/**
 * The member read behind the league figures of « Votre saison » and « Détail du duel »
 * (`api.get_card_league_context`).
 *
 * A development server in the Manager Card's mock mode reads a made-up league of five (the
 * example season's, `league-context-mock.ts`) through the dynamic import below, so the sections
 * show their league comparisons. Every other build reads the database. Only a member's screens call it (the hook is
 * disabled for anyone else, `use-premium-league-context.ts`), and the database answers
 * `{ locked: true }` to a non-member anyway.
 */
const supabaseRepository = new SupabasePremiumLeagueContextRepository();
let mockRepository: PremiumLeagueContextRepository | null = null;

export async function getPremiumLeagueContextRepository(): Promise<PremiumLeagueContextRepository> {
  if (import.meta.env.DEV && managerCardDataMode() === "mock") {
    if (!mockRepository) {
      const { MockPremiumLeagueContextRepository } =
        await import("@/backend/premium/league-context-mock");
      mockRepository ??= new MockPremiumLeagueContextRepository();
    }
    return mockRepository;
  }
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
    return (await getPremiumLeagueContextRepository()).leagueContext(
      { league: request.league, season: null, rivalTeam: request.rivalTeam },
      context(signal),
    );
  },
};
